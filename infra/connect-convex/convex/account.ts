import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import { membershipByUser, userByClerkId, type DataModel } from "./authorization.ts";
import {
  FREE_PLAN_LABEL,
  accountProfileFromIdentity,
  accountProfileFromStoredUser,
} from "../src/accountProfile.ts";
import { personalTenantName } from "../src/tenancy.ts";

const accountProfileValidator = v.object({
  clerkUserId: v.string(),
  primaryEmail: v.union(v.null(), v.string()),
  imageUrl: v.union(v.null(), v.string()),
  planLabel: v.literal(FREE_PLAN_LABEL),
});

export const viewer = queryGeneric({
  args: {},
  returns: v.union(v.null(), accountProfileValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    const storedUser = await userByClerkId(ctx, identity.subject);
    return storedUser === null
      ? accountProfileFromIdentity(identity)
      : accountProfileFromStoredUser(storedUser);
  },
});

export const bootstrap = mutationGeneric({
  args: {},
  returns: accountProfileValidator,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("UNAUTHENTICATED");
    }

    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const profile = accountProfileFromIdentity(identity);
    const storedUser = await userByClerkId(ctx, identity.subject);

    let userId: DataModel["connectUsers"]["document"]["_id"];

    if (storedUser === null) {
      userId = await ctx.db.insert("connectUsers", {
        clerkUserId: profile.clerkUserId,
        primaryEmail: profile.primaryEmail,
        imageUrl: profile.imageUrl,
        planLabel: profile.planLabel,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      userId = storedUser._id;
      await ctx.db.patch("connectUsers", storedUser._id, {
        primaryEmail: profile.primaryEmail,
        imageUrl: profile.imageUrl,
        planLabel: profile.planLabel,
        updatedAt: now,
      });
    }

    let personalTenant = await ctx.db
      .query("tenants")
      .withIndex("by_owner_kind", (query) => query.eq("ownerUserId", profile.clerkUserId))
      .filter((query) => query.eq(query.field("kind"), "personal"))
      .first();

    if (personalTenant === null) {
      const tenantId = await ctx.db.insert("tenants", {
        name: personalTenantName(profile.primaryEmail),
        kind: "personal",
        ownerUserId: profile.clerkUserId,
        createdAt: now,
        updatedAt: now,
      });
      personalTenant = await ctx.db.get("tenants", tenantId);
      if (personalTenant === null) {
        throw new Error("PERSONAL_TENANT_CREATE_FAILED");
      }
    }

    const personalMembership = await membershipByUser(ctx, personalTenant._id, profile.clerkUserId);
    if (personalMembership === null) {
      await ctx.db.insert("tenantMemberships", {
        tenantId: personalTenant._id,
        userId: profile.clerkUserId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    }

    const activeMembership =
      storedUser?.activeTenantId === undefined
        ? null
        : await membershipByUser(ctx, storedUser.activeTenantId, profile.clerkUserId);
    if (activeMembership === null) {
      await ctx.db.patch("connectUsers", userId, {
        activeTenantId: personalTenant._id,
        updatedAt: now,
      });
    }

    return profile;
  },
});
