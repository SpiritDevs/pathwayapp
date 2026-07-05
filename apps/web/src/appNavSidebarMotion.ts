const APP_NAV_ROUTE_INSTANT_CLASS = "app-nav-route-instant";
const APP_NAV_ROUTE_INSTANT_DURATION_MS = 250;

let appNavRouteInstantTimeoutId: number | null = null;

export function markAppNavRouteSidebarMotionInstant() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  document.documentElement.classList.add(APP_NAV_ROUTE_INSTANT_CLASS);

  if (appNavRouteInstantTimeoutId !== null) {
    window.clearTimeout(appNavRouteInstantTimeoutId);
  }

  appNavRouteInstantTimeoutId = window.setTimeout(() => {
    document.documentElement.classList.remove(APP_NAV_ROUTE_INSTANT_CLASS);
    appNavRouteInstantTimeoutId = null;
  }, APP_NAV_ROUTE_INSTANT_DURATION_MS);
}
