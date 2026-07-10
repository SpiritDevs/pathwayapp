import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import { Tool } from "effect/unstable/ai";

import { EmailToolkit } from "./tools.ts";

it("publishes bounded read-only email tool schemas", () => {
  expect(Object.keys(EmailToolkit.tools)).toEqual([
    "email_sandbox_status",
    "email_list",
    "email_get",
    "email_wait_for",
  ]);
  for (const tool of Object.values(EmailToolkit.tools)) {
    expect(Context.get(tool.annotations, Tool.Readonly)).toBe(true);
    expect(Context.get(tool.annotations, Tool.Destructive)).toBe(false);
    expect(Context.get(tool.annotations, Tool.Idempotent)).toBe(true);
    expect(Context.get(tool.annotations, Tool.OpenWorld)).toBe(false);
  }

  const waitSchema = Tool.getJsonSchema(EmailToolkit.tools.email_wait_for) as {
    readonly properties?: {
      readonly timeoutMs?: {
        readonly anyOf?: ReadonlyArray<{
          readonly allOf?: ReadonlyArray<{ readonly maximum?: number }>;
        }>;
      };
    };
  };
  expect(waitSchema.properties?.timeoutMs?.anyOf?.[0]?.allOf?.[0]?.maximum).toBe(60_000);
});
