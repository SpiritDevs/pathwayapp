import {
  httpActionGeneric,
  httpRouter,
  makeFunctionReference,
  type FunctionReference,
  type GenericActionCtx,
} from "convex/server";
import type { Value } from "convex/values";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { prepareUploadThingUpload } from "../src/uploadThingHttp.ts";
import {
  connectAuthConfig,
  issueDpopAccessToken,
  verifyClerkSubjectToken,
  verifyConnectAccess,
  verifyDpopProof,
} from "../src/connectAuth.ts";
import {
  RELAY_HEALTH_REQUEST_TYP,
  RELAY_HEALTH_RESPONSE_TYP,
  RELAY_MINT_REQUEST_TYP,
  RELAY_MINT_RESPONSE_TYP,
  signRelayJwt,
  verifyRelayJwt,
} from "@pathwayos/shared/relayJwt";
import type { DataModel } from "./authorization.ts";
import {
  requestEnvironmentCredential,
  requestEnvironmentHealth,
} from "../src/environmentTransport.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":
    "authorization,b3,traceparent,content-type,dpop,x-pathway-environment-id,x-pathway-upload-id,x-ut-slug,x-uploadthing-package",
  "access-control-expose-headers": "traceparent,www-authenticate",
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...corsHeaders, ...init.headers },
  });
}

function emptyCorsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = message.includes("SEQUENCE_CONFLICT")
    ? 409
    : message.includes("INVALID") || message.includes("CONTIGUOUS")
      ? 400
      : message.includes("NOT_FOUND")
        ? 404
        : message.includes("CREDENTIAL") || message.includes("ACCESS_DENIED")
          ? 401
          : 500;
  return jsonResponse({ error: message }, { status });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (authorization === null || !authorization.startsWith("Bearer "))
    throw new Error("ENVIRONMENT_CREDENTIAL_REQUIRED");
  const token = authorization.slice("Bearer ".length).trim();
  if (token.length < 32) throw new Error("ENVIRONMENT_CREDENTIAL_INVALID");
  return token;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type InternalRef<Args extends Record<string, Value>, Result extends Value> = FunctionReference<
  "mutation" | "query",
  "internal",
  Args,
  Result
>;

const ingestBatchReference = makeFunctionReference(
  "cloudSync:ingestBatch",
) as unknown as InternalRef<Record<string, Value>, Record<string, Value>>;
const snapshotReference = makeFunctionReference("cloudSync:snapshot") as unknown as InternalRef<
  Record<string, Value>,
  Value
>;
const ingestCaptureReference = makeFunctionReference(
  "email:ingestCaptureBatch",
) as unknown as InternalRef<Record<string, Value>, Record<string, Value>>;
const upsertSourcesReference = makeFunctionReference(
  "email:upsertSourceBatch",
) as unknown as InternalRef<Record<string, Value>, Record<string, Value>>;
const prepareBlobReference = makeFunctionReference("blobUploads:prepare") as unknown as InternalRef<
  Record<string, Value>,
  Record<string, Value>
>;
const commitBlobReference = makeFunctionReference("blobUploads:commit") as unknown as InternalRef<
  Record<string, Value>,
  Record<string, Value>
>;
const listRemoteEnvironmentsReference = makeFunctionReference(
  "environmentLinks:listRemoteForOwner",
) as unknown as FunctionReference<"query", "internal", Record<string, Value>, Value>;
const getRemoteEnvironmentReference = makeFunctionReference(
  "environmentLinks:getRemoteForOwner",
) as unknown as FunctionReference<"query", "internal", Record<string, Value>, Value>;
const consumeDpopProofReference = makeFunctionReference(
  "environmentLinks:consumeDpopProof",
) as unknown as FunctionReference<"mutation", "internal", Record<string, Value>, boolean>;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function relayAuthError(
  reason: "missing_bearer" | "invalid_bearer" | "invalid_dpop" | "not_authorized",
  status = 401,
): Response {
  return jsonResponse(
    { _tag: "RelayAuthInvalidError", code: "auth_invalid", reason, traceId: randomId() },
    { status },
  );
}

function dpopBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("DPoP ")) throw new Error("CONNECT_DPOP_BEARER_REQUIRED");
  return authorization.slice("DPoP ".length).trim();
}

async function consumeDpop(
  ctx: GenericActionCtx<DataModel>,
  proof: { readonly thumbprint: string; readonly jti: string; readonly iat: number },
  now: DateTime.DateTime,
): Promise<void> {
  const consumed = await ctx.runMutation(consumeDpopProofReference, {
    thumbprint: proof.thumbprint,
    jti: proof.jti,
    iat: proof.iat,
    createdAt: DateTime.formatIso(now),
    expiresAt: DateTime.formatIso(DateTime.add(now, { minutes: 5 })),
  });
  if (!consumed) throw new Error("CONNECT_DPOP_REPLAYED");
}

interface RemoteEnvironmentRecord {
  readonly environmentId: string;
  readonly label: string;
  readonly environmentPublicKey: string;
  readonly endpoint: {
    readonly httpBaseUrl: string;
    readonly wsBaseUrl: string;
    readonly providerKind: "cloudflare_tunnel";
  };
  readonly linkedAt: string;
}

function decodeRemoteEnvironment(value: Value): RemoteEnvironmentRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, Value>;
  const endpoint = record.endpoint;
  if (typeof endpoint !== "object" || endpoint === null || Array.isArray(endpoint)) return null;
  const endpointRecord = endpoint as Record<string, Value>;
  if (
    typeof record.environmentId !== "string" ||
    typeof record.label !== "string" ||
    typeof record.environmentPublicKey !== "string" ||
    typeof record.linkedAt !== "string" ||
    typeof endpointRecord.httpBaseUrl !== "string" ||
    typeof endpointRecord.wsBaseUrl !== "string" ||
    endpointRecord.providerKind !== "cloudflare_tunnel"
  ) {
    return null;
  }
  return {
    environmentId: record.environmentId,
    label: record.label,
    environmentPublicKey: record.environmentPublicKey,
    linkedAt: record.linkedAt,
    endpoint: {
      httpBaseUrl: endpointRecord.httpBaseUrl,
      wsBaseUrl: endpointRecord.wsBaseUrl,
      providerKind: "cloudflare_tunnel",
    },
  };
}

function requiredResponseString(value: unknown, error: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(error);
  return value;
}

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpActionGeneric(async () => jsonResponse({ ok: true, service: "connect-convex" })),
});

http.route({
  path: "/v1/environments",
  method: "GET",
  handler: httpActionGeneric(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return relayAuthError("invalid_bearer");
    const result = await ctx.runQuery(listRemoteEnvironmentsReference, {
      ownerUserId: identity.subject,
    });
    const environments = Array.isArray(result)
      ? result
          .map((value) => decodeRemoteEnvironment(value))
          .filter((value) => value !== null)
          .map(({ environmentPublicKey: _environmentPublicKey, ...environment }) => environment)
      : [];
    return jsonResponse({ environments });
  }),
});

http.route({
  path: "/v1/client/dpop-token",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const config = connectAuthConfig(process.env);
      const form = await request.formData();
      const subjectToken = requiredResponseString(
        form.get("subject_token"),
        "CONNECT_SUBJECT_TOKEN_REQUIRED",
      );
      const resource = requiredResponseString(form.get("resource"), "CONNECT_RESOURCE_REQUIRED");
      const clientId = requiredResponseString(form.get("client_id"), "CONNECT_CLIENT_ID_REQUIRED");
      const scopeText = requiredResponseString(form.get("scope"), "CONNECT_SCOPE_REQUIRED");
      if (
        resource.replace(/\/+$/u, "") !== config.issuer ||
        !["pathwayos-web", "pathwayos-mobile"].includes(clientId)
      ) {
        return relayAuthError("not_authorized", 403);
      }
      const scopes = scopeText.split(/\s+/u).filter(Boolean);
      const allowedScopes = new Set([
        "environment:connect",
        "environment:status",
        "mobile:registration",
      ]);
      if (scopes.length === 0 || scopes.some((scope) => !allowedScopes.has(scope))) {
        return relayAuthError("not_authorized", 403);
      }
      const now = DateTime.nowUnsafe();
      const proofValue = request.headers.get("dpop");
      if (!proofValue) return relayAuthError("invalid_dpop");
      const proof = await verifyDpopProof({
        proof: proofValue,
        method: request.method,
        url: request.url,
        nowEpochSeconds: Math.floor(DateTime.toEpochMillis(now) / 1_000),
      });
      await consumeDpop(ctx as unknown as GenericActionCtx<DataModel>, proof, now);
      const userId = await verifyClerkSubjectToken(config, subjectToken);
      const issued = await issueDpopAccessToken({
        config,
        userId,
        clientId,
        scopes,
        thumbprint: proof.thumbprint,
        nowEpochSeconds: Math.floor(DateTime.toEpochMillis(now) / 1_000),
        jti: randomId(),
      });
      return jsonResponse({
        access_token: issued.accessToken,
        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        token_type: "DPoP",
        expires_in: issued.expiresIn,
        scope: scopes.join(" "),
      });
    } catch {
      return relayAuthError("invalid_dpop");
    }
  }),
});

http.route({
  pathPrefix: "/v1/environments/",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const path = new URL(request.url).pathname;
      const match = /^\/v1\/environments\/([^/]+)\/(connect|status)$/u.exec(path);
      if (!match) return jsonResponse({ error: "NOT_FOUND" }, { status: 404 });
      const environmentId = decodeURIComponent(match[1]!);
      const operation = match[2] as "connect" | "status";
      const config = connectAuthConfig(process.env);
      const accessToken = dpopBearerToken(request);
      const dpopProof = request.headers.get("dpop");
      if (!dpopProof) return relayAuthError("invalid_dpop");
      const now = DateTime.nowUnsafe();
      const nowSeconds = Math.floor(DateTime.toEpochMillis(now) / 1_000);
      const access = await verifyConnectAccess({
        config,
        accessToken,
        dpopProof,
        method: request.method,
        url: request.url,
        nowEpochSeconds: nowSeconds,
      });
      const requiredScope = operation === "connect" ? "environment:connect" : "environment:status";
      if (!access.scopes.has(requiredScope)) return relayAuthError("not_authorized", 403);
      await consumeDpop(
        ctx as unknown as GenericActionCtx<DataModel>,
        { thumbprint: access.thumbprint, jti: access.proofJti, iat: access.proofIat },
        now,
      );
      const rawEnvironment = await ctx.runQuery(getRemoteEnvironmentReference, {
        ownerUserId: access.userId,
        environmentId,
      });
      const environment = decodeRemoteEnvironment(rawEnvironment);
      if (environment === null) return relayAuthError("not_authorized", 403);
      const nonce = randomId();
      const expiresAt = DateTime.add(now, { minutes: 2 });
      if (operation === "connect") {
        const body = (await request.json()) as Record<string, unknown>;
        const requestedThumbprint =
          typeof body.clientProofKeyThumbprint === "string"
            ? body.clientProofKeyThumbprint
            : body.clientKeyThumbprint;
        if (requestedThumbprint !== access.thumbprint) return relayAuthError("invalid_dpop");
        const proof = await Effect.runPromise(
          signRelayJwt({
            privateKey: config.privateKey,
            typ: RELAY_MINT_REQUEST_TYP,
            payload: {
              iss: config.issuer,
              aud: `pathwayos-env:${environmentId}`,
              sub: access.userId,
              jti: randomId(),
              iat: nowSeconds,
              exp: Math.floor(DateTime.toEpochMillis(expiresAt) / 1_000),
              environmentId,
              clientProofKeyThumbprint: access.thumbprint,
              cnf: { jkt: access.thumbprint },
              ...(typeof body.deviceId === "string" ? { deviceId: body.deviceId } : {}),
              nonce,
              scope: ["environment:connect"],
            },
          }),
        );
        const response = (await requestEnvironmentCredential(
          environment.endpoint.httpBaseUrl,
          proof,
        )) as Record<string, unknown>;
        const credential = requiredResponseString(
          response.credential,
          "ENVIRONMENT_CREDENTIAL_INVALID",
        );
        const responseExpiresAt = requiredResponseString(
          response.expiresAt,
          "ENVIRONMENT_EXPIRY_INVALID",
        );
        const responseProof = requiredResponseString(response.proof, "ENVIRONMENT_PROOF_INVALID");
        const verified = await Effect.runPromise(
          verifyRelayJwt({
            publicKey: environment.environmentPublicKey,
            token: responseProof,
            typ: RELAY_MINT_RESPONSE_TYP,
            issuer: `pathwayos-env:${environmentId}`,
            audience: config.issuer,
            nowEpochSeconds: nowSeconds,
          }),
        );
        if (
          verified.environmentId !== environmentId ||
          verified.requestNonce !== nonce ||
          verified.clientProofKeyThumbprint !== access.thumbprint ||
          verified.credential !== credential
        ) {
          throw new Error("ENVIRONMENT_MINT_RESPONSE_INVALID");
        }
        return jsonResponse({
          environmentId,
          endpoint: environment.endpoint,
          credential,
          expiresAt: responseExpiresAt,
        });
      }

      const proof = await Effect.runPromise(
        signRelayJwt({
          privateKey: config.privateKey,
          typ: RELAY_HEALTH_REQUEST_TYP,
          payload: {
            iss: config.issuer,
            aud: `pathwayos-env:${environmentId}`,
            sub: access.userId,
            jti: randomId(),
            iat: nowSeconds,
            exp: Math.floor(DateTime.toEpochMillis(expiresAt) / 1_000),
            environmentId,
            nonce,
            scope: ["environment:status"],
          },
        }),
      );
      const response = (await requestEnvironmentHealth(
        environment.endpoint.httpBaseUrl,
        proof,
      )) as Record<string, unknown>;
      const responseProof = requiredResponseString(response.proof, "ENVIRONMENT_PROOF_INVALID");
      const verified = await Effect.runPromise(
        verifyRelayJwt({
          publicKey: environment.environmentPublicKey,
          token: responseProof,
          typ: RELAY_HEALTH_RESPONSE_TYP,
          issuer: `pathwayos-env:${environmentId}`,
          audience: config.issuer,
          nowEpochSeconds: nowSeconds,
        }),
      );
      if (
        verified.environmentId !== environmentId ||
        verified.requestNonce !== nonce ||
        verified.status !== "online"
      ) {
        throw new Error("ENVIRONMENT_HEALTH_RESPONSE_INVALID");
      }
      return jsonResponse({
        environmentId,
        endpoint: environment.endpoint,
        status: "online",
        checkedAt: requiredResponseString(response.checkedAt, "ENVIRONMENT_CHECKED_AT_INVALID"),
        ...(response.descriptor ? { descriptor: response.descriptor } : {}),
      });
    } catch (error) {
      const path = new URL(request.url).pathname;
      const environmentId = decodeURIComponent(path.split("/")[3] ?? "unknown");
      if (path.endsWith("/status")) {
        return jsonResponse({
          environmentId,
          endpoint: {
            httpBaseUrl: "https://unavailable.invalid/",
            wsBaseUrl: "wss://unavailable.invalid/ws",
            providerKind: "cloudflare_tunnel",
          },
          status: "offline",
          checkedAt: DateTime.formatIso(DateTime.nowUnsafe()),
          error: error instanceof Error ? error.message : "Environment status failed.",
        });
      }
      return relayAuthError("not_authorized", 403);
    }
  }),
});

http.route({
  path: "/v1/sync/batches",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const body = (await request.json()) as Record<string, Value>;
      const result = await ctx.runMutation(
        ingestBatchReference as FunctionReference<
          "mutation",
          "internal",
          Record<string, Value>,
          Record<string, Value>
        >,
        {
          ...body,
          credentialHash: await sha256(bearerToken(request)),
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

http.route({
  path: "/v1/sync/snapshot",
  method: "GET",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const environmentId = url.searchParams.get("environmentId");
      if (environmentId === null || environmentId.length === 0)
        throw new Error("ENVIRONMENT_ID_REQUIRED");
      const sinceSequence = Number(url.searchParams.get("sinceSequence") ?? "0");
      if (!Number.isSafeInteger(sinceSequence) || sinceSequence < 0)
        throw new Error("SYNC_SEQUENCE_INVALID");
      const result = await ctx.runQuery(
        snapshotReference as FunctionReference<"query", "internal", Record<string, Value>, Value>,
        {
          credentialHash: await sha256(bearerToken(request)),
          environmentId,
          sinceSequence,
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

http.route({
  path: "/v1/email/captures/batch",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const body = (await request.json()) as Record<string, Value>;
      const result = await ctx.runMutation(
        ingestCaptureReference as FunctionReference<
          "mutation",
          "internal",
          Record<string, Value>,
          Record<string, Value>
        >,
        {
          ...body,
          credentialHash: await sha256(bearerToken(request)),
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

http.route({
  path: "/v1/email/sources/batch",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const body = (await request.json()) as Record<string, Value>;
      const result = await ctx.runMutation(
        upsertSourcesReference as FunctionReference<
          "mutation",
          "internal",
          Record<string, Value>,
          Record<string, Value>
        >,
        {
          ...body,
          credentialHash: await sha256(bearerToken(request)),
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

http.route({
  path: "/v1/blobs/prepare",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      if (!process.env.UPLOADTHING_TOKEN)
        return jsonResponse({ error: "UPLOADTHING_NOT_CONFIGURED" }, { status: 503 });
      const body = (await request.json()) as Record<string, Value>;
      const result = await ctx.runMutation(
        prepareBlobReference as FunctionReference<
          "mutation",
          "internal",
          Record<string, Value>,
          Record<string, Value>
        >,
        {
          ...body,
          credentialHash: await sha256(bearerToken(request)),
        },
      );
      const prepared = await prepareUploadThingUpload({
        token: process.env.UPLOADTHING_TOKEN,
        uploadId: String(result.uploadId),
        customId: String(result.customId),
        filename: String(body.filename),
        contentType: String(body.contentType),
        sizeBytes: Number(body.sizeBytes),
        now: DateTime.toEpochMillis(DateTime.nowUnsafe()),
      });
      return jsonResponse({ ...result, ...prepared });
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

http.route({
  path: "/v1/blobs/commit",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    try {
      const body = (await request.json()) as Record<string, Value>;
      const result = await ctx.runMutation(
        commitBlobReference as FunctionReference<
          "mutation",
          "internal",
          Record<string, Value>,
          Record<string, Value>
        >,
        {
          ...body,
          credentialHash: await sha256(bearerToken(request)),
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  }),
});

for (const path of [
  "/health",
  "/v1/environments",
  "/v1/client/dpop-token",
  "/v1/sync/batches",
  "/v1/sync/snapshot",
  "/v1/email/captures/batch",
  "/v1/email/sources/batch",
  "/v1/blobs/prepare",
  "/v1/blobs/commit",
] as const) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpActionGeneric(async () => emptyCorsResponse()),
  });
}

http.route({
  pathPrefix: "/v1/environments/",
  method: "OPTIONS",
  handler: httpActionGeneric(async () => emptyCorsResponse()),
});

export default http;
