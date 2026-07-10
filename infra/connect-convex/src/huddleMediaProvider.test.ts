import { describe, expect, it } from "vite-plus/test";

import { cloudflareRealtimeKitBaseUrl } from "./huddleMediaProvider.ts";

describe("Cloudflare RealtimeKit provider", () => {
  it("builds the tenant-scoped API origin without exposing credentials", () => {
    const url = cloudflareRealtimeKitBaseUrl({
      accountId: "account/value",
      appId: "app value",
      apiToken: "secret-token",
    });

    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account%2Fvalue/realtime/kit/app%20value",
    );
    expect(url).not.toContain("secret-token");
  });
});
