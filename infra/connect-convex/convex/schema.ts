import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const isoTimestamp = v.string();

const managedEndpointProviderKind = v.union(
  v.literal("manual"),
  v.literal("cloudflare_tunnel"),
  v.literal("pathwayos_relay"),
);

const remoteProviderKind = v.union(v.literal("cloudflare_tunnel"));

const managedEndpoint = v.object({
  httpBaseUrl: v.string(),
  wsBaseUrl: v.string(),
  providerKind: managedEndpointProviderKind,
});

const relayAgentActivityPhase = v.union(
  v.literal("starting"),
  v.literal("running"),
  v.literal("waiting_for_approval"),
  v.literal("waiting_for_input"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("stale"),
);

const relayAgentActivityState = v.object({
  environmentId: v.string(),
  threadId: v.string(),
  projectTitle: v.string(),
  threadTitle: v.string(),
  phase: relayAgentActivityPhase,
  headline: v.string(),
  detail: v.optional(v.string()),
  modelTitle: v.string(),
  updatedAt: isoTimestamp,
  deepLink: v.string(),
});

const relayAgentActivityAggregateRow = v.object({
  environmentId: v.string(),
  threadId: v.string(),
  projectTitle: v.string(),
  threadTitle: v.string(),
  modelTitle: v.string(),
  phase: relayAgentActivityPhase,
  status: v.string(),
  updatedAt: isoTimestamp,
  deepLink: v.string(),
});

const relayAgentActivityAggregateState = v.object({
  title: v.string(),
  subtitle: v.string(),
  activeCount: v.number(),
  updatedAt: isoTimestamp,
  activities: v.array(relayAgentActivityAggregateRow),
});

const agentAwarenessPreferences = v.object({
  liveActivitiesEnabled: v.boolean(),
  notificationsEnabled: v.boolean(),
  notifyOnApproval: v.boolean(),
  notifyOnInput: v.boolean(),
  notifyOnCompletion: v.boolean(),
  notifyOnFailure: v.boolean(),
});

const tenantKind = v.union(v.literal("personal"), v.literal("team"));

const tenantRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));

const invitationRole = v.union(v.literal("admin"), v.literal("member"));

const cloudBlobKind = v.union(
  v.literal("email-raw-mime"),
  v.literal("email-attachment"),
  v.literal("chat-attachment"),
  v.literal("project-icon"),
  v.literal("checkpoint-diff"),
);

const cloudBlobStatus = v.union(
  v.literal("pending"),
  v.literal("uploaded"),
  v.literal("failed"),
  v.literal("skipped"),
  v.literal("deleting"),
  v.literal("deleted"),
);

const orchestrationEventType = v.union(
  v.literal("project.created"),
  v.literal("project.meta-updated"),
  v.literal("project.deleted"),
  v.literal("thread.created"),
  v.literal("thread.deleted"),
  v.literal("thread.archived"),
  v.literal("thread.unarchived"),
  v.literal("thread.meta-updated"),
  v.literal("thread.runtime-mode-set"),
  v.literal("thread.interaction-mode-set"),
  v.literal("thread.message-sent"),
  v.literal("thread.turn-start-requested"),
  v.literal("thread.turn-interrupt-requested"),
  v.literal("thread.approval-response-requested"),
  v.literal("thread.user-input-response-requested"),
  v.literal("thread.checkpoint-revert-requested"),
  v.literal("thread.reverted"),
  v.literal("thread.session-stop-requested"),
  v.literal("thread.session-set"),
  v.literal("thread.proposed-plan-upserted"),
  v.literal("thread.turn-diff-completed"),
  v.literal("thread.activity-appended"),
);

const orchestrationEventMetadata = v.object({
  providerTurnId: v.optional(v.string()),
  providerItemId: v.optional(v.string()),
  adapterKey: v.optional(v.string()),
  requestId: v.optional(v.string()),
  ingestedAt: v.optional(isoTimestamp),
});

const emailAddress = v.object({
  name: v.union(v.null(), v.string()),
  address: v.string(),
});

export default defineSchema({
  connectUsers: defineTable({
    clerkUserId: v.string(),
    primaryEmail: v.union(v.null(), v.string()),
    imageUrl: v.union(v.null(), v.string()),
    planLabel: v.string(),
    activeTenantId: v.optional(v.id("tenants")),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_clerk_user_id", ["clerkUserId"]),

  tenants: defineTable({
    name: v.string(),
    kind: tenantKind,
    ownerUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_kind", ["ownerUserId", "kind"]),

  tenantMemberships: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    role: tenantRole,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user", ["userId"])
    .index("by_tenant_user", ["tenantId", "userId"]),

  tenantInvitations: defineTable({
    tenantId: v.id("tenants"),
    invitedEmail: v.string(),
    role: invitationRole,
    tokenHash: v.string(),
    tokenHint: v.string(),
    invitedByUserId: v.string(),
    expiresAt: isoTimestamp,
    acceptedAt: v.union(v.null(), isoTimestamp),
    acceptedByUserId: v.union(v.null(), v.string()),
    revokedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_email", ["tenantId", "invitedEmail"]),

  portablePreferences: defineTable({
    ownerUserId: v.string(),
    tenantId: v.union(v.null(), v.id("tenants")),
    key: v.string(),
    value: v.any(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_tenant", ["ownerUserId", "tenantId"])
    .index("by_owner_tenant_key", ["ownerUserId", "tenantId", "key"]),

  cloudProjects: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    logicalProjectKey: v.string(),
    title: v.string(),
    repositoryCanonicalKey: v.union(v.null(), v.string()),
    repositoryRelativePath: v.union(v.null(), v.string()),
    iconBlobReferenceId: v.union(v.null(), v.id("blobReferences")),
    deletedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_tenant", ["tenantId"])
    .index("by_owner_logical_key", ["ownerUserId", "logicalProjectKey"])
    .index("by_tenant_logical_key", ["tenantId", "logicalProjectKey"]),

  projectReplicas: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    cloudProjectId: v.id("cloudProjects"),
    environmentId: v.string(),
    localProjectId: v.string(),
    displayName: v.string(),
    lastSeenAt: isoTimestamp,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_cloud_project", ["cloudProjectId"])
    .index("by_owner_environment", ["ownerUserId", "environmentId"])
    .index("by_environment_local_project", ["environmentId", "localProjectId"]),

  cloudThreads: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    threadId: v.string(),
    cloudProjectId: v.union(v.null(), v.id("cloudProjects")),
    sourceEnvironmentId: v.string(),
    title: v.string(),
    state: v.union(v.literal("active"), v.literal("archived"), v.literal("deleted")),
    archivedAt: v.union(v.null(), isoTimestamp),
    deletedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_thread", ["ownerUserId", "threadId"])
    .index("by_tenant_updated", ["tenantId", "updatedAt"])
    .index("by_project_updated", ["cloudProjectId", "updatedAt"])
    .index("by_source_environment", ["sourceEnvironmentId", "updatedAt"]),

  cloudOrchestrationEvents: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    environmentId: v.string(),
    batchId: v.string(),
    sourceSequence: v.number(),
    eventId: v.string(),
    eventType: orchestrationEventType,
    aggregateKind: v.union(v.literal("project"), v.literal("thread")),
    aggregateId: v.string(),
    threadId: v.union(v.null(), v.string()),
    occurredAt: isoTimestamp,
    commandId: v.union(v.null(), v.string()),
    causationEventId: v.union(v.null(), v.string()),
    correlationId: v.union(v.null(), v.string()),
    metadata: orchestrationEventMetadata,
    payload: v.any(),
    createdAt: isoTimestamp,
  })
    .index("by_owner_event", ["ownerUserId", "eventId"])
    .index("by_environment_sequence", ["environmentId", "sourceSequence"])
    .index("by_environment_batch", ["environmentId", "batchId"])
    .index("by_thread_sequence", ["threadId", "sourceSequence"]),

  environmentSyncState: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    environmentId: v.string(),
    cutoverSequence: v.number(),
    acceptedThroughSequence: v.number(),
    lastBatchId: v.union(v.null(), v.string()),
    lastAttemptAt: v.union(v.null(), isoTimestamp),
    lastSyncedAt: v.union(v.null(), isoTimestamp),
    lastError: v.union(v.null(), v.string()),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_environment", ["ownerUserId", "environmentId"])
    .index("by_tenant_environment", ["tenantId", "environmentId"]),

  cloudBlobUploads: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    uploadId: v.string(),
    environmentId: v.string(),
    blobKind: cloudBlobKind,
    resourceId: v.string(),
    partId: v.string(),
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.string(),
    status: cloudBlobStatus,
    uploadThingKey: v.union(v.null(), v.string()),
    expiresAt: isoTimestamp,
    committedAt: v.union(v.null(), isoTimestamp),
    errorMessage: v.union(v.null(), v.string()),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_upload_id", ["uploadId"])
    .index("by_owner_resource", ["ownerUserId", "resourceId"])
    .index("by_environment_status", ["environmentId", "status"]),

  blobReferences: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    uploadId: v.string(),
    blobKind: cloudBlobKind,
    resourceId: v.string(),
    partId: v.string(),
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    sha256: v.string(),
    uploadThingKey: v.string(),
    status: cloudBlobStatus,
    deletedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_upload_id", ["uploadId"])
    .index("by_owner_resource", ["ownerUserId", "resourceId"])
    .index("by_uploadthing_key", ["uploadThingKey"])
    .index("by_status", ["status"]),

  emailSandboxes: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    sandboxId: v.string(),
    cloudProjectId: v.id("cloudProjects"),
    displayName: v.string(),
    retentionDays: v.number(),
    messageLimit: v.number(),
    syncAttachments: v.boolean(),
    attachmentMaxBytes: v.number(),
    deletedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_sandbox", ["ownerUserId", "sandboxId"])
    .index("by_cloud_project", ["cloudProjectId"])
    .index("by_tenant", ["tenantId"]),

  emailSandboxProjectBindings: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    sandboxId: v.id("emailSandboxes"),
    cloudProjectId: v.id("cloudProjects"),
    logicalProjectKey: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_sandbox", ["sandboxId"])
    .index("by_owner_project", ["ownerUserId", "cloudProjectId"])
    .index("by_owner_logical_key", ["ownerUserId", "logicalProjectKey"]),

  emailSandboxSources: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    sourceId: v.string(),
    sandboxId: v.id("emailSandboxes"),
    environmentId: v.string(),
    localProjectId: v.string(),
    captureEnabled: v.boolean(),
    smtpPort: v.union(v.null(), v.number()),
    status: v.union(
      v.literal("disabled"),
      v.literal("starting"),
      v.literal("running"),
      v.literal("conflict"),
      v.literal("failed"),
    ),
    lastError: v.union(v.null(), v.string()),
    lastSeenAt: isoTimestamp,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_source", ["ownerUserId", "sourceId"])
    .index("by_sandbox", ["sandboxId"])
    .index("by_environment_project", ["environmentId", "localProjectId"]),

  emailMessages: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    messageId: v.string(),
    sandboxId: v.id("emailSandboxes"),
    sourceId: v.id("emailSandboxSources"),
    captureId: v.string(),
    from: v.array(emailAddress),
    to: v.array(emailAddress),
    cc: v.array(emailAddress),
    bcc: v.array(emailAddress),
    replyTo: v.array(emailAddress),
    subject: v.string(),
    receivedAt: isoTimestamp,
    readAt: v.union(v.null(), isoTimestamp),
    attachmentCount: v.number(),
    hasHtml: v.boolean(),
    hasText: v.boolean(),
    rawMimeStatus: cloudBlobStatus,
    rawMimeBlobReferenceId: v.union(v.null(), v.id("blobReferences")),
    syncState: v.union(
      v.literal("local"),
      v.literal("pending"),
      v.literal("synced"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    tombstonedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_message", ["ownerUserId", "messageId"])
    .index("by_source_capture", ["sourceId", "captureId"])
    .index("by_sandbox_received", ["sandboxId", "receivedAt"])
    .index("by_sandbox_tombstone", ["sandboxId", "tombstonedAt"]),

  emailMessageBodies: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    messageId: v.id("emailMessages"),
    text: v.union(v.null(), v.string()),
    html: v.union(v.null(), v.string()),
    textTruncated: v.boolean(),
    htmlTruncated: v.boolean(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_message", ["messageId"]),

  emailMessageAttachments: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    attachmentId: v.string(),
    messageId: v.id("emailMessages"),
    filename: v.string(),
    contentType: v.string(),
    disposition: v.union(v.literal("attachment"), v.literal("inline"), v.literal("unknown")),
    contentId: v.union(v.null(), v.string()),
    sizeBytes: v.number(),
    sha256: v.union(v.null(), v.string()),
    blobStatus: cloudBlobStatus,
    blobReferenceId: v.union(v.null(), v.id("blobReferences")),
    skipReason: v.union(v.null(), v.string()),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner_attachment", ["ownerUserId", "attachmentId"])
    .index("by_message", ["messageId"]),

  emailMessageEvents: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    eventId: v.string(),
    messageId: v.id("emailMessages"),
    kind: v.union(
      v.literal("captured"),
      v.literal("imported"),
      v.literal("blob-uploaded"),
      v.literal("blob-failed"),
      v.literal("read"),
      v.literal("agent-accessed"),
      v.literal("deleted"),
    ),
    actorUserId: v.union(v.null(), v.string()),
    detail: v.union(v.null(), v.string()),
    occurredAt: isoTimestamp,
    createdAt: isoTimestamp,
  })
    .index("by_owner_event", ["ownerUserId", "eventId"])
    .index("by_message_occurred", ["messageId", "occurredAt"]),

  emailAgentAccessGrants: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    sandboxId: v.id("emailSandboxes"),
    cloudProjectId: v.union(v.null(), v.id("cloudProjects")),
    messageBodiesEnabled: v.boolean(),
    attachmentsEnabled: v.boolean(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_sandbox", ["sandboxId"])
    .index("by_owner_project", ["ownerUserId", "cloudProjectId"]),

  environmentLinks: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    environmentId: v.string(),
    environmentLabel: v.string(),
    environmentPublicKey: v.string(),
    localOrigin: v.object({
      localHttpHost: v.string(),
      localHttpPort: v.number(),
    }),
    endpoint: managedEndpoint,
    notificationsEnabled: v.boolean(),
    liveActivitiesEnabled: v.boolean(),
    remoteAccessEnabled: v.boolean(),
    createdByDeviceId: v.union(v.null(), v.string()),
    revokedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_environment", ["ownerUserId", "environmentId"])
    .index("by_tenant", ["tenantId"])
    .index("by_environment", ["environmentId", "revokedAt"]),

  environmentLinkChallenges: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    challengeHash: v.string(),
    expiresAt: isoTimestamp,
    consumedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
  })
    .index("by_challenge_hash", ["challengeHash"])
    .index("by_owner", ["ownerUserId", "createdAt"]),

  remoteConnectionRequests: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    environmentId: v.string(),
    providerKind: remoteProviderKind,
    status: v.union(
      v.literal("requested"),
      v.literal("provisioning"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("deprovisioning"),
      v.literal("disabled"),
    ),
    requestedAt: isoTimestamp,
    updatedAt: isoTimestamp,
    errorMessage: v.union(v.null(), v.string()),
  })
    .index("by_owner_status", ["ownerUserId", "status"])
    .index("by_environment", ["environmentId"])
    .index("by_owner_environment", ["ownerUserId", "environmentId"]),

  providerAllocations: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    environmentId: v.string(),
    providerKind: remoteProviderKind,
    hostname: v.string(),
    tunnelId: v.union(v.null(), v.string()),
    tunnelName: v.string(),
    dnsRecordId: v.union(v.null(), v.string()),
    readyAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_provider", ["providerKind"])
    .index("by_owner_environment", ["ownerUserId", "environmentId"])
    .index("by_hostname", ["hostname"])
    .index("by_tunnel_name", ["tunnelName"]),

  environmentCredentials: defineTable({
    tenantId: v.id("tenants"),
    ownerUserId: v.string(),
    credentialId: v.string(),
    environmentId: v.string(),
    environmentPublicKey: v.string(),
    credentialHash: v.string(),
    revokedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_credential_hash", ["credentialHash"])
    .index("by_environment", ["environmentId", "revokedAt"])
    .index("by_environment_key", ["environmentId", "environmentPublicKey", "revokedAt"]),

  dpopProofs: defineTable({
    thumbprint: v.string(),
    jti: v.string(),
    iat: v.number(),
    expiresAt: isoTimestamp,
    createdAt: isoTimestamp,
  })
    .index("by_thumbprint_jti", ["thumbprint", "jti"])
    .index("by_expires_at", ["expiresAt"]),

  mobileDevices: defineTable({
    userId: v.string(),
    deviceId: v.string(),
    label: v.string(),
    platform: v.literal("ios"),
    iosMajorVersion: v.number(),
    appVersion: v.union(v.null(), v.string()),
    pushToken: v.union(v.null(), v.string()),
    pushToStartToken: v.union(v.null(), v.string()),
    preferences: agentAwarenessPreferences,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_user", ["userId"])
    .index("by_user_device", ["userId", "deviceId"])
    .index("by_push_token", ["pushToken"])
    .index("by_push_to_start_token", ["pushToStartToken"]),

  liveActivities: defineTable({
    userId: v.string(),
    deviceId: v.string(),
    activityPushToken: v.union(v.null(), v.string()),
    remoteStartQueuedAt: v.union(v.null(), isoTimestamp),
    remoteStartedAt: v.union(v.null(), isoTimestamp),
    endedAt: v.union(v.null(), isoTimestamp),
    lastAggregate: v.union(v.null(), relayAgentActivityAggregateState),
    lastLiveActivityDeliveryAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_user", ["userId"])
    .index("by_user_device", ["userId", "deviceId"])
    .index("by_activity_push_token", ["activityPushToken"]),

  agentActivityRows: defineTable({
    environmentId: v.string(),
    environmentPublicKey: v.string(),
    threadId: v.string(),
    state: relayAgentActivityState,
    updatedAt: isoTimestamp,
    createdAt: isoTimestamp,
  })
    .index("by_environment_thread", ["environmentId", "environmentPublicKey", "threadId"])
    .index("by_updated_at", ["updatedAt"]),

  deliveryAttempts: defineTable({
    id: v.string(),
    createdAt: isoTimestamp,
    userId: v.union(v.null(), v.string()),
    environmentId: v.union(v.null(), v.string()),
    threadId: v.union(v.null(), v.string()),
    deviceId: v.union(v.null(), v.string()),
    kind: v.union(
      v.literal("live_activity_start"),
      v.literal("live_activity_update"),
      v.literal("live_activity_end"),
      v.literal("push_notification"),
    ),
    sourceJobId: v.union(v.null(), v.string()),
    tokenSuffix: v.union(v.null(), v.string()),
    apnsStatus: v.union(v.null(), v.number()),
    apnsReason: v.union(v.null(), v.string()),
    apnsId: v.union(v.null(), v.string()),
    transportError: v.union(v.null(), v.string()),
  })
    .index("by_source_job", ["sourceJobId"])
    .index("by_environment_thread_created", ["environmentId", "threadId", "createdAt"]),

  slackChannels: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    topic: v.string(),
    description: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    createdByUserId: v.string(),
    archivedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_tenant", ["tenantId", "archivedAt"])
    .index("by_tenant_name", ["tenantId", "name"]),

  slackChannelMembers: defineTable({
    tenantId: v.id("tenants"),
    channelId: v.id("slackChannels"),
    userId: v.string(),
    role: v.union(v.literal("manager"), v.literal("member")),
    joinedAt: isoTimestamp,
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_user", ["channelId", "userId"])
    .index("by_user", ["tenantId", "userId"]),

  slackConversations: defineTable({
    tenantId: v.id("tenants"),
    kind: v.union(v.literal("direct"), v.literal("group")),
    title: v.string(),
    memberKey: v.string(),
    createdByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_tenant", ["tenantId", "updatedAt"])
    .index("by_tenant_member_key", ["tenantId", "memberKey"]),

  slackConversationMembers: defineTable({
    tenantId: v.id("tenants"),
    conversationId: v.id("slackConversations"),
    userId: v.string(),
    joinedAt: isoTimestamp,
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_user", ["tenantId", "userId"]),

  slackMessages: defineTable({
    tenantId: v.id("tenants"),
    channelId: v.union(v.null(), v.id("slackChannels")),
    conversationId: v.union(v.null(), v.id("slackConversations")),
    parentMessageId: v.union(v.null(), v.id("slackMessages")),
    authorUserId: v.string(),
    botIdentityId: v.union(v.null(), v.id("slackBotIdentities")),
    clientId: v.string(),
    body: v.string(),
    searchText: v.string(),
    editedAt: v.union(v.null(), isoTimestamp),
    deletedAt: v.union(v.null(), isoTimestamp),
    scheduledFor: v.union(v.null(), isoTimestamp),
    sentAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_channel_created", ["channelId", "createdAt"])
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_parent_created", ["parentMessageId", "createdAt"])
    .index("by_tenant_client", ["tenantId", "clientId"])
    .searchIndex("search_body", { searchField: "searchText", filterFields: ["tenantId"] }),

  slackReactions: defineTable({
    tenantId: v.id("tenants"),
    messageId: v.id("slackMessages"),
    userId: v.string(),
    emoji: v.string(),
    createdAt: isoTimestamp,
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),

  slackReadStates: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    channelId: v.union(v.null(), v.id("slackChannels")),
    conversationId: v.union(v.null(), v.id("slackConversations")),
    lastReadAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
    .index("by_user", ["tenantId", "userId"])
    .index("by_user_channel", ["userId", "channelId"])
    .index("by_user_conversation", ["userId", "conversationId"]),

  slackSavedMessages: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    messageId: v.id("slackMessages"),
    createdAt: isoTimestamp,
  })
    .index("by_user", ["tenantId", "userId"])
    .index("by_user_message", ["userId", "messageId"]),

  slackDrafts: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    targetKey: v.string(),
    body: v.string(),
    updatedAt: isoTimestamp,
  }).index("by_user_target", ["userId", "targetKey"]),

  slackPresence: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    status: v.union(v.literal("active"), v.literal("away")),
    customStatus: v.union(v.null(), v.string()),
    typingTargetKey: v.union(v.null(), v.string()),
    expiresAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_tenant_user", ["tenantId", "userId"]),

  slackBotIdentities: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    provider: v.union(v.literal("codex"), v.literal("claude"), v.literal("custom")),
    environmentId: v.union(v.null(), v.string()),
    enabled: v.boolean(),
    createdByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_tenant", ["tenantId", "enabled"]),

  slackNotifications: defineTable({
    tenantId: v.id("tenants"),
    userId: v.string(),
    kind: v.union(
      v.literal("mention"),
      v.literal("reply"),
      v.literal("reaction"),
      v.literal("invitation"),
      v.literal("system"),
    ),
    messageId: v.union(v.null(), v.id("slackMessages")),
    title: v.string(),
    detail: v.string(),
    readAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
  }).index("by_user_created", ["userId", "createdAt"]),

  slackCanvases: defineTable({
    tenantId: v.id("tenants"),
    channelId: v.union(v.null(), v.id("slackChannels")),
    title: v.string(),
    content: v.any(),
    revision: v.number(),
    createdByUserId: v.string(),
    updatedByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_channel", ["channelId", "updatedAt"]),

  slackLists: defineTable({
    tenantId: v.id("tenants"),
    channelId: v.union(v.null(), v.id("slackChannels")),
    title: v.string(),
    fields: v.any(),
    createdByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_tenant", ["tenantId", "updatedAt"]),

  slackListItems: defineTable({
    tenantId: v.id("tenants"),
    listId: v.id("slackLists"),
    values: v.any(),
    sourceMessageId: v.union(v.null(), v.id("slackMessages")),
    createdByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_list", ["listId", "createdAt"]),

  slackWorkflows: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    enabled: v.boolean(),
    trigger: v.any(),
    actions: v.any(),
    createdByUserId: v.string(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_tenant", ["tenantId", "enabled"]),

  slackWorkflowRuns: defineTable({
    tenantId: v.id("tenants"),
    workflowId: v.id("slackWorkflows"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    input: v.any(),
    output: v.any(),
    errorMessage: v.union(v.null(), v.string()),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_workflow", ["workflowId", "createdAt"]),

  slackHuddles: defineTable({
    tenantId: v.id("tenants"),
    channelId: v.union(v.null(), v.id("slackChannels")),
    conversationId: v.union(v.null(), v.id("slackConversations")),
    provider: v.literal("cloudflare-realtimekit"),
    providerMeetingId: v.union(v.null(), v.string()),
    title: v.string(),
    hostUserId: v.string(),
    status: v.union(
      v.literal("starting"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("failed"),
    ),
    recordingStatus: v.union(
      v.literal("off"),
      v.literal("consent-required"),
      v.literal("recording"),
      v.literal("complete"),
    ),
    startedAt: isoTimestamp,
    endedAt: v.union(v.null(), isoTimestamp),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  }).index("by_tenant_status", ["tenantId", "status"]),

  slackHuddleParticipants: defineTable({
    tenantId: v.id("tenants"),
    huddleId: v.id("slackHuddles"),
    userId: v.string(),
    providerParticipantId: v.string(),
    consentedToRecordingAt: v.union(v.null(), isoTimestamp),
    joinedAt: isoTimestamp,
    leftAt: v.union(v.null(), isoTimestamp),
    updatedAt: isoTimestamp,
  })
    .index("by_huddle", ["huddleId"])
    .index("by_huddle_user", ["huddleId", "userId"]),
});
