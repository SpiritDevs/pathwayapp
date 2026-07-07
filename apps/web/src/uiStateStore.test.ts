import { ProjectId, ThreadId } from "@pathwayos/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  addProjectFolder,
  legacyProjectCwdPreferenceKey,
  markThreadUnread,
  markThreadVisited,
  parsePersistedState,
  PERSISTED_STATE_KEY,
  type PersistedUiState,
  persistState,
  removeProjectFolder,
  reorderProjects,
  resolveProjectArchived,
  resolveProjectExpanded,
  resolveProjectFolderId,
  resolveProjectPinned,
  setDefaultAdvertisedEndpointKey,
  setFolderPinned,
  setProjectExpanded,
  setProjectFolderMembership,
  setProjectPinned,
  setProjectsArchived,
  setThreadChangedFilesExpanded,
  type SidebarProjectFolder,
  type UiState,
  updateProjectFolder,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    pinnedProjectIds: [],
    projectFolders: [],
    pinnedFolderIds: [],
    archivedProjectKeys: [],
    threadLastVisitedAtById: {},
    threadChangedFilesExpandedById: {},
    defaultAdvertisedEndpointKey: null,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<SidebarProjectFolder> = {}): SidebarProjectFolder {
  return {
    id: "folder-1",
    name: "Client work",
    icon: "folder",
    color: "default",
    projectKeys: [],
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("stores server timestamps without moving visit state backwards", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();
    const visited = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(visited.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
    expect(markThreadVisited(visited, threadId, "2026-02-25T12:30:00.000Z")).toBe(visited);
    expect(markThreadVisited(visited, threadId, "not-a-date")).toBe(visited);
  });

  it("marks a completed thread unread using the server completion timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
    expect(markThreadUnread(next, threadId, null)).toBe(next);
  });

  it("resolves project expansion from logical, physical, and legacy preference keys", () => {
    const physicalKey = "environment:/repo/project";
    const legacyKey = legacyProjectCwdPreferenceKey("/repo/project");

    expect(resolveProjectExpanded({ logical: false, [physicalKey]: true }, ["logical"])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [physicalKey]: false }, ["new-logical", physicalKey])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [legacyKey]: false }, ["new-logical", legacyKey])).toBe(false);
    expect(resolveProjectExpanded({}, ["new-logical"])).toBe(true);
  });

  it("sets expansion for every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const next = setProjectExpanded(initialState, keys, false);

    expect(next.projectExpandedById).toEqual({
      logical: false,
      "environment-a:/repo": false,
      "environment-b:/repo": false,
    });
    expect(setProjectExpanded(next, keys, false)).toBe(next);
  });

  it("pins and unpins every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const pinned = setProjectPinned(initialState, keys, true);

    expect(pinned.pinnedProjectIds).toEqual(keys);
    expect(resolveProjectPinned(pinned.pinnedProjectIds, ["missing", keys[1]!])).toBe(true);
    expect(setProjectPinned(pinned, keys, true)).toBe(pinned);

    const unpinned = setProjectPinned(pinned, [keys[0]!, keys[2]!], false);

    expect(unpinned.pinnedProjectIds).toEqual([keys[1]]);
    expect(resolveProjectPinned(unpinned.pinnedProjectIds, [keys[0]!])).toBe(false);
  });

  it("adds, updates, and removes project folders", () => {
    const added = addProjectFolder(makeUiState(), makeFolder({ projectKeys: ["stale-key"] }));

    expect(added.projectFolders).toEqual([makeFolder()]);
    expect(addProjectFolder(added, makeFolder({ name: "Duplicate" }))).toBe(added);

    const updated = updateProjectFolder(added, "folder-1", {
      name: "  Renamed  ",
      icon: "rocket",
      color: "blue",
    });

    expect(updated.projectFolders).toEqual([
      makeFolder({ name: "Renamed", icon: "rocket", color: "blue" }),
    ]);
    expect(updateProjectFolder(updated, "folder-1", { name: "   " })).toBe(updated);
    expect(updateProjectFolder(updated, "missing", { name: "Nope" })).toBe(updated);

    const pinned = setFolderPinned(updated, "folder-1", true);
    const removed = removeProjectFolder(pinned, "folder-1");

    expect(removed.projectFolders).toEqual([]);
    expect(removed.pinnedFolderIds).toEqual([]);
    expect(removeProjectFolder(removed, "folder-1")).toBe(removed);
  });

  it("moves projects between folders with every stable key", () => {
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];
    const twoFolders = addProjectFolder(
      addProjectFolder(makeUiState(), makeFolder()),
      makeFolder({ id: "folder-2", name: "Archive-ready" }),
    );

    const inFirst = setProjectFolderMembership(twoFolders, keys, "folder-1");

    expect(resolveProjectFolderId(inFirst.projectFolders, ["missing", keys[1]!])).toBe("folder-1");
    expect(setProjectFolderMembership(inFirst, keys, "folder-1")).toBe(inFirst);

    const inSecond = setProjectFolderMembership(inFirst, keys, "folder-2");

    expect(resolveProjectFolderId(inSecond.projectFolders, keys)).toBe("folder-2");
    expect(inSecond.projectFolders[0]!.projectKeys).toEqual([]);

    const inNone = setProjectFolderMembership(inSecond, keys, null);

    expect(resolveProjectFolderId(inNone.projectFolders, keys)).toBe(null);
    expect(setProjectFolderMembership(inNone, keys, "missing-folder")).toBe(inNone);
  });

  it("pins and unpins folders by id", () => {
    const state = addProjectFolder(makeUiState(), makeFolder());
    const pinned = setFolderPinned(state, "folder-1", true);

    expect(pinned.pinnedFolderIds).toEqual(["folder-1"]);
    expect(setFolderPinned(pinned, "folder-1", true)).toBe(pinned);
    expect(setFolderPinned(pinned, "folder-1", false).pinnedFolderIds).toEqual([]);
  });

  it("archives and unarchives every stable key belonging to a logical project", () => {
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];
    const archived = setProjectsArchived(makeUiState(), keys, true);

    expect(archived.archivedProjectKeys).toEqual(keys);
    expect(resolveProjectArchived(archived.archivedProjectKeys, ["missing", keys[2]!])).toBe(true);
    expect(setProjectsArchived(archived, keys, true)).toBe(archived);

    const unarchived = setProjectsArchived(archived, keys, false);

    expect(unarchived.archivedProjectKeys).toEqual([]);
    expect(resolveProjectArchived(unarchived.archivedProjectKeys, keys)).toBe(false);
  });

  it("reorders from the current atom-derived project order", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const currentOrder = [project1, project2, project3];

    const next = reorderProjects(makeUiState(), currentOrder, [project1], [project3]);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("moves grouped project members together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const currentOrder = [keyALocal, keyARemote, keyB, keyC];

    const next = reorderProjects(makeUiState(), currentOrder, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("does not reorder missing or identical groups", () => {
    const currentOrder = ["env-local:proj-a", "env-local:proj-b"];
    const state = makeUiState();

    expect(reorderProjects(state, currentOrder, ["env-local:missing"], ["env-local:proj-b"])).toBe(
      state,
    );
    expect(reorderProjects(state, currentOrder, ["env-local:proj-a"], ["env-local:proj-a"])).toBe(
      state,
    );
  });

  it("stores only collapsed changed-file turns", () => {
    const threadId = ThreadId.make("thread-1");
    const collapsed = setThreadChangedFilesExpanded(makeUiState(), threadId, "turn-1", false);

    expect(collapsed.threadChangedFilesExpandedById).toEqual({
      [threadId]: {
        "turn-1": false,
      },
    });
    expect(
      setThreadChangedFilesExpanded(collapsed, threadId, "turn-1", true)
        .threadChangedFilesExpandedById,
    ).toEqual({});
  });

  it("stores the endpoint preference by stable key", () => {
    const next = setDefaultAdvertisedEndpointKey(makeUiState(), "desktop-core:lan:http");

    expect(next.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
    expect(setDefaultAdvertisedEndpointKey(next, "desktop-core:lan:http")).toBe(next);
    expect(setDefaultAdvertisedEndpointKey(next, "")).toMatchObject({
      defaultAdvertisedEndpointKey: null,
    });
  });
});

describe("parsePersistedState", () => {
  it("hydrates raw UI-owned state without server entities", () => {
    const parsed = parsePersistedState({
      projectExpandedById: {
        logical: false,
        invalid: "no" as unknown as boolean,
      },
      projectOrder: ["physical-b", "", "physical-a", "physical-b"],
      pinnedProjectIds: ["logical", "", "logical", "physical-a"],
      projectFolders: [
        {
          id: "folder-1",
          name: "",
          icon: "",
          color: "",
          projectKeys: ["logical", "", "logical"],
        },
        { id: "folder-1", name: "Duplicate" },
        { id: "" },
        "not-a-folder",
      ] as unknown as SidebarProjectFolder[],
      pinnedFolderIds: ["folder-1", "", "folder-1"],
      archivedProjectKeys: ["physical-b", "", "physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
        invalid: "not-a-date",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
    });

    expect(parsed).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      pinnedProjectIds: ["logical", "physical-a"],
      projectFolders: [
        {
          id: "folder-1",
          name: "New folder",
          icon: "folder",
          color: "default",
          projectKeys: ["logical"],
        },
      ],
      pinnedFolderIds: ["folder-1"],
      archivedProjectKeys: ["physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });
  });

  it("migrates legacy CWD project preferences into local alias keys", () => {
    const parsed = parsePersistedState({
      collapsedProjectCwds: ["/repo/b"],
      expandedProjectCwds: ["/repo/a"],
      projectOrderCwds: ["/repo/b", "/repo/a"],
    });
    const projectAKey = legacyProjectCwdPreferenceKey("/repo/a");
    const projectBKey = legacyProjectCwdPreferenceKey("/repo/b");

    expect(parsed.projectOrder).toEqual([projectBKey, projectAKey]);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectAKey])).toBe(true);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectBKey])).toBe(false);
    expect(resolveProjectExpanded(parsed.projectExpandedById, ["unknown"])).toBe(true);
  });

  it("preserves legacy expanded-only semantics for one-way migration", () => {
    const parsed = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/a"),
      ]),
    ).toBe(true);
    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/b"),
      ]),
    ).toBe(false);
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists raw UI preferences including thread visit markers", () => {
    const state = makeUiState({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      pinnedProjectIds: ["logical"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
    });

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      pinnedProjectIds: ["logical"],
      projectFolders: [],
      pinnedFolderIds: [],
      archivedProjectKeys: [],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });
    expect(parsePersistedState(persisted)).toEqual({
      ...state,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });
  });

  it("drops the temporary expanded-only migration fallback when rewriting state", () => {
    const migrated = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    persistState(migrated);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(resolveProjectExpanded(persisted.projectExpandedById ?? {}, ["unknown"])).toBe(true);
  });
});
