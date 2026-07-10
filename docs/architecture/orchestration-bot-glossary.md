# Orchestration Bot Glossary

Status: **Provisional — interview in progress**

## Bot

The global pathwayOS UI entry that opens the orchestrator conversation. “Bot” is the user-facing product label; it is not a generic provider bot or project agent.

## Orchestrator

The account- or tenant-level agent that interprets user intent, observes authorized system context, and coordinates typed commands across pathwayOS modules.

## Primary orchestrator

The single machine-bound orchestrator instance currently holding the Convex-controlled primary lease. It owns top-level planning, user interaction, delegation, and reconciliation while its lease remains valid.

## Sub-coordinator

A pathwayOS coordinator running on another connected machine. It reports local capabilities and state to the primary orchestrator and performs delegated commands under an execution lease.

## Project agent

A provider-backed coding session, such as Codex or Claude, scoped to a project or workspace. A project agent is controlled by the orchestrator only through authorized commands.

## Capability

A typed operation exposed by a pathwayOS subsystem, such as reading agent status, sending an instruction, summarizing new email, or starting a workflow.

## Capability grant

Authorization for the orchestrator to invoke a capability over a defined resource scope.

For the initial personal-account model, grants cover everything the user is authorized to access. They never expand the user's underlying tenant, project, private-conversation, email, or connector permissions.

## Orchestration command

A durable, idempotent request from the orchestrator to a subsystem, including lifecycle, result, error, approval, and audit metadata.

## Execution lease

A short-lived exclusive claim that assigns a command to one eligible runtime and prevents duplicate execution across machines.

## Primary lease

The Convex-backed exclusive claim identifying which connected machine currently hosts the primary orchestrator. The user can request a controlled transfer of this lease through conversation or the profile menu.

## Primary transfer

The coordinated movement of the primary lease from one machine to another, including treatment of in-flight commands, transcript continuity, and stale-primary fencing.

Existing commands do not migrate merely because primacy moves. Their execution leases remain assigned to the original machine, and the new primary adopts monitoring and reconciliation responsibility.

## Reconnection event

A system event emitted when a sub-coordinator restores its Convex and primary connection. It prompts the primary to reconcile command results, expired leases, capability advertisements, and local agent state.

## Secret-backed capability

A capability that can use a credential inside its protected runtime boundary without returning the raw secret to the orchestrator model, transcript, logs, command result, or UI.

## System event

A normalized fact emitted by a subsystem, such as email received, agent waiting for input, task completed, or connection lost.

## Approval

A user decision authorizing a proposed command whose policy requires confirmation.

## Orchestrator conversation

The account-scoped collection of durable Bot threads shared across the user's pathwayOS instances and, later, text and realtime voice transports.

## Bot thread

A durable user-facing conversation with its own messages, compacted context, delegated child activities, title, timestamps, unread state, and archive state. One thread is active in the Bot window at a time.

## Context compaction

Creation of a model-usable summary and structured memory checkpoint for a Bot thread. Compaction does not delete or rewrite the source transcript; the user can still inspect the original messages.

## Delegated activity

An expandable projection inside a Bot thread showing work delegated to project agents or sub-coordinators, including target, status, progress, approvals, result, and audit linkage.

## Notification level

The interruption policy assigned to a system event:

- **Critical:** visible in-app alert and optional system notification.
- **Action needed:** unread badge and activity-queue entry.
- **Informational:** retained for Bot summaries and history without immediate interruption.

## Bot window

The draggable and resizable visual container for the orchestrator conversation. Its geometry is device-local even when its conversation is synchronized.

The window persists across pathwayOS route changes, becomes a full-screen surface on mobile, and does not open itself automatically.
