import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type {
  GroupBy,
  IssueActor,
  IssueActorId,
  IssueCommand,
  IssueCycleId,
  IssueDisplayConfig,
  IssueEpic,
  IssueEpicId,
  IssueFilterConfig,
  IssueLabel,
  IssueLabelId,
  IssuePriority,
  IssueStateId,
  IssueTeam,
  IssueTeamId,
  IssueWorkflowState,
} from "@pathwayos/contracts";

import { PRIORITY_ORDER, PRIORITY_PRESENTATION } from "./issuePresentation";

export interface IssueGroup {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | null;
  readonly issues: ReadonlyArray<EnvironmentIssue>;
  readonly color?: string;
}

export interface IssueLookupData {
  readonly states: ReadonlyArray<IssueWorkflowState>;
  readonly actors: ReadonlyArray<IssueActor>;
  readonly labels: ReadonlyArray<IssueLabel>;
  readonly teams: ReadonlyArray<IssueTeam>;
  readonly cycles: ReadonlyArray<{ id: string; name: string | null; number: number }>;
  readonly epics: ReadonlyArray<IssueEpic>;
}

export const issueRef = (issue: EnvironmentIssue): ScopedIssueRef => ({
  environmentId: issue.environmentId,
  issueId: issue.id,
});

export function navigateToIssue(identifier: string): void {
  const href = `/issues/${encodeURIComponent(identifier)}`;
  window.history.pushState(window.history.state, "", href);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

export function filterIssues(
  issues: ReadonlyArray<EnvironmentIssue>,
  filters: IssueFilterConfig,
  display: IssueDisplayConfig,
  states: ReadonlyArray<IssueWorkflowState>,
): EnvironmentIssue[] {
  const stateById = new Map(states.map((state) => [state.id, state]));
  const search = filters.searchText?.trim().toLowerCase() ?? "";
  return issues.filter((issue) => {
    const state = stateById.get(issue.stateId);
    if (!filters.includeDeleted && issue.deletedAt !== null) return false;
    if (!display.showCompleted && state?.category === "completed") return false;
    if (!display.showTriage && state?.category === "triage") return false;
    if (!display.showSubIssues && issue.parentIssueId !== null) return false;
    if (filters.teamIds?.length && (issue.teamId === null || !filters.teamIds.includes(issue.teamId))) return false;
    if (filters.stateIds?.length && !filters.stateIds.includes(issue.stateId)) return false;
    if (filters.stateCategories?.length && (!state || !filters.stateCategories.includes(state.category))) return false;
    if (filters.assigneeActorIds?.length && (issue.assigneeActorId === null || !filters.assigneeActorIds.includes(issue.assigneeActorId))) return false;
    if (filters.creatorActorIds?.length && !filters.creatorActorIds.includes(issue.creatorActorId)) return false;
    if (filters.priorities?.length && !filters.priorities.includes(issue.priority)) return false;
    if (filters.labelIds?.length && !filters.labelIds.every((labelId) => issue.labelIds.includes(labelId))) return false;
    if (filters.cycleIds?.length && (issue.cycleId === null || !filters.cycleIds.includes(issue.cycleId))) return false;
    if (filters.epicIds?.length && (issue.epicId === null || !filters.epicIds.includes(issue.epicId))) return false;
    if (filters.parentIssueId !== undefined && issue.parentIssueId !== filters.parentIssueId) return false;
    if (filters.dueBefore && (!issue.dueDate || issue.dueDate > filters.dueBefore)) return false;
    return !search || issue.identifier.toLowerCase().includes(search) || issue.title.toLowerCase().includes(search);
  });
}

function sortedIssues(issues: ReadonlyArray<EnvironmentIssue>, display: IssueDisplayConfig) {
  return [...issues].sort((left, right) => {
    switch (display.orderBy) {
      case "priority":
        return PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority) || left.id.localeCompare(right.id);
      case "dueDate":
        return (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.id.localeCompare(right.id);
      case "createdAt":
        return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
      case "updatedAt":
        return right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
      case "manual":
        return left.orderKey.localeCompare(right.orderKey) || left.id.localeCompare(right.id);
    }
  });
}

export function groupIssues(
  issues: ReadonlyArray<EnvironmentIssue>,
  groupBy: GroupBy,
  display: IssueDisplayConfig,
  lookup: IssueLookupData,
): IssueGroup[] {
  const buckets = new Map<string, EnvironmentIssue[]>();
  const valueFor = (issue: EnvironmentIssue): string | number | null => {
    switch (groupBy) {
      case "state": return issue.stateId;
      case "assignee": return issue.assigneeActorId;
      case "priority": return issue.priority;
      case "label": return issue.labelIds[0] ?? null;
      case "cycle": return issue.cycleId;
      case "epic": return issue.epicId;
      case "team": return issue.teamId;
      case "none": return "all";
    }
  };
  for (const issue of issues) {
    const value = valueFor(issue);
    const key = value === null ? "none" : String(value);
    buckets.set(key, [...(buckets.get(key) ?? []), issue]);
  }
  const definitions: Array<{ value: string | number | null; label: string; color?: string; position: number }> = [];
  switch (groupBy) {
    case "state": definitions.push(...lookup.states.map((item) => ({ value: item.id, label: item.name, color: item.color, position: item.position }))); break;
    case "assignee": definitions.push(...lookup.actors.map((item, position) => ({ value: item.id, label: item.displayName, color: item.avatarColor, position })), { value: null, label: "Unassigned", position: 9999 }); break;
    case "priority": definitions.push(...PRIORITY_ORDER.map((value, position) => ({ value, label: PRIORITY_PRESENTATION[value].label, position }))); break;
    case "label": definitions.push(...lookup.labels.map((item, position) => ({ value: item.id, label: item.name, color: item.color, position })), { value: null, label: "No label", position: 9999 }); break;
    case "cycle": definitions.push(...lookup.cycles.map((item, position) => ({ value: item.id, label: item.name ?? `Cycle ${item.number}`, position })), { value: null, label: "No cycle", position: 9999 }); break;
    case "epic": definitions.push(...lookup.epics.map((item, position) => ({ value: item.id, label: item.name, color: item.color ?? undefined, position })), { value: null, label: "No epic", position: 9999 }); break;
    case "team": definitions.push(...lookup.teams.map((item, position) => ({ value: item.id, label: item.name, color: item.color ?? undefined, position })), { value: null, label: "Workspace", position: 9999 }); break;
    case "none": definitions.push({ value: "all", label: "All issues", position: 0 }); break;
  }
  return definitions
    .filter((definition) => buckets.has(definition.value === null ? "none" : String(definition.value)) || groupBy !== "none")
    .sort((left, right) => left.position - right.position)
    .map((definition) => ({
      id: `${groupBy}:${definition.value ?? "none"}`,
      label: definition.label,
      value: definition.value,
      ...(definition.color ? { color: definition.color } : {}),
      issues: sortedIssues(buckets.get(definition.value === null ? "none" : String(definition.value)) ?? [], display),
    }));
}

type IssueUpdatePatch = Extract<IssueCommand, { readonly type: "issue.update" }>["patch"];

export function patchForGroup(groupBy: GroupBy, value: string | number | null): {
  patch?: IssueUpdatePatch;
  teamId?: IssueTeamId | null;
} {
  switch (groupBy) {
    case "state": return { patch: { stateId: value as IssueStateId } };
    case "assignee": return { patch: { assigneeActorId: value as IssueActorId | null } };
    case "priority": return { patch: { priority: value as IssuePriority } };
    case "label": return { patch: { labelIds: value === null ? [] : [value as IssueLabelId] } };
    case "cycle": return { patch: { cycleId: value as IssueCycleId | null } };
    case "epic": return { patch: { epicId: value as IssueEpicId | null } };
    case "team": return { teamId: value as IssueTeamId | null };
    case "none": return {};
  }
}
