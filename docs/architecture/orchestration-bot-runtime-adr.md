# ADR: Orchestration Bot Runtime and Authority

Status: **Accepted in part — follow-up decisions pending**  
Date: **2026-07-11**

## Context

pathwayOS needs one durable orchestration bot that the user can reach from any machine. It must coordinate project-level Codex, Claude, and future provider agents; observe system modules such as email; and eventually accept realtime voice input.

A single permanent process is not reliable because machines disconnect, sleep, or move between networks. Allowing every machine to plan and execute independently would create duplicate commands, conflicting messages, and unclear user authority.

## Decision

### One logical orchestrator, one primary runtime

The product exposes one logical orchestrator identity and one canonical conversation. At any moment, one eligible connected machine holds the Convex-controlled **primary lease** and runs the primary orchestrator instance.

### Machine-local sub-coordinators

Other connected machines run **sub-coordinators**. They advertise local capabilities, report local agent/session state, communicate with the primary, and execute delegated typed commands under execution leases.

### User-directed primary transfer

The user can request primary transfer conversationally through the bot or explicitly through the user-profile menu.

Convex is the canonical source of lease generation and ownership. A transferred or expired primary must be fenced from issuing new canonical commands.

### Broad authorized visibility

The orchestrator can access everything the user is authorized to access, including projects, agent sessions, email, and private resources available to that user. This does not bypass tenant membership, project permissions, private-conversation membership, connector scopes, or other underlying authorization.

### Autonomous reversible work

The orchestrator may perform reversible internal actions without repeated confirmation. External, destructive, financial, security-sensitive, and other high-impact operations require approval according to policy.

### Non-disruptive primary transfer

Primary transfer affects new orchestration decisions immediately. Commands that already hold execution leases remain assigned to their current machines. The new primary monitors those commands, receives their results, and handles reconciliation. A stale primary is fenced from creating new canonical commands after its lease generation changes.

### Bounded disconnected execution

A sub-coordinator that loses its primary or Convex connection may continue work already authorized by an unexpired execution lease. While disconnected, it cannot accept new commands, create new orchestration decisions, extend its own lease, or initiate additional external side effects beyond the leased command.

On reconnection it emits a durable reconnection event, uploads buffered lifecycle and result records, refreshes its capability advertisement, and notifies the primary to reconcile state.

### Non-readable secrets

The orchestrator can invoke secret-backed capabilities, but raw secret values never enter model context, transcripts, command payloads or results, logs, notifications, or the Bot UI. Secret resolution occurs inside the authorized execution boundary.

## Consequences

- Conversation and orchestration state must be account- or tenant-scoped rather than device-scoped.
- Every primary-originated command needs a lease generation, idempotency key, actor, target machine, lifecycle, and audit record.
- Sub-coordinators need presence leases and capability advertisements.
- Primary transfer preserves in-flight leases and requires stale-primary fencing.
- The UI must show the current primary machine and expose transfer controls in both chat and the profile menu.
- Offline and degraded behavior must distinguish already-delegated execution from creation of new orchestration decisions.

## Pending follow-up decisions

- Exact approval-policy categories and remembered approvals.
- Conversation and delegated-task presentation.
- Proactive notification and interruption policy.
- Background retention and offline result buffering limits.
