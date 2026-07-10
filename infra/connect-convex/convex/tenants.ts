import { mutationGeneric, queryGeneric, type GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  membershipByUser,
  requireConnectUser,
  requireTenantManager,
  requireTenantMembership,
  requireTenantOwner,
  userByClerkId,
  type DataModel,
  type TenantId,
} from "./authorization.ts";
import { normalizeTenantName } from "../src/tenancy.ts";

const tenantKindValidator = v.union(v.literal("personal"), v.literal("team"));
const tenantRoleValidator = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const editableTenantRoleValidator = v.union(v.literal("admin"), v.literal("member"));

const tenantSummaryValidator = v.object({
  tenantId: v.id("tenants"),
  name: v.string(),
  kind: tenantKindValidator,
  ownerUserId: v.string(),
  role: tenantRoleValidator,
  createdAt: v.string(),
  updatedAt: v.string(),
});

const membershipSummaryValidator = v.object({
  userId: v.string(),
  role: tenantRoleValidator,
  createdAt: v.string(),
  updatedAt: v.string(),
});

type MutationDbContext = Pick<GenericMutationCtx<DataModel>, "auth" | "db">;

async function resetActiveTenantForUser(
  ctx: MutationDbContext,
  userId: string,
  removedTenantId: TenantId,
  now: string,
): Promise<void> {
  const user = await userByClerkId(ctx, userId);
  if (user?.activeTenantId !== removedTenantId) {
    return;
  }

  const personalTenant = await ctx.db
    .query("tenants")
    .withIndex("by_owner_kind", (query) => query.eq("ownerUserId", userId))
    .filter((query) => query.eq(query.field("kind"), "personal"))
    .first();
  if (personalTenant === null) {
    throw new Error("PERSONAL_TENANT_NOT_FOUND");
  }
  await ctx.db.patch("connectUsers", user._id, {
    activeTenantId: personalTenant._id,
    updatedAt: now,
  });
}

export const listMine = queryGeneric({
  args: {},
  returns: v.array(tenantSummaryValidator),
  handler: async (ctx) => {
    const user = await requireConnectUser(ctx);
    const memberships = await ctx.db
      .query("tenantMemberships")
      .withIndex("by_user", (query) => query.eq("userId", user.clerkUserId))
      .collect();

    const tenants = await Promise.all(
      memberships.map(async (membership) => {
        const tenant = await ctx.db.get("tenants", membership.tenantId);
        return tenant === null
          ? null
          : {
              tenantId: tenant._id,
              name: tenant.name,
              kind: tenant.kind,
              ownerUserId: tenant.ownerUserId,
              role: membership.role,
              createdAt: tenant.createdAt,
              updatedAt: tenant.updatedAt,
            };
      }),
    );

    return tenants
      .filter((tenant) => tenant !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const viewerContext = queryGeneric({
  args: {},
  returns: v.object({
    activeTenantId: v.union(v.null(), v.id("tenants")),
    tenants: v.array(tenantSummaryValidator),
  }),
  handler: async (ctx) => {
    const user = await requireConnectUser(ctx);
    const memberships = await ctx.db
      .query("tenantMemberships")
      .withIndex("by_user", (query) => query.eq("userId", user.clerkUserId))
      .collect();
    const summaries = await Promise.all(
      memberships.map(async (membership) => {
        const tenant = await ctx.db.get("tenants", membership.tenantId);
        return tenant === null
          ? null
          : {
              tenantId: tenant._id,
              name: tenant.name,
              kind: tenant.kind,
              ownerUserId: tenant.ownerUserId,
              role: membership.role,
              createdAt: tenant.createdAt,
              updatedAt: tenant.updatedAt,
            };
      }),
    );
    return {
      activeTenantId: user.activeTenantId ?? null,
      tenants: summaries
        .filter((tenant) => tenant !== null)
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  },
});

export const createTeam = mutationGeneric({
  args: { name: v.string() },
  returns: tenantSummaryValidator,
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const tenantId = await ctx.db.insert("tenants", {
      name: normalizeTenantName(args.name),
      kind: "team",
      ownerUserId: user.clerkUserId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("tenantMemberships", {
      tenantId,
      userId: user.clerkUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("connectUsers", user._id, {
      activeTenantId: tenantId,
      updatedAt: now,
    });
    return {
      tenantId,
      name: normalizeTenantName(args.name),
      kind: "team" as const,
      ownerUserId: user.clerkUserId,
      role: "owner" as const,
      createdAt: now,
      updatedAt: now,
    };
  },
});

export const setActive = mutationGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    await ctx.db.patch("connectUsers", user._id, {
      activeTenantId: args.tenantId,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return null;
  },
});

export const rename = mutationGeneric({
  args: { tenantId: v.id("tenants"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTenantManager(ctx, args.tenantId);
    const tenant = await ctx.db.get("tenants", args.tenantId);
    if (tenant === null) {
      throw new Error("TENANT_NOT_FOUND");
    }
    await ctx.db.patch("tenants", tenant._id, {
      name: normalizeTenantName(args.name),
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return null;
  },
});

export const listMembers = queryGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.array(membershipSummaryValidator),
  handler: async (ctx, args) => {
    await requireTenantMembership(ctx, args.tenantId);
    const memberships = await ctx.db
      .query("tenantMemberships")
      .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
      .collect();
    return memberships.map((membership) => ({
      userId: membership.userId,
      role: membership.role,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    }));
  },
});

export const updateMemberRole = mutationGeneric({
  args: {
    tenantId: v.id("tenants"),
    userId: v.string(),
    role: editableTenantRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTenantOwner(ctx, args.tenantId);
    const membership = await membershipByUser(ctx, args.tenantId, args.userId);
    if (membership === null) {
      throw new Error("TENANT_MEMBER_NOT_FOUND");
    }
    if (membership.role === "owner") {
      throw new Error("TENANT_OWNER_ROLE_IMMUTABLE");
    }
    await ctx.db.patch("tenantMemberships", membership._id, {
      role: args.role,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return null;
  },
});

export const removeMember = mutationGeneric({
  args: { tenantId: v.id("tenants"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTenantOwner(ctx, args.tenantId);
    const membership = await membershipByUser(ctx, args.tenantId, args.userId);
    if (membership === null) {
      return null;
    }
    if (membership.role === "owner") {
      throw new Error("TENANT_OWNER_CANNOT_BE_REMOVED");
    }
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.delete("tenantMemberships", membership._id);
    await resetActiveTenantForUser(ctx, args.userId, args.tenantId, now);
    return null;
  },
});

export const leave = mutationGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const membership = await requireTenantMembership(ctx, args.tenantId);
    if (membership.role === "owner") {
      throw new Error("TENANT_OWNER_CANNOT_LEAVE");
    }
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.delete("tenantMemberships", membership._id);
    await resetActiveTenantForUser(ctx, user.clerkUserId, args.tenantId, now);
    return null;
  },
});
