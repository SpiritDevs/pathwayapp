# ADR 0002: Teams own full Linear-parity settings; org-wide issues use a workspace key

Status: Accepted (2026-07-11)

## Context

pathwayOS has no team concept; its existing "Project" means a repo/workspace
root. Linear scopes issues to Teams, each of which owns its own issue key,
workflow states, labels, cycles config, and estimate scale. The user wants a
real team interface (creation, settings, member allocation) plus org-wide
issues, and agents must be able to allocate an issue to a team or org-wide.

## Decision

- A **Team** owns, per Linear parity: name, icon/color, issue key prefix
  (e.g. `ENG`), members (human and agent actors), its own workflow states,
  labels, cycle configuration, and estimate scale.
- Teams also link one or more **repos** (pathwayOS projects) with a default;
  this mapping is how "start work on an issue" picks a workspace root
  (see ADR 0005).
- An issue is either **team-scoped** (identifier `ENG-42`) or **org-wide**
  (identifier from a configurable workspace-level prefix, e.g. `WS-17`).
- Moving an issue between teams (or to/from org-wide) assigns a fresh number
  in the destination key; old identifiers persist as **searchable aliases**
  (Linear's behavior).
- Number allocation is centralized in Convex (ADR 0001).

## Consequences

- Significant team-settings UI surface (states, labels, cycles, estimates,
  members, repos, key) ships in v1.
- Every board/list resolves per-team state sets; there is no single global
  column set.
- An alias table maps historical identifiers to current issues for search
  and old-link resolution.
- The word "Project" continues to mean repo in pathwayOS; Linear's Projects
  layer is renamed (see ADR 0008).
