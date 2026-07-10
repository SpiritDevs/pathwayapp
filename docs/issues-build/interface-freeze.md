# Issues Build — Interface Freeze (v1)

Binding contract for all implementation waves. If code and this doc disagree, this doc wins
until amended here. Companion material: `docs/adr/0001`–`0010`, `.plans/25-linear-issues-agents-plan.md`,
and the scout reports (conventions + exemplar file paths):
- `scout-convex.md`, `scout-server.md`, `scout-web.md` in the session scratchpad
  (`/private/tmp/claude-501/-Users-coreybaines-GitHub-pathwayapp/21f4374e-b3a6-4301-813d-f1f7860f47f0/scratchpad/`).

## 0. Amendments to the ADRs (ground-truth corrections)

1. **Workspace = tenant, not Clerk Organization** (amends ADR 0001/0002). The repo already has a
   complete tenant system (`tenants`/`tenantMemberships`/`tenantInvitations`, roles, hashed invites,
   `requireTenantMembership` guards, `activeTenantId`). Issues-domain tables are scoped by
   `tenantId` exactly like every other Convex table. "Org-wide issue" in the ADRs = tenant-wide.
   No Clerk Organization work in this build.
2. **Mirror = cursor poll over HTTP actions** (amends ADR 0001 mechanics). The local server has no
   Convex subscription client; both existing sync workers poll/push over `*.convex.site` HTTP
   actions with the environment-credential bearer. The issues mirror polls a delta endpoint with a
   per-tenant monotonic `syncSeq` cursor (2s interval while the issues UI has subscribers, 10s otherwise).
3. **All issue writes go through the local server** (confirms ADR 0001): web UI → WS RPC →
   `IssuesGateway` → Convex HTTP action. The browser never calls issue mutations via the reactive
   Convex client (unlike `/settings/account` tenants UI).

## 1. Identifiers, enums, constants

All IDs are Convex document ids carried as branded strings in contracts:
`IssueId`, `IssueTeamId`, `IssueActorId`, `IssueStateId`, `IssueLabelId`, `IssueCycleId`,
`IssueEpicId`, `IssueMilestoneId`, `IssueCommentId`, `IssueRelationId`, `IssueThreadLinkId`,
`IssueSavedViewId`, `IssueTeamMembershipId`.

```ts
StateCategory      = "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled"
IssuePriority      = 0 | 1 | 2 | 3 | 4        // 0=none, 1=urgent, 2=high, 3=medium, 4=low
ActorKind          = "human" | "agent"
RelationType       = "blocks" | "related" | "duplicate"   // stored directional; "blocked-by" derived
DelegationStatus   = null | "queued" | "starting" | "running" | "completed" | "failed"
EpicStatus         = "backlog" | "planned" | "in-progress" | "paused" | "completed" | "canceled"
EstimateScale      = "disabled" | "exponential" | "fibonacci" | "linear" | "tshirt"
SavedViewScope     = "personal" | "team"
ThreadLinkStatus   = "linked" | "working" | "closed"
GroupBy            = "state" | "assignee" | "priority" | "label" | "cycle" | "epic" | "team" | "none"
OrderBy            = "manual" | "priority" | "dueDate" | "createdAt" | "updatedAt"
ViewMode           = "list" | "board"
```

- Team key: 1–6 chars `[A-Z][A-Z0-9]*`. Workspace key default `"WS"` (configurable).
- Identifier = `${key}-${number}`; numbers allocated transactionally in Convex (`issueCounters`).
- Default seeded states per team AND for the workspace (teamId=null):
  Triage(triage), Backlog(backlog), Todo(unstarted), In Progress(started), In Review(started),
  Done(completed), Canceled(canceled), Duplicate(canceled).
- Fractional order keys: base-62 midpoint strings via `orderKeyBetween(a, b)` in
  `packages/shared/src/fractionalIndex.ts` (new). Single `orderKey` per issue (one manual order,
  reused within any grouping context; ties break by id).

## 2. Contracts package — `packages/contracts/src/issues.ts` (new file)

Effect `Schema` definitions, following `orchestration.ts` conventions (branded ids, ISO timestamps
as strings, `Schema.NullOr` for nullables). Exported names are frozen:

Entities (mirror rows; timestamps `createdAt`/`updatedAt`, soft-delete `deletedAt: NullOr(String)`):

```ts
IssueTeam            { id, name, description: NullOr, icon: NullOr, color: NullOr, key,
                       cycleConfig: { enabled, startDayOfWeek: 0|1|..|6, durationWeeks, cooldownWeeks, autoRollover },
                       estimateScale: EstimateScale,
                       repoLinks: Array<{ logicalProjectKey, displayName }>,
                       defaultRepoLogicalKey: NullOr(String) }
IssueTeamMembership  { id, teamId, actorId }
IssueWorkflowState   { id, teamId: NullOr(IssueTeamId) /* null = workspace */, name, color,
                       category: StateCategory, position: Number }
IssueLabel           { id, teamId: NullOr(IssueTeamId), name, color, description: NullOr }
IssueActor           { id, kind: ActorKind, displayName, avatarColor, avatarUrl: NullOr,
                       ownerUserId: String /* clerkUserId */ }
IssueCycle           { id, teamId, number, name: NullOr, startsAt, endsAt }
IssueEpic            { id, name, description: NullOr, icon: NullOr, color: NullOr,
                       status: EpicStatus, startDate: NullOr, targetDate: NullOr }
IssueMilestone       { id, epicId, name, targetDate: NullOr, position, completedAt: NullOr }
Issue                { id, teamId: NullOr(IssueTeamId), number, identifier, title,
                       priority: IssuePriority, stateId, assigneeActorId: NullOr,
                       creatorActorId, labelIds: Array(IssueLabelId), estimate: NullOr(Number),
                       dueDate: NullOr(String), cycleId: NullOr, epicId: NullOr, milestoneId: NullOr,
                       parentIssueId: NullOr(IssueId), orderKey: String,
                       delegationStatus: DelegationStatus, triaged: Boolean }
IssueRelation        { id, issueId, relationType, relatedIssueId }
IssueThreadLink      { id, issueId, environmentId, threadId, logicalProjectKey: NullOr,
                       status: ThreadLinkStatus, createdByActorId }
IssueComment         { id, issueId, parentCommentId: NullOr, authorActorId, bodyMd, editedAt: NullOr }
IssueCommentReaction { id, commentId, actorId, emoji }
IssueSavedView       { id, scope: SavedViewScope, teamId: NullOr, ownerUserId, name,
                       icon: NullOr, color: NullOr, filters: IssueFilterConfig,
                       display: IssueDisplayConfig, position: Number }
IssueEventRecord     { id, issueId, actorId: NullOr(IssueActorId), kind: String,
                       payload: Schema.Unknown, threadRef: NullOr({ environmentId, threadId }), createdAt }
IssueFilterConfig    { teamIds?, stateIds?, stateCategories?, assigneeActorIds?, creatorActorIds?,
                       priorities?, labelIds?, cycleIds?, epicIds?, parentIssueId?,
                       dueBefore?, searchText?, includeDeleted? }        // all optionalKey arrays/values
IssueDisplayConfig   { viewMode: ViewMode, groupBy: GroupBy, swimlaneBy?: "none"|"priority"|"assignee"|"epic",
                       orderBy: OrderBy, showCompleted: Boolean, showTriage: Boolean,
                       showSubIssues: Boolean }
```

Snapshot + stream (dedicated subscription — issues do NOT ride `subscribeShell`):

```ts
IssuesSnapshot   { mirrorSeq: Number, syncedAt: NullOr(String), online: Boolean,
                   workspaceKey: String, viewerUserId: NullOr(String),
                   teams, memberships, states, labels, actors, cycles, epics, milestones,
                   issues, relations, threadLinks, savedViews }          // arrays of the above
IssuesEntityRow  = Union of { table: "teams", row: IssueTeam } | { table: "memberships", ... }
                   | ... one variant per collection above (tags frozen: teams, memberships, states,
                   labels, actors, cycles, epics, milestones, issues, relations, threadLinks, savedViews)
IssuesStreamItem = { kind: "snapshot", snapshot: IssuesSnapshot }
                 | { kind: "upsert", seq: Number, entity: IssuesEntityRow }
                 | { kind: "remove", seq: Number, table: String, id: String }   // purge only
                 | { kind: "status", online: Boolean, syncedAt: NullOr(String) }
IssueDetail      { issueId, descriptionMd: String, comments: Array(IssueComment),
                   reactions: Array(IssueCommentReaction), events: Array(IssueEventRecord) }
IssueDetailStreamItem = { kind: "detail", detail: IssueDetail }          // full re-emit on change
```

Command union `IssueCommand` (tag = `type`), result, attribution, error:

```ts
"issue.create"          { title, teamId: NullOr, descriptionMd?, stateId?, priority?, assigneeActorId?,
                          labelIds?, estimate?, dueDate?, cycleId?, epicId?, milestoneId?, parentIssueId? }
"issue.update"          { issueId, patch: { title?, descriptionMd?, priority?, stateId?, assigneeActorId?,
                          labelIds?, estimate?, dueDate?, cycleId?, epicId?, milestoneId?,
                          parentIssueId?, orderKey?, triaged? } }
"issue.moveTeam"        { issueId, teamId: NullOr(IssueTeamId) }
"issue.delete" | "issue.restore" | "issue.purge"        { issueId }
"issue.startWork"       { issueId, repoLogicalKey? }
"comment.create"        { issueId, parentCommentId?, bodyMd }
"comment.update"        { commentId, bodyMd }
"comment.delete"        { commentId }
"reaction.toggle"       { commentId, emoji }
"relation.create"       { issueId, relationType, relatedIssueId }
"relation.delete"       { relationId }
"threadLink.create"     { issueId, threadId, environmentId, logicalProjectKey? }
"threadLink.update"     { linkId, status }
"threadLink.delete"     { linkId }
"team.create"           { name, key, icon?, color?, description? }
"team.update"           { teamId, patch: { name?, icon?, color?, description?, key?, cycleConfig?,
                          estimateScale?, repoLinks?, defaultRepoLogicalKey? } }
"team.delete"           { teamId }
"team.memberAdd"        { teamId, actorId }
"team.memberRemove"     { membershipId }
"state.create"          { teamId: NullOr, name, color, category, position }
"state.update"          { stateId, patch: { name?, color?, position? } }
"state.delete"          { stateId, migrateToStateId }
"label.create" / "label.update" / "label.delete"
"cycle.update"          { cycleId, patch: { name? } }
"epic.create" / "epic.update" / "epic.delete"
"milestone.create" / "milestone.update" / "milestone.delete"
"view.create" / "view.update" / "view.delete"
"agent.create"          { displayName, avatarColor, config: AgentActorRuntimeConfig }
"agent.update"          { actorId, patch: { displayName?, avatarColor?, config? } }
"agent.delete"          { actorId }
"workspace.update"      { workspaceKey }

IssueCommandResult      { createdId: NullOr(String), identifier: NullOr(String) }
IssueCommandAttribution = { kind: "human" } | { kind: "agent", actorId: IssueActorId, threadId: String }
IssuesDomainError       Schema.TaggedError, fields { code: "offline"|"not-found"|"forbidden"|
                          "guardrail"|"conflict"|"invalid", message }
DelegationQueueState    { running: Array<{ issueId, actorId, threadId, startedAt }>,
                          queued: Array<{ issueId, actorId, enqueuedAt, priority }>,
                          capacity: { maxConcurrent, cpuPercent: NullOr(Number), freeMemoryMb: NullOr(Number),
                          headroomOk: Boolean } }
```

## 3. Contracts — `rpc.ts` + `settings.ts` additions

`WS_METHODS` additions + RPCs (all errors `Schema.Union([IssuesDomainError, EnvironmentAuthorizationError])`,
read scope for subscribes, write scope for execute — mirror the existing scope map style):

```ts
issuesSubscribe:       "issues.subscribe"        // stream: true, payload {}, success IssuesStreamItem
issuesSubscribeDetail: "issues.subscribeDetail"  // stream: true, payload { issueId }, success IssueDetailStreamItem
issuesExecute:         "issues.execute"          // payload { command: IssueCommand }, success IssueCommandResult
issuesDelegationState: "issues.delegationState"  // payload {}, success DelegationQueueState
```

`settings.ts` — add to `ServerSettings` (+ mirrored `optionalKey` entries in `ServerSettingsPatch`):

```ts
issueDelegation: {
  enabled: Boolean (default true),
  maxConcurrent: Number (default 3),
  cpuHeadroomPercent: Number (default 85),
  minFreeMemoryMb: Number (default 2048),
}
agentActors: Record<String /* IssueActorId */, AgentActorRuntimeConfig>   // owner-local agent config
AgentActorRuntimeConfig = { providerInstanceId: NullOr(String), model: NullOr(String),
                            instructions: NullOr(String), runtimeMode?: RuntimeMode }
```

## 4. Convex — `infra/connect-convex`

New tables in `convex/schema.ts` (every row: `tenantId: v.id("tenants")`, `ownerUserId: v.string()`
(creator), `syncSeq: v.number()`, `createdAt/updatedAt` iso, `deletedAt: v.union(v.null(), v.string())`).
Index every table `by_tenant_sync` on `["tenantId", "syncSeq"]` plus natural lookups:

`issueTeams, issueTeamMemberships, issueStates, issueLabels, issueActors, issueCycles, issueEpics,
issueMilestones, issues (+ by_tenant_identifier, by_tenant_team), issueRelations, issueThreadLinks,
issueComments (+ by_issue), issueCommentReactions, issueSavedViews, issueEvents (+ by_issue_created),
issueAliases (by_tenant_alias), issueCounters (by_tenant_scope, fields { scopeKey, next }),
issueMeta (per-tenant singleton: { workspaceKey, nextSyncSeq })`.

Field names match the contracts entities 1:1 (camelCase). `issues.descriptionMd` lives on the issue
doc but is EXCLUDED from mirror shell rows (delivered via detail endpoint).

New module `convex/issues.ts` (+ split files if large — `issuesCommands.ts`, `issuesQueries.ts`):
- `issues:executeCommand` (internalMutation) args `{ credentialHash, environmentId, command, attribution }`
  → `requireEnvironmentPrincipal` → tenant scope → apply command → bump `syncSeq` on every touched
  row (allocate from `issueMeta.nextSyncSeq`) → append `issueEvents` row (kind = command type,
  payload = sanitized input, actorId from attribution; human attribution resolves/creates the
  human `issueActors` row for the principal's `ownerUserId`) → return `IssueCommandResult`.
  First command for a tenant seeds: workspace states, `issueMeta` (workspaceKey "WS"), human actor.
  `team.create` seeds the team's default states. `issue.moveTeam` re-keys: new number from
  destination counter, old identifier → `issueAliases`.
  Guardrails enforced HERE as final authority (attribution.kind === "agent"): `issue.create` forces
  the triage state + `triaged: false`; `issue.purge` → error `forbidden`; everything else allowed.
- `issues:mirrorDelta` (internalQuery) args `{ credentialHash, environmentId, sinceSeq, limit }`
  → `{ rows: Array<{ table, doc }>, nextSeq, hasMore, workspaceKey, viewerUserId }` ordered by syncSeq.
- `issues:issueDetail` (internalQuery) args `{ credentialHash, environmentId, issueId }` → IssueDetail shape.

`convex/http.ts` routes (same envelope as `/v1/sync/batches`; bearer → sha256 → runMutation/runQuery):
- `POST /v1/issues/command`  → `issues:executeCommand`
- `POST /v1/issues/mirror`   → `issues:mirrorDelta`
- `POST /v1/issues/detail`   → `issues:issueDetail`

No `clientApi.ts` additions (browser never talks to issues directly).

## 5. Server — module layout + seams

New dir `apps/server/src/issues/`:

```
IssuesGateway.ts        // Context.Service seam — AUTHORED IN FOUNDATION, other waves import it
IssuesMirrorWorker.ts   // S1: poll /v1/issues/mirror, upsert local projections, publish deltas
IssuesMirrorStore.ts    // S1: SQLite projection repo + cursor + PubSub<IssuesStreamItem>
IssuesCommandClient.ts  // S1: HttpClient POST /v1/issues/command|detail (credential gating like CloudSyncWorker)
delegation/
  IssueDelegationService.ts  // S3: queue + capacity + auto-spawn reactor
  SystemHeadroom.ts          // S3: CPU/RAM sampling (reuse ProcessDiagnostics/`os` — see scout §7)
```

`IssuesGateway` (frozen interface — Foundation authors the tag + type; S1 provides the Live layer):

```ts
export class IssuesGateway extends Context.Service<IssuesGateway, {
  readonly execute: (command: IssueCommand, attribution: IssueCommandAttribution)
    => Effect.Effect<IssueCommandResult, IssuesDomainError>
  readonly getSnapshot: Effect.Effect<IssuesSnapshot, IssuesDomainError>
  readonly getIssueDetail: (issueId: IssueId) => Effect.Effect<IssueDetail, IssuesDomainError>
  readonly changes: Stream.Stream<IssuesStreamItem>            // live tail (post-projection publish)
  readonly detailChanges: (issueId: IssueId) => Stream.Stream<IssueDetailStreamItem>
}>()("pathwayos/issues/IssuesGateway") {}
```

- Offline (no credential / HTTP failure): `execute` fails fast `{ code: "offline" }`; snapshot serves
  the stale mirror with `online: false`.
- Server-side guardrail pre-check duplicates the Convex rules (fail fast without a round-trip).
- Local projections: new migration `037_IssuesMirror.ts` — one table per collection
  (`issues_mirror_issues`, `issues_mirror_teams`, …, snake_case, JSON columns for nested config)
  plus `issues_mirror_state(scope PRIMARY KEY, cursor_seq, synced_at, last_error)`.
  These are mirror caches, NOT event-sourced projections — no `projection_state` involvement.
- ws.ts: S1 adds the four RPC handlers + `RPC_REQUIRED_SCOPE` entries + wires
  `IssuesGateway` Live + `IssuesMirrorWorker.start()` in `serverRuntimeStartup.ts` (reactors phase)
  + layers in `server.ts`. **Only S1 touches ws.ts / server.ts / serverRuntimeStartup.ts in round 1.**
- Delegation (S3): subscribes `IssuesGateway.changes`; on `issues` upsert where
  `assigneeActorId ∈ ownedAgentActorIds && delegationStatus ∈ {null, "queued"} && state category
  ∈ {triage, backlog, unstarted}` → enqueue. Dequeue when `running < maxConcurrent && headroomOk`,
  FIFO within priority (urgent first). Spawn = single `thread.turn.start` command with
  `bootstrap.createThread` (scout-server §5), repo resolved issue.repoOverride → team default →
  else mark failed with a comment. On spawn: `execute(threadLink.create + issue.update{stateId:
  startedState} , attribution agent)` and delegation status transitions queued→starting→running,
  completed/failed on turn end (subscribe thread lifecycle events via OrchestrationEngine stream).
  S3 exposes `IssueDelegationService` with `{ start(), state: Effect<DelegationQueueState> }` and
  does NOT touch ws.ts (S1 stubs the `issues.delegationState` handler against the service tag,
  which S3 also imports; the TAG file `delegation/IssueDelegationService.ts` with interface only
  is AUTHORED IN FOUNDATION like IssuesGateway).

## 6. MCP toolkit — `apps/server/src/mcp/toolkits/issues/`

- `McpInvocationContext.ts`: extend `McpCapability` with `"issues"` + `requireIssuesCapability(op)`.
  `McpSessionRegistry.issue`: mint capabilities `["preview", "email", "issues"]`.
- Tools (`tools.ts` / `handlers.ts`, email-toolkit shape; failure type `IssueAgentToolError`):
  `issue_create, issue_get, issue_list, issue_update, issue_comment, issue_start_work,
  issue_link_thread, issue_relation_set, issue_delete, team_list, actor_list, state_list,
  label_list, cycle_list, epic_list, view_list`.
  Read tools annotated readonly. Handlers: resolve scope via `requireIssuesCapability` → resolve the
  invoking agent actor (`AgentActorResolver` service: threadId → delegation record → actorId; falls
  back to a per-provider default agent actor, creating it on first use) → call
  `IssuesGateway.execute/getSnapshot/getIssueDetail` with `attribution: { kind: "agent", actorId, threadId }`.
  `issue_list` filters in-handler over the snapshot (teams/state category/assignee/label/text, limit).
  Register in `McpHttpServer.ts` (`IssuesToolkitRegistrationLive`, merged into
  `PathwayToolkitRegistrationLive`). S2 owns those two mcp/*.ts touch-points (no other wave edits them).

## 7. Client runtime + web

- `packages/client-runtime/src/state/issuesState.ts` (F3): `makeEnvironmentIssuesState` subscribing
  `issues.subscribe` (snapshot + upsert/remove/status reduction — a dedicated reducer
  `issuesReducer.ts`, gated on `seq`), `createEnvironmentIssuesAtoms({...})` following
  threadShell.ts (collections, index, refs w/ stability guards, per-entity families, group-by
  helpers for state/assignee/priority/label/cycle/epic/team), detail atoms
  `createEnvironmentIssueDetailAtoms` subscribing `issues.subscribeDetail`, and commands
  `createIssuesEnvironmentAtoms(runtime)` = `createEnvironmentRpcCommand` per verb:
  `execute` (generic), plus convenience `createIssue/updateIssue/deleteIssue/startWork/comment/...`
  wrappers around it, and `delegationStateQuery` via `createEnvironmentRpcQueryAtomFamily`.
- `apps/web/src/state/issues.ts` (F3): instantiate factories; hooks `useIssues, useIssue(ref),
  useIssueDetail(ref), useIssueTeams, useIssueStates, useIssueLabels, useIssueActors, useIssueCycles,
  useIssueEpics, useIssueSavedViews, useDelegationState`, non-hook `readIssue/findIssueRef`.
- UI dirs (round 2, one wave each):
  - W-A `apps/web/src/components/issues/` board+list: `IssuesPage.tsx` (tabs, filter bar,
    display-options popover), `IssuesListView.tsx`, `IssuesBoardView.tsx` (dnd-kit + DragOverlay,
    LegendList columns), `IssueCard.tsx`, `IssueRow.tsx`, `FilterBar.tsx`, `DisplayOptions.tsx`,
    `SavedViewsRail.tsx` (secondary sidebar; extend `shouldShowSecondarySidebar` for `/issues`),
    `issuesUiStateStore.ts` (zustand persist `pathwayos:issues-ui-state:v1`: current filter/display
    per page, pinned view ids, collapsed groups, selected view). Routes: `routes/issues.tsx` (page)
    + `routes/issues.$identifier.tsx` STUB that W-B fills (W-A creates only the list/board route file).
  - W-B `apps/web/src/components/issues/detail/`: `IssueDetailPage.tsx` (route
    `routes/issues.$identifier.tsx`), `IssuePeek.tsx` (RightPanelSheet + selected-issue state),
    `PropertiesSidebar.tsx`, `CommentThread.tsx`, `CommentComposer.tsx` (new Lexical
    RichText+markdown editor `MarkdownEditor.tsx` under `components/issues/editor/` — reusable for
    description), `ActivityFeed.tsx`, `SubIssuesList.tsx`, `RelationsList.tsx`, `ThreadLinks.tsx`.
  - W-C settings + triage + trash: `components/settings/TeamsSettings.tsx` (team CRUD/states/labels/
    cycles/estimates/members/repos), `AgentActorsSettings.tsx`, `IssueDelegationSettings.tsx`
    (cap/headroom), settings nav entries `/settings/teams`, `/settings/agents`; triage inbox
    `components/issues/triage/TriageInbox.tsx` + route `routes/issues.triage.tsx`; trash
    `components/issues/TrashView.tsx` + route `routes/issues.trash.tsx`. W-C owns
    `SettingsSidebarNav.tsx` edits.
- Keyboard (W-A): `c` create, `j/k` navigate, `x` select, `s/a/p/l` set state/assignee/priority/label
  via the window-keydown idiom; CommandPalette items ("Create issue", "Go to issue") — W-A owns
  `CommandPalette.tsx` edits.

## 8. Wave file-ownership map (conflict prevention)

| Wave | Owns (exclusive write access) |
|---|---|
| F0 (foundation, sequential) | `packages/contracts/src/issues.ts`, `rpc.ts` + `settings.ts` additions, `packages/shared/src/fractionalIndex.ts`, `apps/server/src/issues/IssuesGateway.ts`, `apps/server/src/issues/delegation/IssueDelegationService.ts` (tag+interface only), contracts index exports |
| F1 | `infra/connect-convex/convex/schema.ts` (append), `convex/issues*.ts` (new), `convex/http.ts` (append routes) |
| F3 | `packages/client-runtime/src/state/issues*.ts` (new), `entities.ts`/`models.ts` additions, `apps/web/src/state/issues.ts` (new) |
| S1 | `apps/server/src/issues/*` (except the two seam files), `persistence/Migrations/037_*`, `Migrations.ts` (append), `ws.ts`, `server.ts`, `serverRuntimeStartup.ts` |
| S2 | `apps/server/src/mcp/**` |
| S3 | `apps/server/src/issues/delegation/*` (impl), nothing else |
| W-A | `components/issues/*` (top level), `routes/issues.tsx`, `CommandPalette.tsx`, `appNavRoutes.ts`, `issuesUiStateStore.ts` |
| W-B | `components/issues/detail/**`, `components/issues/editor/**`, `routes/issues.$identifier.tsx` |
| W-C | `components/settings/{Teams,AgentActors,IssueDelegation}*`, `SettingsSidebarNav.tsx`, `components/issues/triage/**`, `TrashView.tsx`, `routes/settings.teams.tsx`, `routes/settings.agents.tsx`, `routes/issues.triage.tsx`, `routes/issues.trash.tsx` |

Rules: no wave edits files outside its row; cross-wave needs → note in `docs/issues-build/WIRING-<wave>.md`
for the integration pass. Do NOT run `vp check`/lint/typecheck/tests — validation is deferred to the
final integration phase (machine-load constraint). Do not run dev servers.

## 9. Delegation semantics (frozen)

- Assignment to an agent actor owned by this instance ⇒ enqueue (dedupe by issueId).
- Capacity: `running < settings.issueDelegation.maxConcurrent` AND headroom
  (`cpuPercent < cpuHeadroomPercent` AND `freeMemoryMb > minFreeMemoryMb`; if sampling fails,
  headroom passes). Retry headroom every 15s.
- Dequeue order: priority asc (1 urgent first, 0 none last), then FIFO.
- Prompt template (first message): issue identifier+title, description, team, priority, labels,
  due date, parent/sub-issues, last 20 comments, standing instructions from
  `agentActors[actorId].instructions`, and instructions to post progress via `issue_comment`,
  update state via `issue_update`, and call `issue_link_thread` is NOT needed (server pre-links).
- Reassignment away / issue canceled ⇒ dequeue if still queued (running threads are not killed).

## 10. Amendments during build

1. Add command variant `"issue.setDelegationStatus" { issueId, status: DelegationStatus }` to
   `IssueCommand` (used by the delegation subsystem; agents may not call it via MCP — guardrail:
   attribution.kind === "agent" via MCP toolkit does not expose it as a tool).
2. Convex `executeCommand`: `comment.create/update/delete`, `reaction.toggle`, and every command
   that appends an `issueEvents` row must ALSO bump the parent issue's `syncSeq` WITHOUT changing
   its `updatedAt` — this is the signal the local mirror uses to re-fetch open issue details.
3. Delegation queue is in-memory, rebuilt on startup from the mirror (issues with
   `delegationStatus === "queued"` assigned to agent actors owned by this instance). Status
   transitions persist via `issue.setDelegationStatus`.
