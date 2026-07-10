import { Atom } from "effect/unstable/reactivity";

export type EmailSource = "account" | "local";

/**
 * Which inbox the email surfaces show: the user's connected email account or
 * the local SMTP sandbox. Shared by the sidebar tabs and the inbox view so
 * both switch together. keepAlive preserves the choice while navigating.
 */
export const emailSourceAtom = Atom.make<EmailSource>("local").pipe(
  Atom.keepAlive,
  Atom.withLabel("email:source"),
);
