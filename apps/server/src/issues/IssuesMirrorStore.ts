import {
  Issue,
  IssueActor,
  IssueCycle,
  IssueEpic,
  IssueLabel,
  IssueMilestone,
  IssueRelation,
  IssueSavedView,
  IssueTeam,
  IssueTeamMembership,
  IssueThreadLink,
  IssueWorkflowState,
  type IssuesSnapshot,
  type IssuesStreamItem,
} from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError, type PersistenceSqlError } from "../persistence/Errors.ts";
import type { IssuesMirrorDeltaRow } from "./IssuesCommandClient.ts";

const MirrorStateRow = Schema.Struct({
  cursorSeq: Schema.Number,
  syncedAt: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
  workspaceKey: Schema.String,
  viewerUserId: Schema.NullOr(Schema.String),
});
const EmptyRequest = Schema.Struct({});
const rowJson = <S extends Schema.Top>(schema: S) =>
  Schema.Struct({ row: Schema.fromJsonString(schema) });

export class IssuesMirrorStore extends Context.Service<
  IssuesMirrorStore,
  {
    readonly applyDeltaBatch: (
      rows: ReadonlyArray<IssuesMirrorDeltaRow>,
      nextSeq: number,
    ) => Effect.Effect<void, PersistenceSqlError>;
    readonly getSnapshot: Effect.Effect<IssuesSnapshot, PersistenceSqlError>;
    readonly getCursor: Effect.Effect<number, PersistenceSqlError>;
    readonly setCursor: (cursor: number) => Effect.Effect<void, PersistenceSqlError>;
    readonly setMetadata: (
      workspaceKey: string,
      viewerUserId: string | null,
    ) => Effect.Effect<void, PersistenceSqlError>;
    readonly setSyncedAt: (syncedAt: string) => Effect.Effect<void, PersistenceSqlError>;
    readonly setSyncStatus: (
      online: boolean,
      syncedAt: string | null,
      lastError: string | null,
    ) => Effect.Effect<void, PersistenceSqlError>;
    readonly changes: Stream.Stream<IssuesStreamItem>;
  }
>()("pathwayos/issues/IssuesMirrorStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changesPubSub = yield* PubSub.unbounded<IssuesStreamItem>();

  const upsertEntity = SqlSchema.void({
    Request: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("teams"), row: IssueTeam }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("memberships"), row: IssueTeamMembership }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("states"), row: IssueWorkflowState }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("labels"), row: IssueLabel }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("actors"), row: IssueActor }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("cycles"), row: IssueCycle }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("epics"), row: IssueEpic }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("milestones"), row: IssueMilestone }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("issues"), row: Issue }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("relations"), row: IssueRelation }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("threadLinks"), row: IssueThreadLink }) }),
      Schema.Struct({ kind: Schema.Literal("entity"), entity: Schema.Struct({ table: Schema.Literal("savedViews"), row: IssueSavedView }) }),
    ]),
    execute: ({ entity }) => {
      const { table, row } = entity;
      const json = JSON.stringify(row);
      switch (table) {
        case "teams":
          return sql`INSERT INTO issues_mirror_teams (id,name,description,icon,color,key,cycle_config_json,estimate_scale,repo_links_json,default_repo_logical_key,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.name},${row.description},${row.icon},${row.color},${row.key},${JSON.stringify(row.cycleConfig)},${row.estimateScale},${JSON.stringify(row.repoLinks)},${row.defaultRepoLogicalKey},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,icon=excluded.icon,color=excluded.color,key=excluded.key,cycle_config_json=excluded.cycle_config_json,estimate_scale=excluded.estimate_scale,repo_links_json=excluded.repo_links_json,default_repo_logical_key=excluded.default_repo_logical_key,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "memberships":
          return sql`INSERT INTO issues_mirror_memberships (id,team_id,actor_id,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.teamId},${row.actorId},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,actor_id=excluded.actor_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "states":
          return sql`INSERT INTO issues_mirror_states (id,team_id,name,color,category,position,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.teamId},${row.name},${row.color},${row.category},${row.position},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,name=excluded.name,color=excluded.color,category=excluded.category,position=excluded.position,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "labels":
          return sql`INSERT INTO issues_mirror_labels (id,team_id,name,color,description,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.teamId},${row.name},${row.color},${row.description},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,name=excluded.name,color=excluded.color,description=excluded.description,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "actors":
          return sql`INSERT INTO issues_mirror_actors (id,kind,display_name,avatar_color,avatar_url,owner_user_id,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.kind},${row.displayName},${row.avatarColor},${row.avatarUrl},${row.ownerUserId},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,display_name=excluded.display_name,avatar_color=excluded.avatar_color,avatar_url=excluded.avatar_url,owner_user_id=excluded.owner_user_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "cycles":
          return sql`INSERT INTO issues_mirror_cycles (id,team_id,number,name,starts_at,ends_at,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.teamId},${row.number},${row.name},${row.startsAt},${row.endsAt},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,number=excluded.number,name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "epics":
          return sql`INSERT INTO issues_mirror_epics (id,name,description,icon,color,status,start_date,target_date,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.name},${row.description},${row.icon},${row.color},${row.status},${row.startDate},${row.targetDate},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,icon=excluded.icon,color=excluded.color,status=excluded.status,start_date=excluded.start_date,target_date=excluded.target_date,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "milestones":
          return sql`INSERT INTO issues_mirror_milestones (id,epic_id,name,target_date,position,completed_at,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.epicId},${row.name},${row.targetDate},${row.position},${row.completedAt},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET epic_id=excluded.epic_id,name=excluded.name,target_date=excluded.target_date,position=excluded.position,completed_at=excluded.completed_at,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "issues":
          return sql`INSERT INTO issues_mirror_issues (id,team_id,number,identifier,title,priority,state_id,assignee_actor_id,creator_actor_id,label_ids_json,estimate,due_date,cycle_id,epic_id,milestone_id,parent_issue_id,order_key,delegation_status,triaged,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.teamId},${row.number},${row.identifier},${row.title},${row.priority},${row.stateId},${row.assigneeActorId},${row.creatorActorId},${JSON.stringify(row.labelIds)},${row.estimate},${row.dueDate},${row.cycleId},${row.epicId},${row.milestoneId},${row.parentIssueId},${row.orderKey},${row.delegationStatus},${row.triaged ? 1 : 0},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,number=excluded.number,identifier=excluded.identifier,title=excluded.title,priority=excluded.priority,state_id=excluded.state_id,assignee_actor_id=excluded.assignee_actor_id,creator_actor_id=excluded.creator_actor_id,label_ids_json=excluded.label_ids_json,estimate=excluded.estimate,due_date=excluded.due_date,cycle_id=excluded.cycle_id,epic_id=excluded.epic_id,milestone_id=excluded.milestone_id,parent_issue_id=excluded.parent_issue_id,order_key=excluded.order_key,delegation_status=excluded.delegation_status,triaged=excluded.triaged,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "relations":
          return sql`INSERT INTO issues_mirror_relations (id,issue_id,relation_type,related_issue_id,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.issueId},${row.relationType},${row.relatedIssueId},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET issue_id=excluded.issue_id,relation_type=excluded.relation_type,related_issue_id=excluded.related_issue_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "threadLinks":
          return sql`INSERT INTO issues_mirror_thread_links (id,issue_id,environment_id,thread_id,logical_project_key,status,created_by_actor_id,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.issueId},${row.environmentId},${row.threadId},${row.logicalProjectKey},${row.status},${row.createdByActorId},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET issue_id=excluded.issue_id,environment_id=excluded.environment_id,thread_id=excluded.thread_id,logical_project_key=excluded.logical_project_key,status=excluded.status,created_by_actor_id=excluded.created_by_actor_id,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
        case "savedViews":
          return sql`INSERT INTO issues_mirror_saved_views (id,scope,team_id,owner_user_id,name,icon,color,filters_json,display_json,position,created_at,updated_at,deleted_at,row_json) VALUES (${row.id},${row.scope},${row.teamId},${row.ownerUserId},${row.name},${row.icon},${row.color},${JSON.stringify(row.filters)},${JSON.stringify(row.display)},${row.position},${row.createdAt},${row.updatedAt},${row.deletedAt},${json}) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,team_id=excluded.team_id,owner_user_id=excluded.owner_user_id,name=excluded.name,icon=excluded.icon,color=excluded.color,filters_json=excluded.filters_json,display_json=excluded.display_json,position=excluded.position,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,row_json=excluded.row_json`;
      }
    },
  });

  const deletePurgedIssue = SqlSchema.void({
    Request: Schema.Struct({ id: Schema.String }),
    execute: ({ id }) => sql`DELETE FROM issues_mirror_issues WHERE id = ${id}`,
  });
  const setCursorStatement = SqlSchema.void({
    Request: Schema.Struct({ cursor: Schema.Number }),
    execute: ({ cursor }) => sql`UPDATE issues_mirror_state SET cursor_seq = MAX(cursor_seq, ${cursor}) WHERE scope = 'issues'`,
  });
  const setMetadataStatement = SqlSchema.void({
    Request: Schema.Struct({ workspaceKey: Schema.String, viewerUserId: Schema.NullOr(Schema.String) }),
    execute: ({ workspaceKey, viewerUserId }) => sql`UPDATE issues_mirror_state SET workspace_key = ${workspaceKey}, viewer_user_id = ${viewerUserId} WHERE scope = 'issues'`,
  });
  const setStatusStatement = SqlSchema.void({
    Request: Schema.Struct({ syncedAt: Schema.NullOr(Schema.String), lastError: Schema.NullOr(Schema.String) }),
    execute: ({ syncedAt, lastError }) => sql`UPDATE issues_mirror_state SET synced_at = ${syncedAt}, last_error = ${lastError} WHERE scope = 'issues'`,
  });
  const setSyncedAtStatement = SqlSchema.void({
    Request: Schema.Struct({ syncedAt: Schema.String }),
    execute: ({ syncedAt }) => sql`UPDATE issues_mirror_state SET synced_at = ${syncedAt}, last_error = NULL WHERE scope = 'issues'`,
  });
  const getState = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: MirrorStateRow,
    execute: () => sql`SELECT cursor_seq AS "cursorSeq", synced_at AS "syncedAt", last_error AS "lastError", workspace_key AS "workspaceKey", viewer_user_id AS "viewerUserId" FROM issues_mirror_state WHERE scope = 'issues'`,
  });
  const listTeams = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueTeam), execute: () => sql`SELECT row_json AS row FROM issues_mirror_teams ORDER BY key, id` });
  const listMemberships = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueTeamMembership), execute: () => sql`SELECT row_json AS row FROM issues_mirror_memberships ORDER BY id` });
  const listStates = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueWorkflowState), execute: () => sql`SELECT row_json AS row FROM issues_mirror_states ORDER BY position, id` });
  const listLabels = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueLabel), execute: () => sql`SELECT row_json AS row FROM issues_mirror_labels ORDER BY name, id` });
  const listActors = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueActor), execute: () => sql`SELECT row_json AS row FROM issues_mirror_actors ORDER BY display_name, id` });
  const listCycles = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueCycle), execute: () => sql`SELECT row_json AS row FROM issues_mirror_cycles ORDER BY starts_at, id` });
  const listEpics = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueEpic), execute: () => sql`SELECT row_json AS row FROM issues_mirror_epics ORDER BY name, id` });
  const listMilestones = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueMilestone), execute: () => sql`SELECT row_json AS row FROM issues_mirror_milestones ORDER BY position, id` });
  const listIssues = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(Issue), execute: () => sql`SELECT row_json AS row FROM issues_mirror_issues ORDER BY identifier, id` });
  const listRelations = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueRelation), execute: () => sql`SELECT row_json AS row FROM issues_mirror_relations ORDER BY id` });
  const listThreadLinks = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueThreadLink), execute: () => sql`SELECT row_json AS row FROM issues_mirror_thread_links ORDER BY id` });
  const listSavedViews = SqlSchema.findAll({ Request: EmptyRequest, Result: rowJson(IssueSavedView), execute: () => sql`SELECT row_json AS row FROM issues_mirror_saved_views ORDER BY position, id` });

  const mapSqlError = toPersistenceSqlError("IssuesMirrorStore:query");
  const applyDeltaBatch: IssuesMirrorStore["Service"]["applyDeltaBatch"] = (rows, nextSeq) =>
    sql.withTransaction(
      Effect.gen(function* () {
        for (const delta of rows) {
          if ("purge" in delta) yield* deletePurgedIssue({ id: delta.purge.id });
          else yield* upsertEntity({ kind: "entity", entity: delta.entity });
        }
        yield* setCursorStatement({ cursor: nextSeq });
      }),
    ).pipe(
      Effect.mapError(mapSqlError),
      Effect.andThen(
        Effect.forEach(rows, (delta) =>
          PubSub.publish(
            changesPubSub,
            "purge" in delta
              ? { kind: "remove", seq: delta.seq, table: delta.purge.table, id: delta.purge.id }
              : { kind: "upsert", seq: delta.seq, entity: delta.entity },
          ),
        ),
      ),
      Effect.asVoid,
    );

  const getSnapshot: IssuesMirrorStore["Service"]["getSnapshot"] = Effect.all([
    getState({}), listTeams({}), listMemberships({}), listStates({}), listLabels({}), listActors({}),
    listCycles({}), listEpics({}), listMilestones({}), listIssues({}), listRelations({}),
    listThreadLinks({}), listSavedViews({}),
  ]).pipe(
    Effect.mapError(mapSqlError),
    Effect.map(([state, teams, memberships, states, labels, actors, cycles, epics, milestones, issues, relations, threadLinks, savedViews]) => ({
      mirrorSeq: state.cursorSeq,
      syncedAt: state.syncedAt,
      online: state.lastError === null && state.syncedAt !== null,
      workspaceKey: state.workspaceKey,
      viewerUserId: state.viewerUserId,
      teams: teams.map(({ row }) => row), memberships: memberships.map(({ row }) => row),
      states: states.map(({ row }) => row), labels: labels.map(({ row }) => row),
      actors: actors.map(({ row }) => row), cycles: cycles.map(({ row }) => row),
      epics: epics.map(({ row }) => row), milestones: milestones.map(({ row }) => row),
      issues: issues.map(({ row }) => row), relations: relations.map(({ row }) => row),
      threadLinks: threadLinks.map(({ row }) => row), savedViews: savedViews.map(({ row }) => row),
    })),
  );
  const getCursor = getState({}).pipe(Effect.map((state) => state.cursorSeq), Effect.mapError(mapSqlError));
  const setCursor = (cursor: number) => setCursorStatement({ cursor }).pipe(Effect.mapError(mapSqlError));
  const setMetadata = (workspaceKey: string, viewerUserId: string | null) => setMetadataStatement({ workspaceKey, viewerUserId }).pipe(Effect.mapError(mapSqlError));
  const setSyncedAt = (syncedAt: string) => setSyncedAtStatement({ syncedAt }).pipe(Effect.mapError(mapSqlError));
  const setSyncStatus = (online: boolean, syncedAt: string | null, lastError: string | null) =>
    setStatusStatement({ syncedAt, lastError }).pipe(
      Effect.mapError(mapSqlError),
      Effect.andThen(PubSub.publish(changesPubSub, { kind: "status", online, syncedAt })),
      Effect.asVoid,
    );

  return IssuesMirrorStore.of({
    applyDeltaBatch, getSnapshot, getCursor, setCursor, setMetadata, setSyncedAt, setSyncStatus,
    changes: Stream.fromPubSub(changesPubSub),
  });
});

export const layer = Layer.effect(IssuesMirrorStore, make);
