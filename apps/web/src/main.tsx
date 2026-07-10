import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider as ElectronClerkProvider } from "@clerk/electron/react";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@fontsource-variable/dm-sans/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { isElectron } from "./env";
import {
  AUTH_COMPLETE_ROUTE,
  DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS,
  DESKTOP_CLERK_ALLOWED_REDIRECT_PROTOCOLS,
  getClerkRouteUrl,
  normalizeClerkDesktopNavigationTarget,
  RESET_PASSWORD_TASK_ROUTE,
  SIGN_IN_ROUTE,
  SIGN_UP_ROUTE,
} from "./authRoutes";
import { ManagedRelayAuthProvider } from "./cloud/managedAuth";
import { ConvexAuthProvider } from "./cloud/ConvexAuthProvider";
import {
  hasCloudPublicConfig,
  hasConvexPublicConfig,
  resolveCloudPublicConfig,
} from "./cloud/publicConfig";
import { getRouter } from "./router";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";
import { AppRoot } from "./AppRoot";

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

const cloudPublicConfig = resolveCloudPublicConfig();
const clerkPublishableKey = cloudPublicConfig.clerkPublishableKey;
const relayCloudConfigured = hasCloudPublicConfig();
const convexCloudConfigured = hasConvexPublicConfig();
const clerkRouteConfig = {
  afterSignOutUrl: getClerkRouteUrl(SIGN_IN_ROUTE, isElectron),
  signInFallbackRedirectUrl: getClerkRouteUrl(AUTH_COMPLETE_ROUTE, isElectron),
  signInUrl: getClerkRouteUrl(SIGN_IN_ROUTE, isElectron),
  signUpFallbackRedirectUrl: getClerkRouteUrl(AUTH_COMPLETE_ROUTE, isElectron),
  signUpUrl: getClerkRouteUrl(SIGN_UP_ROUTE, isElectron),
  taskUrls: {
    "reset-password": getClerkRouteUrl(RESET_PASSWORD_TASK_ROUTE, isElectron),
  },
} as const;
const desktopClerkRoutingConfig = {
  allowedRedirectOrigins: [...DESKTOP_CLERK_ALLOWED_REDIRECT_ORIGINS],
  allowedRedirectProtocols: [...DESKTOP_CLERK_ALLOWED_REDIRECT_PROTOCOLS],
  routerPush: (to: string) => {
    history.push(normalizeClerkDesktopNavigationTarget(to));
  },
  routerReplace: (to: string) => {
    history.replace(normalizeClerkDesktopNavigationTarget(to));
  },
};

const app = <AppRoot router={router} />;
const relayAwareApp = relayCloudConfigured ? (
  <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
) : (
  app
);
const cloudAwareApp =
  convexCloudConfigured && cloudPublicConfig.convexUrl ? (
    <ConvexAuthProvider url={cloudPublicConfig.convexUrl}>{relayAwareApp}</ConvexAuthProvider>
  ) : (
    relayAwareApp
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      isElectron ? (
        <ElectronClerkProvider
          publishableKey={clerkPublishableKey}
          passkeys={passkeys}
          {...clerkRouteConfig}
          {...desktopClerkRoutingConfig}
        >
          {cloudAwareApp}
        </ElectronClerkProvider>
      ) : (
        <ClerkProvider publishableKey={clerkPublishableKey} {...clerkRouteConfig}>
          {cloudAwareApp}
        </ClerkProvider>
      )
    ) : (
      app
    )}
  </React.StrictMode>,
);
