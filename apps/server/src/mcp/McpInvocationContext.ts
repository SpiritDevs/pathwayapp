import {
  EmailAgentAccessError,
  type EmailAgentToolName,
  EnvironmentId,
  PreviewAutomationUnavailableError,
  ProviderInstanceId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const IssueAgentToolName = Schema.Literals([
  "issue_create",
  "issue_get",
  "issue_list",
  "issue_update",
  "issue_comment",
  "issue_start_work",
  "issue_link_thread",
  "issue_relation_set",
  "issue_delete",
  "team_list",
  "actor_list",
  "state_list",
  "label_list",
  "cycle_list",
  "epic_list",
  "view_list",
]);
export type IssueAgentToolName = typeof IssueAgentToolName.Type;

export class IssueAgentAccessError extends Schema.TaggedErrorClass<IssueAgentAccessError>()(
  "IssueAgentAccessError",
  {
    operation: IssueAgentToolName,
    reason: Schema.Literals([
      "capability-denied",
      "thread-not-found",
      "actor-resolution-failed",
      "persistence-failed",
    ]),
    environmentId: EnvironmentId,
    threadId: ThreadId,
    providerSessionId: TrimmedNonEmptyString,
    providerInstanceId: ProviderInstanceId,
    message: Schema.String,
  },
) {}

export type McpCapability = "preview" | "email" | "issues";

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export class McpInvocationContext extends Context.Service<
  McpInvocationContext,
  McpInvocationScope
>()("pathwayos/mcp/McpInvocationContext") {}

export const requireMcpCapability = Effect.fn("mcp.requireCapability")(function* (
  capability: "preview",
) {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has(capability)) {
    return yield* new PreviewAutomationUnavailableError({
      capability: "preview",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
  }
  return invocation;
});

export const requireEmailCapability = Effect.fn("mcp.requireEmailCapability")(function* (
  operation: EmailAgentToolName,
) {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has("email")) {
    return yield* new EmailAgentAccessError({
      operation,
      reason: "capability-denied",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
      message: "MCP credential does not grant the email capability.",
    });
  }
  return invocation;
});

export const requireIssuesCapability = Effect.fn("mcp.requireIssuesCapability")(function* (
  operation: IssueAgentToolName,
) {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has("issues")) {
    return yield* new IssueAgentAccessError({
      operation,
      reason: "capability-denied",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
      message: "MCP credential does not grant the issues capability.",
    });
  }
  return invocation;
});
