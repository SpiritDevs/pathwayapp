import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueActor, IssueLabel, IssueWorkflowState } from "@pathwayos/contracts";
import { CalendarIcon, EllipsisIcon, GripVerticalIcon, TagIcon, Trash2Icon } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import { actorInitials, avatarColorFor, PriorityIcon, StateIcon } from "./issuePresentation";
import { issueRef, navigateToIssue } from "./issuesView";

export type IssueBulkProperty = "state" | "priority" | "assignee" | "labels" | "delete";

export function IssueRow({
  issue,
  state,
  labels,
  assignee,
  selected,
  focused,
  dragDisabled,
  onSelect,
  onPeek,
  onBulkProperty,
}: {
  issue: EnvironmentIssue;
  state: IssueWorkflowState;
  labels: ReadonlyArray<IssueLabel>;
  assignee: IssueActor | null;
  selected: boolean;
  focused: boolean;
  dragDisabled: boolean;
  onSelect: (ref: ScopedIssueRef, options: { range: boolean; additive: boolean }) => void;
  onPeek: (ref: ScopedIssueRef) => void;
  onBulkProperty: (property: IssueBulkProperty) => void;
}) {
  const ref = issueRef(issue);
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id, data: { issue, group: state.id }, disabled: dragDisabled });
  const overdue = issue.dueDate !== null && issue.dueDate < new Date().toISOString().slice(0, 10);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      onSelect(ref, { range: event.shiftKey, additive: event.metaKey || event.ctrlKey });
      return;
    }
    navigateToIssue(issue.identifier);
  };

  return (
    <div
      ref={setNodeRef}
      role="row"
      tabIndex={focused ? 0 : -1}
      aria-selected={selected}
      className={cn(
        "group/issue grid h-8 min-w-[720px] cursor-default grid-cols-[20px_20px_76px_minmax(220px,1fr)_minmax(100px,auto)_86px_48px_32px] items-center gap-1.5 border-b border-border/55 px-2 text-sm outline-none hover:bg-accent/45 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-primary/7 hover:bg-primary/10",
        focused && !selected && "bg-accent/35",
        isDragging && "z-30 opacity-25",
      )}
      data-issue-id={issue.id}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key !== " ") return;
        event.preventDefault();
        onPeek(ref);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag ${issue.identifier}`}
        className="flex size-5 items-center justify-center text-muted-foreground/30 opacity-0 group-hover/issue:opacity-100 focus-visible:opacity-100"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <StateIcon state={state} className="size-3.5" />
      <span className="truncate font-mono text-[11px] text-muted-foreground/72">{issue.identifier}</span>
      <div className="flex min-w-0 items-center gap-2">
        <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
        <span className="truncate text-[13px]">{issue.title}</span>
        <div className="flex min-w-0 gap-1 overflow-hidden">
          {labels.slice(0, 2).map((label) => (
            <Badge key={label.id} variant="outline" size="sm" className="max-w-24 border-0 bg-muted/70 font-normal text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />
              <span className="truncate">{label.name}</span>
            </Badge>
          ))}
        </div>
      </div>
      <span className={cn("flex items-center gap-1 text-xs text-muted-foreground", overdue && "text-destructive")}>
        {issue.dueDate ? <CalendarIcon className="size-3" /> : null}
        {issue.dueDate ?? ""}
      </span>
      <span className="text-right text-xs text-muted-foreground">{issue.estimate ?? ""}</span>
      <div className="flex justify-center">
        {assignee ? (
          <Tooltip>
            <TooltipTrigger>
              <Avatar className="size-5" style={{ backgroundColor: avatarColorFor(assignee) }}>
                {assignee.avatarUrl ? <AvatarImage src={assignee.avatarUrl} alt={assignee.displayName} /> : null}
                <AvatarFallback className="text-[9px] text-white">{actorInitials(assignee.displayName)}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipPopup>{assignee.displayName}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      <Menu>
        <MenuTrigger
          render={<Button size="icon-xs" variant="ghost" />}
          onClick={(event) => event.stopPropagation()}
          aria-label="Issue actions"
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup align="end" onClick={(event) => event.stopPropagation()}>
          <MenuItem onClick={() => onBulkProperty("state")}>Set state</MenuItem>
          <MenuItem onClick={() => onBulkProperty("priority")}>Set priority</MenuItem>
          <MenuItem onClick={() => onBulkProperty("assignee")}>Set assignee</MenuItem>
          <MenuItem onClick={() => onBulkProperty("labels")}><TagIcon />Set labels</MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => onBulkProperty("delete")}><Trash2Icon />Delete</MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}
