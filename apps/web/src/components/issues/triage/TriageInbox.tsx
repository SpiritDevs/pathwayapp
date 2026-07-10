import { squashAtomCommandFailure, type AtomCommandResult } from "@pathwayos/client-runtime/state/runtime";
import type { EnvironmentIssue } from "@pathwayos/client-runtime/state/issues";
import type { IssueStateId, IssueTeam } from "@pathwayos/contracts";
import { CheckIcon, InboxIcon, RobotIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { formatRelativeTimeLabel } from "../../../timestampFormat";
import { usePrimaryEnvironmentId } from "../../../state/environments";
import { useIssueActors, useIssues, useIssueStates, useIssueTeams } from "../../../state/issueEntities";
import { issuesEnvironment } from "../../../state/issues";
import { useAtomCommand } from "../../../state/use-atom-command";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../ui/empty";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The issue command failed.";
}

export function TriageInbox() {
  const environmentId = usePrimaryEnvironmentId();
  const issues = useIssues().filter((issue) => issue.environmentId === environmentId && issue.deletedAt === null);
  const states = useIssueStates(environmentId).filter((state) => state.deletedAt === null);
  const teams = useIssueTeams(environmentId);
  const actors = useIssueActors(environmentId);
  const triageStateIds = new Set(states.filter((state) => state.category === "triage").map((state) => state.id));
  const triageIssues = issues.filter((issue) => triageStateIds.has(issue.stateId));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const updateIssue = useAtomCommand(issuesEnvironment.updateIssue, { reportFailure: false });
  const grouped = useMemo(() => {
    const byTeam = new Map<IssueTeam["id"] | null, EnvironmentIssue[]>();
    for (const issue of triageIssues) {
      const group = byTeam.get(issue.teamId);
      if (group) group.push(issue); else byTeam.set(issue.teamId, [issue]);
    }
    return [...byTeam.entries()];
  }, [triageIssues]);

  const execute = async <A, E>(operation: () => Promise<AtomCommandResult<A, E>>) => {
    const result = await operation();
    if (result._tag === "Failure") { setError(errorMessage(squashAtomCommandFailure(result))); return false; }
    return true;
  };
  const destination = (issue: EnvironmentIssue, category: "backlog" | "canceled"): IssueStateId | null =>
    states.filter((state) => state.teamId === issue.teamId && state.category === category).sort((a, b) => a.position - b.position)[0]?.id ?? null;
  const triage = async (targetIssues: ReadonlyArray<EnvironmentIssue>, action: "accept" | "decline") => {
    if (environmentId === null || targetIssues.length === 0) return;
    setError(null);
    setPending(new Set(targetIssues.map((issue) => issue.id)));
    try {
      for (const issue of targetIssues) {
        const stateId = destination(issue, action === "accept" ? "backlog" : "canceled");
        if (stateId === null) { setError(`${issue.identifier} has no ${action === "accept" ? "backlog" : "canceled"} state in its team.`); continue; }
        await execute(() => updateIssue({ environmentId, input: { issueId: issue.id, patch: { stateId, triaged: true } } }));
      }
      setSelected(new Set());
    } finally { setPending(new Set()); }
  };
  const selectedIssues = triageIssues.filter((issue) => selected.has(issue.id));

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <header className="flex min-h-14 items-center justify-between gap-3 border-b px-5"><div><h1 className="font-heading text-base font-semibold">Triage inbox</h1><p className="text-xs text-muted-foreground">Review newly submitted issues before they enter a team backlog.</p></div>{triageIssues.length > 0 ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={selectedIssues.length === 0 || pending.size > 0} onClick={() => void triage(selectedIssues, "decline")}><XIcon />Decline {selectedIssues.length || ""}</Button><Button size="sm" disabled={selectedIssues.length === 0 || pending.size > 0} onClick={() => void triage(selectedIssues, "accept")}><CheckIcon />Accept {selectedIssues.length || ""}</Button></div> : null}</header>
    {error ? <p className="border-b bg-destructive/5 px-5 py-2 text-xs text-destructive">{error}</p> : null}
    {triageIssues.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><InboxIcon /></EmptyMedia><EmptyTitle>Inbox zero</EmptyTitle><EmptyDescription>There are no issues waiting for triage.</EmptyDescription></EmptyHeader></Empty> : <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mx-auto max-w-5xl space-y-6">{grouped.map(([teamId, teamIssues]) => { const team = teams.find((candidate) => candidate.id === teamId); return <section key={teamId ?? "workspace"}><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{team?.icon ? `${team.icon} ` : ""}{team?.name ?? "Workspace"}</h2><Button size="xs" variant="ghost" onClick={() => setSelected((current) => { const next = new Set(current); const allSelected = teamIssues.every((issue) => next.has(issue.id)); for (const issue of teamIssues) { if (allSelected) next.delete(issue.id); else next.add(issue.id); } return next; })}>Select {teamIssues.every((issue) => selected.has(issue.id)) ? "none" : "all"}</Button></div><div className="overflow-hidden rounded-xl border bg-card">{teamIssues.map((issue) => { const creator = actors.find((actor) => actor.id === issue.creatorActorId); const isPending = pending.has(issue.id); return <div className="flex items-center gap-3 border-t border-border/60 px-4 py-3 first:border-t-0" key={issue.id}><Checkbox checked={selected.has(issue.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(issue.id); else next.delete(issue.id); return next; })} aria-label={`Select ${issue.identifier}`} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground">{issue.identifier}</span><span className="truncate text-sm font-medium">{issue.title}</span></div><div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground"><span>{creator?.displayName ?? "Unknown creator"}</span>{creator?.kind === "agent" ? <Badge variant="secondary"><RobotIcon />robot</Badge> : null}<span>·</span><span>{formatRelativeTimeLabel(issue.createdAt)}</span></div></div><Button size="xs" variant="ghost" disabled={isPending} onClick={() => void triage([issue], "decline")}>Decline</Button><Button size="xs" disabled={isPending} onClick={() => void triage([issue], "accept")}>Accept</Button></div>; })}</div></section>; })}</div></div>}
  </div>;
}
