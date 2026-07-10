import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericMutationCtx,
  GenericQueryCtx,
  UserIdentity,
} from "convex/server";
import type { GenericId } from "convex/values";

import type schema from "./schema.ts";
import { canManageRoles, canManageTenant, type TenantRole } from "../src/tenancy.ts";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type ConnectUserDocument = DocumentByName<DataModel, "connectUsers">;
export type TenantDocument = DocumentByName<DataModel, "tenants">;
export type TenantMembershipDocument = DocumentByName<DataModel, "tenantMemberships">;
export type TenantId = GenericId<"tenants">;

type AuthContext = Pick<GenericQueryCtx<DataModel>, "auth">;
type DatabaseContext =
  | Pick<GenericQueryCtx<DataModel>, "auth" | "db">
  | Pick<GenericMutationCtx<DataModel>, "auth" | "db">;

export async function requireIdentity(ctx: AuthContext): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("UNAUTHENTICATED");
  }
  return identity;
}

export async function userByClerkId(
  ctx: Pick<DatabaseContext, "db">,
  clerkUserId: string,
): Promise<ConnectUserDocument | null> {
  return await ctx.db
    .query("connectUsers")
    .withIndex("by_clerk_user_id", (query) => query.eq("clerkUserId", clerkUserId))
    .unique();
}

export async function requireConnectUser(ctx: DatabaseContext): Promise<ConnectUserDocument> {
  const identity = await requireIdentity(ctx);
  const user = await userByClerkId(ctx, identity.subject);
  if (user === null) {
    throw new Error("ACCOUNT_NOT_BOOTSTRAPPED");
  }
  return user;
}

export async function membershipByUser(
  ctx: Pick<DatabaseContext, "db">,
  tenantId: TenantId,
  userId: string,
): Promise<TenantMembershipDocument | null> {
  return await ctx.db
    .query("tenantMemberships")
    .withIndex("by_tenant_user", (query) => query.eq("tenantId", tenantId).eq("userId", userId))
    .unique();
}

export async function requireTenantMembership(
  ctx: DatabaseContext,
  tenantId: TenantId,
): Promise<TenantMembershipDocument> {
  const user = await requireConnectUser(ctx);
  const membership = await membershipByUser(ctx, tenantId, user.clerkUserId);
  if (membership === null) {
    throw new Error("TENANT_ACCESS_DENIED");
  }
  return membership;
}

export async function requireTenantManager(
  ctx: DatabaseContext,
  tenantId: TenantId,
): Promise<TenantMembershipDocument> {
  const membership = await requireTenantMembership(ctx, tenantId);
  if (!canManageTenant(membership.role as TenantRole)) {
    throw new Error("TENANT_ADMIN_REQUIRED");
  }
  return membership;
}

export async function requireTenantOwner(
  ctx: DatabaseContext,
  tenantId: TenantId,
): Promise<TenantMembershipDocument> {
  const membership = await requireTenantMembership(ctx, tenantId);
  if (!canManageRoles(membership.role as TenantRole)) {
    throw new Error("TENANT_OWNER_REQUIRED");
  }
  return membership;
}

export function assertCreatorOwnedResource(
  viewerUserId: string,
  resource: { readonly ownerUserId: string },
): void {
  if (resource.ownerUserId !== viewerUserId) {
    throw new Error("RESOURCE_OWNER_REQUIRED");
  }
}

export async function requireCreatorOwnedResource(
  ctx: DatabaseContext,
  resource: { readonly tenantId: TenantId; readonly ownerUserId: string },
): Promise<ConnectUserDocument> {
  const user = await requireConnectUser(ctx);
  await requireTenantMembership(ctx, resource.tenantId);
  assertCreatorOwnedResource(user.clerkUserId, resource);
  return user;
}
