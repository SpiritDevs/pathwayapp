import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import { requireConnectUser, requireTenantMembership } from "./authorization.ts";
import { assertPortablePreferenceKey } from "../src/tenancy.ts";

const preferenceValidator = v.object({
  key: v.string(),
  value: v.any(),
  tenantId: v.union(v.null(), v.id("tenants")),
  updatedAt: v.string(),
});

const preferenceScopeArgs = {
  tenantId: v.union(v.null(), v.id("tenants")),
};

export const list = queryGeneric({
  args: preferenceScopeArgs,
  returns: v.array(preferenceValidator),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (args.tenantId !== null) {
      await requireTenantMembership(ctx, args.tenantId);
    }
    const preferences = await ctx.db
      .query("portablePreferences")
      .withIndex("by_owner_tenant", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("tenantId"), args.tenantId))
      .collect();
    return preferences
      .map((preference) => ({
        key: preference.key,
        value: preference.value,
        tenantId: preference.tenantId,
        updatedAt: preference.updatedAt,
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
  },
});

export const get = queryGeneric({
  args: { ...preferenceScopeArgs, key: v.string() },
  returns: v.union(v.null(), preferenceValidator),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (args.tenantId !== null) {
      await requireTenantMembership(ctx, args.tenantId);
    }
    const key = assertPortablePreferenceKey(args.key);
    const preference = await ctx.db
      .query("portablePreferences")
      .withIndex("by_owner_tenant_key", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) =>
        query.and(
          query.eq(query.field("tenantId"), args.tenantId),
          query.eq(query.field("key"), key),
        ),
      )
      .unique();
    return preference === null
      ? null
      : {
          key: preference.key,
          value: preference.value,
          tenantId: preference.tenantId,
          updatedAt: preference.updatedAt,
        };
  },
});

export const set = mutationGeneric({
  args: { ...preferenceScopeArgs, key: v.string(), value: v.any() },
  returns: preferenceValidator,
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (args.tenantId !== null) {
      await requireTenantMembership(ctx, args.tenantId);
    }
    const key = assertPortablePreferenceKey(args.key);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const existing = await ctx.db
      .query("portablePreferences")
      .withIndex("by_owner_tenant_key", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) =>
        query.and(
          query.eq(query.field("tenantId"), args.tenantId),
          query.eq(query.field("key"), key),
        ),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("portablePreferences", {
        ownerUserId: user.clerkUserId,
        tenantId: args.tenantId,
        key,
        value: args.value,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("portablePreferences", existing._id, {
        value: args.value,
        updatedAt: now,
      });
    }
    return { key, value: args.value, tenantId: args.tenantId, updatedAt: now };
  },
});

export const remove = mutationGeneric({
  args: { ...preferenceScopeArgs, key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (args.tenantId !== null) {
      await requireTenantMembership(ctx, args.tenantId);
    }
    const key = assertPortablePreferenceKey(args.key);
    const preference = await ctx.db
      .query("portablePreferences")
      .withIndex("by_owner_tenant_key", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) =>
        query.and(
          query.eq(query.field("tenantId"), args.tenantId),
          query.eq(query.field("key"), key),
        ),
      )
      .unique();
    if (preference === null) {
      return false;
    }
    await ctx.db.delete("portablePreferences", preference._id);
    return true;
  },
});
