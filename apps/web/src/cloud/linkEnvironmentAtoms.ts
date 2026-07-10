import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@pathwayos/client-runtime/state/runtime";
import { EnvironmentId } from "@pathwayos/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import {
  ensureRelayClientAvailable,
  linkPrimaryEnvironmentToCloud,
  type CloudLinkTarget,
  unlinkPrimaryEnvironmentFromCloud,
  updatePrimaryCloudPreferences,
} from "./linkEnvironment";

const cloudLinkScheduler = createAtomCommandScheduler();
const cloudLinkConcurrency = {
  mode: "serial" as const,
  key: (input: { readonly target: CloudLinkTarget }) => input.target.environmentId,
};

export const linkPrimaryEnvironment = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:link-primary-environment",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget; readonly clerkToken: string }) =>
    linkPrimaryEnvironmentToCloud(input),
});

export const unlinkPrimaryEnvironment = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:unlink-primary-environment",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget; readonly clerkToken: string | null }) =>
    unlinkPrimaryEnvironmentFromCloud(input),
});

export const updatePrimaryEnvironmentPreferences = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:update-primary-environment-preferences",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget; readonly publishAgentActivity: boolean }) =>
    updatePrimaryCloudPreferences(input),
});

export const prepareManagedEndpointRuntime = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:prepare-managed-endpoint-runtime",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget }) =>
    ensureRelayClientAvailable(EnvironmentId.make(input.target.environmentId)),
});
