import {
  EmailAgentListInput,
  EmailAgentSandboxStatus,
  EmailAgentToolError,
  EmailAgentWaitForInput,
  EmailMessageDetail,
  EmailMessageGetInput,
  EmailMessageListResult,
} from "@pathwayos/contracts";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as AgentEmailSandbox from "../../AgentEmailSandbox.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  AgentEmailSandbox.AgentEmailSandbox,
];

const readonlyEmailTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false) as T;

export const EmailSandboxStatusTool = readonlyEmailTool(
  Tool.make("email_sandbox_status", {
    description:
      "Report the local email sandbox runtime and SMTP capture source for the invoking thread's project. Access is strictly scoped to that project.",
    success: EmailAgentSandboxStatus,
    failure: EmailAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get project email sandbox status"),
);

export const EmailListTool = readonlyEmailTool(
  Tool.make("email_list", {
    description:
      "List captured emails for the invoking thread's project only. Optionally filter by case-insensitive subject or recipient substring, unread state, and receive time.",
    parameters: EmailAgentListInput,
    success: EmailMessageListResult,
    failure: EmailAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List project emails"),
);

export const EmailGetTool = readonlyEmailTool(
  Tool.make("email_get", {
    description:
      "Read one captured email, including safe body text/HTML and attachment metadata, only when it belongs to the invoking thread's project.",
    parameters: EmailMessageGetInput,
    success: EmailMessageDetail,
    failure: EmailAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get project email"),
);

export const EmailWaitForTool = readonlyEmailTool(
  Tool.make("email_wait_for", {
    description:
      "Wait for a captured email in the invoking thread's project matching a subject and/or recipient substring. Defaults to 15 seconds and cannot exceed 60 seconds.",
    parameters: EmailAgentWaitForInput,
    success: EmailMessageDetail,
    failure: EmailAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Wait for project email"),
);

export const EmailToolkit = Toolkit.make(
  EmailSandboxStatusTool,
  EmailListTool,
  EmailGetTool,
  EmailWaitForTool,
);
