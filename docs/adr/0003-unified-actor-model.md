# ADR 0003: Unified actor model — humans and named agents are peers

Status: Accepted (2026-07-11)

## Context

Agent integration needs an answer to "who can be assigned, mentioned, and
attributed?" Linear made agents first-class app users. pathwayOS is
multi-user via shared Convex data (one user per app instance), and each user
runs their own agents.

## Decision

- One **Actor** concept: human users (Clerk identities) and **agent actors**
  are both assignable, @-mentionable, can be team members, and appear in the
  activity feed with avatars.
- Agent actors are **user-defined** in settings: name, avatar/color,
  provider (Claude/Codex), model, optional standing instructions. Multiple
  specialized agents can exist and join different teams.
- Every agent actor has an **owner** (the user whose instance runs it).
- Agent actors are **visible org-wide and assignable by anyone**. When
  another member assigns an issue to your agent, your instance picks it up
  via its capacity queue (ADR 0004) next time it is online; the owner's
  guardrails and caps always apply.
- Attribution in `issueEvents` records the acting actor (e.g. "Claude moved
  this to Done"), and for agent actions also the thread that performed them.

## Consequences

- An org-wide actor directory syncs through Convex (agent actors publish
  name/avatar/owner; provider/model/instructions stay owner-local).
- Assigning to an agent is the trigger for delegation (ADR 0004).
- @-mentioning an agent actor can ping its running thread (comment reply
  injection, ADR 0008).
