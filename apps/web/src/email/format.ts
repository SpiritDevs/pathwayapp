import type { EmailMessageSummary } from "@pathwayos/contracts";

export function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(1)} GB`;
}

export function runtimePhaseLabel(phase: string): string {
  switch (phase) {
    case "running":
      return "Running";
    case "installing":
      return "Installing Mailpit";
    case "starting":
      return "Starting";
    case "degraded":
      return "Needs attention";
    case "failed":
      return "Failed";
    default:
      return "Disabled";
  }
}

export const EMAIL_SYNC_STATE_META: Record<
  EmailMessageSummary["syncState"],
  { readonly label: string; readonly dotClass: string }
> = {
  local: { label: "Local only", dotClass: "bg-muted-foreground/40" },
  pending: { label: "Waiting to sync", dotClass: "bg-amber-500" },
  synced: { label: "Synced", dotClass: "bg-emerald-500" },
  failed: { label: "Sync failed", dotClass: "bg-destructive" },
  deleted: { label: "Removed from sync", dotClass: "bg-muted-foreground/25" },
};
