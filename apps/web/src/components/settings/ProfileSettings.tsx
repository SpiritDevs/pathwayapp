import { useAuth, useClerk, useUser } from "@clerk/react";
import {
  BotIcon,
  CameraIcon,
  CheckIcon,
  CircleUserRoundIcon,
  LaptopIcon,
  Loader2Icon,
  LockKeyholeIcon,
  MailIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

type ProfileTab = "profile" | "details" | "security";

const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "details", label: "Details" },
  { id: "security", label: "Security" },
];

const PROFILE_STATS = [
  { value: "28.5bn", label: "Lifetime tokens" },
  { value: "1.4bn", label: "Peak tokens" },
  { value: "59h 36m", label: "Longest task" },
  { value: "90 days", label: "Current streak" },
  { value: "90 days", label: "Longest streak" },
] as const;

const ACTIVITY_INSIGHTS = [
  ["Fast Mode", "25%"],
  ["Most used reasoning", "Medium · 55%"],
  ["Skills explored", "80"],
  ["Total skills used", "3,400"],
  ["Total threads", "6,841"],
] as const;

const MOST_USED_PLUGINS = [
  ["$commit-and-push", "741 runs"],
  ["@browser", "357 runs"],
  ["$convex", "348 runs"],
  ["$frontend-design", "272 runs"],
  ["$convex-migration-helper", "234 runs"],
] as const;

function getClerkErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.length > 0
  ) {
    const [firstError] = error.errors;
    if (firstError && typeof firstError === "object" && "message" in firstError) {
      return String(firstError.message);
    }
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

function getUserDisplayName(user: NonNullable<ReturnType<typeof useUser>["user"]>): string {
  return (
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    "PathwayOS user"
  );
}

function getUserHandle(user: NonNullable<ReturnType<typeof useUser>["user"]>): string {
  if (user.username) {
    return `@${user.username}`;
  }

  const email = user.primaryEmailAddress?.emailAddress;
  return email ? `@${email.split("@")[0]}` : "@pathwayos";
}

function getPlanLabel(user: NonNullable<ReturnType<typeof useUser>["user"]>): string {
  const metadata = user.publicMetadata as Record<string, unknown>;
  const plan = metadata.plan || metadata.tier || metadata.subscriptionTier;
  return typeof plan === "string" && plan.trim() ? plan : "Pro";
}

function AccountAvatar({
  imageUrl,
  name,
  size = "lg",
}: {
  imageUrl: string | undefined;
  name: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-primary/12 text-primary ring-1 ring-border",
        size === "lg" ? "size-20" : "size-10",
      )}
      aria-hidden
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-primary to-violet-500 text-primary-foreground">
          <CircleUserRoundIcon className={size === "lg" ? "size-10" : "size-5"} />
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

function ProfileHeader({
  activeTab,
  onTabChange,
  user,
}: {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  user: NonNullable<ReturnType<typeof useUser>["user"]>;
}) {
  const name = getUserDisplayName(user);

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <AccountAvatar imageUrl={user.imageUrl} name={name} />
      <h1 className="mt-5 text-2xl font-medium tracking-tight text-foreground">{name}</h1>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{getUserHandle(user)}</span>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground/80">
          {getPlanLabel(user)}
        </span>
      </div>
      <div className="mt-6 inline-flex rounded-xl border bg-muted/35 p-1">
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "h-8 rounded-lg px-4 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TokenActivityGrid() {
  const cells = useMemo(
    () =>
      Array.from({ length: 365 }, (_, index) => {
        const monthWeight = Math.min(1, Math.max(0, (index - 70) / 260));
        const pulse = Math.sin(index * 0.53) + Math.cos(index * 0.19);
        return {
          id: `activity-day-${index}`,
          level: Math.max(0, Math.min(4, Math.round(monthWeight * 3 + pulse))),
        };
      }),
    [],
  );

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-hidden">
        {cells.map((cell) => (
          <span
            key={cell.id}
            className={cn(
              "size-3 rounded-[3px]",
              cell.level === 0 && "bg-muted",
              cell.level === 1 && "bg-sky-100 dark:bg-sky-950",
              cell.level === 2 && "bg-sky-200 dark:bg-sky-900",
              cell.level === 3 && "bg-sky-300 dark:bg-sky-800",
              cell.level >= 4 && "bg-sky-500 dark:bg-sky-500",
            )}
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-12 text-xs text-muted-foreground/75">
        {["Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"].map(
          (month) => (
            <span key={month}>{month}</span>
          ),
        )}
      </div>
    </div>
  );
}

function ProfileOverviewTab() {
  return (
    <div className="mx-auto mt-5 w-full max-w-4xl">
      <div className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-5">
        {PROFILE_STATS.map((stat) => (
          <div
            key={stat.label}
            className="border-border/70 px-5 py-3 text-center not-first:border-t sm:not-first:border-l sm:not-first:border-t-0"
          >
            <div className="text-sm font-medium text-foreground">{stat.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Token activity</h2>
          <div className="flex items-center gap-4 text-sm">
            <button type="button" className="font-medium text-foreground">
              Daily
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              Weekly
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              Cumulative
            </button>
          </div>
        </div>
        <TokenActivityGrid />
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-4 text-sm font-medium text-foreground">Activity insights</h2>
          <dl className="space-y-3">
            {ACTIVITY_INSIGHTS.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-medium text-foreground">Most used plugins</h2>
          <div className="space-y-3">
            {MOST_USED_PLUGINS.map(([label, value], index) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full",
                    index === 1 ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-600",
                    index === 2 && "bg-rose-100 text-rose-600",
                  )}
                >
                  <BotIcon className="size-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function InlineStatus({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <p className={cn("text-xs", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  );
}

function DetailsTab({ user }: { user: NonNullable<ReturnType<typeof useUser>["user"]> }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const name = getUserDisplayName(user);

  useEffect(() => {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
  }, [user.firstName, user.lastName]);

  const clearMessages = () => {
    setStatus(null);
    setError(null);
  };

  const saveProfile = async () => {
    clearMessages();
    setIsSaving(true);
    try {
      await user.update({ firstName: firstName.trim() || null, lastName: lastName.trim() || null });
      setStatus("Profile updated.");
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const uploadProfileImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    clearMessages();
    setIsUploading(true);
    try {
      await user.setProfileImage({ file });
      setStatus("Profile image updated.");
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsUploading(false);
      event.currentTarget.value = "";
    }
  };

  const addEmail = async () => {
    const email = newEmail.trim();
    if (!email) return;

    clearMessages();
    setIsAddingEmail(true);
    try {
      await user.createEmailAddress({ email });
      setNewEmail("");
      setStatus("Email address added.");
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsAddingEmail(false);
    }
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-3xl space-y-8">
      <SettingsSection title="Profile details">
        <div className="space-y-5 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AccountAvatar imageUrl={user.imageUrl} name={name} size="md" />
              <div>
                <div className="text-sm font-medium text-foreground">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {user.primaryEmailAddress?.emailAddress}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void uploadProfileImage(event)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
                Update photo
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">First name</span>
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.currentTarget.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Last name</span>
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.currentTarget.value)}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {status ? <InlineStatus>{status}</InlineStatus> : null}
              {error ? <InlineStatus tone="danger">{error}</InlineStatus> : null}
            </div>
            <Button size="sm" disabled={isSaving} onClick={() => void saveProfile()}>
              {isSaving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Save profile
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Email addresses">
        <div className="divide-y divide-border/60">
          {user.emailAddresses.map((emailAddress) => {
            const isPrimary = emailAddress.id === user.primaryEmailAddressId;
            return (
              <div key={emailAddress.id} className="flex items-center gap-3 px-5 py-4">
                <MailIcon className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {emailAddress.emailAddress}
                </span>
                {isPrimary ? (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    Primary
                  </span>
                ) : null}
              </div>
            );
          })}
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]">
            <Input
              type="email"
              placeholder="Add email address"
              value={newEmail}
              onChange={(event) => setNewEmail(event.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={isAddingEmail || !newEmail.trim()}
              onClick={() => void addEmail()}
            >
              {isAddingEmail ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add email
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Connected accounts">
        <div className="divide-y divide-border/60">
          {user.externalAccounts.length > 0 || user.enterpriseAccounts.length > 0 ? (
            <>
              {user.externalAccounts.map((account) => (
                <div key={account.id} className="flex items-center gap-3 px-5 py-4">
                  <CircleUserRoundIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {account.provider}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {account.verification?.status ?? "Connected"}
                  </span>
                </div>
              ))}
              {user.enterpriseAccounts.map((account) => (
                <div key={account.id} className="flex items-center gap-3 px-5 py-4">
                  <CircleUserRoundIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {account.provider}
                  </span>
                  <span className="text-xs text-muted-foreground">Enterprise</span>
                </div>
              ))}
            </>
          ) : (
            <div className="px-5 py-4 text-sm text-muted-foreground">No connected accounts</div>
          )}
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="text-sm text-muted-foreground">Connect account</div>
            <Button size="sm" variant="outline" disabled>
              <PlusIcon />
              Connect account
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

function SecurityTab({ user }: { user: NonNullable<ReturnType<typeof useUser>["user"]> }) {
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof user.getSessions>>>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingSessions(true);
    void user
      .getSessions()
      .then((nextSessions) => {
        if (isMounted) {
          setSessions(nextSessions);
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(getClerkErrorMessage(caught));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSessions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const clearMessages = () => {
    setStatus(null);
    setError(null);
  };

  const updatePassword = async () => {
    if (!newPassword.trim()) return;
    clearMessages();
    setIsUpdatingPassword(true);
    try {
      await user.updatePassword({
        newPassword,
        ...(currentPassword.trim() ? { currentPassword: currentPassword.trim() } : {}),
        signOutOfOtherSessions: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setStatus("Password updated.");
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const revokeSession = async (session: (typeof sessions)[number]) => {
    const confirmed = window.confirm("Terminate this active device session?");
    if (!confirmed) return;

    setDeviceStatus(null);
    setDeviceError(null);
    setRevokingSessionId(session.id);
    try {
      await session.revoke();
      setSessions((currentSessions) =>
        currentSessions.filter((currentSession) => currentSession.id !== session.id),
      );
      setDeviceStatus("Device session terminated.");
    } catch (caught) {
      setDeviceError(getClerkErrorMessage(caught));
    } finally {
      setRevokingSessionId(null);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm("Delete this account? This cannot be undone.");
    if (!confirmed) return;

    clearMessages();
    setIsDeleting(true);
    try {
      await user.delete();
      await clerk.signOut();
      void navigate({ to: "/login", replace: true });
    } catch (caught) {
      setError(getClerkErrorMessage(caught));
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-3xl space-y-8">
      <SettingsSection title="Password">
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <LockKeyholeIcon className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                {user.passwordEnabled ? "Password enabled" : "Password not set"}
              </div>
              <div className="text-xs text-muted-foreground">
                Update the password used for this PathwayOS account.
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {status ? <InlineStatus>{status}</InlineStatus> : null}
              {error ? <InlineStatus tone="danger">{error}</InlineStatus> : null}
            </div>
            <Button
              size="sm"
              disabled={isUpdatingPassword || !newPassword.trim()}
              onClick={() => void updatePassword()}
            >
              {isUpdatingPassword ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Update password
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Active devices">
        <div className="divide-y divide-border/60">
          {isLoadingSessions ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading devices
            </div>
          ) : null}
          {deviceStatus || deviceError ? (
            <div className="px-5 py-3">
              {deviceStatus ? <InlineStatus>{deviceStatus}</InlineStatus> : null}
              {deviceError ? <InlineStatus tone="danger">{deviceError}</InlineStatus> : null}
            </div>
          ) : null}
          {sessions.map((session) => {
            const activity = session.latestActivity;
            const device = activity?.deviceType || "Device";
            const browser = [activity?.browserName, activity?.browserVersion]
              .filter(Boolean)
              .join(" ");
            const location = [activity?.ipAddress, activity?.city, activity?.country]
              .filter(Boolean)
              .join(" · ");
            const isCurrent = session.id === sessionId;
            const isRevoking = revokingSessionId === session.id;
            return (
              <div key={session.id} className="flex items-start gap-4 px-5 py-4">
                <LaptopIcon className="mt-0.5 size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span>{device}</span>
                    {isCurrent ? (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        This device
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {browser || "Unknown browser"}
                  </div>
                  {location ? (
                    <div className="text-sm text-muted-foreground">{location}</div>
                  ) : null}
                  <div className="text-xs text-muted-foreground/75">
                    Active {session.lastActiveAt.toLocaleString()}
                  </div>
                </div>
                {!isCurrent ? (
                  <Button
                    aria-label={`Terminate ${device} session`}
                    size="icon-sm"
                    variant="destructive-outline"
                    disabled={isRevoking}
                    onClick={() => void revokeSession(session)}
                  >
                    {isRevoking ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <Trash2Icon aria-hidden />
                    )}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Delete account">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Delete account</div>
            <div className="text-xs text-muted-foreground">
              Permanently remove this account and its authentication data.
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={isDeleting || !user.deleteSelfEnabled}
            onClick={() => void deleteAccount()}
          >
            {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            Delete account
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}

export function ProfileSettingsPanel() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");

  if (!isLoaded) {
    return (
      <SettingsPageContainer className="max-w-5xl">
        <div className="mx-auto mt-10 h-96 w-full max-w-4xl animate-pulse rounded-3xl bg-muted" />
      </SettingsPageContainer>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <SettingsPageContainer className="max-w-5xl">
        <div className="mx-auto mt-10 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Sign in to manage your profile.
        </div>
      </SettingsPageContainer>
    );
  }

  return (
    <SettingsPageContainer className="max-w-5xl">
      <ProfileHeader activeTab={activeTab} onTabChange={setActiveTab} user={user} />
      {activeTab === "profile" ? <ProfileOverviewTab /> : null}
      {activeTab === "details" ? <DetailsTab user={user} /> : null}
      {activeTab === "security" ? <SecurityTab user={user} /> : null}
    </SettingsPageContainer>
  );
}
