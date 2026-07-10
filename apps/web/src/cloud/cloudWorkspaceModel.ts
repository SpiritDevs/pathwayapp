import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@pathwayos/client-runtime/state/shell";
import {
  DEFAULT_MODEL,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ScopedThreadRef,
} from "@pathwayos/contracts";
import { scopeThreadRef } from "@pathwayos/client-runtime/environment";

export interface CloudProjectRecord {
  readonly cloudProjectId: string;
  readonly logicalProjectKey: string;
  readonly title: string;
  readonly repositoryCanonicalKey: string | null;
  readonly repositoryRelativePath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replicas: ReadonlyArray<{
    readonly environmentId: string;
    readonly localProjectId: string;
    readonly displayName: string;
  }>;
}

export interface CloudThreadRecord {
  readonly cloudThreadId: string;
  readonly threadId: string;
  readonly cloudProjectId: string | null;
  readonly sourceEnvironmentId: string;
  readonly title: string;
  readonly state: "active" | "archived" | "deleted";
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloudEntityMetadata {
  readonly cloudOwnership: "cloud";
  readonly cloudId: string;
  readonly sourceEnvironmentId: EnvironmentId;
  readonly sourceAvailable: boolean;
}

export type CloudEnvironmentProject = EnvironmentProject & CloudEntityMetadata;
export type CloudEnvironmentThreadShell = EnvironmentThreadShell & CloudEntityMetadata;

export function isCloudWorkspaceEntity(
  value: EnvironmentProject | EnvironmentThreadShell,
): value is (EnvironmentProject | EnvironmentThreadShell) & CloudEntityMetadata {
  return (value as Partial<CloudEntityMetadata>).cloudOwnership === "cloud";
}

function projectKey(project: Pick<EnvironmentProject, "environmentId" | "id">): string {
  return `${project.environmentId}:${project.id}`;
}

function threadKey(thread: Pick<EnvironmentThreadShell, "environmentId" | "id">): string {
  return `${thread.environmentId}:${thread.id}`;
}

export function materializeCloudWorkspace(input: {
  readonly cloudProjects: ReadonlyArray<CloudProjectRecord>;
  readonly cloudThreads: ReadonlyArray<CloudThreadRecord>;
  readonly availableEnvironmentIds: ReadonlySet<string>;
}): {
  readonly projects: ReadonlyArray<CloudEnvironmentProject>;
  readonly threads: ReadonlyArray<CloudEnvironmentThreadShell>;
} {
  const projects: CloudEnvironmentProject[] = [];
  const projectIdByCloudAndEnvironment = new Map<string, ProjectId>();

  for (const project of input.cloudProjects) {
    for (const replica of project.replicas) {
      const environmentId = EnvironmentId.make(replica.environmentId);
      const localProjectId = ProjectId.make(replica.localProjectId);
      projectIdByCloudAndEnvironment.set(
        `${project.cloudProjectId}:${replica.environmentId}`,
        localProjectId,
      );
      const cloudRepositoryRoot = `cloud-repository:${project.cloudProjectId}`;
      const repositoryRelativePath = project.repositoryRelativePath?.trim();
      projects.push({
        id: localProjectId,
        environmentId,
        title: replica.displayName.trim() || project.title,
        // Cloud project summaries intentionally do not claim a local absolute path.
        // Read-only cloud rows must not use this value to dispatch filesystem commands.
        workspaceRoot:
          repositoryRelativePath && repositoryRelativePath !== "."
            ? `${cloudRepositoryRoot}/${repositoryRelativePath}`
            : cloudRepositoryRoot,
        ...(project.repositoryCanonicalKey
          ? {
              repositoryIdentity: {
                canonicalKey: project.repositoryCanonicalKey,
                locator: {
                  source: "git-remote" as const,
                  remoteName: "origin",
                  remoteUrl: project.repositoryCanonicalKey,
                },
                rootPath: cloudRepositoryRoot,
              },
            }
          : {}),
        defaultModelSelection: null,
        scripts: [],
        createdAt: project.createdAt as EnvironmentProject["createdAt"],
        updatedAt: project.updatedAt as EnvironmentProject["updatedAt"],
        cloudOwnership: "cloud",
        cloudId: project.cloudProjectId,
        sourceEnvironmentId: environmentId,
        sourceAvailable: input.availableEnvironmentIds.has(replica.environmentId),
      });
    }
  }

  const threads = input.cloudThreads.flatMap((thread): CloudEnvironmentThreadShell[] => {
    if (thread.state === "deleted") return [];
    const environmentId = EnvironmentId.make(thread.sourceEnvironmentId);
    const projectId =
      thread.cloudProjectId === null
        ? null
        : (projectIdByCloudAndEnvironment.get(
            `${thread.cloudProjectId}:${thread.sourceEnvironmentId}`,
          ) ?? null);
    return [
      {
        id: ThreadId.make(thread.threadId),
        environmentId,
        projectId,
        title: thread.title,
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: DEFAULT_MODEL,
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: thread.createdAt as EnvironmentThreadShell["createdAt"],
        updatedAt: thread.updatedAt as EnvironmentThreadShell["updatedAt"],
        archivedAt: thread.archivedAt as EnvironmentThreadShell["archivedAt"],
        session: null,
        latestUserMessageAt: null,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        hasActionableProposedPlan: false,
        cloudOwnership: "cloud",
        cloudId: thread.cloudThreadId,
        sourceEnvironmentId: environmentId,
        sourceAvailable: input.availableEnvironmentIds.has(thread.sourceEnvironmentId),
      },
    ];
  });

  return { projects, threads };
}

export function mergeCloudWorkspace(input: {
  readonly localProjects: ReadonlyArray<EnvironmentProject>;
  readonly localThreads: ReadonlyArray<EnvironmentThreadShell>;
  readonly cloudProjects: ReadonlyArray<CloudEnvironmentProject>;
  readonly cloudThreads: ReadonlyArray<CloudEnvironmentThreadShell>;
}): {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
} {
  const projects = [...input.localProjects];
  const projectKeys = new Set(projects.map(projectKey));
  for (const project of input.cloudProjects) {
    if (!projectKeys.has(projectKey(project))) projects.push(project);
  }

  const threads = [...input.localThreads];
  const threadKeys = new Set(threads.map(threadKey));
  for (const thread of input.cloudThreads) {
    if (!threadKeys.has(threadKey(thread))) threads.push(thread);
  }
  return { projects, threads };
}

/** A cloud thread may only target the machine that produced it. */
export function resolveCloudThreadRoute(
  thread: CloudEnvironmentThreadShell,
): ScopedThreadRef | null {
  return thread.sourceAvailable ? scopeThreadRef(thread.sourceEnvironmentId, thread.id) : null;
}
