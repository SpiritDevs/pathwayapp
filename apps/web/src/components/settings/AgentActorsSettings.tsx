import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@pathwayos/client-runtime/state/runtime";
import type { AgentActorRuntimeConfig, IssueActor, ProviderInstanceId } from "@pathwayos/contracts";
import { BotIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import {
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useIssueActors, useIssuesSnapshotMeta } from "../../state/issueEntities";
import { issuesEnvironment } from "../../state/issues";
import { primaryServerProvidersAtom } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomValue } from "@effect/atom-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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
import { Textarea } from "../ui/textarea";
import { IssueDelegationSettings } from "./IssueDelegationSettings";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The issue command failed.";
}

interface AgentDraft {
  readonly displayName: string;
  readonly avatarColor: string;
  readonly config: AgentActorRuntimeConfig;
}

function AgentDialog({
  open,
  actor,
  config,
  onOpenChange,
  onSave,
}: {
  readonly open: boolean;
  readonly actor: IssueActor | null;
  readonly config: AgentActorRuntimeConfig | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (draft: AgentDraft) => Promise<boolean>;
}) {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const entries = useMemo(
    () =>
      sortProviderInstanceEntries(deriveProviderInstanceEntries(providers)).filter(
        (entry) => entry.enabled,
      ),
    [providers],
  );
  const [displayName, setDisplayName] = useState(actor?.displayName ?? "");
  const [avatarColor, setAvatarColor] = useState(actor?.avatarColor ?? AVATAR_COLORS[5]);
  const [providerInstanceId, setProviderInstanceId] = useState<string | null>(
    config?.providerInstanceId ?? entries[0]?.instanceId ?? null,
  );
  const [model, setModel] = useState(config?.model ?? "");
  const [instructions, setInstructions] = useState(config?.instructions ?? "");
  const [pending, setPending] = useState(false);
  const selectedProvider = entries.find((entry) => entry.instanceId === providerInstanceId);

  const save = async () => {
    if (!displayName.trim()) return;
    setPending(true);
    try {
      const saved = await onSave({
        displayName: displayName.trim(),
        avatarColor,
        config: {
          providerInstanceId,
          model: model.trim() || null,
          instructions: instructions.trim() || null,
        },
      });
      if (saved) onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{actor ? "Edit agent actor" : "Create agent actor"}</DialogTitle>
          <DialogDescription>
            Agent actors can own issues and receive delegated coding sessions on this PathwayOS
            instance.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            Display name
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Pathway agent"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Avatar color</legend>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  type="button"
                  aria-label={`Use ${color}`}
                  aria-pressed={avatarColor === color}
                  className="size-7 rounded-full ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ backgroundColor: color }}
                  key={color}
                  onClick={() => setAvatarColor(color)}
                />
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1.5 text-xs font-medium">
            Provider instance
            <Select
              value={providerInstanceId}
              onValueChange={(value) => {
                setProviderInstanceId(value as ProviderInstanceId);
                setModel("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectPopup>
                {entries.map((entry) => (
                  <SelectItem value={entry.instanceId} key={entry.instanceId}>
                    {entry.displayName}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Model
            <Input
              list="agent-model-options"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={selectedProvider?.models[0]?.slug ?? "Provider default"}
            />
            <datalist id="agent-model-options">
              {selectedProvider?.models.map((item) => (
                <option value={item.slug} key={item.slug}>
                  {item.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Standing instructions
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="How this agent should approach delegated issues…"
            />
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending || !displayName.trim()} onClick={() => void save()}>
            {actor ? "Save changes" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function AgentActorsSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const actors = useIssueActors(environmentId).filter(
    (actor) => actor.kind === "agent" && actor.deletedAt === null,
  );
  const snapshot = useIssuesSnapshotMeta(environmentId);
  const settings = usePrimarySettings();
  const [dialogActor, setDialogActor] = useState<IssueActor | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const createAgent = useAtomCommand(issuesEnvironment.createAgent, { reportFailure: false });
  const updateAgent = useAtomCommand(issuesEnvironment.updateAgent, { reportFailure: false });
  const deleteAgent = useAtomCommand(issuesEnvironment.deleteAgent, { reportFailure: false });
  const execute = async <A, E>(operation: () => Promise<AtomCommandResult<A, E>>) => {
    setError(null);
    const result = await operation();
    if (result._tag === "Failure") {
      setError(errorMessage(squashAtomCommandFailure(result)));
      return false;
    }
    return true;
  };
  const isOwner = (actor: IssueActor) =>
    snapshot.viewerUserId !== null && actor.ownerUserId === snapshot.viewerUserId;

  if (environmentId === null)
    return (
      <SettingsPageContainer>
        <SettingsSection title="Agent actors">
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Connect the primary PathwayOS environment to manage agents.
          </p>
        </SettingsSection>
      </SettingsPageContainer>
    );
  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Agent registry"
        icon={<BotIcon className="size-3" />}
        headerAction={
          <Button size="xs" onClick={() => setDialogActor(null)}>
            <PlusIcon />
            New agent
          </Button>
        }
      >
        {actors.map((actor) => {
          const config = settings.agentActors[actor.id] ?? null;
          const owned = isOwner(actor);
          return (
            <div
              className="flex items-center gap-3 border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5"
              key={actor.id}
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: actor.avatarColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{actor.displayName}</span>
                  <Badge variant={owned ? "secondary" : "outline"}>
                    {owned ? "you" : "another owner"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {config?.providerInstanceId ? (
                    <Badge variant="outline">{config.providerInstanceId}</Badge>
                  ) : (
                    <Badge variant="outline">default provider</Badge>
                  )}
                  {config?.model ? (
                    <Badge variant="outline">{config.model}</Badge>
                  ) : (
                    <Badge variant="outline">default model</Badge>
                  )}
                </div>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={!owned}
                aria-label={`Edit ${actor.displayName}`}
                onClick={() => setDialogActor(actor)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={!owned}
                aria-label={`Delete ${actor.displayName}`}
                onClick={() =>
                  void execute(() => deleteAgent({ environmentId, input: { actorId: actor.id } }))
                }
              >
                <Trash2Icon />
              </Button>
            </div>
          );
        })}
        {actors.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No agent actors are registered yet.
          </p>
        ) : null}
      </SettingsSection>
      {error ? <p className="px-1 text-xs text-destructive">{error}</p> : null}
      <IssueDelegationSettings />
      {dialogActor !== undefined ? (
        <AgentDialog
          key={dialogActor?.id ?? "new"}
          open
          actor={dialogActor}
          config={dialogActor ? (settings.agentActors[dialogActor.id] ?? null) : null}
          onOpenChange={(open) => {
            if (!open) setDialogActor(undefined);
          }}
          onSave={(draft) =>
            dialogActor
              ? execute(() =>
                  updateAgent({ environmentId, input: { actorId: dialogActor.id, patch: draft } }),
                )
              : execute(() => createAgent({ environmentId, input: draft }))
          }
        />
      ) : null}
    </SettingsPageContainer>
  );
}
