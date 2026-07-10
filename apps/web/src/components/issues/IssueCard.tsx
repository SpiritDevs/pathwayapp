import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EnvironmentIssue } from "@pathwayos/client-runtime/state/issues";
import type { IssueActor, IssueLabel } from "@pathwayos/contracts";
import { CheckCircle2Icon, CircleIcon, GripVerticalIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

import { actorInitials, avatarColorFor, PriorityIcon } from "./issuePresentation";
import { navigateToIssue } from "./issuesView";

export function IssueCard({
  issue,
  labels,
  assignee,
  subIssueProgress,
  overlay = false,
  dragDisabled = false,
}: {
  issue: EnvironmentIssue;
  labels: ReadonlyArray<IssueLabel>;
  assignee: IssueActor | null;
  subIssueProgress?: { completed: number; total: number } | undefined;
  overlay?: boolean;
  dragDisabled?: boolean;
}) {
  const sortable = useSortable({ id: issue.id, data: { issue }, disabled: overlay || dragDisabled });
  return (
    <article
      ref={overlay ? undefined : sortable.setNodeRef}
      className={cn(
        "group/card min-h-24 rounded-lg border border-border/75 bg-background px-3 py-2.5 text-sm shadow-xs transition-[border-color,box-shadow,opacity,transform] hover:border-border hover:shadow-sm",
        sortable.isDragging && "opacity-20",
        overlay && "w-72 rotate-1 shadow-lg ring-1 ring-primary/20",
      )}
      onClick={() => navigateToIssue(issue.identifier)}
      style={overlay ? undefined : { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
    >
      <div className="flex items-start gap-2">
        <button
          ref={overlay ? undefined : sortable.setActivatorNodeRef}
          type="button"
          className="-ml-1 mt-0.5 text-muted-foreground/30 opacity-0 group-hover/card:opacity-100"
          onClick={(event) => event.stopPropagation()}
          {...(overlay || dragDisabled ? {} : sortable.attributes)}
          {...(overlay || dragDisabled ? {} : sortable.listeners)}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
        <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5">{issue.title}</p>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-muted-foreground">
        <PriorityIcon priority={issue.priority} className="size-3.5" />
        <span className="font-mono text-[10px]">{issue.identifier}</span>
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {labels.slice(0, 2).map((label) => (
            <Badge key={label.id} variant="outline" size="sm" className="max-w-20 border-0 bg-muted/70 font-normal">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />
              <span className="truncate">{label.name}</span>
            </Badge>
          ))}
        </div>
        {subIssueProgress ? (
          <span className="flex items-center gap-1 text-[10px]">
            {subIssueProgress.completed === subIssueProgress.total ? <CheckCircle2Icon className="size-3" /> : <CircleIcon className="size-3" />}
            {subIssueProgress.completed}/{subIssueProgress.total}
          </span>
        ) : null}
        {assignee ? (
          <Avatar className="size-5" style={{ backgroundColor: avatarColorFor(assignee) }}>
            {assignee.avatarUrl ? <AvatarImage src={assignee.avatarUrl} alt={assignee.displayName} /> : null}
            <AvatarFallback className="text-[9px] text-white">{actorInitials(assignee.displayName)}</AvatarFallback>
          </Avatar>
        ) : null}
      </div>
    </article>
  );
}
