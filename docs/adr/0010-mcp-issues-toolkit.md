# ADR 0010: MCP issues toolkit for agents

Status: Accepted (2026-07-11)

## Context

Agents reach pathwayOS tools through the in-server MCP HTTP server with
per-invocation bearer credentials scoped to `{ threadId, providerInstanceId }`
(`apps/server/src/mcp/`). Existing toolkits (preview, email) are read-only;
issues need writes.

## Decision

Add a `toolkits/issues/` MCP toolkit on the local server, following the
email toolkit shape (`Tool.make` + `Toolkit.make` + handlers layer).
Handlers resolve the invoking thread's agent actor, enforce ADR 0007
guardrails server-side, and call Convex mutations (ADR 0001).

Tool surface (v1):

- `issue_create` — team or org-wide; lands in triage for agent actors.
- `issue_get`, `issue_list`/`issue_search` — filterable by team, state
  category, assignee, label, cycle, epic, text.
- `issue_update` — title, description, priority, labels, due date, estimate,
  team (re-key per ADR 0002), epic, parent (sub-issue), state
  (category-aware), assignee (self-assign allowed).
- `issue_comment` — post/reply in comment threads; progress updates from a
  working agent are comments on its linked issue.
- `issue_link_thread` / `issue_start_work` — link the current thread to an
  issue (moves it to a started-category state per ADR 0005).
- `issue_relation_set` — blocks / blocked-by / related / duplicate-of.
- `issue_delete` — soft-delete only (ADR 0007).
- `team_list`, `actor_list`, `state_list`, `label_list`, `cycle_list`,
  `epic_list` — read-only directory tools so agents can allocate correctly.

Attribution: every mutation records the agent actor and the invoking thread
in `issueEvents`.

## Consequences

- Issues are the first write-capable MCP toolkit; the guardrail enforcement
  point (handlers, keyed off credential actor kind) becomes the template for
  future write toolkits.
- Offline (Convex unreachable): tools fail fast with a clear error
  (ADR 0001) rather than queueing.
