# ADR 0006: Category-based, customizable workflow states

Status: Accepted (2026-07-11)

## Context

Board columns and status automation need a state model. Linear ships default
states grouped into categories and allows custom states within categories;
automation targets categories so customization never breaks it.

## Decision

- Workflow states are data, owned per team (ADR 0002):
  `{ name, color, category, position }`.
- Categories are fixed: `triage`, `backlog`, `unstarted`, `started`,
  `completed`, `canceled`.
- New teams are seeded with Linear's defaults: Triage, Backlog, Todo,
  In Progress, In Review, Done, Canceled, Duplicate.
- Users add/rename/reorder/recolor states within categories via team
  settings.
- All automation and agent tooling target **categories**, never state names
  (e.g. "move to a started state when work begins", "agent-created issues
  land in the triage state").

## Consequences

- Boards group columns by the team's states; multi-team views group by
  category (states with the same category align across teams).
- Deleting a state requires migrating its issues to another state of the
  same category.
