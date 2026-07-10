import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueCommand, IssuePriority, IssueTeamId } from "@pathwayos/contracts";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import {
  useIssueActors,
  useIssueCycles,
  useIssueEpics,
  useIssueLabels,
  useIssueMilestones,
  useIssueStates,
  useIssueTeams,
} from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";

const PRIORITIES: ReadonlyArray<{ value: IssuePriority; label: string }> = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

type IssueUpdatePatch = Extract<IssueCommand, { readonly type: "issue.update" }>["patch"];

function PropertyRow(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 py-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}

const selectClassName = "h-7 min-w-0 rounded-md border border-transparent bg-transparent px-1 text-sm outline-none hover:border-input focus:border-ring";

function estimateOptions(scale: "disabled" | "exponential" | "fibonacci" | "linear" | "tshirt") {
  if (scale === "disabled") return [];
  if (scale === "exponential") return [1, 2, 4, 8, 16];
  if (scale === "fibonacci") return [1, 2, 3, 5, 8, 13];
  return [1, 2, 3, 4, 5];
}

export function PropertiesSidebar(props: {
  readonly issue: EnvironmentIssue;
  readonly issueRef: ScopedIssueRef;
}) {
  const teams = useIssueTeams(props.issueRef.environmentId);
  const states = useIssueStates(props.issueRef.environmentId);
  const labels = useIssueLabels(props.issueRef.environmentId);
  const actors = useIssueActors(props.issueRef.environmentId);
  const cycles = useIssueCycles(props.issueRef.environmentId);
  const epics = useIssueEpics(props.issueRef.environmentId);
  const milestones = useIssueMilestones(props.issueRef.environmentId);
  const updateIssue = useAtomCommand(issuesEnvironment.updateIssue);
  const moveTeam = useAtomCommand(issuesEnvironment.moveTeam);
  const deleteIssue = useAtomCommand(issuesEnvironment.deleteIssue);
  const restoreIssue = useAtomCommand(issuesEnvironment.restoreIssue);
  const [pendingTeamId, setPendingTeamId] = useState<IssueTeamId | null | undefined>(undefined);
  const team = teams.find((candidate) => candidate.id === props.issue.teamId);
  const availableStates = states.filter((state) => state.teamId === props.issue.teamId);
  const availableLabels = labels.filter((label) => label.teamId === null || label.teamId === props.issue.teamId);
  const availableCycles = cycles.filter((cycle) => cycle.teamId === props.issue.teamId);
  const availableMilestones = milestones.filter((milestone) => milestone.epicId === props.issue.epicId);
  const estimates = useMemo(() => estimateOptions(team?.estimateScale ?? "disabled"), [team?.estimateScale]);
  const update = (patch: IssueUpdatePatch) =>
    updateIssue({ environmentId: props.issueRef.environmentId, input: { issueId: props.issue.id, patch } });

  const remove = async () => {
    const result = await deleteIssue({ environmentId: props.issueRef.environmentId, input: { issueId: props.issue.id } });
    if (result._tag === "Failure") return;
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `${props.issue.identifier} moved to trash`,
        timeout: 8_000,
        actionProps: {
          children: "Undo",
          onClick: () => void restoreIssue({ environmentId: props.issueRef.environmentId, input: { issueId: props.issue.id } }),
        },
      }),
    );
  };

  const selectValue = (value: string | null) => value ?? "";
  return (
    <aside className="min-w-0 border-l px-4 py-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Properties</h2>
      <PropertyRow label="State">
        <select className={selectClassName} onChange={(event) => void update({ stateId: event.target.value as EnvironmentIssue["stateId"] })} value={props.issue.stateId}>
          {availableStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Assignee">
        <select className={selectClassName} onChange={(event) => void update({ assigneeActorId: event.target.value ? event.target.value as EnvironmentIssue["assigneeActorId"] : null })} value={selectValue(props.issue.assigneeActorId)}>
          <option value="">Unassigned</option>
          {actors.filter((actor) => actor.deletedAt === null).map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Priority">
        <select className={selectClassName} onChange={(event) => void update({ priority: Number(event.target.value) as IssuePriority })} value={props.issue.priority}>
          {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Labels">
        <Popover>
          <PopoverTrigger render={<button className="min-h-7 rounded-md px-1 text-left text-sm hover:bg-accent" type="button" />}>
            {props.issue.labelIds.length === 0 ? <span className="text-muted-foreground">No labels</span> : `${props.issue.labelIds.length} selected`}
          </PopoverTrigger>
          <PopoverPopup align="start" className="w-56" viewportClassName="p-1">
            {availableLabels.map((label) => {
              const checked = props.issue.labelIds.includes(label.id);
              return (
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent" key={label.id}>
                  <input checked={checked} onChange={() => void update({ labelIds: checked ? props.issue.labelIds.filter((id) => id !== label.id) : [...props.issue.labelIds, label.id] })} type="checkbox" />
                  <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="truncate">{label.name}</span>
                </label>
              );
            })}
          </PopoverPopup>
        </Popover>
      </PropertyRow>
      {estimates.length > 0 ? (
        <PropertyRow label="Estimate">
          <select className={selectClassName} onChange={(event) => void update({ estimate: event.target.value ? Number(event.target.value) : null })} value={props.issue.estimate ?? ""}>
            <option value="">No estimate</option>
            {estimates.map((estimate, index) => <option key={estimate} value={estimate}>{team?.estimateScale === "tshirt" ? ["XS", "S", "M", "L", "XL"][index] : estimate}</option>)}
          </select>
        </PropertyRow>
      ) : null}
      <PropertyRow label="Due date">
        <Input nativeInput onChange={(event) => void update({ dueDate: event.target.value || null })} size="sm" type="date" value={props.issue.dueDate ?? ""} />
      </PropertyRow>
      <PropertyRow label="Cycle">
        <select className={selectClassName} onChange={(event) => void update({ cycleId: event.target.value ? event.target.value as EnvironmentIssue["cycleId"] : null })} value={selectValue(props.issue.cycleId)}>
          <option value="">No cycle</option>
          {availableCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name ?? `Cycle ${cycle.number}`}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Epic">
        <select className={selectClassName} onChange={(event) => void update({ epicId: event.target.value ? event.target.value as EnvironmentIssue["epicId"] : null, milestoneId: null })} value={selectValue(props.issue.epicId)}>
          <option value="">No epic</option>
          {epics.filter((epic) => epic.deletedAt === null).map((epic) => <option key={epic.id} value={epic.id}>{epic.name}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Milestone">
        <select className={selectClassName} disabled={!props.issue.epicId} onChange={(event) => void update({ milestoneId: event.target.value ? event.target.value as EnvironmentIssue["milestoneId"] : null })} value={selectValue(props.issue.milestoneId)}>
          <option value="">No milestone</option>
          {availableMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}
        </select>
      </PropertyRow>
      <PropertyRow label="Team">
        <select className={selectClassName} onChange={(event) => setPendingTeamId(event.target.value ? event.target.value as IssueTeamId : null)} value={selectValue(props.issue.teamId)}>
          <option value="">Workspace</option>
          {teams.filter((candidate) => candidate.deletedAt === null).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </PropertyRow>
      <div className="mt-5 border-t pt-4">
        {props.issue.deletedAt ? (
          <Button className="w-full" onClick={() => void restoreIssue({ environmentId: props.issueRef.environmentId, input: { issueId: props.issue.id } })} size="sm" variant="outline">
            <RotateCcwIcon /> Restore issue
          </Button>
        ) : (
          <Button className="w-full justify-start" onClick={() => void remove()} size="sm" variant="ghost">
            <Trash2Icon /> Delete issue
          </Button>
        )}
      </div>
      <AlertDialog open={pendingTeamId !== undefined} onOpenChange={(open) => { if (!open) setPendingTeamId(undefined); }}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Move issue to another team?</AlertDialogTitle>
            <AlertDialogDescription>The issue identifier will change to use the destination team key. Existing links will continue through its identifier alias.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button />}
              onClick={() => {
                if (pendingTeamId !== undefined) void moveTeam({ environmentId: props.issueRef.environmentId, input: { issueId: props.issue.id, teamId: pendingTeamId } });
                setPendingTeamId(undefined);
              }}
            >
              Move issue
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </aside>
  );
}
