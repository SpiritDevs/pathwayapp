import type { GroupBy, IssueDisplayConfig, OrderBy, ViewMode } from "@pathwayos/contracts";
import { CheckIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";

const GROUP_OPTIONS: ReadonlyArray<{ value: GroupBy; label: string }> = [
  { value: "state", label: "State" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "label", label: "Label" },
  { value: "cycle", label: "Cycle" },
  { value: "epic", label: "Epic" },
  { value: "team", label: "Team" },
  { value: "none", label: "No grouping" },
];
const ORDER_OPTIONS: ReadonlyArray<{ value: OrderBy; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
];
const VIEW_OPTIONS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];
type SwimlaneBy = NonNullable<IssueDisplayConfig["swimlaneBy"]>;
const SWIMLANE_OPTIONS: ReadonlyArray<{ value: SwimlaneBy; label: string }> = [
  { value: "none", label: "None" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "epic", label: "Epic" },
];

function Options<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs hover:bg-accent",
              value === option.value && "bg-accent text-accent-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            <CheckIcon className={cn("size-3", value !== option.value && "opacity-0")} />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 items-center justify-between gap-4 rounded-md px-2 text-xs hover:bg-accent">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function DisplayOptions({
  display,
  onChange,
}: {
  display: IssueDisplayConfig;
  onChange: (display: IssueDisplayConfig) => void;
}) {
  const patch = (next: Partial<IssueDisplayConfig>) => onChange({ ...display, ...next });
  return (
    <Popover>
      <PopoverTrigger render={<Button size="xs" variant="outline" />}>
        <SlidersHorizontalIcon /> Display
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-64" viewportClassName="space-y-1 p-2!">
        <Options
          label="View"
          value={display.viewMode}
          options={VIEW_OPTIONS}
          onChange={(viewMode) => patch({ viewMode })}
        />
        <Separator />
        <Options
          label="Group by"
          value={display.groupBy}
          options={GROUP_OPTIONS}
          onChange={(groupBy) => patch({ groupBy })}
        />
        <Separator />
        <Options
          label="Swimlanes"
          value={display.swimlaneBy ?? "none"}
          options={SWIMLANE_OPTIONS}
          onChange={(swimlaneBy) => patch({ swimlaneBy })}
        />
        <Separator />
        <Options
          label="Order by"
          value={display.orderBy}
          options={ORDER_OPTIONS}
          onChange={(orderBy) => patch({ orderBy })}
        />
        <Separator />
        <ToggleRow
          label="Show completed"
          checked={display.showCompleted}
          onChange={(showCompleted) => patch({ showCompleted })}
        />
        <ToggleRow
          label="Show triage"
          checked={display.showTriage}
          onChange={(showTriage) => patch({ showTriage })}
        />
        <ToggleRow
          label="Show sub-issues"
          checked={display.showSubIssues}
          onChange={(showSubIssues) => patch({ showSubIssues })}
        />
      </PopoverPopup>
    </Popover>
  );
}
