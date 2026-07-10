import { useAuth } from "@clerk/expo";
import { clientApi } from "@pathwayos/connect-convex/client-api";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, type ReactNode } from "react";

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
  const requested = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || requested.current) return;
    requested.current = true;
    void bootstrap({}).catch(() => {
      requested.current = false;
    });
  }, [bootstrap, isAuthenticated]);

  return children;
}

export function ConvexAuthProvider(props: { readonly children: ReactNode; readonly url: string }) {
  return (
    <ConvexProviderWithClerk client={getConvexClient(props.url)} useAuth={useAuth}>
      <ConvexAccountBootstrap>{props.children}</ConvexAccountBootstrap>
    </ConvexProviderWithClerk>
  );
}
