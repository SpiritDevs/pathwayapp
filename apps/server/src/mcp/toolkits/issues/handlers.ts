import { IssuesDomainError } from "@pathwayos/contracts";
import * as Effect from "effect/Effect";

import { IssuesGateway } from "../../../issues/IssuesGateway.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { AgentActorResolver } from "./AgentActorResolver.ts";
import { IssuesToolkit } from "./tools.ts";

const active = <T extends { readonly deletedAt: string | null }>(entity: T): boolean =>
  entity.deletedAt === null;

const withInvocation = <A, E, R>(
  operation: McpInvocationContext.IssueAgentToolName,
  run: (input: {
    readonly scope: McpInvocationContext.McpInvocationScope;
    readonly actorId: import("@pathwayos/contracts").IssueActorId;
    readonly gateway: IssuesGateway["Service"];
  }) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const scope = yield* McpInvocationContext.requireIssuesCapability(operation);
    const actorResolver = yield* AgentActorResolver;
    const actorId = yield* actorResolver.resolve(scope, operation);
    const gateway = yield* IssuesGateway;
    return yield* run({ scope, actorId, gateway });
  });

const handlers = {
  issue_create: (input) =>
    withInvocation("issue_create", ({ scope, actorId, gateway }) =>
      gateway.execute(
        { type: "issue.create", ...input },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_get: (input) =>
    withInvocation("issue_get", ({ gateway }) =>
      Effect.gen(function* () {
        const snapshot = yield* gateway.getSnapshot;
        const issue = snapshot.issues.find(
          (candidate) =>
            candidate.deletedAt === null &&
            (input.issueId !== undefined
              ? candidate.id === input.issueId
              : candidate.identifier === input.identifier),
        );
        if (issue === undefined) {
          return yield* new IssuesDomainError({
            code: "not-found",
            message: "Issue not found by the supplied id or identifier.",
          });
        }
        const detail = yield* gateway.getIssueDetail(issue.id);
        return { issue, detail };
      }),
    ),
  issue_list: (input) =>
    withInvocation("issue_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(
        Effect.map((snapshot) => {
          const teamIdForKey =
            input.teamKey === undefined
              ? undefined
              : snapshot.teams.find((team) => team.deletedAt === null && team.key === input.teamKey)
                  ?.id;
          const stateById = new Map(snapshot.states.map((state) => [state.id, state]));
          const text = input.text?.toLocaleLowerCase();
          return snapshot.issues
            .filter(active)
            .filter((issue) => input.teamId === undefined || issue.teamId === input.teamId)
            .filter(
              (issue) =>
                input.teamKey === undefined ||
                (teamIdForKey !== undefined && issue.teamId === teamIdForKey),
            )
            .filter(
              (issue) =>
                input.stateCategory === undefined ||
                stateById.get(issue.stateId)?.category === input.stateCategory,
            )
            .filter((issue) => input.stateId === undefined || issue.stateId === input.stateId)
            .filter(
              (issue) =>
                input.assigneeActorId === undefined ||
                issue.assigneeActorId === input.assigneeActorId,
            )
            .filter(
              (issue) => input.labelId === undefined || issue.labelIds.includes(input.labelId),
            )
            .filter((issue) => input.priority === undefined || issue.priority === input.priority)
            .filter(
              (issue) =>
                text === undefined ||
                `${issue.title} ${issue.identifier}`.toLocaleLowerCase().includes(text),
            )
            .filter(
              (issue) =>
                input.includeCompleted === true ||
                stateById.get(issue.stateId)?.category !== "completed",
            )
            .slice(0, input.limit ?? 50);
        }),
      ),
    ),
  issue_update: ({ issueId, patch }) =>
    withInvocation("issue_update", ({ scope, actorId, gateway }) =>
      gateway.execute(
        { type: "issue.update", issueId, patch },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_comment: ({ issueId, parentCommentId, bodyMd }) =>
    withInvocation("issue_comment", ({ scope, actorId, gateway }) =>
      gateway.execute(
        {
          type: "comment.create",
          issueId,
          bodyMd,
          ...(parentCommentId !== undefined ? { parentCommentId } : {}),
        },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_start_work: ({ issueId, repoLogicalKey }) =>
    withInvocation("issue_start_work", ({ scope, actorId, gateway }) =>
      gateway.execute(
        {
          type: "issue.startWork",
          issueId,
          ...(repoLogicalKey !== undefined ? { repoLogicalKey } : {}),
        },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_link_thread: ({ issueId, logicalProjectKey }) =>
    withInvocation("issue_link_thread", ({ scope, actorId, gateway }) =>
      gateway.execute(
        {
          type: "threadLink.create",
          issueId,
          threadId: scope.threadId,
          environmentId: scope.environmentId,
          ...(logicalProjectKey !== undefined ? { logicalProjectKey } : {}),
        },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_relation_set: (input) =>
    withInvocation("issue_relation_set", ({ scope, actorId, gateway }) =>
      gateway.execute(
        input.action === "set"
          ? {
              type: "relation.create",
              issueId: input.issueId,
              relationType: input.relationType,
              relatedIssueId: input.relatedIssueId,
            }
          : { type: "relation.delete", relationId: input.relationId },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  issue_delete: ({ issueId }) =>
    withInvocation("issue_delete", ({ scope, actorId, gateway }) =>
      gateway.execute(
        { type: "issue.delete", issueId },
        { kind: "agent", actorId, threadId: scope.threadId },
      ),
    ),
  team_list: () =>
    withInvocation("team_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(Effect.map((snapshot) => snapshot.teams.filter(active))),
    ),
  actor_list: () =>
    withInvocation("actor_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(Effect.map((snapshot) => snapshot.actors.filter(active))),
    ),
  state_list: ({ teamId }) =>
    withInvocation("state_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(
        Effect.map((snapshot) =>
          snapshot.states
            .filter(active)
            .filter((state) => teamId === undefined || state.teamId === teamId),
        ),
      ),
    ),
  label_list: ({ teamId }) =>
    withInvocation("label_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(
        Effect.map((snapshot) =>
          snapshot.labels
            .filter(active)
            .filter((label) => teamId === undefined || label.teamId === teamId),
        ),
      ),
    ),
  cycle_list: ({ teamId }) =>
    withInvocation("cycle_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(
        Effect.map((snapshot) =>
          snapshot.cycles
            .filter(active)
            .filter((cycle) => teamId === undefined || cycle.teamId === teamId),
        ),
      ),
    ),
  epic_list: () =>
    withInvocation("epic_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(Effect.map((snapshot) => snapshot.epics.filter(active))),
    ),
  view_list: () =>
    withInvocation("view_list", ({ gateway }) =>
      gateway.getSnapshot.pipe(Effect.map((snapshot) => snapshot.savedViews.filter(active))),
    ),
} satisfies Parameters<typeof IssuesToolkit.toLayer>[0];

export const IssuesToolkitHandlersLive = IssuesToolkit.toLayer(handlers);
