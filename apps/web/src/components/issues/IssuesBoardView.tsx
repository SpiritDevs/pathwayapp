import { DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LegendList } from "@legendapp/list/react";
import type { EnvironmentIssue } from "@pathwayos/client-runtime/state/issues";
import { orderKeyBetween } from "@pathwayos/shared/fractionalIndex";
import type {
  GroupBy,
  IssueActorId,
  IssueCommand,
  IssueCycleId,
  IssueDisplayConfig,
  IssueEpicId,
  IssueLabelId,
  IssuePriority,
  IssueStateId,
  IssueTeamId,
} from "@pathwayos/contracts";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useIssuesUiStateStore } from "~/issuesUiStateStore";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

import { IssueCard } from "./IssueCard";
import { groupIssues, patchForGroup, type IssueGroup, type IssueLookupData } from "./issuesView";

function ColumnCell({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cn("min-h-24", isOver && "bg-primary/5 ring-1 ring-inset ring-primary/20", className)}>{children}</div>;
}

type IssueCreateInput = Omit<Extract<IssueCommand, { readonly type: "issue.create" }>, "type">;

function createInputForGroup(
  title: string,
  groupBy: GroupBy,
  value: string | number | null,
  fallbackStateId: IssueStateId,
  defaultTeamId: IssueTeamId | null,
): IssueCreateInput {
  const base = { title, teamId: defaultTeamId, stateId: fallbackStateId } satisfies IssueCreateInput;
  switch (groupBy) {
    case "state": return { ...base, stateId: value as IssueStateId };
    case "assignee": return { ...base, assigneeActorId: value as IssueActorId | null };
    case "priority": return { ...base, priority: value as IssuePriority };
    case "label": return { ...base, labelIds: value === null ? [] : [value as IssueLabelId] };
    case "cycle": return { ...base, cycleId: value as IssueCycleId | null };
    case "epic": return { ...base, epicId: value as IssueEpicId | null };
    case "team": return { ...base, teamId: value as IssueTeamId | null };
    case "none": return base;
  }
}

export function IssuesBoardView({ issues, display, lookup, readOnly }: { issues: ReadonlyArray<EnvironmentIssue>; display: IssueDisplayConfig; lookup: IssueLookupData; readOnly: boolean }) {
  const groups = useMemo(() => groupIssues(issues, display.groupBy === "none" ? "state" : display.groupBy, display, lookup), [display, issues, lookup]);
  const laneBy = display.swimlaneBy ?? "none";
  const lanes = useMemo(() => laneBy === "none" ? [] : groupIssues(issues, laneBy as GroupBy, { ...display, groupBy: laneBy as GroupBy }, lookup), [display, issues, laneBy, lookup]);
  const collapsed = useIssuesUiStateStore((state) => state.collapsedBoardColumnIds);
  const toggleCollapsed = useIssuesUiStateStore((state) => state.toggleBoardColumnCollapsed);
  const updateIssue = useAtomCommand(issuesEnvironment.updateIssue, { reportFailure: true });
  const moveTeam = useAtomCommand(issuesEnvironment.moveTeam, { reportFailure: true });
  const createIssue = useAtomCommand(issuesEnvironment.createIssue, { reportFailure: true });
  const [activeIssue, setActiveIssue] = useState<EnvironmentIssue | null>(null);
  const [quickCreateColumn, setQuickCreateColumn] = useState<string | null>(null);
  const [quickCreateTitle, setQuickCreateTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const labelsFor = (issue: EnvironmentIssue) => lookup.labels.filter((label) => issue.labelIds.includes(label.id));
  const assigneeFor = (issue: EnvironmentIssue) => lookup.actors.find((actor) => actor.id === issue.assigneeActorId) ?? null;
  const progressFor = (issue: EnvironmentIssue) => {
    const children = issues.filter((candidate) => candidate.parentIssueId === issue.id);
    if (!children.length) return undefined;
    const completedStateIds = new Set(lookup.states.filter((state) => state.category === "completed").map((state) => state.id));
    return { total: children.length, completed: children.filter((child) => completedStateIds.has(child.stateId)).length };
  };

  const renderCards = (items: ReadonlyArray<EnvironmentIssue>, dropId: string) => (
    <ColumnCell id={dropId} className="h-full px-2 pb-2">
      <SortableContext items={items.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
        <LegendList<EnvironmentIssue>
          data={items}
          keyExtractor={(issue) => issue.id}
          estimatedItemSize={106}
          className="h-full min-h-0 space-y-2 overflow-y-auto pt-2"
          renderItem={({ item }) => <div className="pb-2"><IssueCard issue={item} labels={labelsFor(item)} assignee={assigneeFor(item)} subIssueProgress={progressFor(item)} dragDisabled={readOnly || display.orderBy !== "manual"} /></div>}
        />
      </SortableContext>
    </ColumnCell>
  );

  const submitQuickCreate = async (group: IssueGroup) => {
    if (readOnly) return;
    const title = quickCreateTitle.trim();
    if (!title || !issues[0]?.environmentId) return;
    const groupBy = display.groupBy === "none" ? "state" : display.groupBy;
    const targetState = groupBy === "state" ? lookup.states.find((state) => state.id === group.value) : null;
    const targetTeamId = groupBy === "team" ? group.value as IssueTeamId | null : (targetState?.teamId ?? null);
    const fallbackState = lookup.states.find((state) => state.category === "unstarted" && state.teamId === targetTeamId)
      ?? lookup.states.find((state) => state.category === "unstarted" && state.teamId === null)
      ?? lookup.states[0];
    if (!fallbackState) return;
    const input = createInputForGroup(
      title,
      groupBy,
      group.value,
      fallbackState.id,
      targetTeamId,
    );
    await createIssue({ environmentId: issues[0].environmentId, input });
    setQuickCreateTitle("");
    setQuickCreateColumn(null);
  };

  const handleDragStart = (event: DragStartEvent) => setActiveIssue(issues.find((issue) => issue.id === event.active.id) ?? null);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);
    if (readOnly) return;
    if (!event.over) return;
    const active = issues.find((issue) => issue.id === event.active.id);
    if (!active) return;
    const overId = String(event.over.id).split("|", 1)[0]!;
    const group = groups.find((candidate) => candidate.id === overId || candidate.issues.some((issue) => issue.id === event.over?.id));
    if (!group) return;
    const targetIssues = group.issues.filter((issue) => issue.id !== active.id);
    const overIndex = targetIssues.findIndex((issue) => issue.id === event.over?.id);
    const insertIndex = overIndex < 0 ? targetIssues.length : overIndex;
    const orderKey = orderKeyBetween(targetIssues[insertIndex - 1]?.orderKey ?? null, targetIssues[insertIndex]?.orderKey ?? null);
    const target = patchForGroup(display.groupBy === "none" ? "state" : display.groupBy, group.value);
    void (async () => {
      if (target.teamId !== undefined) {
        await moveTeam({ environmentId: active.environmentId, input: { issueId: active.id, teamId: target.teamId } });
      }
      await updateIssue({ environmentId: active.environmentId, input: { issueId: active.id, patch: { ...(target.patch ?? {}), orderKey } } });
    })();
  };

  const columnHeader = (group: IssueGroup) => (
    <header className="flex h-10 items-center gap-2 border-b px-2.5 text-xs font-medium">
      {group.color ? <span className="size-2 rounded-full" style={{ backgroundColor: group.color }} /> : null}
      <span className="truncate">{group.label}</span><span className="text-muted-foreground">{group.issues.length}</span>
      <Button className="ml-auto" size="icon-xs" variant="ghost" disabled={readOnly} aria-label={`Add issue to ${group.label}`} onClick={() => setQuickCreateColumn(group.id)}><PlusIcon /></Button>
      <Button size="icon-xs" variant="ghost" aria-label={`Collapse ${group.label}`} onClick={() => toggleCollapsed(group.id)}><ChevronLeftIcon /></Button>
    </header>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragCancel={() => setActiveIssue(null)} onDragEnd={handleDragEnd}>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
        <div className="flex h-full min-w-max gap-2 p-2">
          {groups.map((group) => collapsed.includes(group.id) ? (
            <button key={group.id} type="button" className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border bg-background py-2 text-xs" onClick={() => toggleCollapsed(group.id)}>
              <ChevronRightIcon className="size-3.5" /><span className="[writing-mode:vertical-rl]">{group.label} · {group.issues.length}</span>
            </button>
          ) : (
            <section key={group.id} className="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-background">
              {columnHeader(group)}
              {quickCreateColumn === group.id ? (
                <div className="border-b p-2"><Input autoFocus value={quickCreateTitle} placeholder="Issue title" className="h-8 text-sm" onChange={(event) => setQuickCreateTitle(event.target.value)} onBlur={() => { if (!quickCreateTitle.trim()) setQuickCreateColumn(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitQuickCreate(group); } if (event.key === "Escape") setQuickCreateColumn(null); }} /></div>
              ) : null}
              {laneBy === "none" ? renderCards(group.issues, group.id) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {lanes.map((lane) => {
                    const laneIds = new Set(lane.issues.map((issue) => issue.id));
                    const cellIssues = group.issues.filter((issue) => laneIds.has(issue.id));
                    return <section key={lane.id} className="border-b last:border-b-0"><div className="sticky top-0 z-10 bg-muted/92 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">{lane.label} · {cellIssues.length}</div><div className="h-72">{renderCards(cellIssues, `${group.id}|${lane.id}`)}</div></section>;
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{activeIssue ? <IssueCard issue={activeIssue} labels={labelsFor(activeIssue)} assignee={assigneeFor(activeIssue)} subIssueProgress={progressFor(activeIssue)} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
