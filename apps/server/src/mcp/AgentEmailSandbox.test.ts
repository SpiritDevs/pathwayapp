import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EmailMessageId,
  EmailSandboxError,
  EmailSandboxId,
  EmailSandboxSourceId,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type EmailMessageDetail,
  type EmailMessageSummary,
  type EmailSandboxProjectSource,
} from "@pathwayos/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import * as EmailSandboxCoordinator from "../emailSandbox/EmailSandboxCoordinator.ts";
import type { EmailAgentAuditRecord } from "../emailSandbox/EmailSandboxStore.ts";
import * as AgentEmailSandbox from "./AgentEmailSandbox.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";

const environmentId = EnvironmentId.make("environment-email-agent");
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const threadId = ThreadId.make("thread-email-agent");

const scope: McpInvocationScope = {
  environmentId,
  threadId,
  providerSessionId: "provider-session-email-agent",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["email"]),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const sourceFor = (projectId: ProjectId, agentAccessEnabled = true): EmailSandboxProjectSource => ({
  sourceId: EmailSandboxSourceId.make(`source-${projectId}`),
  sandboxId: EmailSandboxId.make(`sandbox-${projectId}`),
  environmentId,
  projectId,
  logicalProjectKey: `repo/${projectId}`,
  displayName: projectId,
  captureEnabled: true,
  agentAccessEnabled,
  smtpHost: "127.0.0.1",
  smtpPort: 11_025,
  portChanged: false,
  status: "running",
  lastError: null,
  updatedAt: "2026-07-10T00:00:00.000Z",
});

const summaryFor = (
  messageId: string,
  projectId: ProjectId,
  subject: string,
  recipient = "user@example.com",
): EmailMessageSummary => ({
  messageId: EmailMessageId.make(messageId),
  sandboxId: EmailSandboxId.make(`sandbox-${projectId}`),
  sourceId: EmailSandboxSourceId.make(`source-${projectId}`),
  projectId,
  from: [{ name: "Sender", address: "sender@example.com" }],
  to: [{ name: "User", address: recipient }],
  subject,
  receivedAt: "2026-07-10T00:00:00.000Z",
  readAt: null,
  attachmentCount: 0,
  hasHtml: false,
  hasText: true,
  syncState: "local",
});

const detailFor = (summary: EmailMessageSummary): EmailMessageDetail => ({
  summary,
  cc: [],
  bcc: [],
  replyTo: [],
  text: `Body for ${summary.subject}`,
  html: null,
  textTruncated: false,
  htmlTruncated: false,
  rawMimeStatus: "pending",
  attachments: [],
});

const runtimeStatus = {
  phase: "running" as const,
  enabled: true,
  mailpitVersion: "v1.30.4",
  pid: 42,
  activeProjectCount: 1,
  pendingMessageCount: 0,
  localBytes: 0,
  localByteLimit: 1024,
  lastError: null,
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const makeBroker = (options: {
  readonly messages?: ReadonlyArray<EmailMessageSummary>;
  readonly sourceAccess?: boolean;
  readonly resolvedProject?: ProjectId | null | undefined;
  readonly listFailure?: boolean;
}) => {
  const messages = options.messages ?? [];
  const details = new Map(messages.map((message) => [message.messageId, detailFor(message)]));
  const audits: Array<EmailAgentAuditRecord> = [];
  const resolvedProject = "resolvedProject" in options ? options.resolvedProject : projectA;
  const source = sourceFor(projectA, options.sourceAccess ?? true);
  const coordinator: EmailSandboxCoordinator.EmailSandboxCoordinatorShape = {
    status: Effect.succeed(runtimeStatus),
    reconcile: Effect.succeed(runtimeStatus),
    listProjectSources: (projectId) =>
      Effect.succeed(projectId === undefined || projectId === source.projectId ? [source] : []),
    setProjectCapture: () => Effect.die("unused"),
    clearLocalCache: () => Effect.die("unused"),
    listMessages: () =>
      options.listFailure
        ? Effect.fail(
            new EmailSandboxError({
              operation: "list-messages",
              reason: "persistence-failed",
              message: "database unavailable",
            }),
          )
        : Effect.succeed({ messages, nextCursor: null }),
    getMessage: (messageId) => {
      const detail = details.get(messageId);
      return detail
        ? Effect.succeed(detail)
        : Effect.fail(
            new EmailSandboxError({
              operation: "get-message",
              reason: "not-found",
              message: "missing",
            }),
          );
    },
    markRead: () => Effect.die("unused"),
    deleteMessage: () => Effect.die("unused"),
    getAttachment: () => Effect.die("unused"),
    appendAgentAudit: (record) => Effect.sync(() => void audits.push(record)),
  };
  const resolver = AgentEmailSandbox.McpThreadProjectResolver.of({
    resolve: () => Effect.succeed(resolvedProject),
  });
  return {
    audits,
    effect: AgentEmailSandbox.make.pipe(
      Effect.provideService(EmailSandboxCoordinator.EmailSandboxCoordinator, coordinator),
      Effect.provideService(AgentEmailSandbox.McpThreadProjectResolver, resolver),
      Effect.provide(NodeServices.layer),
    ),
  };
};

it.effect("enforces the per-project agent access switch and audits denials", () =>
  Effect.gen(function* () {
    const harness = makeBroker({ sourceAccess: false });
    const broker = yield* harness.effect;
    const error = yield* broker.list(scope, {}).pipe(Effect.flip);
    expect(error._tag).toBe("EmailAgentAccessError");
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({ tool: "email_list", outcome: "denied" });
  }),
);

it.effect("scopes list and get to the invoking thread's project", () =>
  Effect.gen(function* () {
    const own = summaryFor("message-own", projectA, "Welcome");
    const foreign = summaryFor("message-foreign", projectB, "Secret");
    const harness = makeBroker({ messages: [foreign, own] });
    const broker = yield* harness.effect;

    const listed = yield* broker.list(scope, {});
    expect(listed.messages.map((message) => message.messageId)).toEqual([own.messageId]);

    const foreignError = yield* broker.get(scope, foreign.messageId).pipe(Effect.flip);
    expect(foreignError).toMatchObject({
      _tag: "EmailAgentAccessError",
      reason: "message-not-found",
    });
    expect(harness.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: "email_list", outcome: "success", resultCount: 1 }),
        expect.objectContaining({
          tool: "email_get",
          outcome: "not_found",
          messageId: foreign.messageId,
        }),
      ]),
    );
  }),
);

it.effect("filters recipient and subject without recording their values in audit", () =>
  Effect.gen(function* () {
    const match = summaryFor("message-match", projectA, "Your verification code", "qa@example.com");
    const harness = makeBroker({ messages: [match] });
    const broker = yield* harness.effect;
    const result = yield* broker.list(scope, {
      subject: "verification",
      recipient: "qa@",
    });
    expect(result.messages).toHaveLength(1);
    expect(harness.audits[0]?.filterSummary).toBe(
      '{"subject":true,"recipient":true,"receivedAfter":false,"unreadOnly":false}',
    );
    expect(harness.audits[0]?.filterSummary).not.toContain("verification");
    expect(harness.audits[0]?.filterSummary).not.toContain("qa@");
  }),
);

it.effect("waits for a scoped match and returns a bounded timeout", () =>
  Effect.gen(function* () {
    const match = summaryFor("message-wait", projectA, "Receipt ready");
    const matchedHarness = makeBroker({ messages: [match] });
    const matchedBroker = yield* matchedHarness.effect;
    const detail = yield* matchedBroker.waitFor(scope, { subject: "receipt", timeoutMs: 100 });
    expect(detail.summary.messageId).toBe(match.messageId);
    expect(matchedHarness.audits[0]).toMatchObject({
      tool: "email_wait_for",
      outcome: "success",
    });

    const timeoutHarness = makeBroker({ messages: [] });
    const timeoutBroker = yield* timeoutHarness.effect;
    const timeoutFiber = yield* timeoutBroker
      .waitFor(scope, { subject: "never", timeoutMs: 100 })
      .pipe(Effect.flip, Effect.forkChild);
    yield* Effect.yieldNow;
    yield* TestClock.adjust("100 millis");
    const timeout = yield* Fiber.join(timeoutFiber);
    expect(timeout).toMatchObject({ _tag: "EmailAgentAccessError", reason: "timeout" });
    expect(timeoutHarness.audits[0]).toMatchObject({
      tool: "email_wait_for",
      outcome: "timeout",
    });
  }),
);

it.effect("denies missing and unassigned invocation thread identities", () =>
  Effect.gen(function* () {
    for (const resolvedProject of [undefined, null] as const) {
      const harness = makeBroker({ resolvedProject });
      const broker = yield* harness.effect;
      const error = yield* broker.status(scope).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "EmailAgentAccessError",
        reason: resolvedProject === undefined ? "thread-not-found" : "thread-has-no-project",
      });
      expect(harness.audits).toHaveLength(0);
    }
  }),
);

it.effect("audits authorized failures without masking the original error", () =>
  Effect.gen(function* () {
    const harness = makeBroker({ listFailure: true });
    const broker = yield* harness.effect;
    const error = yield* broker.list(scope, {}).pipe(Effect.flip);
    expect(error).toMatchObject({
      _tag: "EmailSandboxError",
      operation: "list-messages",
      reason: "persistence-failed",
    });
    expect(harness.audits).toEqual([
      expect.objectContaining({ tool: "email_list", outcome: "error" }),
    ]);
  }),
);
