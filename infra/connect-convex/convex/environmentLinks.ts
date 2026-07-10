import {
  actionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
  type FunctionReference,
} from "convex/server";
import { v, type Value } from "convex/values";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { decodeRelayJwt, RELAY_LINK_PROOF_TYP, verifyRelayJwt } from "@pathwayos/shared/relayJwt";
import { cloudflareOriginService } from "../src/cloudflareProvider.ts";
import { membershipByUser, requireConnectUser, requireIdentity } from "./authorization.ts";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1_000;

const managedEndpointValidator = v.object({
  httpBaseUrl: v.string(),
  wsBaseUrl: v.string(),
  providerKind: v.union(
    v.literal("manual"),
    v.literal("cloudflare_tunnel"),
    v.literal("pathwayos_relay"),
  ),
});

const linkSummaryValidator = v.object({
  environmentId: v.string(),
  label: v.string(),
  endpoint: managedEndpointValidator,
  remoteAccessEnabled: v.boolean(),
  remoteAccessStatus: v.union(
    v.null(),
    v.literal("requested"),
    v.literal("provisioning"),
    v.literal("ready"),
    v.literal("failed"),
    v.literal("deprovisioning"),
    v.literal("disabled"),
  ),
  remoteAccessError: v.union(v.null(), v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

type StoreChallengeArgs = Record<string, Value> & {
  readonly ownerUserId: string;
  readonly challengeHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};

type CompleteLinkArgs = Record<string, Value> & {
  readonly ownerUserId: string;
  readonly challengeHash: string;
  readonly environmentId: string;
  readonly environmentLabel: string;
  readonly environmentPublicKey: string;
  readonly localHttpHost: string;
  readonly localHttpPort: number;
  readonly endpointHttpBaseUrl: string;
  readonly endpointWsBaseUrl: string;
  readonly credentialId: string;
  readonly credentialHash: string;
  readonly notificationsEnabled: boolean;
  readonly liveActivitiesEnabled: boolean;
  readonly createdByDeviceId: string | null;
  readonly proofJti: string;
  readonly proofIat: number;
  readonly proofExpiresAt: string;
  readonly now: string;
};

const storeChallengeReference = makeFunctionReference<"mutation", StoreChallengeArgs, null>(
  "environmentLinks:storeChallenge",
) as unknown as FunctionReference<"mutation", "internal", StoreChallengeArgs, null>;

const completeLinkReference = makeFunctionReference<
  "mutation",
  CompleteLinkArgs,
  { tenantId: string }
>("environmentLinks:completeLink") as unknown as FunctionReference<
  "mutation",
  "internal",
  CompleteLinkArgs,
  { tenantId: string }
>;

function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function connectIssuer(): string {
  const configured = process.env.PATHWAYOS_CONNECT_URL ?? process.env.CONVEX_URL;
  if (!configured) throw new Error("PATHWAYOS_CONNECT_URL_NOT_CONFIGURED");
  const url = new URL(configured);
  if (url.protocol !== "https:") throw new Error("PATHWAYOS_CONNECT_URL_INVALID");
  return url.origin;
}

function cloudMintPublicKey(): string {
  const value = process.env.PATHWAYOS_CLOUD_MINT_PUBLIC_KEY?.replaceAll("\\n", "\n").trim();
  if (!value) throw new Error("PATHWAYOS_CLOUD_MINT_PUBLIC_KEY_NOT_CONFIGURED");
  return value;
}

function stringClaim(value: unknown, error: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(error);
  return value;
}

function integerClaim(value: unknown, error: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(error);
  return value;
}

export const createLinkChallenge = actionGeneric({
  args: {},
  returns: v.object({ challenge: v.string(), expiresAt: v.string(), relayIssuer: v.string() }),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const challenge = randomToken();
    const now = DateTime.nowUnsafe();
    const createdAt = DateTime.formatIso(now);
    const expiresAt = DateTime.formatIso(
      DateTime.add(now, { milliseconds: CHALLENGE_LIFETIME_MS }),
    );
    const challengeHash = await sha256(challenge);
    // The internal mutation repeats account and tenant checks. Passing the
    // authenticated subject only binds the random challenge to this action.
    await ctx.runMutation(storeChallengeReference, {
      ownerUserId: identity.subject,
      challengeHash,
      createdAt,
      expiresAt,
    });
    return { challenge, expiresAt, relayIssuer: connectIssuer() };
  },
});

export const storeChallenge = internalMutationGeneric({
  args: {
    ownerUserId: v.string(),
    challengeHash: v.string(),
    createdAt: v.string(),
    expiresAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId || user.activeTenantId === undefined) {
      throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    }
    await ctx.db.insert("environmentLinkChallenges", {
      tenantId: user.activeTenantId,
      ownerUserId: user.clerkUserId,
      challengeHash: args.challengeHash,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
      consumedAt: null,
    });
    return null;
  },
});

export const linkEnvironment = actionGeneric({
  args: {
    proof: v.string(),
    environmentLabel: v.string(),
    notificationsEnabled: v.boolean(),
    liveActivitiesEnabled: v.boolean(),
    createdByDeviceId: v.union(v.null(), v.string()),
  },
  returns: v.object({
    environmentId: v.string(),
    cloudUserId: v.string(),
    tenantId: v.string(),
    environmentCredential: v.string(),
    cloudMintPublicKey: v.string(),
    endpoint: managedEndpointValidator,
    endpointRuntime: v.null(),
    relayIssuer: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const unverified = decodeRelayJwt(args.proof);
    const environmentId = stringClaim(unverified.environmentId, "ENVIRONMENT_ID_INVALID");
    const environmentPublicKey = stringClaim(
      unverified.environmentPublicKey,
      "ENVIRONMENT_PUBLIC_KEY_INVALID",
    );
    const verified = await Effect.runPromise(
      verifyRelayJwt({
        publicKey: environmentPublicKey,
        token: args.proof,
        typ: RELAY_LINK_PROOF_TYP,
        issuer: `pathwayos-env:${environmentId}`,
        audience: connectIssuer(),
        nowEpochSeconds: Math.floor(DateTime.toEpochMillis(DateTime.nowUnsafe()) / 1_000),
      }),
    );
    if (verified.sub !== environmentId) throw new Error("ENVIRONMENT_PROOF_SUBJECT_INVALID");
    const challenge = stringClaim(verified.challenge, "ENVIRONMENT_CHALLENGE_INVALID");
    const descriptor = verified.descriptor;
    if (typeof descriptor !== "object" || descriptor === null) {
      throw new Error("ENVIRONMENT_DESCRIPTOR_INVALID");
    }
    const origin = verified.origin;
    if (typeof origin !== "object" || origin === null)
      throw new Error("ENVIRONMENT_ORIGIN_INVALID");
    const localHttpHost = stringClaim(
      (origin as { localHttpHost?: unknown }).localHttpHost,
      "ENVIRONMENT_ORIGIN_INVALID",
    );
    const localHttpPort = integerClaim(
      (origin as { localHttpPort?: unknown }).localHttpPort,
      "ENVIRONMENT_ORIGIN_INVALID",
    );
    cloudflareOriginService({ localHttpHost, localHttpPort });
    const endpoint = verified.endpoint;
    if (typeof endpoint !== "object" || endpoint === null) {
      throw new Error("ENVIRONMENT_ENDPOINT_INVALID");
    }
    const endpointHttpBaseUrl = stringClaim(
      (endpoint as { httpBaseUrl?: unknown }).httpBaseUrl,
      "ENVIRONMENT_ENDPOINT_INVALID",
    );
    const endpointWsBaseUrl = stringClaim(
      (endpoint as { wsBaseUrl?: unknown }).wsBaseUrl,
      "ENVIRONMENT_ENDPOINT_INVALID",
    );
    const proofJti = stringClaim(verified.jti, "ENVIRONMENT_PROOF_JTI_INVALID");
    const proofIat = integerClaim(verified.iat, "ENVIRONMENT_PROOF_IAT_INVALID");
    const proofExp = integerClaim(verified.exp, "ENVIRONMENT_PROOF_EXP_INVALID");
    const credential = randomToken(48);
    const credentialId = randomToken(16);
    const challengeHash = await sha256(challenge);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const completed = await ctx.runMutation(completeLinkReference, {
      ownerUserId: identity.subject,
      challengeHash,
      environmentId,
      environmentLabel: args.environmentLabel.trim() || environmentId,
      environmentPublicKey,
      localHttpHost,
      localHttpPort,
      endpointHttpBaseUrl,
      endpointWsBaseUrl,
      credentialId,
      credentialHash: await sha256(credential),
      notificationsEnabled: args.notificationsEnabled,
      liveActivitiesEnabled: args.liveActivitiesEnabled,
      createdByDeviceId: args.createdByDeviceId,
      proofJti,
      proofIat,
      proofExpiresAt: DateTime.formatIso(DateTime.makeUnsafe(proofExp * 1_000)),
      now,
    });
    return {
      environmentId,
      cloudUserId: identity.subject,
      tenantId: completed.tenantId,
      environmentCredential: credential,
      cloudMintPublicKey: cloudMintPublicKey(),
      endpoint: {
        httpBaseUrl: endpointHttpBaseUrl,
        wsBaseUrl: endpointWsBaseUrl,
        providerKind: "manual" as const,
      },
      endpointRuntime: null,
      relayIssuer: connectIssuer(),
    };
  },
});

export const completeLink = internalMutationGeneric({
  args: {
    ownerUserId: v.string(),
    challengeHash: v.string(),
    environmentId: v.string(),
    environmentLabel: v.string(),
    environmentPublicKey: v.string(),
    localHttpHost: v.string(),
    localHttpPort: v.number(),
    endpointHttpBaseUrl: v.string(),
    endpointWsBaseUrl: v.string(),
    credentialId: v.string(),
    credentialHash: v.string(),
    notificationsEnabled: v.boolean(),
    liveActivitiesEnabled: v.boolean(),
    createdByDeviceId: v.union(v.null(), v.string()),
    proofJti: v.string(),
    proofIat: v.number(),
    proofExpiresAt: v.string(),
    now: v.string(),
  },
  returns: v.object({ tenantId: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    if (user.clerkUserId !== args.ownerUserId || user.activeTenantId === undefined) {
      throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    }
    const challenge = await ctx.db
      .query("environmentLinkChallenges")
      .withIndex("by_challenge_hash", (query) => query.eq("challengeHash", args.challengeHash))
      .unique();
    if (
      challenge === null ||
      challenge.ownerUserId !== user.clerkUserId ||
      challenge.consumedAt !== null ||
      Date.parse(challenge.expiresAt) <= Date.parse(args.now)
    ) {
      throw new Error("ENVIRONMENT_CHALLENGE_INVALID");
    }
    if ((await membershipByUser(ctx, challenge.tenantId, user.clerkUserId)) === null) {
      throw new Error("TENANT_ACCESS_DENIED");
    }
    const replay = await ctx.db
      .query("dpopProofs")
      .withIndex("by_thumbprint_jti", (query) => query.eq("thumbprint", args.environmentPublicKey))
      .filter((query) => query.eq(query.field("jti"), args.proofJti))
      .unique();
    if (replay !== null) throw new Error("ENVIRONMENT_PROOF_REPLAYED");
    await ctx.db.insert("dpopProofs", {
      thumbprint: args.environmentPublicKey,
      jti: args.proofJti,
      iat: args.proofIat,
      expiresAt: args.proofExpiresAt,
      createdAt: args.now,
    });
    await ctx.db.patch("environmentLinkChallenges", challenge._id, { consumedAt: args.now });

    const existing = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const linkValue = {
      tenantId: challenge.tenantId,
      ownerUserId: user.clerkUserId,
      environmentId: args.environmentId,
      environmentLabel: args.environmentLabel,
      environmentPublicKey: args.environmentPublicKey,
      localOrigin: { localHttpHost: args.localHttpHost, localHttpPort: args.localHttpPort },
      endpoint: {
        httpBaseUrl: args.endpointHttpBaseUrl,
        wsBaseUrl: args.endpointWsBaseUrl,
        providerKind: "manual" as const,
      },
      notificationsEnabled: args.notificationsEnabled,
      liveActivitiesEnabled: args.liveActivitiesEnabled,
      remoteAccessEnabled: false,
      createdByDeviceId: args.createdByDeviceId,
      revokedAt: null,
      updatedAt: args.now,
    };
    if (existing === null) {
      await ctx.db.insert("environmentLinks", { ...linkValue, createdAt: args.now });
    } else if (existing.ownerUserId !== user.clerkUserId) {
      throw new Error("ENVIRONMENT_OWNER_REQUIRED");
    } else {
      await ctx.db.patch("environmentLinks", existing._id, linkValue);
    }
    const existingCredentials = await ctx.db
      .query("environmentCredentials")
      .withIndex("by_environment", (query) => query.eq("environmentId", args.environmentId))
      .collect();
    for (const credential of existingCredentials) {
      if (credential.ownerUserId === user.clerkUserId && credential.revokedAt === null) {
        await ctx.db.patch("environmentCredentials", credential._id, {
          revokedAt: args.now,
          updatedAt: args.now,
        });
      }
    }
    await ctx.db.insert("environmentCredentials", {
      tenantId: challenge.tenantId,
      ownerUserId: user.clerkUserId,
      credentialId: args.credentialId,
      environmentId: args.environmentId,
      environmentPublicKey: args.environmentPublicKey,
      credentialHash: args.credentialHash,
      revokedAt: null,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { tenantId: challenge.tenantId };
  },
});

export const listMine = queryGeneric({
  args: {},
  returns: v.array(linkSummaryValidator),
  handler: async (ctx) => {
    const user = await requireConnectUser(ctx);
    const links = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner", (query) => query.eq("ownerUserId", user.clerkUserId))
      .collect();
    return await Promise.all(
      links
        .filter((link) => link.revokedAt === null)
        .map(async (link) => {
          const request = await ctx.db
            .query("remoteConnectionRequests")
            .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
            .filter((query) => query.eq(query.field("environmentId"), link.environmentId))
            .unique();
          return {
            environmentId: link.environmentId,
            label: link.environmentLabel,
            endpoint: link.endpoint,
            remoteAccessEnabled: link.remoteAccessEnabled,
            remoteAccessStatus: request?.status ?? null,
            remoteAccessError: request?.errorMessage ?? null,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
          };
        }),
    );
  },
});

export const unlink = mutationGeneric({
  args: { environmentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (link === null) return null;
    if (link.remoteAccessEnabled) throw new Error("REMOTE_ACCESS_MUST_BE_DISABLED_FIRST");
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("environmentLinks", link._id, { revokedAt: now, updatedAt: now });
    const credentials = await ctx.db
      .query("environmentCredentials")
      .withIndex("by_environment", (query) => query.eq("environmentId", args.environmentId))
      .collect();
    for (const credential of credentials) {
      if (credential.ownerUserId === user.clerkUserId && credential.revokedAt === null) {
        await ctx.db.patch("environmentCredentials", credential._id, {
          revokedAt: now,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

const remoteEnvironmentValidator = v.object({
  environmentId: v.string(),
  label: v.string(),
  environmentPublicKey: v.string(),
  endpoint: managedEndpointValidator,
  linkedAt: v.string(),
});

export const listRemoteForOwner = internalQueryGeneric({
  args: { ownerUserId: v.string() },
  returns: v.array(remoteEnvironmentValidator),
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner", (query) => query.eq("ownerUserId", args.ownerUserId))
      .collect();
    return links
      .filter(
        (link) =>
          link.revokedAt === null &&
          link.remoteAccessEnabled &&
          link.endpoint.providerKind === "cloudflare_tunnel",
      )
      .map((link) => ({
        environmentId: link.environmentId,
        label: link.environmentLabel,
        environmentPublicKey: link.environmentPublicKey,
        endpoint: link.endpoint,
        linkedAt: link.createdAt,
      }));
  },
});

export const getRemoteForOwner = internalQueryGeneric({
  args: { ownerUserId: v.string(), environmentId: v.string() },
  returns: v.union(v.null(), remoteEnvironmentValidator),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("environmentLinks")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", args.ownerUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (
      link === null ||
      link.revokedAt !== null ||
      !link.remoteAccessEnabled ||
      link.endpoint.providerKind !== "cloudflare_tunnel"
    ) {
      return null;
    }
    return {
      environmentId: link.environmentId,
      label: link.environmentLabel,
      environmentPublicKey: link.environmentPublicKey,
      endpoint: link.endpoint,
      linkedAt: link.createdAt,
    };
  },
});

export const consumeDpopProof = internalMutationGeneric({
  args: {
    thumbprint: v.string(),
    jti: v.string(),
    iat: v.number(),
    expiresAt: v.string(),
    createdAt: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dpopProofs")
      .withIndex("by_thumbprint_jti", (query) => query.eq("thumbprint", args.thumbprint))
      .filter((query) => query.eq(query.field("jti"), args.jti))
      .unique();
    if (existing !== null) return false;
    await ctx.db.insert("dpopProofs", args);
    return true;
  },
});
