# Linear-Parity Issues + Agent Delegation Plan

Status: Design accepted 2026-07-11 (grilling session). Implementation not started.
Decisions are recorded in `docs/adr/0001`–`0010`; vocabulary in `docs/glossary.md`.

## Goal

A Linear-style issues product inside pathwayOS — draggable grouped list and
Kanban board, full-page issue detail, teams, cycles, epics, saved views —
with agents as first-class actors that can create, comment on, be assigned,
and autonomously work on issues.

## Product shape

- `/issues` — the workspace issues surface: list and board tabs, filter bar,
  display options (group by state/assignee/priority/label/cycle/epic,
  ordering incl. manual drag, swimlanes), saved views pinned in the sidebar.
- `/issues/$identifier` — full-page issue detail (description, sub-issues,
  relations, activity feed, threaded comments; properties sidebar). Side
  peek from list/board via RightPanelSheet.
- `/settings/teams` (pending settings area) — team CRUD: name, icon, key,
  members (human + agent actors), workflow states, labels, cycles config,
  estimate scale, linked repos with default.
- Settings: agent actor registry (name, avatar, provider, model, standing
  instructions); workspace issue prefix; delegation cap + headroom
  thresholds; trash.

## Architecture (ADR 0001)

```text
web UI ──WS snapshot+delta──▶ local server ◀──MCP (bearer, thread-scoped)── agent threads
                                   │  ▲
                     Convex mutations  │ subscription (mirror worker,
                                   ▼  │  EmailSandboxSyncWorker pattern)
                          Convex (canonical: issues, teams, epics, states,
                          labels, cycles, views, actors, comments, reactions,
                          issueEvents append-only activity log)
                                   ▲
                        other users' instances (Clerk Organization = org)
```

- Reads: Convex → per-instance mirror → existing Effect RPC WS stream →
  Effect atoms (merge logic in `packages/client-runtime/src/state/`).
- Writes: UI / MCP handler → local server → Convex mutation. Offline: reads
  serve stale mirror, writes fail fast.
- Delegation: mirror update ("issue assigned to my agent") → per-instance
  work queue (global cap + resource monitor, FIFO within priority) → spawn
  thread in resolved repo (issue repo override → team default) → link
  thread, move to started category → agent posts progress comments via MCP.

## Data model sketch (Convex)

- `orgs` implicit via Clerk org id on every row.
- `teams` {name, icon, color, key, cycleConfig, estimateScale, repoLinks[] (logical project keys, default), createdAt, deletedAt}
- `teamMemberships` {teamId, actorId}
- `actors` {kind: human|agent, clerkUserId?, ownerUserId?, name, avatar, color; agent config (provider/model/instructions) stays owner-local}
- `workflowStates` {teamId, name, color, category, position}
- `labels` {teamId?, name, color}  (team-owned per ADR 0002)
- `issues` {teamId?, number, identifier, title, descriptionMd, stateId,
  priority, assigneeActorId?, estimate?, dueDate?, cycleId?, epicId?,
  parentIssueId?, orderKeys (per context), createdByActorId, deletedAt}
- `issueAliases` {alias, issueId}
- `issueRelations` {issueId, type: blocks|related|duplicate, otherIssueId}
- `issueThreadLinks` {issueId, environmentId, threadId, logicalProjectKey?, status}
- `comments` {issueId, parentCommentId?, authorActorId, bodyMd, deletedAt}
- `reactions` {commentId, actorId, emoji}
- `cycles` {teamId, number, startsAt, endsAt}
- `epics` {name, icon, targetDate?, status, milestones[]}
- `savedViews` {ownerActorId | teamId, name, icon, filterConfig, displayConfig, pinned}
- `issueEvents` {issueId, actorId, threadRef?, kind, payload, at} — append-only
- `counters` {scopeKey (team|workspace), next} — identifier allocation

## Local server (net-new)

- Convex mirror worker for issue-domain tables → local projection tables
  (new migrations) → extend shell/subscribe RPCs with issue snapshot+delta.
- Write RPCs proxying to Convex mutations.
- MCP `toolkits/issues/` (ADR 0010) — first write-capable toolkit; server-side
  guardrails: agent-created → triage, soft-delete only, self-assign allowed.
- Delegation subsystem: work queue, resource monitor (CPU/RAM headroom),
  spawn orchestration, issue↔thread lifecycle automation.

## Web (net-new)

- Issues list (grouped, virtualized via LegendList, dnd-kit drag with
  fractional order keys) and board (columns per team state / grouping,
  swimlanes) — ADR 0009.
- Issue detail page + peek; Lexical editors; threaded comments with
  @-mentions (mention/reply pings the agent's running thread) and reactions.
- Filter bar + display options; saved views (synced) + per-page current
  config (local).
- Teams settings, agent registry settings, triage inbox, trash, keyboard
  shortcuts + command palette actions.

## Suggested internal milestones (not shipping gates — ADR 0008)

1. Convex schema + mirror worker + local projections + subscribe/write RPCs.
2. Teams + actors + settings surfaces; identifier allocation.
3. List + board + drag + filters/display + detail page/peek + comments.
4. MCP issues toolkit + attribution + triage inbox.
5. Delegation queue + resource monitor + issue↔thread automation.
6. Epics, cycles, estimates, relations, sub-issues UI, saved views, trash.
7. Hardening: offline behavior, re-key/alias flows, rebalancing, keyboard.

## Open questions (deliberately deferred)

- Convex authz model for org-shared tables (Clerk org claims in Convex
  functions) — follow the pattern chosen by plans 21/22/23.
- Exact headroom thresholds and retry cadence for the resource monitor.
- Mention→thread ping semantics when the agent thread has ended (spawn a
  follow-up thread vs queue a notification).
- Swimlane set for v1 (priority × state is the likely default).
- Whether label ownership needs a workspace-level tier in addition to
  team-owned (Linear has both).
