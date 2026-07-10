import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  PortSchema,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const makeEmailId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const EmailSandboxId = makeEmailId("EmailSandboxId");
export type EmailSandboxId = typeof EmailSandboxId.Type;

export const EmailSandboxSourceId = makeEmailId("EmailSandboxSourceId");
export type EmailSandboxSourceId = typeof EmailSandboxSourceId.Type;

export const EmailMessageId = makeEmailId("EmailMessageId");
export type EmailMessageId = typeof EmailMessageId.Type;

export const EmailAttachmentId = makeEmailId("EmailAttachmentId");
export type EmailAttachmentId = typeof EmailAttachmentId.Type;

export const EmailCaptureId = makeEmailId("EmailCaptureId");
export type EmailCaptureId = typeof EmailCaptureId.Type;

export const EmailSandboxRuntimePhase = Schema.Literals([
  "disabled",
  "installing",
  "starting",
  "running",
  "degraded",
  "failed",
]);
export type EmailSandboxRuntimePhase = typeof EmailSandboxRuntimePhase.Type;

export const EmailSandboxRuntimeStatus = Schema.Struct({
  phase: EmailSandboxRuntimePhase,
  enabled: Schema.Boolean,
  mailpitVersion: Schema.NullOr(TrimmedNonEmptyString),
  pid: Schema.NullOr(Schema.Int),
  activeProjectCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  pendingMessageCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  localBytes: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  localByteLimit: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1)),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type EmailSandboxRuntimeStatus = typeof EmailSandboxRuntimeStatus.Type;

export const EmailSandboxProjectSource = Schema.Struct({
  sourceId: EmailSandboxSourceId,
  sandboxId: Schema.NullOr(EmailSandboxId),
  environmentId: EnvironmentId,
  projectId: ProjectId,
  logicalProjectKey: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  captureEnabled: Schema.Boolean,
  agentAccessEnabled: Schema.Boolean,
  smtpHost: Schema.Literal("127.0.0.1"),
  smtpPort: Schema.NullOr(PortSchema),
  portChanged: Schema.Boolean,
  status: Schema.Literals(["disabled", "starting", "running", "conflict", "failed"]),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type EmailSandboxProjectSource = typeof EmailSandboxProjectSource.Type;

export const EmailSandboxSetProjectCaptureInput = Schema.Struct({
  projectId: ProjectId,
  enabled: Schema.Boolean,
  agentAccessEnabled: Schema.optional(Schema.Boolean),
  logicalProjectKey: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
});
export type EmailSandboxSetProjectCaptureInput = typeof EmailSandboxSetProjectCaptureInput.Type;

export const EmailSandboxListProjectSourcesInput = Schema.Struct({
  projectId: Schema.optional(ProjectId),
});

export const EmailSandboxClearLocalInput = Schema.Struct({
  projectId: Schema.optional(ProjectId),
});

export const EmailSandboxClearLocalResult = Schema.Struct({
  clearedMessages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  retainedUnsyncedMessages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  reclaimedBytes: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type EmailSandboxClearLocalResult = typeof EmailSandboxClearLocalResult.Type;

export const EmailAddress = Schema.Struct({
  name: Schema.NullOr(TrimmedString),
  address: TrimmedNonEmptyString,
});
export type EmailAddress = typeof EmailAddress.Type;

export const EmailBlobStatus = Schema.Literals([
  "pending",
  "uploaded",
  "failed",
  "skipped",
  "deleting",
  "deleted",
]);
export type EmailBlobStatus = typeof EmailBlobStatus.Type;

export const EmailMessageSummary = Schema.Struct({
  messageId: EmailMessageId,
  sandboxId: EmailSandboxId,
  sourceId: EmailSandboxSourceId,
  projectId: Schema.NullOr(ProjectId),
  from: Schema.Array(EmailAddress),
  to: Schema.Array(EmailAddress),
  subject: Schema.String,
  receivedAt: IsoDateTime,
  readAt: Schema.NullOr(IsoDateTime),
  attachmentCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  hasHtml: Schema.Boolean,
  hasText: Schema.Boolean,
  syncState: Schema.Literals(["local", "pending", "synced", "failed", "deleted"]),
});
export type EmailMessageSummary = typeof EmailMessageSummary.Type;

export const EmailMessageAttachment = Schema.Struct({
  attachmentId: EmailAttachmentId,
  filename: Schema.String,
  contentType: TrimmedNonEmptyString,
  disposition: Schema.Literals(["attachment", "inline", "unknown"]),
  contentId: Schema.NullOr(Schema.String),
  sizeBytes: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Schema.NullOr(TrimmedNonEmptyString),
  blobStatus: EmailBlobStatus,
  skipReason: Schema.NullOr(Schema.String),
});
export type EmailMessageAttachment = typeof EmailMessageAttachment.Type;

export const EmailMessageDetail = Schema.Struct({
  summary: EmailMessageSummary,
  cc: Schema.Array(EmailAddress),
  bcc: Schema.Array(EmailAddress),
  replyTo: Schema.Array(EmailAddress),
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
  textTruncated: Schema.Boolean,
  htmlTruncated: Schema.Boolean,
  rawMimeStatus: EmailBlobStatus,
  attachments: Schema.Array(EmailMessageAttachment),
});
export type EmailMessageDetail = typeof EmailMessageDetail.Type;

export const EmailMessageListInput = Schema.Struct({
  projectId: Schema.optional(ProjectId),
  query: Schema.optional(TrimmedString),
  unreadOnly: Schema.optional(Schema.Boolean),
  receivedAfter: Schema.optional(IsoDateTime),
  receivedBefore: Schema.optional(IsoDateTime),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  cursor: Schema.optional(TrimmedNonEmptyString),
});
export type EmailMessageListInput = typeof EmailMessageListInput.Type;

export const EmailMessageListResult = Schema.Struct({
  messages: Schema.Array(EmailMessageSummary),
  nextCursor: Schema.NullOr(TrimmedNonEmptyString),
});
export type EmailMessageListResult = typeof EmailMessageListResult.Type;

export const EmailMessageGetInput = Schema.Struct({
  messageId: EmailMessageId,
});
export type EmailMessageGetInput = typeof EmailMessageGetInput.Type;

export const EmailMessageMarkReadInput = Schema.Struct({
  messageId: EmailMessageId,
  read: Schema.Boolean,
});
export type EmailMessageMarkReadInput = typeof EmailMessageMarkReadInput.Type;

export const EmailMessageDeleteInput = Schema.Struct({
  messageId: EmailMessageId,
});
export type EmailMessageDeleteInput = typeof EmailMessageDeleteInput.Type;

export const EmailMessageDeleteResult = Schema.Struct({
  deleted: Schema.Boolean,
});
export type EmailMessageDeleteResult = typeof EmailMessageDeleteResult.Type;

export const EmailAttachmentGetInput = Schema.Struct({
  messageId: EmailMessageId,
  attachmentId: EmailAttachmentId,
});
export type EmailAttachmentGetInput = typeof EmailAttachmentGetInput.Type;

export const EmailAttachmentPayload = Schema.Struct({
  attachment: EmailMessageAttachment,
  contentBase64: Schema.String,
});
export type EmailAttachmentPayload = typeof EmailAttachmentPayload.Type;

export class EmailSandboxError extends Schema.TaggedErrorClass<EmailSandboxError>()(
  "EmailSandboxError",
  {
    operation: Schema.Literals([
      "install",
      "start",
      "stop",
      "status",
      "configure-project",
      "clear-local",
      "list-messages",
      "get-message",
      "mark-read",
      "import",
      "sync",
    ]),
    reason: Schema.Literals([
      "unsupported-platform",
      "download-failed",
      "checksum-mismatch",
      "binary-invalid",
      "port-conflict",
      "process-failed",
      "storage-limit",
      "not-found",
      "persistence-failed",
      "upstream-unavailable",
      "internal-error",
    ]),
    message: Schema.String,
  },
) {}

export const EmailAgentAccessPolicy = Schema.Struct({
  messageBodiesEnabled: Schema.Boolean,
  attachmentsEnabled: Schema.Boolean,
});
export type EmailAgentAccessPolicy = typeof EmailAgentAccessPolicy.Type;

export const DEFAULT_EMAIL_AGENT_ACCESS_POLICY: EmailAgentAccessPolicy = {
  messageBodiesEnabled: true,
  attachmentsEnabled: true,
};

export const EmailAgentToolName = Schema.Literals([
  "email_sandbox_status",
  "email_list",
  "email_get",
  "email_wait_for",
]);
export type EmailAgentToolName = typeof EmailAgentToolName.Type;

export const EmailAgentSandboxStatus = Schema.Struct({
  projectId: ProjectId,
  runtime: EmailSandboxRuntimeStatus,
  source: EmailSandboxProjectSource,
});
export type EmailAgentSandboxStatus = typeof EmailAgentSandboxStatus.Type;

export const EmailAgentListInput = Schema.Struct({
  subject: Schema.optional(TrimmedString).annotate({
    description: "Case-insensitive subject substring.",
  }),
  recipient: Schema.optional(TrimmedString).annotate({
    description: "Case-insensitive recipient name or address substring.",
  }),
  unreadOnly: Schema.optional(Schema.Boolean),
  receivedAfter: Schema.optional(IsoDateTime),
  limit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })).annotate({
      description: "Maximum messages to return. Defaults to 25 and cannot exceed 100.",
    }),
  ),
});
export type EmailAgentListInput = typeof EmailAgentListInput.Type;

export const EmailAgentWaitForInput = Schema.Struct({
  subject: Schema.optional(TrimmedNonEmptyString).annotate({
    description: "Case-insensitive subject substring to wait for.",
  }),
  recipient: Schema.optional(TrimmedNonEmptyString).annotate({
    description: "Case-insensitive recipient name or address substring to wait for.",
  }),
  receivedAfter: Schema.optional(IsoDateTime),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 60_000 })).annotate({
      description: "Wait timeout in milliseconds. Defaults to 15000; maximum 60000.",
    }),
  ),
}).check(
  Schema.makeFilter(
    (input) =>
      input.subject !== undefined ||
      input.recipient !== undefined ||
      "Provide subject and/or recipient to wait for.",
  ),
);
export type EmailAgentWaitForInput = typeof EmailAgentWaitForInput.Type;

export class EmailAgentAccessError extends Schema.TaggedErrorClass<EmailAgentAccessError>()(
  "EmailAgentAccessError",
  {
    operation: EmailAgentToolName,
    reason: Schema.Literals([
      "capability-denied",
      "global-access-disabled",
      "thread-not-found",
      "thread-has-no-project",
      "project-source-not-found",
      "project-access-disabled",
      "message-not-found",
      "timeout",
      "persistence-failed",
    ]),
    environmentId: EnvironmentId,
    threadId: ThreadId,
    providerSessionId: TrimmedNonEmptyString,
    providerInstanceId: ProviderInstanceId,
    message: Schema.String,
  },
) {}

export const EmailAgentToolError = Schema.Union([EmailAgentAccessError, EmailSandboxError]);
export type EmailAgentToolError = typeof EmailAgentToolError.Type;
