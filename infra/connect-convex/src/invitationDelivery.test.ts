import { describe, expect, it } from "vite-plus/test";

import { deliverInvitation, invitationDeliveryConfig } from "./invitationDelivery.ts";

describe("invitation delivery", () => {
  it("is explicitly disabled until both Resend settings are present", () => {
    expect(invitationDeliveryConfig({ RESEND_API_KEY: "secret" })).toBeNull();
  });

  it("sends through the injected Resend boundary", async () => {
    let requestCount = 0;
    const request = (async () => {
      requestCount += 1;
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    await expect(
      deliverInvitation(
        { apiKey: "secret", fromEmail: "PathwayOS <invite@example.test>" },
        { invitedEmail: "member@example.test", inviteUrl: "https://app.example.test/invite" },
        request,
      ),
    ).resolves.toBe("sent");
    expect(requestCount).toBe(1);
  });
});
