import type { ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import { create } from "zustand";

interface IssuePeekStore {
  readonly peekIssueRef: ScopedIssueRef | null;
  readonly openPeek: (ref: ScopedIssueRef) => void;
  readonly closePeek: () => void;
}

export const useIssuePeekStore = create<IssuePeekStore>((set) => ({
  peekIssueRef: null,
  openPeek: (peekIssueRef) => set({ peekIssueRef }),
  closePeek: () => set({ peekIssueRef: null }),
}));
