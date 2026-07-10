import {
  Issue,
  IssueActor,
  IssueActorId,
  IssueCommandResult,
  IssueCommentId,
  IssueCycle,
  IssueCycleId,
  IssueDetail,
  IssueEpic,
  IssueEpicId,
  IssueId,
  IssueLabel,
  IssueLabelId,
  IssueMilestoneId,
  IssuePriority,
  IssueRelationId,
  IssueSavedView,
  IssueStateId,
  IssueTeam,
  IssueTeamId,
  IssueWorkflowState,
  IssuesDomainError,
  RelationType,
  StateCategory,
} from "@pathwayos/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { IssuesGateway } from "../../../issues/IssuesGateway.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { AgentActorResolver } from "./AgentActorResolver.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  AgentActorResolver,
  IssuesGateway,
];

export const IssueAgentToolError = Schema.Union([
  McpInvocationContext.IssueAgentAccessError,
  IssuesDomainError,
]);
export type IssueAgentToolError = typeof IssueAgentToolError.Type;

const readonlyIssueTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false) as T;

const nonDestructiveWriteTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.Destructive, false).annotate(Tool.OpenWorld, false) as T;

const IssueCreateInput = Schema.Struct({
  title: Schema.String,
  teamId: Schema.NullOr(IssueTeamId),
  descriptionMd: Schema.optionalKey(Schema.String),
  stateId: Schema.optionalKey(IssueStateId),
  priority: Schema.optionalKey(IssuePriority),
  assigneeActorId: Schema.optionalKey(Schema.NullOr(IssueActorId)),
  labelIds: Schema.optionalKey(Schema.Array(IssueLabelId)),
  estimate: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  dueDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
  cycleId: Schema.optionalKey(Schema.NullOr(IssueCycleId)),
  epicId: Schema.optionalKey(Schema.NullOr(IssueEpicId)),
  milestoneId: Schema.optionalKey(Schema.NullOr(IssueMilestoneId)),
  parentIssueId: Schema.optionalKey(Schema.NullOr(IssueId)),
});

const IssueLookupInput = Schema.Struct({
  issueId: Schema.optionalKey(IssueId),
  identifier: Schema.optionalKey(Schema.String),
}).check(
  Schema.makeFilter(
    (input) =>
      (input.issueId === undefined) !== (input.identifier === undefined) ||
      "Provide exactly one of issueId or identifier.",
  ),
);

const IssueListInput = Schema.Struct({
  teamId: Schema.optionalKey(IssueTeamId),
  teamKey: Schema.optionalKey(Schema.String),
  stateCategory: Schema.optionalKey(StateCategory),
  stateId: Schema.optionalKey(IssueStateId),
  assigneeActorId: Schema.optionalKey(IssueActorId),
  labelId: Schema.optionalKey(IssueLabelId),
  priority: Schema.optionalKey(IssuePriority),
  text: Schema.optionalKey(Schema.String),
  includeCompleted: Schema.optionalKey(Schema.Boolean),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })).annotate({
      description: "Maximum issues to return. Defaults to 50; maximum 200.",
    }),
  ),
});

const IssueUpdateInput = Schema.Struct({
  issueId: IssueId,
  patch: Schema.Struct({
    title: Schema.optionalKey(Schema.String),
    descriptionMd: Schema.optionalKey(Schema.String),
    priority: Schema.optionalKey(IssuePriority),
    stateId: Schema.optionalKey(IssueStateId),
    assigneeActorId: Schema.optionalKey(Schema.NullOr(IssueActorId)),
    labelIds: Schema.optionalKey(Schema.Array(IssueLabelId)),
    estimate: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    dueDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
    cycleId: Schema.optionalKey(Schema.NullOr(IssueCycleId)),
    epicId: Schema.optionalKey(Schema.NullOr(IssueEpicId)),
    milestoneId: Schema.optionalKey(Schema.NullOr(IssueMilestoneId)),
    parentIssueId: Schema.optionalKey(Schema.NullOr(IssueId)),
    orderKey: Schema.optionalKey(Schema.String),
    triaged: Schema.optionalKey(Schema.Boolean),
  }),
});

const IssueCommentInput = Schema.Struct({
  issueId: IssueId,
  parentCommentId: Schema.optionalKey(IssueCommentId),
  bodyMd: Schema.String,
});

const IssueStartWorkInput = Schema.Struct({
  issueId: IssueId,
  repoLogicalKey: Schema.optionalKey(Schema.String),
});

const IssueLinkThreadInput = Schema.Struct({
  issueId: IssueId,
  logicalProjectKey: Schema.optionalKey(Schema.String),
});

const IssueRelationSetInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("set"),
    issueId: IssueId,
    relationType: RelationType,
    relatedIssueId: IssueId,
  }),
  Schema.Struct({
    action: Schema.Literal("remove"),
    relationId: IssueRelationId,
  }),
]);

const IssueDeleteInput = Schema.Struct({ issueId: IssueId });
const OptionalTeamInput = Schema.Struct({ teamId: Schema.optionalKey(IssueTeamId) });

export const IssueCreateTool = nonDestructiveWriteTool(
  Tool.make("issue_create", {
    description:
      "Create an issue with agent attribution. Agent-created issues always land in Triage regardless of a requested state.",
    parameters: IssueCreateInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Create issue in Triage"),
);

export const IssueGetTool = readonlyIssueTool(
  Tool.make("issue_get", {
    description: "Get one issue and its detail by issue id or current identifier.",
    parameters: IssueLookupInput,
    success: Schema.Struct({ issue: Issue, detail: IssueDetail }),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get issue"),
);

export const IssueListTool = readonlyIssueTool(
  Tool.make("issue_list", {
    description:
      "List and search active issues. Completed issues are excluded unless includeCompleted is true.",
    parameters: IssueListInput,
    success: Schema.Array(Issue),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issues"),
);

export const IssueUpdateTool = nonDestructiveWriteTool(
  Tool.make("issue_update", {
    description:
      "Update supported issue fields with agent attribution. Delegation status is controlled by pathwayOS and cannot be changed here.",
    parameters: IssueUpdateInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Update issue"),
);

export const IssueCommentTool = nonDestructiveWriteTool(
  Tool.make("issue_comment", {
    description: "Post a Markdown comment or reply on an issue with agent and thread attribution.",
    parameters: IssueCommentInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Comment on issue"),
);

export const IssueStartWorkTool = nonDestructiveWriteTool(
  Tool.make("issue_start_work", {
    description: "Start work on an issue using its configured repository routing.",
    parameters: IssueStartWorkInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Start issue work"),
);

export const IssueLinkThreadTool = nonDestructiveWriteTool(
  Tool.make("issue_link_thread", {
    description: "Link the invoking agent thread to an issue on this environment.",
    parameters: IssueLinkThreadInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Link current thread to issue"),
);

export const IssueRelationSetTool = nonDestructiveWriteTool(
  Tool.make("issue_relation_set", {
    description:
      "Create or remove a blocks, related, or duplicate relation. Blocked-by is represented by reversing a blocks relation.",
    parameters: IssueRelationSetInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Set issue relation"),
);

export const IssueDeleteTool = nonDestructiveWriteTool(
  Tool.make("issue_delete", {
    description:
      "Soft-delete an issue. This is reversible; permanent purge is unavailable to agents.",
    parameters: IssueDeleteInput,
    success: IssueCommandResult,
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Soft-delete issue"),
);

export const TeamListTool = readonlyIssueTool(
  Tool.make("team_list", {
    description: "List active issue teams and repository routing metadata.",
    success: Schema.Array(IssueTeam),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue teams"),
);

export const ActorListTool = readonlyIssueTool(
  Tool.make("actor_list", {
    description: "List active human and agent actors available for assignment.",
    success: Schema.Array(IssueActor),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue actors"),
);

export const StateListTool = readonlyIssueTool(
  Tool.make("state_list", {
    description: "List active workflow states, optionally scoped to a team.",
    parameters: OptionalTeamInput,
    success: Schema.Array(IssueWorkflowState),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue states"),
);

export const LabelListTool = readonlyIssueTool(
  Tool.make("label_list", {
    description: "List active labels, optionally scoped to a team.",
    parameters: OptionalTeamInput,
    success: Schema.Array(IssueLabel),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue labels"),
);

export const CycleListTool = readonlyIssueTool(
  Tool.make("cycle_list", {
    description: "List active cycles, optionally scoped to a team.",
    parameters: OptionalTeamInput,
    success: Schema.Array(IssueCycle),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue cycles"),
);

export const EpicListTool = readonlyIssueTool(
  Tool.make("epic_list", {
    description: "List active workspace epics.",
    success: Schema.Array(IssueEpic),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List issue epics"),
);

export const ViewListTool = readonlyIssueTool(
  Tool.make("view_list", {
    description: "List active saved issue views available in the workspace.",
    success: Schema.Array(IssueSavedView),
    failure: IssueAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List saved issue views"),
);

export const IssuesToolkit = Toolkit.make(
  IssueCreateTool,
  IssueGetTool,
  IssueListTool,
  IssueUpdateTool,
  IssueCommentTool,
  IssueStartWorkTool,
  IssueLinkThreadTool,
  IssueRelationSetTool,
  IssueDeleteTool,
  TeamListTool,
  ActorListTool,
  StateListTool,
  LabelListTool,
  CycleListTool,
  EpicListTool,
  ViewListTool,
);
