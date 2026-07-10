import { INVITATION_ACCEPT_ROUTE } from "./authRoutes";

const PENDING_INVITATION_KEY = "pathwayos.pendingInvitationPath";

function browserSessionStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function invitationAcceptPath(token: string): string {
  return `${INVITATION_ACCEPT_ROUTE}?token=${encodeURIComponent(token)}`;
}

export function rememberPendingInvitation(token: string, storage = browserSessionStorage()): void {
  if (!storage || token.trim().length === 0) return;
  storage.setItem(PENDING_INVITATION_KEY, invitationAcceptPath(token));
}

export function consumePendingInvitation(storage = browserSessionStorage()): string | null {
  if (!storage) return null;
  const path = storage.getItem(PENDING_INVITATION_KEY);
  storage.removeItem(PENDING_INVITATION_KEY);
  return path?.startsWith(`${INVITATION_ACCEPT_ROUTE}?token=`) ? path : null;
}

export function clearPendingInvitation(storage = browserSessionStorage()): void {
  storage?.removeItem(PENDING_INVITATION_KEY);
}
