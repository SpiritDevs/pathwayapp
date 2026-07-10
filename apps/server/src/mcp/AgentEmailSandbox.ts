import {
  EmailAgentAccessError,
  type EmailAgentListInput,
  type EmailAgentSandboxStatus,
  type EmailAgentToolName,
  type EmailAgentWaitForInput,
  type EmailMessageDetail,
  type EmailMessageListResult,
  type EmailMessageSummary,
  ProjectId,
  type ThreadId,
} from "@pathwayos/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as EmailSandboxCoordinator from "../emailSandbox/EmailSandboxCoordinator.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";

export interface McpThreadProjectResolverShape {
  readonly resolve: (
    threadId: ThreadId,
  ) => Effect.Effect<ProjectId | null | undefined, McpThreadProjectResolutionError>;
}

export class McpThreadProjectResolutionError extends Schema.TaggedErrorClass<McpThreadProjectResolutionError>()(
  "McpThreadProjectResolutionError",
  { cause: Schema.Defect() },
) {}

export class McpThreadProjectResolver extends Context.Service<
  McpThreadProjectResolver,
  McpThreadProjectResolverShape
>()("pathwayos/mcp/AgentEmailSandbox/McpThreadProjectResolver") {}

export const McpThreadProjectResolverProjectionLive = Layer.effect(
  McpThreadProjectResolver,
  Effect.gen(function* () {
    const query = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
    return McpThreadProjectResolver.of({
      resolve: Effect.fn("McpThreadProjectResolver.resolve")(
        function* (threadId) {
          const thread = yield* query.getThreadShellById(threadId);
          return Option.match(thread, {
            onNone: () => undefined,
            onSome: (value) => value.projectId,
          });
        },
        Effect.mapError((cause) => new McpThreadProjectResolutionError({ cause })),
      ),
    });
  }),
);

export interface AgentEmailSandboxShape {
  readonly status: (
    scope: McpInvocationScope,
  ) => Effect.Effect<EmailAgentSandboxStatus, import("@pathwayos/contracts").EmailAgentToolError>;
  readonly list: (
    scope: McpInvocationScope,
    input: EmailAgentListInput,
  ) => Effect.Effect<EmailMessageListResult, import("@pathwayos/contracts").EmailAgentToolError>;
  readonly get: (
    scope: McpInvocationScope,
    messageId: import("@pathwayos/contracts").EmailMessageId,
  ) => Effect.Effect<EmailMessageDetail, import("@pathwayos/contracts").EmailAgentToolError>;
  readonly waitFor: (
    scope: McpInvocationScope,
    input: EmailAgentWaitForInput,
  ) => Effect.Effect<EmailMessageDetail, import("@pathwayos/contracts").EmailAgentToolError>;
}

export class AgentEmailSandbox extends Context.Service<AgentEmailSandbox, AgentEmailSandboxShape>()(
  "pathwayos/mcp/AgentEmailSandbox",
) {}

type AuditOutcome = "success" | "denied" | "not_found" | "timeout" | "error";

const recipientMatches = (message: EmailMessageSummary, recipient: string): boolean => {
  const needle = recipient.toLocaleLowerCase();
  return message.to.some((address) =>
    `${address.name ?? ""} ${address.address}`.toLocaleLowerCase().includes(needle),
  );
};

export const messageMatches = (
  message: EmailMessageSummary,
  input: Pick<EmailAgentListInput, "subject" | "recipient" | "receivedAfter">,
): boolean =>
  (input.subject === undefined ||
    message.subject.toLocaleLowerCase().includes(input.subject.toLocaleLowerCase())) &&
  (input.recipient === undefined || recipientMatches(message, input.recipient)) &&
  (input.receivedAfter === undefined || message.receivedAt > input.receivedAfter);

const filterSummary = (
  input: Pick<EmailAgentListInput, "subject" | "recipient" | "receivedAfter" | "unreadOnly">,
): string =>
  JSON.stringify({
    subject: input.subject !== undefined,
    recipient: input.recipient !== undefined,
    receivedAfter: input.receivedAfter !== undefined,
    unreadOnly: input.unreadOnly === true,
  });

export const make = Effect.gen(function* () {
  const coordinator = yield* EmailSandboxCoordinator.EmailSandboxCoordinator;
  const threadProjects = yield* McpThreadProjectResolver;
  const crypto = yield* Crypto.Crypto;

  const accessError = (
    scope: McpInvocationScope,
    operation: EmailAgentToolName,
    reason: EmailAgentAccessError["reason"],
    message: string,
  ) =>
    new EmailAgentAccessError({
      operation,
      reason,
      environmentId: scope.environmentId,
      threadId: scope.threadId,
      providerSessionId: scope.providerSessionId,
      providerInstanceId: scope.providerInstanceId,
      message,
    });

  const appendAudit = Effect.fn("AgentEmailSandbox.appendAudit")(function* (input: {
    readonly scope: McpInvocationScope;
    readonly projectId: ProjectId;
    readonly tool: EmailAgentToolName;
    readonly outcome: AuditOutcome;
    readonly messageId?: string;
    readonly resultCount?: number;
    readonly filterSummary?: string;
  }) {
    yield* coordinator.appendAgentAudit({
      auditId: yield* crypto.randomUUIDv4.pipe(Effect.orDie),
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      environmentId: input.scope.environmentId,
      projectId: input.projectId,
      threadId: input.scope.threadId,
      providerSessionId: input.scope.providerSessionId,
      providerInstanceId: input.scope.providerInstanceId,
      tool: input.tool,
      outcome: input.outcome,
      messageId: input.messageId ?? null,
      resultCount: input.resultCount ?? 0,
      filterSummary: input.filterSummary ?? null,
    });
  });

  const appendAuditBestEffort = (input: Parameters<typeof appendAudit>[0]) =>
    appendAudit(input).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("Failed to persist email agent access audit", {
          tool: input.tool,
          outcome: input.outcome,
          projectId: input.projectId,
          cause,
        }),
      ),
    );

  const authorize = Effect.fn("AgentEmailSandbox.authorize")(function* (
    scope: McpInvocationScope,
    operation: EmailAgentToolName,
  ) {
    const resolved = yield* threadProjects
      .resolve(scope.threadId)
      .pipe(
        Effect.mapError(() =>
          accessError(
            scope,
            operation,
            "persistence-failed",
            "The thread project identity could not be resolved.",
          ),
        ),
      );
    if (resolved === undefined) {
      return yield* accessError(
        scope,
        operation,
        "thread-not-found",
        "The invoking thread no longer exists.",
      );
    }
    if (resolved === null) {
      return yield* accessError(
        scope,
        operation,
        "thread-has-no-project",
        "The invoking thread is not assigned to a project.",
      );
    }

    const deny = (reason: EmailAgentAccessError["reason"], message: string) =>
      appendAuditBestEffort({
        scope,
        projectId: resolved,
        tool: operation,
        outcome: "denied",
      }).pipe(Effect.andThen(accessError(scope, operation, reason, message)));

    const sources = yield* coordinator.listProjectSources(resolved).pipe(
      Effect.tapError(() =>
        appendAuditBestEffort({
          scope,
          projectId: resolved,
          tool: operation,
          outcome: "error",
        }),
      ),
    );
    const source = sources.find(
      (candidate) =>
        candidate.projectId === resolved && candidate.environmentId === scope.environmentId,
    );
    if (!source) {
      return yield* deny(
        "project-source-not-found",
        "This thread's project does not have an email sandbox source on this environment.",
      );
    }
    if (!source.agentAccessEnabled) {
      return yield* deny(
        "project-access-disabled",
        "Agent access is disabled for this project's email sandbox source.",
      );
    }
    return { projectId: resolved, source };
  });

  const status: AgentEmailSandboxShape["status"] = Effect.fn("AgentEmailSandbox.status")(
    function* (scope) {
      const { projectId, source } = yield* authorize(scope, "email_sandbox_status");
      const runtime = yield* coordinator.status.pipe(
        Effect.tapError(() =>
          appendAuditBestEffort({
            scope,
            projectId,
            tool: "email_sandbox_status",
            outcome: "error",
          }),
        ),
      );
      yield* appendAudit({
        scope,
        projectId,
        tool: "email_sandbox_status",
        outcome: "success",
      });
      return { projectId, runtime, source };
    },
  );

  const listForProject = Effect.fn("AgentEmailSandbox.listForProject")(function* (
    projectId: ProjectId,
    input: EmailAgentListInput,
  ) {
    const result = yield* coordinator.listMessages({
      projectId,
      ...(input.unreadOnly === undefined ? {} : { unreadOnly: input.unreadOnly }),
      ...(input.receivedAfter === undefined ? {} : { receivedAfter: input.receivedAfter }),
      limit: 100,
    });
    const limit = input.limit ?? 25;
    return result.messages
      .filter((message) => message.projectId === projectId && messageMatches(message, input))
      .slice(0, limit);
  });

  const list: AgentEmailSandboxShape["list"] = Effect.fn("AgentEmailSandbox.list")(
    function* (scope, input) {
      const { projectId } = yield* authorize(scope, "email_list");
      const messages = yield* listForProject(projectId, input).pipe(
        Effect.tapError(() =>
          appendAuditBestEffort({
            scope,
            projectId,
            tool: "email_list",
            outcome: "error",
            filterSummary: filterSummary(input),
          }),
        ),
      );
      yield* appendAudit({
        scope,
        projectId,
        tool: "email_list",
        outcome: "success",
        resultCount: messages.length,
        filterSummary: filterSummary(input),
      });
      return { messages, nextCursor: null };
    },
  );

  const get: AgentEmailSandboxShape["get"] = Effect.fn("AgentEmailSandbox.get")(
    function* (scope, messageId) {
      const { projectId } = yield* authorize(scope, "email_get");
      const message = yield* coordinator.getMessage(messageId).pipe(Effect.result);
      if (message._tag === "Failure" && message.failure.reason !== "not-found") {
        yield* appendAuditBestEffort({
          scope,
          projectId,
          tool: "email_get",
          outcome: "error",
          messageId,
        });
        return yield* message.failure;
      }
      const detail = message._tag === "Success" ? message.success : undefined;
      if (!detail || detail.summary.projectId !== projectId) {
        yield* appendAudit({
          scope,
          projectId,
          tool: "email_get",
          outcome: "not_found",
          messageId,
        });
        return yield* accessError(
          scope,
          "email_get",
          "message-not-found",
          "The captured email was not found in this thread's project.",
        );
      }
      yield* appendAudit({
        scope,
        projectId,
        tool: "email_get",
        outcome: "success",
        messageId,
        resultCount: 1,
      });
      return detail;
    },
  );

  const waitFor: AgentEmailSandboxShape["waitFor"] = Effect.fn("AgentEmailSandbox.waitFor")(
    function* (scope, input) {
      const { projectId } = yield* authorize(scope, "email_wait_for");
      const timeoutMs = Math.min(input.timeoutMs ?? 15_000, 60_000);
      const startedAt = yield* Clock.currentTimeMillis;
      const summary = filterSummary(input);
      while (true) {
        const messages = yield* listForProject(projectId, { ...input, limit: 1 }).pipe(
          Effect.tapError(() =>
            appendAuditBestEffort({
              scope,
              projectId,
              tool: "email_wait_for",
              outcome: "error",
              filterSummary: summary,
            }),
          ),
        );
        const match = messages[0];
        if (match) {
          const detail = yield* coordinator.getMessage(match.messageId).pipe(
            Effect.tapError(() =>
              appendAuditBestEffort({
                scope,
                projectId,
                tool: "email_wait_for",
                outcome: "error",
                messageId: match.messageId,
                filterSummary: summary,
              }),
            ),
          );
          if (detail.summary.projectId !== projectId) {
            yield* appendAuditBestEffort({
              scope,
              projectId,
              tool: "email_wait_for",
              outcome: "not_found",
              messageId: match.messageId,
              filterSummary: summary,
            });
            return yield* accessError(
              scope,
              "email_wait_for",
              "message-not-found",
              "The matching captured email was not found in this thread's project.",
            );
          }
          yield* appendAudit({
            scope,
            projectId,
            tool: "email_wait_for",
            outcome: "success",
            messageId: match.messageId,
            resultCount: 1,
            filterSummary: summary,
          });
          return detail;
        }
        const elapsed = (yield* Clock.currentTimeMillis) - startedAt;
        if (elapsed >= timeoutMs) {
          yield* appendAudit({
            scope,
            projectId,
            tool: "email_wait_for",
            outcome: "timeout",
            filterSummary: summary,
          });
          return yield* accessError(
            scope,
            "email_wait_for",
            "timeout",
            `No matching project email arrived within ${timeoutMs}ms.`,
          );
        }
        yield* Effect.sleep(Math.min(250, timeoutMs - elapsed));
      }
    },
  );

  return AgentEmailSandbox.of({ status, list, get, waitFor });
});

export const layerWithResolver = Layer.effect(AgentEmailSandbox, make);

export const layer = layerWithResolver.pipe(Layer.provide(McpThreadProjectResolverProjectionLive));
