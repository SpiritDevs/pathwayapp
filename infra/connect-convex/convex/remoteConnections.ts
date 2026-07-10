import {
  actionGeneric,
  internalMutationGeneric,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
  type FunctionReference,
} from "convex/server";
import { v, type Value } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  cloudflareAllocationNames,
  cloudflareEndpoint,
  cloudflareProviderConfig,
  deprovisionCloudflareTunnel,
  provisionCloudflareTunnel,
  redactCloudflareError,
} from "../src/cloudflareProvider.ts";
import { requireConnectUser, requireIdentity } from "./authorization.ts";

const providerKindValidator = v.literal("cloudflare_tunnel");
const requestStatusValidator = v.union(
  v.literal("requested"),
  v.literal("provisioning"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("deprovisioning"),
  v.literal("disabled"),
);
const requestSummaryValidator = v.object({
  environmentId: v.string(),
  providerKind: providerKindValidator,
  status: requestStatusValidator,
  errorMessage: v.union(v.null(), v.string()),
  endpoint: v.union(
    v.null(),
    v.object({
      httpBaseUrl: v.string(),
      wsBaseUrl: v.string(),
      providerKind: providerKindValidator,
    }),
  ),
  updatedAt: v.string(),
});

type BeginProvisionArgs = Record<string, Value> & {
  readonly ownerUserId: string;
  readonly environmentId: string;
  readonly hostname: string;
  readonly tunnelName: string;
  readonly now: string;
};
type BeginProvisionResult = {
  readonly localHttpHost: string;
  readonly localHttpPort: number;
  readonly hostname: string;
  readonly tunnelName: string;
  readonly tunnelId: string | null;
  readonly dnsRecordId: string | null;
};
type CompleteProvisionArgs = Record<string, Value> & {
  readonly ownerUserId: string;
  readonly environmentId: string;
  readonly hostname: string;
  readonly tunnelName: string;
  readonly tunnelId: string;
  readonly dnsRecordId: string;
  readonly now: string;
};
type BeginDeprovisionResult = {
  readonly tunnelId: string | null;
  readonly dnsRecordId: string | null;
};

const beginProvisionReference = makeFunctionReference<
  "mutation",
  BeginProvisionArgs,
  BeginProvisionResult
>("remoteConnections:beginProvision") as unknown as FunctionReference<
  "mutation",
  "internal",
  BeginProvisionArgs,
  BeginProvisionResult
>;
const completeProvisionReference = makeFunctionReference<"mutation", CompleteProvisionArgs, null>(
  "remoteConnections:completeProvision",
) as unknown as FunctionReference<"mutation", "internal", CompleteProvisionArgs, null>;
const failProvisionReference = makeFunctionReference<
  "mutation",
  Record<string, Value> & {
    ownerUserId: string;
    environmentId: string;
    errorMessage: string;
    now: string;
  },
  null
>("remoteConnections:failProvision") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, Value> & {
    ownerUserId: string;
    environmentId: string;
    errorMessage: string;
    now: string;
  },
  null
>;
const beginDeprovisionReference = makeFunctionReference<
  "mutation",
  Record<string, Value> & { ownerUserId: string; environmentId: string; now: string },
  BeginDeprovisionResult
>("remoteConnections:beginDeprovision") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, Value> & { ownerUserId: string; environmentId: string; now: string },
  BeginDeprovisionResult
>;
const completeDeprovisionReference = makeFunctionReference<
  "mutation",
  Record<string, Value> & { ownerUserId: string; environmentId: string; now: string },
  null
>("remoteConnections:completeDeprovision") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, Value> & { ownerUserId: string; environmentId: string; now: string },
  null
>;

export const enable = actionGeneric({
  args: { environmentId: v.string() },
  returns: v.object({
    endpoint: v.object({
      httpBaseUrl: v.string(),
      wsBaseUrl: v.string(),
      providerKind: providerKindValidator,
    }),
    endpointRuntime: v.object({
      providerKind: providerKindValidator,
      connectorToken: v.string(),
      tunnelId: v.string(),
      tunnelName: v.string(),
    }),
  }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const config = cloudflareProviderConfig(process.env);
    const names = await cloudflareAllocationNames({
      baseDomain: config.baseDomain,
      ownerUserId: identity.subject,
      environmentId: args.environmentId,
      ...(config.namespace ? { namespace: config.namespace } : {}),
    });
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const state = await ctx.runMutation(beginProvisionReference, {
      ownerUserId: identity.subject,
      environmentId: args.environmentId,
      ...names,
      now,
    });
    try {
      const provisioned = await provisionCloudflareTunnel({
        config,
        origin: state,
        hostname: state.hostname,
        tunnelName: state.tunnelName,
        preferredTunnelId: state.tunnelId,
        preferredDnsRecordId: state.dnsRecordId,
      });
      const completedAt = DateTime.formatIso(DateTime.nowUnsafe());
      await ctx.runMutation(completeProvisionReference, {
        ownerUserId: identity.subject,
        environmentId: args.environmentId,
        hostname: state.hostname,
        tunnelName: state.tunnelName,
        tunnelId: provisioned.tunnelId,
        dnsRecordId: provisioned.dnsRecordId,
        now: completedAt,
      });
      return {
        endpoint: cloudflareEndpoint(state.hostname),
        endpointRuntime: {
          providerKind: "cloudflare_tunnel" as const,
          connectorToken: provisioned.connectorToken,
          tunnelId: provisioned.tunnelId,
          tunnelName: state.tunnelName,
        },
      };
    } catch (error) {
      const message = redactCloudflareError(error);
      await ctx.runMutation(failProvisionReference, {
        ownerUserId: identity.subject,
        environmentId: args.environmentId,
        errorMessage: message,
        now: DateTime.formatIso(DateTime.nowUnsafe()),
      });
      throw new Error(message, { cause: error });
    }
  },
});

export const beginProvision = internalMutationGeneric({
  args: {
    ownerUserId: v.string(),
    environmentId: v.string(),
    hostname: v.string(),
    tunnelName: v.string(),
    now: v.string(),
  },
  returns: v.object({
    localHttpHost: v.string(),
    localHttpPort: v.number(),
    hostname: v.string(),
    tunnelName: v.string(),
    tunnelId: v.union(v.null(), v.string()),
    dnsRecordId: v.union(v.null(), v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId) throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (link === null || link.revokedAt !== null) throw new Error("ENVIRONMENT_LINK_NOT_FOUND");
    const existingRequest = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const requestValue = {
      tenantId: link.tenantId,
      ownerUserId: user.clerkUserId,
      environmentId: args.environmentId,
      providerKind: "cloudflare_tunnel" as const,
      status: "provisioning" as const,
      updatedAt: args.now,
      errorMessage: null,
    };
    if (existingRequest === null) {
      await ctx.db.insert("remoteConnectionRequests", {
        ...requestValue,
        requestedAt: args.now,
      });
    } else {
      await ctx.db.patch("remoteConnectionRequests", existingRequest._id, requestValue);
    }
    let allocation = await ctx.db
      .query("providerAllocations")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (allocation === null) {
      const allocationId = await ctx.db.insert("providerAllocations", {
        tenantId: link.tenantId,
        ownerUserId: user.clerkUserId,
        environmentId: args.environmentId,
        providerKind: "cloudflare_tunnel",
        hostname: args.hostname,
        tunnelName: args.tunnelName,
        tunnelId: null,
        dnsRecordId: null,
        readyAt: null,
        createdAt: args.now,
        updatedAt: args.now,
      });
      allocation = await ctx.db.get("providerAllocations", allocationId);
    }
    if (allocation === null) throw new Error("PROVIDER_ALLOCATION_FAILED");
    return {
      ...link.localOrigin,
      hostname: allocation.hostname,
      tunnelName: allocation.tunnelName,
      tunnelId: allocation.tunnelId,
      dnsRecordId: allocation.dnsRecordId,
    };
  },
});

export const completeProvision = internalMutationGeneric({
  args: {
    ownerUserId: v.string(),
    environmentId: v.string(),
    hostname: v.string(),
    tunnelName: v.string(),
    tunnelId: v.string(),
    dnsRecordId: v.string(),
    now: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId) throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const allocation = await ctx.db
      .query("providerAllocations")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (link === null || request === null || allocation === null) {
      throw new Error("REMOTE_CONNECTION_REQUEST_NOT_FOUND");
    }
    await ctx.db.patch("providerAllocations", allocation._id, {
      hostname: args.hostname,
      tunnelName: args.tunnelName,
      tunnelId: args.tunnelId,
      dnsRecordId: args.dnsRecordId,
      readyAt: args.now,
      updatedAt: args.now,
    });
    await ctx.db.patch("remoteConnectionRequests", request._id, {
      status: "ready",
      errorMessage: null,
      updatedAt: args.now,
    });
    await ctx.db.patch("environmentLinks", link._id, {
      endpoint: cloudflareEndpoint(args.hostname),
      remoteAccessEnabled: true,
      updatedAt: args.now,
    });
    return null;
  },
});

export const failProvision = internalMutationGeneric({
  args: {
    ownerUserId: v.string(),
    environmentId: v.string(),
    errorMessage: v.string(),
    now: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId) throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (request !== null) {
      await ctx.db.patch("remoteConnectionRequests", request._id, {
        status: "failed",
        errorMessage: args.errorMessage.slice(0, 500),
        updatedAt: args.now,
      });
    }
    return null;
  },
});

export const disable = actionGeneric({
  args: { environmentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const config = cloudflareProviderConfig(process.env);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const allocation = await ctx.runMutation(beginDeprovisionReference, {
      ownerUserId: identity.subject,
      environmentId: args.environmentId,
      now,
    });
    try {
      await deprovisionCloudflareTunnel({ config, ...allocation });
      await ctx.runMutation(completeDeprovisionReference, {
        ownerUserId: identity.subject,
        environmentId: args.environmentId,
        now: DateTime.formatIso(DateTime.nowUnsafe()),
      });
      return null;
    } catch (error) {
      const message = redactCloudflareError(error);
      await ctx.runMutation(failProvisionReference, {
        ownerUserId: identity.subject,
        environmentId: args.environmentId,
        errorMessage: message,
        now: DateTime.formatIso(DateTime.nowUnsafe()),
      });
      throw new Error(message, { cause: error });
    }
  },
});

export const beginDeprovision = internalMutationGeneric({
  args: { ownerUserId: v.string(), environmentId: v.string(), now: v.string() },
  returns: v.object({
    tunnelId: v.union(v.null(), v.string()),
    dnsRecordId: v.union(v.null(), v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId) throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const allocation = await ctx.db
      .query("providerAllocations")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (request !== null) {
      await ctx.db.patch("remoteConnectionRequests", request._id, {
        status: "deprovisioning",
        errorMessage: null,
        updatedAt: args.now,
      });
    }
    return {
      tunnelId: allocation?.tunnelId ?? null,
      dnsRecordId: allocation?.dnsRecordId ?? null,
    };
  },
});

export const completeDeprovision = internalMutationGeneric({
  args: { ownerUserId: v.string(), environmentId: v.string(), now: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId) throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const allocation = await ctx.db
      .query("providerAllocations")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (link !== null) {
      await ctx.db.patch("environmentLinks", link._id, {
        endpoint: {
          httpBaseUrl: `http://${link.localOrigin.localHttpHost}:${link.localOrigin.localHttpPort}/`,
          wsBaseUrl: `ws://${link.localOrigin.localHttpHost}:${link.localOrigin.localHttpPort}/ws`,
          providerKind: "manual",
        },
        remoteAccessEnabled: false,
        updatedAt: args.now,
      });
    }
    if (request !== null) {
      await ctx.db.patch("remoteConnectionRequests", request._id, {
        status: "disabled",
        errorMessage: null,
        updatedAt: args.now,
      });
    }
    if (allocation !== null) await ctx.db.delete("providerAllocations", allocation._id);
    return null;
  },
});

export const status = queryGeneric({
  args: { environmentId: v.string() },
  returns: v.union(v.null(), requestSummaryValidator),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (request === null) return null;
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    return {
      environmentId: request.environmentId,
      providerKind: request.providerKind,
      status: request.status,
      errorMessage: request.errorMessage,
      endpoint:
        request.status === "ready" && link?.endpoint.providerKind === "cloudflare_tunnel"
          ? {
              httpBaseUrl: link.endpoint.httpBaseUrl,
              wsBaseUrl: link.endpoint.wsBaseUrl,
              providerKind: "cloudflare_tunnel" as const,
            }
          : null,
      updatedAt: request.updatedAt,
    };
  },
});

export const reportRuntimeFailure = mutationGeneric({
  args: { environmentId: v.string(), errorMessage: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const request = await ctx.db
      .query("remoteConnectionRequests")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (request === null) return null;
    await ctx.db.patch("remoteConnectionRequests", request._id, {
      status: "failed",
      errorMessage: redactCloudflareError(new Error(args.errorMessage)).slice(0, 500),
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return null;
  },
});
