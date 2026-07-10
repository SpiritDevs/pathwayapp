import { describe, expect, it } from "vite-plus/test";
import type { EmailMessageSummary } from "@pathwayos/contracts";

import {
  EMPTY_EMAIL_INBOX_FILTERS,
  countAdvancedEmailFilters,
  filterEmailMessages,
  hasActiveEmailFilters,
} from "./inboxModel";

const messages = [
  {
    messageId: "message-1",
    sandboxId: "sandbox-1",
    sourceId: "source-1",
    projectId: "project-1",
    from: [{ name: "Build Bot", address: "build@example.com" }],
    to: [{ name: null, address: "dev@example.com" }],
    subject: "Welcome to Pathway",
    receivedAt: "2026-07-10T02:30:00.000Z",
    readAt: null,
    attachmentCount: 1,
    hasHtml: true,
    hasText: true,
    syncState: "synced",
  },
  {
    messageId: "message-2",
    sandboxId: "sandbox-1",
    sourceId: "source-2",
    projectId: "project-2",
    from: [{ name: null, address: "alerts@example.com" }],
    to: [{ name: "Corey", address: "corey@example.com" }],
    subject: "Deploy failed",
    receivedAt: "2026-07-12T02:30:00.000Z",
    readAt: null,
    attachmentCount: 0,
    hasHtml: false,
    hasText: true,
    syncState: "failed",
  },
] as unknown as ReadonlyArray<EmailMessageSummary>;

describe("filterEmailMessages", () => {
  it("combines project, status, and address filters", () => {
    expect(
      filterEmailMessages(messages, {
        ...EMPTY_EMAIL_INBOX_FILTERS,
        projectId: "project-1",
        syncState: "synced",
        sender: "build bot",
        recipient: "dev@",
      }).map((message) => message.messageId),
    ).toEqual(["message-1"]);
  });

  it("filters by mailbox", () => {
    const read = { ...messages[1], messageId: "message-3", readAt: "2026-07-12T03:00:00.000Z" };
    const all = [...messages, read] as ReadonlyArray<EmailMessageSummary>;
    expect(
      filterEmailMessages(all, { ...EMPTY_EMAIL_INBOX_FILTERS, mailbox: "unread" }).map(
        (message) => message.messageId,
      ),
    ).toEqual(["message-1", "message-2"]);
    expect(
      filterEmailMessages(all, { ...EMPTY_EMAIL_INBOX_FILTERS, mailbox: "attachments" }).map(
        (message) => message.messageId,
      ),
    ).toEqual(["message-1"]);
  });

  it("searches subject and addresses", () => {
    expect(
      filterEmailMessages(messages, {
        ...EMPTY_EMAIL_INBOX_FILTERS,
        search: "corey@example",
      }).map((message) => message.messageId),
    ).toEqual(["message-2"]);
  });

  it("filters inclusive local date bounds", () => {
    expect(
      filterEmailMessages(messages, {
        ...EMPTY_EMAIL_INBOX_FILTERS,
        receivedFrom: "2026-07-12",
        receivedTo: "2026-07-12",
      }).map((message) => message.messageId),
    ).toEqual(["message-2"]);
  });
});

describe("countAdvancedEmailFilters", () => {
  it("counts only non-blank advanced fields", () => {
    expect(countAdvancedEmailFilters(EMPTY_EMAIL_INBOX_FILTERS)).toBe(0);
    expect(
      countAdvancedEmailFilters({
        ...EMPTY_EMAIL_INBOX_FILTERS,
        sender: "build",
        subject: "  ",
        receivedFrom: "2026-07-10",
      }),
    ).toBe(2);
  });

  it("ignores primary filters", () => {
    expect(
      countAdvancedEmailFilters({
        ...EMPTY_EMAIL_INBOX_FILTERS,
        projectId: "project-1",
        syncState: "failed",
        search: "corey",
      }),
    ).toBe(0);
  });
});

describe("hasActiveEmailFilters", () => {
  it("is false for the empty filter set", () => {
    expect(hasActiveEmailFilters(EMPTY_EMAIL_INBOX_FILTERS)).toBe(false);
    expect(hasActiveEmailFilters({ ...EMPTY_EMAIL_INBOX_FILTERS, search: "  " })).toBe(false);
  });

  it("is true when any primary or advanced filter is set", () => {
    expect(hasActiveEmailFilters({ ...EMPTY_EMAIL_INBOX_FILTERS, projectId: "project-1" })).toBe(
      true,
    );
    expect(hasActiveEmailFilters({ ...EMPTY_EMAIL_INBOX_FILTERS, syncState: "local" })).toBe(true);
    expect(hasActiveEmailFilters({ ...EMPTY_EMAIL_INBOX_FILTERS, recipient: "dev@" })).toBe(true);
  });
});
