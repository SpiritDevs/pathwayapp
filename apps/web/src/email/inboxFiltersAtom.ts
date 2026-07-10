import { Atom } from "effect/unstable/reactivity";

import { EMPTY_EMAIL_INBOX_FILTERS, type EmailInboxFilters } from "./inboxModel";

/**
 * Shared between the email sidebar mailbox navigation and the inbox view so
 * both surfaces select and highlight the same mailbox, project, and status.
 * keepAlive preserves the selection while the user navigates elsewhere.
 */
export const emailInboxFiltersAtom = Atom.make<EmailInboxFilters>(EMPTY_EMAIL_INBOX_FILTERS).pipe(
  Atom.keepAlive,
  Atom.withLabel("email:inbox-filters"),
);
