import { describe, expect, it } from "vite-plus/test";

import {
  generateUploadThingDownloadUrl,
  parseUploadThingToken,
  prepareUploadThingUpload,
} from "./uploadThingHttp.ts";

const token = Buffer.from(
  JSON.stringify({
    apiKey: "sk_test_secret",
    appId: "test-app",
    regions: ["sea1"],
  }),
).toString("base64");

describe("UploadThing HTTP boundary", () => {
  it("parses the server token without exposing it in generated URLs", async () => {
    expect(parseUploadThingToken(token)).toMatchObject({
      appId: "test-app",
      regions: ["sea1"],
      ingestHost: "ingest.uploadthing.com",
    });

    const prepared = await prepareUploadThingUpload({
      token,
      uploadId: "upload-1",
      customId: "user/email-attachment/upload-1",
      filename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      now: 1_700_000_000_000,
    });
    const url = new URL(prepared.uploadUrl);
    expect(url.origin).toBe("https://sea1.ingest.uploadthing.com");
    expect(url.searchParams.get("x-ut-acl")).toBe("private");
    expect(url.searchParams.get("signature")).toMatch(/^hmac-sha256=[a-f0-9]{64}$/u);
    expect(prepared.uploadUrl).not.toContain("sk_test_secret");
  });

  it("generates a short-lived private download URL", async () => {
    const url = new URL(
      await generateUploadThingDownloadUrl({
        token,
        uploadThingKey: "file-key",
        now: 1_700_000_000_000,
        expiresInSeconds: 300,
      }),
    );
    expect(url.origin).toBe("https://test-app.ufs.sh");
    expect(url.searchParams.get("expires")).toBe("1700000300000");
    expect(url.searchParams.get("signature")).toMatch(/^hmac-sha256=[a-f0-9]{64}$/u);
  });
});
