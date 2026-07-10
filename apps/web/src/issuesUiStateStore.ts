import type {
  IssueDisplayConfig,
  IssueFilterConfig,
  IssueSavedView,
  IssueSavedViewId,
} from "@pathwayos/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const DEFAULT_ISSUE_FILTERS: IssueFilterConfig = {};
export const DEFAULT_ISSUE_DISPLAY: IssueDisplayConfig = {
  viewMode: "list",
  groupBy: "state",
  swimlaneBy: "none",
  orderBy: "manual",
  showCompleted: false,
  showTriage: true,
  showSubIssues: true,
};

interface IssuesUiState {
  readonly filters: IssueFilterConfig;
  readonly display: IssueDisplayConfig;
  readonly personalFilters: IssueFilterConfig;
  readonly personalDisplay: IssueDisplayConfig;
  readonly selectedViewId: IssueSavedViewId | null;
  readonly selectedViewBaseline: { filters: IssueFilterConfig; display: IssueDisplayConfig } | null;
  readonly dirty: boolean;
  readonly pinnedViewIds: ReadonlyArray<IssueSavedViewId>;
  readonly collapsedGroupIds: ReadonlyArray<string>;
  readonly collapsedBoardColumnIds: ReadonlyArray<string>;
  setFilters: (filters: IssueFilterConfig) => void;
  setDisplay: (display: IssueDisplayConfig) => void;
  selectView: (view: IssueSavedView | null) => void;
  markViewSaved: (view: IssueSavedView) => void;
  togglePinnedView: (viewId: IssueSavedViewId) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  toggleBoardColumnCollapsed: (columnId: string) => void;
}

const toggleString = <T extends string>(values: ReadonlyArray<T>, value: T): ReadonlyArray<T> =>
  values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];

export const useIssuesUiStateStore = create<IssuesUiState>()(
  persist(
    (set) => ({
      filters: DEFAULT_ISSUE_FILTERS,
      display: DEFAULT_ISSUE_DISPLAY,
      personalFilters: DEFAULT_ISSUE_FILTERS,
      personalDisplay: DEFAULT_ISSUE_DISPLAY,
      selectedViewId: null,
      selectedViewBaseline: null,
      dirty: false,
      pinnedViewIds: [],
      collapsedGroupIds: [],
      collapsedBoardColumnIds: [],
      setFilters: (filters) => set((state) => ({
        filters,
        ...(state.selectedViewId === null ? { personalFilters: filters } : {}),
        dirty: state.selectedViewId !== null,
      })),
      setDisplay: (display) => set((state) => ({
        display,
        ...(state.selectedViewId === null ? { personalDisplay: display } : {}),
        dirty: state.selectedViewId !== null,
      })),
      selectView: (view) =>
        set((state) =>
          view === null
            ? {
                selectedViewId: null,
                selectedViewBaseline: null,
                filters: state.personalFilters,
                display: state.personalDisplay,
                dirty: false,
              }
            : {
                selectedViewId: view.id,
                selectedViewBaseline: { filters: view.filters, display: view.display },
                filters: view.filters,
                display: view.display,
                dirty: false,
              },
        ),
      markViewSaved: (view) =>
        set({
          selectedViewId: view.id,
          selectedViewBaseline: { filters: view.filters, display: view.display },
          filters: view.filters,
          display: view.display,
          dirty: false,
        }),
      togglePinnedView: (viewId) =>
        set((state) => ({ pinnedViewIds: toggleString(state.pinnedViewIds, viewId) })),
      toggleGroupCollapsed: (groupId) =>
        set((state) => ({ collapsedGroupIds: toggleString(state.collapsedGroupIds, groupId) })),
      toggleBoardColumnCollapsed: (columnId) =>
        set((state) => ({
          collapsedBoardColumnIds: toggleString(state.collapsedBoardColumnIds, columnId),
        })),
    }),
    {
      name: "pathwayos:issues-ui-state:v1",
      version: 1,
      storage: createJSONStorage(() => resolveStorage(window.localStorage)),
      partialize: (state) => ({
        filters: state.filters,
        display: state.display,
        personalFilters: state.personalFilters,
        personalDisplay: state.personalDisplay,
        selectedViewId: state.selectedViewId,
        selectedViewBaseline: state.selectedViewBaseline,
        dirty: state.dirty,
        pinnedViewIds: state.pinnedViewIds,
        collapsedGroupIds: state.collapsedGroupIds,
        collapsedBoardColumnIds: state.collapsedBoardColumnIds,
      }),
    },
  ),
);
