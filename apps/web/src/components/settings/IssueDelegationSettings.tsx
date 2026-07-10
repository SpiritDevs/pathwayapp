import type { IssueDelegationSettings as IssueDelegationSettingsValue } from "@pathwayos/contracts";
import { ActivityIcon, CpuIcon, HardDriveIcon } from "lucide-react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { useDelegationState, useIssues } from "../../state/issueEntities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

function QueueIssueLabel({ issueId }: { readonly issueId: string }) {
  const issue = useIssues().find((candidate) => candidate.id === issueId);
  return <span className="font-mono text-xs">{issue?.identifier ?? issueId}</span>;
}

export function IssueDelegationSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const settings = usePrimarySettings((value) => value.issueDelegation);
  const updateSettings = useUpdatePrimarySettings();
  const queue = useDelegationState(environmentId);
  const update = (patch: Partial<IssueDelegationSettingsValue>) =>
    updateSettings({ issueDelegation: { ...settings, ...patch } });
  const state = queue.data;

  return (
    <>
      <SettingsSection title="Delegation" icon={<ActivityIcon className="size-3" />}>
        <SettingsRow title="Enable delegation" description="Queue work assigned to local agent actors when capacity and machine headroom allow." control={<Switch checked={settings.enabled} onCheckedChange={(checked) => update({ enabled: Boolean(checked) })} />} />
        <SettingsRow title="Maximum concurrent agents" description="The maximum number of delegated issue sessions that may run at once." control={<Input className="sm:w-24" type="number" min={1} value={settings.maxConcurrent} onChange={(event) => update({ maxConcurrent: Math.max(1, Number(event.target.value)) })} />} />
        <SettingsRow title="CPU ceiling" description="Pause dequeuing when sampled CPU usage reaches this percentage." control={<div className="flex items-center gap-1.5"><Input className="w-20" type="number" min={1} max={100} value={settings.cpuHeadroomPercent} onChange={(event) => update({ cpuHeadroomPercent: Math.min(100, Math.max(1, Number(event.target.value))) })} /><span className="text-xs text-muted-foreground">%</span></div>} />
        <SettingsRow title="Minimum free memory" description="Pause dequeuing below this amount of available memory." control={<div className="flex items-center gap-1.5"><Input className="w-24" type="number" min={0} step={256} value={settings.minFreeMemoryMb} onChange={(event) => update({ minFreeMemoryMb: Math.max(0, Number(event.target.value)) })} /><span className="text-xs text-muted-foreground">MB</span></div>} />
      </SettingsSection>
      <SettingsSection title="Live queue" headerAction={<Badge variant={state?.capacity.headroomOk ? "success" : "warning"}>{queue.isPending ? "Refreshing" : state?.capacity.headroomOk ? "Headroom OK" : "Paused"}</Badge>}>
        <div className="grid grid-cols-3 gap-2 px-4 py-3.5 text-xs sm:px-5">
          <div className="rounded-lg bg-muted/50 p-3"><ActivityIcon className="mb-1 size-3.5 text-muted-foreground" /><strong className="block text-base">{state?.running.length ?? 0}/{state?.capacity.maxConcurrent ?? settings.maxConcurrent}</strong><span className="text-muted-foreground">running</span></div>
          <div className="rounded-lg bg-muted/50 p-3"><CpuIcon className="mb-1 size-3.5 text-muted-foreground" /><strong className="block text-base">{state?.capacity.cpuPercent === null || state?.capacity.cpuPercent === undefined ? "—" : `${Math.round(state.capacity.cpuPercent)}%`}</strong><span className="text-muted-foreground">CPU</span></div>
          <div className="rounded-lg bg-muted/50 p-3"><HardDriveIcon className="mb-1 size-3.5 text-muted-foreground" /><strong className="block text-base">{state?.capacity.freeMemoryMb === null || state?.capacity.freeMemoryMb === undefined ? "—" : `${Math.round(state.capacity.freeMemoryMb)} MB`}</strong><span className="text-muted-foreground">free</span></div>
        </div>
        {queue.error ? <p className="border-t border-border/60 px-5 py-3 text-xs text-destructive">{queue.error}</p> : null}
        <div className="grid border-t border-border/60 sm:grid-cols-2">
          <div className="px-4 py-3.5 sm:px-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Running</p>{state?.running.map((entry) => <div className="flex items-center justify-between py-1.5" key={entry.issueId}><QueueIssueLabel issueId={entry.issueId} /><Badge variant="success">running</Badge></div>)}{!state || state.running.length === 0 ? <p className="text-xs text-muted-foreground">No delegated work is running.</p> : null}</div>
          <div className="border-t px-4 py-3.5 sm:border-l sm:border-t-0 sm:px-5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Queued</p>{state?.queued.map((entry) => <div className="flex items-center justify-between py-1.5" key={entry.issueId}><QueueIssueLabel issueId={entry.issueId} /><span className="text-[11px] text-muted-foreground">priority {entry.priority}</span></div>)}{!state || state.queued.length === 0 ? <p className="text-xs text-muted-foreground">The queue is empty.</p> : null}</div>
        </div>
      </SettingsSection>
    </>
  );
}
