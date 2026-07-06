import type { DraftId } from "../composerDraftStore";

const draftAutoSubmitStoragePrefix = "pathwayos:draft-auto-submit:";

function draftAutoSubmitStorageKey(draftId: DraftId): string {
  return `${draftAutoSubmitStoragePrefix}${draftId}`;
}

export function markDraftForAutoSubmit(draftId: DraftId): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(draftAutoSubmitStorageKey(draftId), "1");
}

export function hasDraftAutoSubmit(draftId: DraftId): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(draftAutoSubmitStorageKey(draftId)) === "1";
}

export function consumeDraftAutoSubmit(draftId: DraftId): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const key = draftAutoSubmitStorageKey(draftId);
  const shouldAutoSubmit = window.sessionStorage.getItem(key) === "1";
  if (shouldAutoSubmit) {
    window.sessionStorage.removeItem(key);
  }
  return shouldAutoSubmit;
}
