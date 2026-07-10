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

const nullableString = v.union(v.null(), v.string());

const cloudProjectSummary = v.object({
  cloudProjectId: v.id("cloudProjects"),
  tenantId: v.id("tenants"),
  ownerUserId: v.string(),
  logicalProjectKey: v.string(),
  title: v.string(),
  repositoryCanonicalKey: nullableString,
  repositoryRelativePath: nullableString,
  deletedAt: nullableString,
  createdAt: v.string(),
  updatedAt: v.string(),
});

const projectReplicaSummary = v.object({
  replicaId: v.id("projectReplicas"),
  cloudProjectId: v.id("cloudProjects"),
  environmentId: v.string(),
  localProjectId: v.string(),
  displayName: v.string(),
  lastSeenAt: v.string(),
  updatedAt: v.string(),
});

const cloudThreadSummary = v.object({
  cloudThreadId: v.id("cloudThreads"),
  threadId: v.string(),
  cloudProjectId: v.union(v.null(), v.id("cloudProjects")),
  sourceEnvironmentId: v.string(),
  title: v.string(),
  state: v.union(v.literal("active"), v.literal("archived"), v.literal("deleted")),
  archivedAt: nullableString,
  deletedAt: nullableString,
  createdAt: v.string(),
  updatedAt: v.string(),
});

const eventValidator = v.object({
  sequence: v.number(),
  eventId: v.string(),
  type: v.string(),
  aggregateKind: v.union(v.literal("project"), v.literal("thread")),
  aggregateId: v.string(),
  occurredAt: v.string(),
  commandId: nullableString,
  causationEventId: nullableString,
  correlationId: nullableString,
  metadata: v.any(),
  payload: v.any(),
});

const batchArgs = {
  credentialHash: v.string(),
  environmentId: v.string(),
  batchId: v.string(),
  sequenceFromExclusive: v.number(),
  sequenceToInclusive: v.number(),
  events: v.array(eventValidator),
  createdAt: v.string(),
};

const allowedEventTypes = new Set([
  "project.created",
  "project.meta-updated",
  "project.deleted",
  "thread.created",
  "thread.deleted",
  "thread.archived",
  "thread.unarchived",
  "thread.meta-updated",
  "thread.runtime-mode-set",
  "thread.interaction-mode-set",
  "thread.message-sent",
  "thread.turn-start-requested",
  "thread.turn-interrupt-requested",
  "thread.approval-response-requested",
  "thread.user-input-response-requested",
  "thread.checkpoint-revert-requested",
  "thread.reverted",
  "thread.session-stop-requested",
  "thread.session-set",
  "thread.proposed-plan-upserted",
  "thread.turn-diff-completed",
  "thread.activity-appended",
]);

function logicalProjectKey(environmentId: string, projectId: string, payload: any): string {
  const repositoryIdentity = payload?.repositoryIdentity;
  const canonical =
    typeof repositoryIdentity?.canonicalKey === "string"
      ? repositoryIdentity.canonicalKey
      : typeof repositoryIdentity?.canonicalRemote === "string"
        ? repositoryIdentity.canonicalRemote
        : null;
  const relativePath =
    typeof repositoryIdentity?.relativePath === "string" ? repositoryIdentity.relativePath : null;
  return canonical === null
    ? `environment:${environmentId}:project:${projectId}`
    : `repository:${canonical}:path:${relativePath ?? "."}`;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export const listProjects = queryGeneric({
  args: { tenantId: v.id("tenants"), includeDeleted: v.optional(v.boolean()) },
  returns: v.array(cloudProjectSummary),
  handler: async (ctx, args) => {
    await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const projects = await ctx.db
      .query("cloudProjects")
      .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
      .collect();
    return projects
      .filter((project) => args.includeDeleted === true || project.deletedAt === null)
      .map((project) => ({
        cloudProjectId: project._id,
        tenantId: project.tenantId,
        ownerUserId: project.ownerUserId,
        logicalProjectKey: project.logicalProjectKey,
        title: project.title,
        repositoryCanonicalKey: project.repositoryCanonicalKey,
        repositoryRelativePath: project.repositoryRelativePath,
        deletedAt: project.deletedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },
});

export const upsertProject = mutationGeneric({
  args: {
    tenantId: v.id("tenants"),
    logicalProjectKey: v.string(),
    title: v.string(),
    repositoryCanonicalKey: nullableString,
    repositoryRelativePath: nullableString,
    environmentId: v.string(),
    localProjectId: v.string(),
    displayName: v.string(),
  },
  returns: v.object({ cloudProjectId: v.id("cloudProjects"), replicaId: v.id("projectReplicas") }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    let project = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner_logical_key", (query) => query.eq("ownerUserId", user.clerkUserId))
      .filter((query) => query.eq(query.field("logicalProjectKey"), args.logicalProjectKey))
      .unique();
    if (project !== null && project.tenantId !== args.tenantId) {
      throw new Error("PROJECT_TENANT_CONFLICT");
    }
    if (project === null) {
      const projectId = await ctx.db.insert("cloudProjects", {
        tenantId: args.tenantId,
        ownerUserId: user.clerkUserId,
        logicalProjectKey: args.logicalProjectKey,
        title: args.title,
        repositoryCanonicalKey: args.repositoryCanonicalKey,
        repositoryRelativePath: args.repositoryRelativePath,
        iconBlobReferenceId: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      project = await ctx.db.get("cloudProjects", projectId);
    } else {
      assertCreatorOwnedResource(user.clerkUserId, project);
      await ctx.db.patch("cloudProjects", project._id, {
        title: args.title,
        repositoryCanonicalKey: args.repositoryCanonicalKey,
        repositoryRelativePath: args.repositoryRelativePath,
        deletedAt: null,
        updatedAt: now,
      });
    }
    if (project === null) throw new Error("PROJECT_CREATE_FAILED");
    let replica = await ctx.db
      .query("projectReplicas")
      .withIndex("by_environment_local_project", (query) =>
        query.eq("environmentId", args.environmentId),
      )
      .filter((query) => query.eq(query.field("localProjectId"), args.localProjectId))
      .unique();
    if (replica !== null && replica.ownerUserId !== user.clerkUserId) {
      throw new Error("PROJECT_REPLICA_CONFLICT");
    }
    if (replica === null) {
      const replicaId = await ctx.db.insert("projectReplicas", {
        tenantId: args.tenantId,
        ownerUserId: user.clerkUserId,
        cloudProjectId: project._id,
        environmentId: args.environmentId,
        localProjectId: args.localProjectId,
        displayName: args.displayName,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      replica = await ctx.db.get("projectReplicas", replicaId);
    } else {
      await ctx.db.patch("projectReplicas", replica._id, {
        cloudProjectId: project._id,
        displayName: args.displayName,
        lastSeenAt: now,
        updatedAt: now,
      });
    }
    if (replica === null) throw new Error("PROJECT_REPLICA_CREATE_FAILED");
    return { cloudProjectId: project._id, replicaId: replica._id };
  },
});

export const listProjectReplicas = queryGeneric({
  args: { cloudProjectId: v.id("cloudProjects") },
  returns: v.array(projectReplicaSummary),
  handler: async (ctx, args) => {
    await requireConnectUser(ctx);
    const project = await ctx.db.get("cloudProjects", args.cloudProjectId);
    if (project === null) return [];
    await requireTenantMembership(ctx, project.tenantId);
    const replicas = await ctx.db
      .query("projectReplicas")
      .withIndex("by_cloud_project", (query) => query.eq("cloudProjectId", args.cloudProjectId))
      .collect();
    return replicas.map((replica) => ({
      replicaId: replica._id,
      cloudProjectId: replica.cloudProjectId,
      environmentId: replica.environmentId,
      localProjectId: replica.localProjectId,
      displayName: replica.displayName,
      lastSeenAt: replica.lastSeenAt,
      updatedAt: replica.updatedAt,
    }));
  },
});

export const listThreads = queryGeneric({
  args: {
    tenantId: v.id("tenants"),
    cloudProjectId: v.optional(v.id("cloudProjects")),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(cloudThreadSummary),
  handler: async (ctx, args) => {
    await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const threads =
      args.cloudProjectId === undefined
        ? await ctx.db
            .query("cloudThreads")
            .withIndex("by_tenant_updated", (query) => query.eq("tenantId", args.tenantId))
            .collect()
        : await ctx.db
            .query("cloudThreads")
            .withIndex("by_project_updated", (query) =>
              query.eq("cloudProjectId", args.cloudProjectId!),
            )
            .collect();
    return threads
      .filter(
        (thread) =>
          thread.tenantId === args.tenantId &&
          (args.includeDeleted === true || thread.state !== "deleted"),
      )
      .map((thread) => ({
        cloudThreadId: thread._id,
        threadId: thread.threadId,
        cloudProjectId: thread.cloudProjectId,
        sourceEnvironmentId: thread.sourceEnvironmentId,
        title: thread.title,
        state: thread.state,
        archivedAt: thread.archivedAt,
        deletedAt: thread.deletedAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },
});

export const ingestBatch = internalMutationGeneric({
  args: batchArgs,
  returns: v.object({
    batchId: v.string(),
    acceptedThroughSequence: v.number(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    let syncState = await ctx.db
      .query("environmentSyncState")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", principal.ownerUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    if (syncState !== null && syncState.lastBatchId === args.batchId) {
      return {
        batchId: args.batchId,
        acceptedThroughSequence: syncState.acceptedThroughSequence,
        duplicate: true,
      };
    }
    const acceptedThrough = syncState?.acceptedThroughSequence ?? args.sequenceFromExclusive;
    if (
      args.sequenceFromExclusive !== acceptedThrough ||
      args.sequenceToInclusive < args.sequenceFromExclusive
    ) {
      throw new Error("SYNC_SEQUENCE_CONFLICT");
    }
    if (args.events.length !== args.sequenceToInclusive - args.sequenceFromExclusive) {
      throw new Error("SYNC_BATCH_NOT_CONTIGUOUS");
    }
    for (let index = 0; index < args.events.length; index += 1) {
      const event = args.events[index]!;
      if (
        event.sequence !== args.sequenceFromExclusive + index + 1 ||
        !allowedEventTypes.has(event.type)
      ) {
        throw new Error("SYNC_EVENT_INVALID");
      }
      const duplicateEvent = await ctx.db
        .query("cloudOrchestrationEvents")
        .withIndex("by_owner_event", (query) => query.eq("ownerUserId", principal.ownerUserId))
        .filter((query) => query.eq(query.field("eventId"), event.eventId))
        .unique();
      if (duplicateEvent !== null) throw new Error("SYNC_EVENT_DUPLICATE");

      let threadId: string | null = event.aggregateKind === "thread" ? event.aggregateId : null;
      if (event.type.startsWith("thread.") && typeof event.payload?.threadId === "string")
        threadId = event.payload.threadId;
      await ctx.db.insert("cloudOrchestrationEvents", {
        tenantId: principal.tenantId,
        ownerUserId: principal.ownerUserId,
        environmentId: args.environmentId,
        batchId: args.batchId,
        sourceSequence: event.sequence,
        eventId: event.eventId,
        eventType: event.type as any,
        aggregateKind: event.aggregateKind,
        aggregateId: event.aggregateId,
        threadId,
        occurredAt: event.occurredAt,
        commandId: event.commandId,
        causationEventId: event.causationEventId,
        correlationId: event.correlationId,
        metadata: event.metadata ?? {},
        payload: event.payload,
        createdAt: now,
      });

      if (event.type === "project.created") {
        const localProjectId = String(event.payload.projectId ?? event.aggregateId);
        const key = logicalProjectKey(args.environmentId, localProjectId, event.payload);
        let project = await ctx.db
          .query("cloudProjects")
          .withIndex("by_owner_logical_key", (query) =>
            query.eq("ownerUserId", principal.ownerUserId),
          )
          .filter((query) => query.eq(query.field("logicalProjectKey"), key))
          .unique();
        if (project === null) {
          const projectId = await ctx.db.insert("cloudProjects", {
            tenantId: principal.tenantId,
            ownerUserId: principal.ownerUserId,
            logicalProjectKey: key,
            title: String(event.payload.title ?? "Untitled project"),
            repositoryCanonicalKey: asNullableString(
              event.payload.repositoryIdentity?.canonicalKey ??
                event.payload.repositoryIdentity?.canonicalRemote,
            ),
            repositoryRelativePath: asNullableString(
              event.payload.repositoryIdentity?.relativePath,
            ),
            iconBlobReferenceId: null,
            deletedAt: null,
            createdAt: String(event.payload.createdAt ?? event.occurredAt),
            updatedAt: String(event.payload.updatedAt ?? event.occurredAt),
          });
          project = await ctx.db.get("cloudProjects", projectId);
        }
        if (project !== null) {
          const replica = await ctx.db
            .query("projectReplicas")
            .withIndex("by_environment_local_project", (query) =>
              query.eq("environmentId", args.environmentId),
            )
            .filter((query) => query.eq(query.field("localProjectId"), localProjectId))
            .unique();
          if (replica === null) {
            await ctx.db.insert("projectReplicas", {
              tenantId: principal.tenantId,
              ownerUserId: principal.ownerUserId,
              cloudProjectId: project._id,
              environmentId: args.environmentId,
              localProjectId,
              displayName: String(event.payload.title ?? project.title),
              lastSeenAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      } else if (event.type === "project.meta-updated" || event.type === "project.deleted") {
        const localProjectId = String(event.payload.projectId ?? event.aggregateId);
        const replica = await ctx.db
          .query("projectReplicas")
          .withIndex("by_environment_local_project", (query) =>
            query.eq("environmentId", args.environmentId),
          )
          .filter((query) => query.eq(query.field("localProjectId"), localProjectId))
          .unique();
        if (replica !== null && replica.ownerUserId === principal.ownerUserId) {
          const project = await ctx.db.get("cloudProjects", replica.cloudProjectId);
          if (project !== null) {
            await ctx.db.patch(
              "cloudProjects",
              project._id,
              event.type === "project.deleted"
                ? {
                    deletedAt: String(event.payload.deletedAt ?? event.occurredAt),
                    updatedAt: event.occurredAt,
                  }
                : {
                    title:
                      typeof event.payload.title === "string" ? event.payload.title : project.title,
                    repositoryCanonicalKey:
                      asNullableString(
                        event.payload.repositoryIdentity?.canonicalKey ??
                          event.payload.repositoryIdentity?.canonicalRemote,
                      ) ?? project.repositoryCanonicalKey,
                    repositoryRelativePath:
                      asNullableString(event.payload.repositoryIdentity?.relativePath) ??
                      project.repositoryRelativePath,
                    updatedAt: String(event.payload.updatedAt ?? event.occurredAt),
                  },
            );
          }
        }
      } else if (event.type === "thread.created") {
        const sourceThreadId = String(event.payload.threadId ?? event.aggregateId);
        const existing = await ctx.db
          .query("cloudThreads")
          .withIndex("by_owner_thread", (query) => query.eq("ownerUserId", principal.ownerUserId))
          .filter((query) => query.eq(query.field("threadId"), sourceThreadId))
          .unique();
        if (existing === null) {
          const localProjectId =
            typeof event.payload.projectId === "string" ? event.payload.projectId : null;
          const replica =
            localProjectId === null
              ? null
              : await ctx.db
                  .query("projectReplicas")
                  .withIndex("by_environment_local_project", (query) =>
                    query.eq("environmentId", args.environmentId),
                  )
                  .filter((query) => query.eq(query.field("localProjectId"), localProjectId))
                  .unique();
          await ctx.db.insert("cloudThreads", {
            tenantId: principal.tenantId,
            ownerUserId: principal.ownerUserId,
            threadId: sourceThreadId,
            cloudProjectId:
              replica?.ownerUserId === principal.ownerUserId ? replica.cloudProjectId : null,
            sourceEnvironmentId: args.environmentId,
            title: String(event.payload.title ?? "Untitled chat"),
            state: "active",
            archivedAt: null,
            deletedAt: null,
            createdAt: String(event.payload.createdAt ?? event.occurredAt),
            updatedAt: String(event.payload.updatedAt ?? event.occurredAt),
          });
        }
      } else if (threadId !== null) {
        const thread = await ctx.db
          .query("cloudThreads")
          .withIndex("by_owner_thread", (query) => query.eq("ownerUserId", principal.ownerUserId))
          .filter((query) => query.eq(query.field("threadId"), threadId!))
          .unique();
        if (thread !== null) {
          if (thread.sourceEnvironmentId !== args.environmentId)
            throw new Error("THREAD_SOURCE_ENVIRONMENT_REQUIRED");
          const updatedAt = String(event.payload.updatedAt ?? event.occurredAt);
          if (event.type === "thread.deleted")
            await ctx.db.patch("cloudThreads", thread._id, {
              state: "deleted",
              deletedAt: String(event.payload.deletedAt ?? event.occurredAt),
              updatedAt,
            });
          else if (event.type === "thread.archived")
            await ctx.db.patch("cloudThreads", thread._id, {
              state: "archived",
              archivedAt: String(event.payload.archivedAt ?? event.occurredAt),
              updatedAt,
            });
          else if (event.type === "thread.unarchived")
            await ctx.db.patch("cloudThreads", thread._id, {
              state: "active",
              archivedAt: null,
              updatedAt,
            });
          else if (event.type === "thread.meta-updated" && typeof event.payload.title === "string")
            await ctx.db.patch("cloudThreads", thread._id, {
              title: event.payload.title,
              updatedAt,
            });
        }
      }
    }
    if (syncState === null) {
      const stateId = await ctx.db.insert("environmentSyncState", {
        tenantId: principal.tenantId,
        ownerUserId: principal.ownerUserId,
        environmentId: args.environmentId,
        cutoverSequence: args.sequenceFromExclusive,
        acceptedThroughSequence: args.sequenceToInclusive,
        lastBatchId: args.batchId,
        lastAttemptAt: now,
        lastSyncedAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
      syncState = await ctx.db.get("environmentSyncState", stateId);
    } else {
      await ctx.db.patch("environmentSyncState", syncState._id, {
        acceptedThroughSequence: args.sequenceToInclusive,
        lastBatchId: args.batchId,
        lastAttemptAt: now,
        lastSyncedAt: now,
        lastError: null,
        updatedAt: now,
      });
    }
    return {
      batchId: args.batchId,
      acceptedThroughSequence: args.sequenceToInclusive,
      duplicate: false,
    };
  },
});

export const snapshot = internalQueryGeneric({
  args: { credentialHash: v.string(), environmentId: v.string(), sinceSequence: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requireEnvironmentPrincipal(
      ctx,
      args.credentialHash,
      args.environmentId,
    );
    const syncState = await ctx.db
      .query("environmentSyncState")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", principal.ownerUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .unique();
    const projects = (
      await ctx.db
        .query("cloudProjects")
        .withIndex("by_tenant", (query) => query.eq("tenantId", principal.tenantId))
        .collect()
    ).filter((project) => project.ownerUserId === principal.ownerUserId);
    const replicas = await ctx.db
      .query("projectReplicas")
      .withIndex("by_owner_environment", (query) => query.eq("ownerUserId", principal.ownerUserId))
      .filter((query) => query.eq(query.field("environmentId"), args.environmentId))
      .collect();
    const threads = (
      await ctx.db
        .query("cloudThreads")
        .withIndex("by_owner_thread", (query) => query.eq("ownerUserId", principal.ownerUserId))
        .collect()
    ).filter((thread) => thread.tenantId === principal.tenantId);
    const events = (
      await ctx.db
        .query("cloudOrchestrationEvents")
        .withIndex("by_environment_sequence", (query) =>
          query.eq("environmentId", args.environmentId),
        )
        .filter((query) => query.gt(query.field("sourceSequence"), args.sinceSequence))
        .collect()
    ).filter((event) => event.ownerUserId === principal.ownerUserId);
    return {
      environmentId: args.environmentId,
      acceptedThroughSequence: syncState?.acceptedThroughSequence ?? 0,
      projects,
      replicas,
      threads,
      events,
    };
  },
});
