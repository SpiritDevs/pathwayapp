import type { EmailMessageSummary } from "@pathwayos/contracts";

export type EmailSyncStateFilter = EmailMessageSummary["syncState"] | "all";

export type EmailMailbox = "inbox" | "unread" | "attachments";

export interface EmailInboxFilters {
  readonly mailbox: EmailMailbox;
  readonly projectId: string;
  readonly syncState: EmailSyncStateFilter;
  readonly sender: string;
  readonly recipient: string;
  readonly subject: string;
  readonly search: string;
  readonly receivedFrom: string;
  readonly receivedTo: string;
}

export const EMPTY_EMAIL_INBOX_FILTERS: EmailInboxFilters = {
  mailbox: "inbox",
  projectId: "all",
  syncState: "all",
  sender: "",
  recipient: "",
  subject: "",
  search: "",
  receivedFrom: "",
  receivedTo: "",
};

export function matchesEmailMailbox(message: EmailMessageSummary, mailbox: EmailMailbox): boolean {
  if (mailbox === "unread") return message.readAt === null;
  if (mailbox === "attachments") return message.attachmentCount > 0;
  return true;
}

const ADVANCED_EMAIL_FILTER_KEYS = [
  "sender",
  "recipient",
  "subject",
  "receivedFrom",
  "receivedTo",
] as const satisfies ReadonlyArray<keyof EmailInboxFilters>;

export function countAdvancedEmailFilters(filters: EmailInboxFilters): number {
  return ADVANCED_EMAIL_FILTER_KEYS.filter((key) => filters[key].trim() !== "").length;
}

export function hasActiveEmailFilters(filters: EmailInboxFilters): boolean {
  return (
    filters.mailbox !== "inbox" ||
    filters.projectId !== "all" ||
    filters.syncState !== "all" ||
    filters.search.trim() !== "" ||
    countAdvancedEmailFilters(filters) > 0
  );
}

function addressesContain(
  addresses: EmailMessageSummary["from"] | EmailMessageSummary["to"],
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return addresses.some(
    (entry) =>
      entry.address.toLocaleLowerCase().includes(normalized) ||
      (entry.name?.toLocaleLowerCase().includes(normalized) ?? false),
  );
}

function startOfLocalDate(date: string): number | null {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function endOfLocalDate(date: string): number | null {
  if (!date) return null;
  const value = new Date(`${date}T23:59:59.999`).getTime();
  return Number.isFinite(value) ? value : null;
}

export function filterEmailMessages(
  messages: ReadonlyArray<EmailMessageSummary>,
  filters: EmailInboxFilters,
): ReadonlyArray<EmailMessageSummary> {
  const subject = filters.subject.trim().toLocaleLowerCase();
  const search = filters.search.trim().toLocaleLowerCase();
  const fromTime = startOfLocalDate(filters.receivedFrom);
  const toTime = endOfLocalDate(filters.receivedTo);

  return messages.filter((message) => {
    if (!matchesEmailMailbox(message, filters.mailbox)) return false;
    if (filters.projectId !== "all" && message.projectId !== filters.projectId) return false;
    if (filters.syncState !== "all" && message.syncState !== filters.syncState) return false;
    if (!addressesContain(message.from, filters.sender)) return false;
    if (!addressesContain(message.to, filters.recipient)) return false;
    if (subject && !message.subject.toLocaleLowerCase().includes(subject)) return false;

    const receivedAt = new Date(message.receivedAt).getTime();
    if (fromTime !== null && receivedAt < fromTime) return false;
    if (toTime !== null && receivedAt > toTime) return false;

    if (search) {
      const searchable = [
        message.subject,
        ...message.from.flatMap((entry) => [entry.name ?? "", entry.address]),
        ...message.to.flatMap((entry) => [entry.name ?? "", entry.address]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });
}
