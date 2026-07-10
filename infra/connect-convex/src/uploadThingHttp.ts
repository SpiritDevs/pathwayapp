import Sqids, { defaultOptions } from "sqids";

export interface UploadThingTokenPayload {
  readonly apiKey: string;
  readonly appId: string;
  readonly regions: ReadonlyArray<string>;
  readonly ingestHost: string;
}

function decodeBase64(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function parseUploadThingToken(token: string): UploadThingTokenPayload {
  const parsed = JSON.parse(decodeBase64(token)) as Partial<UploadThingTokenPayload>;
  if (
    typeof parsed.apiKey !== "string" ||
    !parsed.apiKey.startsWith("sk_") ||
    typeof parsed.appId !== "string" ||
    parsed.appId.length === 0 ||
    !Array.isArray(parsed.regions) ||
    parsed.regions.length === 0 ||
    parsed.regions.some((region) => typeof region !== "string" || region.length === 0)
  ) {
    throw new Error("UPLOADTHING_TOKEN_INVALID");
  }
  return {
    apiKey: parsed.apiKey,
    appId: parsed.appId,
    regions: parsed.regions,
    ingestHost: parsed.ingestHost || "ingest.uploadthing.com",
  };
}

function optimizeHash(value: number): number {
  return (value & 0xbfffffff) | ((value >>> 1) & 0x40000000);
}

function hashString(value: string): number {
  let hash = 5381;
  let index = value.length;
  while (index > 0) {
    hash = (hash * 33) ^ value.charCodeAt(--index);
  }
  return optimizeHash(hash);
}

function shuffle(value: string, seed: string): string {
  const characters = value.split("");
  const seedNumber = hashString(seed);
  for (let index = 0; index < characters.length; index += 1) {
    const swapIndex = ((seedNumber % (index + 1)) + index) % characters.length;
    const current = characters[index]!;
    characters[index] = characters[swapIndex]!;
    characters[swapIndex] = current;
  }
  return characters.join("");
}

function uploadThingKey(input: {
  readonly appId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly lastModified: number;
  readonly nonce: string;
}): string {
  const alphabet = shuffle(defaultOptions.alphabet, input.appId);
  const fileSeed = JSON.stringify([
    input.filename,
    input.sizeBytes,
    input.contentType,
    input.lastModified,
    input.nonce,
  ]);
  const encodedFileSeed = new Sqids({ alphabet, minLength: 36 }).encode([
    Math.abs(hashString(fileSeed)),
  ]);
  const encodedAppId = new Sqids({ alphabet, minLength: 12 }).encode([
    Math.abs(hashString(input.appId)),
  ]);
  return encodedAppId + encodedFileSeed;
}

async function signUrl(
  inputUrl: string,
  apiKey: string,
  expiresAt: number,
  data: Readonly<Record<string, string | number | null>> = {},
): Promise<string> {
  const url = new URL(inputUrl);
  url.searchParams.append("expires", expiresAt.toString());
  for (const [key, value] of Object.entries(data)) {
    if (value === null) continue;
    url.searchParams.append(key, encodeURIComponent(String(value)));
  }
  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    new TextEncoder().encode(url.toString()),
  );
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  url.searchParams.append("signature", `hmac-sha256=${hex}`);
  return url.href;
}

export async function prepareUploadThingUpload(input: {
  readonly token: string;
  readonly uploadId: string;
  readonly customId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly now: number;
}): Promise<{ readonly uploadUrl: string; readonly uploadThingKey: string }> {
  const token = parseUploadThingToken(input.token);
  const key = uploadThingKey({
    appId: token.appId,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    contentType: input.contentType,
    lastModified: input.now,
    nonce: input.uploadId,
  });
  const ingestUrl = `https://${token.regions[0]}.${token.ingestHost}/${key}`;
  return {
    uploadThingKey: key,
    uploadUrl: await signUrl(ingestUrl, token.apiKey, input.now + 15 * 60 * 1_000, {
      "x-ut-identifier": token.appId,
      "x-ut-file-name": input.filename,
      "x-ut-file-size": input.sizeBytes,
      "x-ut-file-type": input.contentType,
      "x-ut-custom-id": input.customId,
      "x-ut-content-disposition": "attachment",
      "x-ut-acl": "private",
    }),
  };
}

export async function generateUploadThingDownloadUrl(input: {
  readonly token: string;
  readonly uploadThingKey: string;
  readonly now: number;
  readonly expiresInSeconds: number;
}): Promise<string> {
  const token = parseUploadThingToken(input.token);
  return signUrl(
    `https://${token.appId}.ufs.sh/f/${input.uploadThingKey}`,
    token.apiKey,
    input.now + input.expiresInSeconds * 1_000,
  );
}
