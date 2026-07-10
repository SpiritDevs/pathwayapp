import { EmailCaptureId } from "@pathwayos/contracts";
import { describe, expect, it } from "vite-plus/test";

import { partitionCaptureAcknowledgements } from "./EmailSandboxSyncWorker.ts";

describe("EmailSandboxSyncWorker", () => {
  it("treats accepted and idempotent duplicate captures as durably synced", () => {
    const first = EmailCaptureId.make("capture-1");
    const second = EmailCaptureId.make("capture-2");
    const third = EmailCaptureId.make("capture-3");

    expect(
      partitionCaptureAcknowledgements([first, second, third], {
        acceptedCaptureIds: [first],
        duplicateCaptureIds: [second],
      }),
    ).toEqual({ synced: [first, second], rejected: [third] });
  });
});
