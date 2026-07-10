"use node";

import {
  actionGeneric,
  internalActionGeneric,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { v, type Value } from "convex/values";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { generateUploadThingDownloadUrl, parseUploadThingToken } from "../src/uploadThingHttp.ts";

type ResolveArgs = Record<string, Value> & { messageId: string; attachmentId: string };
const resolveAttachmentReference = makeFunctionReference<"query", ResolveArgs, Value>(
  "email:resolveAttachmentDownload",
) as unknown as FunctionReference<"query", "public", ResolveArgs, Value>;

const listDeletingReference = makeFunctionReference(
  "blobUploads:listDeleting",
) as unknown as FunctionReference<
  "query",
  "internal",
  Record<string, never>,
  Array<{ blobReferenceId: string; uploadThingKey: string }>
>;
const markDeletedBatchReference = makeFunctionReference(
  "blobUploads:markDeletedBatch",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  { blobReferenceIds: Array<string> },
  number
>;

export const getAttachmentDownload = actionGeneric({
  args: { messageId: v.string(), attachmentId: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("available"),
      url: v.string(),
      expiresAt: v.string(),
      filename: v.string(),
      contentType: v.string(),
      sizeBytes: v.number(),
    }),
    v.object({ status: v.literal("unavailable"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const attachment = (await ctx.runQuery(resolveAttachmentReference, args)) as null | {
      uploadThingKey: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
    };
    if (attachment === null)
      return { status: "unavailable" as const, reason: "attachment-not-found" };
    const token = process.env.UPLOADTHING_TOKEN;
    if (token === undefined || token.length === 0)
      return { status: "unavailable" as const, reason: "uploadthing-not-configured" };
    const expiresIn = 5 * 60;
    const now = DateTime.nowUnsafe();
    const url = await generateUploadThingDownloadUrl({
      token,
      uploadThingKey: attachment.uploadThingKey,
      now: DateTime.toEpochMillis(now),
      expiresInSeconds: expiresIn,
    });
    const expiresAt = DateTime.formatIso(DateTime.add(now, { seconds: expiresIn }));
    return {
      status: "available" as const,
      url,
      expiresAt,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    };
  },
});

export const cleanupDeleting = internalActionGeneric({
  args: {},
  returns: v.object({ deleted: v.number(), deferred: v.number() }),
  handler: async (ctx) => {
    const references = await ctx.runQuery(listDeletingReference, {});
    if (references.length === 0) return { deleted: 0, deferred: 0 };
    const rawToken = process.env.UPLOADTHING_TOKEN;
    if (rawToken === undefined || rawToken.length === 0) {
      return { deleted: 0, deferred: references.length };
    }
    const token = parseUploadThingToken(rawToken);
    const deletedFromUploadThing = await Effect.runPromise(
      Effect.gen(function* () {
        const httpClient = yield* HttpClient.HttpClient;
        yield* HttpClientRequest.post("https://api.uploadthing.com/v6/deleteFiles").pipe(
          HttpClientRequest.setHeaders({
            "x-uploadthing-api-key": token.apiKey,
            "x-uploadthing-be-adapter": "server-sdk",
            "x-uploadthing-version": "7.7.4",
          }),
          HttpClientRequest.bodyJson({
            fileKeys: references.map((reference) => reference.uploadThingKey),
          }),
          Effect.flatMap(httpClient.execute),
          Effect.flatMap(HttpClientResponse.filterStatusOk),
        );
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.match({ onFailure: () => false, onSuccess: () => true }),
      ),
    );
    if (!deletedFromUploadThing) return { deleted: 0, deferred: references.length };
    const deleted = await ctx.runMutation(markDeletedBatchReference, {
      blobReferenceIds: references.map((reference) => reference.blobReferenceId),
    });
    return { deleted, deferred: references.length - deleted };
  },
});
