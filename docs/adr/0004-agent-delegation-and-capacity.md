# ADR 0004: Auto-spawn delegation behind a capacity-aware work queue

Status: Accepted (2026-07-11)

## Context

Assigning an issue to an agent should start real work (Linear-agents feel),
but pathwayOS threads cost real compute and touch real repos. Unbounded
auto-spawn could overwhelm a machine.

## Decision

- Assigning an issue to an agent actor **auto-spawns a thread** on the
  owning user's instance: the thread is pre-prompted with the issue (title,
  description, comments, sub-issues), the issue moves to a Started-category
  state, and the thread is linked to the issue. The agent posts progress as
  comments.
- Auto-spawn is gated by a **per-instance work queue**:
  - One workspace setting: max concurrent auto-spawned issue threads
    (global cap, e.g. 3).
  - Before each dequeue, a **resource monitor** checks system headroom
    (e.g. skip if CPU > 85% or free RAM below a threshold) and retries
    shortly after.
  - Queue order is FIFO within priority (Urgent first).
- If the instance is at capacity (or offline), the assignment queues with a
  visible "queued" indication on the issue, and starts when capacity frees.

## Consequences

- A new server subsystem: work queue + resource monitor + spawn orchestration,
  driven by mirror updates from Convex (assignments made by other users
  arrive as sync events).
- Thread spawn target resolution follows ADR 0005 (issue repo override →
  team default repo); an issue with no resolvable repo cannot auto-start and
  surfaces as needing a repo.
- Cap and headroom thresholds are workspace settings; per-agent or per-team
  caps were considered and rejected for v1 (machine resources are global).
