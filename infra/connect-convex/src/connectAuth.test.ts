import {
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  SignJWT,
} from "jose";
import { describe, expect, it } from "vite-plus/test";

import { issueDpopAccessToken, verifyConnectAccess } from "./connectAuth.ts";

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}

describe("Convex Connect DPoP auth", () => {
  it("issues an owner token bound to the request proof key", async () => {
    const cloudKeys = await generateKeyPair("EdDSA", { extractable: true });
    const dpopKeys = await generateKeyPair("ES256", { extractable: true });
    const dpopJwk = await exportJWK(dpopKeys.publicKey);
    const thumbprint = await calculateJwkThumbprint(dpopJwk);
    const config = {
      issuer: "https://connect.example.test",
      clerkIssuer: "https://clerk.example.test",
      privateKey: await exportPKCS8(cloudKeys.privateKey),
      publicKey: await exportSPKI(cloudKeys.publicKey),
    };
    const nowEpochSeconds = 1_800_000_000;
    const issued = await issueDpopAccessToken({
      config,
      userId: "user_owner",
      clientId: "pathwayos-web",
      scopes: ["environment:connect"],
      thumbprint,
      nowEpochSeconds,
      jti: "access-jti",
    });
    const url = "https://connect.example.test/v1/environments/env-1/connect";
    const proof = await new SignJWT({
      htm: "POST",
      htu: url,
      ath: await sha256Base64Url(issued.accessToken),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: dpopJwk })
      .setJti("proof-jti")
      .setIssuedAt(nowEpochSeconds)
      .sign(dpopKeys.privateKey);

    const verified = await verifyConnectAccess({
      config,
      accessToken: issued.accessToken,
      dpopProof: proof,
      method: "POST",
      url,
      nowEpochSeconds,
    });
    expect(verified.userId).toBe("user_owner");
    expect(verified.thumbprint).toBe(thumbprint);
    expect(verified.scopes).toEqual(new Set(["environment:connect"]));
  });

  it("rejects a proof replayed against a different route", async () => {
    const cloudKeys = await generateKeyPair("EdDSA", { extractable: true });
    const dpopKeys = await generateKeyPair("ES256", { extractable: true });
    const dpopJwk = await exportJWK(dpopKeys.publicKey);
    const thumbprint = await calculateJwkThumbprint(dpopJwk);
    const config = {
      issuer: "https://connect.example.test",
      clerkIssuer: "https://clerk.example.test",
      privateKey: await exportPKCS8(cloudKeys.privateKey),
      publicKey: await exportSPKI(cloudKeys.publicKey),
    };
    const nowEpochSeconds = 1_800_000_000;
    const issued = await issueDpopAccessToken({
      config,
      userId: "user_owner",
      clientId: "pathwayos-web",
      scopes: ["environment:connect"],
      thumbprint,
      nowEpochSeconds,
      jti: "access-jti",
    });
    const proof = await new SignJWT({
      htm: "POST",
      htu: "https://connect.example.test/v1/environments/env-1/connect",
      ath: await sha256Base64Url(issued.accessToken),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: dpopJwk })
      .setJti("proof-jti")
      .setIssuedAt(nowEpochSeconds)
      .sign(dpopKeys.privateKey);

    await expect(
      verifyConnectAccess({
        config,
        accessToken: issued.accessToken,
        dpopProof: proof,
        method: "POST",
        url: "https://connect.example.test/v1/environments/env-2/connect",
        nowEpochSeconds,
      }),
    ).rejects.toThrow("CONNECT_DPOP_TARGET_INVALID");
  });
});
