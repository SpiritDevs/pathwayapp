import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { CloudBlobUploadPrepareInput } from "./cloudSync.ts";

const decodeCloudBlobUploadPrepareInput = Schema.decodeUnknownSync(CloudBlobUploadPrepareInput);

describe("cloud sync contracts", () => {
  it("accepts private blob upload preparation metadata", () => {
    const decoded = decodeCloudBlobUploadPrepareInput({
      environmentId: "environment-1",
      blobKind: "email-raw-mime",
      resourceId: "message-1",
      partId: "raw",
      filename: "message.eml",
      contentType: "message/rfc822",
      sizeBytes: 1024,
      sha256: "abc123",
    });

    expect(decoded.blobKind).toBe("email-raw-mime");
  });

  it("rejects negative file sizes", () => {
    expect(() =>
      decodeCloudBlobUploadPrepareInput({
        environmentId: "environment-1",
        blobKind: "email-attachment",
        resourceId: "message-1",
        partId: "attachment-1",
        filename: "file.pdf",
        contentType: "application/pdf",
        sizeBytes: -1,
        sha256: "abc123",
      }),
    ).toThrow();
  });
});
