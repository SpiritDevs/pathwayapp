import {
  AlertCircleIcon,
  ChevronLeftIcon,
  CloudIcon,
  DownloadIcon,
  InboxIcon,
  LoaderCircleIcon,
  MailIcon,
  MailOpenIcon,
  PaperclipIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import type {
  EmailAttachmentId,
  EmailMessageAttachment,
  EmailMessageDetail,
  EmailMessageId,
  EmailMessageSummary,
  TimestampFormat,
} from "@pathwayos/contracts";

import { usePrimarySettings } from "../hooks/useSettings";
import { useProjects } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import {
  formatChatTimestampTooltip,
  formatRelativeTimeLabel,
  formatTimestamp,
} from "../timestampFormat";
import { SidebarInset } from "../components/ui/sidebar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { cn } from "../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { MobileWorkspaceTopbar } from "../components/MobileWorkspaceTopbar";
import { useRelativeTimeTick } from "../components/settings/settingsLayout";
import { useEmailSandbox } from "./useEmailSandbox";
import { useCloudWorkspace } from "../cloud/CloudWorkspaceProvider";
import { EMAIL_SYNC_STATE_META, formatBytes, runtimePhaseLabel } from "./format";
import { emailInboxFiltersAtom } from "./inboxFiltersAtom";
import { emailSourceAtom } from "./emailSourceAtom";
import {
  EMPTY_EMAIL_INBOX_FILTERS,
  countAdvancedEmailFilters,
  filterEmailMessages,
  hasActiveEmailFilters,
  type EmailInboxFilters,
} from "./inboxModel";

function formatAddress(addresses: ReadonlyArray<EmailMessageSummary["from"][number]>): string {
  if (addresses.length === 0) return "Unknown sender";
  return addresses.map((entry) => entry.name?.trim() || entry.address).join(", ");
}

function phaseBadgeVariant(phase: string): "success" | "error" | "info" | "outline" {
  if (phase === "running") return "success";
  if (phase === "failed" || phase === "degraded") return "error";
  if (phase === "disabled") return "outline";
  return "info";
}

function SyncStateDot({ syncState }: { readonly syncState: EmailMessageSummary["syncState"] }) {
  const meta = EMAIL_SYNC_STATE_META[syncState];
  return (
    <span
      aria-label={meta.label}
      className={cn("size-1.5 shrink-0 rounded-full", meta.dotClass)}
      role="img"
      title={meta.label}
    />
  );
}

function InboxFilters({
  value,
  onChange,
}: {
  readonly value: EmailInboxFilters;
  readonly onChange: (value: EmailInboxFilters) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const update = <K extends keyof EmailInboxFilters>(key: K, next: EmailInboxFilters[K]) =>
    onChange({ ...value, [key]: next });
  const advancedCount = countAdvancedEmailFilters(value);
  const hasFilters = hasActiveEmailFilters(value);
  const showAdvanced = advancedOpen || advancedCount > 0;

  return (
    <div className="border-b border-border bg-muted/20 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search email"
            className="h-8 pl-8 text-xs"
            onChange={(event) => update("search", event.target.value)}
            placeholder="Search subject or addresses"
            value={value.search}
          />
        </div>
        <Select
          onValueChange={(next) =>
            next && update("syncState", next as EmailInboxFilters["syncState"])
          }
          value={value.syncState}
        >
          <SelectTrigger aria-label="Filter by sync status" className="h-8 w-36 text-xs">
            <SelectValue>
              {value.syncState === "all"
                ? "All statuses"
                : EMAIL_SYNC_STATE_META[value.syncState].label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="local">Local only</SelectItem>
            <SelectItem value="pending">Waiting to sync</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="failed">Sync failed</SelectItem>
            <SelectItem value="deleted">Removed from sync</SelectItem>
          </SelectPopup>
        </Select>
        <Button
          aria-expanded={showAdvanced}
          className="h-8"
          onClick={() => setAdvancedOpen((open) => !open)}
          size="xs"
          variant={showAdvanced ? "secondary" : "ghost"}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          Filters
          {advancedCount > 0 ? (
            <Badge size="sm" variant="secondary">
              {advancedCount}
            </Badge>
          ) : null}
        </Button>
        {hasFilters ? (
          <Button
            className="h-8"
            onClick={() => {
              onChange(EMPTY_EMAIL_INBOX_FILTERS);
              setAdvancedOpen(false);
            }}
            size="xs"
            variant="ghost"
          >
            <XIcon className="size-3.5" /> Clear
          </Button>
        ) : null}
      </div>
      {showAdvanced ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            aria-label="Filter by sender"
            className="h-8 text-xs"
            onChange={(event) => update("sender", event.target.value)}
            placeholder="Sender"
            value={value.sender}
          />
          <Input
            aria-label="Filter by recipient"
            className="h-8 text-xs"
            onChange={(event) => update("recipient", event.target.value)}
            placeholder="Recipient"
            value={value.recipient}
          />
          <Input
            aria-label="Filter by subject"
            className="h-8 text-xs"
            onChange={(event) => update("subject", event.target.value)}
            placeholder="Subject"
            value={value.subject}
          />
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Received from"
              className="h-8 text-xs"
              onChange={(event) => update("receivedFrom", event.target.value)}
              type="date"
              value={value.receivedFrom}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              aria-label="Received to"
              className="h-8 text-xs"
              onChange={(event) => update("receivedTo", event.target.value)}
              type="date"
              value={value.receivedTo}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageListRow({
  message,
  selected,
  timestampFormat,
  onSelect,
  onContextMenu,
}: {
  readonly message: EmailMessageSummary;
  readonly selected: boolean;
  readonly timestampFormat: TimestampFormat;
  readonly onSelect: (message: EmailMessageSummary) => void;
  readonly onContextMenu: (message: EmailMessageSummary, x: number, y: number) => void;
}) {
  const unread = message.readAt === null;
  return (
    <button
      className={cn(
        "flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent/70" : "hover:bg-muted/40",
      )}
      onClick={() => onSelect(message)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(message, event.clientX, event.clientY);
      }}
      type="button"
    >
      <span className="mt-[5px] flex size-2 shrink-0 items-center justify-center">
        {unread ? (
          <span aria-label="Unread" className="size-1.5 rounded-full bg-primary" role="img" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-xs",
              unread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
            )}
          >
            {formatAddress(message.from)}
          </span>
          <span
            className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
            title={formatChatTimestampTooltip(message.receivedAt, timestampFormat)}
          >
            {formatRelativeTimeLabel(message.receivedAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              unread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {message.subject || "(no subject)"}
          </span>
          {message.attachmentCount > 0 ? (
            <PaperclipIcon
              aria-label="Has attachments"
              className="size-3 shrink-0 text-muted-foreground"
              role="img"
            />
          ) : null}
          <SyncStateDot syncState={message.syncState} />
        </span>
      </span>
    </button>
  );
}

function AttachmentRow({
  attachment,
  onDownload,
}: {
  readonly attachment: EmailMessageAttachment;
  readonly onDownload: (attachmentId: EmailAttachmentId) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.filename || "(unnamed file)"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {attachment.contentType} · {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
      {attachment.blobStatus === "skipped" || attachment.blobStatus === "failed" ? (
        <Badge size="sm" variant={attachment.blobStatus === "failed" ? "error" : "warning"}>
          {attachment.blobStatus === "failed" ? "Upload failed" : "Not synced"}
        </Badge>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={`Download ${attachment.filename || "attachment"}`}
              onClick={() => void onDownload(attachment.attachmentId)}
              size="icon-xs"
              variant="ghost"
            />
          }
        >
          <DownloadIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">Download attachment</TooltipPopup>
      </Tooltip>
    </div>
  );
}

function MessageBody({ detail }: { readonly detail: EmailMessageDetail }) {
  const [bodyView, setBodyView] = useState<"html" | "text">(detail.html ? "html" : "text");
  const hasBoth = Boolean(detail.html) && Boolean(detail.text);
  const truncated = bodyView === "html" ? detail.htmlTruncated : detail.textTruncated;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasBoth ? (
        <div className="flex items-center justify-between gap-2 px-5 pt-3">
          <ToggleGroup
            onValueChange={(next) => {
              const view = next[0];
              if (view === "html" || view === "text") setBodyView(view);
            }}
            size="xs"
            value={[bodyView]}
            variant="outline"
          >
            <Toggle aria-label="Show rendered HTML preview" value="html">
              Preview
            </Toggle>
            <Toggle aria-label="Show plain text body" value="text">
              Plain text
            </Toggle>
          </ToggleGroup>
          {truncated ? (
            <span className="text-[11px] text-muted-foreground">
              Body truncated by sync size limits.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
        {bodyView === "html" && detail.html ? (
          <iframe
            className="min-h-[360px] w-full flex-1 rounded-lg border bg-white p-4"
            sandbox=""
            srcDoc={detail.html}
            title="Email HTML body"
          />
        ) : detail.text ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{detail.text}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">This message has no readable body.</p>
        )}
      </div>
    </div>
  );
}

const SETUP_STEPS = [
  "Enable the developer email server",
  "Turn on capture for a project",
  "Send mail to its SMTP port",
] as const;

function EmailSandboxSetupGuide() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Empty className="min-h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>Set up the email sandbox</EmptyTitle>
          <EmptyDescription>
            Capture the email your projects send, privately on this machine.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ol className="space-y-2 text-left">
            {SETUP_STEPS.map((step, index) => (
              <li className="flex items-center gap-2.5" key={step}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-[10px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="text-xs text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <Button render={<Link to="/settings/email" />} size="sm">
            <SettingsIcon className="size-3.5" /> Open email settings
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

const ACCOUNT_PROVIDERS = [
  { label: "Connect Gmail", Icon: MailIcon },
  { label: "Connect Outlook", Icon: CloudIcon },
] as const;

function EmailAccountView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <MobileWorkspaceTopbar title="Email" />
        <header
          className={cn(
            "workspace-topbar hidden items-center gap-3 border-b border-border px-4 sm:px-5 md:flex",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <MailIcon className="size-3.5" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em]">
            Email
          </h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Empty className="min-h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MailIcon />
              </EmptyMedia>
              <EmptyTitle>Connect your email</EmptyTitle>
              <EmptyDescription>
                Link an account to read your email here, alongside the local SMTP sandbox.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {ACCOUNT_PROVIDERS.map(({ label, Icon }) => (
                  <Button
                    key={label}
                    render={<Link to="/settings/email" />}
                    size="sm"
                    variant="outline"
                  >
                    <Icon className="size-3.5" /> {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Providers are managed in Settings → Email.
              </p>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    </SidebarInset>
  );
}

function MessageDetail({
  detail,
  selected,
  loading,
  error,
  timestampFormat,
  onBack,
  onDownloadAttachment,
}: {
  readonly detail: EmailMessageDetail | null;
  readonly selected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly timestampFormat: TimestampFormat;
  readonly onBack: () => void;
  readonly onDownloadAttachment: (
    messageId: EmailMessageId,
    attachmentId: EmailAttachmentId,
  ) => Promise<void>;
}) {
  if (!detail) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {selected ? (
          <div className="px-4 pt-3 md:hidden">
            <Button
              aria-label="Back to message list"
              onClick={onBack}
              size="icon-xs"
              variant="ghost"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
          </div>
        ) : null}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {loading ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : error !== null ? (
                <AlertCircleIcon />
              ) : (
                <MailOpenIcon />
              )}
            </EmptyMedia>
            <EmptyTitle className="text-sm">
              {loading
                ? "Loading message"
                : error !== null
                  ? "Could not load this message"
                  : "No message selected"}
            </EmptyTitle>
            <EmptyDescription className="text-xs">
              {loading
                ? "Fetching the message body and attachments."
                : (error ?? "Select a message to inspect its body and attachments.")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  const syncMeta = EMAIL_SYNC_STATE_META[detail.summary.syncState];
  const envelope: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: "From", value: formatAddress(detail.summary.from) },
    { label: "To", value: formatAddress(detail.summary.to) },
    ...(detail.cc.length > 0 ? [{ label: "Cc", value: formatAddress(detail.cc) }] : []),
    ...(detail.replyTo.length > 0
      ? [{ label: "Reply-To", value: formatAddress(detail.replyTo) }]
      : []),
    { label: "Received", value: formatTimestamp(detail.summary.receivedAt, timestampFormat) },
  ];
  return (
    <article className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-5 py-4">
        <div className="flex items-start gap-2">
          <Button
            aria-label="Back to message list"
            className="md:hidden"
            onClick={onBack}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <h2 className="min-w-0 flex-1 text-base font-semibold tracking-[-0.01em]">
            {detail.summary.subject || "(no subject)"}
          </h2>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", syncMeta.dotClass)} />
            {syncMeta.label}
          </span>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {envelope.map((row) => (
            <div className="contents" key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 truncate" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>
      <MessageBody detail={detail} key={detail.summary.messageId} />
      {detail.attachments.length > 0 ? (
        <section className="border-t px-5 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Attachments ({detail.attachments.length})
          </h3>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {detail.attachments.map((attachment) => (
              <AttachmentRow
                attachment={attachment}
                key={attachment.attachmentId}
                onDownload={(attachmentId) =>
                  onDownloadAttachment(detail.summary.messageId, attachmentId)
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function EmailInboxView() {
  const source = useAtomValue(emailSourceAtom);
  return source === "account" ? <EmailAccountView /> : <EmailSandboxView />;
}

function EmailSandboxView() {
  const settings = usePrimarySettings();
  const sandbox = useEmailSandbox();
  const cloudWorkspace = useCloudWorkspace();
  const environmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const filters = useAtomValue(emailInboxFiltersAtom);
  const setFilters = useAtomSet(emailInboxFiltersAtom);
  const [selectedMessageId, setSelectedMessageId] = useState<EmailMessageId | null>(null);
  const [clearMode, setClearMode] = useState<"local" | "synced" | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useRelativeTimeTick(30_000);

  const projectOptions = useMemo(
    () => projects.filter((project) => project.environmentId === sandbox.environmentId),
    [projects, sandbox.environmentId],
  );
  const selectedProject = projectOptions.find((project) => project.id === filters.projectId);
  const messagesQuery = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.emailSandboxMessages({
          environmentId,
          input: {
            limit: 200,
            ...(selectedProject ? { projectId: selectedProject.id } : {}),
            ...(filters.search.trim() ? { query: filters.search.trim() } : {}),
          },
        }),
  );
  const detailQuery = useEnvironmentQuery(
    environmentId === null || selectedMessageId === null
      ? null
      : serverEnvironment.emailSandboxMessage({
          environmentId,
          input: { messageId: selectedMessageId },
        }),
  );
  const markRead = useAtomCommand(serverEnvironment.markEmailSandboxMessageRead, {
    reportFailure: false,
  });
  const deleteMessage = useAtomCommand(serverEnvironment.deleteEmailSandboxMessage, {
    reportFailure: false,
  });
  const getAttachment = useAtomCommand(serverEnvironment.getEmailSandboxAttachment, {
    reportFailure: false,
  });
  const [contextMenu, setContextMenu] = useState<{
    readonly message: EmailMessageSummary;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (deleteCountdown === null) return;
    const timer = setTimeout(() => {
      setDeleteCountdown((current) => (current === null || current <= 1 ? null : current - 1));
    }, 1_000);
    return () => clearTimeout(timer);
  }, [deleteCountdown]);
  const visibleMessages = useMemo(
    () => filterEmailMessages(messagesQuery.data?.messages ?? [], filters),
    [filters, messagesQuery.data?.messages],
  );
  const unreadCount = useMemo(
    () => visibleMessages.filter((message) => message.readAt === null).length,
    [visibleMessages],
  );
  const selectedDetail = detailQuery.data;
  const phase =
    sandbox.runtimeStatus?.phase ?? (settings.enableDeveloperEmailServer ? "starting" : "disabled");
  const needsSetup =
    !settings.enableDeveloperEmailServer && (messagesQuery.data?.messages.length ?? 0) === 0;

  const clearCache = async () => {
    setClearing(true);
    setClearError(null);
    try {
      if (clearMode === "synced") {
        await cloudWorkspace.clearSyncedEmailHistory();
      } else {
        await sandbox.clearLocalCache();
        setSelectedMessageId(null);
        messagesQuery.refresh();
      }
      setClearMode(null);
    } catch (error) {
      setClearError(
        error instanceof Error
          ? error.message
          : clearMode === "synced"
            ? "Could not clear synced history."
            : "Could not clear the local cache.",
      );
    } finally {
      setClearing(false);
    }
  };

  const downloadAttachment = async (messageId: EmailMessageId, attachmentId: EmailAttachmentId) => {
    setDownloadError(null);
    try {
      // Attachment bytes are captured on this machine, so serve them locally
      // and only fall back to the cloud copy when the local cache was cleared.
      if (environmentId !== null) {
        const local = await getAttachment({ environmentId, input: { messageId, attachmentId } });
        if (local._tag === "Success" && local.value !== null) {
          const bytes = Uint8Array.from(atob(local.value.contentBase64), (char) =>
            char.charCodeAt(0),
          );
          const blob = new Blob([bytes], { type: local.value.attachment.contentType });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = local.value.attachment.filename || "attachment";
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          return;
        }
      }
      const download = await cloudWorkspace.getEmailAttachmentDownload({
        messageId,
        attachmentId,
      });
      if (download === null) {
        throw new Error("This attachment is not available locally or from cloud storage.");
      }
      const anchor = document.createElement("a");
      anchor.href = download.url;
      anchor.download = download.filename;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download attachment.");
    }
  };

  const toggleRead = async (message: EmailMessageSummary) => {
    if (environmentId === null) return;
    await markRead({
      environmentId,
      input: { messageId: message.messageId, read: message.readAt === null },
    });
    messagesQuery.refresh();
  };

  const confirmDeleteMessage = async (message: EmailMessageSummary) => {
    if (environmentId === null) return;
    const result = await deleteMessage({
      environmentId,
      input: { messageId: message.messageId },
    });
    setContextMenu(null);
    setDeleteCountdown(null);
    if (result._tag === "Success") {
      if (selectedMessageId === message.messageId) setSelectedMessageId(null);
      messagesQuery.refresh();
    }
  };

  const selectMessage = (message: EmailMessageSummary) => {
    setSelectedMessageId(message.messageId);
    if (environmentId !== null && message.readAt === null) {
      void markRead({
        environmentId,
        input: { messageId: message.messageId, read: true },
      }).then(() => {
        messagesQuery.refresh();
      });
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <MobileWorkspaceTopbar
          title="Email sandbox"
          actions={
            <>
              <Badge size="sm" variant={phaseBadgeVariant(phase)}>
                {sandbox.isPending ? (
                  <LoaderCircleIcon className="size-3 animate-spin" />
                ) : (
                  <ServerIcon className="size-3" />
                )}
                <span className="sr-only">{runtimePhaseLabel(phase)}</span>
              </Badge>
              <Button
                aria-label="Refresh inbox"
                onClick={() => {
                  sandbox.refresh();
                  messagesQuery.refresh();
                  detailQuery.refresh();
                }}
                size="icon-xs"
                variant="ghost"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
              <Menu>
                <MenuTrigger
                  render={
                    <Button aria-label="Clear email history" size="icon-xs" variant="ghost" />
                  }
                >
                  <Trash2Icon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem
                    onClick={() => {
                      setClearError(null);
                      setClearMode("local");
                    }}
                  >
                    Clear local cache…
                  </MenuItem>
                  <MenuItem
                    disabled={cloudWorkspace.selectedEmailSandboxId === null}
                    onClick={() => {
                      setClearError(null);
                      setClearMode("synced");
                    }}
                  >
                    Clear synced history…
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </>
          }
        />
        <header
          className={cn(
            "workspace-topbar hidden items-center gap-3 border-b border-border px-4 sm:px-5 md:flex",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <MailIcon className="size-3.5" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em]">
            Email sandbox
          </h1>
          <Badge size="sm" variant={phaseBadgeVariant(phase)}>
            {sandbox.isPending ? (
              <LoaderCircleIcon className="size-3 animate-spin" />
            ) : (
              <ServerIcon className="size-3" />
            )}
            {runtimePhaseLabel(phase)}
          </Badge>
          {cloudWorkspace.available && cloudWorkspace.emailSandboxes.length > 0 ? (
            <Select
              onValueChange={(value) => cloudWorkspace.selectEmailSandbox(value)}
              value={cloudWorkspace.selectedEmailSandboxId}
            >
              <SelectTrigger aria-label="Cloud email sandbox" className="h-7 max-w-48 text-xs">
                <SelectValue placeholder="Select cloud sandbox">
                  {
                    cloudWorkspace.emailSandboxes.find(
                      (cloudSandbox) =>
                        cloudSandbox.sandboxId === cloudWorkspace.selectedEmailSandboxId,
                    )?.displayName
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {cloudWorkspace.emailSandboxes.map((cloudSandbox) => (
                  <SelectItem key={cloudSandbox.sandboxId} value={cloudSandbox.sandboxId}>
                    {cloudSandbox.displayName}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Refresh inbox"
                  onClick={() => {
                    sandbox.refresh();
                    messagesQuery.refresh();
                    detailQuery.refresh();
                  }}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            >
              <RefreshCwIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="bottom">Refresh inbox</TooltipPopup>
          </Tooltip>
          <Menu>
            <MenuTrigger
              render={<Button aria-label="Clear email history" size="icon-xs" variant="ghost" />}
            >
              <Trash2Icon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                onClick={() => {
                  setClearError(null);
                  setClearMode("local");
                }}
              >
                Clear local cache…
              </MenuItem>
              <MenuItem
                disabled={cloudWorkspace.selectedEmailSandboxId === null}
                onClick={() => {
                  setClearError(null);
                  setClearMode("synced");
                }}
              >
                Clear synced history…
              </MenuItem>
            </MenuPopup>
          </Menu>
        </header>

        {needsSetup ? (
          <EmailSandboxSetupGuide />
        ) : (
          <>
            <InboxFilters onChange={setFilters} value={filters} />

            {!settings.enableDeveloperEmailServer ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/20 bg-amber-500/8 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
                Developer email capture is disabled.
                <Link className="font-medium underline underline-offset-2" to="/settings/email">
                  Enable it in Settings → Email
                </Link>
              </div>
            ) : sandbox.error ? (
              <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-xs text-destructive">
                <AlertCircleIcon className="size-3.5" /> {sandbox.error}
              </div>
            ) : messagesQuery.error ? (
              <div className="border-b border-border/70 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                {messagesQuery.error} Captured messages remain safe in Mailpit while this connection
                is unavailable.
              </div>
            ) : downloadError ? (
              <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-xs text-destructive">
                <AlertCircleIcon className="size-3.5" /> {downloadError}
              </div>
            ) : null}

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
              <section
                className={cn(
                  "min-h-0 flex-col border-r border-border/70",
                  selectedMessageId === null ? "flex" : "hidden md:flex",
                )}
              >
                <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-4 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {visibleMessages.length} {visibleMessages.length === 1 ? "message" : "messages"}
                    {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
                    {(messagesQuery.data?.messages.length ?? 0) >= 200 ? " · newest 200 only" : ""}
                  </span>
                  {sandbox.runtimeStatus && sandbox.runtimeStatus.pendingMessageCount > 0 ? (
                    <span>{sandbox.runtimeStatus.pendingMessageCount} pending sync</span>
                  ) : null}
                </div>
                {visibleMessages.length > 0 ? (
                  <div className="min-h-0 overflow-y-auto">
                    {visibleMessages.map((message) => (
                      <MessageListRow
                        key={message.messageId}
                        message={message}
                        onContextMenu={(target, x, y) => {
                          setDeleteCountdown(null);
                          setContextMenu({ message: target, x, y });
                        }}
                        onSelect={selectMessage}
                        selected={selectedMessageId === message.messageId}
                        timestampFormat={settings.timestampFormat}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty className="p-6 md:p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        {messagesQuery.isPending ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <InboxIcon />
                        )}
                      </EmptyMedia>
                      <EmptyTitle className="text-sm">
                        {messagesQuery.isPending ? "Loading messages" : "No messages to show"}
                      </EmptyTitle>
                      <EmptyDescription className="text-xs leading-5">
                        {messagesQuery.isPending
                          ? "Loading captured messages from this environment."
                          : hasActiveEmailFilters(filters)
                            ? "No captured messages match the current filters."
                            : "Send a message through a project SMTP source and it will appear here."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
              <section
                className={cn(
                  "min-h-0 bg-card/20",
                  selectedMessageId === null ? "hidden md:block" : "block",
                )}
              >
                <MessageDetail
                  detail={selectedDetail}
                  error={selectedMessageId === null ? null : (detailQuery.error ?? null)}
                  loading={selectedMessageId !== null && detailQuery.isPending}
                  onBack={() => setSelectedMessageId(null)}
                  selected={selectedMessageId !== null}
                  onDownloadAttachment={downloadAttachment}
                  timestampFormat={settings.timestampFormat}
                />
              </section>
            </div>
          </>
        )}
      </div>

      {contextMenu !== null ? (
        <Menu
          onOpenChange={(open) => {
            if (!open) {
              setContextMenu(null);
              setDeleteCountdown(null);
            }
          }}
          open
        >
          <MenuPopup
            align="start"
            anchor={{
              getBoundingClientRect: () =>
                DOMRect.fromRect({ x: contextMenu.x, y: contextMenu.y, width: 0, height: 0 }),
            }}
            className="text-xs"
            side="bottom"
          >
            <MenuItem onClick={() => selectMessage(contextMenu.message)}>Open</MenuItem>
            <MenuItem onClick={() => void toggleRead(contextMenu.message)}>
              {contextMenu.message.readAt === null ? "Mark as read" : "Mark as unread"}
            </MenuItem>
            <MenuItem
              onClick={() => void navigator.clipboard.writeText(contextMenu.message.subject)}
            >
              Copy subject
            </MenuItem>
            <MenuItem
              onClick={() =>
                void navigator.clipboard.writeText(contextMenu.message.from[0]?.address ?? "")
              }
            >
              Copy sender address
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              className="text-destructive data-highlighted:text-destructive"
              closeOnClick={false}
              onClick={() => {
                if (deleteCountdown === null) {
                  setDeleteCountdown(5);
                  return;
                }
                void confirmDeleteMessage(contextMenu.message);
              }}
            >
              {deleteCountdown === null
                ? "Delete message…"
                : `Click again to delete (${deleteCountdown})`}
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}

      <AlertDialog
        open={clearMode !== null}
        onOpenChange={(open) => {
          if (!open) setClearMode(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearMode === "synced" ? "Clear synced email history?" : "Clear local email cache?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clearMode === "synced"
                ? "Synced messages and their cloud attachments will be deleted from this sandbox on every signed-in device. Local and unsynced messages are retained."
                : "Synced messages will remain available from your account. Messages still waiting to sync are retained so they are not lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {clearError ? <p className="px-1 text-xs text-destructive">{clearError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogClose disabled={clearing} render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button disabled={clearing} onClick={() => void clearCache()} variant="destructive">
              {clearing ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {clearMode === "synced" ? "Clear synced history" : "Clear local cache"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </SidebarInset>
  );
}
