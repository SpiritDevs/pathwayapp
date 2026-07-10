import { clientApi } from "@pathwayos/connect-convex/client-api";
import type { RelayManagedEndpointRuntimeConfig } from "@pathwayos/contracts/relay";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import {
  applyPrimaryManagedEndpointConfig,
  clearPrimaryConvexConfig,
  createPrimaryConvexLinkProof,
  installPrimaryConvexConfig,
} from "../../cloud/linkEnvironment";
import { prepareManagedEndpointRuntime } from "../../cloud/linkEnvironmentAtoms";
import { usePrimaryCloudLinkState } from "../../cloud/primaryCloudLinkState";
import { resolveCloudPublicConfig } from "../../cloud/publicConfig";
import { runtime } from "../../lib/runtime";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@pathwayos/client-runtime/state/runtime";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsRow } from "./settingsLayout";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";

interface EnvironmentLinkSummary {
  readonly environmentId: string;
  readonly remoteAccessEnabled: boolean;
  readonly remoteAccessStatus:
    | "requested"
    | "provisioning"
    | "ready"
    | "failed"
    | "deprovisioning"
    | "disabled"
    | null;
  readonly remoteAccessError: string | null;
}

interface LinkChallenge {
  readonly challenge: string;
  readonly relayIssuer: string;
}

interface LinkResult {
  readonly environmentId: string;
  readonly cloudUserId: string;
  readonly tenantId: string;
  readonly environmentCredential: string;
  readonly cloudMintPublicKey: string;
}

interface RemoteAccessResult {
  readonly endpointRuntime: RelayManagedEndpointRuntimeConfig;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cloud configuration failed.";
}

export function ConvexCloudLinkRow({ canManageRelay }: { readonly canManageRelay: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const primaryCloudLinkState = usePrimaryCloudLinkState();
  const linksValue = useQuery(clientApi.environments.listMine, isAuthenticated ? {} : "skip");
  const createChallenge = useAction(clientApi.environments.createLinkChallenge);
  const linkEnvironment = useAction(clientApi.environments.link);
  const unlinkEnvironment = useMutation(clientApi.environments.unlink);
  const enableRemoteAccess = useAction(clientApi.environments.enableRemoteAccess);
  const disableRemoteAccess = useAction(clientApi.environments.disableRemoteAccess);
  const reportRuntimeFailure = useMutation(clientApi.environments.reportRemoteRuntimeFailure);
  const prepareRuntime = useAtomCommand(prepareManagedEndpointRuntime, {
    reportFailure: false,
  });
  const [operation, setOperation] = useState<"link" | "remote" | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const target = primaryCloudLinkState.target;
  const links = (linksValue ?? []) as unknown as ReadonlyArray<EnvironmentLinkSummary>;
  const link = useMemo(
    () => links.find((candidate) => candidate.environmentId === target?.environmentId) ?? null,
    [links, target?.environmentId],
  );
  const linked = link !== null && (primaryCloudLinkState.data?.linked ?? false);
  const remoteEnabled = link?.remoteAccessEnabled ?? false;
  const cloudConfig = resolveCloudPublicConfig();
  const remoteClientConfigured =
    cloudConfig.relayUrl !== null && cloudConfig.clerkJwtTemplate !== null;
  const disabled = !canManageRelay || !isAuthenticated || target === null;

  const reportFailure = (title: string, error: unknown) => {
    const message = errorMessage(error);
    setOperationError(message);
    toastManager.add({ type: "error", title, description: message });
  };

  const setLinked = async (enabled: boolean) => {
    if (target === null) return;
    setOperation("link");
    setOperationError(null);
    try {
      if (enabled) {
        const challenge = (await createChallenge({})) as unknown as LinkChallenge;
        const proof = await runtime.runPromise(
          createPrimaryConvexLinkProof({
            target,
            challenge: challenge.challenge,
            relayIssuer: challenge.relayIssuer,
          }),
        );
        const linkedEnvironment = (await linkEnvironment({
          proof,
          environmentLabel: target.label,
          notificationsEnabled: true,
          liveActivitiesEnabled: true,
          createdByDeviceId: null,
        })) as unknown as LinkResult;
        await runtime.runPromise(
          installPrimaryConvexConfig({
            target,
            connectUrl: challenge.relayIssuer,
            cloudUserId: linkedEnvironment.cloudUserId,
            tenantId: linkedEnvironment.tenantId,
            environmentCredential: linkedEnvironment.environmentCredential,
            cloudMintPublicKey: linkedEnvironment.cloudMintPublicKey,
          }),
        );
      } else {
        if (remoteEnabled) {
          await runtime.runPromise(
            applyPrimaryManagedEndpointConfig({ target, endpointRuntime: null }),
          );
          await disableRemoteAccess({ environmentId: target.environmentId });
        }
        await runtime.runPromise(clearPrimaryConvexConfig({ target }));
        await unlinkEnvironment({ environmentId: target.environmentId });
      }
      primaryCloudLinkState.refresh();
      toastManager.add({
        type: "success",
        title: enabled ? "Cloud sync enabled" : "Cloud sync disabled",
        description: enabled
          ? "This environment can now sync through Convex. Remote access remains off."
          : "This environment is no longer linked to Convex.",
      });
    } catch (error) {
      reportFailure("Could not update cloud sync", error);
    } finally {
      setOperation(null);
    }
  };

  const setRemoteEnabled = async (enabled: boolean) => {
    if (target === null) return;
    setOperation("remote");
    setOperationError(null);
    try {
      if (enabled) {
        const prepared = await prepareRuntime({ target });
        if (prepared._tag === "Failure") {
          if (isAtomCommandInterrupted(prepared)) return;
          throw squashAtomCommandFailure(prepared);
        }
        const provisioned = (await enableRemoteAccess({
          environmentId: target.environmentId,
        })) as unknown as RemoteAccessResult;
        try {
          await runtime.runPromise(
            applyPrimaryManagedEndpointConfig({
              target,
              endpointRuntime: provisioned.endpointRuntime,
            }),
          );
        } catch (error) {
          await reportRuntimeFailure({
            environmentId: target.environmentId,
            errorMessage: errorMessage(error),
          });
          await disableRemoteAccess({ environmentId: target.environmentId }).catch(() => null);
          throw error;
        }
      } else {
        await runtime.runPromise(
          applyPrimaryManagedEndpointConfig({ target, endpointRuntime: null }),
        );
        await disableRemoteAccess({ environmentId: target.environmentId });
      }
      toastManager.add({
        type: "success",
        title: enabled ? "Remote access enabled" : "Remote access disabled",
        description: enabled
          ? "Cloudflare Tunnel is running for this environment."
          : "The Cloudflare Tunnel and DNS allocation were removed.",
      });
    } catch (error) {
      reportFailure("Could not update remote access", error);
    } finally {
      setOperation(null);
    }
  };

  if (cloudConfig.convexUrl === null) return null;

  return (
    <>
      <SettingsRow
        title="Sync with Convex"
        description="Sync new projects, tasks, and app data across your signed-in computers. This does not expose the environment to the internet."
        status={operationError ?? primaryCloudLinkState.error}
        control={
          <Switch
            aria-label="Sync this environment with Convex"
            checked={linked}
            disabled={disabled || operation !== null || linksValue === undefined}
            onCheckedChange={(enabled) => void setLinked(enabled)}
          />
        }
      />
      {linked ? (
        <SettingsRow
          title="Remote access via Cloudflare"
          description="Explicitly provision a private Cloudflare Tunnel so your other computers can control chats running in this environment."
          status={
            link?.remoteAccessError ??
            (remoteClientConfigured
              ? null
              : "Configure the Connect URL and Clerk JWT template to enable remote clients.")
          }
          className="bg-muted/20 pl-7 sm:pl-8"
          control={
            <Switch
              aria-label="Enable remote access through Cloudflare Tunnel"
              checked={remoteEnabled}
              disabled={
                disabled ||
                !remoteClientConfigured ||
                operation !== null ||
                link?.remoteAccessStatus === "provisioning" ||
                link?.remoteAccessStatus === "deprovisioning"
              }
              onCheckedChange={(enabled) => void setRemoteEnabled(enabled)}
            />
          }
        />
      ) : null}
    </>
  );
}
