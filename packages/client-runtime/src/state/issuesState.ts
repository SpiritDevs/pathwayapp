import {
  WS_METHODS,
  type EnvironmentId,
  type Issue,
  type IssueActor,
  type IssueActorId,
  type IssueCycleId,
  type IssueCycle,
  type IssueEpic,
  type IssueEpicId,
  type IssueId,
  type IssueLabel,
  type IssueLabelId,
  type IssuePriority,
  type IssueMilestone,
  type IssueRelation,
  type IssueSavedView,
  type IssuesSnapshot,
  type IssuesStreamItem,
  type IssueStateId,
  type IssueTeam,
  type IssueTeamId,
  type IssueTeamMembership,
  type IssueThreadLink,
  type IssueWorkflowState,
} from "@pathwayos/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribe } from "../rpc/client.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import { arrayElementsEqual, issueKey, issueRefsEqual, parseIssueKey } from "./entities.ts";
import { applyIssuesStreamItem } from "./issuesReducer.ts";
import type { EnvironmentIssue, ScopedIssueRef } from "./models.ts";
import { scopeIssue } from "./models.ts";
import { followStreamInEnvironment } from "./runtime.ts";

export interface EnvironmentIssuesState {
  readonly snapshot: Option.Option<IssuesSnapshot>;
  readonly error: Option.Option<string>;
}

export const EMPTY_ENVIRONMENT_ISSUES_STATE: EnvironmentIssuesState = {
  snapshot: Option.none(),
  error: Option.none(),
};

const ISSUES_SYNCHRONIZATION_ERROR_MESSAGE = "Could not synchronize issues.";

export const makeEnvironmentIssuesState = Effect.fn("EnvironmentIssuesState.make")(function* () {
  const state = yield* SubscriptionRef.make<EnvironmentIssuesState>(EMPTY_ENVIRONMENT_ISSUES_STATE);

  const applyItem = Effect.fn("EnvironmentIssuesState.applyItem")(function* (
    item: IssuesStreamItem,
  ) {
    const current = yield* SubscriptionRef.get(state);
    const snapshot = Option.match(current.snapshot, {
      onNone: () => (item.kind === "snapshot" ? item.snapshot : null),
      onSome: (value) => applyIssuesStreamItem(value, item),
    });
    if (snapshot !== null) {
      yield* SubscriptionRef.set(state, {
        snapshot: Option.some(snapshot),
        error: Option.none(),
      });
    }
  });

  const setStreamError = (cause: Cause.Cause<unknown>) =>
    SubscriptionRef.update(state, (current) => ({
      snapshot: Option.map(current.snapshot, (snapshot) => ({ ...snapshot, online: false })),
      error: Option.some(ISSUES_SYNCHRONIZATION_ERROR_MESSAGE),
    })).pipe(Effect.tap(() => Effect.logWarning(Cause.squash(cause))));

  yield* subscribe(
    WS_METHODS.issuesSubscribe,
    {},
    {
      onExpectedFailure: setStreamError,
      retryExpectedFailureAfter: "250 millis",
    },
  ).pipe(Stream.runForEach(applyItem), Effect.forkScoped);

  return state;
});

export function issuesStateChanges(environmentId: EnvironmentId) {
  return followStreamInEnvironment(
    environmentId,
    Stream.unwrap(makeEnvironmentIssuesState().pipe(Effect.map(SubscriptionRef.changes))),
  );
}

export function createEnvironmentIssuesStateAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const stateAtom = Atom.family((environmentId: EnvironmentId) =>
    runtime.atom(issuesStateChanges(environmentId), {
      initialValue: EMPTY_ENVIRONMENT_ISSUES_STATE,
    }),
  );
  const stateValueAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) =>
      Option.getOrElse(
        AsyncResult.value(get(stateAtom(environmentId))),
        () => EMPTY_ENVIRONMENT_ISSUES_STATE,
      ),
    ).pipe(Atom.withLabel(`environment-issues-state-value:${environmentId}`)),
  );
  const snapshotAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => Option.getOrNull(get(stateValueAtom(environmentId)).snapshot)).pipe(
      Atom.withLabel(`environment-issues-snapshot:${environmentId}`),
    ),
  );
  return { stateAtom, stateValueAtom, snapshotAtom };
}

const EMPTY_ISSUES: ReadonlyArray<Issue> = Object.freeze([]);
const EMPTY_TEAMS: ReadonlyArray<IssueTeam> = Object.freeze([]);
const EMPTY_MEMBERSHIPS: ReadonlyArray<IssueTeamMembership> = Object.freeze([]);
const EMPTY_STATES: ReadonlyArray<IssueWorkflowState> = Object.freeze([]);
const EMPTY_LABELS: ReadonlyArray<IssueLabel> = Object.freeze([]);
const EMPTY_ACTORS: ReadonlyArray<IssueActor> = Object.freeze([]);
const EMPTY_CYCLES: ReadonlyArray<IssueCycle> = Object.freeze([]);
const EMPTY_EPICS: ReadonlyArray<IssueEpic> = Object.freeze([]);
const EMPTY_MILESTONES: ReadonlyArray<IssueMilestone> = Object.freeze([]);
const EMPTY_RELATIONS: ReadonlyArray<IssueRelation> = Object.freeze([]);
const EMPTY_THREAD_LINKS: ReadonlyArray<IssueThreadLink> = Object.freeze([]);
const EMPTY_SAVED_VIEWS: ReadonlyArray<IssueSavedView> = Object.freeze([]);
const EMPTY_ISSUE_REFS: ReadonlyArray<ScopedIssueRef> = Object.freeze([]);
const EMPTY_ISSUE_INDEX: ReadonlyMap<IssueId, Issue> = new Map();

function groupedRefsAtom<K>(
  environmentId: EnvironmentId,
  issuesAtom: Atom.Atom<ReadonlyArray<Issue>>,
  keyOf: (issue: Issue) => K,
  label: string,
): Atom.Atom<ReadonlyMap<K, ReadonlyArray<ScopedIssueRef>>> {
  let previous: ReadonlyMap<K, ReadonlyArray<ScopedIssueRef>> = new Map();
  return Atom.make((get) => {
    const grouped = new Map<K, ScopedIssueRef[]>();
    for (const issue of get(issuesAtom)) {
      const key = keyOf(issue);
      const ref = { environmentId, issueId: issue.id };
      const refs = grouped.get(key);
      if (refs === undefined) grouped.set(key, [ref]);
      else refs.push(ref);
    }
    const next = new Map<K, ReadonlyArray<ScopedIssueRef>>();
    for (const [key, refs] of grouped) {
      const oldRefs = previous.get(key);
      next.set(key, oldRefs !== undefined && issueRefsEqual(oldRefs, refs) ? oldRefs : refs);
    }
    if (
      previous.size === next.size &&
      [...next].every(([key, refs]) => previous.get(key) === refs)
    ) {
      return previous;
    }
    previous = next;
    return previous;
  }).pipe(Atom.withLabel(label));
}

export function createEnvironmentIssuesAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (environmentId: EnvironmentId) => Atom.Atom<IssuesSnapshot | null>;
}) {
  const environmentTeamsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueTeam> =>
        get(input.snapshotAtom(environmentId))?.teams ?? EMPTY_TEAMS,
    ).pipe(Atom.withLabel(`environment-issue-teams:${environmentId}`)),
  );
  const environmentMembershipsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueTeamMembership> =>
        get(input.snapshotAtom(environmentId))?.memberships ?? EMPTY_MEMBERSHIPS,
    ).pipe(Atom.withLabel(`environment-issue-memberships:${environmentId}`)),
  );
  const environmentStatesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueWorkflowState> =>
        get(input.snapshotAtom(environmentId))?.states ?? EMPTY_STATES,
    ).pipe(Atom.withLabel(`environment-issue-states:${environmentId}`)),
  );
  const environmentLabelsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueLabel> =>
        get(input.snapshotAtom(environmentId))?.labels ?? EMPTY_LABELS,
    ).pipe(Atom.withLabel(`environment-issue-labels:${environmentId}`)),
  );
  const environmentActorsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueActor> =>
        get(input.snapshotAtom(environmentId))?.actors ?? EMPTY_ACTORS,
    ).pipe(Atom.withLabel(`environment-issue-actors:${environmentId}`)),
  );
  const environmentCyclesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueCycle> =>
        get(input.snapshotAtom(environmentId))?.cycles ?? EMPTY_CYCLES,
    ).pipe(Atom.withLabel(`environment-issue-cycles:${environmentId}`)),
  );
  const environmentEpicsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueEpic> =>
        get(input.snapshotAtom(environmentId))?.epics ?? EMPTY_EPICS,
    ).pipe(Atom.withLabel(`environment-issue-epics:${environmentId}`)),
  );
  const environmentMilestonesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueMilestone> =>
        get(input.snapshotAtom(environmentId))?.milestones ?? EMPTY_MILESTONES,
    ).pipe(Atom.withLabel(`environment-issue-milestones:${environmentId}`)),
  );
  const environmentRelationsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueRelation> =>
        get(input.snapshotAtom(environmentId))?.relations ?? EMPTY_RELATIONS,
    ).pipe(Atom.withLabel(`environment-issue-relations:${environmentId}`)),
  );
  const environmentThreadLinksAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueThreadLink> =>
        get(input.snapshotAtom(environmentId))?.threadLinks ?? EMPTY_THREAD_LINKS,
    ).pipe(Atom.withLabel(`environment-issue-thread-links:${environmentId}`)),
  );
  const environmentSavedViewsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<IssueSavedView> =>
        get(input.snapshotAtom(environmentId))?.savedViews ?? EMPTY_SAVED_VIEWS,
    ).pipe(Atom.withLabel(`environment-issue-saved-views:${environmentId}`)),
  );
  const environmentIssuesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<Issue> => get(input.snapshotAtom(environmentId))?.issues ?? EMPTY_ISSUES,
    ).pipe(Atom.withLabel(`environment-issues:${environmentId}`)),
  );
  const environmentIssueIndexAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): ReadonlyMap<IssueId, Issue> => {
      const issues = get(environmentIssuesAtom(environmentId));
      return issues.length === 0
        ? EMPTY_ISSUE_INDEX
        : new Map(issues.map((issue) => [issue.id, issue] as const));
    }).pipe(Atom.withLabel(`environment-issue-index:${environmentId}`)),
  );
  const environmentIssueRefsAtom = Atom.family((environmentId: EnvironmentId) => {
    let previous = EMPTY_ISSUE_REFS;
    return Atom.make((get) => {
      const next = get(environmentIssuesAtom(environmentId)).map((issue) => ({
        environmentId,
        issueId: issue.id,
      }));
      if (issueRefsEqual(previous, next)) return previous;
      previous = next;
      return previous;
    }).pipe(Atom.withLabel(`environment-issue-refs:${environmentId}`));
  });
  const issueAtomFamily = Atom.family((key: string) => {
    const ref = parseIssueKey(key);
    let previousSource: Issue | null = null;
    let previousValue: EnvironmentIssue | null = null;
    return Atom.make((get) => {
      const source = get(environmentIssueIndexAtom(ref.environmentId)).get(ref.issueId) ?? null;
      if (source === previousSource) return previousValue;
      previousSource = source;
      previousValue = source === null ? null : scopeIssue(ref.environmentId, source);
      return previousValue;
    }).pipe(Atom.withLabel(`environment-issue:${key}`));
  });

  const environmentIssueRefsByStateAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueStateId>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.stateId,
      `environment-issue-refs-by-state:${environmentId}`,
    ),
  );
  const environmentIssueRefsByAssigneeAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueActorId | null>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.assigneeActorId,
      `environment-issue-refs-by-assignee:${environmentId}`,
    ),
  );
  const environmentIssueRefsByPriorityAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssuePriority>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.priority,
      `environment-issue-refs-by-priority:${environmentId}`,
    ),
  );
  const environmentIssueRefsByLabelAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueLabelId | null>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.labelIds[0] ?? null,
      `environment-issue-refs-by-label:${environmentId}`,
    ),
  );
  const environmentIssueRefsByCycleAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueCycleId | null>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.cycleId,
      `environment-issue-refs-by-cycle:${environmentId}`,
    ),
  );
  const environmentIssueRefsByEpicAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueEpicId | null>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.epicId,
      `environment-issue-refs-by-epic:${environmentId}`,
    ),
  );
  const environmentIssueRefsByTeamAtom = Atom.family((environmentId: EnvironmentId) =>
    groupedRefsAtom<IssueTeamId | null>(
      environmentId,
      environmentIssuesAtom(environmentId),
      (x) => x.teamId,
      `environment-issue-refs-by-team:${environmentId}`,
    ),
  );

  let previousRefs = EMPTY_ISSUE_REFS;
  const issueRefsAtom = Atom.make((get) => {
    const next: ScopedIssueRef[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      next.push(...get(environmentIssueRefsAtom(environmentId)));
    }
    if (issueRefsEqual(previousRefs, next)) return previousRefs;
    previousRefs = next;
    return previousRefs;
  }).pipe(Atom.withLabel("environment-issue-refs"));

  let previousIssues: ReadonlyArray<EnvironmentIssue> = [];
  const issuesAtom = Atom.make((get) => {
    const next = get(issueRefsAtom).flatMap((ref) => {
      const issue = get(issueAtomFamily(issueKey(ref)));
      return issue === null ? [] : [issue];
    });
    if (arrayElementsEqual(previousIssues, next)) return previousIssues;
    previousIssues = next;
    return previousIssues;
  }).pipe(Atom.withLabel("environment-issue-list"));

  return {
    environmentTeamsAtom,
    environmentMembershipsAtom,
    environmentStatesAtom,
    environmentLabelsAtom,
    environmentActorsAtom,
    environmentCyclesAtom,
    environmentEpicsAtom,
    environmentMilestonesAtom,
    environmentRelationsAtom,
    environmentThreadLinksAtom,
    environmentSavedViewsAtom,
    environmentIssuesAtom,
    environmentIssueIndexAtom,
    environmentIssueRefsAtom,
    environmentIssueRefsByStateAtom,
    environmentIssueRefsByAssigneeAtom,
    environmentIssueRefsByPriorityAtom,
    environmentIssueRefsByLabelAtom,
    environmentIssueRefsByCycleAtom,
    environmentIssueRefsByEpicAtom,
    environmentIssueRefsByTeamAtom,
    issueRefsAtom,
    issuesAtom,
    issueAtom: (ref: ScopedIssueRef) => issueAtomFamily(issueKey(ref)),
  };
}

export { scopeIssue };
export type { EnvironmentIssue, ScopedIssueRef };
export * from "./issueDetail.ts";
export * from "./issuesCommands.ts";
export * from "./issuesReducer.ts";
