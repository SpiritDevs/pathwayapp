import {
  actionGeneric,
  internalMutationGeneric,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
  type FunctionReference,
} from "convex/server";
import { v, type GenericId, type Value } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  membershipByUser,
  requireConnectUser,
  requireIdentity,
  requireTenantManager,
} from "./authorization.ts";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationState,
  invitationTokenHint,
  normalizeEmailAddress,
  type InvitationRole,
} from "../src/tenancy.ts";
import { deliverInvitation, invitationDeliveryConfig } from "../src/invitationDelivery.ts";

const invitationRoleValidator = v.union(v.literal("admin"), v.literal("member"));
const invitationStateValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("revoked"),
  v.literal("expired"),
);

const invitationSummaryValidator = v.object({
  invitationId: v.id("tenantInvitations"),
  tenantId: v.id("tenants"),
  invitedEmail: v.string(),
  role: invitationRoleValidator,
  tokenHint: v.string(),
  invitedByUserId: v.string(),
  expiresAt: v.string(),
  state: invitationStateValidator,
  acceptedByUserId: v.union(v.null(), v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

type CreateFromHashArgs = Record<string, Value> & {
  readonly tenantId: GenericId<"tenants">;
  readonly invitedEmail: string;
  readonly role: InvitationRole;
  readonly tokenHash: string;
  readonly tokenHint: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};

interface CreateFromHashResult {
  readonly invitationId: GenericId<"tenantInvitations">;
}

type AcceptFromHashArgs = Record<string, Value> & {
  readonly tokenHash: string;
  readonly acceptedAt: string;
};

interface AcceptFromHashResult {
  readonly tenantId: GenericId<"tenants">;
  readonly role: "owner" | "admin" | "member";
}

const createFromHashReference = makeFunctionReference<
  "mutation",
  CreateFromHashArgs,
  CreateFromHashResult
>("invitations:createFromHash") as unknown as FunctionReference<
  "mutation",
  "internal",
  CreateFromHashArgs,
  CreateFromHashResult
>;

const acceptFromHashReference = makeFunctionReference<
  "mutation",
  AcceptFromHashArgs,
  AcceptFromHashResult
>("invitations:acceptFromHash") as unknown as FunctionReference<
  "mutation",
  "internal",
  AcceptFromHashArgs,
  AcceptFromHashResult
>;

export const list = queryGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.array(invitationSummaryValidator),
  handler: async (ctx, args) => {
    await requireTenantManager(ctx, args.tenantId);
    const now = DateTime.toEpochMillis(DateTime.nowUnsafe());
    const invitations = await ctx.db
      .query("tenantInvitations")
      .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
      .collect();
    return invitations.map((invitation) => ({
      invitationId: invitation._id,
      tenantId: invitation.tenantId,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role,
      tokenHint: invitation.tokenHint,
      invitedByUserId: invitation.invitedByUserId,
      expiresAt: invitation.expiresAt,
      state: invitationState(invitation, now),
      acceptedByUserId: invitation.acceptedByUserId,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
    }));
  },
});

export const create = actionGeneric({
  args: {
    tenantId: v.id("tenants"),
    invitedEmail: v.string(),
    role: invitationRoleValidator,
  },
  returns: v.object({
    invitationId: v.id("tenantInvitations"),
    token: v.string(),
    inviteUrl: v.string(),
    expiresAt: v.string(),
    deliveryStatus: v.union(v.literal("sent"), v.literal("not_configured"), v.literal("failed")),
  }),
  handler: async (ctx, args) => {
    const token = generateInvitationToken((target) => crypto.getRandomValues(target));
    const tokenHash = await hashInvitationToken(token);
    const now = DateTime.nowUnsafe();
    const createdAt = DateTime.formatIso(now);
    const expiresAt = invitationExpiresAt(DateTime.toEpochMillis(now));
    const result = await ctx.runMutation(createFromHashReference, {
      tenantId: args.tenantId,
      invitedEmail: normalizeEmailAddress(args.invitedEmail),
      role: args.role,
      tokenHash,
      tokenHint: invitationTokenHint(token),
      createdAt,
      expiresAt,
    });
    const appUrl = (process.env.PATHWAYOS_APP_URL ?? "http://localhost:5733").replace(/\/$/, "");
    const inviteUrl = `${appUrl}/invitations/accept?token=${token}`;
    const deliveryStatus = await deliverInvitation(invitationDeliveryConfig(process.env), {
      invitedEmail: normalizeEmailAddress(args.invitedEmail),
      inviteUrl,
    });
    return {
      invitationId: result.invitationId,
      token,
      inviteUrl,
      expiresAt,
      deliveryStatus,
    };
  },
});

export const createFromHash = internalMutationGeneric({
  args: {
    tenantId: v.id("tenants"),
    invitedEmail: v.string(),
    role: invitationRoleValidator,
    tokenHash: v.string(),
    tokenHint: v.string(),
    createdAt: v.string(),
    expiresAt: v.string(),
  },
  returns: v.object({ invitationId: v.id("tenantInvitations") }),
  handler: async (ctx, args) => {
    const manager = await requireTenantManager(ctx, args.tenantId);
    const invitedEmail = normalizeEmailAddress(args.invitedEmail);
    if (invitedEmail.length === 0 || !invitedEmail.includes("@")) {
      throw new Error("INVITATION_EMAIL_INVALID");
    }
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash) || args.tokenHint.length !== 6) {
      throw new Error("INVITATION_TOKEN_INVALID");
    }
    const existingInvitations = await ctx.db
      .query("tenantInvitations")
      .withIndex("by_tenant_email", (query) => query.eq("tenantId", args.tenantId))
      .filter((query) => query.eq(query.field("invitedEmail"), invitedEmail))
      .collect();
    for (const invitation of existingInvitations) {
      if (invitation.acceptedAt === null && invitation.revokedAt === null) {
        await ctx.db.patch("tenantInvitations", invitation._id, {
          revokedAt: args.createdAt,
          updatedAt: args.createdAt,
        });
      }
    }
    const invitationId = await ctx.db.insert("tenantInvitations", {
      tenantId: args.tenantId,
      invitedEmail,
      role: args.role,
      tokenHash: args.tokenHash,
      tokenHint: args.tokenHint,
      invitedByUserId: manager.userId,
      expiresAt: args.expiresAt,
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });
    return { invitationId };
  },
});

export const revoke = mutationGeneric({
  args: { invitationId: v.id("tenantInvitations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get("tenantInvitations", args.invitationId);
    if (invitation === null) {
      return null;
    }
    await requireTenantManager(ctx, invitation.tenantId);
    if (invitation.acceptedAt !== null) {
      throw new Error("INVITATION_ALREADY_ACCEPTED");
    }
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("tenantInvitations", invitation._id, {
      revokedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const accept = actionGeneric({
  args: { token: v.string() },
  returns: v.object({
    tenantId: v.id("tenants"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  }),
  handler: async (ctx, args) => {
    const tokenHash = await hashInvitationToken(args.token);
    return await ctx.runMutation(acceptFromHashReference, {
      tokenHash,
      acceptedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
  },
});

export const acceptFromHash = internalMutationGeneric({
  args: { tokenHash: v.string(), acceptedAt: v.string() },
  returns: v.object({
    tenantId: v.id("tenants"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const user = await requireConnectUser(ctx);
    const invitation = await ctx.db
      .query("tenantInvitations")
      .withIndex("by_token_hash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (invitation === null) {
      throw new Error("INVITATION_NOT_FOUND");
    }
    if (invitation.acceptedAt !== null) {
      if (invitation.acceptedByUserId !== user.clerkUserId) {
        throw new Error("INVITATION_ALREADY_ACCEPTED");
      }
      const existingMembership = await membershipByUser(ctx, invitation.tenantId, user.clerkUserId);
      if (existingMembership === null) {
        throw new Error("INVITATION_MEMBERSHIP_MISSING");
      }
      return { tenantId: invitation.tenantId, role: existingMembership.role };
    }
    if (invitation.revokedAt !== null) {
      throw new Error("INVITATION_REVOKED");
    }
    if (
      invitationState(invitation, DateTime.toEpochMillis(DateTime.makeUnsafe(args.acceptedAt))) ===
      "expired"
    ) {
      throw new Error("INVITATION_EXPIRED");
    }
    const viewerEmail = identity.email === undefined ? null : normalizeEmailAddress(identity.email);
    if (viewerEmail === null || viewerEmail !== invitation.invitedEmail) {
      throw new Error("INVITATION_EMAIL_MISMATCH");
    }

    let membership = await membershipByUser(ctx, invitation.tenantId, user.clerkUserId);
    if (membership === null) {
      const membershipId = await ctx.db.insert("tenantMemberships", {
        tenantId: invitation.tenantId,
        userId: user.clerkUserId,
        role: invitation.role,
        createdAt: args.acceptedAt,
        updatedAt: args.acceptedAt,
      });
      membership = await ctx.db.get("tenantMemberships", membershipId);
      if (membership === null) {
        throw new Error("TENANT_MEMBERSHIP_CREATE_FAILED");
      }
    } else if (membership.role !== "owner" && membership.role !== invitation.role) {
      await ctx.db.patch("tenantMemberships", membership._id, {
        role: invitation.role,
        updatedAt: args.acceptedAt,
      });
      membership = { ...membership, role: invitation.role, updatedAt: args.acceptedAt };
    }
    await ctx.db.patch("tenantInvitations", invitation._id, {
      acceptedAt: args.acceptedAt,
      acceptedByUserId: user.clerkUserId,
      updatedAt: args.acceptedAt,
    });
    await ctx.db.patch("connectUsers", user._id, {
      activeTenantId: invitation.tenantId,
      updatedAt: args.acceptedAt,
    });
    return { tenantId: invitation.tenantId, role: membership.role };
  },
});
