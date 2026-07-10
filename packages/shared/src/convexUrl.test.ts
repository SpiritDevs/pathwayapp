import { describe, expect, it } from "vite-plus/test";

import { convexHttpActionsUrl, isSecureConvexUrl, normalizeSecureConvexUrl } from "./convexUrl.ts";

describe("normalizeSecureConvexUrl", () => {
  it("normalizes secure Convex deployment origins", () => {
    expect(normalizeSecureConvexUrl(" https://example.convex.cloud/// ")).toBe(
      "https://example.convex.cloud",
    );
  });

  it.each([
    "http://example.convex.cloud",
    "https://user:password@example.convex.cloud",
    "https://example.convex.cloud/path",
    "https://example.convex.cloud?query=value",
    "https://example.convex.cloud#fragment",
    "not a url",
  ])("rejects unsafe Convex URL %s", (value) => {
    expect(normalizeSecureConvexUrl(value)).toBeNull();
    expect(isSecureConvexUrl(value)).toBe(false);
  });
});

describe("convexHttpActionsUrl", () => {
  it("maps a hosted deployment origin to its HTTP actions origin", () => {
    expect(convexHttpActionsUrl("https://example.convex.cloud")).toBe(
      "https://example.convex.site",
    );
  });

  it("preserves secure custom origins", () => {
    expect(convexHttpActionsUrl("https://convex.example.test")).toBe("https://convex.example.test");
  });

  it("rejects unsafe deployment origins", () => {
    expect(convexHttpActionsUrl("http://example.convex.cloud")).toBeNull();
  });
});
