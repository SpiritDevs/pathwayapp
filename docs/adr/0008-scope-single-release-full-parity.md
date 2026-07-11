# ADR 0008: Single release with full Linear parity (including Epics)

Status: Accepted (2026-07-11)

## Context

The feature set selected for the first shippable slice is the full parity
set. A phased delivery (schema-complete up front, UI in three phases) was
proposed and explicitly rejected: everything ships together. This conflicts
with the repo's general scope-control preference; the tradeoff (a long
period with nothing shippable, large review surface) was surfaced and
accepted.

## Decision

One release containing:

- **Core**: title, markdown description, per-team workflow states, priority
  (Urgent→Low + No priority), assignee (any actor), labels, manual drag
  ordering, comments.
- **Hierarchy & relations**: sub-issues (parent/child), blocks / blocked-by
  / related links.
- **Cycles & estimates**: time-boxed cycles with auto-rollover; per-team
  estimate scale.
- **Due dates & triage**: due dates with overdue indicators; triage inbox
  (accept/decline), which is also where agent-created issues land
  (ADR 0007).
- **Epics**: Linear's Projects layer (multi-issue deliverables with
  progress, target dates, milestones) built under the name **Epics** —
  "Project" keeps meaning repo in pathwayOS.
- **Saved views**: named views (icon, saved filter + display config),
  personal and team-shared, pinnable in the sidebar, synced via Convex.
- **Comments at full parity**: Lexical markdown editor, @-mentions of any
  actor (mentioning an agent pings its thread; replies to an agent's
  progress comment are injected into the running thread as user messages),
  emoji reactions, threaded replies.
- **Views**: draggable grouped list + Kanban board with filter bar and
  display options (group by state/assignee/priority/label/cycle/epic,
  ordering, swimlanes).
- **Detail**: full page route (`/issues/$identifier` — shareable) plus side
  peek from list/board (RightPanelSheet) for triage flows.
- **Teams**: full team CRUD + settings surface (ADR 0002).
- **Agent integration**: actor registry, MCP issues toolkit, delegation
  queue (ADRs 0003, 0004, 0010).

Internal milestones may sequence the build, but they are not shipping gates.

## Consequences

- Weeks of unshipped work; review happens per-milestone to keep PRs
  tractable.
- Naming: "Epic" replaces Linear's "Project" everywhere in UI, schema, and
  docs to avoid colliding with pathwayOS repos.
