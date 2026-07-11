import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@pathwayos/client-runtime/state/runtime";
import type {
  EstimateScale,
  IssueActor,
  IssueCommand,
  IssueLabel,
  IssueStateId,
  IssueTeam,
  IssueTeamMembership,
  IssueWorkflowState,
  StateCategory,
} from "@pathwayos/contracts";
import { Atom } from "effect/unstable/reactivity";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { deriveCloudProjectKey } from "../../logicalProject";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjects } from "../../state/entities";
import {
  useIssueActors,
  useIssues,
  useIssueLabels,
  useIssueStates,
  useIssueTeams,
} from "../../state/issueEntities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { environmentIssues, issuesEnvironment } from "../../state/issues";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "../ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const EMPTY_MEMBERSHIPS = Atom.make<ReadonlyArray<IssueTeamMembership>>([]).pipe(
  Atom.withLabel("teams-settings:empty-memberships"),
);
const TEAM_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,5}$/u;
const STATE_CATEGORIES: ReadonlyArray<StateCategory> = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
];
const ESTIMATE_SCALES: ReadonlyArray<EstimateScale> = [
  "disabled",
  "exponential",
  "fibonacci",
  "linear",
  "tshirt",
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type TeamUpdatePatch = Extract<IssueCommand, { readonly type: "team.update" }>["patch"];

function suggestTeamKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/gu) ?? [];
  if (words.length === 0) return "";
  const initials = words.map((word) => word[0]).join("");
  return (initials.length >= 2 ? initials : (words[0] ?? "")).slice(0, 6);
}

function ActionError({ message }: { readonly message: string | null }) {
  return message ? <p className="px-1 text-xs text-destructive">{message}</p> : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The issue command failed.";
}

function TeamCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (input: {
    name: string;
    key: string;
    icon?: string;
    color?: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!keyEdited) setKey(suggestTeamKey(name));
  }, [keyEdited, name]);

  const submit = async () => {
    const trimmedName = name.trim();
    const normalizedKey = key.trim().toUpperCase();
    if (!trimmedName || !TEAM_KEY_PATTERN.test(normalizedKey)) return;
    setPending(true);
    try {
      const created = await onCreate({
        name: trimmedName,
        key: normalizedKey,
        ...(icon.trim() ? { icon: icon.trim() } : {}),
        ...(color ? { color } : {}),
      });
      if (!created) return;
      setName("");
      setKey("");
      setKeyEdited(false);
      setIcon("");
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Create issue team</DialogTitle>
          <DialogDescription>
            Teams own workflows, labels, members, and issue numbering.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Product"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Key
            <Input
              value={key}
              maxLength={6}
              onChange={(event) => {
                setKeyEdited(true);
                setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/gu, ""));
              }}
              placeholder="PROD"
              aria-invalid={key.length > 0 && !TEAM_KEY_PATTERN.test(key)}
            />
            <span className="block font-normal text-muted-foreground">
              1–6 uppercase letters or numbers; must start with a letter.
            </span>
          </label>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <label className="block space-y-1.5 text-xs font-medium">
              Icon emoji
              <Input
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="🚀"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Color
              <Input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending || !name.trim() || !TEAM_KEY_PATTERN.test(key)}
            onClick={() => void submit()}
          >
            Create team
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function TeamGeneral({
  team,
  onUpdate,
}: {
  readonly team: IssueTeam;
  readonly onUpdate: (patch: TeamUpdatePatch) => void;
}) {
  const [name, setName] = useState(team.name);
  const [key, setKey] = useState(team.key);
  const [icon, setIcon] = useState(team.icon ?? "");
  const [color, setColor] = useState(team.color ?? "#6366f1");
  useEffect(() => {
    setName(team.name);
    setKey(team.key);
    setIcon(team.icon ?? "");
    setColor(team.color ?? "#6366f1");
  }, [team]);
  return (
    <SettingsSection title="General">
      <SettingsRow
        title="Name"
        description="The team name shown across issue views."
        control={
          <Input
            className="sm:w-56"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() =>
              name.trim() && name.trim() !== team.name && onUpdate({ name: name.trim() })
            }
          />
        }
      />
      <SettingsRow
        title="Icon"
        description="A compact emoji used beside the team name."
        control={
          <Input
            className="sm:w-24"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            onBlur={() => icon !== (team.icon ?? "") && onUpdate({ icon: icon.trim() || null })}
          />
        }
      />
      <SettingsRow
        title="Color"
        description="Used to distinguish the team in lists and pickers."
        control={
          <Input
            className="sm:w-24"
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              onUpdate({ color: event.target.value });
            }}
          />
        }
      />
      <SettingsRow
        title="Issue key"
        description="Changing the key only affects identifiers allocated from now on. Existing issue identifiers are not re-keyed."
        control={
          <Input
            className="sm:w-28"
            maxLength={6}
            value={key}
            aria-invalid={!TEAM_KEY_PATTERN.test(key)}
            onChange={(event) =>
              setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/gu, ""))
            }
            onBlur={() => TEAM_KEY_PATTERN.test(key) && key !== team.key && onUpdate({ key })}
          />
        }
      />
    </SettingsSection>
  );
}

function WorkflowSettings({
  team,
  states,
  onCreate,
  onUpdate,
  onDelete,
}: {
  readonly team: IssueTeam;
  readonly states: ReadonlyArray<IssueWorkflowState>;
  readonly onCreate: (input: {
    teamId: IssueTeam["id"];
    name: string;
    color: string;
    category: StateCategory;
    position: number;
  }) => void;
  readonly onUpdate: (
    state: IssueWorkflowState,
    patch: { name?: string; color?: string; position?: number },
  ) => void;
  readonly onDelete: (state: IssueWorkflowState, migrateToStateId: IssueStateId) => void;
}) {
  const [newCategory, setNewCategory] = useState<StateCategory>("backlog");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748b");
  const [deleteState, setDeleteState] = useState<IssueWorkflowState | null>(null);
  const [migrateTo, setMigrateTo] = useState<IssueStateId | null>(null);
  const grouped = useMemo(
    () =>
      new Map(
        STATE_CATEGORIES.map((category) => [
          category,
          states
            .filter((state) => state.category === category)
            .sort((a, b) => a.position - b.position),
        ]),
      ),
    [states],
  );
  return (
    <SettingsSection title="Workflow states">
      <div className="divide-y divide-border/60">
        {STATE_CATEGORIES.map((category) => {
          const categoryStates = grouped.get(category) ?? [];
          return (
            <div className="space-y-2 px-4 py-3.5 sm:px-5" key={category}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </p>
              {categoryStates.map((state, index) => (
                <div className="flex flex-wrap items-center gap-2" key={state.id}>
                  <Input
                    className="h-7 min-w-36 flex-1"
                    defaultValue={state.name}
                    onBlur={(event) =>
                      event.target.value.trim() &&
                      event.target.value.trim() !== state.name &&
                      onUpdate(state, { name: event.target.value.trim() })
                    }
                  />
                  <Input
                    className="h-7 w-14"
                    type="color"
                    value={state.color}
                    onChange={(event) => onUpdate(state, { color: event.target.value })}
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={index === 0}
                    aria-label={`Move ${state.name} up`}
                    onClick={() => {
                      const neighbor = categoryStates[index - 1];
                      if (neighbor) {
                        onUpdate(neighbor, { position: state.position });
                        onUpdate(state, { position: neighbor.position });
                      }
                    }}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={index === categoryStates.length - 1}
                    aria-label={`Move ${state.name} down`}
                    onClick={() => {
                      const neighbor = categoryStates[index + 1];
                      if (neighbor) {
                        onUpdate(neighbor, { position: state.position });
                        onUpdate(state, { position: neighbor.position });
                      }
                    }}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={categoryStates.length < 2}
                    aria-label={`Delete ${state.name}`}
                    onClick={() => {
                      setDeleteState(state);
                      setMigrateTo(
                        categoryStates.find((candidate) => candidate.id !== state.id)?.id ?? null,
                      );
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 border-t border-border/60 px-4 py-3.5 sm:grid-cols-[1fr_9rem_4rem_auto] sm:px-5">
        <Input
          placeholder="New state"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <Select
          value={newCategory}
          onValueChange={(value) => setNewCategory(value as StateCategory)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {STATE_CATEGORIES.map((category) => (
              <SelectItem value={category} key={category}>
                {category}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Input
          type="color"
          value={newColor}
          onChange={(event) => setNewColor(event.target.value)}
        />
        <Button
          size="sm"
          disabled={!newName.trim()}
          onClick={() => {
            const categoryStates = grouped.get(newCategory) ?? [];
            onCreate({
              teamId: team.id,
              name: newName.trim(),
              color: newColor,
              category: newCategory,
              position: (categoryStates.at(-1)?.position ?? -1) + 1,
            });
            setNewName("");
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
      <Dialog open={deleteState !== null} onOpenChange={(open) => !open && setDeleteState(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Delete workflow state?</DialogTitle>
            <DialogDescription>
              Issues in this state must migrate to another state in the same category.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Select
              value={migrateTo}
              onValueChange={(value) => setMigrateTo(value as IssueStateId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Migrate issues to…" />
              </SelectTrigger>
              <SelectPopup>
                {(deleteState ? (grouped.get(deleteState.category) ?? []) : [])
                  .filter((state) => state.id !== deleteState?.id)
                  .map((state) => (
                    <SelectItem value={state.id} key={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
              </SelectPopup>
            </Select>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={!deleteState || !migrateTo}
              onClick={() => {
                if (deleteState && migrateTo) onDelete(deleteState, migrateTo);
                setDeleteState(null);
              }}
            >
              Delete and migrate
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SettingsSection>
  );
}

function LabelsSettings({
  labels,
  onCreate,
  onUpdate,
  onDelete,
}: {
  readonly labels: ReadonlyArray<IssueLabel>;
  readonly team: IssueTeam;
  readonly onCreate: (name: string, color: string) => void;
  readonly onUpdate: (label: IssueLabel, patch: { name?: string; color?: string }) => void;
  readonly onDelete: (label: IssueLabel) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  return (
    <SettingsSection title="Labels">
      {labels.map((label) => (
        <div
          className="flex items-center gap-2 border-t border-border/60 px-4 py-3 first:border-t-0 sm:px-5"
          key={label.id}
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />
          <Input
            className="h-7 flex-1"
            defaultValue={label.name}
            onBlur={(event) =>
              event.target.value.trim() &&
              event.target.value.trim() !== label.name &&
              onUpdate(label, { name: event.target.value.trim() })
            }
          />
          <Input
            className="h-7 w-14"
            type="color"
            value={label.color}
            onChange={(event) => onUpdate(label, { color: event.target.value })}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${label.name}`}
            onClick={() => onDelete(label)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {labels.length === 0 ? (
        <p className="px-5 py-4 text-xs text-muted-foreground">No team labels yet.</p>
      ) : null}
      <div className="grid gap-2 border-t border-border/60 px-4 py-3.5 sm:grid-cols-[1fr_4rem_auto] sm:px-5">
        <Input
          placeholder="New label"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={() => {
            onCreate(name.trim(), color);
            setName("");
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
    </SettingsSection>
  );
}

function TeamConfiguration({
  team,
  onUpdate,
}: {
  readonly team: IssueTeam;
  readonly onUpdate: (patch: {
    cycleConfig?: IssueTeam["cycleConfig"];
    estimateScale?: EstimateScale;
  }) => void;
}) {
  const cycle = team.cycleConfig;
  const updateCycle = (patch: Partial<IssueTeam["cycleConfig"]>) =>
    onUpdate({ cycleConfig: { ...cycle, ...patch } });
  return (
    <>
      <SettingsSection title="Cycles">
        <SettingsRow
          title="Enable cycles"
          description="Plan work in recurring team cycles."
          control={
            <Switch
              checked={cycle.enabled}
              onCheckedChange={(checked) => updateCycle({ enabled: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Start day"
          description="The weekday on which each cycle begins."
          control={
            <Select
              value={cycle.startDayOfWeek}
              onValueChange={(value) =>
                updateCycle({ startDayOfWeek: value as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
              }
            >
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {DAY_NAMES.map((day, index) => (
                  <SelectItem key={day} value={index}>
                    {day}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Duration"
          description="Number of active weeks per cycle."
          control={
            <Input
              className="sm:w-24"
              type="number"
              min={1}
              value={cycle.durationWeeks}
              onChange={(event) =>
                updateCycle({ durationWeeks: Math.max(1, Number(event.target.value)) })
              }
            />
          }
        />
        <SettingsRow
          title="Cooldown"
          description="Weeks between active cycles."
          control={
            <Input
              className="sm:w-24"
              type="number"
              min={0}
              value={cycle.cooldownWeeks}
              onChange={(event) =>
                updateCycle({ cooldownWeeks: Math.max(0, Number(event.target.value)) })
              }
            />
          }
        />
        <SettingsRow
          title="Auto-rollover"
          description="Move unfinished work into the next cycle."
          control={
            <Switch
              checked={cycle.autoRollover}
              onCheckedChange={(checked) => updateCycle({ autoRollover: Boolean(checked) })}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title="Estimates">
        <SettingsRow
          title="Estimate scale"
          description="Choose how effort is represented for this team."
          control={
            <Select
              value={team.estimateScale}
              onValueChange={(value) => onUpdate({ estimateScale: value as EstimateScale })}
            >
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {ESTIMATE_SCALES.map((scale) => (
                  <SelectItem value={scale} key={scale}>
                    {scale}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </>
  );
}

function MembersSettings({
  actors,
  memberships,
  onAdd,
  onRemove,
}: {
  readonly actors: ReadonlyArray<IssueActor>;
  readonly memberships: ReadonlyArray<IssueTeamMembership>;
  readonly onAdd: (actor: IssueActor) => void;
  readonly onRemove: (membership: IssueTeamMembership) => void;
}) {
  const memberIds = new Set(memberships.map((membership) => membership.actorId));
  const available = actors.filter((actor) => !memberIds.has(actor.id) && actor.deletedAt === null);
  const [actorId, setActorId] = useState<IssueActor["id"] | null>(available[0]?.id ?? null);
  useEffect(() => {
    if (actorId === null || !available.some((actor) => actor.id === actorId))
      setActorId(available[0]?.id ?? null);
  }, [actorId, available]);
  return (
    <SettingsSection title="Members">
      {memberships.map((membership) => {
        const actor = actors.find((candidate) => candidate.id === membership.actorId);
        return (
          <div
            className="flex items-center justify-between border-t border-border/60 px-4 py-3 first:border-t-0 sm:px-5"
            key={membership.id}
          >
            <span className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: actor?.avatarColor ?? "#64748b" }}
              />
              {actor?.displayName ?? "Unknown actor"}
              {actor?.kind === "agent" ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  agent
                </span>
              ) : null}
            </span>
            <Button size="xs" variant="ghost" onClick={() => onRemove(membership)}>
              Remove
            </Button>
          </div>
        );
      })}
      <div className="flex gap-2 border-t border-border/60 px-4 py-3.5 sm:px-5">
        <Combobox
          value={actorId}
          onValueChange={(value) => setActorId(value as IssueActor["id"] | null)}
          itemToStringValue={(value) =>
            available.find((actor) => actor.id === value)?.displayName ?? ""
          }
        >
          <ComboboxInput placeholder="Search all actors…" />
          <ComboboxPopup>
            <ComboboxEmpty>No actors available.</ComboboxEmpty>
            <ComboboxList>
              {available.map((actor) => (
                <ComboboxItem value={actor.id} key={actor.id}>
                  {actor.displayName}
                  {actor.kind === "agent" ? " (agent)" : ""}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
        <Button
          size="sm"
          disabled={!actorId}
          onClick={() => {
            const actor = available.find((candidate) => candidate.id === actorId);
            if (actor) onAdd(actor);
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
    </SettingsSection>
  );
}

function ReposSettings({
  team,
  onUpdate,
}: {
  readonly team: IssueTeam;
  readonly onUpdate: (patch: {
    repoLinks?: IssueTeam["repoLinks"];
    defaultRepoLogicalKey?: string | null;
  }) => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const options = projects
    .map((project) => ({
      logicalProjectKey: deriveCloudProjectKey(project),
      displayName: project.title,
    }))
    .filter(
      (project) =>
        !team.repoLinks.some((link) => link.logicalProjectKey === project.logicalProjectKey),
    );
  const [selectedKey, setSelectedKey] = useState<string | null>(
    options[0]?.logicalProjectKey ?? null,
  );
  useEffect(() => {
    if (selectedKey === null || !options.some((option) => option.logicalProjectKey === selectedKey))
      setSelectedKey(options[0]?.logicalProjectKey ?? null);
  }, [options, selectedKey]);
  return (
    <SettingsSection title="Repositories">
      {team.repoLinks.map((link) => (
        <div
          className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 first:border-t-0 sm:px-5"
          key={link.logicalProjectKey}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{link.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{link.logicalProjectKey}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant={
                team.defaultRepoLogicalKey === link.logicalProjectKey ? "secondary" : "ghost"
              }
              onClick={() => onUpdate({ defaultRepoLogicalKey: link.logicalProjectKey })}
            >
              {team.defaultRepoLogicalKey === link.logicalProjectKey ? "Default" : "Set default"}
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${link.displayName}`}
              onClick={() =>
                onUpdate({
                  repoLinks: team.repoLinks.filter(
                    (candidate) => candidate.logicalProjectKey !== link.logicalProjectKey,
                  ),
                  ...(team.defaultRepoLogicalKey === link.logicalProjectKey
                    ? { defaultRepoLogicalKey: null }
                    : {}),
                })
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2 border-t border-border/60 px-4 py-3.5 sm:px-5">
        <Combobox
          value={selectedKey}
          onValueChange={setSelectedKey}
          itemToStringValue={(value) =>
            options.find((option) => option.logicalProjectKey === value)?.displayName ?? ""
          }
        >
          <ComboboxInput placeholder="Search local projects…" />
          <ComboboxPopup>
            <ComboboxEmpty>No local projects available.</ComboboxEmpty>
            <ComboboxList>
              {options.map((option) => (
                <ComboboxItem value={option.logicalProjectKey} key={option.logicalProjectKey}>
                  {option.displayName}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
        <Button
          size="sm"
          disabled={!selectedKey}
          onClick={() => {
            const option = options.find((candidate) => candidate.logicalProjectKey === selectedKey);
            if (option)
              onUpdate({
                repoLinks: [...team.repoLinks, option],
                ...(team.defaultRepoLogicalKey === null
                  ? { defaultRepoLogicalKey: option.logicalProjectKey }
                  : {}),
              });
          }}
        >
          <PlusIcon />
          Link
        </Button>
      </div>
    </SettingsSection>
  );
}

export function TeamsSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const teams = useIssueTeams(environmentId).filter((team) => team.deletedAt === null);
  const states = useIssueStates(environmentId).filter((state) => state.deletedAt === null);
  const labels = useIssueLabels(environmentId).filter((label) => label.deletedAt === null);
  const actors = useIssueActors(environmentId);
  const issues = useIssues().filter((issue) => issue.environmentId === environmentId);
  const memberships = useAtomValue(
    environmentId === null
      ? EMPTY_MEMBERSHIPS
      : environmentIssues.environmentMembershipsAtom(environmentId),
  ).filter((membership) => membership.deletedAt === null);
  const [selectedTeamId, setSelectedTeamId] = useState<IssueTeam["id"] | null>(
    teams[0]?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runCreateTeam = useAtomCommand(issuesEnvironment.createTeam, { reportFailure: false });
  const runUpdateTeam = useAtomCommand(issuesEnvironment.updateTeam, { reportFailure: false });
  const runDeleteTeam = useAtomCommand(issuesEnvironment.deleteTeam, { reportFailure: false });
  const runCreateState = useAtomCommand(issuesEnvironment.createState, { reportFailure: false });
  const runUpdateState = useAtomCommand(issuesEnvironment.updateState, { reportFailure: false });
  const runDeleteState = useAtomCommand(issuesEnvironment.deleteState, { reportFailure: false });
  const runCreateLabel = useAtomCommand(issuesEnvironment.createLabel, { reportFailure: false });
  const runUpdateLabel = useAtomCommand(issuesEnvironment.updateLabel, { reportFailure: false });
  const runDeleteLabel = useAtomCommand(issuesEnvironment.deleteLabel, { reportFailure: false });
  const runAddMember = useAtomCommand(issuesEnvironment.addTeamMember, { reportFailure: false });
  const runRemoveMember = useAtomCommand(issuesEnvironment.removeTeamMember, {
    reportFailure: false,
  });
  useEffect(() => {
    if (!teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(teams[0]?.id ?? null);
  }, [selectedTeamId, teams]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const execute = async <A, E>(operation: () => Promise<AtomCommandResult<A, E>>) => {
    setError(null);
    const result = await operation();
    if (result._tag === "Failure") setError(errorMessage(squashAtomCommandFailure(result)));
    return result._tag !== "Failure";
  };
  if (environmentId === null)
    return (
      <SettingsPageContainer>
        <SettingsSection title="Issue teams">
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Connect the primary PathwayOS environment to manage issue teams.
          </p>
        </SettingsSection>
      </SettingsPageContainer>
    );
  const updateTeam = (team: IssueTeam, patch: TeamUpdatePatch) =>
    void execute(() => runUpdateTeam({ environmentId, input: { teamId: team.id, patch } }));
  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Issue teams"
        icon={<UsersIcon className="size-3" />}
        headerAction={
          <Button size="xs" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New team
          </Button>
        }
      >
        {teams.map((team) => {
          const memberCount = memberships.filter(
            (membership) => membership.teamId === team.id,
          ).length;
          return (
            <button
              type="button"
              onClick={() => setSelectedTeamId(team.id)}
              className={`flex w-full items-center gap-3 border-t border-border/60 px-4 py-3 text-left first:border-t-0 sm:px-5 ${selectedTeamId === team.id ? "bg-accent/60" : "hover:bg-accent/30"}`}
              key={team.id}
            >
              <span
                className="flex size-8 items-center justify-center rounded-lg text-lg"
                style={{ backgroundColor: `${team.color ?? "#64748b"}22` }}
              >
                {team.icon ?? team.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{team.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {team.key} · {memberCount} {memberCount === 1 ? "member" : "members"}
                </span>
              </span>
            </button>
          );
        })}
        {teams.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Create your first issue team to define a workflow.
          </p>
        ) : null}
      </SettingsSection>
      <ActionError message={error} />
      {selectedTeam ? (
        <>
          <TeamGeneral team={selectedTeam} onUpdate={(patch) => updateTeam(selectedTeam, patch)} />
          <WorkflowSettings
            team={selectedTeam}
            states={states.filter((state) => state.teamId === selectedTeam.id)}
            onCreate={(input) => void execute(() => runCreateState({ environmentId, input }))}
            onUpdate={(state, patch) =>
              void execute(() =>
                runUpdateState({ environmentId, input: { stateId: state.id, patch } }),
              )
            }
            onDelete={(state, migrateToStateId) =>
              void execute(() =>
                runDeleteState({ environmentId, input: { stateId: state.id, migrateToStateId } }),
              )
            }
          />
          <LabelsSettings
            team={selectedTeam}
            labels={labels.filter((label) => label.teamId === selectedTeam.id)}
            onCreate={(name, color) =>
              void execute(() =>
                runCreateLabel({ environmentId, input: { teamId: selectedTeam.id, name, color } }),
              )
            }
            onUpdate={(label, patch) =>
              void execute(() =>
                runUpdateLabel({ environmentId, input: { labelId: label.id, patch } }),
              )
            }
            onDelete={(label) =>
              void execute(() => runDeleteLabel({ environmentId, input: { labelId: label.id } }))
            }
          />
          <TeamConfiguration
            team={selectedTeam}
            onUpdate={(patch) => updateTeam(selectedTeam, patch)}
          />
          <MembersSettings
            actors={actors}
            memberships={memberships.filter((membership) => membership.teamId === selectedTeam.id)}
            onAdd={(actor) =>
              void execute(() =>
                runAddMember({
                  environmentId,
                  input: { teamId: selectedTeam.id, actorId: actor.id },
                }),
              )
            }
            onRemove={(membership) =>
              void execute(() =>
                runRemoveMember({ environmentId, input: { membershipId: membership.id } }),
              )
            }
          />
          <ReposSettings
            team={selectedTeam}
            onUpdate={(patch) => updateTeam(selectedTeam, patch)}
          />
          <SettingsSection title="Danger zone">
            <SettingsRow
              title="Delete team"
              description={
                issues.some((issue) => issue.teamId === selectedTeam.id && issue.deletedAt === null)
                  ? "This team still has active issues. Move or delete every issue before deleting the team."
                  : "Deleting a team soft-deletes it. Its deleted issues retain the team reference and render under “Deleted team”."
              }
              control={
                <Button
                  variant="destructive-outline"
                  size="sm"
                  disabled={issues.some(
                    (issue) => issue.teamId === selectedTeam.id && issue.deletedAt === null,
                  )}
                  onClick={() =>
                    void execute(() =>
                      runDeleteTeam({ environmentId, input: { teamId: selectedTeam.id } }),
                    )
                  }
                >
                  Delete team
                </Button>
              }
            />
          </SettingsSection>
        </>
      ) : null}
      <TeamCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(input) => execute(() => runCreateTeam({ environmentId, input }))}
      />
    </SettingsPageContainer>
  );
}
