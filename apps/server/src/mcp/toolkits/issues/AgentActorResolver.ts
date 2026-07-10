import { IssueActorId, type ThreadId } from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { IssuesGateway } from "../../../issues/IssuesGateway.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import type { McpInvocationScope } from "../../McpInvocationContext.ts";
import { IssueAgentAccessError } from "../../McpInvocationContext.ts";

export interface AgentActorResolverShape {
  readonly resolve: (
    scope: McpInvocationScope,
    operation: import("../../McpInvocationContext.ts").IssueAgentToolName,
  ) => Effect.Effect<
    IssueActorId,
    IssueAgentAccessError | import("@pathwayos/contracts").IssuesDomainError
  >;
}

export class AgentActorResolver extends Context.Service<
  AgentActorResolver,
  AgentActorResolverShape
>()("pathwayos/mcp/toolkits/issues/AgentActorResolver") {}

const deterministicAvatarColor = (instanceId: string): string => {
  let hash = 0;
  for (const character of instanceId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 65% 48%)`;
};

const makeAccessError = (
  scope: McpInvocationScope,
  operation: import("../../McpInvocationContext.ts").IssueAgentToolName,
  reason: IssueAgentAccessError["reason"],
  message: string,
) =>
  new IssueAgentAccessError({
    operation,
    reason,
    environmentId: scope.environmentId,
    threadId: scope.threadId,
    providerSessionId: scope.providerSessionId,
    providerInstanceId: scope.providerInstanceId,
    message,
  });

export const make = Effect.gen(function* () {
  const gateway = yield* IssuesGateway;
  const projectionSnapshot = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const memo = yield* SynchronizedRef.make<ReadonlyMap<ThreadId, IssueActorId>>(new Map());

  const resolveUncached = Effect.fn("AgentActorResolver.resolveUncached")(function* (
    scope: McpInvocationScope,
    operation: import("../../McpInvocationContext.ts").IssueAgentToolName,
  ) {
    const snapshot = yield* gateway.getSnapshot;
    const linkedActor = snapshot.threadLinks
      .filter((link) => link.deletedAt === null && link.threadId === scope.threadId)
      .map((link) => snapshot.issues.find((issue) => issue.id === link.issueId))
      .filter((issue) => issue !== undefined && issue.deletedAt === null)
      .map((issue) => issue.assigneeActorId)
      .filter((actorId) => actorId !== null)
      .map((actorId) => snapshot.actors.find((actor) => actor.id === actorId))
      .find((actor) => actor?.kind === "agent" && actor.deletedAt === null);
    if (linkedActor !== undefined) return linkedActor.id;

    const thread = yield* projectionSnapshot.getThreadShellById(scope.threadId).pipe(
      Effect.mapError(() =>
        makeAccessError(
          scope,
          operation,
          "persistence-failed",
          "The invoking thread could not be resolved from the local projection.",
        ),
      ),
    );
    if (Option.isNone(thread)) {
      return yield* makeAccessError(
        scope,
        operation,
        "thread-not-found",
        "The invoking thread no longer exists.",
      );
    }

    const instanceId = thread.value.modelSelection.instanceId;
    const settings = yield* settingsService.getSettings.pipe(
      Effect.mapError(() =>
        makeAccessError(
          scope,
          operation,
          "persistence-failed",
          "Server settings could not be read while resolving the invoking agent actor.",
        ),
      ),
    );
    const configuredActor = snapshot.actors.find(
      (actor) =>
        actor.kind === "agent" &&
        actor.deletedAt === null &&
        settings.agentActors[actor.id]?.providerInstanceId === instanceId,
    );
    if (configuredActor !== undefined) return configuredActor.id;

    const providerInstance = settings.providerInstances[instanceId];
    const created = yield* gateway.execute(
      {
        type: "agent.create",
        displayName: providerInstance?.displayName ?? "Agent",
        avatarColor: deterministicAvatarColor(instanceId),
        config: {
          providerInstanceId: instanceId,
          model: null,
          instructions: null,
        },
      },
      { kind: "human" },
    );
    if (created.createdId === null) {
      return yield* makeAccessError(
        scope,
        operation,
        "actor-resolution-failed",
        "The default agent actor command completed without returning an actor id.",
      );
    }
    const actorId = IssueActorId.make(created.createdId);
    yield* settingsService
      .updateSettings({
        agentActors: {
          ...settings.agentActors,
          [actorId]: {
            providerInstanceId: instanceId,
            model: null,
            instructions: null,
          },
        },
      })
      .pipe(
        Effect.mapError(() =>
          makeAccessError(
            scope,
            operation,
            "persistence-failed",
            "The default agent actor was created, but its local configuration could not be saved.",
          ),
        ),
      );
    return actorId;
  });

  const resolve: AgentActorResolverShape["resolve"] = Effect.fn("AgentActorResolver.resolve")(
    (scope, operation) =>
      SynchronizedRef.modifyEffect(memo, (current) => {
        const cached = current.get(scope.threadId);
        if (cached !== undefined) return Effect.succeed([cached, current] as const);
        return resolveUncached(scope, operation).pipe(
          Effect.map((actorId) => {
            const next = new Map(current);
            next.set(scope.threadId, actorId);
            return [actorId, next] as const;
          }),
        );
      }),
  );

  return AgentActorResolver.of({ resolve });
});

export const layer = Layer.effect(AgentActorResolver, make);
