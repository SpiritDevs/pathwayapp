# ADR 0001: Convex is the canonical store for shared issue data

Status: Accepted (2026-07-11)

## Context

Issues, teams, epics, and saved views are shared data across different users'
pathwayOS instances (one user per instance, no instance sharing). The repo's
established local persistence template (commands → `orchestration_events` →
projection tables → WS snapshot+delta) is single-instance: it cannot allocate
issue numbers or resolve conflicts across users. Convex is already the
canonical sync engine for cross-install data (email sandbox, `.plans/23`), and
Clerk auth is integrated.

An earlier working decision in this design session ("follow the local
event-sourced template") is superseded by this ADR.

## Decision

- Convex holds the source of truth for issues, teams, epics, workflow states,
  labels, cycles, saved views, actors, comments, and reactions: document
  tables for current state **plus an append-only `issueEvents` table** that
  preserves the audit/activity-feed benefits of event sourcing.
- Convex allocates issue numbers and owns conflict resolution.
- Each local server mirrors Convex data into local read projections
  (following the `EmailSandboxSyncWorker` pattern) and feeds the existing
  Effect RPC WebSocket snapshot+delta stream to its clients.
- Writes flow: web UI / MCP tool → local server → Convex mutation. The MCP
  issues toolkit stays on the local server so thread-scoped credentials and
  attribution keep working.
- The shared circle is a **Clerk Organization**: org members share
  issues/teams/epics. Personal use is an org of one. Invites, membership, and
  roles ride on Clerk's machinery — no custom invite system.
- Offline behavior: the local mirror serves reads (marked stale); **all
  writes fail fast** with a clear offline error, for humans and agent tools
  alike. No offline write queue, no conflict machinery.

## Consequences

- Activity feed and attribution come from `issueEvents`, not from local
  `orchestration_events`.
- Issue data has a different write path than threads/projects (Convex
  mutation vs local command dispatch); the read path stays uniform (WS
  snapshot+delta).
- Agents queued to auto-start (ADR 0004) will not dequeue while offline;
  cross-user assignments are picked up when the owning instance reconnects.
