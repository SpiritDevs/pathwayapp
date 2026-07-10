import type { IssuePriority, IssueTeamId } from "@pathwayos/contracts";
import { useEffect, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useIssueTeams, useIssuesSnapshotMeta } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "~/components/ui/select";

import { PRIORITY_ORDER, PRIORITY_PRESENTATION, PriorityIcon } from "./issuePresentation";

const OPEN_QUICK_CREATE_EVENT = "pathwayos:issues:quick-create";
export const openIssueQuickCreate = () => window.dispatchEvent(new CustomEvent(OPEN_QUICK_CREATE_EVENT));

export function IssueQuickCreateDialog() {
  const environmentId = usePrimaryEnvironmentId();
  const teams = useIssueTeams(environmentId);
  const meta = useIssuesSnapshotMeta(environmentId);
  const createIssue = useAtomCommand(issuesEnvironment.createIssue, { reportFailure: true });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState<IssueTeamId | "workspace">("workspace");
  const [priority, setPriority] = useState<IssuePriority>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_CREATE_EVENT, show);
    return () => window.removeEventListener(OPEN_QUICK_CREATE_EVENT, show);
  }, []);

  const submit = async () => {
    if (!environmentId || !meta.online || !title.trim() || submitting) return;
    setSubmitting(true);
    const result = await createIssue({ environmentId, input: { title: title.trim(), teamId: teamId === "workspace" ? null : teamId, priority } });
    setSubmitting(false);
    if (result._tag === "Failure") return;
    setTitle(""); setPriority(0); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup>
        <DialogHeader><DialogTitle>Create issue</DialogTitle><DialogDescription>Capture the work now; details can be added from the issue page.</DialogDescription></DialogHeader>
        <DialogPanel className="space-y-4">
          <Input autoFocus value={title} placeholder="Issue title" onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={teamId} onValueChange={(value) => { if (value !== null) setTeamId(value as IssueTeamId | "workspace"); }}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectPopup><SelectItem value="workspace">Workspace</SelectItem>{teams.filter((team) => team.deletedAt === null).map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectPopup>
            </Select>
            <Select value={String(priority)} onValueChange={(value) => { const parsed = Number(value); if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) setPriority(parsed); }}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectPopup>{PRIORITY_ORDER.map((value) => <SelectItem key={value} value={String(value)}><PriorityIcon priority={value} />{PRIORITY_PRESENTATION[value].label}</SelectItem>)}</SelectPopup>
            </Select>
          </div>
        </DialogPanel>
        <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">⌘ Enter to create</span><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!title.trim() || !meta.online || submitting} onClick={() => void submit()}>{submitting ? "Creating…" : "Create issue"}</Button></DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
