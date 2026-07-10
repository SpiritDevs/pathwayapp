import { useAtomSet, useAtomValue } from "@effect/atom-react";

import { cn } from "../lib/utils";
import { emailSourceAtom, type EmailSource } from "./emailSourceAtom";

const TABS: ReadonlyArray<{ readonly value: EmailSource; readonly label: string }> = [
  { value: "account", label: "Email" },
  { value: "local", label: "Local SMTP" },
];

export function EmailSourceTabs() {
  const source = useAtomValue(emailSourceAtom);
  const setSource = useAtomSet(emailSourceAtom);
  return (
    <div
      aria-label="Email source"
      className="flex h-7 rounded-lg border border-input bg-muted p-0.5"
      role="tablist"
    >
      {TABS.map((tab) => (
        <button
          aria-selected={source === tab.value}
          className={cn(
            "flex-1 cursor-pointer select-none rounded-md text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            source === tab.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
          key={tab.value}
          onClick={() => setSource(tab.value)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
