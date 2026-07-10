import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  MailIcon,
  RefreshCwIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { EmailSandboxProjectSource, ServerSettings } from "@pathwayos/contracts";

import { deriveCloudProjectKey } from "../../logicalProject";
import { useEmailSandbox } from "../../email/useEmailSandbox";
import { formatBytes, runtimePhaseLabel } from "../../email/format";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useProjects } from "../../state/entities";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function projectSmtpEnvSnippet(source: EmailSandboxProjectSource): string {
  return [
    `PATHWAYOS_EMAIL_SANDBOX_SMTP_HOST=${source.smtpHost}`,
    `PATHWAYOS_EMAIL_SANDBOX_SMTP_PORT=${source.smtpPort ?? ""}`,
    `PATHWAYOS_EMAIL_SANDBOX_WEB_URL=${typeof window === "undefined" ? "" : `${window.location.origin}/email`}`,
  ].join("\n");
}

function CopyValueButton({
  label,
  value,
  copiedLabel = "Copied",
  ariaLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly copiedLabel?: string;
  readonly ariaLabel: string;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 1_500 });
  return (
    <button
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => copyToClipboard(value)}
      type="button"
    >
      {isCopied ? <CheckIcon className="size-3 text-primary" /> : <CopyIcon className="size-3" />}
      {isCopied ? copiedLabel : label}
    </button>
  );
}

function RuntimeStatus({ enabled }: { readonly enabled: boolean }) {
  const sandbox = useEmailSandbox();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const status = sandbox.runtimeStatus;
  const phase = status?.phase ?? (enabled ? "starting" : "disabled");
  const isHealthy = phase === "running";

  const clearCache = async () => {
    setClearing(true);
    setActionError(null);
    try {
      await sandbox.clearLocalCache();
      setClearDialogOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not clear the local cache.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <SettingsRow
        title="Mailpit runtime"
        description="PathwayOS installs and supervises a private Mailpit process on this computer. It is never exposed directly to the network."
        status={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={
                isHealthy
                  ? "inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                  : phase === "failed" || phase === "degraded"
                    ? "inline-flex items-center gap-1.5 text-destructive"
                    : "inline-flex items-center gap-1.5"
              }
            >
              {sandbox.isPending ? (
                <LoaderCircleIcon className="size-3 animate-spin" />
              ) : isHealthy ? (
                <CheckCircle2Icon className="size-3" />
              ) : phase === "failed" || phase === "degraded" ? (
                <AlertCircleIcon className="size-3" />
              ) : (
                <ServerIcon className="size-3" />
              )}
              {runtimePhaseLabel(phase)}
            </span>
            {status?.mailpitVersion ? <span>Mailpit {status.mailpitVersion}</span> : null}
            {status ? (
              <span>
                {formatBytes(status.localBytes)} of {formatBytes(status.localByteLimit)} local
                storage
              </span>
            ) : null}
          </span>
        }
        control={
          <div className="flex items-center gap-1.5">
            <Button
              aria-label="Refresh Mailpit status"
              onClick={sandbox.refresh}
              size="icon-xs"
              variant="ghost"
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
            <Button
              disabled={!status || status.localBytes === 0}
              onClick={() => setClearDialogOpen(true)}
              size="xs"
              variant="outline"
            >
              <Trash2Icon className="size-3.5" />
              Clear cache
            </Button>
          </div>
        }
      />
      {status?.lastError || sandbox.error || actionError ? (
        <div className="border-t border-border/60 px-5 py-3 text-xs text-destructive">
          {actionError ?? status?.lastError ?? sandbox.error}
        </div>
      ) : null}

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear local email cache?</AlertDialogTitle>
            <AlertDialogDescription>
              Synced messages remain in your account. Messages still waiting to sync are retained so
              they are not lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose disabled={clearing} render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button disabled={clearing} onClick={() => void clearCache()} variant="destructive">
              {clearing ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              Clear local cache
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

export function EmailSandboxSettings({
  enabled,
  settings,
  onUpdate,
}: {
  readonly enabled: boolean;
  readonly settings: ServerSettings["emailSandbox"];
  readonly onUpdate: (patch: Partial<ServerSettings["emailSandbox"]>) => void;
}) {
  const sandbox = useEmailSandbox();
  const projects = useProjects();
  const [pendingProjects, setPendingProjects] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const environmentProjects = useMemo(
    () => projects.filter((project) => project.environmentId === sandbox.environmentId),
    [projects, sandbox.environmentId],
  );
  const sourceByProjectId = useMemo(
    () => new Map(sandbox.projectSources.map((source) => [source.projectId, source])),
    [sandbox.projectSources],
  );

  const setCapture = async (
    project: (typeof environmentProjects)[number],
    captureEnabled: boolean,
    agentAccessEnabled?: boolean,
  ) => {
    setPendingProjects((current) => new Set(current).add(project.id));
    setActionError(null);
    try {
      await sandbox.setProjectCapture({
        projectId: project.id,
        enabled: captureEnabled,
        logicalProjectKey: deriveCloudProjectKey(project),
        displayName: project.title,
        ...(agentAccessEnabled === undefined ? {} : { agentAccessEnabled }),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update email capture.");
    } finally {
      setPendingProjects((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
    }
  };

  if (!enabled) return null;

  return (
    <>
      <SettingsSection title="Sandbox" icon={<MailIcon className="size-3" />}>
        <RuntimeStatus enabled={enabled} />
        <SettingsRow
          title="Create sandbox for new projects"
          description="Prepare a private email source whenever a project is added."
          control={
            <Switch
              aria-label="Create email sandbox for new projects"
              checked={settings.createForNewProjects}
              onCheckedChange={(checked) => onUpdate({ createForNewProjects: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Capture by default"
          description="Start SMTP capture immediately for newly created project sources."
          control={
            <Switch
              aria-label="Capture project email by default"
              checked={settings.captureByDefault}
              disabled={!settings.createForNewProjects}
              onCheckedChange={(checked) => onUpdate({ captureByDefault: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Agent access by default"
          description="Allow coding agents to read captured message bodies and attachments for new sandboxes."
          control={
            <Switch
              aria-label="Allow agent access to new email sandboxes"
              checked={settings.agentAccessByDefault}
              onCheckedChange={(checked) => onUpdate({ agentAccessByDefault: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Sync attachments"
          description="Upload eligible attachments to private cloud storage with their message metadata."
          control={
            <Switch
              aria-label="Sync email attachments"
              checked={settings.syncAttachments}
              onCheckedChange={(checked) => onUpdate({ syncAttachments: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Maximum attachment size"
          description="Larger files remain local and are marked as skipped."
          control={
            <Select
              disabled={!settings.syncAttachments}
              onValueChange={(value) =>
                value && onUpdate({ attachmentMaxBytes: Number(value) * 1024 * 1024 })
              }
              value={String(settings.attachmentMaxBytes / 1024 / 1024)}
            >
              <SelectTrigger
                aria-label="Maximum synced attachment size"
                className="h-8 w-28 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {[1, 5, 10, 25].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} MB
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Retention period"
          description="Delete cloud message records older than this many days."
          control={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Input
                aria-label="Email retention days"
                className="h-8 w-20 text-xs"
                max={365}
                min={1}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 365) {
                    onUpdate({ retentionDays: value });
                  }
                }}
                type="number"
                value={settings.retentionDays}
              />
              days
            </div>
          }
        />
        <SettingsRow
          title="Maximum retained messages"
          description="Keep the newest messages when a sandbox exceeds this limit."
          control={
            <Input
              aria-label="Maximum retained email messages"
              className="h-8 w-24 text-xs"
              max={10_000}
              min={1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 10_000) {
                  onUpdate({ retentionMaxMessages: value });
                }
              }}
              type="number"
              value={settings.retentionMaxMessages}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Project SMTP Sources" icon={<MailIcon className="size-3" />}>
        {environmentProjects.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-muted-foreground">
            Add a project to this environment to create a project-specific SMTP source.
          </div>
        ) : (
          environmentProjects.map((project) => {
            const source = sourceByProjectId.get(project.id);
            const pending = pendingProjects.has(project.id);
            const running = source?.status === "running";
            return (
              <SettingsRow
                key={project.id}
                title={project.title}
                description="Capture mail sent by this project and sync it to your private inbox."
                status={
                  source?.smtpPort ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        127.0.0.1:{source.smtpPort}
                      </code>
                      <CopyValueButton
                        ariaLabel={`Copy SMTP address for ${project.title}`}
                        label="Copy address"
                        value={`127.0.0.1:${source.smtpPort}`}
                      />
                      <CopyValueButton
                        ariaLabel={`Copy environment variable snippet for ${project.title}`}
                        label="Copy env"
                        value={projectSmtpEnvSnippet(source)}
                      />
                      {source.portChanged ? (
                        <span>Port changed because the preferred port was busy.</span>
                      ) : null}
                      {!running ? (
                        <span className="text-destructive">
                          {source.lastError ?? source.status}
                        </span>
                      ) : null}
                    </span>
                  ) : enabled ? (
                    "Enable capture to allocate a loopback SMTP port."
                  ) : (
                    "Enable the developer email server first."
                  )
                }
                control={
                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                    {pending ? (
                      <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Capture
                      <Switch
                        aria-label={`Capture email for ${project.title}`}
                        checked={source?.captureEnabled ?? false}
                        disabled={!enabled || pending || sandbox.environmentId === null}
                        onCheckedChange={(checked) => void setCapture(project, Boolean(checked))}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Agents can read
                      <Switch
                        aria-label={`Allow agents to read email for ${project.title}`}
                        checked={source?.agentAccessEnabled ?? settings.agentAccessByDefault}
                        disabled={!enabled || pending || sandbox.environmentId === null}
                        onCheckedChange={(checked) =>
                          void setCapture(
                            project,
                            source?.captureEnabled ?? false,
                            Boolean(checked),
                          )
                        }
                      />
                    </label>
                  </div>
                }
              />
            );
          })
        )}
        {actionError ? (
          <div className="border-t border-border/60 px-5 py-3 text-xs text-destructive">
            {actionError}
          </div>
        ) : null}
      </SettingsSection>
    </>
  );
}
