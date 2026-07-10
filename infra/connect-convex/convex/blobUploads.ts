import {
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  assertCreatorOwnedResource,
  requireConnectUser,
  requireTenantMembership,
} from "./authorization.ts";
import { requireEnvironmentPrincipal } from "./environmentAuthorization.ts";

const blobKindValidator = v.union(
  v.literal("email-raw-mime"),
  v.literal("email-attachment"),
  v.literal("chat-attachment"),
  v.literal("project-icon"),
  v.literal("checkpoint-diff"),
);

const MAX_UPLOAD_BYTES: Record<string, number> = {
  "email-raw-mime": 25 * 1024 * 1024,
  "email-attachment": 10 * 1024 * 1024,
  "chat-attachment": 10 * 1024 * 1024,
  "project-icon": 5 * 1024 * 1024,
  "checkpoint-diff": 10 * 1024 * 1024,
};

export const prepare = internalMutationGeneric({
  args: {
    credentialHash: v.string(),
    environmentId: v.string(),
    blobKind: blobKindValidator,
    resourceId: v.string(),
    partId: v.string(),
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.string(),
  },
  returns: v.object({ uploadId: v.string(), customId: v.string(), expiresAt: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const limit = MAX_UPLOAD_BYTES[args.blobKind] ?? 0;
    if (!Number.isSafeInteger(args.sizeBytes) || args.sizeBytes < 0 || args.sizeBytes > limit)
      throw new Error("BLOB_SIZE_INVALID");
    if (!/^[a-f0-9]{64}$/i.test(args.sha256)) throw new Error("BLOB_SHA256_INVALID");
    const nowValue = DateTime.nowUnsafe();
    const now = DateTime.formatIso(nowValue);
    const expiresAt = DateTime.formatIso(DateTime.add(nowValue, { minutes: 15 }));
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const uploadId = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const customId = `${principal.ownerUserId}/${args.blobKind}/${uploadId}`;
    await ctx.db.insert("cloudBlobUploads", {
      tenantId: principal.tenantId,
      ownerUserId: principal.ownerUserId,
      uploadId,
      environmentId: args.environmentId,
      blobKind: args.blobKind,
      resourceId: args.resourceId,
      partId: args.partId,
      filename: args.filename,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      sha256: args.sha256.toLowerCase(),
      status: "pending",
      uploadThingKey: null,
      expiresAt,
      committedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      uploadId,
      customId,
      expiresAt,
    };
  },
});

export const commit = internalMutationGeneric({
  args: {
    credentialHash: v.string(),
    environmentId: v.string(),
    uploadId: v.string(),
    uploadThingKey: v.string(),
  },
  returns: v.object({ blobReferenceId: v.id("blobReferences"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const upload = await ctx.db
      .query("cloudBlobUploads")
      .withIndex("by_upload_id", (query) => query.eq("uploadId", args.uploadId))
      .unique();
    if (
      upload === null ||
      upload.ownerUserId !== principal.ownerUserId ||
      upload.tenantId !== principal.tenantId ||
      upload.environmentId !== args.environmentId
    )
      throw new Error("BLOB_UPLOAD_NOT_FOUND");
    const existing = await ctx.db
      .query("blobReferences")
      .withIndex("by_upload_id", (query) => query.eq("uploadId", args.uploadId))
      .unique();
    if (existing !== null) return { blobReferenceId: existing._id, duplicate: true };
    if (
      upload.status !== "pending" ||
      DateTime.toEpochMillis(DateTime.makeUnsafe(upload.expiresAt)) <
        DateTime.toEpochMillis(DateTime.nowUnsafe())
    )
      throw new Error("BLOB_UPLOAD_EXPIRED");
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const blobReferenceId = await ctx.db.insert("blobReferences", {
      tenantId: upload.tenantId,
      ownerUserId: upload.ownerUserId,
      uploadId: upload.uploadId,
      blobKind: upload.blobKind,
      resourceId: upload.resourceId,
      partId: upload.partId,
      filename: upload.filename,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      uploadThingKey: args.uploadThingKey,
      status: "uploaded",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("cloudBlobUploads", upload._id, {
      status: "uploaded",
      uploadThingKey: args.uploadThingKey,
      committedAt: now,
      updatedAt: now,
    });
    return { blobReferenceId, duplicate: false };
  },
});

export const listDeleting = internalQueryGeneric({
  args: {},
  returns: v.array(
    v.object({ blobReferenceId: v.id("blobReferences"), uploadThingKey: v.string() }),
  ),
  handler: async (ctx) => {
    const references = await ctx.db
      .query("blobReferences")
      .withIndex("by_status", (query) => query.eq("status", "deleting"))
      .take(100);
    return references.map((reference) => ({
      blobReferenceId: reference._id,
      uploadThingKey: reference.uploadThingKey,
    }));
  },
});

export const markDeletedBatch = internalMutationGeneric({
  args: { blobReferenceIds: v.array(v.id("blobReferences")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    let updated = 0;
    for (const blobReferenceId of args.blobReferenceIds) {
      const reference = await ctx.db.get("blobReferences", blobReferenceId);
      if (reference === null || reference.status !== "deleting") continue;
      await ctx.db.patch("blobReferences", reference._id, { status: "deleted", updatedAt: now });
      updated += 1;
    }
    return updated;
  },
});

export const getReference = queryGeneric({
  args: { blobReferenceId: v.id("blobReferences") },
  returns: v.union(
    v.null(),
    v.object({
      uploadThingKey: v.string(),
      filename: v.string(),
      contentType: v.string(),
      sizeBytes: v.number(),
      sha256: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const reference = await ctx.db.get("blobReferences", args.blobReferenceId);
    if (reference === null || reference.deletedAt !== null) return null;
    await requireTenantMembership(ctx, reference.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, reference);
    return {
      uploadThingKey: reference.uploadThingKey,
      filename: reference.filename,
      contentType: reference.contentType,
      sizeBytes: reference.sizeBytes,
      sha256: reference.sha256,
    };
  },
});

export const markDeleted = mutationGeneric({
  args: { blobReferenceId: v.id("blobReferences") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const reference = await ctx.db.get("blobReferences", args.blobReferenceId);
    if (reference === null) return null;
    await requireTenantMembership(ctx, reference.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, reference);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("blobReferences", reference._id, {
      status: "deleting",
      deletedAt: now,
      updatedAt: now,
    });
    return reference.uploadThingKey;
  },
});
