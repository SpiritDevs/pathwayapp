import {
  EmailAttachmentId,
  EmailAddress,
  EmailCaptureId,
  EmailMessageId,
  type EmailMessageAttachment,
  EmailMessageAttachment as EmailMessageAttachmentSchema,
  type EmailMessageDetail,
  type EmailMessageSummary,
  EmailSandboxError,
  EmailSandboxId,
  EmailSandboxSourceId,
  type EmailSandboxProjectSource,
  type EnvironmentId,
  type ProjectId,
} from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import * as ServerConfig from "../config.ts";
import type { ParsedMimeMessage } from "./MimeMessage.ts";
import { EMAIL_ATTACHMENT_SYNC_LIMIT_BYTES } from "./MimeMessage.ts";

const SourceRow = Schema.Struct({
  sourceId: Schema.String,
  sandboxId: Schema.NullOr(Schema.String),
  environmentId: Schema.String,
  projectId: Schema.String,
  logicalProjectKey: Schema.String,
  displayName: Schema.String,
  captureEnabled: Schema.Int,
  agentAccessEnabled: Schema.Int,
  smtpPort: Schema.NullOr(Schema.Int),
  portChanged: Schema.Int,
  status: Schema.String,
  lastError: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});

const MessageRow = Schema.Struct({
  messageId: Schema.String,
  captureId: Schema.String,
  sourceId: Schema.String,
  sandboxId: Schema.String,
  projectId: Schema.String,
  envelopeFrom: Schema.NullOr(Schema.String),
  envelopeToJson: Schema.String,
  fromJson: Schema.String,
  toJson: Schema.String,
  ccJson: Schema.String,
  bccJson: Schema.String,
  replyToJson: Schema.String,
  subject: Schema.String,
  receivedAt: Schema.String,
  textBody: Schema.NullOr(Schema.String),
  htmlBody: Schema.NullOr(Schema.String),
  textTruncated: Schema.Int,
  htmlTruncated: Schema.Int,
  attachmentsJson: Schema.String,
  rawMimePath: Schema.String,
  rawSizeBytes: Schema.Number,
  syncState: Schema.String,
  readAt: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
});

interface StoredAttachment extends EmailMessageAttachment {
  readonly localPath: string;
}

const StoredAttachmentSchema = Schema.Struct({
  ...EmailMessageAttachmentSchema.fields,
  localPath: Schema.String,
});
const EmailAddressesJson = Schema.fromJsonString(Schema.Array(EmailAddress));
const StoredAttachmentsJson = Schema.fromJsonString(Schema.Array(StoredAttachmentSchema));
const StringArrayJson = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeEmailAddressesJson = Schema.decodeUnknownOption(EmailAddressesJson);
const decodeStoredAttachmentsJson = Schema.decodeUnknownOption(StoredAttachmentsJson);
const decodeSourceRows = Schema.decodeUnknownOption(Schema.Array(SourceRow));
const decodeStringArrayJson = Schema.decodeUnknownOption(StringArrayJson);
const encodeEmailAddressesJson = Schema.encodeEffect(EmailAddressesJson);
const encodeStoredAttachmentsJson = Schema.encodeEffect(StoredAttachmentsJson);
const encodeStringArrayJson = Schema.encodeEffect(StringArrayJson);
const isEmailSandboxError = Schema.is(EmailSandboxError);

export interface CaptureEnvelope {
  readonly from: string | null;
  readonly to: ReadonlyArray<string>;
}

export interface PersistCaptureInput {
  readonly captureId: EmailCaptureId;
  readonly messageId: EmailMessageId;
  readonly source: EmailSandboxProjectSource;
  readonly receivedAt: string;
  readonly envelope: CaptureEnvelope;
  readonly raw: Uint8Array;
  readonly parsed: ParsedMimeMessage;
}

export interface EmailAttachmentContent {
  readonly attachment: EmailMessageAttachment;
  readonly bytes: Uint8Array;
}

export interface PendingCaptureAttachment {
  readonly attachment: EmailMessageAttachment;
  readonly localPath: string;
}

export interface PendingCaptureRecord {
  readonly captureId: EmailCaptureId;
  readonly source: EmailSandboxProjectSource;
  readonly message: EmailMessageDetail;
  readonly envelopeFrom: string | null;
  readonly envelopeTo: ReadonlyArray<string>;
  readonly rawMimePath: string;
  readonly rawSizeBytes: number;
  readonly attachments: ReadonlyArray<PendingCaptureAttachment>;
}

export const EMAIL_SANDBOX_LOCAL_LIMIT_BYTES = 1024 * 1024 * 1024;

export interface EmailAgentAuditRecord {
  readonly auditId: string;
  readonly createdAt: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threadId: string;
  readonly providerSessionId: string;
  readonly providerInstanceId: string;
  readonly tool: "email_sandbox_status" | "email_list" | "email_get" | "email_wait_for";
  readonly outcome: "success" | "denied" | "not_found" | "timeout" | "error";
  readonly messageId: string | null;
  readonly resultCount: number;
  readonly filterSummary: string | null;
}

export interface EmailSandboxStoreShape {
  readonly listSources: (
    environmentId: EnvironmentId,
    projectId?: ProjectId,
  ) => Effect.Effect<ReadonlyArray<EmailSandboxProjectSource>, EmailSandboxError>;
  readonly getSource: (
    environmentId: EnvironmentId,
    projectId: ProjectId,
  ) => Effect.Effect<EmailSandboxProjectSource | null, EmailSandboxError>;
  readonly saveSource: (
    source: EmailSandboxProjectSource,
  ) => Effect.Effect<EmailSandboxProjectSource, EmailSandboxError>;
  readonly persistCapture: (
    input: PersistCaptureInput,
  ) => Effect.Effect<EmailMessageDetail, EmailSandboxError>;
  readonly listMessages: (
    projectId?: ProjectId,
  ) => Effect.Effect<ReadonlyArray<EmailMessageSummary>, EmailSandboxError>;
  readonly getMessage: (
    messageId: EmailMessageId,
  ) => Effect.Effect<EmailMessageDetail | null, EmailSandboxError>;
  readonly markRead: (
    messageId: EmailMessageId,
    read: boolean,
  ) => Effect.Effect<EmailMessageDetail | null, EmailSandboxError>;
  readonly getAttachment: (
    attachmentId: EmailAttachmentId,
  ) => Effect.Effect<EmailAttachmentContent | null, EmailSandboxError>;
  readonly deleteMessage: (
    messageId: EmailMessageId,
  ) => Effect.Effect<{ readonly deleted: boolean }, EmailSandboxError>;
  readonly clearLocalCache: (projectId?: ProjectId) => Effect.Effect<
    {
      readonly clearedMessages: number;
      readonly retainedUnsyncedMessages: number;
      readonly reclaimedBytes: number;
    },
    EmailSandboxError
  >;
  readonly counts: Effect.Effect<
    {
      readonly activeProjectCount: number;
      readonly pendingMessageCount: number;
      readonly localBytes: number;
    },
    EmailSandboxError
  >;
  readonly listPendingCaptureBatch: (
    limit?: number,
  ) => Effect.Effect<ReadonlyArray<PendingCaptureRecord>, EmailSandboxError>;
  readonly markCaptureBatchSynced: (
    captureIds: ReadonlyArray<EmailCaptureId>,
  ) => Effect.Effect<void, EmailSandboxError>;
  readonly markCaptureBatchFailed: (
    captureIds: ReadonlyArray<EmailCaptureId>,
    message: string,
  ) => Effect.Effect<void, EmailSandboxError>;
  readonly appendAgentAudit: (
    record: EmailAgentAuditRecord,
  ) => Effect.Effect<void, EmailSandboxError>;
}

export class EmailSandboxStore extends Context.Service<EmailSandboxStore, EmailSandboxStoreShape>()(
  "pathwayos/emailSandbox/EmailSandboxStore",
) {}

const persistenceError = (
  operation: "configure-project" | "clear-local" | "import" | "sync",
  cause: unknown,
) =>
  new EmailSandboxError({
    operation,
    reason: "persistence-failed",
    message: cause instanceof Error ? cause.message : String(cause),
  });

const parseEmailAddresses = (value: string) =>
  Option.getOrElse(decodeEmailAddressesJson(value), () => []);
const parseStoredAttachments = (value: string): ReadonlyArray<StoredAttachment> =>
  Option.getOrElse(decodeStoredAttachmentsJson(value), () => []);

const sourceFromRow = (row: typeof SourceRow.Type): EmailSandboxProjectSource => ({
  sourceId: EmailSandboxSourceId.make(row.sourceId),
  sandboxId: row.sandboxId === null ? null : EmailSandboxId.make(row.sandboxId),
  environmentId: row.environmentId as EnvironmentId,
  projectId: row.projectId as ProjectId,
  logicalProjectKey: row.logicalProjectKey,
  displayName: row.displayName,
  captureEnabled: row.captureEnabled !== 0,
  agentAccessEnabled: row.agentAccessEnabled !== 0,
  smtpHost: "127.0.0.1",
  smtpPort: row.smtpPort,
  portChanged: row.portChanged !== 0,
  status: row.status as EmailSandboxProjectSource["status"],
  lastError: row.lastError,
  updatedAt: row.updatedAt,
});

const summaryFromRow = (row: typeof MessageRow.Type): EmailMessageSummary => {
  const attachments = parseStoredAttachments(row.attachmentsJson);
  return {
    messageId: EmailMessageId.make(row.messageId),
    sandboxId: EmailSandboxId.make(row.sandboxId),
    sourceId: EmailSandboxSourceId.make(row.sourceId),
    projectId: row.projectId as ProjectId,
    from: parseEmailAddresses(row.fromJson),
    to: parseEmailAddresses(row.toJson),
    subject: row.subject,
    receivedAt: row.receivedAt,
    readAt: row.readAt,
    attachmentCount: attachments.length,
    hasHtml: row.htmlBody !== null,
    hasText: row.textBody !== null,
    syncState: row.syncState as EmailMessageSummary["syncState"],
  };
};

const detailFromRow = (row: typeof MessageRow.Type): EmailMessageDetail => ({
  summary: summaryFromRow(row),
  cc: parseEmailAddresses(row.ccJson),
  bcc: parseEmailAddresses(row.bccJson),
  replyTo: parseEmailAddresses(row.replyToJson),
  text: row.textBody,
  html: row.htmlBody,
  textTruncated: row.textTruncated !== 0,
  htmlTruncated: row.htmlTruncated !== 0,
  rawMimeStatus: row.syncState === "synced" ? "uploaded" : "pending",
  attachments: parseStoredAttachments(row.attachmentsJson).map(
    ({ localPath: _localPath, ...attachment }) => attachment,
  ),
});

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const messagesDirectory = path.join(config.emailSandboxDir, "messages");
  const attachmentsDirectory = path.join(config.emailSandboxDir, "attachments");
  yield* Effect.all([
    fileSystem.makeDirectory(messagesDirectory, { recursive: true }),
    fileSystem.makeDirectory(attachmentsDirectory, { recursive: true }),
  ]);

  const querySources = SqlSchema.findAll({
    Request: Schema.Struct({
      environmentId: Schema.String,
      projectId: Schema.NullOr(Schema.String),
    }),
    Result: SourceRow,
    execute: ({ environmentId, projectId }) => sql`
      SELECT
        source_id AS "sourceId",
        sandbox_id AS "sandboxId",
        environment_id AS "environmentId",
        project_id AS "projectId",
        logical_project_key AS "logicalProjectKey",
        display_name AS "displayName",
        capture_enabled AS "captureEnabled",
        agent_access_enabled AS "agentAccessEnabled",
        smtp_port AS "smtpPort",
        port_changed AS "portChanged",
        status,
        last_error AS "lastError",
        updated_at AS "updatedAt"
      FROM email_sandbox_project_sources
      WHERE environment_id = ${environmentId}
        AND (${projectId} IS NULL OR project_id = ${projectId})
      ORDER BY display_name COLLATE NOCASE, project_id
    `,
  });

  const listSources: EmailSandboxStoreShape["listSources"] = (environmentId, projectId) =>
    querySources({ environmentId, projectId: projectId ?? null }).pipe(
      Effect.map((rows) => rows.map(sourceFromRow)),
      Effect.mapError((cause) => persistenceError("configure-project", cause)),
    );

  const getSource: EmailSandboxStoreShape["getSource"] = (environmentId, projectId) =>
    listSources(environmentId, projectId).pipe(Effect.map((sources) => sources[0] ?? null));

  const saveSource: EmailSandboxStoreShape["saveSource"] = Effect.fn(
    "EmailSandboxStore.saveSource",
  )(
    function* (source) {
      yield* sql`
        INSERT INTO email_sandbox_project_sources (
          source_id, sandbox_id, environment_id, project_id, logical_project_key,
          display_name, capture_enabled, agent_access_enabled, smtp_port, port_changed, status, last_error, updated_at
        ) VALUES (
          ${source.sourceId}, ${source.sandboxId}, ${source.environmentId}, ${source.projectId},
          ${source.logicalProjectKey}, ${source.displayName}, ${source.captureEnabled ? 1 : 0},
          ${source.agentAccessEnabled ? 1 : 0},
          ${source.smtpPort}, ${source.portChanged ? 1 : 0}, ${source.status},
          ${source.lastError}, ${source.updatedAt}
        )
        ON CONFLICT(environment_id, project_id) DO UPDATE SET
          sandbox_id = excluded.sandbox_id,
          logical_project_key = excluded.logical_project_key,
          display_name = excluded.display_name,
          capture_enabled = excluded.capture_enabled,
          agent_access_enabled = excluded.agent_access_enabled,
          smtp_port = excluded.smtp_port,
          port_changed = excluded.port_changed,
          status = excluded.status,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `;
      const saved = yield* getSource(source.environmentId, source.projectId);
      if (!saved) throw new Error("Email sandbox source was not persisted.");
      return saved;
    },
    Effect.mapError((cause) => persistenceError("configure-project", cause)),
  );

  const queryMessages = SqlSchema.findAll({
    Request: Schema.Struct({
      projectId: Schema.NullOr(Schema.String),
      messageId: Schema.NullOr(Schema.String),
    }),
    Result: MessageRow,
    execute: ({ projectId, messageId }) => sql`
      SELECT
        message_id AS "messageId",
        capture_id AS "captureId",
        source_id AS "sourceId",
        sandbox_id AS "sandboxId",
        project_id AS "projectId",
        envelope_from AS "envelopeFrom",
        envelope_to_json AS "envelopeToJson",
        from_json AS "fromJson",
        to_json AS "toJson",
        cc_json AS "ccJson",
        bcc_json AS "bccJson",
        reply_to_json AS "replyToJson",
        subject,
        received_at AS "receivedAt",
        text_body AS "textBody",
        html_body AS "htmlBody",
        text_truncated AS "textTruncated",
        html_truncated AS "htmlTruncated",
        attachments_json AS "attachmentsJson",
        raw_mime_path AS "rawMimePath",
        raw_size_bytes AS "rawSizeBytes",
        sync_state AS "syncState",
        read_at AS "readAt",
        last_error AS "lastError"
      FROM email_sandbox_messages
      WHERE (${projectId} IS NULL OR project_id = ${projectId})
        AND (${messageId} IS NULL OR message_id = ${messageId})
      ORDER BY received_at DESC
    `,
  });

  const persistCapture: EmailSandboxStoreShape["persistCapture"] = Effect.fn(
    "EmailSandboxStore.persistCapture",
  )(
    function* (input) {
      const existingRows = yield* queryMessages({ projectId: null, messageId: null });
      const existingBytes = existingRows.reduce(
        (total, row) =>
          total +
          row.rawSizeBytes +
          parseStoredAttachments(row.attachmentsJson).reduce(
            (attachmentTotal, attachment) => attachmentTotal + attachment.sizeBytes,
            0,
          ),
        0,
      );
      const incomingBytes =
        input.raw.byteLength +
        input.parsed.attachments.reduce(
          (total, attachment) => total + attachment.bytes.byteLength,
          0,
        );
      if (existingBytes + incomingBytes > EMAIL_SANDBOX_LOCAL_LIMIT_BYTES) {
        return yield* new EmailSandboxError({
          operation: "import",
          reason: "storage-limit",
          message: "The email sandbox has reached its 1 GB local storage limit.",
        });
      }
      const rawPath = path.join(messagesDirectory, `${input.captureId}.eml`);
      const storedAttachments: Array<StoredAttachment> = [];
      const writtenPaths: Array<string> = [];
      yield* fileSystem.writeFile(rawPath, input.raw);
      writtenPaths.push(rawPath);
      for (const [index, attachment] of input.parsed.attachments.entries()) {
        const attachmentId = EmailAttachmentId.make(`${input.captureId}:${index}`);
        const localPath = path.join(attachmentsDirectory, `${input.captureId}-${index}.bin`);
        yield* fileSystem.writeFile(localPath, attachment.bytes);
        writtenPaths.push(localPath);
        storedAttachments.push({
          attachmentId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          disposition: attachment.disposition,
          contentId: attachment.contentId,
          sizeBytes: attachment.bytes.byteLength,
          sha256: attachment.sha256,
          blobStatus:
            attachment.bytes.byteLength <= EMAIL_ATTACHMENT_SYNC_LIMIT_BYTES
              ? "pending"
              : "skipped",
          skipReason:
            attachment.bytes.byteLength <= EMAIL_ATTACHMENT_SYNC_LIMIT_BYTES
              ? null
              : "Attachment exceeds the 10 MB cloud sync limit.",
          localPath,
        });
      }
      const insertResult = yield* sql`
        INSERT INTO email_sandbox_messages (
          message_id, capture_id, source_id, sandbox_id, project_id,
          envelope_from, envelope_to_json, from_json, to_json, cc_json, bcc_json,
          reply_to_json, subject, received_at, text_body, html_body,
          text_truncated, html_truncated, attachments_json, raw_mime_path,
          raw_size_bytes, sync_state, read_at, last_error
        ) VALUES (
          ${input.messageId}, ${input.captureId}, ${input.source.sourceId}, ${input.source.sandboxId},
          ${input.source.projectId}, ${input.envelope.from}, ${yield* encodeStringArrayJson(input.envelope.to)},
          ${yield* encodeEmailAddressesJson(input.parsed.from)}, ${yield* encodeEmailAddressesJson(input.parsed.to)},
          ${yield* encodeEmailAddressesJson(input.parsed.cc)}, ${yield* encodeEmailAddressesJson(input.parsed.bcc)},
          ${yield* encodeEmailAddressesJson(input.parsed.replyTo)}, ${input.parsed.subject}, ${input.receivedAt},
          ${input.parsed.text}, ${input.parsed.html}, ${input.parsed.textTruncated ? 1 : 0},
          ${input.parsed.htmlTruncated ? 1 : 0}, ${yield* encodeStoredAttachmentsJson(storedAttachments)}, ${rawPath},
          ${input.raw.byteLength}, 'pending', NULL, NULL
        )
      `.pipe(Effect.result);
      if (insertResult._tag === "Failure") {
        yield* Effect.forEach(writtenPaths, (filePath) =>
          fileSystem.remove(filePath).pipe(Effect.ignore),
        );
        return yield* persistenceError("import", insertResult.failure);
      }
      const rows = yield* queryMessages({ projectId: null, messageId: input.messageId });
      const row = rows[0];
      if (!row)
        return yield* persistenceError("import", new Error("Captured message was not indexed."));
      return detailFromRow(row);
    },
    Effect.mapError((cause) =>
      isEmailSandboxError(cause) ? cause : persistenceError("import", cause),
    ),
  );

  const listMessages: EmailSandboxStoreShape["listMessages"] = (projectId) =>
    queryMessages({ projectId: projectId ?? null, messageId: null }).pipe(
      Effect.map((rows) => rows.map(summaryFromRow)),
      Effect.mapError((cause) => persistenceError("import", cause)),
    );

  const getMessage: EmailSandboxStoreShape["getMessage"] = (messageId) =>
    queryMessages({ projectId: null, messageId }).pipe(
      Effect.map((rows) => (rows[0] ? detailFromRow(rows[0]) : null)),
      Effect.mapError((cause) => persistenceError("import", cause)),
    );

  const markRead: EmailSandboxStoreShape["markRead"] = Effect.fn("EmailSandboxStore.markRead")(
    function* (messageId, read) {
      const readAt = read ? DateTime.formatIso(DateTime.nowUnsafe()) : null;
      yield* sql`
        UPDATE email_sandbox_messages
        SET read_at = ${readAt}
        WHERE message_id = ${messageId}
      `;
      return yield* getMessage(messageId);
    },
    Effect.mapError((cause) =>
      isEmailSandboxError(cause)
        ? cause
        : new EmailSandboxError({
            operation: "mark-read",
            reason: "persistence-failed",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
    ),
  );

  const getAttachment: EmailSandboxStoreShape["getAttachment"] = Effect.fn(
    "EmailSandboxStore.getAttachment",
  )(
    function* (attachmentId) {
      const rows = yield* queryMessages({ projectId: null, messageId: null });
      for (const row of rows) {
        const attachments = parseStoredAttachments(row.attachmentsJson);
        const stored = attachments.find((item) => item.attachmentId === attachmentId);
        if (!stored) continue;
        const bytes = yield* fileSystem.readFile(stored.localPath);
        const { localPath: _localPath, ...attachment } = stored;
        return { attachment, bytes };
      }
      return null;
    },
    Effect.mapError((cause) => persistenceError("import", cause)),
  );

  const deleteMessage: EmailSandboxStoreShape["deleteMessage"] = Effect.fn(
    "EmailSandboxStore.deleteMessage",
  )(
    function* (messageId) {
      const rows = yield* queryMessages({ projectId: null, messageId });
      const row = rows[0];
      if (!row) return { deleted: false };
      yield* fileSystem.remove(row.rawMimePath).pipe(Effect.ignore);
      for (const attachment of parseStoredAttachments(row.attachmentsJson)) {
        yield* fileSystem.remove(attachment.localPath).pipe(Effect.ignore);
      }
      yield* sql`DELETE FROM email_sandbox_messages WHERE message_id = ${row.messageId}`;
      return { deleted: true };
    },
    Effect.mapError((cause) => persistenceError("clear-local", cause)),
  );

  const clearLocalCache: EmailSandboxStoreShape["clearLocalCache"] = Effect.fn(
    "EmailSandboxStore.clearLocalCache",
  )(
    function* (projectId) {
      const rows = yield* queryMessages({ projectId: projectId ?? null, messageId: null });
      const removable = rows.filter(
        (row) => row.syncState === "synced" || row.syncState === "deleted",
      );
      const retainedUnsyncedMessages = rows.length - removable.length;
      let reclaimedBytes = 0;
      for (const row of removable) {
        reclaimedBytes += row.rawSizeBytes;
        yield* fileSystem.remove(row.rawMimePath).pipe(Effect.ignore);
        for (const attachment of parseStoredAttachments(row.attachmentsJson)) {
          reclaimedBytes += attachment.sizeBytes;
          yield* fileSystem.remove(attachment.localPath).pipe(Effect.ignore);
        }
        yield* sql`DELETE FROM email_sandbox_messages WHERE message_id = ${row.messageId}`;
      }
      return {
        clearedMessages: removable.length,
        retainedUnsyncedMessages,
        reclaimedBytes,
      };
    },
    Effect.mapError((cause) => persistenceError("clear-local", cause)),
  );

  const counts: EmailSandboxStoreShape["counts"] = Effect.gen(function* () {
    const [activeRows, pendingRows, messages] = yield* Effect.all([
      sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM email_sandbox_project_sources
        WHERE capture_enabled = 1 AND status = 'running'
      `,
      sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM email_sandbox_messages
        WHERE sync_state IN ('local', 'pending', 'failed')
      `,
      queryMessages({ projectId: null, messageId: null }),
    ]);
    const localBytes = messages.reduce(
      (total, row) =>
        total +
        row.rawSizeBytes +
        parseStoredAttachments(row.attachmentsJson).reduce(
          (attachmentTotal, attachment) => attachmentTotal + attachment.sizeBytes,
          0,
        ),
      0,
    );
    return {
      activeProjectCount: Number(activeRows[0]?.count ?? 0),
      pendingMessageCount: Number(pendingRows[0]?.count ?? 0),
      localBytes,
    };
  }).pipe(Effect.mapError((cause) => persistenceError("import", cause)));

  const listPendingCaptureBatch: EmailSandboxStoreShape["listPendingCaptureBatch"] = (limit = 50) =>
    queryMessages({ projectId: null, messageId: null }).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(
          rows
            .filter((row) => row.syncState === "pending" || row.syncState === "failed")
            .slice(0, Math.max(1, Math.min(200, Math.floor(limit)))),
          Effect.fn("EmailSandboxStore.pendingCaptureFromRow")(function* (row) {
            const sourceRows = yield* sql<Record<string, unknown>>`
              SELECT
                source_id AS "sourceId", sandbox_id AS "sandboxId",
                environment_id AS "environmentId", project_id AS "projectId",
                logical_project_key AS "logicalProjectKey", display_name AS "displayName",
                capture_enabled AS "captureEnabled", agent_access_enabled AS "agentAccessEnabled",
                smtp_port AS "smtpPort", port_changed AS "portChanged", status,
                last_error AS "lastError", updated_at AS "updatedAt"
              FROM email_sandbox_project_sources
              WHERE source_id = ${row.sourceId}
              LIMIT 1
            `;
            const decodedSource = Option.getOrElse(decodeSourceRows(sourceRows), () => [])[0];
            if (!decodedSource) {
              return yield* persistenceError(
                "sync",
                new Error(`Email source ${row.sourceId} is missing for capture ${row.captureId}.`),
              );
            }
            return {
              captureId: EmailCaptureId.make(row.captureId),
              source: sourceFromRow(decodedSource),
              message: detailFromRow(row),
              envelopeFrom: row.envelopeFrom,
              envelopeTo: Option.getOrElse(decodeStringArrayJson(row.envelopeToJson), () => []),
              rawMimePath: row.rawMimePath,
              rawSizeBytes: row.rawSizeBytes,
              attachments: parseStoredAttachments(row.attachmentsJson).map(
                ({ localPath, ...attachment }) => ({ attachment, localPath }),
              ),
            } satisfies PendingCaptureRecord;
          }),
        ),
      ),
      Effect.mapError((cause) => persistenceError("sync", cause)),
    );

  const markCaptureBatch = Effect.fn("EmailSandboxStore.markCaptureBatch")(
    function* (
      captureIds: ReadonlyArray<EmailCaptureId>,
      syncState: "synced" | "failed",
      message: string | null,
    ) {
      yield* sql.withTransaction(
        Effect.forEach(
          captureIds,
          (captureId) =>
            sql`
          UPDATE email_sandbox_messages
          SET sync_state = ${syncState}, last_error = ${message}
          WHERE capture_id = ${captureId}
        `,
        ),
      );
    },
    Effect.mapError((cause) => persistenceError("sync", cause)),
  );

  const markCaptureBatchSynced: EmailSandboxStoreShape["markCaptureBatchSynced"] = (captureIds) =>
    markCaptureBatch(captureIds, "synced", null).pipe(Effect.asVoid);
  const markCaptureBatchFailed: EmailSandboxStoreShape["markCaptureBatchFailed"] = (
    captureIds,
    message,
  ) => markCaptureBatch(captureIds, "failed", message).pipe(Effect.asVoid);

  const appendAgentAudit: EmailSandboxStoreShape["appendAgentAudit"] = (record) =>
    sql`
      INSERT INTO email_sandbox_agent_audit (
        audit_id, created_at, environment_id, project_id, thread_id,
        provider_session_id, provider_instance_id, tool, outcome,
        message_id, result_count, filter_summary
      ) VALUES (
        ${record.auditId}, ${record.createdAt}, ${record.environmentId}, ${record.projectId},
        ${record.threadId}, ${record.providerSessionId}, ${record.providerInstanceId},
        ${record.tool}, ${record.outcome}, ${record.messageId}, ${record.resultCount},
        ${record.filterSummary}
      )
    `.pipe(
      Effect.asVoid,
      Effect.mapError((cause) => persistenceError("import", cause)),
    );

  return EmailSandboxStore.of({
    listSources,
    getSource,
    saveSource,
    persistCapture,
    listMessages,
    getMessage,
    markRead,
    getAttachment,
    deleteMessage,
    clearLocalCache,
    counts,
    listPendingCaptureBatch,
    markCaptureBatchSynced,
    markCaptureBatchFailed,
    appendAgentAudit,
  });
});

export const layer = Layer.effect(EmailSandboxStore, make);

export const localSourceIdentifiers = (
  environmentId: EnvironmentId,
  projectId: ProjectId,
): { readonly sourceId: EmailSandboxSourceId; readonly sandboxId: EmailSandboxId } => ({
  sourceId: EmailSandboxSourceId.make(`local:${environmentId}:${projectId}`),
  sandboxId: EmailSandboxId.make(`local:${environmentId}:${projectId}`),
});

export const nowIso = (): string => DateTime.formatIso(DateTime.nowUnsafe());
