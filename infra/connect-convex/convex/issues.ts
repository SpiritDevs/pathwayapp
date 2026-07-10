import type { IssueCommand, IssueCommandAttribution, StateCategory } from "@pathwayos/contracts";
import {
  internalMutationGeneric,
  internalQueryGeneric,
  type DocumentByName,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";

import {
  assertIssueCommandGuardrails,
  cycleWindows,
  DEFAULT_CYCLE_CONFIG,
  DEFAULT_STATES,
  DEFAULT_WORKSPACE_KEY,
  formatIssueIdentifier,
  isIncompleteStateCategory,
  nextIssueOrderKey,
  normalizeIssueKey,
  sanitizedIssueCommandPayload,
} from "../src/issuesLogic.ts";
import type { DataModel } from "./authorization.ts";
import { requireEnvironmentPrincipal, type EnvironmentPrincipal } from "./environmentAuthorization.ts";

const nullableString = v.union(v.null(), v.string());
const optionalNullableString = v.optional(nullableString);
const priority = v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3), v.literal(4));
const stateCategory = v.union(
  v.literal("triage"),
  v.literal("backlog"),
  v.literal("unstarted"),
  v.literal("started"),
  v.literal("completed"),
  v.literal("canceled"),
);
const delegationStatus = v.union(
  v.null(),
  v.literal("queued"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);
const cycleConfig = v.object({
  enabled: v.boolean(),
  startDayOfWeek: v.union(
    v.literal(0),
    v.literal(1),
    v.literal(2),
    v.literal(3),
    v.literal(4),
    v.literal(5),
    v.literal(6),
  ),
  durationWeeks: v.number(),
  cooldownWeeks: v.number(),
  autoRollover: v.boolean(),
});
const repoLink = v.object({ logicalProjectKey: v.string(), displayName: v.string() });
const agentConfig = v.object({
  providerInstanceId: nullableString,
  model: nullableString,
  instructions: nullableString,
  runtimeMode: v.optional(
    v.union(
      v.literal("approval-required"),
      v.literal("auto-accept-edits"),
      v.literal("full-access"),
    ),
  ),
});
const filterConfig = v.object({
  teamIds: v.optional(v.array(v.id("issueTeams"))),
  stateIds: v.optional(v.array(v.id("issueStates"))),
  stateCategories: v.optional(v.array(stateCategory)),
  assigneeActorIds: v.optional(v.array(v.id("issueActors"))),
  creatorActorIds: v.optional(v.array(v.id("issueActors"))),
  priorities: v.optional(v.array(priority)),
  labelIds: v.optional(v.array(v.id("issueLabels"))),
  cycleIds: v.optional(v.array(v.id("issueCycles"))),
  epicIds: v.optional(v.array(v.id("issueEpics"))),
  parentIssueId: v.optional(v.union(v.null(), v.id("issues"))),
  dueBefore: v.optional(v.string()),
  searchText: v.optional(v.string()),
  includeDeleted: v.optional(v.boolean()),
});
const displayConfig = v.object({
  viewMode: v.union(v.literal("list"), v.literal("board")),
  groupBy: v.union(
    v.literal("state"),
    v.literal("assignee"),
    v.literal("priority"),
    v.literal("label"),
    v.literal("cycle"),
    v.literal("epic"),
    v.literal("team"),
    v.literal("none"),
  ),
  swimlaneBy: v.optional(
    v.union(v.literal("none"), v.literal("priority"), v.literal("assignee"), v.literal("epic")),
  ),
  orderBy: v.union(
    v.literal("manual"),
    v.literal("priority"),
    v.literal("dueDate"),
    v.literal("createdAt"),
    v.literal("updatedAt"),
  ),
  showCompleted: v.boolean(),
  showTriage: v.boolean(),
  showSubIssues: v.boolean(),
});

const issueCommand = v.union(
  v.object({
    type: v.literal("issue.create"), title: v.string(), teamId: v.union(v.null(), v.id("issueTeams")),
    descriptionMd: v.optional(v.string()), stateId: v.optional(v.id("issueStates")),
    priority: v.optional(priority), assigneeActorId: v.optional(v.union(v.null(), v.id("issueActors"))),
    labelIds: v.optional(v.array(v.id("issueLabels"))), estimate: v.optional(v.union(v.null(), v.number())),
    dueDate: optionalNullableString, cycleId: v.optional(v.union(v.null(), v.id("issueCycles"))),
    epicId: v.optional(v.union(v.null(), v.id("issueEpics"))),
    milestoneId: v.optional(v.union(v.null(), v.id("issueMilestones"))),
    parentIssueId: v.optional(v.union(v.null(), v.id("issues"))),
  }),
  v.object({
    type: v.literal("issue.update"), issueId: v.id("issues"),
    patch: v.object({
      title: v.optional(v.string()), descriptionMd: v.optional(v.string()), priority: v.optional(priority),
      stateId: v.optional(v.id("issueStates")), assigneeActorId: v.optional(v.union(v.null(), v.id("issueActors"))),
      labelIds: v.optional(v.array(v.id("issueLabels"))), estimate: v.optional(v.union(v.null(), v.number())),
      dueDate: optionalNullableString, cycleId: v.optional(v.union(v.null(), v.id("issueCycles"))),
      epicId: v.optional(v.union(v.null(), v.id("issueEpics"))),
      milestoneId: v.optional(v.union(v.null(), v.id("issueMilestones"))),
      parentIssueId: v.optional(v.union(v.null(), v.id("issues"))), orderKey: v.optional(v.string()),
      triaged: v.optional(v.boolean()),
    }),
  }),
  v.object({ type: v.literal("issue.moveTeam"), issueId: v.id("issues"), teamId: v.union(v.null(), v.id("issueTeams")) }),
  v.object({ type: v.literal("issue.delete"), issueId: v.id("issues") }),
  v.object({ type: v.literal("issue.restore"), issueId: v.id("issues") }),
  v.object({ type: v.literal("issue.purge"), issueId: v.id("issues") }),
  v.object({ type: v.literal("issue.startWork"), issueId: v.id("issues"), repoLogicalKey: v.optional(v.string()) }),
  v.object({ type: v.literal("issue.setDelegationStatus"), issueId: v.id("issues"), status: delegationStatus }),
  v.object({ type: v.literal("comment.create"), issueId: v.id("issues"), parentCommentId: v.optional(v.id("issueComments")), bodyMd: v.string() }),
  v.object({ type: v.literal("comment.update"), commentId: v.id("issueComments"), bodyMd: v.string() }),
  v.object({ type: v.literal("comment.delete"), commentId: v.id("issueComments") }),
  v.object({ type: v.literal("reaction.toggle"), commentId: v.id("issueComments"), emoji: v.string() }),
  v.object({ type: v.literal("relation.create"), issueId: v.id("issues"), relationType: v.union(v.literal("blocks"), v.literal("related"), v.literal("duplicate")), relatedIssueId: v.id("issues") }),
  v.object({ type: v.literal("relation.delete"), relationId: v.id("issueRelations") }),
  v.object({ type: v.literal("threadLink.create"), issueId: v.id("issues"), threadId: v.string(), environmentId: v.string(), logicalProjectKey: v.optional(v.string()) }),
  v.object({ type: v.literal("threadLink.update"), linkId: v.id("issueThreadLinks"), status: v.union(v.literal("linked"), v.literal("working"), v.literal("closed")) }),
  v.object({ type: v.literal("threadLink.delete"), linkId: v.id("issueThreadLinks") }),
  v.object({ type: v.literal("team.create"), name: v.string(), key: v.string(), icon: v.optional(v.string()), color: v.optional(v.string()), description: v.optional(v.string()) }),
  v.object({ type: v.literal("team.update"), teamId: v.id("issueTeams"), patch: v.object({ name: v.optional(v.string()), icon: optionalNullableString, color: optionalNullableString, description: optionalNullableString, key: v.optional(v.string()), cycleConfig: v.optional(cycleConfig), estimateScale: v.optional(v.union(v.literal("disabled"), v.literal("exponential"), v.literal("fibonacci"), v.literal("linear"), v.literal("tshirt"))), repoLinks: v.optional(v.array(repoLink)), defaultRepoLogicalKey: optionalNullableString }) }),
  v.object({ type: v.literal("team.delete"), teamId: v.id("issueTeams") }),
  v.object({ type: v.literal("team.memberAdd"), teamId: v.id("issueTeams"), actorId: v.id("issueActors") }),
  v.object({ type: v.literal("team.memberRemove"), membershipId: v.id("issueTeamMemberships") }),
  v.object({ type: v.literal("state.create"), teamId: v.union(v.null(), v.id("issueTeams")), name: v.string(), color: v.string(), category: stateCategory, position: v.number() }),
  v.object({ type: v.literal("state.update"), stateId: v.id("issueStates"), patch: v.object({ name: v.optional(v.string()), color: v.optional(v.string()), position: v.optional(v.number()) }) }),
  v.object({ type: v.literal("state.delete"), stateId: v.id("issueStates"), migrateToStateId: v.id("issueStates") }),
  v.object({ type: v.literal("label.create"), teamId: v.union(v.null(), v.id("issueTeams")), name: v.string(), color: v.string(), description: v.optional(v.string()) }),
  v.object({ type: v.literal("label.update"), labelId: v.id("issueLabels"), patch: v.object({ name: v.optional(v.string()), color: v.optional(v.string()), description: optionalNullableString }) }),
  v.object({ type: v.literal("label.delete"), labelId: v.id("issueLabels") }),
  v.object({ type: v.literal("cycle.update"), cycleId: v.id("issueCycles"), patch: v.object({ name: optionalNullableString }) }),
  v.object({ type: v.literal("epic.create"), name: v.string(), description: v.optional(v.string()), icon: v.optional(v.string()), color: v.optional(v.string()), status: v.optional(v.union(v.literal("backlog"), v.literal("planned"), v.literal("in-progress"), v.literal("paused"), v.literal("completed"), v.literal("canceled"))), startDate: v.optional(v.string()), targetDate: v.optional(v.string()) }),
  v.object({ type: v.literal("epic.update"), epicId: v.id("issueEpics"), patch: v.object({ name: v.optional(v.string()), description: optionalNullableString, icon: optionalNullableString, color: optionalNullableString, status: v.optional(v.union(v.literal("backlog"), v.literal("planned"), v.literal("in-progress"), v.literal("paused"), v.literal("completed"), v.literal("canceled"))), startDate: optionalNullableString, targetDate: optionalNullableString }) }),
  v.object({ type: v.literal("epic.delete"), epicId: v.id("issueEpics") }),
  v.object({ type: v.literal("milestone.create"), epicId: v.id("issueEpics"), name: v.string(), targetDate: v.optional(v.string()), position: v.number() }),
  v.object({ type: v.literal("milestone.update"), milestoneId: v.id("issueMilestones"), patch: v.object({ name: v.optional(v.string()), targetDate: optionalNullableString, position: v.optional(v.number()), completedAt: optionalNullableString }) }),
  v.object({ type: v.literal("milestone.delete"), milestoneId: v.id("issueMilestones") }),
  v.object({ type: v.literal("view.create"), scope: v.union(v.literal("personal"), v.literal("team")), teamId: v.union(v.null(), v.id("issueTeams")), name: v.string(), icon: v.optional(v.string()), color: v.optional(v.string()), filters: filterConfig, display: displayConfig, position: v.number() }),
  v.object({ type: v.literal("view.update"), viewId: v.id("issueSavedViews"), patch: v.object({ name: v.optional(v.string()), icon: optionalNullableString, color: optionalNullableString, filters: v.optional(filterConfig), display: v.optional(displayConfig), position: v.optional(v.number()) }) }),
  v.object({ type: v.literal("view.delete"), viewId: v.id("issueSavedViews") }),
  v.object({ type: v.literal("agent.create"), displayName: v.string(), avatarColor: v.string(), config: agentConfig }),
  v.object({ type: v.literal("agent.update"), actorId: v.id("issueActors"), patch: v.object({ displayName: v.optional(v.string()), avatarColor: v.optional(v.string()), config: v.optional(agentConfig) }) }),
  v.object({ type: v.literal("agent.delete"), actorId: v.id("issueActors") }),
  v.object({ type: v.literal("workspace.update"), workspaceKey: v.string() }),
);

const attributionValidator = v.union(
  v.object({ kind: v.literal("human") }),
  v.object({ kind: v.literal("agent"), actorId: v.id("issueActors"), threadId: v.string() }),
);

type MutationCtx = GenericMutationCtx<DataModel>;
type QueryCtx = GenericQueryCtx<DataModel>;
type IssueDoc = DocumentByName<DataModel, "issues">;
type AttributionInput =
  | { readonly kind: "human" }
  | { readonly kind: "agent"; readonly actorId: GenericId<"issueActors">; readonly threadId: string };

function nowIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function assertTenant<T extends { readonly tenantId: EnvironmentPrincipal["tenantId"] }>(
  row: T | null,
  principal: EnvironmentPrincipal,
  error: string,
): T {
  if (row === null || row.tenantId !== principal.tenantId) throw new Error(error);
  return row;
}

async function allocateSyncSeq(ctx: MutationCtx, principal: EnvironmentPrincipal, now: string): Promise<number> {
  const meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
  if (meta === null) throw new Error("ISSUES_META_NOT_FOUND");
  const sequence = meta.nextSyncSeq;
  await ctx.db.patch("issueMeta", meta._id, { nextSyncSeq: sequence + 1, syncSeq: sequence, updatedAt: now });
  return sequence;
}

async function seedStates(ctx: MutationCtx, principal: EnvironmentPrincipal, teamId: DocumentByName<DataModel, "issueTeams">["_id"] | null, now: string): Promise<void> {
  for (const state of DEFAULT_STATES) {
    const syncSeq = await allocateSyncSeq(ctx, principal, now);
    await ctx.db.insert("issueStates", { ...state, teamId, tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, syncSeq, createdAt: now, updatedAt: now, deletedAt: null });
  }
}

async function ensureSeeded(ctx: MutationCtx, principal: EnvironmentPrincipal, now: string): Promise<DocumentByName<DataModel, "issueActors">> {
  let meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
  if (meta === null) {
    const metaId = await ctx.db.insert("issueMeta", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, workspaceKey: DEFAULT_WORKSPACE_KEY, nextSyncSeq: 1, syncSeq: 0, createdAt: now, updatedAt: now, deletedAt: null });
    meta = await ctx.db.get("issueMeta", metaId);
    await seedStates(ctx, principal, null, now);
  }
  let actor = await ctx.db.query("issueActors").withIndex("by_tenant_owner_kind", (query) => query.eq("tenantId", principal.tenantId).eq("ownerUserId", principal.ownerUserId).eq("kind", "human")).unique();
  if (actor === null) {
    const syncSeq = await allocateSyncSeq(ctx, principal, now);
    const actorId = await ctx.db.insert("issueActors", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, kind: "human", displayName: principal.ownerUserId, avatarColor: "#64748B", avatarUrl: null, syncSeq, createdAt: now, updatedAt: now, deletedAt: null });
    actor = await ctx.db.get("issueActors", actorId);
  }
  if (meta === null || actor === null) throw new Error("ISSUES_SEED_FAILED");
  return actor;
}

async function actorForAttribution(ctx: MutationCtx, principal: EnvironmentPrincipal, attribution: AttributionInput, humanActor: DocumentByName<DataModel, "issueActors">): Promise<DocumentByName<DataModel, "issueActors">> {
  if (attribution.kind === "human") return humanActor;
  return assertTenant(await ctx.db.get("issueActors", attribution.actorId), principal, "ISSUES_ACTOR_NOT_FOUND");
}

async function bumpIssueForDetail(ctx: MutationCtx, principal: EnvironmentPrincipal, issue: IssueDoc, now: string): Promise<void> {
  await ctx.db.patch("issues", issue._id, { syncSeq: await allocateSyncSeq(ctx, principal, now) });
}

async function appendIssueEvent(ctx: MutationCtx, principal: EnvironmentPrincipal, issue: IssueDoc, actorId: DocumentByName<DataModel, "issueActors">["_id"] | null, command: IssueCommand, attribution: AttributionInput, now: string): Promise<void> {
  const syncSeq = await allocateSyncSeq(ctx, principal, now);
  await ctx.db.insert("issueEvents", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, issueId: issue._id, actorId, kind: command.type, payload: sanitizedIssueCommandPayload(command), threadRef: attribution.kind === "agent" ? { environmentId: principal.environmentId, threadId: attribution.threadId } : null, syncSeq, createdAt: now, updatedAt: now, deletedAt: null });
  await bumpIssueForDetail(ctx, principal, issue, now);
}

async function nextIssueNumber(ctx: MutationCtx, principal: EnvironmentPrincipal, scopeKey: string, now: string): Promise<number> {
  const counter = await ctx.db.query("issueCounters").withIndex("by_tenant_scope", (query) => query.eq("tenantId", principal.tenantId).eq("scopeKey", scopeKey)).unique();
  if (counter === null) {
    await ctx.db.insert("issueCounters", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, scopeKey, next: 2, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
    return 1;
  }
  const number = counter.next;
  await ctx.db.patch("issueCounters", counter._id, { next: number + 1, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now, deletedAt: null });
  return number;
}

async function statesForTeam(ctx: QueryCtx | MutationCtx, principal: EnvironmentPrincipal, teamId: DocumentByName<DataModel, "issueTeams">["_id"] | null): Promise<ReadonlyArray<DocumentByName<DataModel, "issueStates">>> {
  return (await ctx.db.query("issueStates").withIndex("by_tenant_team", (query) => query.eq("tenantId", principal.tenantId).eq("teamId", teamId)).collect()).filter((state) => state.deletedAt === null);
}

async function defaultState(ctx: QueryCtx | MutationCtx, principal: EnvironmentPrincipal, teamId: DocumentByName<DataModel, "issueTeams">["_id"] | null, category: StateCategory = "backlog"): Promise<DocumentByName<DataModel, "issueStates">> {
  const states = await statesForTeam(ctx, principal, teamId);
  const state = states.filter((candidate) => candidate.category === category).sort((left, right) => left.position - right.position)[0] ?? states.sort((left, right) => left.position - right.position)[0];
  if (state === undefined) throw new Error("ISSUES_STATE_NOT_FOUND");
  return state;
}

async function issueById(ctx: QueryCtx | MutationCtx, principal: EnvironmentPrincipal, issueId: DocumentByName<DataModel, "issues">["_id"]): Promise<IssueDoc> {
  return assertTenant(await ctx.db.get("issues", issueId), principal, "ISSUES_ISSUE_NOT_FOUND");
}

interface IssueReferences {
  readonly assigneeActorId: GenericId<"issueActors"> | null;
  readonly labelIds: ReadonlyArray<GenericId<"issueLabels">>;
  readonly cycleId: GenericId<"issueCycles"> | null;
  readonly epicId: GenericId<"issueEpics"> | null;
  readonly milestoneId: GenericId<"issueMilestones"> | null;
  readonly parentIssueId: GenericId<"issues"> | null;
}

async function validateIssueReferences(
  ctx: MutationCtx,
  principal: EnvironmentPrincipal,
  teamId: GenericId<"issueTeams"> | null,
  references: IssueReferences,
): Promise<void> {
  if (references.assigneeActorId !== null) {
    const assignee = assertTenant(await ctx.db.get("issueActors", references.assigneeActorId), principal, "ISSUES_ACTOR_NOT_FOUND");
    if (assignee.deletedAt !== null) throw new Error("ISSUES_ACTOR_NOT_FOUND");
  }
  for (const labelId of references.labelIds) {
    const label = assertTenant(await ctx.db.get("issueLabels", labelId), principal, "ISSUES_LABEL_NOT_FOUND");
    if (label.deletedAt !== null || (label.teamId !== null && label.teamId !== teamId)) throw new Error("ISSUES_LABEL_INVALID");
  }
  if (references.cycleId !== null) {
    const cycle = assertTenant(await ctx.db.get("issueCycles", references.cycleId), principal, "ISSUES_CYCLE_NOT_FOUND");
    if (cycle.deletedAt !== null || cycle.teamId !== teamId) throw new Error("ISSUES_CYCLE_INVALID");
  }
  if (references.epicId !== null) {
    const epic = assertTenant(await ctx.db.get("issueEpics", references.epicId), principal, "ISSUES_EPIC_NOT_FOUND");
    if (epic.deletedAt !== null) throw new Error("ISSUES_EPIC_NOT_FOUND");
  }
  if (references.milestoneId !== null) {
    const milestone = assertTenant(await ctx.db.get("issueMilestones", references.milestoneId), principal, "ISSUES_MILESTONE_NOT_FOUND");
    if (milestone.deletedAt !== null || (references.epicId !== null && milestone.epicId !== references.epicId)) throw new Error("ISSUES_MILESTONE_INVALID");
  }
  if (references.parentIssueId !== null) {
    const parent = await issueById(ctx, principal, references.parentIssueId);
    if (parent.deletedAt !== null) throw new Error("ISSUES_PARENT_NOT_FOUND");
  }
}

async function ensureTeamCycles(ctx: MutationCtx, principal: EnvironmentPrincipal, teamId: DocumentByName<DataModel, "issueTeams">["_id"], nowMs: number, now: string): Promise<void> {
  const team = assertTenant(await ctx.db.get("issueTeams", teamId), principal, "ISSUES_TEAM_NOT_FOUND");
  if (!team.cycleConfig.enabled || team.deletedAt !== null) return;
  const windows = cycleWindows(team.cycleConfig, nowMs);
  const materialized: Array<DocumentByName<DataModel, "issueCycles">> = [];
  for (const window of windows) {
    let cycle = await ctx.db.query("issueCycles").withIndex("by_team_number", (query) => query.eq("teamId", teamId).eq("number", window.number)).unique();
    if (cycle === null) {
      const cycleId = await ctx.db.insert("issueCycles", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, teamId, number: window.number, name: null, startsAt: window.startsAt, endsAt: window.endsAt, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
      cycle = await ctx.db.get("issueCycles", cycleId);
    }
    if (cycle !== null) materialized.push(cycle);
  }
  if (!team.cycleConfig.autoRollover || materialized.length < 2) return;
  const allCycles = (await ctx.db.query("issueCycles").withIndex("by_team_number", (query) => query.eq("teamId", teamId)).collect())
    .filter((cycle) => cycle.deletedAt === null)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const endedCycles = allCycles.filter((cycle) => Date.parse(cycle.endsAt) <= nowMs);
  const issues = await ctx.db.query("issues").withIndex("by_tenant_team", (query) => query.eq("tenantId", principal.tenantId).eq("teamId", teamId)).collect();
  for (const ended of endedCycles) {
    const destination = allCycles.find((cycle) => cycle.startsAt > ended.startsAt);
    if (destination === undefined) continue;
    for (const issue of issues) {
      if (issue.cycleId !== ended._id || issue.deletedAt !== null) continue;
      const state = assertTenant(await ctx.db.get("issueStates", issue.stateId), principal, "ISSUES_STATE_NOT_FOUND");
      if (!isIncompleteStateCategory(state.category)) continue;
      await ctx.db.patch("issues", issue._id, { cycleId: destination._id, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
    }
  }
}

function commandAsContract(command: unknown): IssueCommand {
  return command as IssueCommand;
}

function attributionAsContract(attribution: unknown): IssueCommandAttribution {
  return attribution as IssueCommandAttribution;
}

export const executeCommand = internalMutationGeneric({
  args: {
    credentialHash: v.string(),
    environmentId: v.string(),
    command: issueCommand,
    attribution: attributionValidator,
  },
  returns: v.object({ createdId: v.union(v.null(), v.string()), identifier: nullableString }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(ctx, args.credentialHash, args.environmentId);
    const nowMs = Date.now();
    const now = nowIso(nowMs);
    const commandContract = commandAsContract(args.command);
    const attributionContract = attributionAsContract(args.attribution);
    assertIssueCommandGuardrails(commandContract, attributionContract);
    const humanActor = await ensureSeeded(ctx, principal, now);
    const actor = await actorForAttribution(ctx, principal, args.attribution, humanActor);
    let createdId: string | null = null;
    let identifier: string | null = null;
    let eventIssue: IssueDoc | null = null;
    let touchedTeamId: DocumentByName<DataModel, "issueTeams">["_id"] | null = null;

    switch (args.command.type) {
      case "issue.create": {
        let teamKey: string;
        if (args.command.teamId === null) {
          const meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
          if (meta === null) throw new Error("ISSUES_META_NOT_FOUND");
          teamKey = meta.workspaceKey;
        } else {
          const team = assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
          if (team.deletedAt !== null) throw new Error("ISSUES_TEAM_NOT_FOUND");
          teamKey = team.key;
          touchedTeamId = team._id;
        }
        const scopeKey = args.command.teamId === null ? "workspace" : `team:${args.command.teamId}`;
        const number = await nextIssueNumber(ctx, principal, scopeKey, now);
        identifier = formatIssueIdentifier(teamKey, number);
        const selectedState = attributionContract.kind === "agent"
          ? await defaultState(ctx, principal, args.command.teamId, "triage")
          : args.command.stateId === undefined
            ? await defaultState(ctx, principal, args.command.teamId)
            : assertTenant(await ctx.db.get("issueStates", args.command.stateId), principal, "ISSUES_STATE_NOT_FOUND");
        if (selectedState.teamId !== args.command.teamId || selectedState.deletedAt !== null) throw new Error("ISSUES_STATE_INVALID");
        const siblings = await ctx.db.query("issues").withIndex("by_tenant_team", (query) => query.eq("tenantId", principal.tenantId).eq("teamId", args.command.teamId)).collect();
        await validateIssueReferences(ctx, principal, args.command.teamId, {
          assigneeActorId: args.command.assigneeActorId ?? null,
          labelIds: args.command.labelIds ?? [],
          cycleId: args.command.cycleId ?? null,
          epicId: args.command.epicId ?? null,
          milestoneId: args.command.milestoneId ?? null,
          parentIssueId: args.command.parentIssueId ?? null,
        });
        const issueId = await ctx.db.insert("issues", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          teamId: args.command.teamId,
          number,
          identifier,
          title: args.command.title,
          descriptionMd: args.command.descriptionMd ?? "",
          priority: args.command.priority ?? 0,
          stateId: selectedState._id,
          assigneeActorId: args.command.assigneeActorId ?? null,
          creatorActorId: actor._id,
          labelIds: args.command.labelIds ?? [],
          estimate: args.command.estimate ?? null,
          dueDate: args.command.dueDate ?? null,
          cycleId: args.command.cycleId ?? null,
          epicId: args.command.epicId ?? null,
          milestoneId: args.command.milestoneId ?? null,
          parentIssueId: args.command.parentIssueId ?? null,
          orderKey: nextIssueOrderKey(siblings.filter((issue) => issue.deletedAt === null).map((issue) => issue.orderKey)),
          delegationStatus: null,
          triaged: attributionContract.kind !== "agent",
          syncSeq: await allocateSyncSeq(ctx, principal, now),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        createdId = issueId;
        eventIssue = await issueById(ctx, principal, issueId);
        break;
      }
      case "issue.update": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        if (args.command.patch.stateId !== undefined) {
          const state = assertTenant(await ctx.db.get("issueStates", args.command.patch.stateId), principal, "ISSUES_STATE_NOT_FOUND");
          if (state.teamId !== issue.teamId || state.deletedAt !== null) throw new Error("ISSUES_STATE_INVALID");
        }
        const references = {
          assigneeActorId: args.command.patch.assigneeActorId === undefined ? issue.assigneeActorId : args.command.patch.assigneeActorId,
          labelIds: args.command.patch.labelIds ?? issue.labelIds,
          cycleId: args.command.patch.cycleId === undefined ? issue.cycleId : args.command.patch.cycleId,
          epicId: args.command.patch.epicId === undefined ? issue.epicId : args.command.patch.epicId,
          milestoneId: args.command.patch.milestoneId === undefined ? issue.milestoneId : args.command.patch.milestoneId,
          parentIssueId: args.command.patch.parentIssueId === undefined ? issue.parentIssueId : args.command.patch.parentIssueId,
        };
        if (references.parentIssueId === issue._id) throw new Error("ISSUES_PARENT_INVALID");
        await validateIssueReferences(ctx, principal, issue.teamId, references);
        await ctx.db.patch("issues", issue._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "issue.moveTeam": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        let key: string;
        if (args.command.teamId === null) {
          const meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
          if (meta === null) throw new Error("ISSUES_META_NOT_FOUND");
          key = meta.workspaceKey;
        } else {
          const team = assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
          key = team.key;
          touchedTeamId = team._id;
        }
        const oldState = assertTenant(await ctx.db.get("issueStates", issue.stateId), principal, "ISSUES_STATE_NOT_FOUND");
        const destinationStates = await statesForTeam(ctx, principal, args.command.teamId);
        const mappedState = destinationStates.filter((state) => state.category === oldState.category).sort((left, right) => left.position - right.position)[0] ?? await defaultState(ctx, principal, args.command.teamId);
        const number = await nextIssueNumber(ctx, principal, args.command.teamId === null ? "workspace" : `team:${args.command.teamId}`, now);
        const nextIdentifier = formatIssueIdentifier(key, number);
        await ctx.db.insert("issueAliases", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, alias: issue.identifier, issueId: issue._id, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        await ctx.db.patch("issues", issue._id, { teamId: args.command.teamId, number, identifier: nextIdentifier, stateId: mappedState._id, cycleId: null, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        identifier = nextIdentifier;
        eventIssue = issue;
        break;
      }
      case "issue.delete":
      case "issue.restore": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        await ctx.db.patch("issues", issue._id, { deletedAt: args.command.type === "issue.delete" ? now : null, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "issue.purge": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        const comments = await ctx.db.query("issueComments").withIndex("by_issue", (query) => query.eq("issueId", issue._id)).collect();
        for (const comment of comments) {
          const reactions = await ctx.db.query("issueCommentReactions").withIndex("by_comment_actor_emoji", (query) => query.eq("commentId", comment._id)).collect();
          for (const reaction of reactions) await ctx.db.delete("issueCommentReactions", reaction._id);
          await ctx.db.delete("issueComments", comment._id);
        }
        const relations = await ctx.db.query("issueRelations").withIndex("by_issue", (query) => query.eq("issueId", issue._id)).collect();
        const reverseRelations = await ctx.db.query("issueRelations").withIndex("by_related_issue", (query) => query.eq("relatedIssueId", issue._id)).collect();
        for (const relation of [...relations, ...reverseRelations]) await ctx.db.delete("issueRelations", relation._id);
        const links = await ctx.db.query("issueThreadLinks").withIndex("by_issue", (query) => query.eq("issueId", issue._id)).collect();
        for (const link of links) await ctx.db.delete("issueThreadLinks", link._id);
        await ctx.db.delete("issues", issue._id);
        const syncSeq = await allocateSyncSeq(ctx, principal, now);
        await ctx.db.insert("issueEvents", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, issueId: issue._id, actorId: actor._id, kind: "issue.purged", payload: { id: issue._id, purged: true }, threadRef: null, syncSeq, createdAt: now, updatedAt: now, deletedAt: null });
        touchedTeamId = issue.teamId;
        break;
      }
      case "issue.startWork": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        const startedState = await defaultState(ctx, principal, issue.teamId, "started");
        await ctx.db.patch("issues", issue._id, { stateId: startedState._id, delegationStatus: issue.assigneeActorId === null ? issue.delegationStatus : "queued", syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "issue.setDelegationStatus": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        await ctx.db.patch("issues", issue._id, { delegationStatus: args.command.status, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "comment.create": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        if (args.command.parentCommentId !== undefined) {
          const parent = assertTenant(await ctx.db.get("issueComments", args.command.parentCommentId), principal, "ISSUES_COMMENT_NOT_FOUND");
          if (parent.issueId !== issue._id) throw new Error("ISSUES_COMMENT_INVALID");
        }
        createdId = await ctx.db.insert("issueComments", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, issueId: issue._id, parentCommentId: args.command.parentCommentId ?? null, authorActorId: actor._id, bodyMd: args.command.bodyMd, editedAt: null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "comment.update":
      case "comment.delete": {
        const comment = assertTenant(await ctx.db.get("issueComments", args.command.commentId), principal, "ISSUES_COMMENT_NOT_FOUND");
        const issue = await issueById(ctx, principal, comment.issueId);
        if (args.command.type === "comment.update") await ctx.db.patch("issueComments", comment._id, { bodyMd: args.command.bodyMd, editedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueComments", comment._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "reaction.toggle": {
        const comment = assertTenant(await ctx.db.get("issueComments", args.command.commentId), principal, "ISSUES_COMMENT_NOT_FOUND");
        const issue = await issueById(ctx, principal, comment.issueId);
        const existing = await ctx.db.query("issueCommentReactions").withIndex("by_comment_actor_emoji", (query) => query.eq("commentId", comment._id).eq("actorId", actor._id).eq("emoji", args.command.emoji)).unique();
        if (existing === null) createdId = await ctx.db.insert("issueCommentReactions", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, commentId: comment._id, actorId: actor._id, emoji: args.command.emoji, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        else await ctx.db.patch("issueCommentReactions", existing._id, { deletedAt: existing.deletedAt === null ? now : null, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "relation.create": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        await issueById(ctx, principal, args.command.relatedIssueId);
        if (issue._id === args.command.relatedIssueId) throw new Error("ISSUES_RELATION_INVALID");
        createdId = await ctx.db.insert("issueRelations", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, issueId: issue._id, relationType: args.command.relationType, relatedIssueId: args.command.relatedIssueId, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "relation.delete": {
        const relation = assertTenant(await ctx.db.get("issueRelations", args.command.relationId), principal, "ISSUES_RELATION_NOT_FOUND");
        const issue = await issueById(ctx, principal, relation.issueId);
        await ctx.db.patch("issueRelations", relation._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "threadLink.create": {
        const issue = await issueById(ctx, principal, args.command.issueId);
        createdId = await ctx.db.insert("issueThreadLinks", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, issueId: issue._id, environmentId: args.command.environmentId, threadId: args.command.threadId, logicalProjectKey: args.command.logicalProjectKey ?? null, status: "linked", createdByActorId: actor._id, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "threadLink.update":
      case "threadLink.delete": {
        const link = assertTenant(await ctx.db.get("issueThreadLinks", args.command.linkId), principal, "ISSUES_THREAD_LINK_NOT_FOUND");
        const issue = await issueById(ctx, principal, link.issueId);
        if (args.command.type === "threadLink.update") await ctx.db.patch("issueThreadLinks", link._id, { status: args.command.status, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueThreadLinks", link._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        eventIssue = issue;
        touchedTeamId = issue.teamId;
        break;
      }
      case "team.create": {
        const key = normalizeIssueKey(args.command.key);
        const conflict = await ctx.db.query("issueTeams").withIndex("by_tenant_key", (query) => query.eq("tenantId", principal.tenantId).eq("key", key)).unique();
        if (conflict !== null) throw new Error("ISSUES_TEAM_KEY_CONFLICT");
        const teamId = await ctx.db.insert("issueTeams", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, name: args.command.name, description: args.command.description ?? null, icon: args.command.icon ?? null, color: args.command.color ?? null, key, cycleConfig: DEFAULT_CYCLE_CONFIG, estimateScale: "disabled", repoLinks: [], defaultRepoLogicalKey: null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        await seedStates(ctx, principal, teamId, now);
        createdId = teamId;
        touchedTeamId = teamId;
        break;
      }
      case "team.update": {
        const team = assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        const patch = args.command.patch.key === undefined ? args.command.patch : { ...args.command.patch, key: normalizeIssueKey(args.command.patch.key) };
        if (patch.key !== undefined) {
          const conflict = await ctx.db.query("issueTeams").withIndex("by_tenant_key", (query) => query.eq("tenantId", principal.tenantId).eq("key", patch.key!)).unique();
          if (conflict !== null && conflict._id !== team._id && conflict.deletedAt === null) throw new Error("ISSUES_TEAM_KEY_CONFLICT");
        }
        await ctx.db.patch("issueTeams", team._id, { ...patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = team._id;
        break;
      }
      case "team.delete": {
        const team = assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        await ctx.db.patch("issueTeams", team._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = team._id;
        break;
      }
      case "team.memberAdd": {
        const team = assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        assertTenant(await ctx.db.get("issueActors", args.command.actorId), principal, "ISSUES_ACTOR_NOT_FOUND");
        const existing = await ctx.db.query("issueTeamMemberships").withIndex("by_team_actor", (query) => query.eq("teamId", team._id).eq("actorId", args.command.actorId)).unique();
        if (existing === null) createdId = await ctx.db.insert("issueTeamMemberships", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, teamId: team._id, actorId: args.command.actorId, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        else await ctx.db.patch("issueTeamMemberships", existing._id, { deletedAt: null, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = team._id;
        break;
      }
      case "team.memberRemove": {
        const membership = assertTenant(await ctx.db.get("issueTeamMemberships", args.command.membershipId), principal, "ISSUES_MEMBERSHIP_NOT_FOUND");
        await ctx.db.patch("issueTeamMemberships", membership._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = membership.teamId;
        break;
      }
      case "state.create": {
        if (args.command.teamId !== null) assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        createdId = await ctx.db.insert("issueStates", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, teamId: args.command.teamId, name: args.command.name, color: args.command.color, category: args.command.category, position: args.command.position, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        touchedTeamId = args.command.teamId;
        break;
      }
      case "state.update": {
        const state = assertTenant(await ctx.db.get("issueStates", args.command.stateId), principal, "ISSUES_STATE_NOT_FOUND");
        await ctx.db.patch("issueStates", state._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = state.teamId;
        break;
      }
      case "state.delete": {
        const state = assertTenant(await ctx.db.get("issueStates", args.command.stateId), principal, "ISSUES_STATE_NOT_FOUND");
        const destination = assertTenant(await ctx.db.get("issueStates", args.command.migrateToStateId), principal, "ISSUES_STATE_NOT_FOUND");
        if (destination.category !== state.category || destination.teamId !== state.teamId || destination.deletedAt !== null || destination._id === state._id) throw new Error("ISSUES_STATE_MIGRATION_INVALID");
        const issues = await ctx.db.query("issues").withIndex("by_tenant_team", (query) => query.eq("tenantId", principal.tenantId).eq("teamId", state.teamId)).collect();
        for (const issue of issues) if (issue.stateId === state._id) await ctx.db.patch("issues", issue._id, { stateId: destination._id, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        await ctx.db.patch("issueStates", state._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = state.teamId;
        break;
      }
      case "label.create": {
        if (args.command.teamId !== null) assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        createdId = await ctx.db.insert("issueLabels", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, teamId: args.command.teamId, name: args.command.name, color: args.command.color, description: args.command.description ?? null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        touchedTeamId = args.command.teamId;
        break;
      }
      case "label.update":
      case "label.delete": {
        const label = assertTenant(await ctx.db.get("issueLabels", args.command.labelId), principal, "ISSUES_LABEL_NOT_FOUND");
        if (args.command.type === "label.update") await ctx.db.patch("issueLabels", label._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueLabels", label._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = label.teamId;
        break;
      }
      case "cycle.update": {
        const cycle = assertTenant(await ctx.db.get("issueCycles", args.command.cycleId), principal, "ISSUES_CYCLE_NOT_FOUND");
        await ctx.db.patch("issueCycles", cycle._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = cycle.teamId;
        break;
      }
      case "epic.create": {
        createdId = await ctx.db.insert("issueEpics", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, name: args.command.name, description: args.command.description ?? null, icon: args.command.icon ?? null, color: args.command.color ?? null, status: args.command.status ?? "backlog", startDate: args.command.startDate ?? null, targetDate: args.command.targetDate ?? null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        break;
      }
      case "epic.update":
      case "epic.delete": {
        const epic = assertTenant(await ctx.db.get("issueEpics", args.command.epicId), principal, "ISSUES_EPIC_NOT_FOUND");
        if (args.command.type === "epic.update") await ctx.db.patch("issueEpics", epic._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueEpics", epic._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        break;
      }
      case "milestone.create": {
        assertTenant(await ctx.db.get("issueEpics", args.command.epicId), principal, "ISSUES_EPIC_NOT_FOUND");
        createdId = await ctx.db.insert("issueMilestones", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, epicId: args.command.epicId, name: args.command.name, targetDate: args.command.targetDate ?? null, position: args.command.position, completedAt: null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        break;
      }
      case "milestone.update":
      case "milestone.delete": {
        const milestone = assertTenant(await ctx.db.get("issueMilestones", args.command.milestoneId), principal, "ISSUES_MILESTONE_NOT_FOUND");
        if (args.command.type === "milestone.update") await ctx.db.patch("issueMilestones", milestone._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueMilestones", milestone._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        break;
      }
      case "view.create": {
        if (args.command.teamId !== null) assertTenant(await ctx.db.get("issueTeams", args.command.teamId), principal, "ISSUES_TEAM_NOT_FOUND");
        createdId = await ctx.db.insert("issueSavedViews", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, scope: args.command.scope, teamId: args.command.teamId, name: args.command.name, icon: args.command.icon ?? null, color: args.command.color ?? null, filters: args.command.filters, display: args.command.display, position: args.command.position, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        touchedTeamId = args.command.teamId;
        break;
      }
      case "view.update":
      case "view.delete": {
        const view = assertTenant(await ctx.db.get("issueSavedViews", args.command.viewId), principal, "ISSUES_VIEW_NOT_FOUND");
        if (args.command.type === "view.update") await ctx.db.patch("issueSavedViews", view._id, { ...args.command.patch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        else await ctx.db.patch("issueSavedViews", view._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        touchedTeamId = view.teamId;
        break;
      }
      case "agent.create": {
        createdId = await ctx.db.insert("issueActors", { tenantId: principal.tenantId, ownerUserId: principal.ownerUserId, kind: "agent", displayName: args.command.displayName, avatarColor: args.command.avatarColor, avatarUrl: null, syncSeq: await allocateSyncSeq(ctx, principal, now), createdAt: now, updatedAt: now, deletedAt: null });
        break;
      }
      case "agent.update":
      case "agent.delete": {
        const target = assertTenant(await ctx.db.get("issueActors", args.command.actorId), principal, "ISSUES_ACTOR_NOT_FOUND");
        if (target.kind !== "agent") throw new Error("ISSUES_ACTOR_INVALID");
        if (args.command.type === "agent.update") {
          const { config: _config, ...actorPatch } = args.command.patch;
          await ctx.db.patch("issueActors", target._id, { ...actorPatch, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        } else await ctx.db.patch("issueActors", target._id, { deletedAt: now, syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        break;
      }
      case "workspace.update": {
        const meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
        if (meta === null) throw new Error("ISSUES_META_NOT_FOUND");
        await ctx.db.patch("issueMeta", meta._id, { workspaceKey: normalizeIssueKey(args.command.workspaceKey), syncSeq: await allocateSyncSeq(ctx, principal, now), updatedAt: now });
        break;
      }
    }

    if (eventIssue !== null) await appendIssueEvent(ctx, principal, eventIssue, actor._id, commandContract, args.attribution, now);
    if (touchedTeamId !== null) await ensureTeamCycles(ctx, principal, touchedTeamId, nowMs, now);
    return { createdId, identifier };
  },
});

function timestamps(row: { readonly createdAt: string; readonly updatedAt: string; readonly deletedAt: string | null; readonly syncSeq: number }) {
  return { createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt, syncSeq: row.syncSeq };
}

function mirrorTeam(row: DocumentByName<DataModel, "issueTeams">) {
  return { id: row._id, name: row.name, description: row.description, icon: row.icon, color: row.color, key: row.key, cycleConfig: row.cycleConfig, estimateScale: row.estimateScale, repoLinks: row.repoLinks, defaultRepoLogicalKey: row.defaultRepoLogicalKey, ...timestamps(row) };
}
function mirrorMembership(row: DocumentByName<DataModel, "issueTeamMemberships">) {
  return { id: row._id, teamId: row.teamId, actorId: row.actorId, ...timestamps(row) };
}
function mirrorState(row: DocumentByName<DataModel, "issueStates">) {
  return { id: row._id, teamId: row.teamId, name: row.name, color: row.color, category: row.category, position: row.position, ...timestamps(row) };
}
function mirrorLabel(row: DocumentByName<DataModel, "issueLabels">) {
  return { id: row._id, teamId: row.teamId, name: row.name, color: row.color, description: row.description, ...timestamps(row) };
}
function mirrorActor(row: DocumentByName<DataModel, "issueActors">) {
  return { id: row._id, kind: row.kind, displayName: row.displayName, avatarColor: row.avatarColor, avatarUrl: row.avatarUrl, ownerUserId: row.ownerUserId, ...timestamps(row) };
}
function mirrorCycle(row: DocumentByName<DataModel, "issueCycles">) {
  return { id: row._id, teamId: row.teamId, number: row.number, name: row.name, startsAt: row.startsAt, endsAt: row.endsAt, ...timestamps(row) };
}
function mirrorEpic(row: DocumentByName<DataModel, "issueEpics">) {
  return { id: row._id, name: row.name, description: row.description, icon: row.icon, color: row.color, status: row.status, startDate: row.startDate, targetDate: row.targetDate, ...timestamps(row) };
}
function mirrorMilestone(row: DocumentByName<DataModel, "issueMilestones">) {
  return { id: row._id, epicId: row.epicId, name: row.name, targetDate: row.targetDate, position: row.position, completedAt: row.completedAt, ...timestamps(row) };
}
function mirrorIssue(row: DocumentByName<DataModel, "issues">) {
  return { id: row._id, teamId: row.teamId, number: row.number, identifier: row.identifier, title: row.title, priority: row.priority, stateId: row.stateId, assigneeActorId: row.assigneeActorId, creatorActorId: row.creatorActorId, labelIds: row.labelIds, estimate: row.estimate, dueDate: row.dueDate, cycleId: row.cycleId, epicId: row.epicId, milestoneId: row.milestoneId, parentIssueId: row.parentIssueId, orderKey: row.orderKey, delegationStatus: row.delegationStatus, triaged: row.triaged, ...timestamps(row) };
}
function mirrorRelation(row: DocumentByName<DataModel, "issueRelations">) {
  return { id: row._id, issueId: row.issueId, relationType: row.relationType, relatedIssueId: row.relatedIssueId, ...timestamps(row) };
}
function mirrorThreadLink(row: DocumentByName<DataModel, "issueThreadLinks">) {
  return { id: row._id, issueId: row.issueId, environmentId: row.environmentId, threadId: row.threadId, logicalProjectKey: row.logicalProjectKey, status: row.status, createdByActorId: row.createdByActorId, ...timestamps(row) };
}
function mirrorSavedView(row: DocumentByName<DataModel, "issueSavedViews">) {
  return { id: row._id, scope: row.scope, teamId: row.teamId, ownerUserId: row.ownerUserId, name: row.name, icon: row.icon, color: row.color, filters: row.filters, display: row.display, position: row.position, ...timestamps(row) };
}

interface MirrorRow {
  readonly table: "teams" | "memberships" | "states" | "labels" | "actors" | "cycles" | "epics" | "milestones" | "issues" | "relations" | "threadLinks" | "savedViews";
  readonly doc: { readonly syncSeq: number };
}

export const mirrorDelta = internalQueryGeneric({
  args: { credentialHash: v.string(), environmentId: v.string(), sinceSeq: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(ctx, args.credentialHash, args.environmentId);
    if (!Number.isSafeInteger(args.sinceSeq) || args.sinceSeq < 0) throw new Error("ISSUES_SYNC_SEQUENCE_INVALID");
    const limit = args.limit ?? 500;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_000) throw new Error("ISSUES_SYNC_LIMIT_INVALID");
    const take = limit + 1;
    const [teams, memberships, states, labels, actors, cycles, epics, milestones, issueRows, relations, threadLinks, savedViews, purgeEvents] = await Promise.all([
      ctx.db.query("issueTeams").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueTeamMemberships").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueStates").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueLabels").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueActors").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueCycles").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueEpics").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueMilestones").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issues").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueRelations").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueThreadLinks").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueSavedViews").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).order("asc").take(take),
      ctx.db.query("issueEvents").withIndex("by_tenant_sync", (query) => query.eq("tenantId", principal.tenantId).gt("syncSeq", args.sinceSeq)).filter((query) => query.eq(query.field("kind"), "issue.purged")).order("asc").take(take),
    ]);
    const rows: MirrorRow[] = [
      ...teams.map((row) => ({ table: "teams" as const, doc: mirrorTeam(row) })),
      ...memberships.map((row) => ({ table: "memberships" as const, doc: mirrorMembership(row) })),
      ...states.map((row) => ({ table: "states" as const, doc: mirrorState(row) })),
      ...labels.map((row) => ({ table: "labels" as const, doc: mirrorLabel(row) })),
      ...actors.map((row) => ({ table: "actors" as const, doc: mirrorActor(row) })),
      ...cycles.map((row) => ({ table: "cycles" as const, doc: mirrorCycle(row) })),
      ...epics.map((row) => ({ table: "epics" as const, doc: mirrorEpic(row) })),
      ...milestones.map((row) => ({ table: "milestones" as const, doc: mirrorMilestone(row) })),
      ...issueRows.map((row) => ({ table: "issues" as const, doc: mirrorIssue(row) })),
      ...relations.map((row) => ({ table: "relations" as const, doc: mirrorRelation(row) })),
      ...threadLinks.map((row) => ({ table: "threadLinks" as const, doc: mirrorThreadLink(row) })),
      ...savedViews.map((row) => ({ table: "savedViews" as const, doc: mirrorSavedView(row) })),
      // Purges have no source document left. The mirror translates this tombstone shape to remove.
      ...purgeEvents.map((row) => ({ table: "issues" as const, doc: { id: row.issueId, purged: true, syncSeq: row.syncSeq } })),
    ].sort((left, right) => left.doc.syncSeq - right.doc.syncSeq);
    const selected = rows.slice(0, limit);
    const meta = await ctx.db.query("issueMeta").withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId)).unique();
    const hasMore = rows.length > limit;
    const selectedSeq = selected.at(-1)?.doc.syncSeq ?? args.sinceSeq;
    const nextSeq = hasMore ? selectedSeq : Math.max(selectedSeq, (meta?.nextSyncSeq ?? 1) - 1);
    return { rows: selected, nextSeq, hasMore, workspaceKey: meta?.workspaceKey ?? DEFAULT_WORKSPACE_KEY, viewerUserId: principal.ownerUserId };
  },
});

function detailComment(row: DocumentByName<DataModel, "issueComments">) {
  return { id: row._id, issueId: row.issueId, parentCommentId: row.parentCommentId, authorActorId: row.authorActorId, bodyMd: row.bodyMd, editedAt: row.editedAt, createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt };
}
function detailReaction(row: DocumentByName<DataModel, "issueCommentReactions">) {
  return { id: row._id, commentId: row.commentId, actorId: row.actorId, emoji: row.emoji, createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt };
}
function detailEvent(row: DocumentByName<DataModel, "issueEvents">) {
  return { id: row._id, issueId: row.issueId, actorId: row.actorId, kind: row.kind, payload: row.payload, threadRef: row.threadRef, createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt };
}

export const issueDetail = internalQueryGeneric({
  args: { credentialHash: v.string(), environmentId: v.string(), issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(ctx, args.credentialHash, args.environmentId);
    const issue = await issueById(ctx, principal, args.issueId);
    const comments = await ctx.db.query("issueComments").withIndex("by_issue", (query) => query.eq("issueId", issue._id)).order("asc").collect();
    const reactions: Array<DocumentByName<DataModel, "issueCommentReactions">> = [];
    for (const comment of comments) {
      reactions.push(...await ctx.db.query("issueCommentReactions").withIndex("by_comment_actor_emoji", (query) => query.eq("commentId", comment._id)).collect());
    }
    const events = await ctx.db.query("issueEvents").withIndex("by_issue_created", (query) => query.eq("issueId", issue._id)).order("desc").take(200);
    return { issueId: issue._id, descriptionMd: issue.descriptionMd, comments: comments.map(detailComment), reactions: reactions.map(detailReaction), events: events.map(detailEvent) };
  },
});
