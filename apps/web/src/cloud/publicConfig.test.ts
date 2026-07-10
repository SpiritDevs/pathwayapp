import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CloudPublicConfigMissingError,
  hasClerkPublicConfig,
  hasCloudPublicConfig,
  hasConvexPublicConfig,
  resolveCloudPublicConfig,
  resolveRelayClerkTokenOptions,
} from "./publicConfig.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasCloudPublicConfig", () => {
  it("allows Clerk account screens with only a publishable key", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    expect(hasClerkPublicConfig()).toBe(false);

    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");
    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_CONVEX_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "");

    expect(hasClerkPublicConfig()).toBe(true);
    expect(hasCloudPublicConfig()).toBe(false);
  });

  it("configures Convex independently from the Connect HTTP backend", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");
    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_CONVEX_URL", "https://example.convex.cloud///");

    expect(hasCloudPublicConfig()).toBe(false);
    expect(hasConvexPublicConfig()).toBe(true);
    expect(resolveCloudPublicConfig().convexUrl).toBe("https://example.convex.cloud");
  });

  it("rejects an insecure Convex URL", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_PATHWAYOS_CONVEX_URL", "http://example.convex.cloud");

    expect(hasConvexPublicConfig()).toBe(false);
    expect(resolveCloudPublicConfig().convexUrl).toBeNull();
  });

  it("requires both public cloud values", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");
    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "pathwayos-relay");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "https://connect.example.test");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "https://relay.example.test");
    expect(hasCloudPublicConfig()).toBe(true);
  });

  it("keeps the legacy relay URL as a fallback for the Connect backend URL", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "pathwayos-relay");
    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "https://relay.example.test");

    expect(hasCloudPublicConfig()).toBe(true);
  });

  it("rejects an insecure relay URL", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "pathwayos-relay");
    vi.stubEnv("VITE_PATHWAYOS_CONNECT_URL", "http://connect.example.test");
    vi.stubEnv("VITE_PATHWAYOS_RELAY_URL", "https://relay.example.test");

    expect(hasCloudPublicConfig()).toBe(false);
  });

  it("reports the missing Clerk JWT template as structured configuration", () => {
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");

    expect(() => resolveRelayClerkTokenOptions()).toThrowError(
      new CloudPublicConfigMissingError({ key: "PATHWAYOS_CLERK_JWT_TEMPLATE" }),
    );
  });
});
