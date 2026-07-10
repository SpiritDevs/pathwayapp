import {
  base64url,
  calculateJwkThumbprint,
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
} from "jose";
import * as DateTime from "effect/DateTime";

const ACCESS_TOKEN_TYP = "pathwayos-connect-access+jwt";
const DPOP_TYP = "dpop+jwt";
const ACCESS_TOKEN_LIFETIME_SECONDS = 5 * 60;

function normalizePem(value: string): string {
  return value.replaceAll("\\n", "\n").trim();
}

function requiredString(value: unknown, error: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(error);
  return value;
}

function requiredInteger(value: unknown, error: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(error);
  return value;
}

function normalizeIssuer(value: string): string {
  return new URL(value).origin;
}

export interface ConnectAuthConfig {
  readonly issuer: string;
  readonly clerkIssuer: string;
  readonly clerkAudience?: string;
  readonly privateKey: string;
  readonly publicKey: string;
}

export function connectAuthConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ConnectAuthConfig {
  const issuer = environment.PATHWAYOS_CONNECT_URL ?? environment.CONVEX_URL;
  const clerkIssuer = environment.CLERK_JWT_ISSUER_DOMAIN;
  const privateKey = environment.PATHWAYOS_CLOUD_MINT_PRIVATE_KEY;
  const publicKey = environment.PATHWAYOS_CLOUD_MINT_PUBLIC_KEY;
  if (!issuer || !clerkIssuer || !privateKey || !publicKey) {
    throw new Error("CONNECT_AUTH_NOT_CONFIGURED");
  }
  return {
    issuer: normalizeIssuer(issuer),
    clerkIssuer: normalizeIssuer(clerkIssuer),
    ...(environment.CLERK_JWT_AUDIENCE ? { clerkAudience: environment.CLERK_JWT_AUDIENCE } : {}),
    privateKey: normalizePem(privateKey),
    publicKey: normalizePem(publicKey),
  };
}

export async function verifyClerkSubjectToken(
  config: ConnectAuthConfig,
  token: string,
): Promise<string> {
  const jwks = createRemoteJWKSet(new URL(`${config.clerkIssuer}/.well-known/jwks.json`));
  const verified = await jwtVerify(token, jwks, {
    issuer: config.clerkIssuer,
    ...(config.clerkAudience ? { audience: config.clerkAudience } : {}),
  });
  return requiredString(verified.payload.sub, "CONNECT_CLERK_SUBJECT_INVALID");
}

export interface VerifiedDpopProof {
  readonly thumbprint: string;
  readonly jti: string;
  readonly iat: number;
}

export async function verifyDpopProof(input: {
  readonly proof: string;
  readonly method: string;
  readonly url: string;
  readonly nowEpochSeconds: number;
  readonly accessToken?: string;
}): Promise<VerifiedDpopProof> {
  const header = decodeProtectedHeader(input.proof);
  if (header.typ?.toLowerCase() !== DPOP_TYP || header.alg !== "ES256" || !header.jwk) {
    throw new Error("CONNECT_DPOP_HEADER_INVALID");
  }
  const publicJwk = header.jwk as JWK;
  if ("d" in publicJwk) throw new Error("CONNECT_DPOP_PRIVATE_KEY_REJECTED");
  const key = await importJWK(publicJwk, "ES256");
  const verified = await jwtVerify(input.proof, key, {
    algorithms: ["ES256"],
    typ: DPOP_TYP,
    clockTolerance: 60,
    currentDate: DateTime.toDate(DateTime.makeUnsafe(input.nowEpochSeconds * 1_000)),
  });
  if (verified.payload.htm !== input.method.toUpperCase() || verified.payload.htu !== input.url) {
    throw new Error("CONNECT_DPOP_TARGET_INVALID");
  }
  if (input.accessToken) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input.accessToken),
    );
    if (verified.payload.ath !== base64url.encode(new Uint8Array(digest))) {
      throw new Error("CONNECT_DPOP_ACCESS_TOKEN_HASH_INVALID");
    }
  }
  return {
    thumbprint: await calculateJwkThumbprint(publicJwk, "sha256"),
    jti: requiredString(verified.payload.jti, "CONNECT_DPOP_JTI_INVALID"),
    iat: requiredInteger(verified.payload.iat, "CONNECT_DPOP_IAT_INVALID"),
  };
}

export async function issueDpopAccessToken(input: {
  readonly config: ConnectAuthConfig;
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly thumbprint: string;
  readonly nowEpochSeconds: number;
  readonly jti: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const key = await importPKCS8(input.config.privateKey, "EdDSA");
  const accessToken = await new SignJWT({
    scope: input.scopes.join(" "),
    client_id: input.clientId,
    cnf: { jkt: input.thumbprint },
  })
    .setProtectedHeader({ alg: "EdDSA", typ: ACCESS_TOKEN_TYP })
    .setIssuer(input.config.issuer)
    .setAudience(input.config.issuer)
    .setSubject(input.userId)
    .setJti(input.jti)
    .setIssuedAt(input.nowEpochSeconds)
    .setExpirationTime(input.nowEpochSeconds + ACCESS_TOKEN_LIFETIME_SECONDS)
    .sign(key);
  return { accessToken, expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS };
}

export interface VerifiedConnectAccess {
  readonly userId: string;
  readonly scopes: ReadonlySet<string>;
  readonly thumbprint: string;
  readonly proofJti: string;
  readonly proofIat: number;
}

export async function verifyConnectAccess(input: {
  readonly config: ConnectAuthConfig;
  readonly accessToken: string;
  readonly dpopProof: string;
  readonly method: string;
  readonly url: string;
  readonly nowEpochSeconds: number;
}): Promise<VerifiedConnectAccess> {
  const key = await importSPKI(input.config.publicKey, "EdDSA");
  const token = await jwtVerify(input.accessToken, key, {
    algorithms: ["EdDSA"],
    typ: ACCESS_TOKEN_TYP,
    issuer: input.config.issuer,
    audience: input.config.issuer,
    clockTolerance: 60,
    currentDate: DateTime.toDate(DateTime.makeUnsafe(input.nowEpochSeconds * 1_000)),
  });
  const cnf = token.payload.cnf;
  if (typeof cnf !== "object" || cnf === null || !("jkt" in cnf)) {
    throw new Error("CONNECT_ACCESS_TOKEN_BINDING_INVALID");
  }
  const proof = await verifyDpopProof({
    proof: input.dpopProof,
    method: input.method,
    url: input.url,
    nowEpochSeconds: input.nowEpochSeconds,
    accessToken: input.accessToken,
  });
  if (proof.thumbprint !== cnf.jkt) throw new Error("CONNECT_DPOP_BINDING_INVALID");
  const scope = requiredString(token.payload.scope, "CONNECT_ACCESS_SCOPE_INVALID");
  return {
    userId: requiredString(token.payload.sub, "CONNECT_ACCESS_SUBJECT_INVALID"),
    scopes: new Set(scope.split(/\s+/u).filter(Boolean)),
    thumbprint: proof.thumbprint,
    proofJti: proof.jti,
    proofIat: proof.iat,
  };
}

export function decodeAccessTokenSubject(token: string): string {
  return requiredString((decodeJwt(token) as JWTPayload).sub, "CONNECT_ACCESS_SUBJECT_INVALID");
}
