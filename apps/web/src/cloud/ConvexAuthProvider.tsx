import { useAuth } from "@clerk/react";
import { clientApi } from "@pathwayos/connect-convex/client-api";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useState, type ReactNode } from "react";

import { CloudWorkspaceProvider } from "./CloudWorkspaceProvider";

const clients = new Map<string, ConvexReactClient>();

function getConvexClient(url: string): ConvexReactClient {
  const existing = clients.get(url);
  if (existing) {
    return existing;
  }
  const client = new ConvexReactClient(url);
  clients.set(url, client);
  return client;
}

function ConvexAccountBootstrap({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const bootstrap = useMutation(clientApi.account.bootstrap);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setReady(false);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void bootstrap({})
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // Convex is additive to the local workspace. A cloud outage must not
        // replace the functioning local UI with an error screen.
        if (!cancelled) retry = setTimeout(() => setAttempt((value) => value + 1), 5_000);
      });
    return () => {
      cancelled = true;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [attempt, bootstrap, isAuthenticated]);

  return ready ? <CloudWorkspaceProvider>{children}</CloudWorkspaceProvider> : children;
}

export function ConvexAuthProvider(props: { readonly children: ReactNode; readonly url: string }) {
  return (
    <ConvexProviderWithClerk client={getConvexClient(props.url)} useAuth={useAuth}>
      <ConvexAccountBootstrap>{props.children}</ConvexAccountBootstrap>
    </ConvexProviderWithClerk>
  );
}
