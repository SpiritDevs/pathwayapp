import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentIssue,
  ScopedIssueRef,
} from "@pathwayos/client-runtime/state/issues";
import type {
  DelegationQueueState,
  EnvironmentId,
  IssueActor,
  IssueActorId,
  IssueCycle,
  IssueCycleId,
  IssueDetail,
  IssueEpic,
  IssueEpicId,
  IssueId,
  IssueLabel,
  IssueLabelId,
  IssueMilestone,
  IssuePriority,
  IssueRelation,
  IssueSavedView,
  IssueStateId,
  IssueTeam,
  IssueTeamId,
  IssueThreadLink,
  IssueWorkflowState,
} from "@pathwayos/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useMemo } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import {
  environmentIssues,
  environmentIssuesSnapshot,
  issueDetails,
  issuesEnvironment,
} from "./issues";
import { type EnvironmentQueryView, useEnvironmentQuery } from "./query";

const EMPTY_TEAMS: ReadonlyArray<IssueTeam> = Object.freeze([]);
const EMPTY_STATES: ReadonlyArray<IssueWorkflowState> = Object.freeze([]);
const EMPTY_LABELS: ReadonlyArray<IssueLabel> = Object.freeze([]);
const EMPTY_ACTORS: ReadonlyArray<IssueActor> = Object.freeze([]);
const EMPTY_CYCLES: ReadonlyArray<IssueCycle> = Object.freeze([]);
const EMPTY_EPICS: ReadonlyArray<IssueEpic> = Object.freeze([]);
const EMPTY_MILESTONES: ReadonlyArray<IssueMilestone> = Object.freeze([]);
const EMPTY_SAVED_VIEWS: ReadonlyArray<IssueSavedView> = Object.freeze([]);
const EMPTY_RELATIONS: ReadonlyArray<IssueRelation> = Object.freeze([]);
const EMPTY_THREAD_LINKS: ReadonlyArray<IssueThreadLink> = Object.freeze([]);

const EMPTY_ISSUE_ATOM = Atom.make<EnvironmentIssue | null>(null).pipe(
  Atom.withLabel("web-issue:empty"),
);
const EMPTY_DETAIL_ATOM = Atom.make<IssueDetail | null>(null).pipe(
  Atom.withLabel("web-issue-detail:empty"),
);
const EMPTY_TEAMS_ATOM = Atom.make(EMPTY_TEAMS).pipe(Atom.withLabel("web-issue-teams:empty"));
const EMPTY_STATES_ATOM = Atom.make(EMPTY_STATES).pipe(Atom.withLabel("web-issue-states:empty"));
const EMPTY_LABELS_ATOM = Atom.make(EMPTY_LABELS).pipe(Atom.withLabel("web-issue-labels:empty"));
const EMPTY_ACTORS_ATOM = Atom.make(EMPTY_ACTORS).pipe(Atom.withLabel("web-issue-actors:empty"));
const EMPTY_CYCLES_ATOM = Atom.make(EMPTY_CYCLES).pipe(Atom.withLabel("web-issue-cycles:empty"));
const EMPTY_EPICS_ATOM = Atom.make(EMPTY_EPICS).pipe(Atom.withLabel("web-issue-epics:empty"));
const EMPTY_MILESTONES_ATOM = Atom.make(EMPTY_MILESTONES).pipe(Atom.withLabel("web-issue-milestones:empty"));
const EMPTY_SAVED_VIEWS_ATOM = Atom.make(EMPTY_SAVED_VIEWS).pipe(Atom.withLabel("web-issue-saved-views:empty"));
const EMPTY_RELATIONS_ATOM = Atom.make(EMPTY_RELATIONS).pipe(Atom.withLabel("web-issue-relations:empty"));
const EMPTY_THREAD_LINKS_ATOM = Atom.make(EMPTY_THREAD_LINKS).pipe(Atom.withLabel("web-issue-thread-links:empty"));
const EMPTY_STATE_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueStateId, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-state-groups:empty"));
const EMPTY_ASSIGNEE_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueActorId | null, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-assignee-groups:empty"));
const EMPTY_PRIORITY_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssuePriority, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-priority-groups:empty"));
const EMPTY_LABEL_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueLabelId | null, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-label-groups:empty"));
const EMPTY_CYCLE_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueCycleId | null, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-cycle-groups:empty"));
const EMPTY_EPIC_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueEpicId | null, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-epic-groups:empty"));
const EMPTY_TEAM_GROUPS_ATOM = Atom.make<
  ReadonlyMap<IssueTeamId | null, ReadonlyArray<ScopedIssueRef>>
>(new Map()).pipe(Atom.withLabel("web-issue-team-groups:empty"));

export interface IssuesSnapshotMeta {
  readonly online: boolean;
  readonly syncedAt: string | null;
  readonly workspaceKey: string | null;
  readonly viewerUserId: string | null;
}

const EMPTY_SNAPSHOT_META: IssuesSnapshotMeta = Object.freeze({
  online: false,
  syncedAt: null,
  workspaceKey: null,
  viewerUserId: null,
});
const EMPTY_SNAPSHOT_META_ATOM = Atom.make(EMPTY_SNAPSHOT_META).pipe(
  Atom.withLabel("web-issues-snapshot-meta:empty"),
);
const snapshotMetaAtom = Atom.family((environmentId: EnvironmentId) => {
  let previous = EMPTY_SNAPSHOT_META;
  return Atom.make((get): IssuesSnapshotMeta => {
    const snapshot = get(environmentIssuesSnapshot.snapshotAtom(environmentId));
    if (snapshot === null) return EMPTY_SNAPSHOT_META;
    const next = {
      online: snapshot.online,
      syncedAt: snapshot.syncedAt,
      workspaceKey: snapshot.workspaceKey,
      viewerUserId: snapshot.viewerUserId,
    };
    if (
      previous.online === next.online &&
      previous.syncedAt === next.syncedAt &&
      previous.workspaceKey === next.workspaceKey &&
      previous.viewerUserId === next.viewerUserId
    ) return previous;
    previous = next;
    return previous;
  }).pipe(Atom.withLabel(`web-issues-snapshot-meta:${environmentId}`));
});

export function useIssues(): ReadonlyArray<EnvironmentIssue> {
  return useAtomValue(environmentIssues.issuesAtom);
}

export function useIssue(ref: ScopedIssueRef | null): EnvironmentIssue | null {
  return useAtomValue(ref === null ? EMPTY_ISSUE_ATOM : environmentIssues.issueAtom(ref));
}

export function useIssueDetail(ref: ScopedIssueRef | null): IssueDetail | null {
  return useAtomValue(ref === null ? EMPTY_DETAIL_ATOM : issueDetails.detailAtom(ref));
}

export function useIssueTeams(environmentId: EnvironmentId | null): ReadonlyArray<IssueTeam> {
  return useAtomValue(
    environmentId === null
      ? EMPTY_TEAMS_ATOM
      : environmentIssues.environmentTeamsAtom(environmentId),
  );
}

export function useIssueStates(environmentId: EnvironmentId | null): ReadonlyArray<IssueWorkflowState> {
  return useAtomValue(environmentId === null ? EMPTY_STATES_ATOM : environmentIssues.environmentStatesAtom(environmentId));
}

export function useIssueLabels(environmentId: EnvironmentId | null): ReadonlyArray<IssueLabel> {
  return useAtomValue(environmentId === null ? EMPTY_LABELS_ATOM : environmentIssues.environmentLabelsAtom(environmentId));
}

export function useIssueActors(environmentId: EnvironmentId | null): ReadonlyArray<IssueActor> {
  return useAtomValue(environmentId === null ? EMPTY_ACTORS_ATOM : environmentIssues.environmentActorsAtom(environmentId));
}

export function useIssueCycles(environmentId: EnvironmentId | null): ReadonlyArray<IssueCycle> {
  return useAtomValue(environmentId === null ? EMPTY_CYCLES_ATOM : environmentIssues.environmentCyclesAtom(environmentId));
}

export function useIssueEpics(environmentId: EnvironmentId | null): ReadonlyArray<IssueEpic> {
  return useAtomValue(environmentId === null ? EMPTY_EPICS_ATOM : environmentIssues.environmentEpicsAtom(environmentId));
}

export function useIssueMilestones(environmentId: EnvironmentId | null): ReadonlyArray<IssueMilestone> {
  return useAtomValue(environmentId === null ? EMPTY_MILESTONES_ATOM : environmentIssues.environmentMilestonesAtom(environmentId));
}

export function useIssueSavedViews(environmentId: EnvironmentId | null): ReadonlyArray<IssueSavedView> {
  return useAtomValue(environmentId === null ? EMPTY_SAVED_VIEWS_ATOM : environmentIssues.environmentSavedViewsAtom(environmentId));
}

export function useIssueRelations(ref: ScopedIssueRef | null): ReadonlyArray<IssueRelation> {
  const environmentId = ref?.environmentId ?? null;
  const issueId = ref?.issueId ?? null;
  const all = useAtomValue(
    environmentId === null
      ? EMPTY_RELATIONS_ATOM
      : environmentIssues.environmentRelationsAtom(environmentId),
  );
  return useMemo(
    () =>
      issueId === null
        ? EMPTY_RELATIONS
        : all.filter(
            (relation) => relation.issueId === issueId || relation.relatedIssueId === issueId,
          ),
    [all, issueId],
  );
}

export function useIssueThreadLinks(ref: ScopedIssueRef | null): ReadonlyArray<IssueThreadLink> {
  const environmentId = ref?.environmentId ?? null;
  const issueId = ref?.issueId ?? null;
  const all = useAtomValue(environmentId === null ? EMPTY_THREAD_LINKS_ATOM : environmentIssues.environmentThreadLinksAtom(environmentId));
  return useMemo(
    () => issueId === null ? EMPTY_THREAD_LINKS : all.filter((link) => link.issueId === issueId),
    [all, issueId],
  );
}

export function useDelegationState(environmentId: EnvironmentId | null): EnvironmentQueryView<DelegationQueueState> {
  return useEnvironmentQuery(
    environmentId === null
      ? null
      : issuesEnvironment.delegationState({ environmentId, input: {} }),
  );
}

export function useIssuesSnapshotMeta(environmentId: EnvironmentId | null): IssuesSnapshotMeta {
  return useAtomValue(environmentId === null ? EMPTY_SNAPSHOT_META_ATOM : snapshotMetaAtom(environmentId));
}

export function useIssueRefsByState(environmentId: EnvironmentId | null): ReadonlyMap<IssueStateId, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_STATE_GROUPS_ATOM : environmentIssues.environmentIssueRefsByStateAtom(environmentId));
}
export function useIssueRefsByAssignee(environmentId: EnvironmentId | null): ReadonlyMap<IssueActorId | null, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_ASSIGNEE_GROUPS_ATOM : environmentIssues.environmentIssueRefsByAssigneeAtom(environmentId));
}
export function useIssueRefsByPriority(environmentId: EnvironmentId | null): ReadonlyMap<IssuePriority, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_PRIORITY_GROUPS_ATOM : environmentIssues.environmentIssueRefsByPriorityAtom(environmentId));
}
export function useIssueRefsByLabel(environmentId: EnvironmentId | null): ReadonlyMap<IssueLabelId | null, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_LABEL_GROUPS_ATOM : environmentIssues.environmentIssueRefsByLabelAtom(environmentId));
}
export function useIssueRefsByCycle(environmentId: EnvironmentId | null): ReadonlyMap<IssueCycleId | null, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_CYCLE_GROUPS_ATOM : environmentIssues.environmentIssueRefsByCycleAtom(environmentId));
}
export function useIssueRefsByEpic(environmentId: EnvironmentId | null): ReadonlyMap<IssueEpicId | null, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_EPIC_GROUPS_ATOM : environmentIssues.environmentIssueRefsByEpicAtom(environmentId));
}
export function useIssueRefsByTeam(environmentId: EnvironmentId | null): ReadonlyMap<IssueTeamId | null, ReadonlyArray<ScopedIssueRef>> {
  return useAtomValue(environmentId === null ? EMPTY_TEAM_GROUPS_ATOM : environmentIssues.environmentIssueRefsByTeamAtom(environmentId));
}

export function readIssue(ref: ScopedIssueRef): EnvironmentIssue | null {
  return appAtomRegistry.get(environmentIssues.issueAtom(ref));
}

export function findIssueRef(issueId: IssueId): ScopedIssueRef | null {
  return (
    appAtomRegistry.get(environmentIssues.issueRefsAtom).find((ref) => ref.issueId === issueId) ??
    null
  );
}
