import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@pathwayos/client-runtime/state/runtime";
import type { EnvironmentIssue } from "@pathwayos/client-runtime/state/issues";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useIssues } from "../../state/issueEntities";
import { issuesEnvironment } from "../../state/issues";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The issue command failed.";
}

export function TrashView() {
  const environmentId = usePrimaryEnvironmentId();
  const deletedIssues = useIssues()
    .filter((issue) => issue.environmentId === environmentId && issue.deletedAt !== null)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  const oldIssues = deletedIssues.filter(
    (issue) =>
      issue.deletedAt !== null && Date.now() - Date.parse(issue.deletedAt) >= THIRTY_DAYS_MS,
  );
  const [purgeTarget, setPurgeTarget] = useState<EnvironmentIssue | "older-than-30d" | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const restoreIssue = useAtomCommand(issuesEnvironment.restoreIssue, { reportFailure: false });
  const purgeIssue = useAtomCommand(issuesEnvironment.purgeIssue, { reportFailure: false });
  const execute = async <A, E>(operation: () => Promise<AtomCommandResult<A, E>>) => {
    const result = await operation();
    if (result._tag === "Failure") {
      setError(errorMessage(squashAtomCommandFailure(result)));
      return false;
    }
    return true;
  };
  const restore = async (issue: EnvironmentIssue) => {
    if (environmentId === null) return;
    setError(null);
    setPending(new Set([issue.id]));
    try {
      await execute(() => restoreIssue({ environmentId, input: { issueId: issue.id } }));
    } finally {
      setPending(new Set());
    }
  };
  const purge = async () => {
    if (environmentId === null || purgeTarget === null) return;
    const targets = purgeTarget === "older-than-30d" ? oldIssues : [purgeTarget];
    setError(null);
    setPending(new Set(targets.map((issue) => issue.id)));
    try {
      for (const issue of targets)
        await execute(() => purgeIssue({ environmentId, input: { issueId: issue.id } }));
      setPurgeTarget(null);
    } finally {
      setPending(new Set());
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-5">
        <div>
          <h1 className="font-heading text-base font-semibold">Trash</h1>
          <p className="text-xs text-muted-foreground">
            Restore soft-deleted issues or permanently remove them.
          </p>
        </div>
        <Button
          size="sm"
          variant="destructive-outline"
          disabled={oldIssues.length === 0 || pending.size > 0}
          onClick={() => setPurgeTarget("older-than-30d")}
        >
          <Trash2Icon />
          Purge older than 30 days
        </Button>
      </header>
      {error ? (
        <p className="border-b bg-destructive/5 px-5 py-2 text-xs text-destructive">{error}</p>
      ) : null}
      {deletedIssues.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2Icon />
            </EmptyMedia>
            <EmptyTitle>Trash is empty</EmptyTitle>
            <EmptyDescription>
              Deleted issues will remain here until they are restored or purged.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border bg-card">
            {deletedIssues.map((issue) => (
              <div
                className="flex items-center gap-3 border-t border-border/60 px-4 py-3 first:border-t-0"
                key={issue.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {issue.identifier}
                    </span>
                    <span className="truncate text-sm font-medium">{issue.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Deleted{" "}
                    {issue.deletedAt ? formatRelativeTimeLabel(issue.deletedAt) : "recently"}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending.has(issue.id)}
                  onClick={() => void restore(issue)}
                >
                  <RotateCcwIcon />
                  Restore
                </Button>
                <Button
                  size="xs"
                  variant="destructive-outline"
                  disabled={pending.has(issue.id)}
                  onClick={() => setPurgeTarget(issue)}
                >
                  <Trash2Icon />
                  Purge
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {purgeTarget === "older-than-30d"
                ? `Permanently delete ${oldIssues.length} old issues?`
                : purgeTarget
                  ? `Permanently delete ${purgeTarget.identifier}?`
                  : "Permanently delete?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {purgeTarget === "older-than-30d"
                ? "Every issue deleted more than 30 days ago will be permanently removed. This cannot be undone."
                : purgeTarget
                  ? `Permanently delete ${purgeTarget.identifier}? This cannot be undone.`
                  : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" disabled={pending.size > 0} onClick={() => void purge()}>
              Permanently delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
