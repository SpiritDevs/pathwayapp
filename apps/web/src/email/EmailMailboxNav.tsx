import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { InboxIcon, MailIcon, PaperclipIcon } from "lucide-react";
import { useMemo } from "react";
import type { EmailMessageSummary } from "@pathwayos/contracts";

import { usePrimaryEnvironmentId } from "../state/environments";
import { useProjects } from "../state/entities";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../components/ui/sidebar";
import { cn } from "../lib/utils";
import { useEmailSandbox } from "./useEmailSandbox";
import { emailInboxFiltersAtom } from "./inboxFiltersAtom";
import { EMAIL_SYNC_STATE_META } from "./format";
import { matchesEmailMailbox, type EmailMailbox } from "./inboxModel";

const MAILBOXES: ReadonlyArray<{
  readonly mailbox: EmailMailbox;
  readonly label: string;
  readonly icon: typeof InboxIcon;
}> = [
  { mailbox: "inbox", label: "Inbox", icon: InboxIcon },
  { mailbox: "unread", label: "Unread", icon: MailIcon },
  { mailbox: "attachments", label: "Attachments", icon: PaperclipIcon },
];

const SYNC_STATES = ["local", "pending", "synced", "failed", "deleted"] as const;

function NavCount({ value }: { readonly value: number }) {
  if (value === 0) return null;
  return <SidebarMenuBadge className="text-[10px] text-muted-foreground">{value}</SidebarMenuBadge>;
}

export function EmailMailboxNav() {
  const environmentId = usePrimaryEnvironmentId();
  const sandbox = useEmailSandbox();
  const projects = useProjects();
  const filters = useAtomValue(emailInboxFiltersAtom);
  const setFilters = useAtomSet(emailInboxFiltersAtom);

  const messagesQuery = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.emailSandboxMessages({ environmentId, input: { limit: 200 } }),
  );
  const messages: ReadonlyArray<EmailMessageSummary> = messagesQuery.data?.messages ?? [];

  const mailboxCounts = useMemo(
    () =>
      Object.fromEntries(
        MAILBOXES.map(({ mailbox }) => [
          mailbox,
          messages.filter((message) => matchesEmailMailbox(message, mailbox)).length,
        ]),
      ) as Record<EmailMailbox, number>,
    [messages],
  );
  const projectItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (message.projectId !== null) {
        counts.set(message.projectId, (counts.get(message.projectId) ?? 0) + 1);
      }
    }
    return projects
      .filter((project) => project.environmentId === sandbox.environmentId)
      .map((project) => ({
        id: project.id,
        title: project.title,
        count: counts.get(project.id) ?? 0,
        captureEnabled:
          sandbox.projectSources.find((source) => source.projectId === project.id)
            ?.captureEnabled ?? false,
      }))
      .filter((project) => project.count > 0 || project.captureEnabled);
  }, [messages, projects, sandbox.environmentId, sandbox.projectSources]);
  const statusItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      counts.set(message.syncState, (counts.get(message.syncState) ?? 0) + 1);
    }
    return SYNC_STATES.map((state) => ({
      state,
      count: counts.get(state) ?? 0,
      meta: EMAIL_SYNC_STATE_META[state],
    })).filter((item) => item.count > 0 || filters.syncState === item.state);
  }, [filters.syncState, messages]);

  return (
    <>
      <SidebarGroup className="px-2 py-1">
        <SidebarGroupLabel>Mailbox</SidebarGroupLabel>
        <SidebarMenu className="gap-0.5">
          {MAILBOXES.map(({ mailbox, label, icon: Icon }) => (
            <SidebarMenuItem key={mailbox}>
              <SidebarMenuButton
                className="gap-2 px-2 py-1.5 text-xs data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground"
                isActive={filters.mailbox === mailbox && filters.projectId === "all"}
                onClick={() => setFilters({ ...filters, mailbox, projectId: "all" })}
                size="sm"
              >
                <Icon className="size-3.5 text-muted-foreground/80" />
                <span className="flex-1 truncate text-left">{label}</span>
              </SidebarMenuButton>
              <NavCount value={mailboxCounts[mailbox]} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      {projectItems.length > 0 ? (
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {projectItems.map((project) => (
              <SidebarMenuItem key={project.id}>
                <SidebarMenuButton
                  className="gap-2 px-2 py-1.5 text-xs data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground"
                  isActive={filters.projectId === project.id}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      // Nav selection is exclusive: a project shows all of its
                      // mail, so the mailbox resets to the catch-all inbox.
                      mailbox: "inbox",
                      projectId: filters.projectId === project.id ? "all" : project.id,
                    })
                  }
                  size="sm"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      project.captureEnabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="flex-1 truncate text-left">{project.title}</span>
                </SidebarMenuButton>
                <NavCount value={project.count} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      {statusItems.length > 0 ? (
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupLabel>Status</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {statusItems.map(({ state, count, meta }) => (
              <SidebarMenuItem key={state}>
                <SidebarMenuButton
                  className="gap-2 px-2 py-1.5 text-xs data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground"
                  isActive={filters.syncState === state}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      syncState: filters.syncState === state ? "all" : state,
                    })
                  }
                  size="sm"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", meta.dotClass)} />
                  <span className="flex-1 truncate text-left">{meta.label}</span>
                </SidebarMenuButton>
                <NavCount value={count} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
    </>
  );
}
