import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LegendList } from "@legendapp/list/react";
import { orderKeyBetween } from "@pathwayos/shared/fractionalIndex";
import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueDisplayConfig } from "@pathwayos/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { isCommandPaletteOpen } from "~/commandPaletteContext";
import { useIssuesUiStateStore } from "~/issuesUiStateStore";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";

import { IssueRow, type IssueBulkProperty } from "./IssueRow";
import {
  PRIORITY_ORDER,
  PRIORITY_PRESENTATION,
  PriorityIcon,
  StateIcon,
} from "./issuePresentation";
import { groupIssues, issueRef, patchForGroup, type IssueLookupData } from "./issuesView";

function DroppableGroup({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`min-w-[720px] ${isOver ? "bg-primary/4" : ""}`}>
      {children}
    </section>
  );
}

export function IssuesListView({
  issues,
  display,
  lookup,
  onPeek,
  readOnly,
}: {
  issues: ReadonlyArray<EnvironmentIssue>;
  display: IssueDisplayConfig;
  lookup: IssueLookupData;
  onPeek: (ref: ScopedIssueRef) => void;
  readOnly: boolean;
}) {
  const groups = useMemo(
    () => groupIssues(issues, display.groupBy, display, lookup),
    [display, issues, lookup],
  );
  const collapsed = useIssuesUiStateStore((state) => state.collapsedGroupIds);
  const toggleCollapsed = useIssuesUiStateStore((state) => state.toggleGroupCollapsed);
  const updateIssue = useAtomCommand(issuesEnvironment.updateIssue, { reportFailure: true });
  const moveTeam = useAtomCommand(issuesEnvironment.moveTeam, { reportFailure: true });
  const deleteIssue = useAtomCommand(issuesEnvironment.deleteIssue, { reportFailure: true });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [bulkProperty, setBulkProperty] = useState<IssueBulkProperty | null>(null);
  const orderedIssues = useMemo(() => groups.flatMap((group) => group.issues), [groups]);

  const selectedIssues = useMemo(() => {
    const explicit = orderedIssues.filter((issue) => selectedIds.has(issue.id));
    return explicit.length
      ? explicit
      : orderedIssues[focusedIndex]
        ? [orderedIssues[focusedIndex]!]
        : [];
  }, [focusedIndex, orderedIssues, selectedIds]);

  useEffect(() => {
    const issue = orderedIssues[focusedIndex];
    if (!issue) return;
    document
      .querySelector<HTMLElement>(`[data-issue-id="${CSS.escape(issue.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, orderedIssues]);

  const select = useCallback(
    (ref: ScopedIssueRef, options: { range: boolean; additive: boolean }) => {
      const index = orderedIssues.findIndex((issue) => issue.id === ref.issueId);
      if (index < 0) return;
      setFocusedIndex(index);
      setSelectedIds((current) => {
        if (options.range && selectionAnchor) {
          const anchorIndex = orderedIssues.findIndex((issue) => issue.id === selectionAnchor);
          if (anchorIndex >= 0)
            return new Set(
              orderedIssues
                .slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1)
                .map((issue) => issue.id),
            );
        }
        if (options.additive) {
          const next = new Set(current);
          if (next.has(ref.issueId)) next.delete(ref.issueId);
          else next.add(ref.issueId);
          return next;
        }
        return new Set([ref.issueId]);
      });
      setSelectionAnchor(ref.issueId);
    },
    [orderedIssues, selectionAnchor],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isCommandPaletteOpen()) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      const key = event.key.toLowerCase();
      if (["j", "arrowdown", "k", "arrowup", "x", "s", "a", "p", "l"].includes(key)) {
        event.preventDefault();
      } else return;
      if (key === "j" || key === "arrowdown")
        setFocusedIndex((index) => Math.min(orderedIssues.length - 1, index + 1));
      if (key === "k" || key === "arrowup") setFocusedIndex((index) => Math.max(0, index - 1));
      if (key === "x") {
        const issue = orderedIssues[focusedIndex];
        if (issue) select(issueRef(issue), { range: event.shiftKey, additive: true });
      }
      if (!readOnly && key === "s") setBulkProperty("state");
      if (!readOnly && key === "a") setBulkProperty("assignee");
      if (!readOnly && key === "p") setBulkProperty("priority");
      if (!readOnly && key === "l") setBulkProperty("labels");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedIndex, orderedIssues, readOnly, select]);

  const patchSelected = async (patch: Parameters<typeof updateIssue>[0]["input"]["patch"]) => {
    if (readOnly) return;
    await Promise.all(
      selectedIssues.map((issue) =>
        updateIssue({ environmentId: issue.environmentId, input: { issueId: issue.id, patch } }),
      ),
    );
    setBulkProperty(null);
  };

  const handleBulkProperty = (property: IssueBulkProperty, issue: EnvironmentIssue) => {
    if (readOnly) return;
    if (!selectedIds.has(issue.id)) setSelectedIds(new Set([issue.id]));
    if (property === "delete") {
      void Promise.all(
        (selectedIds.has(issue.id) ? selectedIssues : [issue]).map((item) =>
          deleteIssue({ environmentId: item.environmentId, input: { issueId: item.id } }),
        ),
      );
      return;
    }
    setBulkProperty(property);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    if (!event.over || event.active.id === event.over.id) return;
    const activeIssue = orderedIssues.find((issue) => issue.id === event.active.id);
    if (!activeIssue) return;
    const targetGroup = groups.find(
      (group) =>
        group.id === event.over?.id || group.issues.some((issue) => issue.id === event.over?.id),
    );
    if (!targetGroup) return;
    const targetIssues = targetGroup.issues.filter((issue) => issue.id !== activeIssue.id);
    const overIndex = targetIssues.findIndex((issue) => issue.id === event.over?.id);
    const insertIndex = overIndex < 0 ? targetIssues.length : overIndex;
    const orderKey = orderKeyBetween(
      targetIssues[insertIndex - 1]?.orderKey ?? null,
      targetIssues[insertIndex]?.orderKey ?? null,
    );
    const groupPatch = patchForGroup(display.groupBy, targetGroup.value);
    void (async () => {
      if (groupPatch.teamId !== undefined) {
        await moveTeam({
          environmentId: activeIssue.environmentId,
          input: { issueId: activeIssue.id, teamId: groupPatch.teamId },
        });
      }
      await updateIssue({
        environmentId: activeIssue.environmentId,
        input: { issueId: activeIssue.id, patch: { ...groupPatch.patch, orderKey } },
      });
    })();
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map((group) => {
          const isCollapsed = collapsed.includes(group.id);
          return (
            <DroppableGroup key={group.id} id={group.id}>
              <button
                type="button"
                className="sticky top-0 z-10 flex h-8 w-full items-center gap-2 border-b bg-muted/92 px-3 text-left text-xs font-medium backdrop-blur"
                onClick={() => toggleCollapsed(group.id)}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
                {group.color ? (
                  <span className="size-2 rounded-full" style={{ backgroundColor: group.color }} />
                ) : null}
                <span>{group.label}</span>
                <span className="text-muted-foreground">{group.issues.length}</span>
              </button>
              {!isCollapsed ? (
                <SortableContext
                  items={group.issues.map((issue) => issue.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <LegendList<EnvironmentIssue>
                    data={group.issues}
                    keyExtractor={(issue) => issue.id}
                    estimatedItemSize={32}
                    style={{ height: Math.max(32, Math.min(group.issues.length * 32, 448)) }}
                    renderItem={({ item }) => {
                      const state = lookup.states.find(
                        (candidate) => candidate.id === item.stateId,
                      );
                      if (!state) return null;
                      return (
                        <IssueRow
                          issue={item}
                          state={state}
                          labels={lookup.labels.filter((label) => item.labelIds.includes(label.id))}
                          assignee={
                            lookup.actors.find((actor) => actor.id === item.assigneeActorId) ?? null
                          }
                          selected={selectedIds.has(item.id)}
                          focused={orderedIssues[focusedIndex]?.id === item.id}
                          dragDisabled={readOnly || display.orderBy !== "manual"}
                          onSelect={select}
                          onPeek={onPeek}
                          onBulkProperty={(property) => handleBulkProperty(property, item)}
                        />
                      );
                    }}
                  />
                </SortableContext>
              ) : null}
            </DroppableGroup>
          );
        })}
      </div>
      <Popover
        open={bulkProperty !== null}
        onOpenChange={(open) => {
          if (!open) setBulkProperty(null);
        }}
      >
        <PopoverTrigger
          className="pointer-events-none fixed bottom-4 left-1/2 size-px opacity-0"
          aria-hidden="true"
        />
        <PopoverPopup side="top" align="center" className="w-64" viewportClassName="p-1!">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Update {selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"}
          </p>
          {bulkProperty === "state"
            ? lookup.states.map((state) => (
                <Button
                  key={state.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => void patchSelected({ stateId: state.id })}
                >
                  <StateIcon state={state} />
                  {state.name}
                </Button>
              ))
            : null}
          {bulkProperty === "priority"
            ? PRIORITY_ORDER.map((priority) => (
                <Button
                  key={priority}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => void patchSelected({ priority })}
                >
                  <PriorityIcon priority={priority} />
                  {PRIORITY_PRESENTATION[priority].label}
                </Button>
              ))
            : null}
          {bulkProperty === "assignee" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => void patchSelected({ assigneeActorId: null })}
              >
                Unassigned
              </Button>
              {lookup.actors.map((actor) => (
                <Button
                  key={actor.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => void patchSelected({ assigneeActorId: actor.id })}
                >
                  {actor.displayName}
                </Button>
              ))}
            </>
          ) : null}
          {bulkProperty === "labels"
            ? lookup.labels.map((label) => (
                <Button
                  key={label.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => void patchSelected({ labelIds: [label.id] })}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                  {label.name}
                </Button>
              ))
            : null}
        </PopoverPopup>
      </Popover>
    </DndContext>
  );
}
