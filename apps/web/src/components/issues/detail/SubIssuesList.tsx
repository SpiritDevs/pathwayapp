import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useIssues, useIssueStates } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";

export function SubIssuesList(props: {
  readonly issue: EnvironmentIssue;
  readonly issueRef: ScopedIssueRef;
}) {
  const navigate = useNavigate();
  const issues = useIssues();
  const states = useIssueStates(props.issueRef.environmentId);
  const createIssue = useAtomCommand(issuesEnvironment.createIssue);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const children = useMemo(
    () =>
      issues.filter(
        (issue) =>
          issue.environmentId === props.issueRef.environmentId &&
          issue.parentIssueId === props.issue.id &&
          issue.deletedAt === null,
      ),
    [issues, props.issue.id, props.issueRef.environmentId],
  );
  const completeCount = children.filter((child) => {
    const category = states.find((state) => state.id === child.stateId)?.category;
    return category === "completed" || category === "canceled";
  }).length;
  const completion = children.length === 0 ? 0 : Math.round((completeCount / children.length) * 100);

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const result = await createIssue({
      environmentId: props.issueRef.environmentId,
      input: {
        title: trimmed,
        teamId: props.issue.teamId,
        parentIssueId: props.issue.id,
      },
    });
    if (result._tag === "Failure") return;
    setTitle("");
    setAdding(false);
  };

  return (
    <section className="border-t py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sub-issues</h2>
        <span className="text-xs text-muted-foreground">{completeCount}/{children.length}</span>
      </div>
      {children.length > 0 ? (
        <>
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${completion}%` }} />
          </div>
          <div className="divide-y">
            {children.map((child) => {
              const state = states.find((candidate) => candidate.id === child.stateId);
              const done = state?.category === "completed" || state?.category === "canceled";
              return (
                <button
                  className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-primary"
                  key={child.id}
                  onClick={() => void navigate({ to: "/issues/$identifier", params: { identifier: child.identifier } })}
                  type="button"
                >
                  {done ? <CheckCircle2Icon className="size-3.5 text-success" /> : <CircleIcon className="size-3.5 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">{child.identifier}</span>
                  <span className="min-w-0 flex-1 truncate">{child.title}</span>
                  <span className="text-xs text-muted-foreground">{state?.name}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No sub-issues.</p>
      )}
      {adding ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Sub-issue title"
            value={title}
          />
          <Button onClick={() => void add()} size="sm">Add</Button>
          <Button onClick={() => setAdding(false)} size="sm" variant="ghost">Cancel</Button>
        </div>
      ) : (
        <Button className="mt-2" onClick={() => setAdding(true)} size="xs" variant="ghost">
          <PlusIcon /> Add sub-issue
        </Button>
      )}
    </section>
  );
}
