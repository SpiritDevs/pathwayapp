import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { GenericId, Value } from "convex/values";

type PublicReference<
  Kind extends "query" | "mutation" | "action",
  Args extends Record<string, Value>,
> = FunctionReference<Kind, "public", Args, Value>;

const query = <Args extends Record<string, Value> = Record<string, never>>(name: string) =>
  makeFunctionReference<"query", Args, Value>(name) as PublicReference<"query", Args>;
const mutation = <Args extends Record<string, Value> = Record<string, never>>(name: string) =>
  makeFunctionReference<"mutation", Args, Value>(name) as PublicReference<"mutation", Args>;
const action = <Args extends Record<string, Value> = Record<string, never>>(name: string) =>
  makeFunctionReference<"action", Args, Value>(name) as PublicReference<"action", Args>;

type TenantId = GenericId<"tenants">;
type CloudProjectId = GenericId<"cloudProjects">;
type SlackChannelId = GenericId<"slackChannels">;
type SlackMessageId = GenericId<"slackMessages">;

/** Browser-safe references independent of Convex code generation. */
export const clientApi = {
  account: {
    viewer: query("account:viewer"),
    bootstrap: mutation("account:bootstrap"),
  },
  tenants: {
    listMine: query("tenants:listMine"),
    viewerContext: query("tenants:viewerContext"),
    createTeam: mutation<{ name: string }>("tenants:createTeam"),
    setActive: mutation<{ tenantId: TenantId }>("tenants:setActive"),
    rename: mutation<{ tenantId: TenantId; name: string }>("tenants:rename"),
    listMembers: query<{ tenantId: TenantId }>("tenants:listMembers"),
    updateMemberRole: mutation<{ tenantId: TenantId; userId: string; role: "admin" | "member" }>(
      "tenants:updateMemberRole",
    ),
    removeMember: mutation<{ tenantId: TenantId; userId: string }>("tenants:removeMember"),
    leave: mutation<{ tenantId: TenantId }>("tenants:leave"),
  },
  invitations: {
    list: query<{ tenantId: TenantId }>("invitations:list"),
    create: action<{ tenantId: TenantId; invitedEmail: string; role: "admin" | "member" }>(
      "invitations:create",
    ),
    revoke: mutation<{ invitationId: GenericId<"tenantInvitations"> }>("invitations:revoke"),
    accept: action<{ token: string }>("invitations:accept"),
  },
  preferences: {
    list: query<{ tenantId: TenantId | null }>("preferences:list"),
    get: query<{ tenantId: TenantId | null; key: string }>("preferences:get"),
    set: mutation<{ tenantId: TenantId | null; key: string; value: Value }>("preferences:set"),
    remove: mutation<{ tenantId: TenantId | null; key: string }>("preferences:remove"),
  },
  cloud: {
    listProjects: query<{ tenantId: TenantId; includeDeleted?: boolean }>("cloudSync:listProjects"),
    upsertProject: mutation<{
      tenantId: TenantId;
      logicalProjectKey: string;
      title: string;
      repositoryCanonicalKey: string | null;
      repositoryRelativePath: string | null;
      environmentId: string;
      localProjectId: string;
      displayName: string;
    }>("cloudSync:upsertProject"),
    listProjectReplicas: query<{ cloudProjectId: CloudProjectId }>("cloudSync:listProjectReplicas"),
    listThreads: query<{
      tenantId: TenantId;
      cloudProjectId?: CloudProjectId;
      includeDeleted?: boolean;
    }>("cloudSync:listThreads"),
  },
  environments: {
    listMine: query("environmentLinks:listMine"),
    createLinkChallenge: action("environmentLinks:createLinkChallenge"),
    link: action<{
      proof: string;
      environmentLabel: string;
      notificationsEnabled: boolean;
      liveActivitiesEnabled: boolean;
      createdByDeviceId: string | null;
    }>("environmentLinks:linkEnvironment"),
    unlink: mutation<{ environmentId: string }>("environmentLinks:unlink"),
    remoteStatus: query<{ environmentId: string }>("remoteConnections:status"),
    enableRemoteAccess: action<{ environmentId: string }>("remoteConnections:enable"),
    disableRemoteAccess: action<{ environmentId: string }>("remoteConnections:disable"),
    reportRemoteRuntimeFailure: mutation<{ environmentId: string; errorMessage: string }>(
      "remoteConnections:reportRuntimeFailure",
    ),
  },
  email: {
    listSandboxes: query<{ tenantId: TenantId }>("email:listSandboxes"),
    listSources: query<{ sandboxId: string }>("email:listSources"),
    listMessages: query<{ sandboxId: string; limit?: number; before?: string }>(
      "email:listMessages",
    ),
    getMessage: query<{ messageId: string }>("email:getMessage"),
    markRead: mutation<{ messageId: string; read: boolean }>("email:markRead"),
    removeMessage: mutation<{ messageId: string }>("email:removeMessage"),
    clearSyncedSandboxHistory: mutation<{ sandboxId: string }>("email:clearSyncedSandboxHistory"),
    getAgentAccess: query<{ sandboxId: string }>("email:getAgentAccess"),
    setAgentAccess: mutation<{
      sandboxId: string;
      messageBodiesEnabled: boolean;
      attachmentsEnabled: boolean;
    }>("email:setAgentAccess"),
    getAttachmentDownload: action<{ messageId: string; attachmentId: string }>(
      "blobActions:getAttachmentDownload",
    ),
  },
  slack: {
    bootstrap: mutation<{ tenantId: TenantId }>("slack:bootstrap"),
    navigation: query<{ tenantId: TenantId }>("slack:navigation"),
    listMessages: query<{ channelId: SlackChannelId; limit?: number }>("slack:listMessages"),
    listThreadReplies: query<{ messageId: SlackMessageId }>("slack:listThreadReplies"),
    sendMessage: mutation<{
      channelId: SlackChannelId;
      parentMessageId?: SlackMessageId;
      clientId: string;
      body: string;
      scheduledFor?: string;
    }>("slack:sendMessage"),
    editMessage: mutation<{ messageId: SlackMessageId; body: string }>("slack:editMessage"),
    removeMessage: mutation<{ messageId: SlackMessageId }>("slack:removeMessage"),
    toggleReaction: mutation<{ messageId: SlackMessageId; emoji: string }>("slack:toggleReaction"),
    markRead: mutation<{ channelId: SlackChannelId }>("slack:markRead"),
    createChannel: mutation<{
      tenantId: TenantId;
      name: string;
      description: string;
      visibility: "public" | "private";
    }>("slack:createChannel"),
    joinChannel: mutation<{ channelId: SlackChannelId }>("slack:joinChannel"),
    heartbeat: mutation<{ tenantId: TenantId; typingTargetKey?: string }>("slack:heartbeat"),
    createBot: mutation<{
      tenantId: TenantId;
      name: string;
      provider: "codex" | "claude" | "custom";
      environmentId?: string;
    }>("slack:createBot"),
    searchMessages: query<{ tenantId: TenantId; query: string; limit?: number }>(
      "slack:searchMessages",
    ),
    toggleSaved: mutation<{ messageId: SlackMessageId }>("slack:toggleSaved"),
    saveDraft: mutation<{ tenantId: TenantId; targetKey: string; body: string }>("slack:saveDraft"),
  },
} as const;
