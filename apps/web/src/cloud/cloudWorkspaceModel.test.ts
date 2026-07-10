import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@pathwayos/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@pathwayos/client-runtime/state/shell";

import {
  materializeCloudWorkspace,
  mergeCloudWorkspace,
  resolveCloudThreadRoute,
} from "./cloudWorkspaceModel";

const cloudProject = {
  cloudProjectId: "cloud-project-1",
  logicalProjectKey: "repo:one",
  title: "Cloud project",
  repositoryCanonicalKey: "github.com/example/one",
  repositoryRelativePath: ".",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:01:00.000Z",
  replicas: [
    {
      environmentId: "source-environment",
      localProjectId: "local-project",
      displayName: "Source checkout",
    },
  ],
} as const;

const cloudThread = {
  cloudThreadId: "cloud-thread-1",
  threadId: "thread-1",
  cloudProjectId: "cloud-project-1",
  sourceEnvironmentId: "source-environment",
  title: "Source-owned chat",
  state: "active" as const,
  archivedAt: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:01:00.000Z",
};

describe("cloud workspace model", () => {
  it("materializes source ownership and never substitutes another environment", () => {
    const result = materializeCloudWorkspace({
      cloudProjects: [cloudProject],
      cloudThreads: [cloudThread],
      availableEnvironmentIds: new Set(["different-environment"]),
    });

    expect(result.threads[0]).toMatchObject({
      environmentId: "source-environment",
      sourceEnvironmentId: "source-environment",
      projectId: "local-project",
      sourceAvailable: false,
    });
    expect(resolveCloudThreadRoute(result.threads[0]!)).toBeNull();
  });

  it("routes an available cloud thread to its exact source environment", () => {
    const result = materializeCloudWorkspace({
      cloudProjects: [cloudProject],
      cloudThreads: [cloudThread],
      availableEnvironmentIds: new Set(["source-environment"]),
    });

    expect(resolveCloudThreadRoute(result.threads[0]!)).toEqual({
      environmentId: EnvironmentId.make("source-environment"),
      threadId: ThreadId.make("thread-1"),
    });
  });

  it("keeps local entities authoritative while retaining cloud-only rows", () => {
    const materialized = materializeCloudWorkspace({
      cloudProjects: [cloudProject],
      cloudThreads: [cloudThread],
      availableEnvironmentIds: new Set(["source-environment"]),
    });
    const {
      cloudOwnership: _projectOwnership,
      cloudId: _projectCloudId,
      sourceEnvironmentId: _projectSource,
      sourceAvailable: _projectAvailability,
      ...projectSnapshot
    } = materialized.projects[0]!;
    const localProject: EnvironmentProject = {
      ...projectSnapshot,
      title: "Fresh local title",
    };
    const {
      cloudOwnership: _threadOwnership,
      cloudId: _threadCloudId,
      sourceEnvironmentId: _threadSource,
      sourceAvailable: _threadAvailability,
      ...threadSnapshot
    } = materialized.threads[0]!;
    const localThread: EnvironmentThreadShell = {
      ...threadSnapshot,
      title: "Fresh local chat",
    };
    const merged = mergeCloudWorkspace({
      localProjects: [localProject],
      localThreads: [localThread],
      cloudProjects: materialized.projects,
      cloudThreads: [
        ...materialized.threads,
        {
          ...materialized.threads[0]!,
          id: ThreadId.make("cloud-only-thread"),
          cloudId: "cloud-thread-2",
        },
      ],
    });

    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0]?.title).toBe("Fresh local title");
    expect(merged.threads.map((thread) => thread.title)).toContain("Fresh local chat");
    expect(merged.threads.map((thread) => thread.id)).toContain(ThreadId.make("cloud-only-thread"));
  });

  it("does not expose deleted cloud threads", () => {
    const result = materializeCloudWorkspace({
      cloudProjects: [cloudProject],
      cloudThreads: [{ ...cloudThread, state: "deleted" }],
      availableEnvironmentIds: new Set(["source-environment"]),
    });

    expect(result.threads).toEqual([]);
    expect(result.projects[0]?.id).toBe(ProjectId.make("local-project"));
  });
});
