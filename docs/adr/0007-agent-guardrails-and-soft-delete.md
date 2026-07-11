# ADR 0007: Agent guardrails and universal soft-delete

Status: Accepted (2026-07-11)

## Context

Agent actors act through the MCP issues toolkit, including autonomously
(auto-spawned threads, self-directed backlog work). Deletion is the one
action an activity log cannot make un-scary.

## Decision

- **Soft-delete is the only delete**, for humans and agents alike: entities
  get `deletedAt` and land in a trash with restore; hard deletion is a
  separate, human-only, explicit purge. Agents may soft-delete.
- **Agent-created issues default to the team's triage state** so a human
  accepts/declines them before they hit the backlog. Human-created issues
  skip triage.
- **Self-assign is allowed**: an agent may assign an unassigned issue to
  itself (e.g. "pick up the next Todo item").
- Agents are **not** restricted to their own issues: they may transition,
  comment on, and edit any issue in teams they are members of (enables
  "triage my backlog" asks). Attribution makes every action visible.

## Consequences

- Trash/restore UI ships in v1; queries filter `deletedAt` by default.
- Guardrails are enforced server-side in the MCP toolkit handlers (not by
  prompting), keyed off the invoking credential's actor kind.
