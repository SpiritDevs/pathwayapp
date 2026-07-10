import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import { membershipByUser, userByClerkId, type DataModel, type TenantId } from "./authorization.ts";

type DatabaseContext =
  | Pick<GenericQueryCtx<DataModel>, "db">
  | Pick<GenericMutationCtx<DataModel>, "db">;

export interface EnvironmentPrincipal {
  readonly environmentId: string;
  readonly ownerUserId: string;
  readonly tenantId: TenantId;
}

/**
 * Resolves an environment bearer credential to the owning PathwayOS user.
 *
 * Credentials are bound to the tenant selected when the environment was
 * linked. Membership is checked for every request so leaving that workspace
 * revokes data-plane authority without rotating unrelated environments.
 */
export async function requireEnvironmentPrincipal(
  ctx: DatabaseContext,
  credentialHash: string,
  environmentId: string,
): Promise<EnvironmentPrincipal> {
  const credential = await ctx.db
    .query("environmentCredentials")
    .withIndex("by_credential_hash", (query) => query.eq("credentialHash", credentialHash))
    .unique();
  if (
    credential === null ||
    credential.revokedAt !== null ||
    credential.environmentId !== environmentId
  ) {
    throw new Error("ENVIRONMENT_CREDENTIAL_INVALID");
  }

  const links = await ctx.db
    .query("environmentLinks")
    .withIndex("by_environment", (query) => query.eq("environmentId", environmentId))
    .filter((query) => query.eq(query.field("revokedAt"), null))
    .collect();
  const link = links.find(
    (candidate) => candidate.environmentPublicKey === credential.environmentPublicKey,
  );
  if (link === undefined) {
    throw new Error("ENVIRONMENT_LINK_NOT_FOUND");
  }

  if (credential.ownerUserId !== link.ownerUserId || credential.tenantId !== link.tenantId) {
    throw new Error("ENVIRONMENT_CREDENTIAL_OWNER_MISMATCH");
  }

  const user = await userByClerkId(ctx, link.ownerUserId);
  if (user === null) {
    throw new Error("ENVIRONMENT_OWNER_NOT_FOUND");
  }
  const membership = await membershipByUser(ctx, link.tenantId, link.ownerUserId);
  if (membership === null) {
    throw new Error("TENANT_ACCESS_DENIED");
  }
  return {
    environmentId,
    ownerUserId: link.ownerUserId,
    tenantId: link.tenantId,
  };
}
