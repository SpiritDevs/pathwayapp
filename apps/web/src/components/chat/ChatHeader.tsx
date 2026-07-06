import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
  type VcsStatusResult,
} from "@pathwayos/contracts";
import { scopedThreadKey, scopeThreadRef } from "@pathwayos/client-runtime/environment";
import { memo, useRef } from "react";
import {
  FilesIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GlobeIcon,
  LaptopIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import { useThreadPreviewState } from "~/previewStateStore";
import { type ThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  openInCwd: string | null;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  rightPanelOpen: boolean;
  gitCwd: string | null;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}

function browserSessionUrl(session: {
  readonly navStatus: { readonly _tag: string; readonly url?: string };
}): string | null {
  return session.navStatus._tag === "Idle" ? null : (session.navStatus.url ?? null);
}

function formatBrowserLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function EnvironmentOptionsRow({
  icon: Icon,
  label,
  detail,
  trailing,
  muted = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  trailing?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", muted && "text-muted-foreground")}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{label}</div>
        {detail ? <div className="truncate text-[11px] text-muted-foreground">{detail}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-xs">{trailing}</div> : null}
    </div>
  );
}

const EMPTY_RIGHT_PANEL_STATE: ThreadRightPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

function EnvironmentOptionsPopover({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeProjectName,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  gitCwd,
  popupAnchor,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeProjectName: string | undefined;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  gitCwd: string | null;
  popupAnchor: React.RefObject<HTMLElement | null>;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}) {
  const activeThreadRef = scopeThreadRef(activeThreadEnvironmentId, activeThreadId);
  const threadKey = scopedThreadKey(activeThreadRef);
  const previewState = useThreadPreviewState(activeThreadRef);
  const rightPanelState = useRightPanelStore(
    (state) => state.byThreadKey[threadKey] ?? EMPTY_RIGHT_PANEL_STATE,
  );
  const gitStatusQuery = useEnvironmentQuery(
    gitCwd
      ? vcsEnvironment.status({
          environmentId: activeThreadEnvironmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const gitStatus = gitStatusQuery.data as VcsStatusResult | null;
  const changedFiles = gitStatus?.workingTree.files.length ?? 0;
  const insertions = gitStatus?.workingTree.insertions ?? 0;
  const deletions = gitStatus?.workingTree.deletions ?? 0;
  const fileSurfaces = rightPanelState.surfaces.filter((surface) => surface.kind === "file").length;
  const browserUrls = Object.values(previewState.sessions).flatMap((session) => {
    const url = browserSessionUrl(session);
    return url ? [url] : [];
  });
  const showFilesRow = fileSurfaces > 0 || changedFiles > 0;
  const showActionsSection = Boolean(activeProjectScripts || activeProjectName);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button size="icon-xs" variant="outline" aria-label="Open environment options" />
              }
            />
          }
        >
          <SlidersHorizontalIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="top">Environment options</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        anchor={popupAnchor}
        align="end"
        sideOffset={24}
        className="w-[20rem] max-w-[calc(100vw-1rem)] rounded-xl border-border/70 bg-popover/95 p-0 shadow-xl"
        viewportClassName="p-0"
      >
        <div className="grid gap-3 p-4">
          <section className="grid gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Environment</h3>
              <Button size="icon-xs" variant="ghost" aria-label="Add environment option">
                <PlusIcon className="size-4" />
              </Button>
            </div>
            <EnvironmentOptionsRow
              icon={GitCommitHorizontalIcon}
              label="Changes"
              trailing={
                <span className="inline-flex gap-2 font-mono">
                  <span className="text-emerald-500">+{insertions}</span>
                  <span className="text-red-500">-{deletions}</span>
                </span>
              }
            />
            <EnvironmentOptionsRow
              icon={LaptopIcon}
              label="Local"
              detail={gitCwd ?? activeProjectName ?? "No workspace selected"}
            />
            <EnvironmentOptionsRow
              icon={GitBranchIcon}
              label={gitStatus?.refName ?? "No branch"}
              detail={
                gitStatus?.aheadCount || gitStatus?.behindCount
                  ? `${gitStatus.aheadCount} ahead, ${gitStatus.behindCount} behind`
                  : "Synced or no upstream"
              }
            />
          </section>

          {showActionsSection ? (
            <>
              <div className="h-px bg-border/60" />

              <section className="grid gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Actions</h3>
                  {activeProjectScripts ? (
                    <ProjectScriptsControl
                      scripts={activeProjectScripts}
                      keybindings={keybindings}
                      preferredScriptId={preferredScriptId}
                      presentation="compact"
                      onRunScript={onRunProjectScript}
                      onAddScript={onAddProjectScript}
                      onUpdateScript={onUpdateProjectScript}
                      onDeleteScript={onDeleteProjectScript}
                    />
                  ) : null}
                </div>
                <div className="grid gap-2">
                  {activeProjectName ? (
                    <GitActionsControl
                      gitCwd={gitCwd}
                      activeThreadRef={activeThreadRef}
                      presentation="list"
                      {...(draftId ? { draftId } : {})}
                    />
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {showFilesRow ? (
            <>
              <div className="h-px bg-border/60" />

              <section className="grid gap-2.5">
                <EnvironmentOptionsRow
                  icon={FilesIcon}
                  label="Files"
                  detail={
                    fileSurfaces > 0
                      ? `${fileSurfaces} open file ${fileSurfaces === 1 ? "surface" : "surfaces"}`
                      : `${changedFiles} changed ${changedFiles === 1 ? "file" : "files"}`
                  }
                />
              </section>
            </>
          ) : null}

          {browserUrls.length > 0 ? (
            <>
              <div className="h-px bg-border/60" />

              <section className="grid gap-2.5">
                <h3 className="text-sm font-semibold text-muted-foreground">Browsers</h3>
                {browserUrls.slice(0, 4).map((url) => (
                  <EnvironmentOptionsRow
                    key={url}
                    icon={GlobeIcon}
                    label={formatBrowserLabel(url)}
                    detail={url}
                  />
                ))}
              </section>
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeThreadTitle,
  activeProjectName,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  rightPanelOpen,
  gitCwd,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: ChatHeaderProps) {
  const environmentOptionsAnchorRef = useRef<HTMLSpanElement>(null);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName,
    activeThreadEnvironmentId,
    primaryEnvironmentId,
  });
  return (
    <div className="@container/header-actions relative flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <span
        ref={environmentOptionsAnchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 size-px"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <h2
                aria-label={activeThreadTitle}
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
              >
                {activeThreadTitle}
              </h2>
            }
          />
          <TooltipPopup side="top">{activeThreadTitle}</TooltipPopup>
        </Tooltip>
      </div>
      <div
        data-chat-header-actions
        className={cn(
          "flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3",
          rightPanelOpen ? "pr-0" : "pr-16",
        )}
      >
        {showOpenInPicker && (
          <OpenInPicker
            environmentId={activeThreadEnvironmentId}
            keybindings={keybindings}
            availableEditors={availableEditors}
            openInCwd={openInCwd}
          />
        )}
        <EnvironmentOptionsPopover
          activeThreadEnvironmentId={activeThreadEnvironmentId}
          activeThreadId={activeThreadId}
          {...(draftId ? { draftId } : {})}
          activeProjectName={activeProjectName}
          activeProjectScripts={activeProjectScripts}
          preferredScriptId={preferredScriptId}
          keybindings={keybindings}
          gitCwd={gitCwd}
          popupAnchor={environmentOptionsAnchorRef}
          onRunProjectScript={onRunProjectScript}
          onAddProjectScript={onAddProjectScript}
          onUpdateProjectScript={onUpdateProjectScript}
          onDeleteProjectScript={onDeleteProjectScript}
        />
      </div>
    </div>
  );
});
