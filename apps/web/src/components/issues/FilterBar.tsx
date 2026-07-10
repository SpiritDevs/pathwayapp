import type {
  IssueActor,
  IssueCycle,
  IssueEpic,
  IssueFilterConfig,
  IssueLabel,
  IssuePriority,
  IssueTeam,
  IssueWorkflowState,
} from "@pathwayos/contracts";
import { CheckIcon, FilterIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

import { PRIORITY_ORDER, PRIORITY_PRESENTATION, PriorityIcon, StateIcon } from "./issuePresentation";

interface FilterOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
}

function FilterChip<T extends string | number>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: ReadonlyArray<T>;
  options: ReadonlyArray<FilterOption<T>>;
  onChange: (values: T[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button size="xs" variant={values.length ? "secondary" : "outline"} />}
        className="rounded-full font-normal"
      >
        {label}{values.length ? ` · ${values.length}` : ""}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-64" viewportClassName="p-0!">
        <Command>
          <CommandInput placeholder={`Filter ${label.toLowerCase()}…`} />
          <CommandList className="max-h-72">
            <CommandEmpty>No matches.</CommandEmpty>
            {options.map((option) => {
              const selected = values.includes(option.value);
              return (
                <CommandItem
                  key={String(option.value)}
                  value={`${option.label} ${option.value}`}
                  onClick={() => onChange(selected ? values.filter((value) => value !== option.value) : [...values, option.value])}
                >
                  <CheckIcon className={cn("size-3.5", !selected && "opacity-0")} />
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverPopup>
    </Popover>
  );
}

export function FilterBar({
  filters,
  onChange,
  teams,
  states,
  actors,
  labels,
  cycles,
  epics,
}: {
  filters: IssueFilterConfig;
  onChange: (filters: IssueFilterConfig) => void;
  teams: ReadonlyArray<IssueTeam>;
  states: ReadonlyArray<IssueWorkflowState>;
  actors: ReadonlyArray<IssueActor>;
  labels: ReadonlyArray<IssueLabel>;
  cycles: ReadonlyArray<IssueCycle>;
  epics: ReadonlyArray<IssueEpic>;
}) {
  const [search, setSearch] = useState(filters.searchText ?? "");
  useEffect(() => setSearch(filters.searchText ?? ""), [filters.searchText]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (search === (filters.searchText ?? "")) return;
      const { searchText: _previousSearch, ...rest } = filters;
      onChange(search ? { ...rest, searchText: search } : rest);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters, onChange, search]);

  const activeCount = Object.entries(filters).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "",
  ).length;
  const update = <K extends keyof IssueFilterConfig>(key: K, value: IssueFilterConfig[K]) => {
    const next = { ...filters, [key]: value };
    if (Array.isArray(value) && value.length === 0) delete next[key];
    onChange(next);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border/65 px-4 py-2">
      <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FilterIcon className="size-3.5" /> Filters
      </span>
      <FilterChip label="Team" values={filters.teamIds ?? []} options={teams.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => update("teamIds", value)} />
      <FilterChip label="State" values={filters.stateIds ?? []} options={states.map((item) => ({ value: item.id, label: item.name, icon: <StateIcon state={item} className="size-3.5" /> }))} onChange={(value) => update("stateIds", value)} />
      <FilterChip label="Assignee" values={filters.assigneeActorIds ?? []} options={actors.map((item) => ({ value: item.id, label: item.displayName }))} onChange={(value) => update("assigneeActorIds", value)} />
      <FilterChip<IssuePriority> label="Priority" values={filters.priorities ?? []} options={PRIORITY_ORDER.map((value) => ({ value, label: PRIORITY_PRESENTATION[value].label, icon: <PriorityIcon priority={value} className="size-3.5" /> }))} onChange={(value) => update("priorities", value)} />
      <FilterChip label="Label" values={filters.labelIds ?? []} options={labels.map((item) => ({ value: item.id, label: item.name, icon: <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} /> }))} onChange={(value) => update("labelIds", value)} />
      <FilterChip label="Cycle" values={filters.cycleIds ?? []} options={cycles.map((item) => ({ value: item.id, label: item.name ?? `Cycle ${item.number}` }))} onChange={(value) => update("cycleIds", value)} />
      <FilterChip label="Epic" values={filters.epicIds ?? []} options={epics.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => update("epicIds", value)} />
      <div className="relative ml-auto min-w-44 max-w-64 flex-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues…" className="h-7 rounded-full pl-8 text-xs" />
      </div>
      {activeCount > 0 ? (
        <Button size="xs" variant="ghost" onClick={() => { setSearch(""); onChange({}); }}>
          <XIcon /> Clear all
        </Button>
      ) : null}
    </div>
  );
}
