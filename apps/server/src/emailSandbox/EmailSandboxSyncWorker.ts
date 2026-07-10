import {
  CloudBlobUploadPrepareResult,
  EmailCaptureId,
  EmailSandboxError,
  type EmailBlobStatus,
} from "@pathwayos/contracts";
import { convexHttpActionsUrl } from "@pathwayos/shared/convexUrl";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { RELAY_ENVIRONMENT_CREDENTIAL_SECRET } from "../cloud/config.ts";
import { convexUrlConfig } from "../cloud/publicConfig.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as EmailSandboxStore from "./EmailSandboxStore.ts";

const POLL_INTERVAL = "5 seconds";
const CAPTURE_BATCH_SIZE = 10;

const CaptureBatchResult = Schema.Struct({
  acceptedCaptureIds: Schema.Array(Schema.String),
  duplicateCaptureIds: Schema.Array(Schema.String),
});

const syncError = (cause: unknown) =>
  new EmailSandboxError({
    operation: "sync",
    reason: "upstream-unavailable",
    message: cause instanceof Error ? cause.message : String(cause),
  });

export class EmailSandboxSyncWorker extends Context.Service<
  EmailSandboxSyncWorker,
  {
    readonly syncOnce: Effect.Effect<boolean, EmailSandboxError>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("pathwayos/emailSandbox/EmailSandboxSyncWorker") {}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export function partitionCaptureAcknowledgements(
  captureIds: ReadonlyArray<EmailCaptureId>,
  result: {
    readonly acceptedCaptureIds: ReadonlyArray<string>;
    readonly duplicateCaptureIds: ReadonlyArray<string>;
  },
): {
  readonly synced: ReadonlyArray<EmailCaptureId>;
  readonly rejected: ReadonlyArray<EmailCaptureId>;
} {
  const acknowledged = new Set([...result.acceptedCaptureIds, ...result.duplicateCaptureIds]);
  return {
    synced: captureIds.filter((captureId) => acknowledged.has(captureId)),
    rejected: captureIds.filter((captureId) => !acknowledged.has(captureId)),
  };
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const httpClient = yield* HttpClient.HttpClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const settings = yield* ServerSettings.ServerSettingsService;
  const store = yield* EmailSandboxStore.EmailSandboxStore;
  const environmentId = yield* environment.getEnvironmentId;

  const readCredential = secrets
    .get(RELAY_ENVIRONMENT_CREDENTIAL_SECRET)
    .pipe(
      Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes).trim())),
      Effect.map(Option.filter((value) => value.length > 0)),
      Effect.mapError(syncError),
    );
  const readActionsUrl = convexUrlConfig.pipe(
    Effect.map(convexHttpActionsUrl),
    Effect.map(Option.fromNullishOr),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

  const postJson = <A>(
    url: string,
    credential: string,
    payload: unknown,
    schema: Schema.Decoder<A>,
  ) =>
    HttpClientRequest.post(url).pipe(
      HttpClientRequest.bearerToken(credential),
      HttpClientRequest.bodyJson(payload),
      Effect.flatMap(httpClient.execute),
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.mapError(syncError),
    );

  const postJsonDiscard = (url: string, credential: string, payload: unknown) =>
    HttpClientRequest.post(url).pipe(
      HttpClientRequest.bearerToken(credential),
      HttpClientRequest.bodyJson(payload),
      Effect.flatMap(httpClient.execute),
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.asVoid,
      Effect.mapError(syncError),
    );

  const uploadBlob = Effect.fn("EmailSandboxSyncWorker.uploadBlob")(function* (input: {
    readonly actionsUrl: string;
    readonly credential: string;
    readonly path: string;
    readonly blobKind: "email-raw-mime" | "email-attachment";
    readonly resourceId: string;
    readonly partId: string;
    readonly filename: string;
    readonly contentType: string;
  }) {
    const bytes = yield* fileSystem.readFile(input.path).pipe(Effect.mapError(syncError));
    const sha256 = yield* crypto
      .digest("SHA-256", bytes)
      .pipe(Effect.map(bytesToHex), Effect.mapError(syncError));
    const prepared = yield* postJson(
      `${input.actionsUrl}/v1/blobs/prepare`,
      input.credential,
      {
        environmentId,
        blobKind: input.blobKind,
        resourceId: input.resourceId,
        partId: input.partId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: bytes.byteLength,
        sha256,
      },
      CloudBlobUploadPrepareResult,
    );

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([Buffer.from(bytes)], { type: input.contentType }),
      input.filename,
    );
    const uploadRequest = HttpClientRequest.put(prepared.uploadUrl).pipe(
      HttpClientRequest.bodyFormData(formData),
      HttpClientRequest.setHeader("Range", "bytes=0-"),
      HttpClientRequest.setHeader("x-uploadthing-version", "7.7.4"),
    );
    yield* httpClient
      .execute(uploadRequest)
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.asVoid,
        Effect.mapError(syncError),
      );
    yield* postJsonDiscard(`${input.actionsUrl}/v1/blobs/commit`, input.credential, {
      environmentId,
      uploadId: prepared.uploadId,
      uploadThingKey: prepared.uploadThingKey,
    });
    return prepared.uploadId;
  });

  const syncOnce: EmailSandboxSyncWorker["Service"]["syncOnce"] = Effect.gen(function* () {
    const [credentialOption, actionsUrlOption] = yield* Effect.all([
      readCredential,
      readActionsUrl,
    ]);
    if (Option.isNone(credentialOption) || Option.isNone(actionsUrlOption)) return false;
    const credential = credentialOption.value;
    const actionsUrl = actionsUrlOption.value;
    const serverSettings = yield* settings.getSettings.pipe(Effect.mapError(syncError));
    const policy = {
      retentionDays: serverSettings.emailSandbox.retentionDays,
      retentionMaxMessages: serverSettings.emailSandbox.retentionMaxMessages,
      syncAttachments: serverSettings.emailSandbox.syncAttachments,
      attachmentMaxBytes: serverSettings.emailSandbox.attachmentMaxBytes,
    };
    const sources = yield* store.listSources(environmentId);
    if (sources.length > 0) {
      yield* postJsonDiscard(`${actionsUrl}/v1/email/sources/batch`, credential, {
        environmentId,
        sources: sources.map((source) => ({
          sourceId: source.sourceId,
          localProjectId: source.projectId,
          logicalProjectKey: source.logicalProjectKey,
          projectTitle: source.displayName,
          captureEnabled: source.captureEnabled,
          agentAccessEnabled: source.agentAccessEnabled,
          sourceStatus: source.status,
          smtpPort: source.smtpPort,
          lastError: source.lastError,
          sandboxPolicy: policy,
        })),
      });
    }

    const captures = yield* store.listPendingCaptureBatch(CAPTURE_BATCH_SIZE);
    if (captures.length === 0) return sources.length > 0;
    const messages = yield* Effect.forEach(
      captures,
      (capture) =>
        Effect.gen(function* () {
          let rawMimeStatus: EmailBlobStatus = "pending";
          let rawMimeUploadId: string | undefined;
          const rawUpload = yield* uploadBlob({
            actionsUrl,
            credential,
            path: capture.rawMimePath,
            blobKind: "email-raw-mime",
            resourceId: capture.message.summary.messageId,
            partId: "raw-mime",
            filename: `${capture.message.summary.messageId}.eml`,
            contentType: "message/rfc822",
          }).pipe(Effect.result);
          if (rawUpload._tag === "Success") {
            rawMimeStatus = "uploaded";
            rawMimeUploadId = rawUpload.success;
          } else {
            rawMimeStatus = "failed";
          }

          const attachments = yield* Effect.forEach(capture.attachments, (stored) =>
            Effect.gen(function* () {
              if (
                !policy.syncAttachments ||
                stored.attachment.sizeBytes > policy.attachmentMaxBytes
              ) {
                return {
                  ...stored.attachment,
                  blobStatus: "skipped" as const,
                  skipReason: !policy.syncAttachments
                    ? "Attachment sync is disabled."
                    : `Attachment exceeds the ${policy.attachmentMaxBytes} byte sync limit.`,
                };
              }
              const uploaded = yield* uploadBlob({
                actionsUrl,
                credential,
                path: stored.localPath,
                blobKind: "email-attachment",
                resourceId: capture.message.summary.messageId,
                partId: stored.attachment.attachmentId,
                filename: stored.attachment.filename,
                contentType: stored.attachment.contentType,
              }).pipe(Effect.result);
              return uploaded._tag === "Success"
                ? {
                    ...stored.attachment,
                    blobStatus: "uploaded" as const,
                    uploadId: uploaded.success,
                    skipReason: null,
                  }
                : {
                    ...stored.attachment,
                    blobStatus: "failed" as const,
                    skipReason: "Private attachment upload failed.",
                  };
            }),
          );
          return {
            captureId: capture.captureId,
            messageId: capture.message.summary.messageId,
            sourceId: capture.source.sourceId,
            localProjectId: capture.source.projectId,
            logicalProjectKey: capture.source.logicalProjectKey,
            projectTitle: capture.source.displayName,
            sourceStatus: capture.source.status,
            smtpPort: capture.source.smtpPort,
            captureEnabled: capture.source.captureEnabled,
            agentAccessEnabled: capture.source.agentAccessEnabled,
            sandboxPolicy: policy,
            receivedAt: capture.message.summary.receivedAt,
            from: capture.message.summary.from,
            to: capture.message.summary.to,
            cc: capture.message.cc,
            bcc: capture.message.bcc,
            replyTo: capture.message.replyTo,
            subject: capture.message.summary.subject,
            text: capture.message.text,
            html: capture.message.html,
            textTruncated: capture.message.textTruncated,
            htmlTruncated: capture.message.htmlTruncated,
            attachments,
            rawMimeStatus,
            ...(rawMimeUploadId === undefined ? {} : { rawMimeUploadId }),
          };
        }),
      { concurrency: 2 },
    );
    const result = yield* postJson(
      `${actionsUrl}/v1/email/captures/batch`,
      credential,
      { environmentId, messages },
      CaptureBatchResult,
    );
    const { synced, rejected } = partitionCaptureAcknowledgements(
      captures.map((capture) => capture.captureId),
      result,
    );
    if (synced.length > 0) yield* store.markCaptureBatchSynced(synced);
    if (rejected.length > 0) {
      yield* store.markCaptureBatchFailed(
        rejected,
        "Convex did not acknowledge the capture batch.",
      );
    }
    return true;
  }).pipe(
    Effect.catch((error) =>
      store.listPendingCaptureBatch(CAPTURE_BATCH_SIZE).pipe(
        Effect.flatMap((captures) =>
          captures.length === 0
            ? Effect.void
            : store.markCaptureBatchFailed(
                captures.map((capture) => EmailCaptureId.make(capture.captureId)),
                error.message,
              ),
        ),
        Effect.catch(() => Effect.void),
        Effect.andThen(Effect.fail(error)),
      ),
    ),
  );

  const start: EmailSandboxSyncWorker["Service"]["start"] = Effect.fn(
    "EmailSandboxSyncWorker.start",
  )(function* () {
    yield* Effect.gen(function* () {
      while (true) {
        yield* syncOnce.pipe(
          Effect.catch((error) =>
            Effect.logWarning("email sandbox cloud synchronization failed", {
              message: error.message,
            }),
          ),
        );
        yield* Effect.sleep(POLL_INTERVAL);
      }
    }).pipe(Effect.forkScoped);
  });

  return EmailSandboxSyncWorker.of({ syncOnce, start });
});

export const layer = Layer.effect(EmailSandboxSyncWorker, make);
