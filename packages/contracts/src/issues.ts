import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { AgentActorRuntimeConfig } from "./settings.ts";

const makeIssueEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const IssueId = makeIssueEntityId("IssueId");
export type IssueId = typeof IssueId.Type;
export const IssueTeamId = makeIssueEntityId("IssueTeamId");
export type IssueTeamId = typeof IssueTeamId.Type;
export const IssueActorId = makeIssueEntityId("IssueActorId");
export type IssueActorId = typeof IssueActorId.Type;
export const IssueStateId = makeIssueEntityId("IssueStateId");
export type IssueStateId = typeof IssueStateId.Type;
export const IssueLabelId = makeIssueEntityId("IssueLabelId");
export type IssueLabelId = typeof IssueLabelId.Type;
export const IssueCycleId = makeIssueEntityId("IssueCycleId");
export type IssueCycleId = typeof IssueCycleId.Type;
export const IssueEpicId = makeIssueEntityId("IssueEpicId");
export type IssueEpicId = typeof IssueEpicId.Type;
export const IssueMilestoneId = makeIssueEntityId("IssueMilestoneId");
export type IssueMilestoneId = typeof IssueMilestoneId.Type;
export const IssueCommentId = makeIssueEntityId("IssueCommentId");
export type IssueCommentId = typeof IssueCommentId.Type;
export const IssueRelationId = makeIssueEntityId("IssueRelationId");
export type IssueRelationId = typeof IssueRelationId.Type;
export const IssueThreadLinkId = makeIssueEntityId("IssueThreadLinkId");
export type IssueThreadLinkId = typeof IssueThreadLinkId.Type;
export const IssueSavedViewId = makeIssueEntityId("IssueSavedViewId");
export type IssueSavedViewId = typeof IssueSavedViewId.Type;
export const IssueTeamMembershipId = makeIssueEntityId("IssueTeamMembershipId");
export type IssueTeamMembershipId = typeof IssueTeamMembershipId.Type;

export const StateCategory = Schema.Literals([
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);
export type StateCategory = typeof StateCategory.Type;

export const IssuePriority = Schema.Literals([0, 1, 2, 3, 4]);
export type IssuePriority = typeof IssuePriority.Type;

export const ActorKind = Schema.Literals(["human", "agent"]);
export type ActorKind = typeof ActorKind.Type;

export const RelationType = Schema.Literals(["blocks", "related", "duplicate"]);
export type RelationType = typeof RelationType.Type;

export const DelegationStatus = Schema.NullOr(
  Schema.Literals(["queued", "starting", "running", "completed", "failed"]),
);
export type DelegationStatus = typeof DelegationStatus.Type;

export const EpicStatus = Schema.Literals([
  "backlog",
  "planned",
  "in-progress",
  "paused",
  "completed",
  "canceled",
]);
export type EpicStatus = typeof EpicStatus.Type;

export const EstimateScale = Schema.Literals([
  "disabled",
  "exponential",
  "fibonacci",
  "linear",
  "tshirt",
]);
export type EstimateScale = typeof EstimateScale.Type;

export const SavedViewScope = Schema.Literals(["personal", "team"]);
export type SavedViewScope = typeof SavedViewScope.Type;

export const ThreadLinkStatus = Schema.Literals(["linked", "working", "closed"]);
export type ThreadLinkStatus = typeof ThreadLinkStatus.Type;

export const GroupBy = Schema.Literals([
  "state",
  "assignee",
  "priority",
  "label",
  "cycle",
  "epic",
  "team",
  "none",
]);
export type GroupBy = typeof GroupBy.Type;

export const OrderBy = Schema.Literals(["manual", "priority", "dueDate", "createdAt", "updatedAt"]);
export type OrderBy = typeof OrderBy.Type;

export const ViewMode = Schema.Literals(["list", "board"]);
export type ViewMode = typeof ViewMode.Type;

const EntityTimestamps = {
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
};

export const IssueCycleConfig = Schema.Struct({
  enabled: Schema.Boolean,
  startDayOfWeek: Schema.Literals([0, 1, 2, 3, 4, 5, 6]),
  durationWeeks: Schema.Number,
  cooldownWeeks: Schema.Number,
  autoRollover: Schema.Boolean,
});
export type IssueCycleConfig = typeof IssueCycleConfig.Type;

export const IssueTeamRepoLink = Schema.Struct({
  logicalProjectKey: Schema.String,
  displayName: Schema.String,
});
export type IssueTeamRepoLink = typeof IssueTeamRepoLink.Type;

export const IssueTeam = Schema.Struct({
  id: IssueTeamId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  icon: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  key: Schema.String,
  cycleConfig: IssueCycleConfig,
  estimateScale: EstimateScale,
  repoLinks: Schema.Array(IssueTeamRepoLink),
  defaultRepoLogicalKey: Schema.NullOr(Schema.String),
  ...EntityTimestamps,
});
export type IssueTeam = typeof IssueTeam.Type;

export const IssueTeamMembership = Schema.Struct({
  id: IssueTeamMembershipId,
  teamId: IssueTeamId,
  actorId: IssueActorId,
  ...EntityTimestamps,
});
export type IssueTeamMembership = typeof IssueTeamMembership.Type;

export const IssueWorkflowState = Schema.Struct({
  id: IssueStateId,
  teamId: Schema.NullOr(IssueTeamId),
  name: Schema.String,
  color: Schema.String,
  category: StateCategory,
  position: Schema.Number,
  ...EntityTimestamps,
});
export type IssueWorkflowState = typeof IssueWorkflowState.Type;

export const IssueLabel = Schema.Struct({
  id: IssueLabelId,
  teamId: Schema.NullOr(IssueTeamId),
  name: Schema.String,
  color: Schema.String,
  description: Schema.NullOr(Schema.String),
  ...EntityTimestamps,
});
export type IssueLabel = typeof IssueLabel.Type;

export const IssueActor = Schema.Struct({
  id: IssueActorId,
  kind: ActorKind,
  displayName: Schema.String,
  avatarColor: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
  ownerUserId: Schema.String,
  ...EntityTimestamps,
});
export type IssueActor = typeof IssueActor.Type;

export const IssueCycle = Schema.Struct({
  id: IssueCycleId,
  teamId: IssueTeamId,
  number: Schema.Number,
  name: Schema.NullOr(Schema.String),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  ...EntityTimestamps,
});
export type IssueCycle = typeof IssueCycle.Type;

export const IssueEpic = Schema.Struct({
  id: IssueEpicId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  icon: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  status: EpicStatus,
  startDate: Schema.NullOr(Schema.String),
  targetDate: Schema.NullOr(Schema.String),
  ...EntityTimestamps,
});
export type IssueEpic = typeof IssueEpic.Type;

export const IssueMilestone = Schema.Struct({
  id: IssueMilestoneId,
  epicId: IssueEpicId,
  name: Schema.String,
  targetDate: Schema.NullOr(Schema.String),
  position: Schema.Number,
  completedAt: Schema.NullOr(IsoDateTime),
  ...EntityTimestamps,
});
export type IssueMilestone = typeof IssueMilestone.Type;

export const Issue = Schema.Struct({
  id: IssueId,
  teamId: Schema.NullOr(IssueTeamId),
  number: Schema.Number,
  identifier: Schema.String,
  title: Schema.String,
  priority: IssuePriority,
  stateId: IssueStateId,
  assigneeActorId: Schema.NullOr(IssueActorId),
  creatorActorId: IssueActorId,
  labelIds: Schema.Array(IssueLabelId),
  estimate: Schema.NullOr(Schema.Number),
  dueDate: Schema.NullOr(Schema.String),
  cycleId: Schema.NullOr(IssueCycleId),
  epicId: Schema.NullOr(IssueEpicId),
  milestoneId: Schema.NullOr(IssueMilestoneId),
  parentIssueId: Schema.NullOr(IssueId),
  orderKey: Schema.String,
  delegationStatus: DelegationStatus,
  triaged: Schema.Boolean,
  ...EntityTimestamps,
});
export type Issue = typeof Issue.Type;

export const IssueRelation = Schema.Struct({
  id: IssueRelationId,
  issueId: IssueId,
  relationType: RelationType,
  relatedIssueId: IssueId,
  ...EntityTimestamps,
});
export type IssueRelation = typeof IssueRelation.Type;

export const IssueThreadLink = Schema.Struct({
  id: IssueThreadLinkId,
  issueId: IssueId,
  environmentId: Schema.String,
  threadId: Schema.String,
  logicalProjectKey: Schema.NullOr(Schema.String),
  status: ThreadLinkStatus,
  createdByActorId: IssueActorId,
  ...EntityTimestamps,
});
export type IssueThreadLink = typeof IssueThreadLink.Type;

export const IssueComment = Schema.Struct({
  id: IssueCommentId,
  issueId: IssueId,
  parentCommentId: Schema.NullOr(IssueCommentId),
  authorActorId: IssueActorId,
  bodyMd: Schema.String,
  editedAt: Schema.NullOr(IsoDateTime),
  ...EntityTimestamps,
});
export type IssueComment = typeof IssueComment.Type;

export const IssueCommentReaction = Schema.Struct({
  id: Schema.String,
  commentId: IssueCommentId,
  actorId: IssueActorId,
  emoji: Schema.String,
  ...EntityTimestamps,
});
export type IssueCommentReaction = typeof IssueCommentReaction.Type;

export const IssueFilterConfig = Schema.Struct({
  teamIds: Schema.optionalKey(Schema.Array(IssueTeamId)),
  stateIds: Schema.optionalKey(Schema.Array(IssueStateId)),
  stateCategories: Schema.optionalKey(Schema.Array(StateCategory)),
  assigneeActorIds: Schema.optionalKey(Schema.Array(IssueActorId)),
  creatorActorIds: Schema.optionalKey(Schema.Array(IssueActorId)),
  priorities: Schema.optionalKey(Schema.Array(IssuePriority)),
  labelIds: Schema.optionalKey(Schema.Array(IssueLabelId)),
  cycleIds: Schema.optionalKey(Schema.Array(IssueCycleId)),
  epicIds: Schema.optionalKey(Schema.Array(IssueEpicId)),
  parentIssueId: Schema.optionalKey(Schema.NullOr(IssueId)),
  dueBefore: Schema.optionalKey(Schema.String),
  searchText: Schema.optionalKey(Schema.String),
  includeDeleted: Schema.optionalKey(Schema.Boolean),
});
export type IssueFilterConfig = typeof IssueFilterConfig.Type;

export const IssueDisplayConfig = Schema.Struct({
  viewMode: ViewMode,
  groupBy: GroupBy,
  swimlaneBy: Schema.optionalKey(Schema.Literals(["none", "priority", "assignee", "epic"])),
  orderBy: OrderBy,
  showCompleted: Schema.Boolean,
  showTriage: Schema.Boolean,
  showSubIssues: Schema.Boolean,
});
export type IssueDisplayConfig = typeof IssueDisplayConfig.Type;

export const IssueSavedView = Schema.Struct({
  id: IssueSavedViewId,
  scope: SavedViewScope,
  teamId: Schema.NullOr(IssueTeamId),
  ownerUserId: Schema.String,
  name: Schema.String,
  icon: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  filters: IssueFilterConfig,
  display: IssueDisplayConfig,
  position: Schema.Number,
  ...EntityTimestamps,
});
export type IssueSavedView = typeof IssueSavedView.Type;

export const IssueEventRecord = Schema.Struct({
  id: Schema.String,
  issueId: IssueId,
  actorId: Schema.NullOr(IssueActorId),
  kind: Schema.String,
  payload: Schema.Unknown,
  threadRef: Schema.NullOr(
    Schema.Struct({
      environmentId: Schema.String,
      threadId: Schema.String,
    }),
  ),
  ...EntityTimestamps,
});
export type IssueEventRecord = typeof IssueEventRecord.Type;

export const IssuesSnapshot = Schema.Struct({
  mirrorSeq: Schema.Number,
  syncedAt: Schema.NullOr(IsoDateTime),
  online: Schema.Boolean,
  workspaceKey: Schema.String,
  viewerUserId: Schema.NullOr(Schema.String),
  teams: Schema.Array(IssueTeam),
  memberships: Schema.Array(IssueTeamMembership),
  states: Schema.Array(IssueWorkflowState),
  labels: Schema.Array(IssueLabel),
  actors: Schema.Array(IssueActor),
  cycles: Schema.Array(IssueCycle),
  epics: Schema.Array(IssueEpic),
  milestones: Schema.Array(IssueMilestone),
  issues: Schema.Array(Issue),
  relations: Schema.Array(IssueRelation),
  threadLinks: Schema.Array(IssueThreadLink),
  savedViews: Schema.Array(IssueSavedView),
});
export type IssuesSnapshot = typeof IssuesSnapshot.Type;

export const IssuesEntityRow = Schema.Union([
  Schema.Struct({ table: Schema.Literal("teams"), row: IssueTeam }),
  Schema.Struct({ table: Schema.Literal("memberships"), row: IssueTeamMembership }),
  Schema.Struct({ table: Schema.Literal("states"), row: IssueWorkflowState }),
  Schema.Struct({ table: Schema.Literal("labels"), row: IssueLabel }),
  Schema.Struct({ table: Schema.Literal("actors"), row: IssueActor }),
  Schema.Struct({ table: Schema.Literal("cycles"), row: IssueCycle }),
  Schema.Struct({ table: Schema.Literal("epics"), row: IssueEpic }),
  Schema.Struct({ table: Schema.Literal("milestones"), row: IssueMilestone }),
  Schema.Struct({ table: Schema.Literal("issues"), row: Issue }),
  Schema.Struct({ table: Schema.Literal("relations"), row: IssueRelation }),
  Schema.Struct({ table: Schema.Literal("threadLinks"), row: IssueThreadLink }),
  Schema.Struct({ table: Schema.Literal("savedViews"), row: IssueSavedView }),
]);
export type IssuesEntityRow = typeof IssuesEntityRow.Type;

export const IssuesStreamItem = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("snapshot"), snapshot: IssuesSnapshot }),
  Schema.Struct({ kind: Schema.Literal("upsert"), seq: Schema.Number, entity: IssuesEntityRow }),
  Schema.Struct({
    kind: Schema.Literal("remove"),
    seq: Schema.Number,
    table: Schema.String,
    id: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("status"),
    online: Schema.Boolean,
    syncedAt: Schema.NullOr(IsoDateTime),
  }),
]);
export type IssuesStreamItem = typeof IssuesStreamItem.Type;

export const IssueDetail = Schema.Struct({
  issueId: IssueId,
  descriptionMd: Schema.String,
  comments: Schema.Array(IssueComment),
  reactions: Schema.Array(IssueCommentReaction),
  events: Schema.Array(IssueEventRecord),
});
export type IssueDetail = typeof IssueDetail.Type;

export const IssueDetailStreamItem = Schema.Struct({
  kind: Schema.Literal("detail"),
  detail: IssueDetail,
});
export type IssueDetailStreamItem = typeof IssueDetailStreamItem.Type;

const IssueCreateCommand = Schema.Struct({
  type: Schema.Literal("issue.create"),
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

const IssueUpdateCommand = Schema.Struct({
  type: Schema.Literal("issue.update"),
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

const IssueDeleteCommand = Schema.Struct({
  type: Schema.Literal("issue.delete"),
  issueId: IssueId,
});
const IssueRestoreCommand = Schema.Struct({
  type: Schema.Literal("issue.restore"),
  issueId: IssueId,
});
const IssuePurgeCommand = Schema.Struct({
  type: Schema.Literal("issue.purge"),
  issueId: IssueId,
});

const IssueMoveTeamCommand = Schema.Struct({
  type: Schema.Literal("issue.moveTeam"),
  issueId: IssueId,
  teamId: Schema.NullOr(IssueTeamId),
});

const IssueStartWorkCommand = Schema.Struct({
  type: Schema.Literal("issue.startWork"),
  issueId: IssueId,
  repoLogicalKey: Schema.optionalKey(Schema.String),
});

const CommentCreateCommand = Schema.Struct({
  type: Schema.Literal("comment.create"),
  issueId: IssueId,
  parentCommentId: Schema.optionalKey(IssueCommentId),
  bodyMd: Schema.String,
});

const CommentUpdateCommand = Schema.Struct({
  type: Schema.Literal("comment.update"),
  commentId: IssueCommentId,
  bodyMd: Schema.String,
});

const CommentDeleteCommand = Schema.Struct({
  type: Schema.Literal("comment.delete"),
  commentId: IssueCommentId,
});

const ReactionToggleCommand = Schema.Struct({
  type: Schema.Literal("reaction.toggle"),
  commentId: IssueCommentId,
  emoji: Schema.String,
});

const RelationCreateCommand = Schema.Struct({
  type: Schema.Literal("relation.create"),
  issueId: IssueId,
  relationType: RelationType,
  relatedIssueId: IssueId,
});

const RelationDeleteCommand = Schema.Struct({
  type: Schema.Literal("relation.delete"),
  relationId: IssueRelationId,
});

const ThreadLinkCreateCommand = Schema.Struct({
  type: Schema.Literal("threadLink.create"),
  issueId: IssueId,
  threadId: Schema.String,
  environmentId: Schema.String,
  logicalProjectKey: Schema.optionalKey(Schema.String),
});

const ThreadLinkUpdateCommand = Schema.Struct({
  type: Schema.Literal("threadLink.update"),
  linkId: IssueThreadLinkId,
  status: ThreadLinkStatus,
});

const ThreadLinkDeleteCommand = Schema.Struct({
  type: Schema.Literal("threadLink.delete"),
  linkId: IssueThreadLinkId,
});

const TeamCreateCommand = Schema.Struct({
  type: Schema.Literal("team.create"),
  name: Schema.String,
  key: Schema.String,
  icon: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});

const TeamUpdateCommand = Schema.Struct({
  type: Schema.Literal("team.update"),
  teamId: IssueTeamId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    icon: Schema.optionalKey(Schema.NullOr(Schema.String)),
    color: Schema.optionalKey(Schema.NullOr(Schema.String)),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    key: Schema.optionalKey(Schema.String),
    cycleConfig: Schema.optionalKey(IssueCycleConfig),
    estimateScale: Schema.optionalKey(EstimateScale),
    repoLinks: Schema.optionalKey(Schema.Array(IssueTeamRepoLink)),
    defaultRepoLogicalKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});

const TeamDeleteCommand = Schema.Struct({
  type: Schema.Literal("team.delete"),
  teamId: IssueTeamId,
});
const TeamMemberAddCommand = Schema.Struct({
  type: Schema.Literal("team.memberAdd"),
  teamId: IssueTeamId,
  actorId: IssueActorId,
});
const TeamMemberRemoveCommand = Schema.Struct({
  type: Schema.Literal("team.memberRemove"),
  membershipId: IssueTeamMembershipId,
});

const StateCreateCommand = Schema.Struct({
  type: Schema.Literal("state.create"),
  teamId: Schema.NullOr(IssueTeamId),
  name: Schema.String,
  color: Schema.String,
  category: StateCategory,
  position: Schema.Number,
});
const StateUpdateCommand = Schema.Struct({
  type: Schema.Literal("state.update"),
  stateId: IssueStateId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    color: Schema.optionalKey(Schema.String),
    position: Schema.optionalKey(Schema.Number),
  }),
});
const StateDeleteCommand = Schema.Struct({
  type: Schema.Literal("state.delete"),
  stateId: IssueStateId,
  migrateToStateId: IssueStateId,
});

const LabelCreateCommand = Schema.Struct({
  type: Schema.Literal("label.create"),
  teamId: Schema.NullOr(IssueTeamId),
  name: Schema.String,
  color: Schema.String,
  description: Schema.optionalKey(Schema.String),
});
const LabelUpdateCommand = Schema.Struct({
  type: Schema.Literal("label.update"),
  labelId: IssueLabelId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    color: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});
const LabelDeleteCommand = Schema.Struct({
  type: Schema.Literal("label.delete"),
  labelId: IssueLabelId,
});

const CycleUpdateCommand = Schema.Struct({
  type: Schema.Literal("cycle.update"),
  cycleId: IssueCycleId,
  patch: Schema.Struct({ name: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
});

const EpicCreateCommand = Schema.Struct({
  type: Schema.Literal("epic.create"),
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  icon: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(EpicStatus),
  startDate: Schema.optionalKey(Schema.String),
  targetDate: Schema.optionalKey(Schema.String),
});
const EpicUpdateCommand = Schema.Struct({
  type: Schema.Literal("epic.update"),
  epicId: IssueEpicId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    icon: Schema.optionalKey(Schema.NullOr(Schema.String)),
    color: Schema.optionalKey(Schema.NullOr(Schema.String)),
    status: Schema.optionalKey(EpicStatus),
    startDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
    targetDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});
const EpicDeleteCommand = Schema.Struct({
  type: Schema.Literal("epic.delete"),
  epicId: IssueEpicId,
});

const MilestoneCreateCommand = Schema.Struct({
  type: Schema.Literal("milestone.create"),
  epicId: IssueEpicId,
  name: Schema.String,
  targetDate: Schema.optionalKey(Schema.String),
  position: Schema.Number,
});
const MilestoneUpdateCommand = Schema.Struct({
  type: Schema.Literal("milestone.update"),
  milestoneId: IssueMilestoneId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    targetDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
    position: Schema.optionalKey(Schema.Number),
    completedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  }),
});
const MilestoneDeleteCommand = Schema.Struct({
  type: Schema.Literal("milestone.delete"),
  milestoneId: IssueMilestoneId,
});

const ViewCreateCommand = Schema.Struct({
  type: Schema.Literal("view.create"),
  scope: SavedViewScope,
  teamId: Schema.NullOr(IssueTeamId),
  name: Schema.String,
  icon: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.String),
  filters: IssueFilterConfig,
  display: IssueDisplayConfig,
  position: Schema.Number,
});
const ViewUpdateCommand = Schema.Struct({
  type: Schema.Literal("view.update"),
  viewId: IssueSavedViewId,
  patch: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    icon: Schema.optionalKey(Schema.NullOr(Schema.String)),
    color: Schema.optionalKey(Schema.NullOr(Schema.String)),
    filters: Schema.optionalKey(IssueFilterConfig),
    display: Schema.optionalKey(IssueDisplayConfig),
    position: Schema.optionalKey(Schema.Number),
  }),
});
const ViewDeleteCommand = Schema.Struct({
  type: Schema.Literal("view.delete"),
  viewId: IssueSavedViewId,
});

const AgentCreateCommand = Schema.Struct({
  type: Schema.Literal("agent.create"),
  displayName: Schema.String,
  avatarColor: Schema.String,
  config: AgentActorRuntimeConfig,
});
const AgentUpdateCommand = Schema.Struct({
  type: Schema.Literal("agent.update"),
  actorId: IssueActorId,
  patch: Schema.Struct({
    displayName: Schema.optionalKey(Schema.String),
    avatarColor: Schema.optionalKey(Schema.String),
    config: Schema.optionalKey(AgentActorRuntimeConfig),
  }),
});
const AgentDeleteCommand = Schema.Struct({
  type: Schema.Literal("agent.delete"),
  actorId: IssueActorId,
});
const WorkspaceUpdateCommand = Schema.Struct({
  type: Schema.Literal("workspace.update"),
  workspaceKey: Schema.String,
});

// Delegation-subsystem only; never exposed as an MCP tool.
const IssueSetDelegationStatusCommand = Schema.Struct({
  type: Schema.Literal("issue.setDelegationStatus"),
  issueId: IssueId,
  status: DelegationStatus,
});

export const IssueCommand = Schema.Union([
  IssueCreateCommand,
  IssueUpdateCommand,
  IssueMoveTeamCommand,
  IssueDeleteCommand,
  IssueRestoreCommand,
  IssuePurgeCommand,
  IssueStartWorkCommand,
  IssueSetDelegationStatusCommand,
  CommentCreateCommand,
  CommentUpdateCommand,
  CommentDeleteCommand,
  ReactionToggleCommand,
  RelationCreateCommand,
  RelationDeleteCommand,
  ThreadLinkCreateCommand,
  ThreadLinkUpdateCommand,
  ThreadLinkDeleteCommand,
  TeamCreateCommand,
  TeamUpdateCommand,
  TeamDeleteCommand,
  TeamMemberAddCommand,
  TeamMemberRemoveCommand,
  StateCreateCommand,
  StateUpdateCommand,
  StateDeleteCommand,
  LabelCreateCommand,
  LabelUpdateCommand,
  LabelDeleteCommand,
  CycleUpdateCommand,
  EpicCreateCommand,
  EpicUpdateCommand,
  EpicDeleteCommand,
  MilestoneCreateCommand,
  MilestoneUpdateCommand,
  MilestoneDeleteCommand,
  ViewCreateCommand,
  ViewUpdateCommand,
  ViewDeleteCommand,
  AgentCreateCommand,
  AgentUpdateCommand,
  AgentDeleteCommand,
  WorkspaceUpdateCommand,
]);
export type IssueCommand = typeof IssueCommand.Type;

export const IssueCommandResult = Schema.Struct({
  createdId: Schema.NullOr(Schema.String),
  identifier: Schema.NullOr(Schema.String),
});
export type IssueCommandResult = typeof IssueCommandResult.Type;

export const IssueCommandAttribution = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("human") }),
  Schema.Struct({
    kind: Schema.Literal("agent"),
    actorId: IssueActorId,
    threadId: Schema.String,
  }),
]);
export type IssueCommandAttribution = typeof IssueCommandAttribution.Type;

export const IssuesDomainErrorCode = Schema.Literals([
  "offline",
  "not-found",
  "forbidden",
  "guardrail",
  "conflict",
  "invalid",
]);
export type IssuesDomainErrorCode = typeof IssuesDomainErrorCode.Type;

export class IssuesDomainError extends Schema.TaggedErrorClass<IssuesDomainError>()(
  "IssuesDomainError",
  {
    code: IssuesDomainErrorCode,
    message: Schema.String,
  },
) {}

export const DelegationQueueState = Schema.Struct({
  running: Schema.Array(
    Schema.Struct({
      issueId: IssueId,
      actorId: IssueActorId,
      threadId: Schema.String,
      startedAt: IsoDateTime,
    }),
  ),
  queued: Schema.Array(
    Schema.Struct({
      issueId: IssueId,
      actorId: IssueActorId,
      enqueuedAt: IsoDateTime,
      priority: IssuePriority,
    }),
  ),
  capacity: Schema.Struct({
    maxConcurrent: Schema.Number,
    cpuPercent: Schema.NullOr(Schema.Number),
    freeMemoryMb: Schema.NullOr(Schema.Number),
    headroomOk: Schema.Boolean,
  }),
});
export type DelegationQueueState = typeof DelegationQueueState.Type;
