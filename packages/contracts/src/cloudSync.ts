import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  NonNegativeInt,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { OrchestrationEvent } from "./orchestration.ts";

export const CloudSyncBatch = Schema.Struct({
  environmentId: EnvironmentId,
  batchId: TrimmedNonEmptyString,
  sequenceFromExclusive: NonNegativeInt,
  sequenceToInclusive: NonNegativeInt,
  events: Schema.Array(OrchestrationEvent),
  createdAt: IsoDateTime,
});
export type CloudSyncBatch = typeof CloudSyncBatch.Type;

export const CloudSyncBatchResult = Schema.Struct({
  batchId: TrimmedNonEmptyString,
  acceptedThroughSequence: NonNegativeInt,
  duplicate: Schema.Boolean,
});
export type CloudSyncBatchResult = typeof CloudSyncBatchResult.Type;

export const CloudBlobKind = Schema.Literals([
  "email-raw-mime",
  "email-attachment",
  "chat-attachment",
  "project-icon",
  "checkpoint-diff",
]);
export type CloudBlobKind = typeof CloudBlobKind.Type;

export const CloudBlobUploadPrepareInput = Schema.Struct({
  environmentId: EnvironmentId,
  blobKind: CloudBlobKind,
  resourceId: TrimmedNonEmptyString,
  partId: TrimmedNonEmptyString,
  filename: Schema.String,
  contentType: TrimmedNonEmptyString,
  sizeBytes: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: TrimmedNonEmptyString,
});
export type CloudBlobUploadPrepareInput = typeof CloudBlobUploadPrepareInput.Type;

export const CloudBlobUploadPrepareResult = Schema.Struct({
  uploadId: TrimmedNonEmptyString,
  uploadUrl: TrimmedNonEmptyString,
  uploadThingKey: TrimmedNonEmptyString,
  customId: TrimmedNonEmptyString,
  expiresAt: IsoDateTime,
});
export type CloudBlobUploadPrepareResult = typeof CloudBlobUploadPrepareResult.Type;

export const CloudBlobUploadCommitInput = Schema.Struct({
  environmentId: EnvironmentId,
  uploadId: TrimmedNonEmptyString,
  uploadThingKey: TrimmedNonEmptyString,
});
export type CloudBlobUploadCommitInput = typeof CloudBlobUploadCommitInput.Type;

export class CloudSyncError extends Schema.TaggedErrorClass<CloudSyncError>()("CloudSyncError", {
  operation: Schema.Literals(["batch", "prepare-upload", "commit-upload", "download"]),
  reason: Schema.Literals([
    "unauthenticated",
    "unauthorized",
    "wrong-source",
    "sequence-conflict",
    "invalid-upload",
    "upstream-unavailable",
    "internal-error",
  ]),
  message: Schema.String,
}) {}
