import { normalizeSecureOrigin } from "./secureOrigin.ts";

export function normalizeSecureConvexUrl(value: string): string | null {
  return normalizeSecureOrigin(value);
}

export function isSecureConvexUrl(value: string): boolean {
  return normalizeSecureConvexUrl(value) !== null;
}

/**
 * Resolve the origin used by Convex HTTP actions.
 *
 * Hosted Convex deployments expose realtime functions on `*.convex.cloud`
 * and HTTP actions on the matching `*.convex.site` origin. Custom deployment
 * origins are preserved so self-hosted installations can expose both surfaces
 * behind one origin.
 */
export function convexHttpActionsUrl(value: string): string | null {
  const deploymentUrl = normalizeSecureConvexUrl(value);
  if (deploymentUrl === null) return null;
  const url = new URL(deploymentUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
  }
  return url.origin;
}
