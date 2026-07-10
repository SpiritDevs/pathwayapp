import { internalMutationGeneric, mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  assertCreatorOwnedResource,
  requireConnectUser,
  requireTenantMembership,
} from "./authorization.ts";
import { requireEnvironmentPrincipal } from "./environmentAuthorization.ts";

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_MESSAGE_LIMIT = 500;
const MAX_INLINE_BODY_CHARS = 350_000;

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const emailAddressValidator = v.object({
  name: v.union(v.null(), v.string()),
  address: v.string(),
});
const blobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("uploaded"),
  v.literal("failed"),
  v.literal("skipped"),
  v.literal("deleting"),
  v.literal("deleted"),
);
const sourceStatusValidator = v.union(
  v.literal("disabled"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("conflict"),
  v.literal("failed"),
);
const sandboxPolicyValidator = v.object({
  retentionDays: v.number(),
  retentionMaxMessages: v.number(),
  syncAttachments: v.boolean(),
  attachmentMaxBytes: v.number(),
});
const attachmentCaptureValidator = v.object({
  attachmentId: v.string(),
  filename: v.string(),
  contentType: v.string(),
  disposition: v.union(v.literal("attachment"), v.literal("inline"), v.literal("unknown")),
  contentId: v.union(v.null(), v.string()),
  sizeBytes: v.number(),
  sha256: v.union(v.null(), v.string()),
  blobStatus: blobStatusValidator,
  uploadId: v.optional(v.string()),
  skipReason: v.union(v.null(), v.string()),
});
const messageCaptureValidator = v.object({
  captureId: v.string(),
  messageId: v.string(),
  sourceId: v.string(),
  localProjectId: v.string(),
  logicalProjectKey: v.string(),
  projectTitle: v.string(),
  sourceStatus: sourceStatusValidator,
  smtpPort: v.union(v.null(), v.number()),
  captureEnabled: v.optional(v.boolean()),
  agentAccessEnabled: v.optional(v.boolean()),
  sandboxPolicy: v.optional(sandboxPolicyValidator),
  receivedAt: v.string(),
  from: v.array(emailAddressValidator),
  to: v.array(emailAddressValidator),
  cc: v.array(emailAddressValidator),
  bcc: v.array(emailAddressValidator),
  replyTo: v.array(emailAddressValidator),
  subject: v.string(),
  text: v.union(v.null(), v.string()),
  html: v.union(v.null(), v.string()),
  textTruncated: v.boolean(),
  htmlTruncated: v.boolean(),
  attachments: v.array(attachmentCaptureValidator),
  rawMimeStatus: blobStatusValidator,
  rawMimeUploadId: v.optional(v.string()),
});
const sourceConfigurationValidator = v.object({
  sourceId: v.string(),
  localProjectId: v.string(),
  logicalProjectKey: v.string(),
  projectTitle: v.string(),
  captureEnabled: v.boolean(),
  agentAccessEnabled: v.boolean(),
  sourceStatus: sourceStatusValidator,
  smtpPort: v.union(v.null(), v.number()),
  lastError: v.union(v.null(), v.string()),
  sandboxPolicy: v.optional(sandboxPolicyValidator),
});

const summaryValidator = v.object({
  messageId: v.string(),
  sandboxId: v.string(),
  sourceId: v.string(),
  cloudProjectId: v.id("cloudProjects"),
  from: v.array(emailAddressValidator),
  to: v.array(emailAddressValidator),
  subject: v.string(),
  receivedAt: v.string(),
  readAt: v.union(v.null(), v.string()),
  attachmentCount: v.number(),
  hasHtml: v.boolean(),
  hasText: v.boolean(),
  syncState: v.union(
    v.literal("local"),
    v.literal("pending"),
    v.literal("synced"),
    v.literal("failed"),
    v.literal("deleted"),
  ),
});

async function findProjectForSource(
  ctx: any,
  ownerUserId: string,
  environmentId: string,
  localProjectId: string,
  logicalProjectKey: string,
) {
  const replica = await ctx.db
    .query("projectReplicas")
    .withIndex("by_environment_local_project", (query: any) =>
      query.eq("environmentId", environmentId),
    )
    .filter((query: any) => query.eq(query.field("localProjectId"), localProjectId))
    .unique();
  if (replica !== null && replica.ownerUserId === ownerUserId) {
    return await ctx.db.get("cloudProjects", replica.cloudProjectId);
  }
  return await ctx.db
    .query("cloudProjects")
    .withIndex("by_owner_logical_key", (query: any) => query.eq("ownerUserId", ownerUserId))
    .filter((query: any) => query.eq(query.field("logicalProjectKey"), logicalProjectKey))
    .unique();
}

async function enforceRetention(ctx: any, sandbox: any, nowIso: string): Promise<number> {
  const cutoff = DateTime.formatIso(
    DateTime.subtract(DateTime.makeUnsafe(nowIso), { days: sandbox.retentionDays }),
  );
  const messages = await ctx.db
    .query("emailMessages")
    .withIndex("by_sandbox_received", (query: any) => query.eq("sandboxId", sandbox._id))
    .order("desc")
    .collect();
  let deleted = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message.tombstonedAt !== null ||
      (index < sandbox.messageLimit && message.receivedAt >= cutoff)
    ) {
      continue;
    }
    const body = await ctx.db
      .query("emailMessageBodies")
      .withIndex("by_message", (query: any) => query.eq("messageId", message._id))
      .unique();
    if (body !== null) await ctx.db.delete("emailMessageBodies", body._id);
    const attachments = await ctx.db
      .query("emailMessageAttachments")
      .withIndex("by_message", (query: any) => query.eq("messageId", message._id))
      .collect();
    for (const attachment of attachments) {
      if (attachment.blobReferenceId !== null) {
        await ctx.db.patch("blobReferences", attachment.blobReferenceId, {
          status: "deleting",
          deletedAt: nowIso,
          updatedAt: nowIso,
        });
      }
      await ctx.db.patch("emailMessageAttachments", attachment._id, {
        blobStatus: attachment.blobReferenceId === null ? "deleted" : "deleting",
        updatedAt: nowIso,
      });
    }
    if (message.rawMimeBlobReferenceId !== null) {
      await ctx.db.patch("blobReferences", message.rawMimeBlobReferenceId, {
        status: "deleting",
        deletedAt: nowIso,
        updatedAt: nowIso,
      });
    }
    await ctx.db.patch("emailMessages", message._id, {
      syncState: "deleted",
      rawMimeStatus: message.rawMimeBlobReferenceId === null ? "deleted" : "deleting",
      tombstonedAt: nowIso,
      updatedAt: nowIso,
    });
    deleted += 1;
  }
  return deleted;
}

export const listSandboxes = queryGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.array(
    v.object({
      sandboxId: v.string(),
      cloudProjectId: v.id("cloudProjects"),
      displayName: v.string(),
      retentionDays: v.number(),
      messageLimit: v.number(),
      syncAttachments: v.boolean(),
      attachmentMaxBytes: v.number(),
      updatedAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const sandboxes = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
      .collect();
    return sandboxes
      .filter((sandbox) => sandbox.ownerUserId === user.clerkUserId && sandbox.deletedAt === null)
      .map((sandbox) => ({
        sandboxId: sandbox.sandboxId,
        cloudProjectId: sandbox.cloudProjectId,
        displayName: sandbox.displayName,
        retentionDays: sandbox.retentionDays,
        messageLimit: sandbox.messageLimit,
        syncAttachments: sandbox.syncAttachments,
        attachmentMaxBytes: sandbox.attachmentMaxBytes,
        updatedAt: sandbox.updatedAt,
      }));
  },
});

export const listSources = queryGeneric({
  args: { sandboxId: v.string() },
  returns: v.array(
    v.object({
      sourceId: v.string(),
      environmentId: v.string(),
      localProjectId: v.string(),
      captureEnabled: v.boolean(),
      smtpPort: v.union(v.null(), v.number()),
      status: sourceStatusValidator,
      lastError: v.union(v.null(), v.string()),
      lastSeenAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const sandbox = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_owner_sandbox", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("sandboxId"), args.sandboxId))
      .unique();
    if (sandbox === null) return [];
    await requireTenantMembership(ctx, sandbox.tenantId);
    const sources = await ctx.db
      .query("emailSandboxSources")
      .withIndex("by_sandbox", (query) => query.eq("sandboxId", sandbox._id))
      .collect();
    return sources.map((source) => ({
      sourceId: source.sourceId,
      environmentId: source.environmentId,
      localProjectId: source.localProjectId,
      captureEnabled: source.captureEnabled,
      smtpPort: source.smtpPort,
      status: source.status,
      lastError: source.lastError,
      lastSeenAt: source.lastSeenAt,
    }));
  },
});

export const listMessages = queryGeneric({
  args: { sandboxId: v.string(), limit: v.optional(v.number()), before: v.optional(v.string()) },
  returns: v.array(summaryValidator),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const sandbox = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_owner_sandbox", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("sandboxId"), args.sandboxId))
      .unique();
    if (sandbox === null) return [];
    await requireTenantMembership(ctx, sandbox.tenantId);
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_sandbox_received", (query) => query.eq("sandboxId", sandbox._id))
      .order("desc")
      .take(Math.max(1, Math.min(args.limit ?? 100, 500)));
    const sourceIds = new Map<string, string>();
    return (
      await Promise.all(
        messages
          .filter(
            (message) =>
              message.tombstonedAt === null &&
              (args.before === undefined || message.receivedAt < args.before!),
          )
          .map(async (message) => {
            let sourceId = sourceIds.get(String(message.sourceId));
            if (sourceId === undefined) {
              const source = await ctx.db.get("emailSandboxSources", message.sourceId);
              sourceId = source?.sourceId ?? "unknown";
              sourceIds.set(String(message.sourceId), sourceId ?? "unknown");
            }
            return {
              messageId: message.messageId,
              sandboxId: sandbox.sandboxId,
              sourceId: sourceId ?? "unknown",
              cloudProjectId: sandbox.cloudProjectId,
              from: message.from,
              to: message.to,
              subject: message.subject,
              receivedAt: message.receivedAt,
              readAt: message.readAt,
              attachmentCount: message.attachmentCount,
              hasHtml: message.hasHtml,
              hasText: message.hasText,
              syncState: message.syncState,
            };
          }),
      )
    ).slice(0, Math.max(1, Math.min(args.limit ?? 100, 500)));
  },
});

export const getMessage = queryGeneric({
  args: { messageId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_owner_message", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("messageId"), args.messageId))
      .unique();
    if (message === null || message.tombstonedAt !== null) return null;
    await requireTenantMembership(ctx, message.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, message);
    const [sandbox, source, body, attachments] = await Promise.all([
      ctx.db.get("emailSandboxes", message.sandboxId),
      ctx.db.get("emailSandboxSources", message.sourceId),
      ctx.db
        .query("emailMessageBodies")
        .withIndex("by_message", (query) => query.eq("messageId", message._id))
        .unique(),
      ctx.db
        .query("emailMessageAttachments")
        .withIndex("by_message", (query) => query.eq("messageId", message._id))
        .collect(),
    ]);
    if (sandbox === null || source === null) return null;
    return {
      summary: {
        messageId: message.messageId,
        sandboxId: sandbox.sandboxId,
        sourceId: source.sourceId,
        cloudProjectId: sandbox.cloudProjectId,
        from: message.from,
        to: message.to,
        subject: message.subject,
        receivedAt: message.receivedAt,
        readAt: message.readAt,
        attachmentCount: message.attachmentCount,
        hasHtml: message.hasHtml,
        hasText: message.hasText,
        syncState: message.syncState,
      },
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      text: body?.text ?? null,
      html: body?.html ?? null,
      textTruncated: body?.textTruncated ?? false,
      htmlTruncated: body?.htmlTruncated ?? false,
      rawMimeStatus: message.rawMimeStatus,
      attachments: attachments.map((attachment) => ({
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        disposition: attachment.disposition,
        contentId: attachment.contentId,
        sizeBytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        blobStatus: attachment.blobStatus,
        skipReason: attachment.skipReason,
      })),
    };
  },
});

export const markRead = mutationGeneric({
  args: { messageId: v.string(), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_owner_message", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("messageId"), args.messageId))
      .unique();
    if (message === null) return null;
    await requireTenantMembership(ctx, message.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, message);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("emailMessages", message._id, {
      readAt: args.read ? now : null,
      updatedAt: now,
    });
    await ctx.db.insert("emailMessageEvents", {
      tenantId: message.tenantId,
      ownerUserId: message.ownerUserId,
      eventId: randomId(),
      messageId: message._id,
      kind: "read",
      actorUserId: user.clerkUserId,
      detail: args.read ? "read" : "unread",
      occurredAt: now,
      createdAt: now,
    });
    return null;
  },
});

export const removeMessage = mutationGeneric({
  args: { messageId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_owner_message", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("messageId"), args.messageId))
      .unique();
    if (message === null) return false;
    await requireTenantMembership(ctx, message.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, message);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const body = await ctx.db
      .query("emailMessageBodies")
      .withIndex("by_message", (query) => query.eq("messageId", message._id))
      .unique();
    if (body !== null) await ctx.db.delete("emailMessageBodies", body._id);
    await ctx.db.patch("emailMessages", message._id, {
      syncState: "deleted",
      tombstonedAt: now,
      rawMimeStatus: message.rawMimeBlobReferenceId === null ? "deleted" : "deleting",
      updatedAt: now,
    });
    await ctx.db.insert("emailMessageEvents", {
      tenantId: message.tenantId,
      ownerUserId: message.ownerUserId,
      eventId: randomId(),
      messageId: message._id,
      kind: "deleted",
      actorUserId: user.clerkUserId,
      detail: null,
      occurredAt: now,
      createdAt: now,
    });
    return true;
  },
});

export const clearSyncedSandboxHistory = mutationGeneric({
  args: { sandboxId: v.string() },
  returns: v.object({
    clearedMessages: v.number(),
    retainedUnsyncedMessages: v.number(),
    blobReferencesMarkedDeleting: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const sandbox = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_owner_sandbox", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("sandboxId"), args.sandboxId))
      .unique();
    if (sandbox === null)
      return { clearedMessages: 0, retainedUnsyncedMessages: 0, blobReferencesMarkedDeleting: 0 };
    await requireTenantMembership(ctx, sandbox.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, sandbox);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_sandbox_received", (query) => query.eq("sandboxId", sandbox._id))
      .collect();
    let clearedMessages = 0;
    let retainedUnsyncedMessages = 0;
    let blobReferencesMarkedDeleting = 0;
    for (const message of messages) {
      if (message.tombstonedAt !== null) continue;
      if (message.syncState !== "synced") {
        retainedUnsyncedMessages += 1;
        continue;
      }
      const body = await ctx.db
        .query("emailMessageBodies")
        .withIndex("by_message", (query) => query.eq("messageId", message._id))
        .unique();
      if (body !== null) await ctx.db.delete("emailMessageBodies", body._id);
      if (message.rawMimeBlobReferenceId !== null) {
        await ctx.db.patch("blobReferences", message.rawMimeBlobReferenceId, {
          status: "deleting",
          deletedAt: now,
          updatedAt: now,
        });
        blobReferencesMarkedDeleting += 1;
      }
      const attachments = await ctx.db
        .query("emailMessageAttachments")
        .withIndex("by_message", (query) => query.eq("messageId", message._id))
        .collect();
      for (const attachment of attachments) {
        if (attachment.blobReferenceId !== null) {
          await ctx.db.patch("blobReferences", attachment.blobReferenceId, {
            status: "deleting",
            deletedAt: now,
            updatedAt: now,
          });
          blobReferencesMarkedDeleting += 1;
        }
        await ctx.db.patch("emailMessageAttachments", attachment._id, {
          blobStatus: attachment.blobReferenceId === null ? "deleted" : "deleting",
          updatedAt: now,
        });
      }
      await ctx.db.patch("emailMessages", message._id, {
        syncState: "deleted",
        rawMimeStatus: message.rawMimeBlobReferenceId === null ? "deleted" : "deleting",
        tombstonedAt: now,
        updatedAt: now,
      });
      clearedMessages += 1;
    }
    return { clearedMessages, retainedUnsyncedMessages, blobReferencesMarkedDeleting };
  },
});

export const resolveAttachmentDownload = queryGeneric({
  args: { messageId: v.string(), attachmentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_owner_message", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("messageId"), args.messageId))
      .unique();
    if (message === null || message.tombstonedAt !== null) return null;
    await requireTenantMembership(ctx, message.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, message);
    const attachments = await ctx.db
      .query("emailMessageAttachments")
      .withIndex("by_message", (query) => query.eq("messageId", message._id))
      .collect();
    const attachment = attachments.find(
      (candidate) => candidate.attachmentId === args.attachmentId,
    );
    if (attachment?.blobReferenceId === null || attachment?.blobReferenceId === undefined)
      return null;
    const reference = await ctx.db.get("blobReferences", attachment.blobReferenceId);
    if (
      reference === null ||
      reference.ownerUserId !== user.clerkUserId ||
      reference.status !== "uploaded" ||
      reference.deletedAt !== null
    )
      return null;
    return {
      uploadThingKey: reference.uploadThingKey,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    };
  },
});

export const getAgentAccess = queryGeneric({
  args: { sandboxId: v.string() },
  returns: v.object({ messageBodiesEnabled: v.boolean(), attachmentsEnabled: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const sandbox = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_owner_sandbox", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("sandboxId"), args.sandboxId))
      .unique();
    if (sandbox === null) throw new Error("EMAIL_SANDBOX_NOT_FOUND");
    await requireTenantMembership(ctx, sandbox.tenantId);
    const grant = await ctx.db
      .query("emailAgentAccessGrants")
      .withIndex("by_sandbox", (query) => query.eq("sandboxId", sandbox._id))
      .filter((query) => query.eq(query.field("ownerUserId"), user.clerkUserId))
      .unique();
    return grant === null
      ? { messageBodiesEnabled: true, attachmentsEnabled: true }
      : {
          messageBodiesEnabled: grant.messageBodiesEnabled,
          attachmentsEnabled: grant.attachmentsEnabled,
        };
  },
});

export const setAgentAccess = mutationGeneric({
  args: {
    sandboxId: v.string(),
    messageBodiesEnabled: v.boolean(),
    attachmentsEnabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const sandbox = await ctx.db
      .query("emailSandboxes")
      .withIndex("by_owner_sandbox", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("sandboxId"), args.sandboxId))
      .unique();
    if (sandbox === null) throw new Error("EMAIL_SANDBOX_NOT_FOUND");
    await requireTenantMembership(ctx, sandbox.tenantId);
    assertCreatorOwnedResource(user.clerkUserId, sandbox);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const grant = await ctx.db
      .query("emailAgentAccessGrants")
      .withIndex("by_sandbox", (query) => query.eq("sandboxId", sandbox._id))
      .filter((query) => query.eq(query.field("ownerUserId"), user.clerkUserId))
      .unique();
    if (grant === null)
      await ctx.db.insert("emailAgentAccessGrants", {
        tenantId: sandbox.tenantId,
        ownerUserId: user.clerkUserId,
        sandboxId: sandbox._id,
        cloudProjectId: sandbox.cloudProjectId,
        messageBodiesEnabled: args.messageBodiesEnabled,
        attachmentsEnabled: args.attachmentsEnabled,
        createdAt: now,
        updatedAt: now,
      });
    else
      await ctx.db.patch("emailAgentAccessGrants", grant._id, {
        messageBodiesEnabled: args.messageBodiesEnabled,
        attachmentsEnabled: args.attachmentsEnabled,
        updatedAt: now,
      });
    return null;
  },
});

export const upsertSourceBatch = internalMutationGeneric({
  args: {
    credentialHash: v.string(),
    environmentId: v.string(),
    sources: v.array(sourceConfigurationValidator),
  },
  returns: v.object({ sourceIds: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const sourceIds: string[] = [];
    for (const configured of args.sources) {
      const policy = configured.sandboxPolicy ?? {
        retentionDays: DEFAULT_RETENTION_DAYS,
        retentionMaxMessages: DEFAULT_MESSAGE_LIMIT,
        syncAttachments: true,
        attachmentMaxBytes: 10 * 1024 * 1024,
      };
      let project = await findProjectForSource(
        ctx,
        principal.ownerUserId,
        args.environmentId,
        configured.localProjectId,
        configured.logicalProjectKey,
      );
      if (project === null) {
        const projectId = await ctx.db.insert("cloudProjects", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          logicalProjectKey: configured.logicalProjectKey,
          title: configured.projectTitle,
          repositoryCanonicalKey: null,
          repositoryRelativePath: null,
          iconBlobReferenceId: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        project = await ctx.db.get("cloudProjects", projectId);
      }
      if (
        project === null ||
        project.ownerUserId !== principal.ownerUserId ||
        project.tenantId !== principal.tenantId
      )
        throw new Error("EMAIL_PROJECT_ACCESS_DENIED");
      let replica = await ctx.db
        .query("projectReplicas")
        .withIndex("by_environment_local_project", (query) =>
          query.eq("environmentId", args.environmentId),
        )
        .filter((query) => query.eq(query.field("localProjectId"), configured.localProjectId))
        .unique();
      if (replica === null)
        await ctx.db.insert("projectReplicas", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          cloudProjectId: project._id,
          environmentId: args.environmentId,
          localProjectId: configured.localProjectId,
          displayName: configured.projectTitle,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        });
      let sandbox = await ctx.db
        .query("emailSandboxes")
        .withIndex("by_cloud_project", (query) => query.eq("cloudProjectId", project._id))
        .filter((query) => query.eq(query.field("ownerUserId"), principal.ownerUserId))
        .unique();
      if (sandbox === null) {
        const sandboxId = await ctx.db.insert("emailSandboxes", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          sandboxId: `sandbox:${project._id}`,
          cloudProjectId: project._id,
          displayName: configured.projectTitle,
          retentionDays: policy.retentionDays,
          messageLimit: policy.retentionMaxMessages,
          syncAttachments: policy.syncAttachments,
          attachmentMaxBytes: policy.attachmentMaxBytes,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        sandbox = await ctx.db.get("emailSandboxes", sandboxId);
        if (sandbox !== null)
          await ctx.db.insert("emailSandboxProjectBindings", {
            tenantId: principal.tenantId,
            ownerUserId: principal.ownerUserId,
            sandboxId: sandbox._id,
            cloudProjectId: project._id,
            logicalProjectKey: configured.logicalProjectKey,
            createdAt: now,
            updatedAt: now,
          });
      }
      if (sandbox === null) throw new Error("EMAIL_SANDBOX_CREATE_FAILED");
      await ctx.db.patch("emailSandboxes", sandbox._id, {
        displayName: configured.projectTitle,
        retentionDays: policy.retentionDays,
        messageLimit: policy.retentionMaxMessages,
        syncAttachments: policy.syncAttachments,
        attachmentMaxBytes: policy.attachmentMaxBytes,
        updatedAt: now,
      });
      let grant = await ctx.db
        .query("emailAgentAccessGrants")
        .withIndex("by_sandbox", (query) => query.eq("sandboxId", sandbox._id))
        .filter((query) => query.eq(query.field("ownerUserId"), principal.ownerUserId))
        .unique();
      if (grant === null)
        await ctx.db.insert("emailAgentAccessGrants", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          sandboxId: sandbox._id,
          cloudProjectId: project._id,
          messageBodiesEnabled: configured.agentAccessEnabled,
          attachmentsEnabled: configured.agentAccessEnabled,
          createdAt: now,
          updatedAt: now,
        });
      else
        await ctx.db.patch("emailAgentAccessGrants", grant._id, {
          messageBodiesEnabled: configured.agentAccessEnabled,
          attachmentsEnabled: configured.agentAccessEnabled,
          updatedAt: now,
        });
      let source = await ctx.db
        .query("emailSandboxSources")
        .withIndex("by_owner_source", (query) => query.eq("ownerUserId", principal.ownerUserId))
        .filter((query) => query.eq(query.field("sourceId"), configured.sourceId))
        .unique();
      if (source === null) {
        const sourceDocumentId = await ctx.db.insert("emailSandboxSources", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          sourceId: configured.sourceId,
          sandboxId: sandbox._id,
          environmentId: args.environmentId,
          localProjectId: configured.localProjectId,
          captureEnabled: configured.captureEnabled,
          smtpPort: configured.smtpPort,
          status: configured.sourceStatus,
          lastError: configured.lastError,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        });
        source = await ctx.db.get("emailSandboxSources", sourceDocumentId);
      } else {
        if (
          source.environmentId !== args.environmentId ||
          source.ownerUserId !== principal.ownerUserId
        )
          throw new Error("EMAIL_SOURCE_ENVIRONMENT_REQUIRED");
        await ctx.db.patch("emailSandboxSources", source._id, {
          sandboxId: sandbox._id,
          captureEnabled: configured.captureEnabled,
          smtpPort: configured.smtpPort,
          status: configured.sourceStatus,
          lastError: configured.lastError,
          lastSeenAt: now,
          updatedAt: now,
        });
      }
      if (source === null) throw new Error("EMAIL_SOURCE_CREATE_FAILED");
      sourceIds.push(configured.sourceId);
    }
    return { sourceIds };
  },
});

export const ingestCaptureBatch = internalMutationGeneric({
  args: {
    credentialHash: v.string(),
    environmentId: v.string(),
    messages: v.array(messageCaptureValidator),
  },
  returns: v.object({
    acceptedCaptureIds: v.array(v.string()),
    duplicateCaptureIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const acceptedCaptureIds: string[] = [];
    const duplicateCaptureIds: string[] = [];
    const affectedSandboxes = new Map<string, any>();
    for (const captured of args.messages) {
      const policy = captured.sandboxPolicy ?? {
        retentionDays: DEFAULT_RETENTION_DAYS,
        retentionMaxMessages: DEFAULT_MESSAGE_LIMIT,
        syncAttachments: true,
        attachmentMaxBytes: 10 * 1024 * 1024,
      };
      if (
        policy.retentionDays < 1 ||
        policy.retentionDays > 365 ||
        policy.retentionMaxMessages < 1 ||
        policy.retentionMaxMessages > 10_000 ||
        policy.attachmentMaxBytes < 0 ||
        policy.attachmentMaxBytes > 10 * 1024 * 1024
      )
        throw new Error("EMAIL_SANDBOX_POLICY_INVALID");
      let project = await findProjectForSource(
        ctx,
        principal.ownerUserId,
        args.environmentId,
        captured.localProjectId,
        captured.logicalProjectKey,
      );
      if (project === null) {
        const projectId = await ctx.db.insert("cloudProjects", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          logicalProjectKey: captured.logicalProjectKey,
          title: captured.projectTitle,
          repositoryCanonicalKey: null,
          repositoryRelativePath: null,
          iconBlobReferenceId: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        project = await ctx.db.get("cloudProjects", projectId);
      }
      if (
        project === null ||
        project.ownerUserId !== principal.ownerUserId ||
        project.tenantId !== principal.tenantId
      )
        throw new Error("EMAIL_PROJECT_ACCESS_DENIED");
      let replica = await ctx.db
        .query("projectReplicas")
        .withIndex("by_environment_local_project", (query) =>
          query.eq("environmentId", args.environmentId),
        )
        .filter((query) => query.eq(query.field("localProjectId"), captured.localProjectId))
        .unique();
      if (replica === null) {
        const replicaId = await ctx.db.insert("projectReplicas", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          cloudProjectId: project._id,
          environmentId: args.environmentId,
          localProjectId: captured.localProjectId,
          displayName: captured.projectTitle,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        });
        replica = await ctx.db.get("projectReplicas", replicaId);
      }
      let sandbox = await ctx.db
        .query("emailSandboxes")
        .withIndex("by_cloud_project", (query) => query.eq("cloudProjectId", project._id))
        .filter((query) => query.eq(query.field("ownerUserId"), principal.ownerUserId))
        .unique();
      if (sandbox === null) {
        const sandboxKey = `sandbox:${project._id}`;
        const sandboxId = await ctx.db.insert("emailSandboxes", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          sandboxId: sandboxKey,
          cloudProjectId: project._id,
          displayName: captured.projectTitle,
          retentionDays: policy.retentionDays,
          messageLimit: policy.retentionMaxMessages,
          syncAttachments: policy.syncAttachments,
          attachmentMaxBytes: policy.attachmentMaxBytes,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        sandbox = await ctx.db.get("emailSandboxes", sandboxId);
        if (sandbox !== null) {
          await ctx.db.insert("emailSandboxProjectBindings", {
            tenantId: principal.tenantId,
            ownerUserId: principal.ownerUserId,
            sandboxId: sandbox._id,
            cloudProjectId: project._id,
            logicalProjectKey: captured.logicalProjectKey,
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("emailAgentAccessGrants", {
            tenantId: principal.tenantId,
            ownerUserId: principal.ownerUserId,
            sandboxId: sandbox._id,
            cloudProjectId: project._id,
            messageBodiesEnabled: captured.agentAccessEnabled ?? true,
            attachmentsEnabled: captured.agentAccessEnabled ?? true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      if (sandbox === null) throw new Error("EMAIL_SANDBOX_CREATE_FAILED");
      await ctx.db.patch("emailSandboxes", sandbox._id, {
        displayName: captured.projectTitle,
        retentionDays: policy.retentionDays,
        messageLimit: policy.retentionMaxMessages,
        syncAttachments: policy.syncAttachments,
        attachmentMaxBytes: policy.attachmentMaxBytes,
        updatedAt: now,
      });
      const grant = await ctx.db
        .query("emailAgentAccessGrants")
        .withIndex("by_sandbox", (query) => query.eq("sandboxId", sandbox._id))
        .filter((query) => query.eq(query.field("ownerUserId"), principal.ownerUserId))
        .unique();
      if (grant !== null)
        await ctx.db.patch("emailAgentAccessGrants", grant._id, {
          messageBodiesEnabled: captured.agentAccessEnabled ?? grant.messageBodiesEnabled,
          attachmentsEnabled: captured.agentAccessEnabled ?? grant.attachmentsEnabled,
          updatedAt: now,
        });
      affectedSandboxes.set(String(sandbox._id), sandbox);
      let source = await ctx.db
        .query("emailSandboxSources")
        .withIndex("by_owner_source", (query) => query.eq("ownerUserId", principal.ownerUserId))
        .filter((query) => query.eq(query.field("sourceId"), captured.sourceId))
        .unique();
      if (source === null) {
        const sourceId = await ctx.db.insert("emailSandboxSources", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          sourceId: captured.sourceId,
          sandboxId: sandbox._id,
          environmentId: args.environmentId,
          localProjectId: captured.localProjectId,
          captureEnabled: captured.captureEnabled ?? true,
          smtpPort: captured.smtpPort,
          status: captured.sourceStatus,
          lastError: null,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        });
        source = await ctx.db.get("emailSandboxSources", sourceId);
      } else {
        if (
          source.environmentId !== args.environmentId ||
          source.ownerUserId !== principal.ownerUserId
        )
          throw new Error("EMAIL_SOURCE_ENVIRONMENT_REQUIRED");
        await ctx.db.patch("emailSandboxSources", source._id, {
          sandboxId: sandbox._id,
          captureEnabled: captured.captureEnabled ?? source.captureEnabled,
          smtpPort: captured.smtpPort,
          status: captured.sourceStatus,
          lastSeenAt: now,
          updatedAt: now,
        });
      }
      if (source === null) throw new Error("EMAIL_SOURCE_CREATE_FAILED");
      const existing = await ctx.db
        .query("emailMessages")
        .withIndex("by_source_capture", (query) => query.eq("sourceId", source._id))
        .filter((query) => query.eq(query.field("captureId"), captured.captureId))
        .unique();
      if (existing !== null) {
        if (captured.rawMimeUploadId !== undefined && existing.rawMimeBlobReferenceId === null) {
          const reference = await ctx.db
            .query("blobReferences")
            .withIndex("by_upload_id", (query) => query.eq("uploadId", captured.rawMimeUploadId!))
            .unique();
          if (
            reference === null ||
            reference.ownerUserId !== principal.ownerUserId ||
            reference.tenantId !== principal.tenantId ||
            reference.blobKind !== "email-raw-mime" ||
            reference.resourceId !== captured.messageId
          )
            throw new Error("EMAIL_RAW_MIME_UPLOAD_INVALID");
          await ctx.db.patch("emailMessages", existing._id, {
            rawMimeStatus: "uploaded",
            rawMimeBlobReferenceId: reference._id,
            updatedAt: now,
          });
        }
        const existingAttachments = await ctx.db
          .query("emailMessageAttachments")
          .withIndex("by_message", (query) => query.eq("messageId", existing._id))
          .collect();
        for (const attachment of captured.attachments) {
          if (attachment.uploadId === undefined) continue;
          const stored = existingAttachments.find(
            (candidate) => candidate.attachmentId === attachment.attachmentId,
          );
          if (stored === undefined || stored.blobReferenceId !== null) continue;
          const reference = await ctx.db
            .query("blobReferences")
            .withIndex("by_upload_id", (query) => query.eq("uploadId", attachment.uploadId!))
            .unique();
          if (
            reference === null ||
            reference.ownerUserId !== principal.ownerUserId ||
            reference.tenantId !== principal.tenantId ||
            reference.blobKind !== "email-attachment" ||
            reference.resourceId !== captured.messageId ||
            reference.partId !== attachment.attachmentId
          )
            throw new Error("EMAIL_ATTACHMENT_UPLOAD_INVALID");
          await ctx.db.patch("emailMessageAttachments", stored._id, {
            blobStatus: "uploaded",
            blobReferenceId: reference._id,
            skipReason: null,
            updatedAt: now,
          });
        }
        duplicateCaptureIds.push(captured.captureId);
        continue;
      }
      const text = captured.text === null ? null : captured.text.slice(0, MAX_INLINE_BODY_CHARS);
      const remainingHtmlChars = Math.max(0, MAX_INLINE_BODY_CHARS - (text?.length ?? 0));
      const html = captured.html === null ? null : captured.html.slice(0, remainingHtmlChars);
      const rawMimeReference =
        captured.rawMimeUploadId === undefined
          ? null
          : await ctx.db
              .query("blobReferences")
              .withIndex("by_upload_id", (query) => query.eq("uploadId", captured.rawMimeUploadId!))
              .unique();
      if (
        captured.rawMimeUploadId !== undefined &&
        (rawMimeReference === null ||
          rawMimeReference.ownerUserId !== principal.ownerUserId ||
          rawMimeReference.tenantId !== principal.tenantId ||
          rawMimeReference.blobKind !== "email-raw-mime" ||
          rawMimeReference.resourceId !== captured.messageId)
      )
        throw new Error("EMAIL_RAW_MIME_UPLOAD_INVALID");
      const attachmentReferences = new Map<string, any>();
      for (const attachment of captured.attachments) {
        if (attachment.uploadId === undefined) continue;
        const reference = await ctx.db
          .query("blobReferences")
          .withIndex("by_upload_id", (query) => query.eq("uploadId", attachment.uploadId!))
          .unique();
        if (
          reference === null ||
          reference.ownerUserId !== principal.ownerUserId ||
          reference.tenantId !== principal.tenantId ||
          reference.blobKind !== "email-attachment" ||
          reference.resourceId !== captured.messageId ||
          reference.partId !== attachment.attachmentId
        )
          throw new Error("EMAIL_ATTACHMENT_UPLOAD_INVALID");
        attachmentReferences.set(attachment.attachmentId, reference);
      }
      const messageId = await ctx.db.insert("emailMessages", {
        tenantId: principal.tenantId,
        ownerUserId: principal.ownerUserId,
        messageId: captured.messageId,
        sandboxId: sandbox._id,
        sourceId: source._id,
        captureId: captured.captureId,
        from: captured.from,
        to: captured.to,
        cc: captured.cc,
        bcc: captured.bcc,
        replyTo: captured.replyTo,
        subject: captured.subject,
        receivedAt: captured.receivedAt,
        readAt: null,
        attachmentCount: captured.attachments.length,
        hasHtml: captured.html !== null,
        hasText: captured.text !== null,
        rawMimeStatus: rawMimeReference === null ? captured.rawMimeStatus : "uploaded",
        rawMimeBlobReferenceId: rawMimeReference?._id ?? null,
        syncState: "synced",
        tombstonedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("emailMessageBodies", {
        tenantId: principal.tenantId,
        ownerUserId: principal.ownerUserId,
        messageId,
        text,
        html,
        textTruncated: captured.textTruncated || (captured.text?.length ?? 0) > (text?.length ?? 0),
        htmlTruncated: captured.htmlTruncated || (captured.html?.length ?? 0) > (html?.length ?? 0),
        createdAt: now,
        updatedAt: now,
      });
      for (const attachment of captured.attachments) {
        const reference = attachmentReferences.get(attachment.attachmentId) ?? null;
        await ctx.db.insert("emailMessageAttachments", {
          tenantId: principal.tenantId,
          ownerUserId: principal.ownerUserId,
          attachmentId: attachment.attachmentId,
          messageId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          disposition: attachment.disposition,
          contentId: attachment.contentId,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          blobStatus: reference === null ? attachment.blobStatus : "uploaded",
          blobReferenceId: reference?._id ?? null,
          skipReason: attachment.skipReason,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("emailMessageEvents", {
        tenantId: principal.tenantId,
        ownerUserId: principal.ownerUserId,
        eventId: randomId(),
        messageId,
        kind: "imported",
        actorUserId: null,
        detail: args.environmentId,
        occurredAt: captured.receivedAt,
        createdAt: now,
      });
      acceptedCaptureIds.push(captured.captureId);
    }
    for (const sandbox of affectedSandboxes.values()) await enforceRetention(ctx, sandbox, now);
    return { acceptedCaptureIds, duplicateCaptureIds };
  },
});

export const cleanupAll = internalMutationGeneric({
  args: {},
  returns: v.object({ deletedMessages: v.number() }),
  handler: async (ctx) => {
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const sandboxes = await ctx.db.query("emailSandboxes").collect();
    let deletedMessages = 0;
    for (const sandbox of sandboxes) deletedMessages += await enforceRetention(ctx, sandbox, now);
    return { deletedMessages };
  },
});
