import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  DEFAULT_EMAIL_AGENT_ACCESS_POLICY,
  EmailAgentWaitForInput,
  EmailSandboxProjectSource,
  EmailSandboxRuntimeStatus,
} from "./emailSandbox.ts";

const decodeEmailSandboxRuntimeStatus = Schema.decodeUnknownSync(EmailSandboxRuntimeStatus);

describe("email sandbox contracts", () => {
  it("defaults agent access to message bodies and attachments", () => {
    expect(DEFAULT_EMAIL_AGENT_ACCESS_POLICY).toEqual({
      messageBodiesEnabled: true,
      attachmentsEnabled: true,
    });
  });

  it("decodes a running local runtime snapshot", () => {
    expect(
      decodeEmailSandboxRuntimeStatus({
        phase: "running",
        enabled: true,
        mailpitVersion: "v1.30.4",
        pid: 42,
        activeProjectCount: 1,
        pendingMessageCount: 0,
        localBytes: 1024,
        localByteLimit: 1024 * 1024 * 1024,
        lastError: null,
        updatedAt: "2026-07-10T00:00:00.000Z",
      }).phase,
    ).toBe("running");
  });

  it("rejects non-loopback SMTP hosts from project source snapshots", () => {
    const decode = Schema.decodeUnknownSync(EmailSandboxProjectSource);
    expect(() =>
      decode({
        sourceId: "source-1",
        sandboxId: null,
        environmentId: "environment-1",
        projectId: "project-1",
        logicalProjectKey: "github.com/pathway/project",
        displayName: "Project",
        captureEnabled: true,
        agentAccessEnabled: true,
        smtpHost: "0.0.0.0",
        smtpPort: 1025,
        portChanged: false,
        status: "running",
        lastError: null,
        updatedAt: "2026-07-10T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("requires a bounded email wait condition", () => {
    const decode = Schema.decodeUnknownSync(EmailAgentWaitForInput);
    expect(() => decode({ timeoutMs: 1_000 })).toThrow();
    expect(() => decode({ subject: "Welcome", timeoutMs: 60_001 })).toThrow();
    expect(decode({ recipient: "user@example.com", timeoutMs: 60_000 })).toEqual({
      recipient: "user@example.com",
      timeoutMs: 60_000,
    });
  });
});
