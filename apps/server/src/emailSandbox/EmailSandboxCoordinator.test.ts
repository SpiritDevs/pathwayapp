import { describe, expect, it } from "vite-plus/test";

import { normalizeMailpitRuntimeConfig } from "./MailpitRuntime.ts";

describe("email sandbox coordinator configuration", () => {
  it("keeps the managed Mailpit endpoints loopback-only", () => {
    expect(
      normalizeMailpitRuntimeConfig({
        databasePath: "/tmp/pathwayos/mailpit.db",
        smtpPort: 1025,
        apiPort: 8025,
      }),
    ).toMatchObject({
      smtpPort: 1025,
      apiPort: 8025,
      maxMessageSizeMb: 25,
    });
  });
});
