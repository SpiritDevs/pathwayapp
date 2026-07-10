import { clientApi } from "@pathwayos/connect-convex/client-api";
import { useMutation, useQuery } from "convex/react";
import type { GenericId, Value } from "convex/values";
import {
  ActivityIcon,
  AtSignIcon,
  BellIcon,
  BookmarkIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  HashIcon,
  HeadphonesIcon,
  LockIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SmilePlusIcon,
  UserPlusIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { hasConvexPublicConfig } from "../cloud/publicConfig";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { SidebarAppNavRail } from "../components/Sidebar";
import { MobileWorkspaceTopbar } from "../components/MobileWorkspaceTopbar";
import { SidebarInset } from "../components/ui/sidebar";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

type ChannelId = GenericId<"slackChannels">;
type MessageId = GenericId<"slackMessages">;

let localSequence = 0;
const nextLocalId = (prefix: string): string => {
  localSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${localSequence.toString(36)}`;
};

interface ChannelSummary {
  readonly channelId: ChannelId;
  readonly name: string;
  readonly topic: string;
  readonly description: string;
  readonly visibility: "public" | "private";
  readonly unreadCount: number;
  readonly isMember: boolean;
}

interface MemberSummary {
  readonly userId: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly role: "owner" | "admin" | "member";
  readonly presence: "active" | "away" | "offline";
}

interface ReactionSummary {
  readonly emoji: string;
  readonly count: number;
  readonly reactedByViewer: boolean;
}

interface MessageSummary {
  readonly messageId: MessageId;
  readonly parentMessageId: MessageId | null;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly authorImageUrl: string | null;
  readonly botName: string | null;
  readonly body: string;
  readonly editedAt: string | null;
  readonly createdAt: string;
  readonly replyCount: number;
  readonly reactions: ReadonlyArray<ReactionSummary>;
}

interface WorkspaceModel {
  readonly workspaceName: string;
  readonly viewerUserId: string;
  readonly channels: ReadonlyArray<ChannelSummary>;
  readonly members: ReadonlyArray<MemberSummary>;
  readonly messages: ReadonlyArray<MessageSummary>;
  readonly threadReplies: ReadonlyArray<MessageSummary>;
  readonly selectedChannelId: ChannelId;
  readonly notificationCount: number;
  readonly isPreview: boolean;
  readonly send: (body: string, parentMessageId?: MessageId) => Promise<void>;
  readonly react: (messageId: MessageId, emoji: string) => Promise<void>;
  readonly createChannel: (name: string, visibility: "public" | "private") => Promise<void>;
  readonly selectChannel: (channelId: ChannelId) => void;
  readonly selectThread: (messageId: MessageId | null) => void;
}

const PREVIEW_CHANNELS: ReadonlyArray<ChannelSummary> = [
  {
    channelId: "preview-general" as ChannelId,
    name: "general",
    topic: "What the team is working on",
    description: "Company-wide announcements and conversation.",
    visibility: "public",
    unreadCount: 0,
    isMember: true,
  },
  {
    channelId: "preview-product" as ChannelId,
    name: "product",
    topic: "Product decisions, launches and customer feedback",
    description: "Plan and review pathwayOS product work.",
    visibility: "public",
    unreadCount: 4,
    isMember: true,
  },
  {
    channelId: "preview-agents" as ChannelId,
    name: "agent-ops",
    topic: "Codex and Claude activity",
    description: "Monitor and dispatch work to connected coding agents.",
    visibility: "private",
    unreadCount: 1,
    isMember: true,
  },
];

const PREVIEW_MEMBERS: ReadonlyArray<MemberSummary> = [
  { userId: "viewer", name: "Corey", imageUrl: null, role: "owner", presence: "active" },
  { userId: "maya", name: "Maya", imageUrl: null, role: "admin", presence: "active" },
  { userId: "jules", name: "Jules", imageUrl: null, role: "member", presence: "away" },
  { userId: "codex", name: "Codex", imageUrl: null, role: "member", presence: "active" },
];

const previewNow = new Date();
const PREVIEW_MESSAGES: ReadonlyArray<MessageSummary> = [
  {
    messageId: "preview-1" as MessageId,
    parentMessageId: null,
    authorUserId: "maya",
    authorName: "Maya Chen",
    authorImageUrl: null,
    botName: null,
    body: "Morning! The new **Convex sync path** is ready for a team test. I left the rollout notes in the channel canvas.",
    editedAt: null,
    createdAt: new Date(previewNow.getTime() - 46 * 60_000).toISOString(),
    replyCount: 3,
    reactions: [
      { emoji: "🚀", count: 4, reactedByViewer: true },
      { emoji: "🙌", count: 2, reactedByViewer: false },
    ],
  },
  {
    messageId: "preview-2" as MessageId,
    parentMessageId: null,
    authorUserId: "codex",
    authorName: "Codex",
    authorImageUrl: null,
    botName: "Codex",
    body: "I finished the cross-device verification pass. `vp check` is green and the remaining deployment steps are documented.",
    editedAt: null,
    createdAt: new Date(previewNow.getTime() - 31 * 60_000).toISOString(),
    replyCount: 1,
    reactions: [{ emoji: "✅", count: 3, reactedByViewer: false }],
  },
  {
    messageId: "preview-3" as MessageId,
    parentMessageId: null,
    authorUserId: "jules",
    authorName: "Jules Park",
    authorImageUrl: null,
    botName: null,
    body: "Starting a huddle at 2:30 to walk through the new inbox and team workspace. Join if you want to pressure-test the flow.",
    editedAt: null,
    createdAt: new Date(previewNow.getTime() - 9 * 60_000).toISOString(),
    replyCount: 0,
    reactions: [],
  },
];

function isRecord(value: unknown): value is Record<string, Value> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChannels(value: unknown): ReadonlyArray<ChannelSummary> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.channelId !== "string" ||
      typeof item.name !== "string" ||
      typeof item.topic !== "string" ||
      typeof item.description !== "string" ||
      (item.visibility !== "public" && item.visibility !== "private") ||
      typeof item.unreadCount !== "number" ||
      typeof item.isMember !== "boolean"
    ) {
      return [];
    }
    return [
      {
        channelId: item.channelId as ChannelId,
        name: item.name,
        topic: item.topic,
        description: item.description,
        visibility: item.visibility,
        unreadCount: item.unreadCount,
        isMember: item.isMember,
      },
    ];
  });
}

function parseMembers(value: unknown): ReadonlyArray<MemberSummary> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.userId !== "string" ||
      typeof item.name !== "string" ||
      (item.imageUrl !== null && typeof item.imageUrl !== "string") ||
      (item.role !== "owner" && item.role !== "admin" && item.role !== "member") ||
      (item.presence !== "active" && item.presence !== "away" && item.presence !== "offline")
    )
      return [];
    return [item as unknown as MemberSummary];
  });
}

function parseMessages(value: unknown): ReadonlyArray<MessageSummary> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.messageId !== "string" ||
      typeof item.authorUserId !== "string" ||
      typeof item.authorName !== "string" ||
      typeof item.body !== "string" ||
      typeof item.createdAt !== "string"
    )
      return [];
    const reactions = Array.isArray(item.reactions)
      ? item.reactions.flatMap((reaction) =>
          isRecord(reaction) &&
          typeof reaction.emoji === "string" &&
          typeof reaction.count === "number" &&
          typeof reaction.reactedByViewer === "boolean"
            ? [
                {
                  emoji: reaction.emoji,
                  count: reaction.count,
                  reactedByViewer: reaction.reactedByViewer,
                },
              ]
            : [],
        )
      : [];
    return [
      {
        messageId: item.messageId as MessageId,
        parentMessageId:
          typeof item.parentMessageId === "string" ? (item.parentMessageId as MessageId) : null,
        authorUserId: item.authorUserId,
        authorName: item.authorName,
        authorImageUrl: typeof item.authorImageUrl === "string" ? item.authorImageUrl : null,
        botName: typeof item.botName === "string" ? item.botName : null,
        body: item.body,
        editedAt: typeof item.editedAt === "string" ? item.editedAt : null,
        createdAt: item.createdAt,
        replyCount: typeof item.replyCount === "number" ? item.replyCount : 0,
        reactions,
      },
    ];
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function SlackWorkspace() {
  return hasConvexPublicConfig() ? <ConnectedSlackWorkspace /> : <PreviewSlackWorkspace />;
}

function PreviewSlackWorkspace() {
  const [channels, setChannels] = useState(PREVIEW_CHANNELS);
  const [selectedChannelId, setSelectedChannelId] = useState(PREVIEW_CHANNELS[0]!.channelId);
  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<string, ReadonlyArray<MessageSummary>>
  >({
    [PREVIEW_CHANNELS[0]!.channelId]: PREVIEW_MESSAGES,
  });
  const [threadMessageId, setThreadMessageId] = useState<MessageId | null>(null);
  const messages = messagesByChannel[selectedChannelId] ?? [];
  const threadReplies =
    threadMessageId === null
      ? []
      : messages.filter((message) => message.parentMessageId === threadMessageId);

  const model: WorkspaceModel = {
    workspaceName: "Pathway Studio",
    viewerUserId: "viewer",
    channels,
    members: PREVIEW_MEMBERS,
    messages,
    threadReplies,
    selectedChannelId,
    notificationCount: 3,
    isPreview: true,
    send: async (body, parentMessageId) => {
      const message: MessageSummary = {
        messageId: nextLocalId("message") as MessageId,
        parentMessageId: parentMessageId ?? null,
        authorUserId: "viewer",
        authorName: "Corey",
        authorImageUrl: null,
        botName: null,
        body,
        editedAt: null,
        createdAt: new Date().toISOString(),
        replyCount: 0,
        reactions: [],
      };
      setMessagesByChannel((current) => ({
        ...current,
        [selectedChannelId]: [...(current[selectedChannelId] ?? []), message],
      }));
    },
    react: async (messageId, emoji) => {
      setMessagesByChannel((current) => ({
        ...current,
        [selectedChannelId]: (current[selectedChannelId] ?? []).map((message) => {
          if (message.messageId !== messageId) return message;
          const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
          return {
            ...message,
            reactions: existing
              ? message.reactions.map((reaction) =>
                  reaction.emoji === emoji
                    ? {
                        ...reaction,
                        count: reaction.reactedByViewer ? reaction.count - 1 : reaction.count + 1,
                        reactedByViewer: !reaction.reactedByViewer,
                      }
                    : reaction,
                )
              : [...message.reactions, { emoji, count: 1, reactedByViewer: true }],
          };
        }),
      }));
    },
    createChannel: async (name, visibility) => {
      const channel: ChannelSummary = {
        channelId: nextLocalId("channel") as ChannelId,
        name: name.toLocaleLowerCase().replaceAll(/[^a-z0-9_-]+/gu, "-"),
        topic: "",
        description: "",
        visibility,
        unreadCount: 0,
        isMember: true,
      };
      setChannels((current) => [...current, channel]);
      setSelectedChannelId(channel.channelId);
    },
    selectChannel: setSelectedChannelId,
    selectThread: setThreadMessageId,
  };
  return <SlackWorkspaceShell model={model} selectedThreadMessageId={threadMessageId} />;
}

function ConnectedSlackWorkspace() {
  const contextValue = useQuery(clientApi.tenants.viewerContext);
  const bootstrap = useMutation(clientApi.slack.bootstrap);
  const sendMessage = useMutation(clientApi.slack.sendMessage);
  const toggleReaction = useMutation(clientApi.slack.toggleReaction);
  const createChannel = useMutation(clientApi.slack.createChannel);
  const markRead = useMutation(clientApi.slack.markRead);
  const heartbeat = useMutation(clientApi.slack.heartbeat);
  const context = isRecord(contextValue) ? contextValue : null;
  const activeTenantId =
    typeof context?.activeTenantId === "string"
      ? (context.activeTenantId as GenericId<"tenants">)
      : null;
  const tenants = Array.isArray(context?.tenants) ? context.tenants : [];
  const activeTenant = tenants.find(
    (tenant) => isRecord(tenant) && tenant.tenantId === activeTenantId,
  );
  const workspaceName =
    isRecord(activeTenant) && typeof activeTenant.name === "string"
      ? activeTenant.name
      : "Workspace";
  const navigationValue = useQuery(
    clientApi.slack.navigation,
    activeTenantId === null ? "skip" : { tenantId: activeTenantId },
  );
  const navigation = isRecord(navigationValue) ? navigationValue : null;
  const channels = parseChannels(navigation?.channels);
  const members = parseMembers(navigation?.members);
  const [selectedChannelId, setSelectedChannelId] = useState<ChannelId | null>(null);
  const [threadMessageId, setThreadMessageId] = useState<MessageId | null>(null);
  const bootstrappedTenant = useRef<string | null>(null);

  useEffect(() => {
    if (activeTenantId === null || bootstrappedTenant.current === activeTenantId) return;
    bootstrappedTenant.current = activeTenantId;
    void bootstrap({ tenantId: activeTenantId }).catch(() => {
      bootstrappedTenant.current = null;
    });
  }, [activeTenantId, bootstrap]);

  useEffect(() => {
    if (
      selectedChannelId !== null &&
      channels.some((channel) => channel.channelId === selectedChannelId)
    )
      return;
    setSelectedChannelId(channels[0]?.channelId ?? null);
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (activeTenantId === null) return;
    void heartbeat({ tenantId: activeTenantId });
    const interval = window.setInterval(() => void heartbeat({ tenantId: activeTenantId }), 60_000);
    return () => window.clearInterval(interval);
  }, [activeTenantId, heartbeat]);

  useEffect(() => {
    if (selectedChannelId === null) return;
    void markRead({ channelId: selectedChannelId });
  }, [markRead, selectedChannelId]);

  const messagesValue = useQuery(
    clientApi.slack.listMessages,
    selectedChannelId === null ? "skip" : { channelId: selectedChannelId, limit: 75 },
  );
  const repliesValue = useQuery(
    clientApi.slack.listThreadReplies,
    threadMessageId === null ? "skip" : { messageId: threadMessageId },
  );

  if (activeTenantId === null || selectedChannelId === null) {
    return <SlackLoading workspaceName={workspaceName} />;
  }

  const model: WorkspaceModel = {
    workspaceName,
    viewerUserId: typeof navigation?.viewerUserId === "string" ? navigation.viewerUserId : "",
    channels,
    members,
    messages: parseMessages(messagesValue),
    threadReplies: parseMessages(repliesValue),
    selectedChannelId,
    notificationCount:
      typeof navigation?.notificationCount === "number" ? navigation.notificationCount : 0,
    isPreview: false,
    send: async (body, parentMessageId) => {
      await sendMessage({
        channelId: selectedChannelId,
        ...(parentMessageId === undefined ? {} : { parentMessageId }),
        clientId: nextLocalId("client"),
        body,
      });
    },
    react: async (messageId, emoji) => {
      await toggleReaction({ messageId, emoji });
    },
    createChannel: async (name, visibility) => {
      const channelId = await createChannel({
        tenantId: activeTenantId,
        name,
        description: "",
        visibility,
      });
      setSelectedChannelId(channelId as ChannelId);
    },
    selectChannel: setSelectedChannelId,
    selectThread: setThreadMessageId,
  };
  return <SlackWorkspaceShell model={model} selectedThreadMessageId={threadMessageId} />;
}

function SlackLoading({ workspaceName }: { readonly workspaceName: string }) {
  return (
    <SidebarInset className="h-dvh min-h-0 bg-background text-foreground">
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Preparing {workspaceName}…
      </div>
    </SidebarInset>
  );
}

type InspectorMode = "thread" | "activity" | "huddle";

function SlackWorkspaceShell({
  model,
  selectedThreadMessageId,
}: {
  readonly model: WorkspaceModel;
  readonly selectedThreadMessageId: MessageId | null;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [inspector, setInspector] = useState<InspectorMode | null>(null);
  const [search, setSearch] = useState("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const channel =
    model.channels.find((candidate) => candidate.channelId === model.selectedChannelId) ??
    model.channels[0]!;
  const filteredMessages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query.length === 0
      ? model.messages
      : model.messages.filter(
          (message) =>
            message.body.toLocaleLowerCase().includes(query) ||
            message.authorName.toLocaleLowerCase().includes(query),
        );
  }, [model.messages, search]);
  const rootThreadMessage =
    model.messages.find((message) => message.messageId === selectedThreadMessageId) ?? null;

  const openInspector = (mode: InspectorMode) => {
    setInspector((current) => (current === mode ? null : mode));
  };
  const openNavigation = () => {
    setNavOpen(true);
  };
  const closeNavigation = () => {
    setNavOpen(false);
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {navOpen ? (
          <button
            className="absolute inset-0 z-30 bg-black/20 backdrop-blur-[1px] md:hidden"
            aria-label="Close workspace navigation"
            onClick={closeNavigation}
          />
        ) : null}
        <WorkspaceNavigation
          model={model}
          open={navOpen}
          collapsed={navCollapsed}
          onClose={closeNavigation}
          onCollapse={() => setNavCollapsed(true)}
          onCreateChannel={() => setCreateChannelOpen(true)}
          onOpenInspector={openInspector}
        />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <WorkspaceTopbar
            workspaceName={model.workspaceName}
            search={search}
            notificationCount={model.notificationCount}
            onSearchChange={setSearch}
            onOpenNavigation={openNavigation}
            navCollapsed={navCollapsed}
            onExpandNavigation={() => setNavCollapsed(false)}
            onOpenActivity={() => openInspector("activity")}
          />
          <ConversationHeader
            channel={channel}
            members={model.members}
            onOpenHuddle={() => openInspector("huddle")}
          />
          <MessageTimeline
            messages={filteredMessages}
            onReact={model.react}
            onThread={(messageId) => {
              model.selectThread(messageId);
              setInspector("thread");
            }}
          />
          <MessageComposer channelName={channel.name} onSend={(body) => model.send(body)} />
        </main>
        {inspector !== null ? (
          <InspectorPanel
            mode={inspector}
            channel={channel}
            rootMessage={rootThreadMessage}
            replies={model.threadReplies}
            members={model.members}
            onClose={() => setInspector(null)}
            onSendReply={async (body) => {
              if (rootThreadMessage) await model.send(body, rootThreadMessage.messageId);
            }}
            onReact={model.react}
          />
        ) : null}
        <CreateChannelDialog
          open={createChannelOpen}
          onOpenChange={setCreateChannelOpen}
          onCreate={model.createChannel}
        />
      </div>
    </SidebarInset>
  );
}

function WorkspaceTopbar({
  workspaceName,
  search,
  notificationCount,
  onSearchChange,
  onOpenNavigation,
  navCollapsed,
  onExpandNavigation,
  onOpenActivity,
}: {
  readonly workspaceName: string;
  readonly search: string;
  readonly notificationCount: number;
  readonly onSearchChange: (value: string) => void;
  readonly onOpenNavigation: () => void;
  readonly navCollapsed: boolean;
  readonly onExpandNavigation: () => void;
  readonly onOpenActivity: () => void;
}) {
  return (
    <>
      <MobileWorkspaceTopbar
        onOpenNavigation={onOpenNavigation}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              onClick={onOpenActivity}
              aria-label="Open activity"
            >
              <BellIcon />
              {notificationCount > 0 ? (
                <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white">
                  {Math.min(notificationCount, 9)}
                </span>
              ) : null}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Help">
              <CircleHelpIcon />
            </Button>
          </>
        }
      >
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 focus-within:border-foreground/25 focus-within:bg-background">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            placeholder={`Search ${workspaceName}`}
            aria-label={`Search ${workspaceName}`}
          />
        </div>
      </MobileWorkspaceTopbar>
      <header className="hidden h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4 md:flex">
        {navCollapsed ? (
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon-sm"
            onClick={onExpandNavigation}
            aria-label="Show workspace navigation"
          >
            <PanelLeftIcon />
          </Button>
        ) : null}
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="truncate text-sm font-semibold">{workspaceName}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="mx-auto flex h-8 w-full max-w-xl items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 transition-colors focus-within:border-foreground/25 focus-within:bg-background">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            placeholder={`Search ${workspaceName}`}
            aria-label={`Search ${workspaceName}`}
          />
          <kbd className="hidden rounded border border-border/70 bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
            ⌘K
          </kbd>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          onClick={onOpenActivity}
          aria-label="Open activity"
        >
          <BellIcon />
          {notificationCount > 0 ? (
            <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white">
              {Math.min(notificationCount, 9)}
            </span>
          ) : null}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Help">
          <CircleHelpIcon />
        </Button>
      </header>
    </>
  );
}

function WorkspaceNavigation({
  model,
  open,
  collapsed,
  onClose,
  onCollapse,
  onCreateChannel,
  onOpenInspector,
}: {
  readonly model: WorkspaceModel;
  readonly open: boolean;
  readonly collapsed: boolean;
  readonly onClose: () => void;
  readonly onCollapse: () => void;
  readonly onCreateChannel: () => void;
  readonly onOpenInspector: (mode: InspectorMode) => void;
}) {
  return (
    <aside
      className={cn(
        "absolute inset-y-0 left-0 z-40 flex w-[calc(var(--app-nav-rail-width)+250px)] shrink-0 border-r border-border/60 bg-background shadow-xl transition-transform duration-200 md:relative md:z-auto md:w-[250px] md:translate-x-0 md:overflow-hidden md:opacity-100 md:shadow-none md:transition-[width,transform,opacity]",
        open ? "translate-x-0" : "-translate-x-full",
        collapsed &&
          "md:pointer-events-none md:w-0 md:-translate-x-full md:border-r-0 md:opacity-0",
      )}
    >
      <div className="h-full md:hidden [&>nav]:h-full">
        <SidebarAppNavRail pathname="/slack" onNavigate={onClose} />
      </div>
      <div className="flex min-w-[250px] flex-1 flex-col overflow-hidden">
        <div className="workspace-topbar flex min-w-[250px] items-center gap-2 border-b border-border/60 px-3">
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon-sm"
            onClick={onCollapse}
            aria-label="Hide workspace navigation"
          >
            <PanelLeftCloseIcon />
          </Button>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-muted/40 text-xs font-semibold md:hidden">
            {model.workspaceName[0]?.toUpperCase()}
          </div>
          <button className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
            {model.workspaceName}
          </button>
          {model.isPreview ? (
            <span className="mr-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600">
              Preview
            </span>
          ) : null}
          <Button
            className="md:hidden"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <XIcon />
          </Button>
        </div>
        <ScrollArea className="min-h-0 min-w-[250px] flex-1">
          <div className="space-y-5 px-2 py-3">
            <nav className="space-y-0.5">
              <NavRow
                icon={ActivityIcon}
                label="Activity"
                onClick={() => onOpenInspector("activity")}
              />
              <NavRow
                icon={MessageCircleIcon}
                label="Threads"
                onClick={() => onOpenInspector("thread")}
              />
              <NavRow
                icon={AtSignIcon}
                label="Mentions"
                badge={model.notificationCount}
                onClick={() => onOpenInspector("activity")}
              />
              <NavRow icon={BookmarkIcon} label="Later" />
            </nav>
            <NavSection label="Channels" onAdd={onCreateChannel}>
              {model.channels.map((channel) => (
                <button
                  key={channel.channelId}
                  onClick={() => {
                    model.selectChannel(channel.channelId);
                    onClose();
                  }}
                  className={cn(
                    "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
                    model.selectedChannelId === channel.channelId
                      ? "bg-violet-500/12 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
                  )}
                >
                  {channel.visibility === "private" ? (
                    <LockIcon className="size-3.5 shrink-0" />
                  ) : (
                    <HashIcon className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {channel.unreadCount > 0 ? (
                    <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                      {channel.unreadCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </NavSection>
            <NavSection label="Direct messages" onAdd={() => undefined}>
              {model.members.slice(0, 6).map((member) => (
                <button
                  key={member.userId}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground"
                >
                  <PresenceDot presence={member.presence} />
                  <span className="truncate">{member.name}</span>
                  {member.userId === model.viewerUserId ? (
                    <span className="text-[10px]">you</span>
                  ) : null}
                </button>
              ))}
            </NavSection>
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  onAdd,
  children,
}: {
  readonly label: string;
  readonly onAdd?: () => void;
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <div className="mb-1 flex h-6 items-center px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/75">
        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
          <span className="truncate">{label}</span>
        </button>
        {onAdd ? (
          <button
            className="rounded p-1 hover:bg-muted"
            onClick={onAdd}
            aria-label={`Add ${label.toLocaleLowerCase()}`}
          >
            <PlusIcon className="size-3" />
          </button>
        ) : null}
      </div>
      {open ? <div className="space-y-0.5">{children}</div> : null}
    </section>
  );
}

function NavRow({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  readonly icon: typeof ActivityIcon;
  readonly label: string;
  readonly badge?: number;
  readonly onClick?: () => void;
}) {
  return (
    <button
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground"
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      <span className="flex-1 text-left">{label}</span>
      {badge ? <span className="text-[10px] font-semibold text-violet-600">{badge}</span> : null}
    </button>
  );
}

function PresenceDot({ presence }: { readonly presence: MemberSummary["presence"] }) {
  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full border",
        presence === "active"
          ? "border-emerald-500 bg-emerald-500"
          : presence === "away"
            ? "border-amber-500 bg-transparent"
            : "border-muted-foreground/40 bg-transparent",
      )}
    />
  );
}

function ConversationHeader({
  channel,
  members,
  onOpenHuddle,
}: {
  readonly channel: ChannelSummary;
  readonly members: ReadonlyArray<MemberSummary>;
  readonly onOpenHuddle: () => void;
}) {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {channel.visibility === "private" ? (
            <LockIcon className="size-3.5" />
          ) : (
            <HashIcon className="size-4" />
          )}
          <span className="truncate">{channel.name}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {channel.topic || channel.description || "Add a topic"}
        </p>
      </div>
      <div className="hidden items-center -space-x-1.5 sm:flex">
        {members.slice(0, 3).map((member) => (
          <Avatar key={member.userId} className="size-6 border-2 border-background">
            {member.imageUrl ? (
              <AvatarImage src={member.imageUrl} alt={member.name} />
            ) : (
              <AvatarFallback className="text-[8px]">{initials(member.name)}</AvatarFallback>
            )}
          </Avatar>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={onOpenHuddle}>
        <HeadphonesIcon className="size-3.5" />
        <span className="hidden sm:inline">Huddle</span>
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Add people">
        <UserPlusIcon />
      </Button>
    </div>
  );
}

function MessageTimeline({
  messages,
  onReact,
  onThread,
}: {
  readonly messages: ReadonlyArray<MessageSummary>;
  readonly onReact: WorkspaceModel["react"];
  readonly onThread: (messageId: MessageId) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-5xl px-3 py-5 md:px-5 md:py-6">
        {messages.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted">
              <HashIcon className="size-5 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Start the conversation</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Messages, files, agent updates and huddles for this channel will appear here.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageRow
              key={message.messageId}
              message={message}
              onReact={onReact}
              onThread={onThread}
            />
          ))
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}

function MessageRow({
  message,
  onReact,
  onThread,
  compact = false,
}: {
  readonly message: MessageSummary;
  readonly onReact: WorkspaceModel["react"];
  readonly onThread: (messageId: MessageId) => void;
  readonly compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/35 md:px-2",
        compact && "px-2 md:px-2",
      )}
    >
      <Avatar className="mt-0.5 size-9 shrink-0 rounded-lg">
        {message.authorImageUrl ? (
          <AvatarImage src={message.authorImageUrl} alt={message.authorName} />
        ) : (
          <AvatarFallback
            className={cn(
              "rounded-lg text-[10px] font-semibold",
              message.botName ? "bg-violet-500/15 text-violet-700" : "bg-muted",
            )}
          >
            {message.botName ? <BotIcon className="size-4" /> : initials(message.authorName)}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold">{message.authorName}</span>
          {message.botName ? (
            <span className="rounded bg-violet-500/10 px-1 text-[9px] font-bold uppercase tracking-wide text-violet-600">
              bot
            </span>
          ) : null}
          <time className="text-[10px] text-muted-foreground">
            {messageTime(message.createdAt)}
          </time>
          {message.editedAt ? (
            <span className="text-[10px] text-muted-foreground">edited</span>
          ) : null}
        </div>
        <div className="prose prose-sm dark:prose-invert mt-0.5 max-w-none break-words text-[13px] leading-5 [&_p]:m-0 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.body}</ReactMarkdown>
        </div>
        {message.reactions.length > 0 || message.replyCount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => void onReact(message.messageId, reaction.emoji)}
                className={cn(
                  "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
                  reaction.reactedByViewer
                    ? "border-violet-400/50 bg-violet-500/10 text-violet-700"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
            {message.replyCount > 0 ? (
              <button
                onClick={() => onThread(message.messageId)}
                className="ml-1 text-[11px] font-medium text-violet-600 hover:underline"
              >
                {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="absolute right-4 top-1 hidden items-center rounded-lg border border-border/70 bg-background p-0.5 shadow-sm group-hover:flex">
        <button
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Add reaction"
          onClick={() => void onReact(message.messageId, "👍")}
        >
          <SmilePlusIcon className="size-3.5" />
        </button>
        <button
          className="rounded p-1.5 hover:bg-muted"
          aria-label="Reply in thread"
          onClick={() => onThread(message.messageId)}
        >
          <MessageCircleIcon className="size-3.5" />
        </button>
        <button className="rounded p-1.5 hover:bg-muted" aria-label="Save message">
          <BookmarkIcon className="size-3.5" />
        </button>
        <button className="rounded p-1.5 hover:bg-muted" aria-label="More message actions">
          <MoreHorizontalIcon className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

function MessageComposer({
  channelName,
  onSend,
}: {
  readonly channelName: string;
  readonly onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    setBody("");
    try {
      await onSend(value);
    } catch {
      setBody(value);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="shrink-0 px-3 pb-3 pt-2 md:px-5 md:pb-4">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm transition-shadow focus-within:border-foreground/25 focus-within:shadow-md">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-14 resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] shadow-none focus-visible:ring-0"
          placeholder={`Message #${channelName}`}
          aria-label={`Message ${channelName}`}
        />
        <div className="flex h-9 items-center gap-0.5 border-t border-border/45 px-2">
          <Button variant="ghost" size="icon-xs" aria-label="Add attachment">
            <PaperclipIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Add emoji">
            <SmilePlusIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Mention someone">
            <AtSignIcon />
          </Button>
          <div className="flex-1" />
          <span className="mr-2 hidden text-[10px] text-muted-foreground sm:inline">
            Shift + Enter for new line
          </span>
          <Button
            size="icon-xs"
            disabled={!body.trim() || sending}
            onClick={() => void submit()}
            aria-label="Send message"
          >
            <SendIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InspectorPanel({
  mode,
  channel,
  rootMessage,
  replies,
  members,
  onClose,
  onSendReply,
  onReact,
}: {
  readonly mode: InspectorMode;
  readonly channel: ChannelSummary;
  readonly rootMessage: MessageSummary | null;
  readonly replies: ReadonlyArray<MessageSummary>;
  readonly members: ReadonlyArray<MemberSummary>;
  readonly onClose: () => void;
  readonly onSendReply: (body: string) => Promise<void>;
  readonly onReact: WorkspaceModel["react"];
}) {
  const titles: Record<InspectorMode, string> = {
    thread: "Thread",
    activity: "Activity",
    huddle: "Huddle",
  };
  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[390px] flex-col border-l border-border/60 bg-background shadow-2xl md:relative md:z-auto md:w-[360px] md:shadow-none">
      <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{titles[mode]}</h2>
          <p className="truncate text-[10px] text-muted-foreground">#{channel.name}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <XIcon />
        </Button>
      </div>
      {mode === "thread" ? (
        <ThreadPanel
          rootMessage={rootMessage}
          replies={replies}
          onSend={onSendReply}
          onReact={onReact}
        />
      ) : null}
      {mode === "activity" ? <ActivityPanel /> : null}
      {mode === "huddle" ? <HuddlePanel channel={channel} members={members} /> : null}
    </aside>
  );
}

function ThreadPanel({
  rootMessage,
  replies,
  onSend,
  onReact,
}: {
  readonly rootMessage: MessageSummary | null;
  readonly replies: ReadonlyArray<MessageSummary>;
  readonly onSend: (body: string) => Promise<void>;
  readonly onReact: WorkspaceModel["react"];
}) {
  if (!rootMessage)
    return (
      <InspectorEmpty
        icon={MessageCircleIcon}
        title="Choose a thread"
        detail="Open a message thread to keep focused replies together."
      />
    );
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-3">
          <MessageRow message={rootMessage} onReact={onReact} onThread={() => undefined} compact />
          <div className="my-2 flex items-center gap-2 px-3 text-[10px] font-medium text-muted-foreground">
            <span>{replies.length} replies</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {replies.map((reply) => (
            <MessageRow
              key={reply.messageId}
              message={reply}
              onReact={onReact}
              onThread={() => undefined}
              compact
            />
          ))}
        </div>
      </ScrollArea>
      <MessageComposer channelName="thread" onSend={onSend} />
    </>
  );
}

function ActivityPanel() {
  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border/55">
        <ActivityItem
          icon={AtSignIcon}
          title="Maya mentioned you"
          detail="Can you review the rollout checklist before the huddle?"
          time="12m"
        />
        <ActivityItem
          icon={MessageCircleIcon}
          title="New reply in #product"
          detail="Jules replied to your launch note."
          time="38m"
        />
        <ActivityItem
          icon={SmilePlusIcon}
          title="3 new reactions"
          detail="Your Convex update received 🚀 and ✅."
          time="1h"
        />
        <ActivityItem
          icon={BotIcon}
          title="Codex finished a task"
          detail="Repository validation completed successfully."
          time="2h"
        />
      </div>
    </ScrollArea>
  );
}
function ActivityItem({
  icon: Icon,
  title,
  detail,
  time,
}: {
  readonly icon: typeof ActivityIcon;
  readonly title: string;
  readonly detail: string;
  readonly time: string;
}) {
  return (
    <button className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/35">
      <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex gap-2">
          <span className="flex-1 text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </button>
  );
}

function HuddlePanel({
  channel,
  members,
}: {
  readonly channel: ChannelSummary;
  readonly members: ReadonlyArray<MemberSummary>;
}) {
  const [joined, setJoined] = useState(false);
  const [camera, setCamera] = useState(false);
  const [muted, setMuted] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-2xl bg-foreground p-5 text-background">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <HeadphonesIcon className="size-4" />#{channel.name} huddle
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {members.slice(0, 4).map((member) => (
              <div
                key={member.userId}
                className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-background/10"
              >
                <Avatar className="size-12">
                  <AvatarFallback className="bg-background/15 text-background">
                    {initials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-2 left-2 text-[10px] font-medium">
                  {member.name}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              <HeadphonesIcon className={muted ? "text-destructive" : ""} />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setCamera((value) => !value)}
              aria-label={camera ? "Turn camera off" : "Turn camera on"}
            >
              <VideoIcon className={camera ? "text-violet-600" : ""} />
            </Button>
            <Button
              variant={joined ? "destructive" : "secondary"}
              size="sm"
              onClick={() => setJoined((value) => !value)}
            >
              {joined ? "Leave" : "Join huddle"}
            </Button>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
          Audio, video and screen sharing use the configured Cloudflare RealtimeKit provider.
          Participant tokens are issued by the Convex action boundary.
        </p>
      </div>
    </div>
  );
}

function InspectorEmpty({
  icon: Icon,
  title,
  detail,
}: {
  readonly icon: typeof MessageCircleIcon;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

function CreateChannelDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: WorkspaceModel["createChannel"];
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate(name, visibility);
      setName("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Create a channel</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Channels keep conversations, files and workflows organized around a topic.
        </p>
        <div className="mt-2 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Name</span>
            <div className="relative">
              <HashIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="pl-9"
                placeholder="project-launch"
                autoFocus
              />
            </div>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium">Visibility</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility("public")}
                className={cn(
                  "rounded-lg border p-3 text-left",
                  visibility === "public" ? "border-violet-400 bg-violet-500/8" : "border-border",
                )}
              >
                <HashIcon className="size-4" />
                <div className="mt-2 text-xs font-medium">Public</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Anyone can find and join
                </div>
              </button>
              <button
                onClick={() => setVisibility("private")}
                className={cn(
                  "rounded-lg border p-3 text-left",
                  visibility === "private" ? "border-violet-400 bg-violet-500/8" : "border-border",
                )}
              >
                <LockIcon className="size-4" />
                <div className="mt-2 text-xs font-medium">Private</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">Only invited members</div>
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
              Create channel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
