import { describe, expect, it } from "vite-plus/test";

import {
  invitationFallbackUrl,
  parseViewerContext,
  tenantPermissions,
  type CreatedInvitation,
} from "./AccountTeamsSettings.logic";

describe("AccountTeamsSettings logic", () => {
  it("decodes a viewer workspace context", () => {
    expect(
      parseViewerContext({
        activeTenantId: "tenant-1",
        tenants: [
          {
            tenantId: "tenant-1",
            name: "Acme",
            kind: "team",
            ownerUserId: "user-1",
            role: "admin",
            createdAt: "2026-07-10T00:00:00.000Z",
            updatedAt: "2026-07-10T00:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({ activeTenantId: "tenant-1", tenants: [{ role: "admin" }] });
  });

  it("rejects malformed workspace payloads", () => {
    expect(
      parseViewerContext({ activeTenantId: null, tenants: [{ role: "superuser" }] }),
    ).toBeNull();
  });

  it("derives server-aligned role affordances", () => {
    expect(tenantPermissions("owner")).toEqual({
      canManageTeam: true,
      canManageMembers: true,
      canLeave: false,
    });
    expect(tenantPermissions("admin")).toEqual({
      canManageTeam: true,
      canManageMembers: false,
      canLeave: true,
    });
    expect(tenantPermissions("member")).toEqual({
      canManageTeam: false,
      canManageMembers: false,
      canLeave: true,
    });
  });

  it("only exposes a secret-bearing URL when delivery is not configured", () => {
    const invitation = {
      invitationId: "invite-1",
      inviteUrl: "https://app.example/invitations/accept?token=secret",
      expiresAt: "2026-07-17T00:00:00.000Z",
      deliveryStatus: "not_configured",
    } as CreatedInvitation;
    expect(invitationFallbackUrl(invitation)).toContain("token=secret");
    expect(invitationFallbackUrl({ ...invitation, deliveryStatus: "sent" })).toBeNull();
    expect(invitationFallbackUrl({ ...invitation, deliveryStatus: "failed" })).toBeNull();
  });
});
