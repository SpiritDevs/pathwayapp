# Glossary — Issues & Agent Delegation

Vocabulary established in the 2026-07-11 design session (ADRs 0001–0010).
Where pathwayOS and Linear use the same word differently, the pathwayOS
meaning wins here.

- **Actor** — anything that can be assigned, @-mentioned, be a team member,
  and appear in the activity feed: a human user (Clerk identity) or an
  agent actor. (ADR 0003)
- **Agent actor** — a user-defined agent identity: name, avatar/color,
  provider, model, optional standing instructions. Owned by one user, whose
  instance executes its work; visible and assignable org-wide. (ADR 0003)
- **Alias** — a historical issue identifier (e.g. `ENG-42` after a move to
  another team) that still resolves in search and old links. (ADR 0002)
- **Capacity queue / work queue** — the per-instance FIFO-within-priority
  queue that gates auto-spawned agent threads behind a global concurrency
  cap and a system headroom check. (ADR 0004)
- **Category** — the fixed classification of a workflow state (`triage`,
  `backlog`, `unstarted`, `started`, `completed`, `canceled`). Automation
  and agent tools target categories, never state names. (ADR 0006)
- **Cycle** — a team-owned, time-boxed iteration (sprint) with auto-rollover
  of unfinished issues. (ADR 0008)
- **Delegation** — assigning an issue to an agent actor, which auto-spawns
  (or queues) a working thread on the owner's instance. (ADR 0004)
- **Epic** — pathwayOS's name for Linear's "Project": a multi-issue
  deliverable with progress, target dates, and milestones. Renamed to avoid
  colliding with pathwayOS Project (= repo). (ADR 0008)
- **Issue** — the core work item: identifier, title, markdown description,
  state, priority, assignee, labels, estimate, due date, cycle, epic,
  parent, relations, comments, linked threads. Team-scoped or org-wide.
- **Issue identifier / key** — `<KEY>-<number>`, e.g. `ENG-42`; the key is a
  team's prefix, or the workspace prefix for org-wide issues. Numbers are
  allocated centrally by Convex; moving re-keys and leaves an alias.
  (ADR 0002)
- **issueEvents** — the append-only Convex table recording every mutation
  with actor (and thread) attribution; it is the activity feed and audit
  log. (ADR 0001)
- **Linked thread** — a pathwayOS thread attached to an issue (1:many);
  linking an active thread moves the issue to a started-category state.
  Environment-local; other users see display-only status. (ADR 0005)
- **Local mirror** — a local server's read projection of Convex issue data,
  feeding the existing WS snapshot+delta stream; serves stale reads when
  offline. (ADR 0001)
- **Order key** — the fractional (LexoRank-style) string giving an issue its
  manual position within an ordering context; rewritten on drag. (ADR 0009)
- **Org / workspace** — the sharing boundary, mapped to a Clerk
  Organization; members share issues, teams, epics, and saved views.
  Personal use is an org of one. (ADR 0001)
- **Peek** — opening an issue in the right panel over the list/board without
  navigating; the full-page view lives at `/issues/$identifier`. (ADR 0008)
- **Project (pathwayOS)** — a repo/workspace root. Not Linear's Project;
  see Epic. Teams link repos to resolve where delegated work runs.
  (ADR 0002, 0005)
- **Relation** — a typed link between issues: blocks, blocked-by, related,
  duplicate-of. Distinct from parent/child (sub-issue). (ADR 0008)
- **Resource monitor** — the headroom check (CPU / free RAM thresholds) run
  before dequeuing agent work. (ADR 0004)
- **Saved view** — a named, synced filter + display configuration (personal
  or team-shared, pinnable). The _current_ unsaved config persists locally
  per page. (ADR 0008, 0009)
- **Soft-delete** — the only delete: `deletedAt` + trash with restore.
  Hard purge is human-only. (ADR 0007)
- **Sub-issue** — a child issue under a parent; agents use these to
  decompose delegated work. (ADR 0008)
- **Team** — the primary issue scope; owns its key, workflow states, labels,
  cycles config, estimate scale, members (actors), and linked repos with a
  default. (ADR 0002)
- **Triage** — the state (category) where unprocessed issues await
  accept/decline; all agent-created issues land here. (ADR 0006, 0007)
- **Workflow state** — a team-owned status (`{name, color, category,
position}`) that forms board columns; customizable within fixed
  categories. (ADR 0006)
