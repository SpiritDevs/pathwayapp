import {
  CommandId,
  type DelegationQueueState,
  type Issue,
  type IssueActorId,
  type IssueId,
  type IssuePriority,
  IssuesDomainError,
  type IssuesSnapshot,
  MessageId,
  type ModelSelection,
  ProviderInstanceId,
  type RuntimeMode,
  ThreadId,
} from "@pathwayos/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { ServerEnvironment } from "../../environment/ServerEnvironment.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { IssuesGateway } from "../IssuesGateway.ts";
import { IssueDelegationService } from "./IssueDelegationService.ts";
import { SystemHeadroom, type SystemHeadroomSample } from "./SystemHeadroom.ts";

interface QueueEntry {
  readonly issueId: IssueId;
  readonly actorId: IssueActorId;
  readonly priority: IssuePriority;
  readonly enqueuedAt: string;
}

interface RunningEntry {
  readonly actorId: IssueActorId;
  readonly threadId: string;
  readonly startedAt: string;
}

const ELIGIBLE_STATE_CATEGORIES = new Set(["triage", "backlog", "unstarted"]);
const TERMINAL_STATE_CATEGORIES = new Set(["completed", "canceled"]);
const HEADROOM_RETRY_INTERVAL = "15 seconds";

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const priorityRank = (priority: IssuePriority): number => (priority === 0 ? 5 : priority);
const sortQueue = (entries: ReadonlyArray<QueueEntry>): QueueEntry[] =>
  [...entries].sort(
    (left, right) =>
      priorityRank(left.priority) - priorityRank(right.priority) ||
      left.enqueuedAt.localeCompare(right.enqueuedAt),
  );

const isOwnedActor = (
  actorId: IssueActorId | null,
  agentActors: Readonly<Record<string, unknown>>,
): actorId is IssueActorId => actorId !== null && Object.hasOwn(agentActors, actorId);

const delegationAttribution = (actorId: IssueActorId, threadId: string) => ({
  kind: "agent" as const,
  actorId,
  threadId,
});

const bootstrapAttributionThreadId = (issueId: IssueId): string => `delegation:${issueId}`;

const normalizeProjectKey = (value: string): string =>
  value.trim().replaceAll("\\", "/").replace(/\/+$/gu, "").toLocaleLowerCase();

const projectLogicalKey = (project: {
  readonly workspaceRoot: string;
  readonly repositoryIdentity?:
    | { readonly canonicalKey: string; readonly rootPath?: string | undefined }
    | null
    | undefined;
}): string | null => {
  const identity = project.repositoryIdentity;
  if (!identity) return null;
  const workspaceRoot = normalizeProjectKey(project.workspaceRoot);
  const repositoryRoot = identity.rootPath ? normalizeProjectKey(identity.rootPath) : null;
  const relative =
    repositoryRoot && workspaceRoot.startsWith(`${repositoryRoot}/`)
      ? workspaceRoot.slice(repositoryRoot.length + 1)
      : "";
  return relative.length > 0 ? `${identity.canonicalKey}::${relative}` : identity.canonicalKey;
};

const resolveRepoLogicalKey = (issue: Issue, snapshot: IssuesSnapshot): string | null => {
  const team =
    issue.teamId === null ? null : snapshot.teams.find((item) => item.id === issue.teamId);
  if (team?.defaultRepoLogicalKey) return team.defaultRepoLogicalKey;
  return team?.repoLinks.length === 1 ? (team.repoLinks[0]?.logicalProjectKey ?? null) : null;
};

const resolveModelSelection = (input: {
  readonly actor: {
    readonly providerInstanceId: string | null;
    readonly model: string | null;
  };
  readonly projectDefault: ModelSelection | null;
  readonly settingsDefault: ModelSelection;
}): ModelSelection => {
  const fallback = input.projectDefault ?? input.settingsDefault;
  return {
    ...fallback,
    instanceId:
      input.actor.providerInstanceId === null
        ? fallback.instanceId
        : ProviderInstanceId.make(input.actor.providerInstanceId),
    model: input.actor.model ?? fallback.model,
  };
};

const makePrompt = (input: {
  readonly issue: Issue;
  readonly snapshot: IssuesSnapshot;
  readonly descriptionMd: string;
  readonly comments: ReadonlyArray<{
    readonly authorActorId: IssueActorId;
    readonly bodyMd: string;
  }>;
  readonly instructions: string | null;
}): string => {
  const { issue, snapshot } = input;
  const team =
    issue.teamId === null ? null : snapshot.teams.find((item) => item.id === issue.teamId);
  const labels = issue.labelIds
    .map((labelId) => snapshot.labels.find((label) => label.id === labelId)?.name)
    .filter((label): label is string => label !== undefined);
  const parent =
    issue.parentIssueId === null
      ? null
      : (snapshot.issues.find((candidate) => candidate.id === issue.parentIssueId)?.identifier ??
        null);
  const subIssues = snapshot.issues
    .filter((candidate) => candidate.parentIssueId === issue.id)
    .map((candidate) => candidate.identifier);
  const actorNames = new Map(snapshot.actors.map((actor) => [actor.id, actor.displayName]));
  const comments = input.comments
    .slice(-20)
    .map(
      (comment) =>
        `${actorNames.get(comment.authorActorId) ?? comment.authorActorId}: ${comment.bodyMd}`,
    )
    .join("\n");
  const priorities: Readonly<Record<IssuePriority, string>> = {
    0: "None",
    1: "Urgent",
    2: "High",
    3: "Medium",
    4: "Low",
  };

  return [
    `Issue: ${issue.identifier} ${issue.title}`,
    `Description:\n${input.descriptionMd.trim() || "(none)"}`,
    `Team: ${team?.name ?? "Workspace"}`,
    `Priority: ${priorities[issue.priority]}`,
    `Labels: ${labels.join(", ") || "(none)"}`,
    `Due date: ${issue.dueDate ?? "(none)"}`,
    `Parent issue: ${parent ?? "(none)"}`,
    `Sub-issues: ${subIssues.join(", ") || "(none)"}`,
    `Recent comments (oldest to newest, up to 20):\n${comments || "(none)"}`,
    input.instructions?.trim()
      ? `Standing instructions:\n${input.instructions.trim()}`
      : "Standing instructions: (none)",
    "Work on this issue. Post progress through the issue_comment tool. When the work is done, use issue_update to move the issue to the appropriate completed state. The server has already linked this thread to the issue, so do not call issue_link_thread.",
  ].join("\n\n");
};

const headroomPasses = (
  sample: SystemHeadroomSample,
  settings: {
    readonly cpuHeadroomPercent: number;
    readonly minFreeMemoryMb: number;
  },
): boolean =>
  (sample.cpuPercent === null || sample.cpuPercent < settings.cpuHeadroomPercent) &&
  (sample.freeMemoryMb === null || sample.freeMemoryMb > settings.minFreeMemoryMb);

export const IssueDelegationServiceLive = Layer.effect(
  IssueDelegationService,
  Effect.gen(function* () {
    const gateway = yield* IssuesGateway;
    const settingsService = yield* ServerSettingsService;
    const headroom = yield* SystemHeadroom;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const environment = yield* ServerEnvironment;
    const crypto = yield* Crypto.Crypto;
    const path = yield* Path.Path;
    const environmentId = yield* environment.getEnvironmentId;

    const queueRef = yield* Ref.make<ReadonlyArray<QueueEntry>>([]);
    const runningRef = yield* Ref.make<ReadonlyMap<IssueId, RunningEntry>>(new Map());
    const lastHeadroomRef = yield* Ref.make<SystemHeadroomSample>({
      cpuPercent: null,
      freeMemoryMb: null,
    });
    const startedRef = yield* Ref.make(false);
    const wakeQueue = yield* Queue.sliding<void>(1);
    const wake = Queue.offer(wakeQueue, undefined).pipe(Effect.asVoid);

    const enqueue = Effect.fn("IssueDelegationService.enqueue")(function* (entry: QueueEntry) {
      yield* Ref.update(queueRef, (current) => {
        const existing = current.find((candidate) => candidate.issueId === entry.issueId);
        const nextEntry = existing ? { ...entry, enqueuedAt: existing.enqueuedAt } : entry;
        return sortQueue([
          ...current.filter((candidate) => candidate.issueId !== entry.issueId),
          nextEntry,
        ]);
      });
      yield* wake;
    });

    const dequeue = Effect.fn("IssueDelegationService.dequeue")(function* (issueId: IssueId) {
      const removed = yield* Ref.modify(queueRef, (current) => {
        const next = current.filter((entry) => entry.issueId !== issueId);
        return [next.length !== current.length, next];
      });
      if (removed) yield* wake;
    });

    const takeBest = Ref.modify(queueRef, (current) => {
      const [first, ...rest] = sortQueue(current);
      return [first ?? null, rest];
    });

    const executeStatus = (
      issueId: IssueId,
      actorId: IssueActorId,
      status: "queued" | "starting" | "running" | "completed" | "failed" | null,
      threadId = bootstrapAttributionThreadId(issueId),
    ) =>
      gateway.execute(
        { type: "issue.setDelegationStatus", issueId, status },
        delegationAttribution(actorId, threadId),
      );

    const markSpawnFailed = Effect.fn("IssueDelegationService.markSpawnFailed")(function* (
      entry: QueueEntry,
      message: string,
      threadId = bootstrapAttributionThreadId(entry.issueId),
    ) {
      const attribution = delegationAttribution(entry.actorId, threadId);
      yield* executeStatus(entry.issueId, entry.actorId, "failed", threadId).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to persist issue delegation failure status", {
            issueId: entry.issueId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
      yield* gateway
        .execute({ type: "comment.create", issueId: entry.issueId, bodyMd: message }, attribution)
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Failed to post issue delegation failure comment", {
              issueId: entry.issueId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    });

    const spawn = Effect.fn("IssueDelegationService.spawn")(function* (entry: QueueEntry) {
      const [snapshot, detail, shell, settings] = yield* Effect.all([
        gateway.getSnapshot,
        gateway.getIssueDetail(entry.issueId),
        projectionSnapshotQuery.getShellSnapshot(),
        settingsService.getSettings,
      ]);
      const issue = snapshot.issues.find((candidate) => candidate.id === entry.issueId);
      if (!issue) return;
      const currentState = snapshot.states.find((candidate) => candidate.id === issue.stateId);
      if (
        issue.deletedAt !== null ||
        issue.assigneeActorId !== entry.actorId ||
        (currentState !== undefined && TERMINAL_STATE_CATEGORIES.has(currentState.category))
      ) {
        yield* executeStatus(issue.id, entry.actorId, null);
        return;
      }
      const logicalProjectKey = resolveRepoLogicalKey(issue, snapshot);
      const normalizedLogicalKey = logicalProjectKey
        ? normalizeProjectKey(logicalProjectKey)
        : null;
      const project =
        normalizedLogicalKey === null
          ? undefined
          : shell.projects.find((candidate) => {
              const canonical = projectLogicalKey(candidate);
              if (canonical && normalizeProjectKey(canonical) === normalizedLogicalKey) return true;
              return (
                normalizeProjectKey(path.basename(candidate.workspaceRoot)) === normalizedLogicalKey
              );
            });

      if (!logicalProjectKey || !project) {
        yield* markSpawnFailed(
          entry,
          logicalProjectKey
            ? `Delegation could not start because no local project matches repository key \`${logicalProjectKey}\`. Add or sync that project, then requeue the issue.`
            : "Delegation could not start because this issue's team has no unambiguous default repository. Configure a default repository (or leave exactly one repository link), then requeue the issue.",
        );
        return;
      }

      const actorConfig = settings.agentActors[entry.actorId];
      if (!actorConfig) {
        yield* markSpawnFailed(
          entry,
          "Delegation could not start because this agent actor is no longer configured on the local server.",
        );
        return;
      }
      const startedState = snapshot.states
        .filter((state) => state.teamId === issue.teamId && state.category === "started")
        .sort((left, right) => left.position - right.position)[0];
      if (!startedState) {
        yield* markSpawnFailed(
          entry,
          "Delegation could not start because the issue scope has no started-category workflow state.",
        );
        return;
      }

      const createdAt = yield* nowIso;
      const uuid = yield* crypto.randomUUIDv4;
      const threadId = ThreadId.make(uuid);
      const commandId = (tag: string, id: string) => CommandId.make(`server:${tag}:${id}`);
      const modelSelection = resolveModelSelection({
        actor: actorConfig,
        projectDefault: project.defaultModelSelection,
        settingsDefault: settings.textGenerationModelSelection,
      });
      const runtimeMode: RuntimeMode = actorConfig.runtimeMode ?? "full-access";
      const prompt = makePrompt({
        issue,
        snapshot,
        descriptionMd: detail.descriptionMd,
        comments: detail.comments,
        instructions: actorConfig.instructions,
      });

      yield* executeStatus(entry.issueId, entry.actorId, "starting", threadId);
      let threadCreated = false;
      const bootstrapTurnStart = {
        type: "thread.turn.start" as const,
        commandId: commandId("issue-delegation-turn-start", uuid),
        threadId,
        message: {
          messageId: MessageId.make(uuid),
          role: "user" as const,
          text: prompt,
          attachments: [],
        },
        modelSelection,
        runtimeMode,
        interactionMode: "default" as const,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title: `${issue.identifier} ${issue.title}`,
            modelSelection,
            runtimeMode,
            interactionMode: "default" as const,
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      };
      const launch = Effect.gen(function* () {
        const { bootstrap, ...finalTurnStart } = bootstrapTurnStart;
        yield* orchestrationEngine.dispatch({
          type: "thread.create",
          commandId: commandId("issue-delegation-thread-create", uuid),
          threadId,
          ...bootstrap.createThread,
        });
        threadCreated = true;
        yield* orchestrationEngine.dispatch(finalTurnStart);
      });

      const launchExit = yield* Effect.exit(launch);
      if (launchExit._tag === "Failure") {
        if (threadCreated) {
          const cleanupUuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
          yield* orchestrationEngine
            .dispatch({
              type: "thread.delete",
              commandId: commandId("issue-delegation-thread-delete", cleanupUuid),
              threadId,
            })
            .pipe(Effect.ignoreCause({ log: true }));
        }
        yield* markSpawnFailed(
          entry,
          "Delegation failed while creating the local agent thread. Review the server logs, then requeue the issue.",
          threadId,
        );
        return;
      }

      const attribution = delegationAttribution(entry.actorId, threadId);
      yield* gateway.execute(
        {
          type: "threadLink.create",
          issueId: entry.issueId,
          threadId,
          environmentId,
          logicalProjectKey,
        },
        attribution,
      );
      yield* gateway.execute(
        { type: "issue.update", issueId: entry.issueId, patch: { stateId: startedState.id } },
        attribution,
      );
      yield* executeStatus(entry.issueId, entry.actorId, "running", threadId);
      yield* Ref.update(runningRef, (current) => {
        const next = new Map(current);
        next.set(entry.issueId, { actorId: entry.actorId, threadId, startedAt: createdAt });
        return next;
      });
    });

    const spawnSafely = (entry: QueueEntry) =>
      spawn(entry).pipe(
        Effect.catchCause((cause) =>
          markSpawnFailed(
            entry,
            "Delegation failed unexpectedly. Review the server logs, then requeue the issue.",
          ).pipe(
            Effect.andThen(
              Effect.logWarning("Issue delegation spawn failed", {
                issueId: entry.issueId,
                cause: Cause.pretty(cause),
              }),
            ),
          ),
        ),
      );

    const pumpOnce = Effect.gen(function* () {
      const settings = yield* settingsService.getSettings;
      const queued = yield* Ref.get(queueRef);
      const running = yield* Ref.get(runningRef);
      if (!settings.issueDelegation.enabled || queued.length === 0) {
        yield* Queue.take(wakeQueue);
        return;
      }
      if (running.size >= settings.issueDelegation.maxConcurrent) {
        yield* Queue.take(wakeQueue);
        return;
      }

      const sample = yield* headroom.sample;
      yield* Ref.set(lastHeadroomRef, sample);
      if (!headroomPasses(sample, settings.issueDelegation)) {
        yield* Effect.sleep(HEADROOM_RETRY_INTERVAL);
        return;
      }

      const entry = yield* takeBest;
      if (entry) yield* spawnSafely(entry);
    });

    const pump = Effect.forever(
      pumpOnce.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Issue delegation queue worker failed", {
            cause: Cause.pretty(cause),
          }).pipe(Effect.andThen(Effect.sleep(HEADROOM_RETRY_INTERVAL))),
        ),
      ),
    );

    const processIssueUpsert = Effect.fn("IssueDelegationService.processIssueUpsert")(function* (
      issue: Issue,
    ) {
      const settings = yield* settingsService.getSettings;
      const snapshot = yield* gateway.getSnapshot;
      const state = snapshot.states.find((candidate) => candidate.id === issue.stateId);
      const owned = isOwnedActor(issue.assigneeActorId, settings.agentActors);
      const eligible = state !== undefined && ELIGIBLE_STATE_CATEGORIES.has(state.category);
      const terminal = state !== undefined && TERMINAL_STATE_CATEGORIES.has(state.category);

      if (
        issue.deletedAt === null &&
        owned &&
        (issue.delegationStatus === null || issue.delegationStatus === "queued") &&
        eligible
      ) {
        if (issue.delegationStatus === null) {
          yield* executeStatus(issue.id, issue.assigneeActorId, "queued");
        }
        yield* enqueue({
          issueId: issue.id,
          actorId: issue.assigneeActorId,
          priority: issue.priority,
          enqueuedAt: yield* nowIso,
        });
        return;
      }

      const queuedEntry = (yield* Ref.get(queueRef)).find((entry) => entry.issueId === issue.id);
      if (queuedEntry && (issue.deletedAt !== null || !owned || terminal)) {
        yield* dequeue(issue.id);
        yield* executeStatus(issue.id, queuedEntry.actorId, null);
      }
    });

    const processIssueChange = (change: import("@pathwayos/contracts").IssuesStreamItem) => {
      if (change.kind !== "upsert" || change.entity.table !== "issues") return Effect.void;
      return processIssueUpsert(change.entity.row).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Issue delegation reactor failed to process issue change", {
            issueId: change.entity.row.id,
            cause: Cause.pretty(cause),
          }),
        ),
      );
    };

    const completeRunningThread = Effect.fn("IssueDelegationService.completeRunningThread")(
      function* (threadId: string, status: "completed" | "failed") {
        const match = [...(yield* Ref.get(runningRef)).entries()].find(
          ([, running]) => running.threadId === threadId,
        );
        if (!match) return;
        const [issueId, running] = match;
        yield* executeStatus(issueId, running.actorId, status, threadId).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Failed to complete delegated issue", {
              issueId,
              threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
        yield* Ref.update(runningRef, (current) => {
          const next = new Map(current);
          next.delete(issueId);
          return next;
        });
        yield* wake;
      },
    );

    const processOrchestrationEvent = (
      event: import("@pathwayos/contracts").OrchestrationEvent,
    ) => {
      if (
        event.type === "thread.session-set" &&
        event.payload.session.activeTurnId === null &&
        event.payload.session.status === "error"
      ) {
        return completeRunningThread(event.payload.threadId, "failed");
      }
      if (
        event.type === "thread.session-set" &&
        event.payload.session.activeTurnId === null &&
        (event.payload.session.status === "ready" || event.payload.session.status === "stopped")
      ) {
        return completeRunningThread(event.payload.threadId, "completed");
      }
      if (event.type === "thread.deleted") {
        return completeRunningThread(event.payload.threadId, "failed");
      }
      return Effect.void;
    };

    const rebuild = Effect.fn("IssueDelegationService.rebuild")(function* () {
      const [snapshot, shell, settings] = yield* Effect.all([
        gateway.getSnapshot,
        projectionSnapshotQuery.getShellSnapshot(),
        settingsService.getSettings,
      ]);
      const liveThreadIds = new Set(shell.threads.map((thread) => thread.id));
      const linksByIssue = new Map(
        snapshot.threadLinks
          .filter((link) => liveThreadIds.has(ThreadId.make(link.threadId)))
          .map((link) => [link.issueId, link] as const),
      );

      for (const issue of snapshot.issues) {
        if (issue.deletedAt !== null) continue;
        const actorId = issue.assigneeActorId;
        if (!isOwnedActor(actorId, settings.agentActors)) continue;
        const link = linksByIssue.get(issue.id);
        if (
          (issue.delegationStatus === "running" || issue.delegationStatus === "starting") &&
          link
        ) {
          yield* Ref.update(runningRef, (current) => {
            const next = new Map(current);
            next.set(issue.id, {
              actorId,
              threadId: link.threadId,
              startedAt: link.createdAt,
            });
            return next;
          });
          if (issue.delegationStatus === "starting") {
            yield* executeStatus(issue.id, actorId, "running", link.threadId);
          }
          continue;
        }

        if (
          issue.delegationStatus === "queued" ||
          issue.delegationStatus === "starting" ||
          issue.delegationStatus === "running"
        ) {
          if (issue.delegationStatus !== "queued") {
            yield* executeStatus(issue.id, actorId, "queued");
          }
          yield* enqueue({
            issueId: issue.id,
            actorId,
            priority: issue.priority,
            enqueuedAt: issue.updatedAt,
          });
        }
      }
    });

    const start = Effect.fn("IssueDelegationService.start")(function* () {
      const shouldStart = yield* Ref.modify(startedRef, (started) => [!started, true]);
      if (!shouldStart) return;
      const issueChanges = yield* gateway.subscribeChanges;
      yield* rebuild().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to rebuild the issue delegation queue", {
            cause: Cause.pretty(cause),
          }),
        ),
      );
      yield* Effect.forkScoped(
        Stream.runForEach(Stream.fromSubscription(issueChanges), processIssueChange),
      );
      yield* Effect.forkScoped(
        Stream.runForEach(orchestrationEngine.streamDomainEvents, processOrchestrationEvent),
      );
      yield* Effect.forkScoped(Stream.runForEach(settingsService.streamChanges, () => wake));
      yield* Effect.forkScoped(pump);
      yield* wake;
    });

    const state = Effect.gen(function* () {
      const [queued, running, settings, sample] = yield* Effect.all([
        Ref.get(queueRef),
        Ref.get(runningRef),
        settingsService.getSettings.pipe(
          Effect.mapError(
            () =>
              new IssuesDomainError({
                code: "offline",
                message: "Unable to read issue delegation settings.",
              }),
          ),
        ),
        headroom.sample,
      ]);
      yield* Ref.set(lastHeadroomRef, sample);
      return {
        queued: sortQueue(queued),
        running: [...running.entries()].map(([issueId, entry]) => ({ issueId, ...entry })),
        capacity: {
          maxConcurrent: settings.issueDelegation.maxConcurrent,
          cpuPercent: sample.cpuPercent,
          freeMemoryMb: sample.freeMemoryMb,
          headroomOk: headroomPasses(sample, settings.issueDelegation),
        },
      } satisfies DelegationQueueState;
    });

    const safeStart: IssueDelegationService["Service"]["start"] = () =>
      start().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Issue delegation service failed to start", {
            cause: Cause.pretty(cause),
          }),
        ),
      );

    return IssueDelegationService.of({ start: safeStart, state });
  }),
);
