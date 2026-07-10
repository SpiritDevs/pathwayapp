import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import * as DateTime from "effect/DateTime";

import {
  membershipByUser,
  requireConnectUser,
  requireTenantManager,
  requireTenantMembership,
  type DataModel,
} from "./authorization.ts";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { GenericId } from "convex/values";

type DatabaseContext =
  | Pick<GenericQueryCtx<DataModel>, "auth" | "db">
  | Pick<GenericMutationCtx<DataModel>, "auth" | "db">;

const channelSummary = v.object({
  channelId: v.id("slackChannels"),
  name: v.string(),
  topic: v.string(),
  description: v.string(),
  visibility: v.union(v.literal("public"), v.literal("private")),
  unreadCount: v.number(),
  isMember: v.boolean(),
  updatedAt: v.string(),
});

const messageView = v.object({
  messageId: v.id("slackMessages"),
  parentMessageId: v.union(v.null(), v.id("slackMessages")),
  authorUserId: v.string(),
  authorName: v.string(),
  authorImageUrl: v.union(v.null(), v.string()),
  botName: v.union(v.null(), v.string()),
  body: v.string(),
  editedAt: v.union(v.null(), v.string()),
  createdAt: v.string(),
  replyCount: v.number(),
  reactions: v.array(
    v.object({ emoji: v.string(), count: v.number(), reactedByViewer: v.boolean() }),
  ),
});

async function requireChannelAccess(ctx: DatabaseContext, channelId: GenericId<"slackChannels">) {
  const user = await requireConnectUser(ctx);
  const channel = await ctx.db.get("slackChannels", channelId);
  if (channel === null || channel.archivedAt !== null) throw new Error("SLACK_CHANNEL_NOT_FOUND");
  await requireTenantMembership(ctx, channel.tenantId);
  const channelMembership = await ctx.db
    .query("slackChannelMembers")
    .withIndex("by_channel_user", (query) =>
      query.eq("channelId", channelId).eq("userId", user.clerkUserId),
    )
    .unique();
  if (channel.visibility === "private" && channelMembership === null) {
    throw new Error("SLACK_CHANNEL_ACCESS_DENIED");
  }
  return { user, channel, channelMembership };
}

async function messageToView(
  ctx: DatabaseContext,
  message: NonNullable<Awaited<ReturnType<typeof ctx.db.get<"slackMessages">>>>,
  viewerUserId: string,
) {
  const [author, bot, reactions, replies] = await Promise.all([
    ctx.db
      .query("connectUsers")
      .withIndex("by_clerk_user_id", (query) => query.eq("clerkUserId", message.authorUserId))
      .unique(),
    message.botIdentityId === null ? null : ctx.db.get("slackBotIdentities", message.botIdentityId),
    ctx.db
      .query("slackReactions")
      .withIndex("by_message", (query) => query.eq("messageId", message._id))
      .collect(),
    ctx.db
      .query("slackMessages")
      .withIndex("by_parent_created", (query) => query.eq("parentMessageId", message._id))
      .collect(),
  ]);
  const grouped = new Map<string, { count: number; reactedByViewer: boolean }>();
  for (const reaction of reactions) {
    const current = grouped.get(reaction.emoji) ?? { count: 0, reactedByViewer: false };
    grouped.set(reaction.emoji, {
      count: current.count + 1,
      reactedByViewer: current.reactedByViewer || reaction.userId === viewerUserId,
    });
  }
  return {
    messageId: message._id,
    parentMessageId: message.parentMessageId,
    authorUserId: message.authorUserId,
    authorName: author?.primaryEmail?.split("@")[0] ?? bot?.name ?? "Member",
    authorImageUrl: author?.imageUrl ?? null,
    botName: bot?.name ?? null,
    body: message.deletedAt === null ? message.body : "This message was deleted.",
    editedAt: message.editedAt,
    createdAt: message.createdAt,
    replyCount: replies.filter((reply) => reply.deletedAt === null).length,
    reactions: Array.from(grouped, ([emoji, value]) => ({ emoji, ...value })),
  };
}

export const bootstrap = mutationGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.object({ generalChannelId: v.id("slackChannels") }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const existing = await ctx.db
      .query("slackChannels")
      .withIndex("by_tenant_name", (query) => query.eq("tenantId", args.tenantId))
      .filter((query) => query.eq(query.field("name"), "general"))
      .first();
    if (existing !== null) return { generalChannelId: existing._id };
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const generalChannelId = await ctx.db.insert("slackChannels", {
      tenantId: args.tenantId,
      name: "general",
      topic: "Company-wide announcements and conversation",
      description: "A shared space for everyone in this workspace.",
      visibility: "public",
      createdByUserId: user.clerkUserId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("slackChannelMembers", {
      tenantId: args.tenantId,
      channelId: generalChannelId,
      userId: user.clerkUserId,
      role: "manager",
      joinedAt: now,
    });
    return { generalChannelId };
  },
});

export const navigation = queryGeneric({
  args: { tenantId: v.id("tenants") },
  returns: v.object({
    viewerUserId: v.string(),
    channels: v.array(channelSummary),
    members: v.array(
      v.object({
        userId: v.string(),
        name: v.string(),
        imageUrl: v.union(v.null(), v.string()),
        role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
        presence: v.union(v.literal("active"), v.literal("away"), v.literal("offline")),
      }),
    ),
    notificationCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const [channels, memberships, readStates, tenantMembers, notifications, presenceRows] =
      await Promise.all([
        ctx.db
          .query("slackChannels")
          .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
          .filter((query) => query.eq(query.field("archivedAt"), null))
          .collect(),
        ctx.db
          .query("slackChannelMembers")
          .withIndex("by_user", (query) => query.eq("tenantId", args.tenantId))
          .filter((query) => query.eq(query.field("userId"), user.clerkUserId))
          .collect(),
        ctx.db
          .query("slackReadStates")
          .withIndex("by_user", (query) => query.eq("tenantId", args.tenantId))
          .filter((query) => query.eq(query.field("userId"), user.clerkUserId))
          .collect(),
        ctx.db
          .query("tenantMemberships")
          .withIndex("by_tenant", (query) => query.eq("tenantId", args.tenantId))
          .collect(),
        ctx.db
          .query("slackNotifications")
          .withIndex("by_user_created", (query) => query.eq("userId", user.clerkUserId))
          .collect(),
        ctx.db
          .query("slackPresence")
          .withIndex("by_tenant_user", (query) => query.eq("tenantId", args.tenantId))
          .collect(),
      ]);
    const joined = new Set(memberships.map((membership) => membership.channelId));
    const readByChannel = new Map(
      readStates
        .filter((state) => state.channelId !== null)
        .map((state) => [state.channelId!, state]),
    );
    const now = DateTime.toEpochMillis(DateTime.nowUnsafe());
    const visibleChannels = channels.filter(
      (channel) => channel.visibility === "public" || joined.has(channel._id),
    );
    const channelViews = await Promise.all(
      visibleChannels.map(async (channel) => {
        const lastReadAt = readByChannel.get(channel._id)?.lastReadAt ?? "";
        const messages = await ctx.db
          .query("slackMessages")
          .withIndex("by_channel_created", (query) => query.eq("channelId", channel._id))
          .collect();
        return {
          channelId: channel._id,
          name: channel.name,
          topic: channel.topic,
          description: channel.description,
          visibility: channel.visibility,
          unreadCount: messages.filter(
            (message) =>
              message.parentMessageId === null &&
              message.deletedAt === null &&
              message.createdAt > lastReadAt &&
              message.authorUserId !== user.clerkUserId,
          ).length,
          isMember: joined.has(channel._id),
          updatedAt: channel.updatedAt,
        };
      }),
    );
    const members = await Promise.all(
      tenantMembers.map(async (member) => {
        const [profile, presence] = await Promise.all([
          ctx.db
            .query("connectUsers")
            .withIndex("by_clerk_user_id", (query) => query.eq("clerkUserId", member.userId))
            .unique(),
          Promise.resolve(presenceRows.find((row) => row.userId === member.userId)),
        ]);
        const online =
          presence && DateTime.toEpochMillis(DateTime.makeUnsafe(presence.expiresAt)) > now;
        return {
          userId: member.userId,
          name: profile?.primaryEmail?.split("@")[0] ?? "Member",
          imageUrl: profile?.imageUrl ?? null,
          role: member.role,
          presence: online ? presence.status : ("offline" as const),
        };
      }),
    );
    return {
      viewerUserId: user.clerkUserId,
      channels: channelViews.sort((a, b) => a.name.localeCompare(b.name)),
      members,
      notificationCount: notifications.filter((notification) => notification.readAt === null)
        .length,
    };
  },
});

export const listMessages = queryGeneric({
  args: { channelId: v.id("slackChannels"), limit: v.optional(v.number()) },
  returns: v.array(messageView),
  handler: async (ctx, args) => {
    const { user } = await requireChannelAccess(ctx, args.channelId);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const messages = await ctx.db
      .query("slackMessages")
      .withIndex("by_channel_created", (query) => query.eq("channelId", args.channelId))
      .order("desc")
      .take(limit * 2);
    const roots = messages
      .filter((message) => message.parentMessageId === null && message.sentAt !== null)
      .slice(0, limit)
      .toReversed();
    return await Promise.all(roots.map((message) => messageToView(ctx, message, user.clerkUserId)));
  },
});

export const listThreadReplies = queryGeneric({
  args: { messageId: v.id("slackMessages") },
  returns: v.array(messageView),
  handler: async (ctx, args) => {
    const root = await ctx.db.get("slackMessages", args.messageId);
    if (root === null || root.channelId === null) throw new Error("SLACK_MESSAGE_NOT_FOUND");
    const { user } = await requireChannelAccess(ctx, root.channelId);
    const replies = await ctx.db
      .query("slackMessages")
      .withIndex("by_parent_created", (query) => query.eq("parentMessageId", args.messageId))
      .collect();
    return await Promise.all(
      replies.map((message) => messageToView(ctx, message, user.clerkUserId)),
    );
  },
});

export const sendMessage = mutationGeneric({
  args: {
    channelId: v.id("slackChannels"),
    parentMessageId: v.optional(v.id("slackMessages")),
    clientId: v.string(),
    body: v.string(),
    scheduledFor: v.optional(v.string()),
  },
  returns: v.id("slackMessages"),
  handler: async (ctx, args) => {
    const { user, channel } = await requireChannelAccess(ctx, args.channelId);
    const body = args.body.trim();
    if (body.length === 0 || body.length > 40_000) throw new Error("SLACK_MESSAGE_INVALID");
    const existing = await ctx.db
      .query("slackMessages")
      .withIndex("by_tenant_client", (query) => query.eq("tenantId", channel.tenantId))
      .filter((query) => query.eq(query.field("clientId"), args.clientId))
      .unique();
    if (existing !== null) return existing._id;
    if (args.parentMessageId !== undefined) {
      const parent = await ctx.db.get("slackMessages", args.parentMessageId);
      if (parent?.channelId !== args.channelId || parent.parentMessageId !== null) {
        throw new Error("SLACK_THREAD_INVALID");
      }
    }
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const scheduledFor = args.scheduledFor ?? null;
    const messageId = await ctx.db.insert("slackMessages", {
      tenantId: channel.tenantId,
      channelId: args.channelId,
      conversationId: null,
      parentMessageId: args.parentMessageId ?? null,
      authorUserId: user.clerkUserId,
      botIdentityId: null,
      clientId: args.clientId,
      body,
      searchText: body.toLocaleLowerCase(),
      editedAt: null,
      deletedAt: null,
      scheduledFor,
      sentAt: scheduledFor === null ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("slackChannels", args.channelId, { updatedAt: now });
    return messageId;
  },
});

export const editMessage = mutationGeneric({
  args: { messageId: v.id("slackMessages"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db.get("slackMessages", args.messageId);
    if (message === null || message.authorUserId !== user.clerkUserId) {
      throw new Error("SLACK_MESSAGE_EDIT_DENIED");
    }
    const body = args.body.trim();
    if (body.length === 0 || body.length > 40_000) throw new Error("SLACK_MESSAGE_INVALID");
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("slackMessages", message._id, {
      body,
      searchText: body.toLocaleLowerCase(),
      editedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const removeMessage = mutationGeneric({
  args: { messageId: v.id("slackMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db.get("slackMessages", args.messageId);
    if (message === null) return null;
    const membership = await membershipByUser(ctx, message.tenantId, user.clerkUserId);
    if (message.authorUserId !== user.clerkUserId && membership?.role === "member") {
      throw new Error("SLACK_MESSAGE_DELETE_DENIED");
    }
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    await ctx.db.patch("slackMessages", message._id, { deletedAt: now, updatedAt: now });
    return null;
  },
});

export const toggleReaction = mutationGeneric({
  args: { messageId: v.id("slackMessages"), emoji: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db.get("slackMessages", args.messageId);
    if (message === null || message.channelId === null) throw new Error("SLACK_MESSAGE_NOT_FOUND");
    await requireChannelAccess(ctx, message.channelId);
    const emoji = args.emoji.trim();
    if (emoji.length === 0 || emoji.length > 32) throw new Error("SLACK_REACTION_INVALID");
    const existing = await ctx.db
      .query("slackReactions")
      .withIndex("by_message_user_emoji", (query) => query.eq("messageId", args.messageId))
      .filter((query) =>
        query.and(
          query.eq(query.field("userId"), user.clerkUserId),
          query.eq(query.field("emoji"), emoji),
        ),
      )
      .unique();
    if (existing !== null) {
      await ctx.db.delete("slackReactions", existing._id);
      return false;
    }
    await ctx.db.insert("slackReactions", {
      tenantId: message.tenantId,
      messageId: message._id,
      userId: user.clerkUserId,
      emoji,
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return true;
  },
});

export const markRead = mutationGeneric({
  args: { channelId: v.id("slackChannels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, channel } = await requireChannelAccess(ctx, args.channelId);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const existing = await ctx.db
      .query("slackReadStates")
      .withIndex("by_user_channel", (query) => query.eq("userId", user.clerkUserId))
      .filter((query) => query.eq(query.field("channelId"), args.channelId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("slackReadStates", {
        tenantId: channel.tenantId,
        userId: user.clerkUserId,
        channelId: args.channelId,
        conversationId: null,
        lastReadAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("slackReadStates", existing._id, { lastReadAt: now, updatedAt: now });
    }
    return null;
  },
});

export const createChannel = mutationGeneric({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  returns: v.id("slackChannels"),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const name = args.name
      .trim()
      .toLocaleLowerCase()
      .replaceAll(/[^a-z0-9_-]+/gu, "-")
      .slice(0, 80);
    if (name.length === 0) throw new Error("SLACK_CHANNEL_NAME_INVALID");
    const duplicate = await ctx.db
      .query("slackChannels")
      .withIndex("by_tenant_name", (query) => query.eq("tenantId", args.tenantId))
      .filter((query) => query.eq(query.field("name"), name))
      .first();
    if (duplicate !== null) throw new Error("SLACK_CHANNEL_EXISTS");
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    const channelId = await ctx.db.insert("slackChannels", {
      tenantId: args.tenantId,
      name,
      topic: "",
      description: args.description.trim().slice(0, 500),
      visibility: args.visibility,
      createdByUserId: user.clerkUserId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("slackChannelMembers", {
      tenantId: args.tenantId,
      channelId,
      userId: user.clerkUserId,
      role: "manager",
      joinedAt: now,
    });
    return channelId;
  },
});

export const joinChannel = mutationGeneric({
  args: { channelId: v.id("slackChannels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const channel = await ctx.db.get("slackChannels", args.channelId);
    if (channel === null || channel.visibility !== "public")
      throw new Error("SLACK_CHANNEL_JOIN_DENIED");
    await requireTenantMembership(ctx, channel.tenantId);
    const existing = await ctx.db
      .query("slackChannelMembers")
      .withIndex("by_channel_user", (query) => query.eq("channelId", channel._id))
      .filter((query) => query.eq(query.field("userId"), user.clerkUserId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("slackChannelMembers", {
        tenantId: channel.tenantId,
        channelId: channel._id,
        userId: user.clerkUserId,
        role: "member",
        joinedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });
    }
    return null;
  },
});

export const heartbeat = mutationGeneric({
  args: { tenantId: v.id("tenants"), typingTargetKey: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const now = DateTime.nowUnsafe();
    const existing = await ctx.db
      .query("slackPresence")
      .withIndex("by_tenant_user", (query) => query.eq("tenantId", args.tenantId))
      .filter((query) => query.eq(query.field("userId"), user.clerkUserId))
      .unique();
    const patch = {
      status: "active" as const,
      customStatus: existing?.customStatus ?? null,
      typingTargetKey: args.typingTargetKey ?? null,
      expiresAt: DateTime.formatIso(DateTime.add(now, { minutes: 2 })),
      updatedAt: DateTime.formatIso(now),
    };
    if (existing === null) {
      await ctx.db.insert("slackPresence", {
        tenantId: args.tenantId,
        userId: user.clerkUserId,
        ...patch,
      });
    } else {
      await ctx.db.patch("slackPresence", existing._id, patch);
    }
    return null;
  },
});

export const createBot = mutationGeneric({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    provider: v.union(v.literal("codex"), v.literal("claude"), v.literal("custom")),
    environmentId: v.optional(v.string()),
  },
  returns: v.id("slackBotIdentities"),
  handler: async (ctx, args) => {
    const manager = await requireTenantManager(ctx, args.tenantId);
    const now = DateTime.formatIso(DateTime.nowUnsafe());
    return await ctx.db.insert("slackBotIdentities", {
      tenantId: args.tenantId,
      name: args.name.trim().slice(0, 80),
      provider: args.provider,
      environmentId: args.environmentId ?? null,
      enabled: true,
      createdByUserId: manager.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const searchMessages = queryGeneric({
  args: { tenantId: v.id("tenants"), query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(messageView),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const search = args.query.trim().toLocaleLowerCase();
    if (search.length < 2) return [];
    const candidates = await ctx.db
      .query("slackMessages")
      .withSearchIndex("search_body", (query) =>
        query.search("searchText", search).eq("tenantId", args.tenantId),
      )
      .take(Math.max(1, Math.min(100, args.limit ?? 30)));
    const visible = [];
    for (const message of candidates) {
      if (message.deletedAt !== null || message.sentAt === null) continue;
      if (message.channelId !== null) {
        const access = await requireChannelAccess(ctx, message.channelId).then(
          () => true,
          () => false,
        );
        if (!access) continue;
      } else if (message.conversationId !== null) {
        const membership = await ctx.db
          .query("slackConversationMembers")
          .withIndex("by_conversation_user", (query) =>
            query.eq("conversationId", message.conversationId!),
          )
          .filter((query) => query.eq(query.field("userId"), user.clerkUserId))
          .unique();
        if (membership === null) continue;
      }
      visible.push(await messageToView(ctx, message, user.clerkUserId));
    }
    return visible;
  },
});

export const toggleSaved = mutationGeneric({
  args: { messageId: v.id("slackMessages") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    const message = await ctx.db.get("slackMessages", args.messageId);
    if (message === null || message.channelId === null) throw new Error("SLACK_MESSAGE_NOT_FOUND");
    await requireChannelAccess(ctx, message.channelId);
    const existing = await ctx.db
      .query("slackSavedMessages")
      .withIndex("by_user_message", (query) => query.eq("userId", user.clerkUserId))
      .filter((query) => query.eq(query.field("messageId"), message._id))
      .unique();
    if (existing !== null) {
      await ctx.db.delete("slackSavedMessages", existing._id);
      return false;
    }
    await ctx.db.insert("slackSavedMessages", {
      tenantId: message.tenantId,
      userId: user.clerkUserId,
      messageId: message._id,
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    return true;
  },
});

export const saveDraft = mutationGeneric({
  args: { tenantId: v.id("tenants"), targetKey: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireConnectUser(ctx);
    await requireTenantMembership(ctx, args.tenantId);
    const targetKey = args.targetKey.trim().slice(0, 200);
    if (targetKey.length === 0) throw new Error("SLACK_DRAFT_TARGET_INVALID");
    const existing = await ctx.db
      .query("slackDrafts")
      .withIndex("by_user_target", (query) => query.eq("userId", user.clerkUserId))
      .filter((query) => query.eq(query.field("targetKey"), targetKey))
      .unique();
    if (args.body.length === 0) {
      if (existing !== null) await ctx.db.delete("slackDrafts", existing._id);
      return null;
    }
    const updatedAt = DateTime.formatIso(DateTime.nowUnsafe());
    if (existing === null) {
      await ctx.db.insert("slackDrafts", {
        tenantId: args.tenantId,
        userId: user.clerkUserId,
        targetKey,
        body: args.body.slice(0, 40_000),
        updatedAt,
      });
    } else {
      await ctx.db.patch("slackDrafts", existing._id, {
        body: args.body.slice(0, 40_000),
        updatedAt,
      });
    }
    return null;
  },
});
