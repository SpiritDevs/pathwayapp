# ADR 0005: Issues link threads bidirectionally; teams map to repos

Status: Accepted (2026-07-11)

## Context

"An agent works on an issue" needs a structural relationship between shared
issues (Convex) and environment-local threads. Threads need a concrete
workspace root to run in, but issues are team-scoped or org-wide.

## Decision

- An issue can have **linked threads** (1:many). Links are created:
  - from the UI: "Start work" on an issue spawns a pre-prompted thread;
  - from a running thread: the agent (via MCP tool) or the user links an
    existing thread or creates an issue from the thread.
- Status automation: linking an active thread moves the issue to a
  Started-category state (category-targeted, per ADR 0006).
- Repo resolution for spawning: the issue's explicit repo field if set, else
  the team's default linked repo; an org-wide issue with neither requires a
  choice before spawning.
- Because threads are environment-local and issues are shared, thread links
  store a durable reference (environment id + thread id, plus the logical
  project key vocabulary from `packages/client-runtime/src/state/projectGrouping.ts`
  where applicable). Other users see linked-thread status as display-only
  metadata (e.g. "running on Corey's machine").

## Consequences

- Thread link records sync through Convex but only the owning instance can
  act on them.
- The issue detail page shows linked threads with live status from the local
  mirror when the thread is local, and last-synced status otherwise.
