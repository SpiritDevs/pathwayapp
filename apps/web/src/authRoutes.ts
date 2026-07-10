export const AUTH_ROUTE_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/session-tasks/reset-password",
] as const;

export const SIGN_IN_ROUTE = "/login";
export const SIGN_UP_ROUTE = "/register";
export const FORGOT_PASSWORD_ROUTE = "/forgot-password";
export const RESET_PASSWORD_TASK_ROUTE = "/session-tasks/reset-password";
export const AUTH_COMPLETE_ROUTE = "/";
export const INVITATION_ACCEPT_ROUTE = "/invitations/accept";
export const FREE_PLAN_LABEL = "Free";
export const DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS = [
  "pathwayos://app",
  "pathwayos-dev://app",
] as const;
export const DESKTOP_CLERK_ALLOWED_REDIRECT_PROTOCOLS = ["pathwayos:", "pathwayos-dev:"] as const;

export type ClerkAuthRoutingProps =
  | {
      readonly path: string;
      readonly routing: "path";
    }
  | {
      readonly path?: never;
      readonly routing: "hash";
    };

// Clerk supports virtual routing at runtime, but this snapshot's public component
// types only expose path/hash. Electron already uses the URL hash for app routes,
// so Clerk must not treat "#/login" as its own routing state.
const ELECTRON_CLERK_ROUTING = "virtual" as "hash";

export function getClerkAuthRoutingProps(
  path: string,
  isElectronRuntime: boolean,
): ClerkAuthRoutingProps {
  return isElectronRuntime ? { routing: ELECTRON_CLERK_ROUTING } : { path, routing: "path" };
}

export function getClerkRouteUrl(path: string, isElectronRuntime: boolean): string {
  if (!isElectronRuntime) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/#${normalizedPath}`;
}

export function normalizeClerkDesktopNavigationTarget(target: string): string {
  try {
    const url = new URL(target, `${DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS[1]}/`);
    if (url.hash.startsWith("#/")) {
      return url.hash.slice(1);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return target;
  }
}

export function isAuthRoutePathname(pathname: string): boolean {
  return AUTH_ROUTE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isPublicSessionRoutePathname(pathname: string): boolean {
  return (
    pathname === "/pair" || pathname === INVITATION_ACCEPT_ROUTE || isAuthRoutePathname(pathname)
  );
}
