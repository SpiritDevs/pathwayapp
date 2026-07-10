import type { GenericId, Value } from "convex/values";

export type TenantRole = "owner" | "admin" | "member";

export interface TenantSummary {
  readonly tenantId: GenericId<"tenants">;
  readonly name: string;
  readonly kind: "personal" | "team";
  readonly ownerUserId: string;
  readonly role: TenantRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ViewerContext {
  readonly activeTenantId: GenericId<"tenants"> | null;
  readonly tenants: ReadonlyArray<TenantSummary>;
}

export interface MembershipSummary {
  readonly userId: string;
  readonly role: TenantRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InvitationSummary {
  readonly invitationId: GenericId<"tenantInvitations">;
  readonly tenantId: GenericId<"tenants">;
  readonly invitedEmail: string;
  readonly role: "admin" | "member";
  readonly tokenHint: string;
  readonly invitedByUserId: string;
  readonly expiresAt: string;
  readonly state: "pending" | "accepted" | "revoked" | "expired";
  readonly acceptedByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ViewerProfile {
  readonly clerkUserId: string;
  readonly primaryEmail: string | null;
}

export interface CreatedInvitation {
  readonly invitationId: GenericId<"tenantInvitations">;
  readonly inviteUrl: string;
  readonly expiresAt: string;
  readonly deliveryStatus: "sent" | "not_configured" | "failed";
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

function tenantRole(value: unknown): TenantRole | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

function parseTenant(value: unknown): TenantSummary | null {
  const candidate = record(value);
  const tenantId = string(candidate?.tenantId);
  const name = string(candidate?.name);
  const kind = candidate?.kind;
  const ownerUserId = string(candidate?.ownerUserId);
  const role = tenantRole(candidate?.role);
  const createdAt = string(candidate?.createdAt);
  const updatedAt = string(candidate?.updatedAt);
  if (
    !tenantId ||
    !name ||
    (kind !== "personal" && kind !== "team") ||
    !ownerUserId ||
    !role ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    tenantId: tenantId as GenericId<"tenants">,
    name,
    kind,
    ownerUserId,
    role,
    createdAt,
    updatedAt,
  };
}

export function parseViewerContext(value: Value | undefined): ViewerContext | null {
  const candidate = record(value);
  const tenantsValue = candidate?.tenants;
  const activeTenantValue = candidate?.activeTenantId;
  if (
    !Array.isArray(tenantsValue) ||
    !(activeTenantValue === null || typeof activeTenantValue === "string")
  ) {
    return null;
  }
  const tenants = tenantsValue.map(parseTenant);
  if (tenants.some((tenant) => tenant === null)) {
    return null;
  }
  return {
    activeTenantId: activeTenantValue === null ? null : (activeTenantValue as GenericId<"tenants">),
    tenants: tenants as ReadonlyArray<TenantSummary>,
  };
}

export function parseMemberships(
  value: Value | undefined,
): ReadonlyArray<MembershipSummary> | null {
  if (!Array.isArray(value)) return null;
  const memberships = value.map((item) => {
    const candidate = record(item);
    const userId = string(candidate?.userId);
    const role = tenantRole(candidate?.role);
    const createdAt = string(candidate?.createdAt);
    const updatedAt = string(candidate?.updatedAt);
    return userId && role && createdAt && updatedAt ? { userId, role, createdAt, updatedAt } : null;
  });
  return memberships.some((membership) => membership === null)
    ? null
    : (memberships as ReadonlyArray<MembershipSummary>);
}

export function parseInvitations(
  value: Value | undefined,
): ReadonlyArray<InvitationSummary> | null {
  if (!Array.isArray(value)) return null;
  const invitations = value.map((item) => {
    const candidate = record(item);
    const invitationId = string(candidate?.invitationId);
    const tenantId = string(candidate?.tenantId);
    const invitedEmail = string(candidate?.invitedEmail);
    const role = candidate?.role;
    const tokenHint = string(candidate?.tokenHint);
    const invitedByUserId = string(candidate?.invitedByUserId);
    const expiresAt = string(candidate?.expiresAt);
    const state = candidate?.state;
    const acceptedByUserId = nullableString(candidate?.acceptedByUserId);
    const createdAt = string(candidate?.createdAt);
    const updatedAt = string(candidate?.updatedAt);
    if (
      !invitationId ||
      !tenantId ||
      !invitedEmail ||
      (role !== "admin" && role !== "member") ||
      !tokenHint ||
      !invitedByUserId ||
      !expiresAt ||
      !["pending", "accepted", "revoked", "expired"].includes(String(state)) ||
      acceptedByUserId === undefined ||
      !createdAt ||
      !updatedAt
    ) {
      return null;
    }
    return {
      invitationId: invitationId as GenericId<"tenantInvitations">,
      tenantId: tenantId as GenericId<"tenants">,
      invitedEmail,
      role,
      tokenHint,
      invitedByUserId,
      expiresAt,
      state: state as InvitationSummary["state"],
      acceptedByUserId,
      createdAt,
      updatedAt,
    };
  });
  return invitations.some((invitation) => invitation === null)
    ? null
    : (invitations as ReadonlyArray<InvitationSummary>);
}

export function parseViewerProfile(value: Value | undefined): ViewerProfile | null {
  const candidate = record(value);
  const clerkUserId = string(candidate?.clerkUserId);
  const primaryEmail = nullableString(candidate?.primaryEmail);
  return clerkUserId && primaryEmail !== undefined ? { clerkUserId, primaryEmail } : null;
}

export function parseCreatedInvitation(value: Value): CreatedInvitation | null {
  const candidate = record(value);
  const invitationId = string(candidate?.invitationId);
  const inviteUrl = string(candidate?.inviteUrl);
  const expiresAt = string(candidate?.expiresAt);
  const deliveryStatus = candidate?.deliveryStatus;
  if (
    !invitationId ||
    !inviteUrl ||
    !expiresAt ||
    !["sent", "not_configured", "failed"].includes(String(deliveryStatus))
  ) {
    return null;
  }
  return {
    invitationId: invitationId as GenericId<"tenantInvitations">,
    inviteUrl,
    expiresAt,
    deliveryStatus: deliveryStatus as CreatedInvitation["deliveryStatus"],
  };
}

export function tenantPermissions(role: TenantRole) {
  return {
    canManageTeam: role === "owner" || role === "admin",
    canManageMembers: role === "owner",
    canLeave: role !== "owner",
  } as const;
}

/** The secret-bearing URL is a one-time fallback only when email delivery is unavailable. */
export function invitationFallbackUrl(invitation: CreatedInvitation): string | null {
  return invitation.deliveryStatus === "not_configured" ? invitation.inviteUrl : null;
}

export function accountErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const knownErrors: ReadonlyArray<readonly [string, string]> = [
    ["UNAUTHENTICATED", "Sign in to manage your account."],
    ["TENANT_ACCESS_DENIED", "You no longer have access to this workspace."],
    ["TENANT_MANAGER_REQUIRED", "Only workspace owners and admins can do that."],
    ["TENANT_OWNER_REQUIRED", "Only the workspace owner can do that."],
    ["TENANT_OWNER_CANNOT_LEAVE", "The workspace owner cannot leave their own workspace."],
    ["TENANT_NAME", "Enter a valid workspace name."],
    ["INVITATION_EMAIL_INVALID", "Enter a valid email address."],
    ["INVITATION_EMAIL_MISMATCH", "This invitation was sent to a different account email."],
    ["INVITATION_EXPIRED", "This invitation has expired. Ask an admin for a new one."],
    ["INVITATION_REVOKED", "This invitation was revoked."],
    ["INVITATION_NOT_FOUND", "This invitation is invalid or no longer available."],
  ];
  return (
    knownErrors.find(([code]) => message.includes(code))?.[1] ??
    "The account update failed. Try again."
  );
}
