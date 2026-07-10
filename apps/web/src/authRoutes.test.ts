import { describe, expect, it } from "vite-plus/test";

import {
  DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS,
  DESKTOP_CLERK_ALLOWED_REDIRECT_PROTOCOLS,
  getClerkAuthRoutingProps,
  getClerkRouteUrl,
  isAuthRoutePathname,
  isPublicSessionRoutePathname,
  normalizeClerkDesktopNavigationTarget,
} from "./authRoutes";

describe("auth route detection", () => {
  it("detects standalone Clerk auth surfaces", () => {
    expect(isAuthRoutePathname("/login")).toBe(true);
    expect(isAuthRoutePathname("/register")).toBe(true);
    expect(isAuthRoutePathname("/forgot-password")).toBe(true);
    expect(isAuthRoutePathname("/session-tasks/reset-password")).toBe(true);
    expect(isAuthRoutePathname("/settings/general")).toBe(false);
    expect(isAuthRoutePathname("/project/thread")).toBe(false);
  });

  it("keeps auth and pairing routes public while requiring a session for app routes", () => {
    expect(isPublicSessionRoutePathname("/login")).toBe(true);
    expect(isPublicSessionRoutePathname("/register")).toBe(true);
    expect(isPublicSessionRoutePathname("/forgot-password")).toBe(true);
    expect(isPublicSessionRoutePathname("/session-tasks/reset-password")).toBe(true);
    expect(isPublicSessionRoutePathname("/pair")).toBe(true);
    expect(isPublicSessionRoutePathname("/invitations/accept")).toBe(true);
    expect(isPublicSessionRoutePathname("/")).toBe(false);
    expect(isPublicSessionRoutePathname("/settings/general")).toBe(false);
  });

  it("uses virtual Clerk component routing in Electron and path routing in the browser", () => {
    expect(getClerkAuthRoutingProps("/login", false)).toEqual({
      path: "/login",
      routing: "path",
    });
    expect(getClerkAuthRoutingProps("/login", true)).toEqual({ routing: "virtual" });
  });

  it("formats Clerk navigation URLs for Electron hash history", () => {
    expect(getClerkRouteUrl("/login", false)).toBe("/login");
    expect(getClerkRouteUrl("/login", true)).toBe("/#/login");
    expect(getClerkRouteUrl("/", true)).toBe("/#/");
    expect(getClerkRouteUrl("register", true)).toBe("/#/register");
  });

  it("allows Clerk redirects back to the desktop renderer schemes", () => {
    expect(DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS).toEqual([
      "pathwayos://app",
      "pathwayos-dev://app",
    ]);
    expect(DESKTOP_CLERK_ALLOWED_REDIRECT_PROTOCOLS).toEqual(["pathwayos:", "pathwayos-dev:"]);
  });

  it("normalizes Clerk desktop navigation URLs into hash-history routes", () => {
    expect(
      normalizeClerkDesktopNavigationTarget(
        "pathwayos-dev://app/#/login?redirect_url=pathwayos-dev%3A%2F%2Fapp%2F",
      ),
    ).toBe("/login?redirect_url=pathwayos-dev%3A%2F%2Fapp%2F");
    expect(normalizeClerkDesktopNavigationTarget("pathwayos://app/#/register")).toBe("/register");
    expect(normalizeClerkDesktopNavigationTarget("/#/forgot-password")).toBe("/forgot-password");
    expect(normalizeClerkDesktopNavigationTarget("/session-tasks/reset-password")).toBe(
      "/session-tasks/reset-password",
    );
  });
});
