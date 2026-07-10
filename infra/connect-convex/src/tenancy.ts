import * as DateTime from "effect/DateTime";

export const TENANT_ROLES = ["owner", "admin", "member"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const INVITATION_ROLES = ["admin", "member"] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function normalizeTenantName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("TENANT_NAME_REQUIRED");
  }
  if (normalized.length > 80) {
    throw new Error("TENANT_NAME_TOO_LONG");
  }
  return normalized;
}

export function personalTenantName(primaryEmail: string | null): string {
  if (primaryEmail === null) {
    return "Personal workspace";
  }

  const localPart = normalizeEmailAddress(primaryEmail).split("@", 1)[0]?.trim();
  return localPart ? `${localPart}'s workspace` : "Personal workspace";
}

export function canManageTenant(role: TenantRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageRoles(role: TenantRole): boolean {
  return role === "owner";
}

export function invitationExpiresAt(createdAtMs: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(createdAtMs + INVITATION_LIFETIME_MS));
}

export function isInvitationExpired(expiresAt: string, nowMs: number): boolean {
  return DateTime.toEpochMillis(DateTime.makeUnsafe(expiresAt)) <= nowMs;
}

export function invitationState(
  invitation: {
    readonly acceptedAt: string | null;
    readonly revokedAt: string | null;
    readonly expiresAt: string;
  },
  nowMs: number,
): "pending" | "accepted" | "revoked" | "expired" {
  if (invitation.acceptedAt !== null) {
    return "accepted";
  }
  if (invitation.revokedAt !== null) {
    return "revoked";
  }
  return isInvitationExpired(invitation.expiresAt, nowMs) ? "expired" : "pending";
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    encoded += base64UrlAlphabet[(chunk >> 18) & 63] ?? "";
    encoded += base64UrlAlphabet[(chunk >> 12) & 63] ?? "";
    if (second !== undefined) {
      encoded += base64UrlAlphabet[(chunk >> 6) & 63] ?? "";
    }
    if (third !== undefined) {
      encoded += base64UrlAlphabet[chunk & 63] ?? "";
    }
  }
  return encoded;
}

export function generateInvitationToken(
  randomBytes: (target: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>,
): string {
  return encodeBase64Url(randomBytes(new Uint8Array(32)));
}

export async function hashInvitationToken(token: string): Promise<string> {
  if (token.length < 32) {
    throw new Error("INVITATION_TOKEN_INVALID");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function invitationTokenHint(token: string): string {
  return token.slice(-6);
}

export function assertPortablePreferenceKey(key: string): string {
  const normalized = key.trim();
  if (!/^[a-z][a-z0-9._-]{0,95}$/i.test(normalized)) {
    throw new Error("PREFERENCE_KEY_INVALID");
  }
  return normalized;
}
