import { describe, expect, it, vi } from "vite-plus/test";

import {
  cloudflareAllocationNames,
  cloudflareEndpoint,
  cloudflareOriginService,
  deprovisionCloudflareTunnel,
  provisionCloudflareTunnel,
  redactCloudflareError,
} from "./cloudflareProvider.ts";

describe("cloudflare provider boundary", () => {
  it("derives stable owner/environment-scoped names", async () => {
    const input = {
      namespace: "Pathway OS Production",
      baseDomain: "Remote.Example.com.",
      ownerUserId: "user_123",
      environmentId: "environment-abc",
    };
    const first = await cloudflareAllocationNames(input);
    const second = await cloudflareAllocationNames(input);
    expect(first).toEqual(second);
    expect(first.hostname).toMatch(/^pathway-os-production-[a-f0-9]{16}\.remote\.example\.com$/u);
    expect(first.tunnelName).toBe(`pathwayos-${first.hostname.split(".")[0]}`);
  });

  it("reconciles an existing tunnel and DNS record without creating duplicates", async () => {
    const responses = [
      { success: true, result: [{ id: "tunnel-1", name: "pathwayos-test" }] },
      { success: true, result: {} },
      { success: true, result: [{ id: "dns-1" }] },
      { success: true, result: { id: "dns-1" } },
      { success: true, result: "connector-token" },
    ];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const result = await provisionCloudflareTunnel(
      {
        config: {
          accountId: "account",
          zoneId: "zone",
          apiToken: "secret-provider-token",
          baseDomain: "remote.example.com",
        },
        origin: { localHttpHost: "127.0.0.1", localHttpPort: 5733 },
        hostname: "test.remote.example.com",
        tunnelName: "pathwayos-test",
        preferredTunnelId: "tunnel-1",
        preferredDnsRecordId: "dns-1",
      },
      fetchImplementation,
    );
    expect(result).toEqual({
      tunnelId: "tunnel-1",
      dnsRecordId: "dns-1",
      connectorToken: "connector-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("treats already-deleted provider resources as successfully deprovisioned", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 404 }),
    );
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    await expect(
      deprovisionCloudflareTunnel(
        {
          config: {
            accountId: "account",
            zoneId: "zone",
            apiToken: "secret-provider-token",
            baseDomain: "remote.example.com",
          },
          tunnelId: "tunnel-1",
          dnsRecordId: "dns-1",
        },
        fetchImplementation,
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("only accepts loopback origins", () => {
    expect(cloudflareOriginService({ localHttpHost: "::1", localHttpPort: 5733 })).toBe(
      "http://[::1]:5733",
    );
    expect(() =>
      cloudflareOriginService({ localHttpHost: "192.168.1.10", localHttpPort: 5733 }),
    ).toThrow("CLOUDFLARE_ORIGIN_NOT_ALLOWED");
  });

  it("returns only public endpoint metadata and redacts provider tokens", () => {
    expect(cloudflareEndpoint("Host.Example.com.")).toEqual({
      httpBaseUrl: "https://host.example.com/",
      wsBaseUrl: "wss://host.example.com/ws",
      providerKind: "cloudflare_tunnel",
    });
    expect(
      redactCloudflareError(new Error("Bearer abcdefghijklmnopqrstuvwxyz123456")),
    ).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });
});
