import { clientApi } from "@pathwayos/connect-convex/client-api";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  ClipboardIcon,
  CrownIcon,
  LoaderCircleIcon,
  MailPlusIcon,
  ShieldIcon,
  Trash2Icon,
  UserMinusIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { hasConvexPublicConfig } from "../../cloud/publicConfig";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  accountErrorMessage,
  invitationFallbackUrl,
  parseCreatedInvitation,
  parseInvitations,
  parseMemberships,
  parseViewerContext,
  parseViewerProfile,
  tenantPermissions,
  type CreatedInvitation,
  type InvitationSummary,
  type MembershipSummary,
} from "./AccountTeamsSettings.logic";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function memberLabel(member: MembershipSummary, viewerUserId: string): string {
  if (member.userId === viewerUserId) return "You";
  return member.userId.length > 20
    ? `${member.userId.slice(0, 10)}…${member.userId.slice(-6)}`
    : member.userId;
}

function LoadingPanel({ label }: { readonly label: string }) {
  return (
    <SettingsPageContainer>
      <div className="space-y-3" aria-label={label}>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </SettingsPageContainer>
  );
}

function AccountUnavailable() {
  return (
    <SettingsPageContainer>
      <Alert variant="warning">
        <ShieldIcon />
        <AlertTitle>Cloud accounts are not configured</AlertTitle>
        <AlertDescription>
          Set the Clerk and Convex public configuration for this build to manage teams and shared
          workspaces.
        </AlertDescription>
      </Alert>
    </SettingsPageContainer>
  );
}

export function AccountTeamsSettings() {
  if (!hasConvexPublicConfig()) return <AccountUnavailable />;
  return <ConfiguredAccountTeamsSettings />;
}

function ConfiguredAccountTeamsSettings() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const bootstrap = useMutation(clientApi.account.bootstrap);
  const [bootstrapState, setBootstrapState] = useState<"pending" | "ready" | "failed">("pending");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || requested.current) return;
    requested.current = true;
    void bootstrap({})
      .then(() => {
        setBootstrapState("ready");
      })
      .catch((error: unknown) => {
        requested.current = false;
        setBootstrapError(accountErrorMessage(error));
        setBootstrapState("failed");
      });
  }, [bootstrap, isAuthenticated]);

  if (isLoading) return <LoadingPanel label="Connecting to your account" />;
  if (!isAuthenticated) {
    return (
      <SettingsPageContainer>
        <Alert variant="warning">
          <ShieldIcon />
          <AlertTitle>Account session unavailable</AlertTitle>
          <AlertDescription>Sign in again to manage teams and shared workspaces.</AlertDescription>
        </Alert>
      </SettingsPageContainer>
    );
  }
  if (bootstrapState === "pending") return <LoadingPanel label="Preparing your account" />;
  if (bootstrapState === "failed") {
    return (
      <SettingsPageContainer>
        <Alert variant="error">
          <ShieldIcon />
          <AlertTitle>Could not prepare your account</AlertTitle>
          <AlertDescription>{bootstrapError}</AlertDescription>
        </Alert>
      </SettingsPageContainer>
    );
  }
  return <TeamsWorkspace />;
}

function TeamsWorkspace() {
  const rawViewer = useQuery(clientApi.account.viewer);
  const rawContext = useQuery(clientApi.tenants.viewerContext);
  const context = parseViewerContext(rawContext);
  const viewer = parseViewerProfile(rawViewer);
  const selectedTenant = useMemo(
    () => context?.tenants.find((tenant) => tenant.tenantId === context.activeTenantId) ?? null,
    [context],
  );
  const isTeam = selectedTenant?.kind === "team";
  const permissions = selectedTenant ? tenantPermissions(selectedTenant.role) : null;
  const rawMembers = useQuery(
    clientApi.tenants.listMembers,
    selectedTenant && isTeam ? { tenantId: selectedTenant.tenantId } : "skip",
  );
  const rawInvitations = useQuery(
    clientApi.invitations.list,
    selectedTenant && isTeam && permissions?.canManageTeam
      ? { tenantId: selectedTenant.tenantId }
      : "skip",
  );
  const members = rawMembers === undefined ? undefined : parseMemberships(rawMembers);
  const invitations = rawInvitations === undefined ? undefined : parseInvitations(rawInvitations);

  const createTeam = useMutation(clientApi.tenants.createTeam);
  const setActive = useMutation(clientApi.tenants.setActive);
  const rename = useMutation(clientApi.tenants.rename);
  const updateRole = useMutation(clientApi.tenants.updateMemberRole);
  const removeMember = useMutation(clientApi.tenants.removeMember);
  const leave = useMutation(clientApi.tenants.leave);
  const createInvitation = useAction(clientApi.invitations.create);
  const revokeInvitation = useMutation(clientApi.invitations.revoke);

  const [newTeamName, setNewTeamName] = useState("");
  const [renamedTeam, setRenamedTeam] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);

  useEffect(() => {
    setRenamedTeam(selectedTenant?.name ?? "");
    setCreatedInvitation(null);
    setNotice(null);
    setError(null);
  }, [selectedTenant?.tenantId, selectedTenant?.name]);

  const run = async (
    key: string,
    effect: () => Promise<unknown>,
    success?: string,
  ): Promise<boolean> => {
    setPendingAction(key);
    setError(null);
    setNotice(null);
    try {
      await effect();
      if (success) setNotice(success);
      return true;
    } catch (cause) {
      setError(accountErrorMessage(cause));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  if (rawViewer === undefined || rawContext === undefined) {
    return <LoadingPanel label="Loading your workspaces" />;
  }
  if (!viewer || !context || !selectedTenant) {
    return (
      <SettingsPageContainer>
        <Alert variant="error">
          <ShieldIcon />
          <AlertTitle>Account data could not be loaded</AlertTitle>
          <AlertDescription>
            Refresh the app. If this continues, reconnect your account.
          </AlertDescription>
        </Alert>
      </SettingsPageContainer>
    );
  }

  const fallbackUrl = createdInvitation ? invitationFallbackUrl(createdInvitation) : null;

  return (
    <SettingsPageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account & teams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose where synced projects and shared data belong.
        </p>
      </div>

      {error ? (
        <Alert variant="error">
          <ShieldIcon />
          <AlertTitle>Update failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertTitle>Account updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection title="Workspaces" icon={<UsersIcon className="size-3" />}>
        <SettingsRow
          title="Active workspace"
          description="New synced data is stored in this workspace. Switching does not move existing data."
          control={
            <Select
              value={selectedTenant.tenantId}
              onValueChange={(value) => {
                if (typeof value !== "string" || value === selectedTenant.tenantId) return;
                const tenant = context.tenants.find((item) => item.tenantId === value);
                if (!tenant) return;
                void run(
                  "switch",
                  () => setActive({ tenantId: tenant.tenantId }),
                  `Switched to ${tenant.name}.`,
                );
              }}
            >
              <SelectTrigger className="w-full sm:w-64" disabled={pendingAction === "switch"}>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {context.tenants.map((tenant) => (
                  <SelectItem key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.name} · {tenant.role}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Create a team"
          description="Team workspaces let invited members share synced PathwayOS data."
          control={
            <form
              className="flex w-full gap-2 sm:w-auto"
              onSubmit={(event) => {
                event.preventDefault();
                const name = newTeamName.trim();
                if (!name) return;
                void run("create-team", () => createTeam({ name }), "Team created.").then(
                  (created) => {
                    if (created) setNewTeamName("");
                  },
                );
              }}
            >
              <Input
                aria-label="New team name"
                className="min-w-0 sm:w-48"
                maxLength={80}
                onChange={(event) => setNewTeamName(event.target.value)}
                placeholder="Team name"
                value={newTeamName}
              />
              <Button
                disabled={!newTeamName.trim() || pendingAction === "create-team"}
                size="sm"
                type="submit"
              >
                {pendingAction === "create-team" ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : null}
                Create
              </Button>
            </form>
          }
        />
      </SettingsSection>

      <SettingsSection
        title={selectedTenant.kind === "personal" ? "Personal workspace" : "Team details"}
        icon={
          selectedTenant.role === "owner" ? (
            <CrownIcon className="size-3" />
          ) : (
            <ShieldIcon className="size-3" />
          )
        }
      >
        <SettingsRow
          title={selectedTenant.name}
          description={`${selectedTenant.kind === "personal" ? "Personal" : "Team"} workspace · Your role: ${selectedTenant.role}`}
          status={`Created ${formatDate(selectedTenant.createdAt)}`}
          control={
            <Badge variant={selectedTenant.role === "owner" ? "warning" : "secondary"}>
              {selectedTenant.role}
            </Badge>
          }
        />
        {isTeam && permissions?.canManageTeam ? (
          <SettingsRow
            title="Team name"
            description="Owners and admins can rename this workspace."
            control={
              <form
                className="flex w-full gap-2 sm:w-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = renamedTeam.trim();
                  if (!name || name === selectedTenant.name) return;
                  void run(
                    "rename",
                    () => rename({ tenantId: selectedTenant.tenantId, name }),
                    "Team renamed.",
                  );
                }}
              >
                <Input
                  aria-label="Team name"
                  className="min-w-0 sm:w-48"
                  maxLength={80}
                  onChange={(event) => setRenamedTeam(event.target.value)}
                  value={renamedTeam}
                />
                <Button
                  disabled={
                    !renamedTeam.trim() ||
                    renamedTeam.trim() === selectedTenant.name ||
                    pendingAction === "rename"
                  }
                  size="sm"
                  type="submit"
                  variant="outline"
                >
                  Save
                </Button>
              </form>
            }
          />
        ) : null}
        {isTeam && permissions?.canLeave ? (
          <SettingsRow
            title="Leave team"
            description="Your access ends immediately and your active workspace returns to your personal account."
            control={
              <Button
                disabled={pendingAction === "leave"}
                onClick={() => {
                  if (!window.confirm(`Leave ${selectedTenant.name}?`)) return;
                  void run(
                    "leave",
                    () => leave({ tenantId: selectedTenant.tenantId }),
                    "You left the team.",
                  );
                }}
                size="sm"
                variant="destructive"
              >
                <UserMinusIcon className="size-4" /> Leave
              </Button>
            }
          />
        ) : null}
      </SettingsSection>

      {isTeam ? (
        <SettingsSection title="Members" icon={<UsersIcon className="size-3" />}>
          {members === undefined ? (
            <div className="flex items-center gap-2 px-5 py-5 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Loading members…
            </div>
          ) : members === null ? (
            <div className="px-5 py-5 text-sm text-destructive">
              Member data could not be read. Refresh the app to try again.
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-5 text-sm text-muted-foreground">No members found.</div>
          ) : (
            members.map((member) => (
              <SettingsRow
                key={member.userId}
                title={memberLabel(member, viewer.clerkUserId)}
                description={
                  member.userId === viewer.clerkUserId && viewer.primaryEmail
                    ? viewer.primaryEmail
                    : member.userId
                }
                status={`Joined ${formatDate(member.createdAt)}`}
                control={
                  <div className="flex items-center gap-2">
                    {permissions?.canManageMembers && member.role !== "owner" ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) => {
                          if (value !== "admin" && value !== "member") return;
                          void run(
                            `role:${member.userId}`,
                            () =>
                              updateRole({
                                tenantId: selectedTenant.tenantId,
                                userId: member.userId,
                                role: value,
                              }),
                            "Member role updated.",
                          );
                        }}
                      >
                        <SelectTrigger className="w-28" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectPopup>
                      </Select>
                    ) : (
                      <Badge variant={member.role === "owner" ? "warning" : "outline"}>
                        {member.role}
                      </Badge>
                    )}
                    {permissions?.canManageMembers && member.role !== "owner" ? (
                      <Button
                        aria-label={`Remove ${memberLabel(member, viewer.clerkUserId)}`}
                        disabled={pendingAction === `remove:${member.userId}`}
                        onClick={() => {
                          if (!window.confirm("Remove this member from the team?")) return;
                          void run(
                            `remove:${member.userId}`,
                            () =>
                              removeMember({
                                tenantId: selectedTenant.tenantId,
                                userId: member.userId,
                              }),
                            "Member removed.",
                          );
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <UserMinusIcon className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                }
              />
            ))
          )}
        </SettingsSection>
      ) : null}

      {isTeam && permissions?.canManageTeam ? (
        <SettingsSection title="Invitations" icon={<MailPlusIcon className="size-3" />}>
          <SettingsRow
            title="Invite by email"
            description="Invitations expire after seven days and can only be accepted by the invited email address."
          >
            <form
              className="mt-3 flex flex-col gap-2 border-t border-border/60 py-3.5 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const invitedEmail = inviteEmail.trim();
                if (!invitedEmail) return;
                setPendingAction("invite");
                setError(null);
                setNotice(null);
                setCreatedInvitation(null);
                void createInvitation({
                  tenantId: selectedTenant.tenantId,
                  invitedEmail,
                  role: inviteRole,
                })
                  .then((value) => {
                    const invitation = parseCreatedInvitation(value);
                    if (!invitation) throw new Error("INVITATION_RESPONSE_INVALID");
                    setCreatedInvitation(invitation);
                    setInviteEmail("");
                    setNotice(
                      invitation.deliveryStatus === "sent"
                        ? "Invitation sent."
                        : invitation.deliveryStatus === "not_configured"
                          ? "Email delivery is not configured. Copy the one-time link below."
                          : "The invitation was created, but email delivery failed. No secret link is displayed.",
                    );
                  })
                  .catch((cause: unknown) => setError(accountErrorMessage(cause)))
                  .finally(() => setPendingAction(null));
              }}
            >
              <Input
                aria-label="Invitation email"
                className="min-w-0 flex-1"
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="person@example.com"
                type="email"
                value={inviteEmail}
              />
              <Select
                value={inviteRole}
                onValueChange={(value) => value && setInviteRole(value as "admin" | "member")}
              >
                <SelectTrigger className="w-full sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectPopup>
              </Select>
              <Button disabled={!inviteEmail.trim() || pendingAction === "invite"} type="submit">
                {pendingAction === "invite" ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : null}
                Invite
              </Button>
            </form>
          </SettingsRow>
          {fallbackUrl ? (
            <SettingsRow
              title="One-time invitation link"
              description="This secret is shown once because email delivery is not configured. It is not available from invitation history."
              status={<span className="break-all font-mono">{fallbackUrl}</span>}
              control={
                <Button
                  onClick={() => void navigator.clipboard.writeText(fallbackUrl)}
                  size="sm"
                  variant="outline"
                >
                  <ClipboardIcon className="size-4" /> Copy
                </Button>
              }
            />
          ) : null}
          {invitations === undefined ? (
            <div className="flex items-center gap-2 border-t border-border/60 px-5 py-5 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Loading invitations…
            </div>
          ) : invitations === null ? (
            <div className="border-t border-border/60 px-5 py-5 text-sm text-destructive">
              Invitation data could not be read. Refresh the app to try again.
            </div>
          ) : invitations.length === 0 ? (
            <div className="border-t border-border/60 px-5 py-5 text-sm text-muted-foreground">
              No invitations yet.
            </div>
          ) : (
            invitations.map((invitation: InvitationSummary) => (
              <SettingsRow
                key={invitation.invitationId}
                title={invitation.invitedEmail}
                description={`${invitation.role} · Expires ${formatDate(invitation.expiresAt)}`}
                status={`Status: ${invitation.state}`}
                control={
                  invitation.state === "pending" ? (
                    <Button
                      aria-label={`Revoke invitation for ${invitation.invitedEmail}`}
                      disabled={pendingAction === `revoke:${invitation.invitationId}`}
                      onClick={() =>
                        void run(
                          `revoke:${invitation.invitationId}`,
                          () => revokeInvitation({ invitationId: invitation.invitationId }),
                          "Invitation revoked.",
                        )
                      }
                      size="icon-xs"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  ) : (
                    <Badge variant="outline">{invitation.state}</Badge>
                  )
                }
              />
            ))
          )}
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  );
}
