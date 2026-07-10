import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";

import { assertCreatorOwnedResource } from "../convex/authorization.ts";
import {
  INVITATION_LIFETIME_MS,
  assertPortablePreferenceKey,
  canManageRoles,
  canManageTenant,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationState,
  normalizeEmailAddress,
  normalizeTenantName,
  personalTenantName,
} from "./tenancy.ts";

describe("tenant input normalization", () => {
  it("normalizes tenant names and rejects empty or oversized names", () => {
    expect(normalizeTenantName("  Pathway   Labs ")).toBe("Pathway Labs");
    expect(() => normalizeTenantName("   ")).toThrow("TENANT_NAME_REQUIRED");
    expect(() => normalizeTenantName("x".repeat(81))).toThrow("TENANT_NAME_TOO_LONG");
  });

  it("derives a stable personal workspace label without requiring an email", () => {
    expect(personalTenantName(" Corey@Example.test ")).toBe("corey's workspace");
    expect(personalTenantName(null)).toBe("Personal workspace");
  });

  it("normalizes invitation email addresses", () => {
    expect(normalizeEmailAddress("  Corey@Example.TEST ")).toBe("corey@example.test");
  });
});

describe("tenant authorization policy", () => {
  it("allows owners and admins to manage a tenant but only owners to change roles", () => {
    expect(canManageTenant("owner")).toBe(true);
    expect(canManageTenant("admin")).toBe(true);
    expect(canManageTenant("member")).toBe(false);
    expect(canManageRoles("owner")).toBe(true);
    expect(canManageRoles("admin")).toBe(false);
  });

  it("enforces creator ownership independently from tenant membership", () => {
    expect(() => assertCreatorOwnedResource("user_1", { ownerUserId: "user_1" })).not.toThrow();
    expect(() => assertCreatorOwnedResource("user_2", { ownerUserId: "user_1" })).toThrow(
      "RESOURCE_OWNER_REQUIRED",
    );
  });
});

describe("tenant invitations", () => {
  it("creates 256-bit base64url tokens and hashes them without retaining the raw token", async () => {
    const token = generateInvitationToken((target) => {
      for (let index = 0; index < target.length; index += 1) {
        target[index] = index;
      }
      return target;
    });

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashInvitationToken(token)).not.toContain(token);
  });

  it("expires invitations after seven days and gives terminal states precedence", () => {
    const createdAt = 1_700_000_000_000;
    const expiresAt = invitationExpiresAt(createdAt);
    expect(DateTime.toEpochMillis(DateTime.makeUnsafe(expiresAt))).toBe(
      createdAt + INVITATION_LIFETIME_MS,
    );
    expect(invitationState({ acceptedAt: null, revokedAt: null, expiresAt }, createdAt + 1)).toBe(
      "pending",
    );
    expect(
      invitationState(
        { acceptedAt: null, revokedAt: null, expiresAt },
        createdAt + INVITATION_LIFETIME_MS,
      ),
    ).toBe("expired");
    expect(
      invitationState(
        { acceptedAt: "accepted", revokedAt: "revoked", expiresAt },
        createdAt + INVITATION_LIFETIME_MS,
      ),
    ).toBe("accepted");
  });
});

describe("portable preference keys", () => {
  it("accepts namespaced keys and rejects unsafe or empty keys", () => {
    expect(assertPortablePreferenceKey("editor.theme-mode")).toBe("editor.theme-mode");
    expect(() => assertPortablePreferenceKey(" ")).toThrow("PREFERENCE_KEY_INVALID");
    expect(() => assertPortablePreferenceKey("email capture")).toThrow("PREFERENCE_KEY_INVALID");
  });
});
