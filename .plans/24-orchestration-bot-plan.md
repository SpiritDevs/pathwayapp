# Orchestration Bot Plan

Status: **Interview in progress — round 1 complete**

This is a living design document produced through the orchestration-bot grilling session. Decisions remain provisional until recorded in an ADR.

## Product intent

Add a **Bot** item immediately above the project-settings control. It opens a draggable, resizable chat window that follows the user across pathwayOS surfaces.

The bot is the user's primary system-level orchestration agent. It can coordinate project agent sessions, surface operational updates such as incoming email, and eventually support realtime voice without changing the conversation or authorization model.

## Accepted requirements

- The Bot surface is available globally rather than belonging to one project.
- Its window is draggable, resizable, closable, and recoverable after navigation.
- The conversation and window state should survive route changes and application restarts.
- The bot can observe and coordinate multiple provider agents, including Codex and Claude sessions.
- The bot can surface events from other pathwayOS modules, initially including email.
- Voice is deferred, but the architecture must permit a future GPT realtime/live media adapter.
- Project and conversation boundaries must remain explicit; orchestration authority must not silently bypass private-resource authorization.

## Provisional domain model

### Orchestrator identity

One logical bot identity associated with an account or tenant. It owns durable conversation state and policy, but does not imply that one process runs forever.

### Orchestrator conversation

The durable user-facing transcript. All app instances for the same account converge on this conversation unless a later decision introduces named conversations.

### Execution lease

A time-limited claim held by one eligible pathwayOS runtime when an orchestration turn needs local capabilities. Leases prevent two computers from executing the same action concurrently.

### Capability grant

An explicit permission allowing the orchestrator to read or act on a resource class, tenant, project, agent session, email sandbox, or connector.

### Orchestration command

A typed request issued by the bot to a pathwayOS subsystem. Commands have idempotency keys, lifecycle state, audit records, and an optional approval requirement.

### System event

A normalized event from email, agents, workflows, or another module that may update the bot's context or produce a user notification.

### Bot window

The persistent UI projection of the orchestrator conversation. Position and size are per-device preferences; conversation state is account-scoped.

## Architectural invariants under consideration

- Convex stores canonical account-scoped conversation, command, policy, event, and audit state.
- Local/server runtimes execute capabilities; Convex does not directly control desktop processes.
- Every command is typed, idempotent, attributable, cancellable where possible, and visible in an audit trail.
- Private project or conversation access requires a capability grant rather than relying only on broad tenant membership.
- External side effects and destructive operations have an explicit approval policy.
- Realtime voice becomes another transport into the same orchestrator conversation, not a separate agent identity.

## Delivery outline

- [ ] Complete product and authority interview.
- [ ] Record runtime-placement and execution-leasing ADR.
- [ ] Record authorization and approval-policy ADR.
- [ ] Finalize domain model and command/event contracts.
- [ ] Design the global Bot launcher and floating-window behavior.
- [ ] Implement durable orchestrator conversation and device-local window preferences.
- [ ] Add read-only system context and email event summaries.
- [ ] Add typed agent-session inspection and control commands.
- [ ] Add approvals, audit history, cancellation, retries, and failure recovery.
- [ ] Add notification policy and background execution.
- [ ] Add a provider-neutral realtime voice boundary and GPT realtime implementation.
- [ ] Complete authorization, concurrency, UI, responsive, offline, and accessibility tests.

## Interview ledger

### Round 1 — authority and placement

Decided:

1. The orchestrator may autonomously perform reversible internal actions. External, destructive, financial, security-sensitive, or otherwise high-impact actions require approval.
2. There is one primary orchestrator instance controlled through Convex. Other online machines run sub-coordinators that communicate with the primary and execute delegated work.
3. The user can transfer the primary role between machines either conversationally through the bot or explicitly through the user-profile menu.
4. The orchestrator can access everything the user is authorized to access. Tenant and resource authorization still apply; “everything” does not bypass the user's own permissions.

### Round 2 — transfer, delegation, and secrets

Decided:

1. Primary transfer moves new orchestration immediately. Already-leased work continues on its assigned machine and is monitored by the new primary.
2. A disconnected sub-coordinator may finish already-leased work until its lease expires. It cannot accept new work or initiate new external side effects while disconnected.
3. When connectivity returns, the sub-coordinator emits a reconnection event that notifies the primary and reconciles its command results and local state.
4. The orchestrator may use protected credentials through capabilities but cannot read or display raw API keys, tokens, passwords, private keys, or equivalent secret values.

### Round 3 — conversation, notifications, and window behavior

Decided:

1. The Bot presents one active conversation thread with delegated work as expandable child activity. The user can compact its context, clear into a new thread, browse previous threads, and reopen older threads.
2. Notifications use three levels: critical events produce visible and optional system notifications; action-needed events appear in the Bot badge/activity queue; informational events accumulate into summaries.
3. Agent input requests, failed work, security events, and urgent email are initially considered critical event classes.
4. The Bot window persists across route changes, remembers geometry per machine, is draggable and resizable on desktop, becomes full-screen on mobile, and does not open itself automatically.

### Round 4 — thread semantics and agent intervention

Open:

1. Does “clear” always create a new thread while retaining the old thread, and does compaction preserve the full source transcript behind a generated summary?
2. When the orchestrator controls a project agent, which operations are allowed: send instructions, create chats, stop/retry work, answer agent questions, change model/mode, and approve provider tool requests?
3. Must every orchestrator intervention appear visibly as the Bot, with provenance and audit links, rather than impersonating the user?

## Decision log

- **2026-07-11 — Authority:** reversible internal actions are autonomous; high-impact actions require approval.
- **2026-07-11 — Runtime topology:** one Convex-controlled primary orchestrator coordinates machine-local sub-coordinators.
- **2026-07-11 — Primary transfer:** the user can transfer primacy conversationally or through the profile menu.
- **2026-07-11 — Visibility:** the orchestrator receives the full scope of resources the user is authorized to access.
- **2026-07-11 — Transfer continuity:** existing leased work remains on its assigned machine while new orchestration moves to the new primary.
- **2026-07-11 — Disconnected execution:** sub-coordinators may finish existing leases but cannot accept or originate new work while disconnected.
- **2026-07-11 — Reconnection:** restored coordinators notify the primary and reconcile results and local state.
- **2026-07-11 — Secrets:** the orchestrator can invoke secret-backed capabilities but cannot read or reveal raw secret values.
- **2026-07-11 — Conversation threads:** one active Bot thread contains expandable delegated tasks; users can compact, start fresh, and browse or reopen historical threads.
- **2026-07-11 — Notification levels:** critical, action-needed, and informational events have distinct interruption behavior.
- **2026-07-11 — Critical events:** agent input requests, failures, security events, and urgent email initially qualify.
- **2026-07-11 — Window behavior:** desktop geometry is device-local and persistent; mobile is full-screen; the window follows route changes and never opens itself automatically.
