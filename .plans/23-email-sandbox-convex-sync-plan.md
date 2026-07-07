# Email Sandbox Convex Sync Plan

Status: Draft plan

Goal: Build a first-party pathwayOS email sandbox that captures local test email with Mailpit, syncs the sandbox inbox across the same user's pathwayOS installs with Convex, stores attachment bytes in UploadThing, and exposes safe project-aware email testing tools to agents.

## Product Shape

pathwayOS owns the product experience. Mailpit is only the local capture engine.

Core surfaces:

- `/settings/email` owns global email sandbox defaults, retention, sync, attachment, and cache controls.
- The project detail sheet owns per-project email sandbox toggles and port details.
- `/email` owns the mailbox experience for sandbox messages.
- Agents get a permissioned, read-only email inspection capability when the user enables it.

Primary flow:

```text
App under test
  -> project-specific SMTP endpoint
  -> pathwayOS SMTP router
  -> shared local Mailpit runtime
  -> pathwayOS importer
  -> Convex canonical mailbox records
  -> UploadThing private attachment blobs
  -> other pathwayOS installs for the same user
```

## Decisions

1. Use Mailpit open source as a local runtime adapter, not as the source of truth.
2. Convex is the canonical sync engine for mailbox metadata, message state, sandbox settings, and device/source state.
3. UploadThing stores synced attachment bytes. Convex stores attachment metadata and UploadThing keys.
4. Users can own multiple sandboxes.
5. Projects can have dedicated sandboxes.
6. Project sandboxes bind to logical project identity where possible, not only environment-local `ProjectId`.
7. Global email settings control default sandbox creation and default agent access.
8. Project detail settings can toggle each project's sandbox and agent email access.
9. Use one shared Mailpit runtime per device to limit local resource usage.
10. Give each active project sandbox stable SMTP details through the pathwayOS SMTP router.
11. SMTP stays local/private by default.
12. There are no remote users in the MVP. Sync is for the same user's multiple pathwayOS installs.
13. Do not support release/forward-to-real-recipient in the MVP.
14. Provide two destructive actions: clear local cache and clear synced sandbox history.
15. Default retention is 14 days or 500 messages per sandbox, with separate attachment limits.

## Project Binding

Project IDs are environment-local, so synced project sandboxes must bind to a durable logical project key.

Preferred key:

```text
repositoryIdentity.canonicalKey + optional repository-relative project path
```

Fallback key:

```text
environmentId + normalized workspaceRoot
```

Existing project grouping logic already derives repository-scoped logical keys in `packages/client-runtime/src/state/projectGrouping.ts`. Reuse that vocabulary and behavior so the sidebar, project detail sheet, and email sandbox binding agree on what "same project" means across machines.

## Settings

Global email settings:

- `Create sandbox for new projects`
- `Enable sandbox capture by default`
- `Allow agents to inspect sandbox email by default`
- `Sync attachments`
- `Attachment max size`
- `Retention: days`
- `Retention: max messages per sandbox`
- `Clear local email cache`
- `Clear synced sandbox history`

Project detail sheet:

- `Email sandbox` on/off
- `Agent can read sandbox email` on/off
- SMTP host
- SMTP port
- optional SMTP username/password if needed later
- copy environment variable snippet
- clear local project email cache
- clear synced project sandbox history

Recommended runtime environment variables for project scripts and agents:

```text
PATHWAYOS_EMAIL_SANDBOX_ID=<sandbox id>
PATHWAYOS_EMAIL_SANDBOX_SMTP_HOST=127.0.0.1
PATHWAYOS_EMAIL_SANDBOX_SMTP_PORT=<stable project port>
PATHWAYOS_EMAIL_SANDBOX_WEB_URL=<pathwayOS email view URL>
```

Do not write project-local config files in the first pass. Environment variables are easier to rotate, safer for secrets, and already match project script/runtime patterns. A `.pathway/email-sandbox.json` file can come later if external tooling needs a durable file.

## Local Runtime

Use one managed Mailpit process per device, started only when at least one sandbox is enabled locally.

Components:

- `MailpitRuntimeManager`: installs/resolves, starts, stops, restarts, and reports health.
- `EmailSandboxRouter`: exposes stable per-sandbox SMTP ports and forwards messages into the shared capture path.
- `MailpitImporter`: imports messages from Mailpit into pathwayOS canonical records.
- `EmailSandboxCache`: stores local recent messages, import cursors, and attachment cache state.

Resource strategy:

- No Mailpit process when no local sandbox is enabled.
- One Mailpit process per device when any local sandbox is active.
- One lightweight SMTP listener per active project sandbox, or one listener with routing if the client can supply sandbox identity.
- Auto-allocate stable ports on first enable and persist them.
- Reuse ports across restarts when available.
- Surface conflicts clearly in project settings.

## Convex Domain Model

Add a mailbox domain under `infra/connect-convex`. Keep it separate from relay/remote access records.

Suggested tables:

- `emailSandboxes`
- `emailSandboxProjectBindings`
- `emailSandboxSources`
- `emailMessages`
- `emailMessageBodies`
- `emailMessageAttachments`
- `emailMessageEvents`
- `emailAgentAccessGrants`

### emailSandboxes

User-owned logical mailbox.

Fields:

- `userId`
- `sandboxId`
- `name`
- `kind`: `manual | project`
- `enabled`
- `captureEnabledByDefault`
- `agentAccessDefault`
- `syncAttachments`
- `attachmentMaxBytes`
- `retentionDays`
- `retentionMaxMessages`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes:

- by user
- by user plus sandbox id
- by user plus deleted state

### emailSandboxProjectBindings

Connects a sandbox to a logical project.

Fields:

- `userId`
- `sandboxId`
- `logicalProjectKey`
- `repositoryCanonicalKey`
- `repositoryRelativePath`
- `displayName`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes:

- by user plus logical project key
- by sandbox id

### emailSandboxSources

Represents a local app install, environment, or machine that can capture messages for a sandbox.

Fields:

- `userId`
- `sandboxId`
- `sourceId`
- `environmentId`
- `deviceId`
- `label`
- `platform`
- `smtpHost`
- `smtpPort`
- `mailpitVersion`
- `runtimeStatus`
- `lastSeenAt`
- `createdAt`
- `updatedAt`

Indexes:

- by sandbox id
- by environment id
- by device id

### emailMessages

Normalized message envelope and UI state.

Fields:

- `userId`
- `sandboxId`
- `messageId`
- `sourceId`
- `mailpitMessageId`
- `idempotencyKey`
- `from`
- `to`
- `cc`
- `bcc`
- `replyTo`
- `subject`
- `receivedAt`
- `importedAt`
- `hasHtml`
- `hasText`
- `attachmentCount`
- `readAt`
- `deletedAt`

Indexes:

- by sandbox plus received time
- by sandbox plus recipient
- by sandbox plus subject search helper fields if needed
- by idempotency key

### emailMessageBodies

Body content with size caps.

Fields:

- `userId`
- `sandboxId`
- `messageId`
- `text`
- `html`
- `rawMimeUploadThingKey`
- `textTruncated`
- `htmlTruncated`
- `rawMimeStored`
- `createdAt`
- `updatedAt`

Policy:

- Store normal text/html inline in Convex within capped limits.
- Store raw MIME in UploadThing only when enabled and below configured limits.
- Never require raw MIME for the core inbox experience.

### emailMessageAttachments

Attachment metadata plus UploadThing storage pointers.

Fields:

- `userId`
- `sandboxId`
- `messageId`
- `attachmentId`
- `filename`
- `contentType`
- `sizeBytes`
- `sha256`
- `contentId`
- `disposition`
- `uploadThingKey`
- `uploadThingCustomId`
- `uploadStatus`: `pending | uploaded | failed | skipped | deleted`
- `skipReason`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes:

- by message id
- by sandbox id
- by upload status
- by UploadThing custom id

### emailMessageEvents

Audit trail for lifecycle and agent access.

Events:

- `imported`
- `body-synced`
- `attachment-uploaded`
- `attachment-skipped`
- `read`
- `deleted`
- `local-cache-cleared`
- `synced-history-cleared`
- `agent-inspected-message`
- `agent-downloaded-attachment`

### emailAgentAccessGrants

Project/thread-scoped read permission for agents.

Fields:

- `userId`
- `sandboxId`
- `logicalProjectKey`
- `environmentId`
- `projectId`
- `threadId`
- `enabled`
- `allowAttachmentDownload`
- `createdAt`
- `updatedAt`
- `revokedAt`

## UploadThing Attachment Storage

Use private UploadThing ACL by default.

Upload path:

```text
Mailpit attachment bytes
  -> pathwayOS importer
  -> UploadThing UTApi.uploadFiles with customId
  -> Convex attachment row stores key/customId/metadata
```

Access path on another device:

```text
Pathway app queries Convex
  -> user requests/open attachment
  -> pathwayOS requests short-lived signed URL
  -> device downloads/caches attachment locally
```

Required behaviors:

- Use deterministic custom IDs where possible, based on user, sandbox, message, attachment, and hash.
- Use private ACL unless a future user-facing share feature requires public access.
- Generate short-lived signed URLs for reads.
- Delete UploadThing files when synced sandbox history is cleared.
- Keep Convex metadata even when attachment upload is skipped, so the UI can explain what was omitted.

## Agent Email Access

Agent access is opt-in globally and overrideable per project.

The agent should not get raw database access. Expose a small read-only tool surface:

- wait for latest email by recipient, subject, or text
- list recent sandbox emails
- open one message body
- inspect attachment metadata
- download an attachment only when attachment access is enabled

Every agent read should append an `emailMessageEvents` row.

Use cases:

- Agent triggers a password reset flow and waits for the reset email.
- Agent validates an invite email subject/body.
- Agent clicks or extracts a link from a test email.
- Agent verifies attachment generation without needing to send real email.

## UX Requirements

The inbox must make source and project context obvious.

Inbox filters:

- all sandbox mail
- sandbox
- project
- machine/source
- unread
- has attachments

Message detail:

- envelope
- text body
- HTML preview
- raw source availability
- attachment list
- agent inspection history

Settings affordances:

- clear local cache explains that synced history remains.
- clear synced history explains that all synced devices lose the messages and UploadThing files are deleted.
- attachment sync explains UploadThing private storage and size limits.

## Implementation Phases

### Phase 1: Contracts and Plan Hardening

Deliverables:

- Add email sandbox schemas to shared contracts where cross-app usage requires it.
- Add Convex mailbox schema.
- Add docs for sandbox terminology and destructive actions.
- Decide exact UploadThing environment variables and secret handling.

Validation:

- Schema tests.
- Convex typecheck/codegen.

### Phase 2: Convex Mailbox Domain

Deliverables:

- Convex queries/mutations for sandboxes, project bindings, messages, bodies, attachments, events, and clear actions.
- Account-scoped authorization on every function.
- Retention cleanup job.

Validation:

- Convex unit tests for ownership, idempotent import, deletion, and retention.

### Phase 3: Local Runtime Manager

Deliverables:

- Mailpit binary resolution/install strategy.
- Runtime manager.
- Local SMTP router.
- Local cache and cursor persistence.
- Health/status surface for settings.

Validation:

- Runtime tests with mocked process runner.
- Port allocation tests.
- Cache clear tests.

### Phase 4: Importer and Attachment Sync

Deliverables:

- Mailpit importer.
- Idempotency key computation.
- UploadThing server-side attachment uploader.
- Retry handling for Convex and UploadThing failures.
- Attachment skipped states.

Validation:

- Fixture-based message import tests.
- Attachment upload success/failure tests.
- Offline retry tests.

### Phase 5: UI

Deliverables:

- `/settings/email` global controls.
- Project detail sheet controls.
- `/email` sandbox inbox.
- Message detail view.
- Clear local cache and clear synced history actions.

Validation:

- Component tests for settings state and destructive action copy.
- Browser checks for desktop and mobile widths.

### Phase 6: Agent Tooling

Deliverables:

- Read-only sandbox email tool surface.
- Global and project-level permission checks.
- Agent access audit events.
- Tool output optimized for validation workflows.

Validation:

- Agent permission tests.
- Tool tests for waiting, listing, and opening messages.
- Audit-event tests.

## Open Questions

1. Should the first implementation support password-protected SMTP routes, or is loopback-only enough?
2. Should raw MIME sync be enabled by default, or only text/html plus attachments?
3. Should project-bound sandbox creation happen on project creation, or lazily the first time the user opens project settings?
4. Should synced history clear be soft-delete first, with delayed UploadThing deletion, to allow undo?
5. Should attachment sync be disabled by default for very early builds until UploadThing usage limits are visible in the UI?

## Completion Criteria

- A user can enable email sandboxing globally.
- A user can enable or disable a sandbox for an individual project.
- A project exposes stable SMTP details.
- A test app can send email into the project sandbox.
- The message appears in `/email`.
- The message syncs to another signed-in pathwayOS install for the same user.
- Attachments sync through UploadThing and open on the second device through signed URLs.
- A user can clear local cache without deleting synced messages.
- A user can clear synced history and remove UploadThing attachment files.
- An enabled agent can inspect sandbox email for its project and produce audit events.
