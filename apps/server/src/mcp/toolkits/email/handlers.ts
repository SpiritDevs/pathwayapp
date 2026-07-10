import * as Effect from "effect/Effect";

import * as AgentEmailSandbox from "../../AgentEmailSandbox.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { EmailToolkit } from "./tools.ts";

const handlers = {
  email_sandbox_status: () =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireEmailCapability("email_sandbox_status");
      const email = yield* AgentEmailSandbox.AgentEmailSandbox;
      return yield* email.status(scope);
    }),
  email_list: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireEmailCapability("email_list");
      const email = yield* AgentEmailSandbox.AgentEmailSandbox;
      return yield* email.list(scope, input);
    }),
  email_get: ({ messageId }) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireEmailCapability("email_get");
      const email = yield* AgentEmailSandbox.AgentEmailSandbox;
      return yield* email.get(scope, messageId);
    }),
  email_wait_for: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireEmailCapability("email_wait_for");
      const email = yield* AgentEmailSandbox.AgentEmailSandbox;
      return yield* email.waitFor(scope, input);
    }),
} satisfies Parameters<typeof EmailToolkit.toLayer>[0];

export const EmailToolkitHandlersLive = EmailToolkit.toLayer(handlers);
