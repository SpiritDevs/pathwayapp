import type {
  IssueActor,
  IssuePriority,
  IssueWorkflowState,
  StateCategory,
} from "@pathwayos/contracts";
import {
  AlertTriangleIcon,
  BanIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  MinusIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export const PRIORITY_PRESENTATION: Record<
  IssuePriority,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  0: { label: "No priority", icon: MinusIcon, className: "text-muted-foreground/60" },
  1: { label: "Urgent", icon: AlertTriangleIcon, className: "text-destructive" },
  2: { label: "High", icon: SignalHighIcon, className: "text-warning-foreground" },
  3: { label: "Medium", icon: SignalMediumIcon, className: "text-muted-foreground" },
  4: { label: "Low", icon: SignalLowIcon, className: "text-muted-foreground/70" },
};

export const PRIORITY_ORDER: ReadonlyArray<IssuePriority> = [1, 2, 3, 4, 0];

export const STATE_CATEGORY_ICONS: Record<
  StateCategory,
  ComponentType<{ className?: string }>
> = {
  triage: CircleDashedIcon,
  backlog: CircleIcon,
  unstarted: CircleIcon,
  started: CircleDotIcon,
  completed: CircleCheckIcon,
  canceled: BanIcon,
};

export function StateIcon({ state, className }: { state: IssueWorkflowState; className?: string }) {
  const Icon = STATE_CATEGORY_ICONS[state.category];
  return <Icon className={className} style={{ color: state.color }} />;
}

export function PriorityIcon({ priority, className }: { priority: IssuePriority; className?: string }) {
  const presentation = PRIORITY_PRESENTATION[priority];
  const Icon = presentation.icon;
  return <Icon className={`${presentation.className} ${className ?? ""}`} />;
}

export function avatarColorFor(actor: Pick<IssueActor, "avatarColor" | "displayName">): string {
  if (actor.avatarColor.trim()) return actor.avatarColor;
  let hash = 0;
  for (const character of actor.displayName) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 52% 48%)`;
}

export function actorInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
