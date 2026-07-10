import { clientApi } from "@pathwayos/connect-convex/client-api";
import type { EmailMessageId } from "@pathwayos/contracts";
import { useAction, useConvexAuth, useMutation, useQueries, useQuery } from "convex/react";
import type { GenericId, Value } from "convex/values";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useEnvironments } from "../state/environments";
import {
  materializeCloudWorkspace,
  type CloudEnvironmentProject,
  type CloudEnvironmentThreadShell,
  type CloudProjectRecord,
  type CloudThreadRecord,
} from "./cloudWorkspaceModel";

export interface CloudEmailSandboxSummary {
  readonly sandboxId: string;
  readonly displayName: string;
  readonly cloudProjectId: string;
}

interface CloudWorkspaceContextValue {
  readonly available: boolean;
  readonly loading: boolean;
  readonly activeTenantId: string | null;
  readonly projects: ReadonlyArray<CloudEnvironmentProject>;
  readonly threads: ReadonlyArray<CloudEnvironmentThreadShell>;
  readonly emailSandboxes: ReadonlyArray<CloudEmailSandboxSummary>;
  readonly selectedEmailSandboxId: string | null;
  readonly selectEmailSandbox: (sandboxId: string | null) => void;
  readonly clearSyncedEmailHistory: () => Promise<{
    readonly clearedMessages: number;
    readonly retainedUnsyncedMessages: number;
  }>;
  readonly getEmailAttachmentDownload: (input: {
    readonly messageId: EmailMessageId;
    readonly attachmentId: string;
  }) => Promise<{ readonly url: string; readonly filename: string } | null>;
}

const EMPTY_CONTEXT: CloudWorkspaceContextValue = {
  available: false,
  loading: false,
  activeTenantId: null,
  projects: [],
  threads: [],
  emailSandboxes: [],
  selectedEmailSandboxId: null,
  selectEmailSandbox: () => undefined,
  clearSyncedEmailHistory: async () => ({ clearedMessages: 0, retainedUnsyncedMessages: 0 }),
  getEmailAttachmentDownload: async () => null,
};

const CloudWorkspaceContext = createContext<CloudWorkspaceContextValue>(EMPTY_CONTEXT);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseProjects(value: unknown): Omit<CloudProjectRecord, "replicas">[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const cloudProjectId = asString(record?.cloudProjectId);
    const logicalProjectKey = asString(record?.logicalProjectKey);
    const title = asString(record?.title);
    const createdAt = asString(record?.createdAt);
    const updatedAt = asString(record?.updatedAt);
    return cloudProjectId && logicalProjectKey && title && createdAt && updatedAt
      ? [
          {
            cloudProjectId,
            logicalProjectKey,
            title,
            repositoryCanonicalKey: asNullableString(record?.repositoryCanonicalKey),
            repositoryRelativePath: asNullableString(record?.repositoryRelativePath),
            createdAt,
            updatedAt,
          },
        ]
      : [];
  });
}

function parseReplicas(value: unknown): CloudProjectRecord["replicas"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const environmentId = asString(record?.environmentId);
    const localProjectId = asString(record?.localProjectId);
    const displayName = asString(record?.displayName);
    return environmentId && localProjectId && displayName
      ? [{ environmentId, localProjectId, displayName }]
      : [];
  });
}

function parseThreads(value: unknown): CloudThreadRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const cloudThreadId = asString(record?.cloudThreadId);
    const threadId = asString(record?.threadId);
    const sourceEnvironmentId = asString(record?.sourceEnvironmentId);
    const title = asString(record?.title);
    const state = record?.state;
    const createdAt = asString(record?.createdAt);
    const updatedAt = asString(record?.updatedAt);
    return cloudThreadId &&
      threadId &&
      sourceEnvironmentId &&
      title &&
      (state === "active" || state === "archived" || state === "deleted") &&
      createdAt &&
      updatedAt
      ? [
          {
            cloudThreadId,
            threadId,
            cloudProjectId: asNullableString(record?.cloudProjectId),
            sourceEnvironmentId,
            title,
            state,
            archivedAt: asNullableString(record?.archivedAt),
            createdAt,
            updatedAt,
          },
        ]
      : [];
  });
}

function parseSandboxes(value: unknown): CloudEmailSandboxSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const sandboxId = asString(record?.sandboxId);
    const displayName = asString(record?.displayName);
    const cloudProjectId = asString(record?.cloudProjectId);
    return sandboxId && displayName && cloudProjectId
      ? [{ sandboxId, displayName, cloudProjectId }]
      : [];
  });
}

export function CloudWorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { environments } = useEnvironments();
  const viewerContext = useQuery(clientApi.tenants.viewerContext, isAuthenticated ? {} : "skip");
  const viewer = asRecord(viewerContext);
  const activeTenantId = asString(viewer?.activeTenantId);
  const tenantArgs =
    isAuthenticated && activeTenantId
      ? { tenantId: activeTenantId as GenericId<"tenants"> }
      : "skip";
  const projectsValue = useQuery(clientApi.cloud.listProjects, tenantArgs);
  const threadsValue = useQuery(clientApi.cloud.listThreads, tenantArgs);
  const sandboxesValue = useQuery(clientApi.email.listSandboxes, tenantArgs);
  const projectRecords = useMemo(() => parseProjects(projectsValue), [projectsValue]);
  const replicaQueryMap = useMemo(
    () =>
      Object.fromEntries(
        projectRecords.map((project) => [
          project.cloudProjectId,
          {
            query: clientApi.cloud.listProjectReplicas,
            args: { cloudProjectId: project.cloudProjectId as GenericId<"cloudProjects"> },
          },
        ]),
      ),
    [projectRecords],
  );
  const replicaValues = useQueries(replicaQueryMap);
  const cloudProjects = useMemo<CloudProjectRecord[]>(
    () =>
      projectRecords.map((project) => ({
        ...project,
        replicas: parseReplicas(replicaValues[project.cloudProjectId]),
      })),
    [projectRecords, replicaValues],
  );
  const availableEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => String(environment.environmentId))),
    [environments],
  );
  const materialized = useMemo(
    () =>
      materializeCloudWorkspace({
        cloudProjects,
        cloudThreads: parseThreads(threadsValue),
        availableEnvironmentIds,
      }),
    [availableEnvironmentIds, cloudProjects, threadsValue],
  );
  const emailSandboxes = useMemo(() => parseSandboxes(sandboxesValue), [sandboxesValue]);
  const [selectedEmailSandboxId, setSelectedEmailSandboxId] = useState<string | null>(null);
  const clearSynced = useMutation(clientApi.email.clearSyncedSandboxHistory);
  const getAttachmentDownload = useAction(clientApi.email.getAttachmentDownload);

  useEffect(() => {
    if (
      selectedEmailSandboxId !== null &&
      emailSandboxes.some((sandbox) => sandbox.sandboxId === selectedEmailSandboxId)
    ) {
      return;
    }
    setSelectedEmailSandboxId(emailSandboxes[0]?.sandboxId ?? null);
  }, [emailSandboxes, selectedEmailSandboxId]);

  const clearSyncedEmailHistory = useCallback(async () => {
    if (!isAuthenticated || selectedEmailSandboxId === null) {
      throw new Error("Select an authenticated cloud email sandbox first.");
    }
    const result = (await clearSynced({ sandboxId: selectedEmailSandboxId })) as Value;
    const record = asRecord(result);
    return {
      clearedMessages: typeof record?.clearedMessages === "number" ? record.clearedMessages : 0,
      retainedUnsyncedMessages:
        typeof record?.retainedUnsyncedMessages === "number" ? record.retainedUnsyncedMessages : 0,
    };
  }, [clearSynced, isAuthenticated, selectedEmailSandboxId]);

  const getEmailAttachmentDownload = useCallback(
    async (input: { readonly messageId: EmailMessageId; readonly attachmentId: string }) => {
      if (!isAuthenticated || selectedEmailSandboxId === null) return null;
      const result = (await getAttachmentDownload({
        messageId: input.messageId,
        attachmentId: input.attachmentId,
      })) as Value;
      const record = asRecord(result);
      const url = record?.status === "available" ? asString(record.url) : null;
      const filename = record?.status === "available" ? asString(record.filename) : null;
      return url && filename ? { url, filename } : null;
    },
    [getAttachmentDownload, isAuthenticated, selectedEmailSandboxId],
  );

  const value = useMemo<CloudWorkspaceContextValue>(
    () => ({
      available: isAuthenticated,
      loading:
        isAuthenticated &&
        (viewerContext === undefined ||
          (activeTenantId !== null && (projectsValue === undefined || threadsValue === undefined))),
      activeTenantId,
      projects: materialized.projects,
      threads: materialized.threads,
      emailSandboxes,
      selectedEmailSandboxId,
      selectEmailSandbox: setSelectedEmailSandboxId,
      clearSyncedEmailHistory,
      getEmailAttachmentDownload,
    }),
    [
      activeTenantId,
      clearSyncedEmailHistory,
      emailSandboxes,
      getEmailAttachmentDownload,
      isAuthenticated,
      materialized.projects,
      materialized.threads,
      projectsValue,
      selectedEmailSandboxId,
      threadsValue,
      viewerContext,
    ],
  );
  return <CloudWorkspaceContext value={value}>{children}</CloudWorkspaceContext>;
}

export function useCloudWorkspace(): CloudWorkspaceContextValue {
  return useContext(CloudWorkspaceContext);
}
