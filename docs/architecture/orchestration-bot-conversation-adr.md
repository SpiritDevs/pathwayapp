# ADR: Orchestration Bot Conversation, Notifications, and Window

Status: **Accepted in part — follow-up decisions pending**  
Date: **2026-07-11**

## Context

The Bot is intended to become the user's primary interface to pathwayOS. A single unbounded transcript would become difficult to navigate and expensive to place in model context. A conventional collection of unrelated chats would hide the relationship between the user's request and the work delegated across machines and project agents.

The Bot also receives system events. Treating every event as an interruption would make it unusable, while silently retaining every event would prevent it from keeping the user informed.

## Decision

### Durable threads with one active thread

The Bot window displays one active durable thread. Users can start a new thread, browse older threads, and reopen previous threads. Delegated work remains visibly attached to the originating thread as expandable child activity.

### Context compaction without transcript loss

Threads support context compaction. Compaction produces a summary and structured checkpoint for subsequent model turns while preserving the complete source transcript for inspection, search, audit, and future re-compaction.

### Three notification levels

System events are classified as:

- **Critical:** show an in-app alert and, when permitted, a system notification.
- **Action needed:** increment the Bot badge and create an activity-queue entry.
- **Informational:** remain available for summaries and history without immediate interruption.

Initial critical classes include an agent waiting for user input, failed work requiring attention, security events, and urgent email. Classification rules must remain configurable and auditable.

### Persistent but non-self-opening window

The Bot surface persists across application route changes. Desktop size and position are stored per machine. Desktop uses a draggable, resizable floating window; mobile uses a full-screen surface.

Events never open the Bot automatically. Critical events use notification surfaces, and the user chooses when to open the conversation.

## Consequences

- Convex needs thread, message, compaction-checkpoint, delegated-activity, notification, and read-state records.
- “Clear” and “new thread” semantics must be explicit and must not accidentally delete history.
- Thread search and browsing are required parts of the initial product, not future administration work.
- Window geometry must not sync across machines with different displays.
- Notification classification needs per-user preferences, deduplication, quiet periods, and delivery audit state.

## Pending follow-up decisions

- Exact clear, archive, delete, and retention semantics.
- Automatic versus manual compaction thresholds.
- Orchestrator intervention and provenance inside project-agent chats.
- Whether critical notification classes can be disabled individually.
