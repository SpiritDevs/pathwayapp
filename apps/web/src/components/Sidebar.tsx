import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowUpDownIcon,
  BotIcon,
  BriefcaseBusinessIcon,
  ChartNoAxesCombinedIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  EllipsisIcon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  FolderKanbanIcon,
  FoldersIcon,
  GitBranchIcon,
  GitBranchPlusIcon,
  Globe2Icon,
  HomeIcon,
  ImageIcon,
  ListTodoIcon,
  MailIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SlackIcon,
  SquarePenIcon,
  TerminalIcon,
  TimerIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import {
  ChangeRequestStatusIcon,
  prStatusIndicator,
  resolveThreadPr,
  terminalStatusFromRunningIds,
  ThreadStatusLabel,
  ThreadWorktreeIndicator,
} from "./ThreadStatusIndicators";
import { ProjectFavicon } from "./ProjectFavicon";
import { EmailMailboxNav } from "../email/EmailMailboxNav";
import { EmailSourceTabs } from "../email/EmailSourceTabs";
import { emailSourceAtom } from "../email/emailSourceAtom";
import { useAtomValue } from "@effect/atom-react";
import { autoAnimate } from "@formkit/auto-animate";
import React, { useCallback, useEffect, memo, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  type ContextMenuItem,
  DEFAULT_SERVER_SETTINGS,
  PROJECT_ICON_MAX_BYTES,
  ProjectId,
  type ScopedThreadRef,
  type ResolvedKeybindingsConfig,
  type SidebarProjectGroupingMode,
  ThreadId,
} from "@pathwayos/contracts";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@pathwayos/client-runtime/environment";
import { safeErrorLogAttributes } from "@pathwayos/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@pathwayos/client-runtime/state/runtime";
import {
  Link,
  useCanGoBack,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import {
  MAX_SIDEBAR_THREAD_PREVIEW_COUNT,
  MIN_SIDEBAR_THREAD_PREVIEW_COUNT,
  type SidebarProjectSortOrder,
  type SidebarThreadPreviewCount,
  type SidebarThreadSortOrder,
} from "@pathwayos/contracts/settings";
import { isElectron } from "../env";
import { APP_STAGE_LABEL } from "../branding";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isMacPlatform, randomUUID } from "../lib/utils";
import {
  readThreadShell,
  useProject,
  useProjects,
  useServerConfigs,
  useThreadShells,
  useThreadShellsForProjectRefs,
} from "../state/entities";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadRunningTerminalIds } from "../state/terminalSessions";
import { useThreadDiscoveredPorts } from "../portDiscoveryState";
import { openDiscoveredPort } from "./preview/openDiscoveredPort";
import { useAtomCommand } from "../state/use-atom-command";
import { previewEnvironment } from "../state/preview";
import {
  legacyProjectCwdPreferenceKey,
  resolveProjectArchived,
  resolveProjectExpanded,
  resolveProjectFolderId,
  resolveProjectPinned,
  type SidebarProjectFolder,
  useUiStateStore,
} from "../uiStateStore";
import {
  buildSidebarFolderViews,
  folderBodyDropId,
  folderDropId,
  folderExpansionKey,
  folderIdFromDropId,
  PROJECT_LIST_DROP_ID,
  type SidebarFolderView,
} from "../sidebarProjectFolders";
import {
  SidebarFolderDetailsSheet,
  SidebarFolderGlyph,
  SidebarRemoveFolderDialog,
  type SidebarRemoveFolderTarget,
} from "./sidebar/SidebarFolderDialogs";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { useShortcutModifierState } from "../shortcutModifierState";
import { readLocalApi } from "../localApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useDesktopUpdateState } from "../state/desktopUpdate";

import { useThreadActions } from "../hooks/useThreadActions";
import {
  isChatSurfacePathname,
  isEmailSurfacePathname,
  shouldShowSecondarySidebar,
} from "../appNavRoutes";
import { assetEnvironment } from "../state/assets";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readFileAsDataUrl } from "./ChatView.logic";
import { projectEnvironment } from "../state/projects";
import { useEnvironmentQuery } from "../state/query";
import { threadEnvironment, useEnvironmentThread } from "../state/threads";
import { vcsEnvironment } from "../state/vcs";
import { useEnvironment, useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import {
  buildThreadRouteParams,
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { SavedViewsRail } from "./issues/SavedViewsRail";
import { Kbd } from "./ui/kbd";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "./ui/sheet";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "./ui/menu";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "./ui/number-field";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useOpenAddProjectCommandPalette } from "../commandPaletteContext";
import {
  getSidebarThreadIdsToPrewarm,
  resolveAdjacentThreadId,
  isContextMenuPointerDown,
  isTrailingDoubleClick,
  resolveProjectStatusIndicator,
  resolveSidebarNewThreadSeedContext,
  resolveSidebarNewThreadEnvMode,
  resolveSidebarStageBadgeLabel,
  resolveThreadRowClassName,
  resolveThreadStatusPill,
  orderItemsByPreferredIds,
  shouldClearThreadSelectionOnMouseDown,
  sortProjectsForSidebar,
  useThreadJumpHintVisibility,
  ThreadStatusPill,
} from "./Sidebar.logic";
import { sortThreads } from "../lib/threadSort";
import { SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";
import { PathwayOSMainSidebarAccount } from "./clerk/PathwayOSUserProfileSidebar";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { CommandDialogTrigger } from "./ui/command";
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { primaryServerConfigAtom, primaryServerKeybindingsAtom } from "../state/server";
import { markAppNavRouteSidebarMotionInstant } from "../appNavSidebarMotion";
import {
  derivePhysicalProjectKey,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../logicalProject";
import type { SidebarThreadSummary } from "../types";
import {
  buildPhysicalToLogicalProjectKeyMap,
  buildSidebarProjectSnapshots,
  projectExpansionPreferenceKeys,
  projectPinPreferenceKeys,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { SidebarProviderUpdatePill } from "./sidebar/SidebarProviderUpdatePill";
import { useCloudWorkspace } from "../cloud/CloudWorkspaceProvider";
import {
  isCloudWorkspaceEntity,
  mergeCloudWorkspace,
  resolveCloudThreadRoute,
} from "../cloud/cloudWorkspaceModel";
const SIDEBAR_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SIDEBAR_THREAD_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};
const SIDEBAR_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;
const EMPTY_THREAD_JUMP_LABELS = new Map<string, string>();
const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};
const SIDEBAR_ICON_ACTION_BUTTON_CLASS =
  "inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

const APP_NAV_ITEMS: readonly {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly to?:
    | "/"
    | "/email"
    | "/chat"
    | "/slack"
    | "/issues"
    | "/projects"
    | "/clients"
    | "/tracker"
    | "/analytics";
  readonly isActive?: (pathname: string) => boolean;
}[] = [
  { title: "Home", icon: HomeIcon, to: "/", isActive: (pathname) => pathname === "/" },
  {
    title: "Email",
    icon: MailIcon,
    to: "/email",
    isActive: (pathname) => pathname === "/email",
  },
  {
    title: "Agents",
    icon: BotIcon,
    to: "/chat",
    isActive: isChatSurfacePathname,
  },
  {
    title: "Slack",
    icon: SlackIcon,
    to: "/slack",
    isActive: (pathname) => pathname === "/slack",
  },
  {
    title: "Issues",
    icon: ListTodoIcon,
    to: "/issues",
    isActive: (pathname) => pathname === "/issues",
  },
  {
    title: "Projects",
    icon: FolderKanbanIcon,
    to: "/projects",
    isActive: (pathname) => pathname === "/projects",
  },
  {
    title: "Clients",
    icon: BriefcaseBusinessIcon,
    to: "/clients",
    isActive: (pathname) => pathname === "/clients",
  },
  {
    title: "Tracker",
    icon: TimerIcon,
    to: "/tracker",
    isActive: (pathname) => pathname === "/tracker",
  },
  {
    title: "Analytics",
    icon: ChartNoAxesCombinedIcon,
    to: "/analytics",
    isActive: (pathname) => pathname === "/analytics",
  },
];

function SidebarThreadDetailPrewarmer({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  useEnvironmentThread(threadRef.environmentId, threadRef.threadId);
  return null;
}

function clampSidebarThreadPreviewCount(value: number): SidebarThreadPreviewCount {
  return Math.min(
    MAX_SIDEBAR_THREAD_PREVIEW_COUNT,
    Math.max(MIN_SIDEBAR_THREAD_PREVIEW_COUNT, value),
  ) as SidebarThreadPreviewCount;
}

function formatProjectMemberActionLabel(
  member: SidebarProjectGroupMember,
  groupedProjectCount: number,
): string {
  if (groupedProjectCount <= 1) {
    return member.title;
  }

  return member.environmentLabel
    ? `${member.environmentLabel} — ${member.workspaceRoot}`
    : member.workspaceRoot;
}

function getSidebarThreadKey(thread: SidebarThreadSummary): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

function resolveThreadLogicalProjectKey(input: {
  thread: SidebarThreadSummary;
  physicalToLogicalKey: ReadonlyMap<string, string>;
  projectPhysicalKeyByScopedRef: ReadonlyMap<string, string>;
}): string | null {
  if (input.thread.projectId === null) {
    return null;
  }
  const projectRefKey = scopedProjectKey(
    scopeProjectRef(input.thread.environmentId, input.thread.projectId),
  );
  const physicalKey = input.projectPhysicalKeyByScopedRef.get(projectRefKey);
  if (!physicalKey) {
    return null;
  }
  return input.physicalToLogicalKey.get(physicalKey) ?? physicalKey;
}

function isPinnedSidebarThread(thread: SidebarThreadSummary): boolean {
  const maybePinnedThread = thread as SidebarThreadSummary & {
    pinned?: unknown;
    pinnedAt?: unknown;
  };
  return maybePinnedThread.pinned === true || typeof maybePinnedThread.pinnedAt === "string";
}

function buildThreadJumpLabelMap(input: {
  keybindings: ResolvedKeybindingsConfig;
  platform: string;
  terminalOpen: boolean;
  threadJumpCommandByKey: ReadonlyMap<
    string,
    NonNullable<ReturnType<typeof threadJumpCommandForIndex>>
  >;
}): ReadonlyMap<string, string> {
  if (input.threadJumpCommandByKey.size === 0) {
    return EMPTY_THREAD_JUMP_LABELS;
  }

  const shortcutLabelOptions = {
    platform: input.platform,
    context: {
      terminalFocus: false,
      terminalOpen: input.terminalOpen,
    },
  } as const;
  const mapping = new Map<string, string>();
  for (const [threadKey, command] of input.threadJumpCommandByKey) {
    const label = shortcutLabelForCommand(input.keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(threadKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_THREAD_JUMP_LABELS;
}

interface SidebarThreadRowProps {
  thread: SidebarThreadSummary;
  projectCwd: string | null;
  orderedProjectThreadKeys: readonly string[];
  isActive: boolean;
  jumpLabel: string | null;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
}

export const SidebarThreadRow = memo(function SidebarThreadRow(props: SidebarThreadRowProps) {
  const {
    orderedProjectThreadKeys,
    isActive,
    jumpLabel,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    handleThreadClick,
    navigateToThread,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    thread,
  } = props;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const threadKey = scopedThreadKey(threadRef);
  const isCloudThread = isCloudWorkspaceEntity(thread);
  const cloudThreadRoute = isCloudThread ? resolveCloudThreadRoute(thread) : threadRef;
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const isMobile = useIsMobile();
  const discoveredPorts = useThreadDiscoveredPorts({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });
  const openPreview = useAtomCommand(previewEnvironment.open, {
    reportFailure: false,
  });
  const environment = useEnvironment(thread.environmentId);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const isRemoteThread =
    primaryEnvironmentId !== null && thread.environmentId !== primaryEnvironmentId;
  const remoteEnvLabel = environment?.label ?? null;
  const threadEnvironmentLabel = isRemoteThread ? (remoteEnvLabel ?? "Remote") : null;
  // For grouped projects, the thread may belong to a different environment
  // than the representative project.  Look up the thread's own project cwd
  // so git status (and thus PR detection) queries the correct path.
  const threadProject = useProject(
    useMemo(
      () =>
        thread.projectId === null ? null : scopeProjectRef(thread.environmentId, thread.projectId),
      [thread.environmentId, thread.projectId],
    ),
  );
  const threadProjectCwd = threadProject?.workspaceRoot ?? null;
  const gitCwd = thread.worktreePath ?? threadProjectCwd ?? props.projectCwd;
  const gitStatus = useEnvironmentQuery(
    thread.branch != null && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const isHighlighted = isActive || isSelected;
  const handleOpenDiscoveredPort = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const port = discoveredPorts[0];
      if (!port) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToThread(threadRef);
      void (async () => {
        const result = await openDiscoveredPort({ threadRef, port, openPreview });
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
          return;
        }
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open preview",
            description:
              error instanceof Error ? error.message : "The preview could not be opened.",
          }),
        );
      })();
    },
    [discoveredPorts, navigateToThread, openPreview, threadRef],
  );
  const isThreadRunning =
    thread.session?.status === "running" && thread.session.activeTurnId != null;
  const threadStatus = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const pr = resolveThreadPr(thread.branch, gitStatus.data);
  const prStatus = prStatusIndicator(pr, gitStatus.data?.sourceControlProvider);
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const isConfirmingArchive = confirmingArchiveThreadKey === threadKey && !isThreadRunning;
  const threadMetaClassName = isConfirmingArchive
    ? "pointer-events-none opacity-0"
    : !isThreadRunning
      ? "pointer-events-none transition-opacity duration-150 max-sm:pr-6 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0"
      : "pointer-events-none";
  const clearConfirmingArchive = useCallback(() => {
    setConfirmingArchiveThreadKey((current) => (current === threadKey ? null : current));
  }, [setConfirmingArchiveThreadKey, threadKey]);
  const handleMouseLeave = useCallback(() => {
    clearConfirmingArchive();
  }, [clearConfirmingArchive]);
  const handleBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLLIElement>) => {
      const currentTarget = event.currentTarget;
      requestAnimationFrame(() => {
        if (currentTarget.contains(document.activeElement)) {
          return;
        }
        clearConfirmingArchive();
      });
    },
    [clearConfirmingArchive],
  );
  const handleRowClick = useCallback(
    (event: React.MouseEvent) => {
      if (cloudThreadRoute === null) {
        event.preventDefault();
        toastManager.add({
          type: "warning",
          title: "Source environment unavailable",
          description: "Connect this chat's source environment before opening or controlling it.",
        });
        return;
      }
      handleThreadClick(event, cloudThreadRoute, orderedProjectThreadKeys);
    },
    [cloudThreadRoute, handleThreadClick, orderedProjectThreadKeys],
  );
  const handleRowDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Already renaming this row: a double-click on the row chrome (outside the
      // input) must not restart and discard the in-progress edit.
      if (renamingThreadKey === threadKey) return;
      // On mobile the first tap navigates and closes the sidebar sheet, so the
      // inline rename can't be shown. Renaming there stays on the context menu.
      if (isMobile) return;
      // cmd/ctrl/shift double-clicks are multi-select intent, not rename.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Ignore double-clicks bubbling from nested controls (PR status, port,
      // archive buttons) — only the row body should enter inline rename.
      if ((event.target as HTMLElement).closest("button, a")) return;
      event.preventDefault();
      startThreadRename(threadKey, thread.title);
    },
    [isMobile, renamingThreadKey, startThreadRename, threadKey, thread.title],
  );
  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (cloudThreadRoute === null) {
        toastManager.add({
          type: "warning",
          title: "Source environment unavailable",
          description: "Connect this chat's source environment before opening or controlling it.",
        });
        return;
      }
      navigateToThread(cloudThreadRoute);
    },
    [cloudThreadRoute, navigateToThread],
  );
  const handleRowContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const hasSelection = useThreadSelectionStore.getState().hasSelection();
      if (hasSelection && isSelected) {
        void (async () => {
          const result = await settlePromise(() =>
            handleMultiSelectContextMenu({
              x: event.clientX,
              y: event.clientY,
            }),
          );
          if (result._tag === "Failure") {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Thread action failed",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
        })();
        return;
      }

      if (hasSelection) {
        clearSelection();
      }
      void (async () => {
        const result = await settlePromise(() =>
          handleThreadContextMenu(threadRef, {
            x: event.clientX,
            y: event.clientY,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread action failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [clearSelection, handleMultiSelectContextMenu, handleThreadContextMenu, isSelected, threadRef],
  );
  const handlePrClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!prStatus) return;
      openPrLink(event, prStatus.url);
    },
    [openPrLink, prStatus],
  );
  const handleRenameInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      if (element && renamingInputRef.current !== element) {
        renamingInputRef.current = element;
        element.focus();
        element.select();
      }
    },
    [renamingInputRef],
  );
  const handleRenameInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRenamingTitle(event.target.value);
    },
    [setRenamingTitle],
  );
  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        void commitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        cancelRename();
      }
    },
    [cancelRename, commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef],
  );
  const handleRenameInputBlur = useCallback(() => {
    if (!renamingCommittedRef.current) {
      void commitRename(threadRef, renamingTitle, thread.title);
    }
  }, [commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef]);
  // Keep clicks/double-clicks inside the rename input from bubbling to the row.
  // Without stopping `dblclick`, double-clicking to select a word would re-fire
  // the row's rename handler and reset the in-progress edit back to the title.
  const handleRenameInputClick = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);
  const handleConfirmArchiveRef = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element) {
        confirmArchiveButtonRefs.current.set(threadKey, element);
      } else {
        confirmArchiveButtonRefs.current.delete(threadKey);
      }
    },
    [confirmArchiveButtonRefs, threadKey],
  );
  const stopPropagationOnPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleConfirmArchiveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearConfirmingArchive();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, clearConfirmingArchive, threadRef],
  );
  const handleStartArchiveConfirmation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setConfirmingArchiveThreadKey(threadKey);
      requestAnimationFrame(() => {
        confirmArchiveButtonRefs.current.get(threadKey)?.focus();
      });
    },
    [confirmArchiveButtonRefs, setConfirmingArchiveThreadKey, threadKey],
  );
  const handleArchiveImmediateClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, threadRef],
  );
  const rowButtonRender = useMemo(() => <div role="button" tabIndex={0} />, []);

  return (
    <SidebarMenuSubItem
      className="w-full"
      data-thread-item
      onMouseLeave={handleMouseLeave}
      onBlurCapture={handleBlurCapture}
    >
      <SidebarMenuSubButton
        render={rowButtonRender}
        size="sm"
        isActive={isActive}
        data-testid={`thread-row-${thread.id}`}
        className={`${resolveThreadRowClassName({
          isActive,
          isSelected,
        })} relative isolate`}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onKeyDown={handleRowKeyDown}
        onContextMenu={handleRowContextMenu}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {prStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={prStatus.tooltip}
                    className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                    onClick={handlePrClick}
                  >
                    <ChangeRequestStatusIcon className="size-3" />
                  </button>
                }
              />
              <TooltipPopup side="top">{prStatus.tooltip}</TooltipPopup>
            </Tooltip>
          )}
          {threadStatus && <ThreadStatusLabel status={threadStatus} />}
          {renamingThreadKey === threadKey ? (
            <input
              ref={handleRenameInputRef}
              className="min-w-0 flex-1 truncate text-base sm:text-xs bg-transparent outline-none border border-ring rounded px-0.5"
              value={renamingTitle}
              onChange={handleRenameInputChange}
              onKeyDown={handleRenameInputKeyDown}
              onBlur={handleRenameInputBlur}
              onClick={handleRenameInputClick}
              onDoubleClick={handleRenameInputClick}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    data-testid={`thread-title-${thread.id}`}
                  >
                    {thread.title}
                  </span>
                }
              />
              <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
                {thread.title}
              </TooltipPopup>
            </Tooltip>
          )}
          {isCloudThread ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label="Synced from source environment"
                    className="inline-flex shrink-0 text-muted-foreground/55"
                  />
                }
              >
                <CloudIcon className="size-3" />
              </TooltipTrigger>
              <TooltipPopup side="top">
                {thread.sourceAvailable
                  ? "Synced · opens on its source environment"
                  : "Synced · source environment is not connected"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {discoveredPorts.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Open localhost:${discoveredPorts[0]?.port ?? ""}`}
                    className="inline-flex cursor-pointer items-center justify-center text-emerald-600 outline-hidden focus-visible:ring-1 focus-visible:ring-ring dark:text-emerald-400"
                    onClick={handleOpenDiscoveredPort}
                  />
                }
              >
                <Globe2Icon className="size-3" />
              </TooltipTrigger>
              <TooltipPopup side="top">
                Open localhost:{discoveredPorts[0]?.port}
                {discoveredPorts.length > 1 ? ` (+${discoveredPorts.length - 1})` : ""}
              </TooltipPopup>
            </Tooltip>
          )}
          <ThreadWorktreeIndicator thread={thread} />
          {terminalStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label={terminalStatus.label}
                    className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
                  />
                }
              >
                <TerminalIcon className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`} />
              </TooltipTrigger>
              <TooltipPopup side="top">{terminalStatus.label}</TooltipPopup>
            </Tooltip>
          )}
          <div
            className={`flex min-w-12 justify-end ${
              isRemoteThread ? "max-sm:min-w-24" : "max-sm:min-w-20"
            }`}
          >
            {isConfirmingArchive ? (
              <button
                ref={handleConfirmArchiveRef}
                type="button"
                data-thread-selection-safe
                data-testid={`thread-archive-confirm-${thread.id}`}
                aria-label={`Confirm archive ${thread.title}`}
                className="absolute top-1/2 right-1 inline-flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-md bg-destructive/12 px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/18 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-destructive/40"
                onPointerDown={stopPropagationOnPointerDown}
                onClick={handleConfirmArchiveClick}
              >
                Confirm
              </button>
            ) : !isThreadRunning ? (
              appSettingsConfirmThreadArchive ? (
                <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                  <button
                    type="button"
                    data-thread-selection-safe
                    data-testid={`thread-archive-${thread.id}`}
                    aria-label={`Archive ${thread.title}`}
                    className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                    onPointerDown={stopPropagationOnPointerDown}
                    onClick={handleStartArchiveConfirmation}
                  >
                    <ArchiveIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div className="pointer-events-none absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                        <button
                          type="button"
                          data-thread-selection-safe
                          data-testid={`thread-archive-${thread.id}`}
                          aria-label={`Archive ${thread.title}`}
                          className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                          onPointerDown={stopPropagationOnPointerDown}
                          onClick={handleArchiveImmediateClick}
                        >
                          <ArchiveIcon className="size-3.5" />
                        </button>
                      </div>
                    }
                  />
                  <TooltipPopup side="top">Archive</TooltipPopup>
                </Tooltip>
              )
            ) : null}
            <span className={threadMetaClassName}>
              <span className="inline-flex items-center gap-1">
                {isRemoteThread && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={threadEnvironmentLabel ?? "Remote"}
                          className="inline-flex items-center justify-center"
                        />
                      }
                    >
                      <CloudIcon className="size-3 text-muted-foreground/40" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">{threadEnvironmentLabel}</TooltipPopup>
                  </Tooltip>
                )}
                {jumpLabel ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={jumpLabel}
                          className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
                        />
                      }
                    >
                      {jumpLabel}
                    </TooltipTrigger>
                    <TooltipPopup side="top">{jumpLabel}</TooltipPopup>
                  </Tooltip>
                ) : (
                  <span
                    className={`text-[10px] tabular-nums ${
                      isHighlighted
                        ? "text-foreground/72 dark:text-foreground/82"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {formatRelativeTimeLabel(
                      thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
                    )}
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
});

interface SidebarProjectThreadListProps {
  projectKey: string;
  projectExpanded: boolean;
  hasOverflowingThreads: boolean;
  hiddenThreadStatus: ThreadStatusPill | null;
  orderedProjectThreadKeys: readonly string[];
  renderedThreads: readonly SidebarThreadSummary[];
  showEmptyThreadState: boolean;
  shouldShowThreadPanel: boolean;
  isThreadListExpanded: boolean;
  projectCwd: string;
  activeRouteThreadKey: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  startThreadRename: (threadKey: string, title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
}

const SidebarProjectThreadList = memo(function SidebarProjectThreadList(
  props: SidebarProjectThreadListProps,
) {
  const {
    projectKey,
    projectExpanded,
    hasOverflowingThreads,
    hiddenThreadStatus,
    orderedProjectThreadKeys,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
    isThreadListExpanded,
    projectCwd,
    activeRouteThreadKey,
    threadJumpLabelByKey,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    attachThreadListAutoAnimateRef,
    handleThreadClick,
    navigateToThread,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    expandThreadListForProject,
    collapseThreadListForProject,
  } = props;
  const showMoreButtonRender = useMemo(() => <button type="button" />, []);
  const showLessButtonRender = useMemo(() => <button type="button" />, []);

  return (
    <SidebarMenuSub
      ref={attachThreadListAutoAnimateRef}
      className="ml-3 mr-0.5 my-0 w-[calc(100%-0.75rem)] translate-x-0 gap-0.5 overflow-hidden px-1 py-0 sm:ml-3 sm:mr-1 sm:px-1.5"
    >
      {shouldShowThreadPanel && showEmptyThreadState ? (
        <SidebarMenuSubItem className="w-full" data-thread-selection-safe>
          <div
            data-thread-selection-safe
            className="flex h-6 w-full translate-x-0 items-center px-2 text-left text-[10px] text-muted-foreground/60"
          >
            <span>No threads yet</span>
          </div>
        </SidebarMenuSubItem>
      ) : null}
      {shouldShowThreadPanel &&
        renderedThreads.map((thread) => {
          const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
          return (
            <SidebarThreadRow
              key={threadKey}
              thread={thread}
              projectCwd={projectCwd}
              orderedProjectThreadKeys={orderedProjectThreadKeys}
              isActive={activeRouteThreadKey === threadKey}
              jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
              appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
              renamingThreadKey={renamingThreadKey}
              renamingTitle={renamingTitle}
              setRenamingTitle={setRenamingTitle}
              startThreadRename={startThreadRename}
              renamingInputRef={renamingInputRef}
              renamingCommittedRef={renamingCommittedRef}
              confirmingArchiveThreadKey={confirmingArchiveThreadKey}
              setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
              confirmArchiveButtonRefs={confirmArchiveButtonRefs}
              handleThreadClick={handleThreadClick}
              navigateToThread={navigateToThread}
              handleMultiSelectContextMenu={handleMultiSelectContextMenu}
              handleThreadContextMenu={handleThreadContextMenu}
              clearSelection={clearSelection}
              commitRename={commitRename}
              cancelRename={cancelRename}
              attemptArchiveThread={attemptArchiveThread}
              openPrLink={openPrLink}
            />
          );
        })}

      {projectExpanded && hasOverflowingThreads && !isThreadListExpanded && (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showMoreButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => {
              expandThreadListForProject(projectKey);
            }}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {hiddenThreadStatus && <ThreadStatusLabel status={hiddenThreadStatus} compact />}
              <span>Show more</span>
            </span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
      {projectExpanded && hasOverflowingThreads && isThreadListExpanded && (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showLessButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => {
              collapseThreadListForProject(projectKey);
            }}
          >
            <span>Show less</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </SidebarMenuSub>
  );
});

interface SidebarThreadRowsProps {
  threads: readonly SidebarThreadSummary[];
  activeRouteThreadKey: string | null;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  resolveThreadProjectCwd: (thread: SidebarThreadSummary) => string | null;
}

interface SidebarThreadSectionProps extends SidebarThreadRowsProps {
  title: string;
}

function useSidebarThreadRowController(input: {
  threads: readonly SidebarThreadSummary[];
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  resolveThreadWorkspacePath: (thread: SidebarThreadSummary) => string | null;
}) {
  const { threads, archiveThread, deleteThread, resolveThreadWorkspacePath } = input;
  const appSettingsConfirmThreadDelete = useClientSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const appSettingsConfirmThreadArchive = useClientSettings<boolean>(
    (settings) => settings.confirmThreadArchive,
  );
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  const toggleThreadSelection = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const openPrLink = useOpenPrLink();
  const sidebarThreadByKey = useMemo(
    () => new Map(threads.map((thread) => [getSidebarThreadKey(thread), thread] as const)),
    [threads],
  );
  const sidebarThreadByKeyRef = useRef(sidebarThreadByKey);
  sidebarThreadByKeyRef.current = sidebarThreadByKey;
  const orderedThreadKeys = useMemo(() => threads.map(getSidebarThreadKey), [threads]);
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadKey, setConfirmingArchiveThreadKey] = useState<string | null>(null);
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const handleThreadClick = useCallback(
    (
      event: React.MouseEvent,
      threadRef: ScopedThreadRef,
      currentOrderedThreadKeys: readonly string[],
    ) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;
      const threadKey = scopedThreadKey(threadRef);
      const currentSelectionCount = useThreadSelectionStore.getState().selectedThreadKeys.size;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadKey, currentOrderedThreadKeys);
        return;
      }

      if (isTrailingDoubleClick(event.detail)) {
        return;
      }

      if (currentSelectionCount > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadKey);
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [
      clearSelection,
      isMobile,
      rangeSelectTo,
      router,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;

      const clicked = await api.contextMenu.show(
        [
          { id: "mark-unread", label: `Mark unread (${count})` },
          { id: "delete", label: `Delete (${count})`, destructive: true },
        ],
        position,
      );

      if (clicked === "mark-unread") {
        for (const threadKey of threadKeys) {
          const thread = sidebarThreadByKeyRef.current.get(threadKey);
          markThreadUnread(threadKey, thread?.latestTurn?.completedAt);
        }
        clearSelection();
        return;
      }

      if (clicked !== "delete") return;

      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedThreadKeys = new Set(threadKeys);
      for (const threadKey of threadKeys) {
        const thread = sidebarThreadByKeyRef.current.get(threadKey);
        if (!thread) continue;
        const result = await deleteThread(scopeThreadRef(thread.environmentId, thread.id), {
          deletedThreadKeys,
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to delete threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
      }
      removeFromSelection(threadKeys);
    },
    [
      appSettingsConfirmThreadDelete,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
    ],
  );

  const attemptArchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await archiveThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [archiveThread],
  );

  const cancelRename = useCallback(() => {
    setRenamingThreadKey(null);
    renamingInputRef.current = null;
  }, []);

  const startThreadRename = useCallback((threadKey: string, threadTitle: string) => {
    setRenamingThreadKey(threadKey);
    setRenamingTitle(threadTitle);
    renamingCommittedRef.current = false;
  }, []);

  const commitRename = useCallback(
    async (threadRef: ScopedThreadRef, newTitle: string, originalTitle: string) => {
      const threadKey = scopedThreadKey(threadRef);
      const finishRename = () => {
        setRenamingThreadKey((current) => {
          if (current !== threadKey) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          title: trimmed,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      finishRename();
    },
    [updateThreadMetadata],
  );

  const handleThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKey = scopedThreadKey(threadRef);
      const thread = sidebarThreadByKeyRef.current.get(threadKey) ?? null;
      if (!thread) return;
      const threadWorkspacePath = resolveThreadWorkspacePath(thread);
      const clicked = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename thread" },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "delete", label: "Delete", destructive: true, icon: "trash" },
        ],
        position,
      );

      if (clicked === "rename") {
        startThreadRename(threadKey, thread.title);
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadKey, thread.latestTurn?.completedAt);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      }
      if (clicked !== "delete") return;
      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) {
          return;
        }
      }
      const result = await deleteThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [
      appSettingsConfirmThreadDelete,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      markThreadUnread,
      resolveThreadWorkspacePath,
      startThreadRename,
    ],
  );

  return {
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    startThreadRename,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    handleThreadClick,
    navigateToThread,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    orderedThreadKeys,
  };
}

const SidebarThreadRows = memo(function SidebarThreadRows(props: SidebarThreadRowsProps) {
  const {
    threads,
    activeRouteThreadKey,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    resolveThreadProjectCwd,
  } = props;
  const resolveSectionThreadWorkspacePath = useCallback(
    (thread: SidebarThreadSummary) => thread.worktreePath ?? resolveThreadProjectCwd(thread),
    [resolveThreadProjectCwd],
  );
  const threadRows = useSidebarThreadRowController({
    threads,
    archiveThread,
    deleteThread,
    resolveThreadWorkspacePath: resolveSectionThreadWorkspacePath,
  });

  if (threads.length === 0) {
    return null;
  }

  return (
    <SidebarMenuSub
      ref={attachThreadListAutoAnimateRef}
      className="mx-0 my-0 w-full translate-x-0 gap-0.5 overflow-hidden border-l-0 px-0 py-0"
    >
      {threads.map((thread) => {
        const threadKey = getSidebarThreadKey(thread);
        return (
          <SidebarThreadRow
            key={threadKey}
            thread={thread}
            projectCwd={resolveThreadProjectCwd(thread)}
            orderedProjectThreadKeys={threadRows.orderedThreadKeys}
            isActive={activeRouteThreadKey === threadKey}
            jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
            appSettingsConfirmThreadArchive={threadRows.appSettingsConfirmThreadArchive}
            renamingThreadKey={threadRows.renamingThreadKey}
            renamingTitle={threadRows.renamingTitle}
            setRenamingTitle={threadRows.setRenamingTitle}
            startThreadRename={threadRows.startThreadRename}
            renamingInputRef={threadRows.renamingInputRef}
            renamingCommittedRef={threadRows.renamingCommittedRef}
            confirmingArchiveThreadKey={threadRows.confirmingArchiveThreadKey}
            setConfirmingArchiveThreadKey={threadRows.setConfirmingArchiveThreadKey}
            confirmArchiveButtonRefs={threadRows.confirmArchiveButtonRefs}
            handleThreadClick={threadRows.handleThreadClick}
            navigateToThread={threadRows.navigateToThread}
            handleMultiSelectContextMenu={threadRows.handleMultiSelectContextMenu}
            handleThreadContextMenu={threadRows.handleThreadContextMenu}
            clearSelection={threadRows.clearSelection}
            commitRename={threadRows.commitRename}
            cancelRename={threadRows.cancelRename}
            attemptArchiveThread={threadRows.attemptArchiveThread}
            openPrLink={threadRows.openPrLink}
          />
        );
      })}
    </SidebarMenuSub>
  );
});

const SidebarThreadSection = memo(function SidebarThreadSection(props: SidebarThreadSectionProps) {
  const { title, ...threadRowsProps } = props;
  const { threads } = threadRowsProps;

  if (threads.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="px-2 py-1">
      <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          {title}
        </span>
      </div>
      <SidebarThreadRows {...threadRowsProps} />
    </SidebarGroup>
  );
});

interface SidebarFolderRowProps {
  view: SidebarFolderView;
  pinned: boolean;
  onEditFolder: (folder: SidebarProjectFolder) => void;
  onRemoveFolder: (target: SidebarRemoveFolderTarget) => void;
  expandedThreadListsByProject: ReadonlySet<string>;
  activeRouteProjectKey: string | null;
  activeRouteThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
}

const SidebarFolderRow = memo(function SidebarFolderRow(props: SidebarFolderRowProps) {
  const {
    view,
    pinned,
    onEditFolder,
    onRemoveFolder,
    expandedThreadListsByProject,
    activeRouteProjectKey,
    activeRouteThreadKey,
    newThreadShortcutLabel,
    handleNewThread,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
  } = props;
  const folder = view.folder;
  const folderPreferenceKeys = useMemo(() => [folderExpansionKey(folder.id)], [folder.id]);
  const folderExpanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, folderPreferenceKeys),
  );
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const setFolderPinned = useUiStateStore((state) => state.setFolderPinned);
  const setProjectsArchived = useUiStateStore((state) => state.setProjectsArchived);
  const { isOver: isFolderDropTarget, setNodeRef: setFolderDropRef } = useDroppable({
    id: folderDropId(folder.id),
  });
  const { setNodeRef: setFolderBodyDropRef } = useDroppable({
    id: folderBodyDropId(folder.id),
  });
  const toggleFolderExpanded = useCallback(() => {
    setProjectExpanded(folderPreferenceKeys, !folderExpanded);
  }, [folderExpanded, folderPreferenceKeys, setProjectExpanded]);
  const handleArchiveProjects = useCallback(() => {
    if (view.projects.length === 0) {
      return;
    }
    setProjectsArchived(view.projects.flatMap(projectPinPreferenceKeys), true);
    toastManager.add({
      type: "success",
      title: `Archived ${view.projects.length} project${view.projects.length === 1 ? "" : "s"}`,
    });
  }, [setProjectsArchived, view.projects]);

  return (
    <SidebarMenuItem className="rounded-md">
      <div
        ref={setFolderDropRef}
        className={`group/folder-header relative rounded-md ${
          isFolderDropTarget ? "ring-1 ring-primary/40" : ""
        }`}
      >
        <SidebarMenuButton
          size="sm"
          className="cursor-pointer gap-2 px-2 py-1.5 pr-8 text-left hover:bg-accent group-hover/folder-header:bg-accent group-hover/folder-header:text-sidebar-accent-foreground"
          data-testid="sidebar-folder-row"
          onClick={toggleFolderExpanded}
        >
          <ChevronRightIcon
            className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
              folderExpanded ? "rotate-90" : ""
            }`}
          />
          <SidebarFolderGlyph
            className="size-3.5 shrink-0 text-muted-foreground/80"
            color={folder.color}
            icon={folder.icon}
          />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground/90">{folder.name}</span>
            {view.projects.length > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {view.projects.length}
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label={`Open folder menu for ${folder.name}`}
                className={`${SIDEBAR_ICON_ACTION_BUTTON_CLASS} pointer-events-none absolute top-[calc(50%+1px)] right-1 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/folder-header:pointer-events-auto group-hover/folder-header:opacity-100 group-focus-within/folder-header:pointer-events-auto group-focus-within/folder-header:opacity-100`}
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-58" side="bottom">
            <MenuItem onClick={() => setFolderPinned(folder.id, !pinned)}>
              <PinIcon className="size-4" />
              {pinned ? "Unpin folder" : "Pin folder"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => onEditFolder(folder)}>
              <SquarePenIcon className="size-4" />
              Edit details
            </MenuItem>
            <MenuItem disabled={view.projects.length === 0} onClick={handleArchiveProjects}>
              <ArchiveIcon className="size-4" />
              Archive projects
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              variant="destructive"
              onClick={() => onRemoveFolder({ folder, projects: view.projects })}
            >
              <TriangleAlertIcon className="size-4" />
              Remove folder
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      {folderExpanded ? (
        <SidebarMenuSub
          ref={setFolderBodyDropRef}
          className="my-0 mr-0.5 ml-3 w-[calc(100%-0.75rem)] translate-x-0 gap-0.5 px-1 py-0 sm:mr-1 sm:ml-3 sm:px-1.5"
        >
          {view.projects.length === 0 ? (
            <SidebarMenuSubItem className="w-full">
              <div className="flex h-6 w-full items-center px-2 text-left text-[10px] text-muted-foreground/60">
                <span>No projects yet</span>
              </div>
            </SidebarMenuSubItem>
          ) : (
            view.projects.map((project) => (
              <DraggableProjectItem
                key={project.projectKey}
                projectId={project.projectKey}
                fromFolderId={folder.id}
              >
                {(dragHandleProps) => (
                  <SidebarProjectItem
                    project={project}
                    isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                    activeRouteThreadKey={
                      activeRouteProjectKey === project.projectKey ? activeRouteThreadKey : null
                    }
                    newThreadShortcutLabel={newThreadShortcutLabel}
                    handleNewThread={handleNewThread}
                    archiveThread={archiveThread}
                    deleteThread={deleteThread}
                    threadJumpLabelByKey={threadJumpLabelByKey}
                    attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                    expandThreadListForProject={expandThreadListForProject}
                    collapseThreadListForProject={collapseThreadListForProject}
                    dragInProgressRef={dragInProgressRef}
                    suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                    suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                    isManualProjectSorting={false}
                    dragHandleProps={dragHandleProps}
                  />
                )}
              </DraggableProjectItem>
            ))
          )}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
});

const SidebarArchivedProjectsGroup = memo(function SidebarArchivedProjectsGroup(props: {
  projects: readonly SidebarProjectSnapshot[];
}) {
  const { projects } = props;
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const setProjectsArchived = useUiStateStore((state) => state.setProjectsArchived);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1 rounded-md py-1 pr-1.5 pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        data-testid="sidebar-archived-projects-toggle"
        onClick={() => setArchivedExpanded((current) => !current)}
      >
        <ChevronRightIcon
          className={`size-3 transition-transform duration-150 ${archivedExpanded ? "rotate-90" : ""}`}
        />
        <span>Archived</span>
        <span className="text-muted-foreground/40">{projects.length}</span>
      </button>
      {archivedExpanded ? (
        <SidebarMenu className="mt-0.5">
          {projects.map((project) => (
            <SidebarMenuItem key={project.projectKey} className="rounded-md">
              <div className="group/archived-project relative flex items-center gap-2 rounded-md px-2 py-1.5 pr-8">
                <ProjectFavicon
                  className="opacity-60"
                  cwd={project.workspaceRoot}
                  environmentId={project.environmentId}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {project.displayName}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Unarchive ${project.displayName}`}
                        className={`${SIDEBAR_ICON_ACTION_BUTTON_CLASS} absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:opacity-100 group-hover/archived-project:opacity-100 group-focus-within/archived-project:opacity-100`}
                        onClick={() =>
                          setProjectsArchived(projectPinPreferenceKeys(project), false)
                        }
                      />
                    }
                  >
                    <ArchiveRestoreIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Unarchive project</TooltipPopup>
                </Tooltip>
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      ) : null}
    </div>
  );
});

interface SidebarPinnedSectionProps {
  folders: readonly SidebarFolderView[];
  onEditFolder: (folder: SidebarProjectFolder) => void;
  onRemoveFolder: (target: SidebarRemoveFolderTarget) => void;
  projects: readonly SidebarProjectSnapshot[];
  threads: readonly SidebarThreadSummary[];
  activeRouteProjectKey: string | null;
  activeRouteThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  expandedThreadListsByProject: ReadonlySet<string>;
  attachProjectListAutoAnimateRef: (node: HTMLElement | null) => void;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  resolveThreadProjectCwd: (thread: SidebarThreadSummary) => string | null;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
}

const SidebarPinnedSection = memo(function SidebarPinnedSection(props: SidebarPinnedSectionProps) {
  const {
    folders,
    onEditFolder,
    onRemoveFolder,
    projects,
    threads,
    activeRouteProjectKey,
    activeRouteThreadKey,
    newThreadShortcutLabel,
    handleNewThread,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    expandedThreadListsByProject,
    attachProjectListAutoAnimateRef,
    attachThreadListAutoAnimateRef,
    resolveThreadProjectCwd,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
  } = props;

  if (projects.length === 0 && threads.length === 0 && folders.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="px-2 py-1">
      <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Pinned
        </span>
      </div>
      {folders.length > 0 ? (
        <SidebarMenu className="gap-0.5">
          {folders.map((view) => (
            <SidebarFolderRow
              key={view.folder.id}
              view={view}
              pinned
              onEditFolder={onEditFolder}
              onRemoveFolder={onRemoveFolder}
              expandedThreadListsByProject={expandedThreadListsByProject}
              activeRouteProjectKey={activeRouteProjectKey}
              activeRouteThreadKey={activeRouteThreadKey}
              newThreadShortcutLabel={newThreadShortcutLabel}
              handleNewThread={handleNewThread}
              archiveThread={archiveThread}
              deleteThread={deleteThread}
              threadJumpLabelByKey={threadJumpLabelByKey}
              attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
              expandThreadListForProject={expandThreadListForProject}
              collapseThreadListForProject={collapseThreadListForProject}
              dragInProgressRef={dragInProgressRef}
              suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
              suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
            />
          ))}
        </SidebarMenu>
      ) : null}
      {projects.length > 0 ? (
        <SidebarMenu ref={attachProjectListAutoAnimateRef} className="gap-0.5">
          {projects.map((project) => (
            <SidebarProjectListRow
              key={project.projectKey}
              project={project}
              isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
              activeRouteThreadKey={
                activeRouteProjectKey === project.projectKey ? activeRouteThreadKey : null
              }
              newThreadShortcutLabel={newThreadShortcutLabel}
              handleNewThread={handleNewThread}
              archiveThread={archiveThread}
              deleteThread={deleteThread}
              threadJumpLabelByKey={threadJumpLabelByKey}
              attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
              expandThreadListForProject={expandThreadListForProject}
              collapseThreadListForProject={collapseThreadListForProject}
              dragInProgressRef={dragInProgressRef}
              suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
              suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
              isManualProjectSorting={false}
              dragHandleProps={null}
            />
          ))}
        </SidebarMenu>
      ) : null}
      <SidebarThreadRows
        threads={threads}
        activeRouteThreadKey={activeRouteThreadKey}
        archiveThread={archiveThread}
        deleteThread={deleteThread}
        threadJumpLabelByKey={threadJumpLabelByKey}
        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
        resolveThreadProjectCwd={resolveThreadProjectCwd}
      />
    </SidebarGroup>
  );
});

interface SidebarProjectItemProps {
  project: SidebarProjectSnapshot;
  isThreadListExpanded: boolean;
  activeRouteThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  isManualProjectSorting: boolean;
  dragHandleProps: SortableProjectHandleProps | null;
}

const SidebarProjectItem = memo(function SidebarProjectItem(props: SidebarProjectItemProps) {
  const {
    project,
    isThreadListExpanded,
    activeRouteThreadKey,
    newThreadShortcutLabel,
    handleNewThread,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    isManualProjectSorting,
    dragHandleProps,
  } = props;
  const threadSortOrder = useClientSettings<SidebarThreadSortOrder>(
    (settings) => settings.sidebarThreadSortOrder,
  );
  const serverConfigs = useServerConfigs();
  const deleteProject = useAtomCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const updateProject = useAtomCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const setProjectIcon = useAtomCommand(projectEnvironment.setIcon, {
    reportFailure: false,
  });
  const sidebarThreadPreviewCount = useClientSettings<SidebarThreadPreviewCount>(
    (settings) => settings.sidebarThreadPreviewCount,
  );
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const setProjectExpanded = useUiStateStore((state) => state.setProjectExpanded);
  const localSidebarThreads = useThreadShellsForProjectRefs(project.memberProjectRefs);
  const cloudWorkspace = useCloudWorkspace();
  const sidebarThreads = useMemo(() => {
    const projectKeys = new Set(project.memberProjectRefs.map(scopedProjectKey));
    const cloudThreads = cloudWorkspace.threads.filter(
      (thread) =>
        thread.projectId !== null &&
        projectKeys.has(scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId))),
    );
    return mergeCloudWorkspace({
      localProjects: [],
      localThreads: localSidebarThreads,
      cloudProjects: [],
      cloudThreads,
    }).threads;
  }, [cloudWorkspace.threads, localSidebarThreads, project.memberProjectRefs]);
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Keep a ref so callbacks can read the latest map without appearing in
  // dependency arrays (avoids invalidating every thread-row memo on each
  // thread-list change).
  const sidebarThreadByKeyRef = useRef(sidebarThreadByKey);
  sidebarThreadByKeyRef.current = sidebarThreadByKey;
  const projectThreads = sidebarThreads;
  const projectPreferenceKeys = useMemo(() => projectExpansionPreferenceKeys(project), [project]);
  const projectExpanded = useUiStateStore((state) =>
    resolveProjectExpanded(state.projectExpandedById, projectPreferenceKeys),
  );
  const projectPinKeys = useMemo(() => projectPinPreferenceKeys(project), [project]);
  const projectPinned = useUiStateStore((state) =>
    resolveProjectPinned(state.pinnedProjectIds, projectPinKeys),
  );
  const setProjectPinned = useUiStateStore((state) => state.setProjectPinned);
  const projectPinLabel = projectPinned ? "Unpin project" : "Pin project";
  const toggleProjectPinned = useCallback(() => {
    setProjectPinned(projectPinKeys, !projectPinned);
  }, [projectPinKeys, projectPinned, setProjectPinned]);
  const projectFolders = useUiStateStore((state) => state.projectFolders);
  const setProjectFolderMembership = useUiStateStore((state) => state.setProjectFolderMembership);
  const projectFolderId = useMemo(
    () => resolveProjectFolderId(projectFolders, projectPinKeys),
    [projectFolders, projectPinKeys],
  );
  const threadLastVisitedAts = useUiStateStore(
    useShallow((state) =>
      projectThreads.map(
        (thread) =>
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ] ?? null,
      ),
    ),
  );
  const [projectRenameTarget, setProjectRenameTarget] = useState<SidebarProjectGroupMember | null>(
    null,
  );
  const [projectRenameTitle, setProjectRenameTitle] = useState("");
  const [projectDetailsView, setProjectDetailsView] = useState<"details" | "archive">("details");
  const projectIconInputRef = useRef<HTMLInputElement | null>(null);
  const memberProjectByScopedKey = useMemo(
    () =>
      new Map(
        project.memberProjects.map((member) => [
          scopedProjectKey(scopeProjectRef(member.environmentId, member.id)),
          member,
        ]),
      ),
    [project.memberProjects],
  );
  const resolveProjectThreadWorkspacePath = useCallback(
    (thread: SidebarThreadSummary) => {
      if (thread.projectId === null) {
        return thread.worktreePath ?? null;
      }
      const threadProject = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      return thread.worktreePath ?? threadProject?.workspaceRoot ?? project.workspaceRoot ?? null;
    },
    [memberProjectByScopedKey, project.workspaceRoot],
  );
  const threadRows = useSidebarThreadRowController({
    threads: projectThreads,
    archiveThread,
    deleteThread,
    resolveThreadWorkspacePath: resolveProjectThreadWorkspacePath,
  });
  const clearThreadSelection = threadRows.clearSelection;
  const memberThreadCountByPhysicalKey = useMemo(() => {
    const counts = new Map<string, number>(
      project.memberProjects.map((member) => [member.physicalProjectKey, 0] as const),
    );
    for (const thread of projectThreads) {
      if (thread.projectId === null) {
        continue;
      }
      const member = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      if (!member) {
        continue;
      }
      counts.set(member.physicalProjectKey, (counts.get(member.physicalProjectKey) ?? 0) + 1);
    }
    return counts;
  }, [memberProjectByScopedKey, project.memberProjects, projectThreads]);

  const { projectStatus, visibleProjectThreads, orderedProjectThreadKeys } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        threadLastVisitedAts[index] ?? null,
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const visibleProjectThreads = sortThreads(
      projectThreads.filter((thread) => thread.archivedAt === null),
      threadSortOrder,
    );
    const projectStatus = resolveProjectStatusIndicator(
      visibleProjectThreads.map((thread) => resolveProjectThreadStatus(thread)),
    );
    return {
      orderedProjectThreadKeys: visibleProjectThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
      projectStatus,
      visibleProjectThreads,
    };
  }, [projectThreads, threadLastVisitedAts, threadSortOrder]);
  const pinnedCollapsedThread = useMemo(() => {
    const activeThreadKey = activeRouteThreadKey ?? undefined;
    if (!activeThreadKey || projectExpanded) {
      return null;
    }
    return (
      visibleProjectThreads.find(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === activeThreadKey,
      ) ?? null
    );
  }, [activeRouteThreadKey, projectExpanded, visibleProjectThreads]);

  const {
    hasOverflowingThreads,
    hiddenThreadStatus,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
  } = useMemo(() => {
    const lastVisitedAtByThreadKey = new Map(
      projectThreads.map((thread, index) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        threadLastVisitedAts[index] ?? null,
      ]),
    );
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const hasOverflowingThreads = visibleProjectThreads.length > sidebarThreadPreviewCount;
    const previewThreads =
      isThreadListExpanded || !hasOverflowingThreads
        ? visibleProjectThreads
        : visibleProjectThreads.slice(0, sidebarThreadPreviewCount);
    const visibleThreadKeys = new Set(
      [...previewThreads, ...(pinnedCollapsedThread ? [pinnedCollapsedThread] : [])].map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    );
    const renderedThreads = pinnedCollapsedThread
      ? [pinnedCollapsedThread]
      : visibleProjectThreads.filter((thread) =>
          visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
        );
    const hiddenThreads = visibleProjectThreads.filter(
      (thread) =>
        !visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
    );
    return {
      hasOverflowingThreads,
      hiddenThreadStatus: resolveProjectStatusIndicator(
        hiddenThreads.map((thread) => resolveProjectThreadStatus(thread)),
      ),
      renderedThreads,
      showEmptyThreadState: projectExpanded && visibleProjectThreads.length === 0,
      shouldShowThreadPanel: projectExpanded || pinnedCollapsedThread !== null,
    };
  }, [
    isThreadListExpanded,
    pinnedCollapsedThread,
    projectExpanded,
    projectThreads,
    sidebarThreadPreviewCount,
    threadLastVisitedAts,
    visibleProjectThreads,
  ]);

  const handleProjectButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressProjectClickForContextMenuRef.current) {
        suppressProjectClickForContextMenuRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (useThreadSelectionStore.getState().hasSelection()) {
        clearThreadSelection();
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [
      clearThreadSelection,
      dragInProgressRef,
      projectExpanded,
      projectPreferenceKeys,
      setProjectExpanded,
      suppressProjectClickAfterDragRef,
      suppressProjectClickForContextMenuRef,
    ],
  );

  const handleProjectButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      setProjectExpanded(projectPreferenceKeys, !projectExpanded);
    },
    [dragInProgressRef, projectExpanded, projectPreferenceKeys, setProjectExpanded],
  );

  const handleProjectButtonPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      suppressProjectClickForContextMenuRef.current = false;
      if (
        isContextMenuPointerDown({
          button: event.button,
          ctrlKey: event.ctrlKey,
          isMac: isMacPlatform(navigator.platform),
        })
      ) {
        event.stopPropagation();
      }

      suppressProjectClickAfterDragRef.current = false;
    },
    [suppressProjectClickAfterDragRef, suppressProjectClickForContextMenuRef],
  );

  const projectDetailsGitStatus = useEnvironmentQuery(
    projectRenameTarget
      ? vcsEnvironment.status({
          environmentId: projectRenameTarget.environmentId,
          input: { cwd: projectRenameTarget.workspaceRoot },
        })
      : null,
  );
  const projectDetailsArchivedThreads = useMemo(() => {
    if (!projectRenameTarget) {
      return [];
    }
    return sortThreads(
      projectThreads.filter(
        (thread) =>
          thread.environmentId === projectRenameTarget.environmentId &&
          thread.projectId === projectRenameTarget.id &&
          thread.archivedAt !== null,
      ),
      threadSortOrder,
    );
  }, [projectRenameTarget, projectThreads, threadSortOrder]);
  const projectDetailsRepoLabel =
    projectRenameTarget?.repositoryIdentity?.displayName ??
    projectRenameTarget?.repositoryIdentity?.name ??
    projectRenameTarget?.repositoryIdentity?.canonicalKey ??
    (projectDetailsGitStatus.data?.isRepo ? "Git repository" : "No repository detected");
  const projectDetailsRepoRemote =
    projectRenameTarget?.repositoryIdentity?.locator.remoteUrl ??
    (projectDetailsGitStatus.isPending
      ? "Checking repository"
      : projectDetailsGitStatus.error
        ? "Could not read repository details"
        : projectDetailsGitStatus.data?.isRepo
          ? "Connected to local Git metadata"
          : "No Git repository found for this directory");

  const openProjectRenameDialog = useCallback((member: SidebarProjectGroupMember) => {
    setProjectRenameTarget(member);
    setProjectRenameTitle(member.title);
    setProjectDetailsView("details");
  }, []);

  const removeProject = useCallback(
    async (member: SidebarProjectGroupMember, options: { force?: boolean } = {}) => {
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const result = await deleteProject({
        environmentId: member.environmentId,
        input: {
          projectId: member.id,
          ...(options.force === true ? { force: true } : {}),
        },
      });
      if (result._tag === "Failure") {
        return result;
      }
      const draftStore = useComposerDraftStore.getState();
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(memberProjectRef);
      return result;
    },
    [deleteProject],
  );

  const handleRemoveProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const api = readLocalApi();
      if (!api) {
        return;
      }

      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const memberThreadCount = memberThreadCountByPhysicalKey.get(member.physicalProjectKey) ?? 0;
      if (memberThreadCount > 0) {
        const warningToastId = toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "Project is not empty",
            description: "Delete all threads in this project before removing it.",
            actionVariant: "destructive",
            actionProps: {
              children: "Delete anyway",
              onClick: () => {
                void (async () => {
                  toastManager.close(warningToastId);
                  await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 180);
                  });

                  const latestProjectThreads = Array.from(
                    sidebarThreadByKeyRef.current.values(),
                  ).filter(
                    (thread) =>
                      thread.environmentId === memberProjectRef.environmentId &&
                      thread.projectId === memberProjectRef.projectId,
                  );
                  const confirmed = await api.dialogs.confirm(
                    latestProjectThreads.length > 0
                      ? [
                          `Remove project "${member.title}" and delete its ${latestProjectThreads.length} thread${
                            latestProjectThreads.length === 1 ? "" : "s"
                          }?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This permanently clears conversation history for those threads.",
                          "This removes only this project entry.",
                          "This action cannot be undone.",
                        ].join("\n")
                      : [
                          `Remove project "${member.title}"?`,
                          `Path: ${member.workspaceRoot}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This removes only this project entry.",
                        ].join("\n"),
                  );
                  if (!confirmed) {
                    return;
                  }

                  const result = await removeProject(member, { force: true });
                  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                    const error = squashAtomCommandFailure(result);
                    toastManager.add(
                      stackedThreadToast({
                        type: "error",
                        title: `Failed to remove "${member.title}"`,
                        description:
                          error instanceof Error
                            ? error.message
                            : "Unknown error removing project.",
                      }),
                    );
                  }
                })().catch((error) => {
                  const message =
                    error instanceof Error ? error.message : "Unknown error removing project.";
                  console.error("Failed to remove project", {
                    projectId: member.id,
                    environmentId: member.environmentId,
                    ...safeErrorLogAttributes(error),
                  });
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Failed to remove "${member.title}"`,
                      description: message,
                    }),
                  );
                });
              },
            },
          }),
        );
        return;
      }

      const message = [
        `Remove project "${member.title}"?`,
        `Path: ${member.workspaceRoot}`,
        ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
        "This removes only this project entry.",
      ].join("\n");
      const confirmed = await api.dialogs.confirm(message);
      if (!confirmed) {
        return;
      }

      const result = await removeProject(member);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        const message = error instanceof Error ? error.message : "Unknown error removing project.";
        console.error("Failed to remove project", {
          projectId: member.id,
          environmentId: member.environmentId,
          ...safeErrorLogAttributes(error),
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to remove "${member.title}"`,
            description: message,
          }),
        );
      }
    },
    [memberThreadCountByPhysicalKey, removeProject],
  );

  const handleProjectButtonContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      suppressProjectClickForContextMenuRef.current = true;
      void (async () => {
        const api = readLocalApi();
        if (!api) return;

        const actionHandlers = new Map<string, () => Promise<void> | void>([
          ["pin", toggleProjectPinned],
        ]);
        type ProjectMemberMenuAction = "rename" | "reveal" | "worktree" | "archive" | "delete";
        const makeLeaf = (
          action: ProjectMemberMenuAction,
          member: SidebarProjectGroupMember,
          options?: {
            destructive?: boolean;
            disabled?: boolean;
          },
        ): ContextMenuItem<string> => {
          const id = `${action}:${member.physicalProjectKey}`;
          actionHandlers.set(id, () => {
            switch (action) {
              case "reveal":
              case "worktree":
              case "archive":
                return;
              case "rename":
                openProjectRenameDialog(member);
                return;
              case "delete":
                return handleRemoveProject(member);
            }
          });

          return {
            id,
            label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            ...(options?.destructive ? { destructive: true } : {}),
            ...(options?.disabled ? { disabled: true } : {}),
          };
        };

        const buildTargetedItem = (
          action: ProjectMemberMenuAction,
          label: string,
          options?: {
            destructive?: boolean;
            disabled?: boolean;
            isDisabled?: (member: SidebarProjectGroupMember) => boolean;
          },
        ): ContextMenuItem<string> => {
          if (project.memberProjects.length === 1) {
            const singleMember = project.memberProjects[0]!;
            return {
              ...makeLeaf(action, singleMember, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.disabled || options?.isDisabled?.(singleMember)
                  ? { disabled: true }
                  : {}),
              }),
              label,
              ...(action === "delete" ? { icon: "trash" } : {}),
            };
          }

          return {
            id: `${action}:submenu`,
            label,
            ...(action === "delete" ? { icon: "trash" } : {}),
            children: project.memberProjects.map((member) =>
              makeLeaf(action, member, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.disabled || options?.isDisabled?.(member) ? { disabled: true } : {}),
              }),
            ),
          };
        };

        const clicked = await api.contextMenu.show(
          [
            {
              id: "pin",
              label: projectPinLabel,
            },
            buildTargetedItem("rename", "Edit details"),
            buildTargetedItem("reveal", "Reveal in Finder", { disabled: true }),
            buildTargetedItem("worktree", "Create permanent worktree", { disabled: true }),
            buildTargetedItem("archive", "Archive chats", { disabled: true }),
            buildTargetedItem("delete", "Remove", {
              destructive: true,
            }),
          ],
          {
            x: event.clientX,
            y: event.clientY,
          },
        );

        if (!clicked) {
          return;
        }

        await actionHandlers.get(clicked)?.();
      })();
    },
    [
      handleRemoveProject,
      openProjectRenameDialog,
      project.groupedProjectCount,
      project.memberProjects,
      projectPinLabel,
      suppressProjectClickForContextMenuRef,
      toggleProjectPinned,
    ],
  );

  const createThreadForProjectMember = useCallback(
    (member: SidebarProjectGroupMember) => {
      const currentRouteParams =
        router.state.matches[router.state.matches.length - 1]?.params ?? {};
      const currentRouteTarget = resolveThreadRouteTarget(currentRouteParams);
      const currentActiveThread =
        currentRouteTarget?.kind === "server"
          ? readThreadShell(currentRouteTarget.threadRef)
          : null;
      const draftStore = useComposerDraftStore.getState();
      const currentActiveDraftThread =
        currentRouteTarget?.kind === "server"
          ? (draftStore.getDraftThread(currentRouteTarget.threadRef) ?? null)
          : currentRouteTarget?.kind === "draft"
            ? (draftStore.getDraftSession(currentRouteTarget.draftId) ?? null)
            : null;
      const seedContext = resolveSidebarNewThreadSeedContext({
        projectId: member.id,
        defaultEnvMode: resolveSidebarNewThreadEnvMode({
          defaultEnvMode:
            serverConfigs.get(member.environmentId)?.settings.defaultThreadEnvMode ??
            DEFAULT_SERVER_SETTINGS.defaultThreadEnvMode,
        }),
        activeThread:
          currentActiveThread && currentActiveThread.projectId === member.id
            ? {
                projectId: currentActiveThread.projectId,
                branch: currentActiveThread.branch,
                worktreePath: currentActiveThread.worktreePath,
              }
            : null,
        activeDraftThread:
          currentActiveDraftThread && currentActiveDraftThread.projectId === member.id
            ? {
                projectId: currentActiveDraftThread.projectId,
                branch: currentActiveDraftThread.branch,
                worktreePath: currentActiveDraftThread.worktreePath,
                envMode: currentActiveDraftThread.envMode,
                startFromOrigin: currentActiveDraftThread.startFromOrigin,
              }
            : null,
      });
      if (isMobile) {
        setOpenMobile(false);
      }
      void (async () => {
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(member.environmentId, member.id), {
            ...(seedContext.branch !== undefined ? { branch: seedContext.branch } : {}),
            ...(seedContext.worktreePath !== undefined
              ? { worktreePath: seedContext.worktreePath }
              : {}),
            envMode: seedContext.envMode,
            ...(seedContext.startFromOrigin !== undefined
              ? { startFromOrigin: seedContext.startFromOrigin }
              : {}),
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      })();
    },
    [handleNewThread, isMobile, router, serverConfigs, setOpenMobile],
  );

  const handleCreateThreadClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (project.memberProjects.length === 1) {
        createThreadForProjectMember(project.memberProjects[0]!);
        return;
      }

      void (async () => {
        const api = readLocalApi();
        if (!api) {
          return;
        }
        const clickedResult = await settlePromise(() =>
          api.contextMenu.show(
            project.memberProjects.map((member) => ({
              id: member.physicalProjectKey,
              label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            })),
            {
              x: event.clientX,
              y: event.clientY,
            },
          ),
        );
        if (clickedResult._tag === "Failure") {
          const error = squashAtomCommandFailure(clickedResult);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not choose environment",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
          return;
        }
        const clicked = clickedResult.value;
        if (!clicked) {
          return;
        }
        const targetMember = project.memberProjects.find(
          (member) => member.physicalProjectKey === clicked,
        );
        if (!targetMember) {
          return;
        }
        createThreadForProjectMember(targetMember);
      })();
    },
    [createThreadForProjectMember, project.groupedProjectCount, project.memberProjects],
  );

  const closeProjectRenameDialog = useCallback(() => {
    setProjectRenameTarget(null);
    setProjectRenameTitle("");
    setProjectDetailsView("details");
    if (projectIconInputRef.current) {
      projectIconInputRef.current.value = "";
    }
  }, []);

  const submitProjectIcon = useCallback(
    async (file: File) => {
      if (!projectRenameTarget) {
        return;
      }
      if (!file.type.startsWith("image/")) {
        toastManager.add({
          type: "warning",
          title: "Project icon must be an image",
        });
        return;
      }
      if (file.size > PROJECT_ICON_MAX_BYTES) {
        toastManager.add({
          type: "warning",
          title: "Project icon is too large",
          description: `Choose an image up to ${Math.floor(PROJECT_ICON_MAX_BYTES / (1024 * 1024))}MB.`,
        });
        return;
      }

      const { environmentId, workspaceRoot } = projectRenameTarget;
      const dataUrl = await readFileAsDataUrl(file);
      const result = await setProjectIcon({
        environmentId,
        input: {
          cwd: workspaceRoot,
          fileName: file.name,
          dataUrl,
        },
      });
      if (result._tag === "Success") {
        appAtomRegistry.refresh(
          assetEnvironment.createUrl({
            environmentId,
            input: { resource: { _tag: "project-favicon", cwd: workspaceRoot } },
          }),
        );
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to update project icon",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [projectRenameTarget, setProjectIcon],
  );

  const submitProjectRename = useCallback(async () => {
    if (!projectRenameTarget) {
      return;
    }

    const trimmed = projectRenameTitle.trim();
    if (trimmed.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project title cannot be empty",
      });
      return;
    }

    if (trimmed === projectRenameTarget.title) {
      closeProjectRenameDialog();
      return;
    }

    const result = await updateProject({
      environmentId: projectRenameTarget.environmentId,
      input: {
        projectId: projectRenameTarget.id,
        title: trimmed,
      },
    });
    if (result._tag === "Success") {
      closeProjectRenameDialog();
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to update project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [closeProjectRenameDialog, projectRenameTarget, projectRenameTitle, updateProject]);

  const renderTargetedProjectMenuAction = (action: {
    key: string;
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    destructive?: boolean;
    onSelect: (member: SidebarProjectGroupMember) => void;
  }): React.ReactNode => {
    const Icon = action.icon;
    const variant = action.destructive ? "destructive" : "default";
    if (project.memberProjects.length === 1) {
      const member = project.memberProjects[0]!;
      return (
        <MenuItem
          key={action.key}
          disabled={action.disabled}
          variant={variant}
          onClick={() => action.onSelect(member)}
        >
          <Icon className="size-4" />
          {action.label}
        </MenuItem>
      );
    }

    return (
      <MenuSub key={action.key}>
        <MenuSubTrigger disabled={action.disabled}>
          <Icon className="size-4" />
          {action.label}
        </MenuSubTrigger>
        <MenuSubPopup className="min-w-52">
          {project.memberProjects.map((member) => (
            <MenuItem
              key={`${action.key}:${member.physicalProjectKey}`}
              variant={variant}
              onClick={() => action.onSelect(member)}
            >
              {formatProjectMemberActionLabel(member, project.groupedProjectCount)}
            </MenuItem>
          ))}
        </MenuSubPopup>
      </MenuSub>
    );
  };
  const hasCloudMember = project.memberProjects.some(isCloudWorkspaceEntity);

  return (
    <>
      <div className="group/project-header relative">
        <SidebarMenuButton
          ref={dragHandleProps?.setActivatorNodeRef}
          size="sm"
          className={`gap-2 px-2 py-1.5 pr-14 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground max-sm:pr-14 ${
            isManualProjectSorting ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          }`}
          {...(dragHandleProps ? dragHandleProps.attributes : {})}
          {...(dragHandleProps ? dragHandleProps.listeners : {})}
          onPointerDownCapture={handleProjectButtonPointerDownCapture}
          onClick={handleProjectButtonClick}
          onKeyDown={handleProjectButtonKeyDown}
          onContextMenu={handleProjectButtonContextMenu}
        >
          {!projectExpanded && projectStatus ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label={projectStatus.label}
                    className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
                  />
                }
              >
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                  <span
                    className={`size-[9px] rounded-full ${projectStatus.dotClass} ${
                      projectStatus.pulse ? "animate-pulse" : ""
                    }`}
                  />
                </span>
                <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
              </TooltipTrigger>
              <TooltipPopup side="top">{projectStatus.label}</TooltipPopup>
            </Tooltip>
          ) : (
            <ChevronRightIcon
              className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                projectExpanded ? "rotate-90" : ""
              }`}
            />
          )}
          <ProjectFavicon environmentId={project.environmentId} cwd={project.workspaceRoot} />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground/90">
              {project.displayName}
            </span>
            {project.groupedProjectCount > 1 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {project.groupedProjectCount} projects
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
        {/* Environment badge – visible by default, crossfades with the
            "new thread" button on hover using the same pointer-events +
            opacity pattern as the thread row archive/timestamp swap. */}
        {(project.environmentPresence === "remote-only" || hasCloudMember) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={
                    hasCloudMember
                      ? "Synced cloud project"
                      : project.environmentPresence === "remote-only"
                        ? "Remote project"
                        : "Available in multiple environments"
                  }
                  className="pointer-events-none absolute top-1 right-1.5 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-opacity duration-150 max-sm:right-7 group-hover/project-header:opacity-0 group-focus-within/project-header:opacity-0 max-sm:group-hover/project-header:opacity-100 max-sm:group-focus-within/project-header:opacity-100"
                />
              }
            >
              <CloudIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top">
              {hasCloudMember
                ? "Synced project · commands route to the source environment"
                : `Remote environment: ${project.remoteEnvironmentLabels.join(", ")}`}
            </TooltipPopup>
          </Tooltip>
        )}
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label={`Open project menu for ${project.displayName}`}
                className={`${SIDEBAR_ICON_ACTION_BUTTON_CLASS} pointer-events-none absolute top-[calc(50%+1px)] right-6 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100`}
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-58" side="bottom">
            <MenuItem onClick={toggleProjectPinned}>
              <PinIcon className="size-4" />
              {projectPinLabel}
            </MenuItem>
            <MenuSeparator />
            {renderTargetedProjectMenuAction({
              key: "edit-details",
              label: "Edit details",
              icon: SquarePenIcon,
              onSelect: openProjectRenameDialog,
            })}
            {projectFolders.length > 0 ? (
              <MenuSub>
                <MenuSubTrigger>
                  <FolderInputIcon className="size-4" />
                  Move to folder
                </MenuSubTrigger>
                <MenuSubPopup className="min-w-52">
                  {projectFolders.map((folder) => (
                    <MenuItem
                      key={folder.id}
                      onClick={() => setProjectFolderMembership(projectPinKeys, folder.id)}
                    >
                      <SidebarFolderGlyph
                        className="size-4"
                        color={folder.color}
                        icon={folder.icon}
                      />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      {folder.id === projectFolderId ? (
                        <CheckIcon className="size-3.5 text-muted-foreground" />
                      ) : null}
                    </MenuItem>
                  ))}
                  {projectFolderId !== null ? (
                    <>
                      <MenuSeparator />
                      <MenuItem onClick={() => setProjectFolderMembership(projectPinKeys, null)}>
                        Remove from folder
                      </MenuItem>
                    </>
                  ) : null}
                </MenuSubPopup>
              </MenuSub>
            ) : null}
            {renderTargetedProjectMenuAction({
              key: "reveal",
              label: "Reveal in Finder",
              icon: FolderKanbanIcon,
              disabled: true,
              onSelect: () => {},
            })}
            {renderTargetedProjectMenuAction({
              key: "permanent-worktree",
              label: "Create permanent worktree",
              icon: GitBranchPlusIcon,
              disabled: true,
              onSelect: () => {},
            })}
            {renderTargetedProjectMenuAction({
              key: "archive-chats",
              label: "Archive chats",
              icon: ArchiveIcon,
              disabled: true,
              onSelect: () => {},
            })}
            <MenuSeparator />
            {renderTargetedProjectMenuAction({
              key: "remove",
              label: "Remove",
              icon: TriangleAlertIcon,
              destructive: true,
              onSelect: (member) => {
                void handleRemoveProject(member);
              },
            })}
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="pointer-events-none absolute top-[calc(50%+1px)] right-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100">
                <button
                  type="button"
                  aria-label={`Create new thread in ${project.displayName}`}
                  data-testid="new-thread-button"
                  className={SIDEBAR_ICON_ACTION_BUTTON_CLASS}
                  onClick={handleCreateThreadClick}
                >
                  <SquarePenIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <TooltipPopup side="top">
            {newThreadShortcutLabel ? `New thread (${newThreadShortcutLabel})` : "New thread"}
          </TooltipPopup>
        </Tooltip>
      </div>

      <SidebarProjectThreadList
        projectKey={project.projectKey}
        projectExpanded={projectExpanded}
        hasOverflowingThreads={hasOverflowingThreads}
        hiddenThreadStatus={hiddenThreadStatus}
        orderedProjectThreadKeys={orderedProjectThreadKeys}
        renderedThreads={renderedThreads}
        showEmptyThreadState={showEmptyThreadState}
        shouldShowThreadPanel={shouldShowThreadPanel}
        isThreadListExpanded={isThreadListExpanded}
        projectCwd={project.workspaceRoot}
        activeRouteThreadKey={activeRouteThreadKey}
        threadJumpLabelByKey={threadJumpLabelByKey}
        appSettingsConfirmThreadArchive={threadRows.appSettingsConfirmThreadArchive}
        renamingThreadKey={threadRows.renamingThreadKey}
        renamingTitle={threadRows.renamingTitle}
        setRenamingTitle={threadRows.setRenamingTitle}
        startThreadRename={threadRows.startThreadRename}
        renamingInputRef={threadRows.renamingInputRef}
        renamingCommittedRef={threadRows.renamingCommittedRef}
        confirmingArchiveThreadKey={threadRows.confirmingArchiveThreadKey}
        setConfirmingArchiveThreadKey={threadRows.setConfirmingArchiveThreadKey}
        confirmArchiveButtonRefs={threadRows.confirmArchiveButtonRefs}
        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
        handleThreadClick={threadRows.handleThreadClick}
        navigateToThread={threadRows.navigateToThread}
        handleMultiSelectContextMenu={threadRows.handleMultiSelectContextMenu}
        handleThreadContextMenu={threadRows.handleThreadContextMenu}
        clearSelection={threadRows.clearSelection}
        commitRename={threadRows.commitRename}
        cancelRename={threadRows.cancelRename}
        attemptArchiveThread={threadRows.attemptArchiveThread}
        openPrLink={threadRows.openPrLink}
        expandThreadListForProject={expandThreadListForProject}
        collapseThreadListForProject={collapseThreadListForProject}
      />

      <Sheet
        open={projectRenameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectRenameDialog();
          }
        }}
      >
        <SheetPopup className="max-w-[27rem]" side="right">
          <SheetHeader className={projectDetailsView === "archive" ? "gap-3" : undefined}>
            {projectDetailsView === "archive" ? (
              <Button
                className="-ml-2 w-fit gap-2"
                size="sm"
                variant="ghost"
                onClick={() => setProjectDetailsView("details")}
              >
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
            ) : null}
            <SheetTitle>
              {projectDetailsView === "archive" ? "Archived chats" : "Project details"}
            </SheetTitle>
            <SheetDescription>
              {projectDetailsView === "archive"
                ? projectRenameTarget
                  ? `Archived conversations for ${projectRenameTarget.title}.`
                  : "Archived conversations for this project."
                : projectRenameTarget
                  ? `Manage ${projectRenameTarget.title}.`
                  : "Manage this project."}
            </SheetDescription>
          </SheetHeader>

          {projectDetailsView === "archive" ? (
            <SheetPanel className="space-y-3">
              {projectDetailsArchivedThreads.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <div className="text-sm font-medium text-foreground">No archived chats</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Archived conversations for this project will appear here.
                  </p>
                </div>
              ) : (
                projectDetailsArchivedThreads.map((thread) => (
                  <button
                    key={scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent/35"
                    onClick={() => {
                      void threadRows.navigateToThread(
                        scopeThreadRef(thread.environmentId, thread.id),
                      );
                      closeProjectRenameDialog();
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {thread.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Archived {formatRelativeTimeLabel(thread.archivedAt ?? thread.createdAt)}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </SheetPanel>
          ) : (
            <>
              <SheetPanel className="space-y-6">
                <section>
                  <div className="flex items-center gap-3">
                    <label
                      className="group/project-icon relative flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-border/70 bg-muted/35 transition-colors hover:border-border hover:bg-muted/55"
                      aria-label="Choose project icon image"
                    >
                      {projectRenameTarget ? (
                        <ProjectFavicon
                          environmentId={projectRenameTarget.environmentId}
                          cwd={projectRenameTarget.workspaceRoot}
                          className="size-9 rounded-lg"
                        />
                      ) : (
                        <FolderIcon className="size-6 text-muted-foreground" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70 opacity-0 transition-opacity group-hover/project-icon:opacity-100 group-focus-within/project-icon:opacity-100">
                        <ImageIcon className="size-5 text-foreground" />
                      </span>
                      <input
                        ref={projectIconInputRef}
                        aria-label="Choose project icon image"
                        accept="image/*"
                        className="sr-only"
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) {
                            void submitProjectIcon(file);
                          }
                        }}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <input
                        aria-label="Project title"
                        className="-ml-1 h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted/45 focus:border-ring focus:bg-background focus:ring-[3px] focus:ring-ring/50"
                        value={projectRenameTitle}
                        onChange={(event) => setProjectRenameTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submitProjectRename();
                          }
                        }}
                      />
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {projectRenameTarget?.environmentLabel ?? "Local environment"}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <FolderIcon className="size-4 text-muted-foreground" />
                    File directory
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                    <div className="break-all text-sm text-foreground">
                      {projectRenameTarget?.workspaceRoot ?? "No directory connected"}
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <GitBranchIcon className="size-4 text-muted-foreground" />
                    Git repository
                  </div>
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/25 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {projectDetailsRepoLabel}
                        </div>
                        <div className="mt-1 break-all text-xs text-muted-foreground">
                          {projectDetailsRepoRemote}
                        </div>
                      </div>
                      {projectDetailsGitStatus.data?.refName ? (
                        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {projectDetailsGitStatus.data.refName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>

                <div className="pt-2">
                  <Button
                    className="w-full justify-between"
                    variant="outline"
                    onClick={() => setProjectDetailsView("archive")}
                  >
                    <span className="flex items-center gap-2">
                      <ArchiveIcon className="size-4" />
                      Archive chats
                    </span>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </SheetPanel>

              <SheetFooter>
                <Button variant="outline" onClick={closeProjectRenameDialog}>
                  Cancel
                </Button>
                <Button onClick={() => void submitProjectRename()}>Save</Button>
              </SheetFooter>
            </>
          )}
        </SheetPopup>
      </Sheet>
    </>
  );
});

const SidebarProjectListRow = memo(function SidebarProjectListRow(props: SidebarProjectItemProps) {
  return (
    <SidebarMenuItem className="rounded-md">
      <SidebarProjectItem {...props} />
    </SidebarMenuItem>
  );
});

type SortableProjectHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  projectGroupingMode,
  threadPreviewCount,
  onProjectSortOrderChange,
  onThreadSortOrderChange,
  onProjectGroupingModeChange,
  onThreadPreviewCountChange,
}: {
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  projectGroupingMode: SidebarProjectGroupingMode;
  threadPreviewCount: SidebarThreadPreviewCount;
  onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
  onThreadSortOrderChange: (sortOrder: SidebarThreadSortOrder) => void;
  onProjectGroupingModeChange: (mode: SidebarProjectGroupingMode) => void;
  onThreadPreviewCountChange: (count: SidebarThreadPreviewCount) => void;
}) {
  const handleThreadPreviewCountChange = useCallback(
    (nextValue: number | null) => {
      if (nextValue === null) {
        return;
      }

      const clampedValue = clampSidebarThreadPreviewCount(nextValue);
      if (clampedValue !== threadPreviewCount) {
        onThreadPreviewCountChange(clampedValue);
      }
    },
    [onThreadPreviewCountChange, threadPreviewCount],
  );

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
          }
        >
          <ArrowUpDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sidebar options</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom" className="min-w-52">
        <MenuGroup>
          <div className="px-2 py-1 sm:text-xs font-medium text-muted-foreground">
            Sort projects
          </div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => {
              onProjectSortOrderChange(value as SidebarProjectSortOrder);
            }}
          >
            {(Object.entries(SIDEBAR_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 sm:text-xs font-medium text-muted-foreground">
            Sort threads
          </div>
          <MenuRadioGroup
            value={threadSortOrder}
            onValueChange={(value) => {
              onThreadSortOrderChange(value as SidebarThreadSortOrder);
            }}
          >
            {(
              Object.entries(SIDEBAR_THREAD_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-muted-foreground sm:text-xs font-medium">
            Visible threads
          </div>
          <div className="px-2 py-1">
            <NumberField
              aria-label="Visible thread count"
              className="w-28 gap-0"
              max={MAX_SIDEBAR_THREAD_PREVIEW_COUNT}
              min={MIN_SIDEBAR_THREAD_PREVIEW_COUNT}
              onValueChange={handleThreadPreviewCountChange}
              size="sm"
              step={1}
              value={threadPreviewCount}
            >
              <NumberFieldGroup className="h-7 rounded-md sm:h-6.5">
                <NumberFieldDecrement
                  aria-label="Decrease visible thread count"
                  className="px-2 sm:px-2 [&_svg]:size-3.5"
                />
                <NumberFieldInput
                  aria-label="Visible thread count"
                  className="h-7 w-9 grow-0 px-0 text-xs leading-7 sm:h-6.5 sm:leading-6.5"
                  inputMode="numeric"
                  onKeyDownCapture={(event) => {
                    event.stopPropagation();
                  }}
                />
                <NumberFieldIncrement
                  aria-label="Increase visible thread count"
                  className="px-2 sm:px-2 [&_svg]:size-3.5"
                />
              </NumberFieldGroup>
            </NumberField>
          </div>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground sm:text-xs">
            Group projects
          </div>
          <MenuRadioGroup
            value={projectGroupingMode}
            onValueChange={(value) => {
              if (value === "repository" || value === "repository_path" || value === "separate") {
                onProjectGroupingModeChange(value);
              }
            }}
          >
            {(
              Object.entries(PROJECT_GROUPING_MODE_LABELS) as Array<
                [SidebarProjectGroupingMode, string]
              >
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortableProjectItem({
  projectId,
  disabled = false,
  children,
}: {
  projectId: string;
  disabled?: boolean;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: projectId, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative rounded-md ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

interface ProjectDragData {
  fromFolderId: string | null;
}

function projectDragData(active: { data: { current: unknown } } | null): ProjectDragData | null {
  const data = active?.data.current;
  if (data && typeof data === "object" && "fromFolderId" in data) {
    return data as ProjectDragData;
  }
  return null;
}

function DraggableProjectItem({
  projectId,
  fromFolderId = null,
  children,
}: {
  projectId: string;
  fromFolderId?: string | null;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const dragData = useMemo<ProjectDragData>(() => ({ fromFolderId }), [fromFolderId]);
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({ id: projectId, data: dragData });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`group/menu-item relative rounded-md ${isDragging ? "z-20 opacity-80" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

function SidebarProjectListDropGroup({ children }: { children: React.ReactNode }) {
  const { active, isOver, setNodeRef } = useDroppable({ id: PROJECT_LIST_DROP_ID });
  const isFolderExitTarget = isOver && projectDragData(active)?.fromFolderId != null;
  return (
    <SidebarGroup
      ref={setNodeRef}
      className={`px-2 py-2 ${isFolderExitTarget ? "rounded-md ring-1 ring-primary/30" : ""}`}
    >
      {children}
    </SidebarGroup>
  );
}

const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  return isElectron ? (
    <SidebarHeader className="@container/sidebar-header drag-region h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0">
      <SidebarTrigger className="md:hidden" />
      <SidebarBrand />
    </SidebarHeader>
  ) : (
    <SidebarHeader className="@container/sidebar-header h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0">
      <SidebarTrigger className="md:hidden" />
      <SidebarBrand />
    </SidebarHeader>
  );
});

export const SidebarAppNavRail = memo(function SidebarAppNavRail({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const isSettingsRoute = pathname.startsWith("/settings");

  return (
    <nav
      aria-label="Primary navigation"
      className="flex w-[var(--app-nav-rail-width)] shrink-0 flex-col border-sidebar-border/70 border-r bg-sidebar px-[2px] py-2 text-sidebar-foreground"
    >
      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-1 py-1">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive?.(pathname) ?? false;
          const button = (
            <button
              key={item.title}
              type="button"
              aria-label={item.title}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-medium leading-none outline-hidden ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:ring-2 ${
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground/70"
              }`}
              onClick={() => {
                if (item.to) {
                  markAppNavRouteSidebarMotionInstant();
                  if (isMobile) setOpenMobile(false);
                  onNavigate?.();
                  void navigate({ to: item.to });
                }
              }}
            >
              <Icon className="size-4 shrink-0" />
              <span className="max-w-full truncate">{item.title}</span>
            </button>
          );

          return (
            <Tooltip key={item.title}>
              <TooltipTrigger render={button} />
              <TooltipPopup hidden side="right">
                {item.title}
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-auto flex justify-center pb-2">
        {isSettingsRoute ? (
          <SidebarAppNavBackButton />
        ) : (
          <PathwayOSMainSidebarAccount variant="rail" />
        )}
      </div>
    </nav>
  );
});

function SidebarAppNavBackButton() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const handleBackClick = useCallback(() => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, navigate]);

  const button = (
    <button
      type="button"
      aria-label="Back"
      className="flex min-h-12 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-medium leading-none text-muted-foreground/70 outline-hidden ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:ring-2"
      onClick={handleBackClick}
    >
      <ArrowLeftIcon className="size-4 shrink-0" />
      <span className="max-w-full truncate">Back</span>
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup hidden side="right">
        Back
      </TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand() {
  const stageLabel = useSidebarStageLabel();

  return (
    <Link
      aria-label="Go to threads"
      className="sidebar-brand ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md text-foreground outline-hidden ring-ring focus-visible:ring-2"
      to="/"
    >
      <span className="truncate text-sm font-medium tracking-tight text-muted-foreground">
        PathwayOS
      </span>
      <span className="sidebar-brand-stage shrink-0 items-center whitespace-nowrap rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
        {stageLabel}
      </span>
    </Link>
  );
}

function useSidebarStageLabel() {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;

  return resolveSidebarStageBadgeLabel({
    primaryServerVersion,
    fallbackStageLabel: APP_STAGE_LABEL,
  });
}

const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="sticky bottom-0 z-10 gap-2 bg-sidebar/86 p-2 backdrop-blur-md supports-[not_((backdrop-filter:blur(1px)))]:bg-sidebar">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
    </SidebarFooter>
  );
});

const EmailSidebarContent = memo(function EmailSidebarContent({
  commandPaletteShortcutLabel,
  onCreateNewEmail,
}: {
  commandPaletteShortcutLabel: string | null;
  onCreateNewEmail: () => void;
}) {
  const emailSource = useAtomValue(emailSourceAtom);
  return (
    <SidebarContent className="gap-0">
      <SidebarGroup className="px-2 pt-2 pb-1">
        <EmailSourceTabs />
      </SidebarGroup>
      {emailSource === "account" ? (
        <SidebarGroup className="px-2 py-1">
          <p className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
            No email account connected yet.
          </p>
        </SidebarGroup>
      ) : (
        <>
          <SidebarGroup className="px-2 pt-1 pb-1">
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className="gap-2 px-2 py-1.5 text-foreground hover:bg-accent focus-visible:ring-0"
                  data-testid="new-email-sidebar-button"
                  onClick={onCreateNewEmail}
                >
                  <SquarePenIcon className="size-3.5 text-muted-foreground/80" />
                  <span className="flex-1 truncate text-left text-xs font-medium">New Email</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <CommandDialogTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
                      data-testid="command-palette-trigger"
                    />
                  }
                >
                  <SearchIcon className="size-3.5 text-muted-foreground/70" />
                  <span className="flex-1 truncate text-left text-xs">Search</span>
                  {commandPaletteShortcutLabel ? (
                    <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                      {commandPaletteShortcutLabel}
                    </Kbd>
                  ) : null}
                </CommandDialogTrigger>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <EmailMailboxNav />
        </>
      )}
    </SidebarContent>
  );
});

interface SidebarProjectsContentProps {
  showArm64IntelBuildWarning: boolean;
  arm64IntelBuildWarningDescription: string | null;
  desktopUpdateButtonAction: "download" | "install" | "none";
  desktopUpdateButtonDisabled: boolean;
  handleDesktopUpdateButtonClick: () => void;
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  projectGroupingMode: SidebarProjectGroupingMode;
  threadPreviewCount: SidebarThreadPreviewCount;
  updateSettings: ReturnType<typeof useUpdateClientSettings>;
  openAddProject: () => void;
  isManualProjectSorting: boolean;
  projectDnDSensors: ReturnType<typeof useSensors>;
  projectCollisionDetection: CollisionDetection;
  handleProjectDragStart: (event: DragStartEvent) => void;
  handleProjectDragEnd: (event: DragEndEvent) => void;
  handleProjectDragCancel: (event: DragCancelEvent) => void;
  onCreateNewChat: () => void;
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  pinnedProjects: readonly SidebarProjectSnapshot[];
  pinnedThreads: readonly SidebarThreadSummary[];
  chatThreads: readonly SidebarThreadSummary[];
  projectListProjects: readonly SidebarProjectSnapshot[];
  folders: readonly SidebarFolderView[];
  pinnedFolders: readonly SidebarFolderView[];
  archivedProjects: readonly SidebarProjectSnapshot[];
  expandedThreadListsByProject: ReadonlySet<string>;
  activeRouteProjectKey: string | null;
  routeThreadKey: string | null;
  newChatShortcutLabel: string | null;
  newThreadShortcutLabel: string | null;
  commandPaletteShortcutLabel: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  resolveThreadProjectCwd: (thread: SidebarThreadSummary) => string | null;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  attachProjectListAutoAnimateRef: (node: HTMLElement | null) => void;
}

const SidebarProjectsContent = memo(function SidebarProjectsContent(
  props: SidebarProjectsContentProps,
) {
  const {
    showArm64IntelBuildWarning,
    arm64IntelBuildWarningDescription,
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    handleDesktopUpdateButtonClick,
    projectSortOrder,
    threadSortOrder,
    projectGroupingMode,
    threadPreviewCount,
    updateSettings,
    openAddProject,
    isManualProjectSorting,
    projectDnDSensors,
    projectCollisionDetection,
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragCancel,
    onCreateNewChat,
    handleNewThread,
    archiveThread,
    deleteThread,
    pinnedProjects,
    pinnedThreads,
    chatThreads,
    projectListProjects,
    folders,
    pinnedFolders,
    archivedProjects,
    expandedThreadListsByProject,
    activeRouteProjectKey,
    routeThreadKey,
    newChatShortcutLabel,
    newThreadShortcutLabel,
    commandPaletteShortcutLabel,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    resolveThreadProjectCwd,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    attachProjectListAutoAnimateRef,
  } = props;

  const handleProjectSortOrderChange = useCallback(
    (sortOrder: SidebarProjectSortOrder) => {
      updateSettings({ sidebarProjectSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleThreadSortOrderChange = useCallback(
    (sortOrder: SidebarThreadSortOrder) => {
      updateSettings({ sidebarThreadSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleProjectGroupingModeChange = useCallback(
    (groupingMode: SidebarProjectGroupingMode) => {
      updateSettings({ sidebarProjectGroupingMode: groupingMode });
    },
    [updateSettings],
  );
  const handleThreadPreviewCountChange = useCallback(
    (count: SidebarThreadPreviewCount) => {
      updateSettings({ sidebarThreadPreviewCount: count });
    },
    [updateSettings],
  );

  const addProjectFolder = useUiStateStore((state) => state.addProjectFolder);
  const updateProjectFolder = useUiStateStore((state) => state.updateProjectFolder);
  const removeProjectFolder = useUiStateStore((state) => state.removeProjectFolder);
  const deleteProject = useAtomCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const [folderDetailsTarget, setFolderDetailsTarget] = useState<SidebarProjectFolder | null>(null);
  const [removeFolderTarget, setRemoveFolderTarget] = useState<SidebarRemoveFolderTarget | null>(
    null,
  );

  const handleAddFolder = useCallback(() => {
    const folder: SidebarProjectFolder = {
      id: randomUUID(),
      name: "New folder",
      icon: "folder",
      color: "default",
      projectKeys: [],
    };
    addProjectFolder(folder);
    setFolderDetailsTarget(folder);
  }, [addProjectFolder]);

  const handleEditFolder = useCallback((folder: SidebarProjectFolder) => {
    setFolderDetailsTarget(folder);
  }, []);

  const handleSaveFolderDetails = useCallback(
    (folderId: string, patch: { name: string; icon: string; color: string }) => {
      updateProjectFolder(folderId, patch);
    },
    [updateProjectFolder],
  );

  const handleRemoveFolderRequest = useCallback((target: SidebarRemoveFolderTarget) => {
    setRemoveFolderTarget(target);
  }, []);

  const handleRemoveFolderOnly = useCallback(
    (folder: SidebarProjectFolder) => {
      removeProjectFolder(folder.id);
    },
    [removeProjectFolder],
  );

  const handleRemoveFolderAndProjects = useCallback(
    (target: SidebarRemoveFolderTarget) => {
      void (async () => {
        const members = target.projects.flatMap((project) => project.memberProjects);
        const failedTitles: string[] = [];
        for (const member of members) {
          const result = await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          });
          if (result._tag === "Failure") {
            if (!isAtomCommandInterrupted(result)) {
              failedTitles.push(member.title);
            }
            continue;
          }
          const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
          const draftStore = useComposerDraftStore.getState();
          const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
          if (projectDraftThread) {
            draftStore.clearDraftThread(projectDraftThread.draftId);
          }
          draftStore.clearProjectDraftThreadId(memberProjectRef);
        }
        if (failedTitles.length > 0) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not remove some projects",
              description: `Failed to remove ${failedTitles.join(", ")}. The folder was kept.`,
            }),
          );
          return;
        }
        removeProjectFolder(target.folder.id);
      })();
    },
    [deleteProject, removeProjectFolder],
  );

  return (
    <DndContext
      sensors={projectDnDSensors}
      collisionDetection={projectCollisionDetection}
      modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
      onDragStart={handleProjectDragStart}
      onDragEnd={handleProjectDragEnd}
      onDragCancel={handleProjectDragCancel}
    >
      <SidebarContent className="gap-0">
        <SidebarGroup className="px-2 pt-2 pb-1">
          <SidebarMenu className="gap-1.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                className="gap-2 px-2 py-1.5 text-foreground hover:bg-accent focus-visible:ring-0"
                data-testid="new-chat-sidebar-button"
                onClick={onCreateNewChat}
              >
                <SquarePenIcon className="size-3.5 text-muted-foreground/80" />
                <span className="flex-1 truncate text-left text-xs font-medium">New Chat</span>
                {newChatShortcutLabel ? (
                  <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                    {newChatShortcutLabel}
                  </Kbd>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <CommandDialogTrigger
                render={
                  <SidebarMenuButton
                    size="sm"
                    className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
                    data-testid="command-palette-trigger"
                  />
                }
              >
                <SearchIcon className="size-3.5 text-muted-foreground/70" />
                <span className="flex-1 truncate text-left text-xs">Search</span>
                {commandPaletteShortcutLabel ? (
                  <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                    {commandPaletteShortcutLabel}
                  </Kbd>
                ) : null}
              </CommandDialogTrigger>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
          <SidebarGroup className="px-2 pt-2 pb-0">
            <Alert variant="warning" className="rounded-2xl border-warning/40 bg-warning/8">
              <TriangleAlertIcon />
              <AlertTitle>Intel build on Apple Silicon</AlertTitle>
              <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
              {desktopUpdateButtonAction !== "none" ? (
                <AlertAction>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={desktopUpdateButtonDisabled}
                    onClick={handleDesktopUpdateButtonClick}
                  >
                    {desktopUpdateButtonAction === "download"
                      ? "Download ARM build"
                      : "Install ARM build"}
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          </SidebarGroup>
        ) : null}
        <SidebarPinnedSection
          folders={pinnedFolders}
          onEditFolder={handleEditFolder}
          onRemoveFolder={handleRemoveFolderRequest}
          projects={pinnedProjects}
          threads={pinnedThreads}
          activeRouteProjectKey={activeRouteProjectKey}
          activeRouteThreadKey={routeThreadKey}
          newThreadShortcutLabel={newThreadShortcutLabel}
          handleNewThread={handleNewThread}
          archiveThread={archiveThread}
          deleteThread={deleteThread}
          threadJumpLabelByKey={threadJumpLabelByKey}
          expandedThreadListsByProject={expandedThreadListsByProject}
          attachProjectListAutoAnimateRef={attachProjectListAutoAnimateRef}
          attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
          resolveThreadProjectCwd={resolveThreadProjectCwd}
          expandThreadListForProject={expandThreadListForProject}
          collapseThreadListForProject={collapseThreadListForProject}
          dragInProgressRef={dragInProgressRef}
          suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
          suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
        />
        <SidebarThreadSection
          title="Chat"
          threads={chatThreads}
          activeRouteThreadKey={routeThreadKey}
          archiveThread={archiveThread}
          deleteThread={deleteThread}
          threadJumpLabelByKey={threadJumpLabelByKey}
          attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
          resolveThreadProjectCwd={resolveThreadProjectCwd}
        />
        <SidebarProjectListDropGroup>
          <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Projects
            </span>
            <div className="flex items-center gap-1">
              <ProjectSortMenu
                projectSortOrder={projectSortOrder}
                threadSortOrder={threadSortOrder}
                projectGroupingMode={projectGroupingMode}
                threadPreviewCount={threadPreviewCount}
                onProjectSortOrderChange={handleProjectSortOrderChange}
                onThreadSortOrderChange={handleThreadSortOrderChange}
                onProjectGroupingModeChange={handleProjectGroupingModeChange}
                onThreadPreviewCountChange={handleThreadPreviewCountChange}
              />
              <Menu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <MenuTrigger
                        aria-label="Add project or folder"
                        data-testid="sidebar-add-project-trigger"
                        className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                      />
                    }
                  >
                    <PlusIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="right">Add project or folder</TooltipPopup>
                </Tooltip>
                <MenuPopup align="end" className="min-w-44" side="bottom">
                  <MenuItem data-testid="sidebar-add-project-menu-item" onClick={openAddProject}>
                    <FolderPlusIcon className="size-4" />
                    Add project
                  </MenuItem>
                  <MenuItem data-testid="sidebar-add-folder-menu-item" onClick={handleAddFolder}>
                    <FoldersIcon className="size-4" />
                    Add folder
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </div>
          </div>

          {folders.length > 0 ? (
            <SidebarMenu className="mb-0.5 gap-0.5">
              {folders.map((view) => (
                <SidebarFolderRow
                  key={view.folder.id}
                  view={view}
                  pinned={false}
                  onEditFolder={handleEditFolder}
                  onRemoveFolder={handleRemoveFolderRequest}
                  expandedThreadListsByProject={expandedThreadListsByProject}
                  activeRouteProjectKey={activeRouteProjectKey}
                  activeRouteThreadKey={routeThreadKey}
                  newThreadShortcutLabel={newThreadShortcutLabel}
                  handleNewThread={handleNewThread}
                  archiveThread={archiveThread}
                  deleteThread={deleteThread}
                  threadJumpLabelByKey={threadJumpLabelByKey}
                  attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                  expandThreadListForProject={expandThreadListForProject}
                  collapseThreadListForProject={collapseThreadListForProject}
                  dragInProgressRef={dragInProgressRef}
                  suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                  suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                />
              ))}
            </SidebarMenu>
          ) : null}

          {projectListProjects.length === 0 && folders.length === 0 ? (
            <SidebarMenu className="mt-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className="w-full gap-2 border border-dashed border-border/70 px-2 py-1.5 text-muted-foreground/80 hover:border-border hover:bg-accent hover:text-foreground focus-visible:ring-0"
                  data-testid="sidebar-empty-project-list-add-button"
                  onClick={openAddProject}
                >
                  <FolderPlusIcon className="size-3.5 text-muted-foreground/80" />
                  <span className="flex-1 truncate text-left text-xs font-medium">Add project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : isManualProjectSorting ? (
            <SidebarMenu>
              <SortableContext
                items={projectListProjects.map((project) => project.projectKey)}
                strategy={verticalListSortingStrategy}
              >
                {projectListProjects.map((project) => (
                  <SortableProjectItem key={project.projectKey} projectId={project.projectKey}>
                    {(dragHandleProps) => (
                      <SidebarProjectItem
                        project={project}
                        isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                        activeRouteThreadKey={
                          activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                        }
                        newThreadShortcutLabel={newThreadShortcutLabel}
                        handleNewThread={handleNewThread}
                        archiveThread={archiveThread}
                        deleteThread={deleteThread}
                        threadJumpLabelByKey={threadJumpLabelByKey}
                        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                        expandThreadListForProject={expandThreadListForProject}
                        collapseThreadListForProject={collapseThreadListForProject}
                        dragInProgressRef={dragInProgressRef}
                        suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                        suppressProjectClickForContextMenuRef={
                          suppressProjectClickForContextMenuRef
                        }
                        isManualProjectSorting={isManualProjectSorting}
                        dragHandleProps={dragHandleProps}
                      />
                    )}
                  </SortableProjectItem>
                ))}
              </SortableContext>
            </SidebarMenu>
          ) : (
            <SidebarMenu ref={attachProjectListAutoAnimateRef}>
              {projectListProjects.map((project) => (
                <DraggableProjectItem key={project.projectKey} projectId={project.projectKey}>
                  {(dragHandleProps) => (
                    <SidebarProjectItem
                      project={project}
                      isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                      activeRouteThreadKey={
                        activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                      }
                      newThreadShortcutLabel={newThreadShortcutLabel}
                      handleNewThread={handleNewThread}
                      archiveThread={archiveThread}
                      deleteThread={deleteThread}
                      threadJumpLabelByKey={threadJumpLabelByKey}
                      attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                      expandThreadListForProject={expandThreadListForProject}
                      collapseThreadListForProject={collapseThreadListForProject}
                      dragInProgressRef={dragInProgressRef}
                      suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                      suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                      isManualProjectSorting={isManualProjectSorting}
                      dragHandleProps={dragHandleProps}
                    />
                  )}
                </DraggableProjectItem>
              ))}
            </SidebarMenu>
          )}

          {archivedProjects.length > 0 ? (
            <SidebarArchivedProjectsGroup projects={archivedProjects} />
          ) : null}
        </SidebarProjectListDropGroup>

        <SidebarFolderDetailsSheet
          folder={folderDetailsTarget}
          onOpenChange={(open) => {
            if (!open) {
              setFolderDetailsTarget(null);
            }
          }}
          onSave={handleSaveFolderDetails}
        />
        <SidebarRemoveFolderDialog
          target={removeFolderTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRemoveFolderTarget(null);
            }
          }}
          onRemoveFolderOnly={handleRemoveFolderOnly}
          onRemoveFolderAndProjects={handleRemoveFolderAndProjects}
        />
      </SidebarContent>
    </DndContext>
  );
});

export default function Sidebar() {
  const localProjects = useProjects();
  const localSidebarThreads = useThreadShells();
  const cloudWorkspace = useCloudWorkspace();
  const mergedWorkspace = useMemo(
    () =>
      mergeCloudWorkspace({
        localProjects,
        localThreads: localSidebarThreads,
        cloudProjects: cloudWorkspace.projects,
        cloudThreads: cloudWorkspace.threads,
      }),
    [cloudWorkspace.projects, cloudWorkspace.threads, localProjects, localSidebarThreads],
  );
  const projects = mergedWorkspace.projects;
  const sidebarThreads = mergedWorkspace.threads;
  const projectExpandedById = useUiStateStore((store) => store.projectExpandedById);
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const pinnedProjectIds = useUiStateStore((store) => store.pinnedProjectIds);
  const projectFolders = useUiStateStore((store) => store.projectFolders);
  const pinnedFolderIds = useUiStateStore((store) => store.pinnedFolderIds);
  const archivedProjectKeys = useUiStateStore((store) => store.archivedProjectKeys);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
  const setProjectFolderMembership = useUiStateStore((store) => store.setProjectFolderMembership);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isOnSettings = pathname.startsWith("/settings");
  const isOnIssues = pathname.startsWith("/issues");
  const showSecondarySidebar = shouldShowSecondarySidebar(pathname);
  const showChatSidebar = isChatSurfacePathname(pathname);
  const showEmailSidebar = isEmailSurfacePathname(pathname);
  const sidebarThreadSortOrder = useClientSettings((s) => s.sidebarThreadSortOrder);
  const sidebarProjectSortOrder = useClientSettings((s) => s.sidebarProjectSortOrder);
  const sidebarProjectGroupingMode = useClientSettings((s) => s.sidebarProjectGroupingMode);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const sidebarThreadPreviewCount = useClientSettings((s) => s.sidebarThreadPreviewCount);
  const updateSettings = useUpdateClientSettings();
  const handleNewThread = useNewThreadHandler();
  const { archiveThread, deleteThread } = useThreadActions();
  const { isMobile, setOpenMobile } = useSidebar();
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openAddProjectCommandPalette = useOpenAddProjectCommandPalette();
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const suppressProjectClickForContextMenuRef = useRef(false);
  const desktopUpdateState = useDesktopUpdateState();
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const platform = navigator.platform;
  const shortcutModifiers = useShortcutModifierState();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
  }, [projectOrder, projects]);

  // Build a mapping from physical project key → logical project key for
  // cross-environment grouping.  Projects that share a repositoryIdentity
  // canonicalKey are treated as one logical project in the sidebar.
  const physicalToLogicalKey = useMemo(() => {
    return buildPhysicalToLogicalProjectKeyMap({
      projects: orderedProjects,
      settings: projectGroupingSettings,
    });
  }, [orderedProjects, projectGroupingSettings]);
  const projectPhysicalKeyByScopedRef = useMemo(
    () =>
      new Map(
        orderedProjects.map((project) => [
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
          derivePhysicalProjectKey(project),
        ]),
      ),
    [orderedProjects],
  );
  const projectWorkspaceRootByScopedRef = useMemo(
    () =>
      new Map(
        orderedProjects.map((project) => [
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
          project.workspaceRoot,
        ]),
      ),
    [orderedProjects],
  );

  const sidebarProjects = useMemo<SidebarProjectSnapshot[]>(() => {
    return buildSidebarProjectSnapshots({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
    });
  }, [environmentLabelById, orderedProjects, projectGroupingSettings, primaryEnvironmentId]);

  const sidebarProjectByKey = useMemo(
    () => new Map(sidebarProjects.map((project) => [project.projectKey, project] as const)),
    [sidebarProjects],
  );
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Resolve the active route's project key to a logical key so it matches the
  // sidebar's grouped project entries.
  const activeRouteProjectKey = useMemo(() => {
    if (!routeThreadKey) {
      return null;
    }
    const activeThread = sidebarThreadByKey.get(routeThreadKey);
    if (!activeThread) return null;
    return resolveThreadLogicalProjectKey({
      thread: activeThread,
      physicalToLogicalKey,
      projectPhysicalKeyByScopedRef,
    });
  }, [routeThreadKey, sidebarThreadByKey, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);

  // Group threads by logical project key so all threads from grouped projects
  // are displayed together.
  const threadsByProjectKey = useMemo(() => {
    const next = new Map<string, SidebarThreadSummary[]>();
    for (const thread of sidebarThreads) {
      const logicalKey = resolveThreadLogicalProjectKey({
        thread,
        physicalToLogicalKey,
        projectPhysicalKeyByScopedRef,
      });
      if (!logicalKey) {
        continue;
      }
      const existing = next.get(logicalKey);
      if (existing) {
        existing.push(thread);
      } else {
        next.set(logicalKey, [thread]);
      }
    }
    return next;
  }, [sidebarThreads, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);
  const getCurrentSidebarShortcutContext = useCallback(
    () => ({
      terminalFocus: isTerminalFocused(),
      terminalOpen: routeTerminalOpen,
      modelPickerOpen: isModelPickerOpen(),
    }),
    [routeTerminalOpen],
  );
  const newThreadShortcutLabelOptions = useMemo(
    () => ({
      platform,
      context: {
        terminalFocus: false,
        terminalOpen: false,
      },
    }),
    [platform],
  );
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", newThreadShortcutLabelOptions) ??
    shortcutLabelForCommand(keybindings, "chat.new", newThreadShortcutLabelOptions);

  const handleCreateNewChat = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/chat" });
  }, [isMobile, navigate, setOpenMobile]);
  const handleCreateNewEmail = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/email" });
  }, [isMobile, navigate, setOpenMobile]);

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, navigate, setOpenMobile, setSelectionAnchor],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    // Folder rows win over the project rows and list container around them.
    const folderCollisions = pointerCollisions.filter(
      (collision) => folderIdFromDropId(String(collision.id)) !== null,
    );
    if (folderCollisions.length > 0) {
      return folderCollisions;
    }
    const rowCollisions = pointerCollisions.filter(
      (collision) => collision.id !== PROJECT_LIST_DROP_ID,
    );
    if (rowCollisions.length > 0) {
      return rowCollisions;
    }
    if (projectDragData(args.active)?.fromFolderId != null) {
      // A project leaving a folder must be dropped precisely on a target;
      // falling back to the nearest row would kick it out of its folder on
      // any stray drop.
      return pointerCollisions;
    }
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) =>
          container.id !== PROJECT_LIST_DROP_ID &&
          folderIdFromDropId(String(container.id)) === null,
      ),
    });
  }, []);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over) return;
      const activeProject = sidebarProjectByKey.get(String(active.id));
      if (!activeProject) return;
      const activeProjectKeys = projectPinPreferenceKeys(activeProject);
      const activeFolderId = resolveProjectFolderId(projectFolders, activeProjectKeys);
      const overId = String(over.id);
      const targetFolderId = folderIdFromDropId(overId);
      if (targetFolderId !== null) {
        if (targetFolderId !== activeFolderId) {
          setProjectFolderMembership(activeProjectKeys, targetFolderId);
        }
        return;
      }
      // Dropped on the top-level project list (the group itself or a row in it).
      if (activeFolderId !== null) {
        setProjectFolderMembership(activeProjectKeys, null);
      }
      if (
        sidebarProjectSortOrder !== "manual" ||
        overId === PROJECT_LIST_DROP_ID ||
        active.id === over.id
      ) {
        return;
      }
      const overProject = sidebarProjectByKey.get(overId);
      if (!overProject) return;
      const activeMemberKeys = activeProject.memberProjects.map(
        (member) => member.physicalProjectKey,
      );
      const overMemberKeys = overProject.memberProjects.map((member) => member.physicalProjectKey);
      reorderProjects(orderedProjects.map(getProjectOrderKey), activeMemberKeys, overMemberKeys);
    },
    [
      orderedProjects,
      projectFolders,
      reorderProjects,
      setProjectFolderMembership,
      sidebarProjectByKey,
      sidebarProjectSortOrder,
    ],
  );

  const handleProjectDragStart = useCallback((_event: DragStartEvent) => {
    dragInProgressRef.current = true;
    suppressProjectClickAfterDragRef.current = true;
  }, []);

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const animatedProjectListsRef = useRef(new WeakSet<HTMLElement>());
  const attachProjectListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedProjectListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedProjectListsRef.current.add(node);
  }, []);

  const animatedThreadListsRef = useRef(new WeakSet<HTMLElement>());
  const attachThreadListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedThreadListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedThreadListsRef.current.add(node);
  }, []);

  const visibleThreads = useMemo(
    () => sidebarThreads.filter((thread) => thread.archivedAt === null),
    [sidebarThreads],
  );
  const resolveThreadProjectCwd = useCallback(
    (thread: SidebarThreadSummary) => {
      if (thread.projectId === null) {
        return null;
      }
      return (
        projectWorkspaceRootByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? null
      );
    },
    [projectWorkspaceRootByScopedRef],
  );
  const pinnedThreads = useMemo(
    () => sortThreads(visibleThreads.filter(isPinnedSidebarThread), sidebarThreadSortOrder),
    [sidebarThreadSortOrder, visibleThreads],
  );
  const pinnedThreadKeys = useMemo(
    () => new Set(pinnedThreads.map(getSidebarThreadKey)),
    [pinnedThreads],
  );
  const chatThreads = useMemo(
    () =>
      sortThreads(
        visibleThreads.filter((thread) => {
          if (pinnedThreadKeys.has(getSidebarThreadKey(thread))) {
            return false;
          }
          return (
            resolveThreadLogicalProjectKey({
              thread,
              physicalToLogicalKey,
              projectPhysicalKeyByScopedRef,
            }) === null
          );
        }),
        sidebarThreadSortOrder,
      ),
    [
      physicalToLogicalKey,
      pinnedThreadKeys,
      projectPhysicalKeyByScopedRef,
      sidebarThreadSortOrder,
      visibleThreads,
    ],
  );
  const sortedProjects = useMemo(() => {
    const sortableProjects = sidebarProjects.map((project) => ({
      ...project,
      id: project.projectKey,
    }));
    const sortableThreads = visibleThreads.flatMap((thread) => {
      const logicalKey = resolveThreadLogicalProjectKey({
        thread,
        physicalToLogicalKey,
        projectPhysicalKeyByScopedRef,
      });
      return logicalKey ? [{ ...thread, projectId: logicalKey as ProjectId }] : [];
    });
    return sortProjectsForSidebar(
      sortableProjects,
      sortableThreads,
      sidebarProjectSortOrder,
    ).flatMap((project) => {
      const resolvedProject = sidebarProjectByKey.get(project.id);
      return resolvedProject ? [resolvedProject] : [];
    });
  }, [
    sidebarProjectSortOrder,
    physicalToLogicalKey,
    projectPhysicalKeyByScopedRef,
    sidebarProjectByKey,
    sidebarProjects,
    visibleThreads,
  ]);
  const isSidebarProjectPinned = useCallback(
    (project: SidebarProjectSnapshot) =>
      resolveProjectPinned(pinnedProjectIds, projectPinPreferenceKeys(project)),
    [pinnedProjectIds],
  );
  const isSidebarProjectArchived = useCallback(
    (project: SidebarProjectSnapshot) =>
      resolveProjectArchived(archivedProjectKeys, projectPinPreferenceKeys(project)),
    [archivedProjectKeys],
  );
  const visibleSortedProjects = useMemo(
    () => sortedProjects.filter((project) => !isSidebarProjectArchived(project)),
    [isSidebarProjectArchived, sortedProjects],
  );
  const archivedProjects = useMemo(
    () => sortedProjects.filter(isSidebarProjectArchived),
    [isSidebarProjectArchived, sortedProjects],
  );
  const pinnedProjects = useMemo(
    () => visibleSortedProjects.filter(isSidebarProjectPinned),
    [isSidebarProjectPinned, visibleSortedProjects],
  );
  // Folder views are built from unpinned projects only: an individually
  // pinned project shows in the Pinned section instead of inside its folder.
  const { folderViews, folderedProjectKeys } = useMemo(
    () =>
      buildSidebarFolderViews({
        folders: projectFolders,
        projects: visibleSortedProjects.filter((project) => !isSidebarProjectPinned(project)),
      }),
    [isSidebarProjectPinned, projectFolders, visibleSortedProjects],
  );
  const pinnedFolderIdSet = useMemo(() => new Set(pinnedFolderIds), [pinnedFolderIds]);
  const pinnedFolders = useMemo(
    () => folderViews.filter((view) => pinnedFolderIdSet.has(view.folder.id)),
    [folderViews, pinnedFolderIdSet],
  );
  const listFolders = useMemo(
    () => folderViews.filter((view) => !pinnedFolderIdSet.has(view.folder.id)),
    [folderViews, pinnedFolderIdSet],
  );
  const projectListProjects = useMemo(
    () =>
      visibleSortedProjects.filter(
        (project) =>
          !isSidebarProjectPinned(project) && !folderedProjectKeys.has(project.projectKey),
      ),
    [folderedProjectKeys, isSidebarProjectPinned, visibleSortedProjects],
  );
  const isManualProjectSorting = sidebarProjectSortOrder === "manual";
  const visibleSidebarThreadKeys = useMemo(() => {
    const getProjectThreadKeys = (projects: readonly SidebarProjectSnapshot[]) =>
      projects.flatMap((project) => {
        const projectThreads = sortThreads(
          (threadsByProjectKey.get(project.projectKey) ?? []).filter(
            (thread) => thread.archivedAt === null,
          ),
          sidebarThreadSortOrder,
        );
        const projectExpanded = resolveProjectExpanded(
          projectExpandedById,
          projectExpansionPreferenceKeys(project),
        );
        const activeThreadKey = routeThreadKey ?? undefined;
        const pinnedCollapsedThread =
          !projectExpanded && activeThreadKey
            ? (projectThreads.find(
                (thread) =>
                  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
                  activeThreadKey,
              ) ?? null)
            : null;
        const shouldShowThreadPanel = projectExpanded || pinnedCollapsedThread !== null;
        if (!shouldShowThreadPanel) {
          return [];
        }
        const isThreadListExpanded = expandedThreadListsByProject.has(project.projectKey);
        const hasOverflowingThreads = projectThreads.length > sidebarThreadPreviewCount;
        const previewThreads =
          isThreadListExpanded || !hasOverflowingThreads
            ? projectThreads
            : projectThreads.slice(0, sidebarThreadPreviewCount);
        const renderedThreads = pinnedCollapsedThread ? [pinnedCollapsedThread] : previewThreads;
        return renderedThreads.map(getSidebarThreadKey);
      });
    const getExpandedFolderProjects = (views: readonly SidebarFolderView[]) =>
      views.flatMap((view) =>
        resolveProjectExpanded(projectExpandedById, [folderExpansionKey(view.folder.id)])
          ? view.projects
          : [],
      );
    return [
      ...getProjectThreadKeys(getExpandedFolderProjects(pinnedFolders)),
      ...getProjectThreadKeys(pinnedProjects),
      ...pinnedThreads.map(getSidebarThreadKey),
      ...chatThreads.map(getSidebarThreadKey),
      ...getProjectThreadKeys(getExpandedFolderProjects(listFolders)),
      ...getProjectThreadKeys(projectListProjects),
    ];
  }, [
    chatThreads,
    sidebarThreadSortOrder,
    sidebarThreadPreviewCount,
    expandedThreadListsByProject,
    listFolders,
    pinnedFolders,
    pinnedProjects,
    pinnedThreads,
    projectListProjects,
    projectExpandedById,
    routeThreadKey,
    threadsByProjectKey,
  ]);
  const threadJumpCommandByKey = useMemo(() => {
    const mapping = new Map<string, NonNullable<ReturnType<typeof threadJumpCommandForIndex>>>();
    for (const [visibleThreadIndex, threadKey] of visibleSidebarThreadKeys.entries()) {
      const jumpCommand = threadJumpCommandForIndex(visibleThreadIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(threadKey, jumpCommand);
    }

    return mapping;
  }, [visibleSidebarThreadKeys]);
  const threadJumpThreadKeys = useMemo(
    () => [...threadJumpCommandByKey.keys()],
    [threadJumpCommandByKey],
  );
  const sidebarShortcutContext = {
    terminalFocus: false,
    terminalOpen: routeTerminalOpen,
    modelPickerOpen: isModelPickerOpen(),
  };
  const threadJumpLabelByKey = useMemo(
    () =>
      buildThreadJumpLabelMap({
        keybindings,
        platform,
        terminalOpen: sidebarShortcutContext.terminalOpen,
        threadJumpCommandByKey,
      }),
    [keybindings, platform, sidebarShortcutContext.terminalOpen, threadJumpCommandByKey],
  );
  const shouldShowThreadJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform,
      context: sidebarShortcutContext,
    },
  );
  const visibleThreadJumpLabelByKey = showThreadJumpHints
    ? threadJumpLabelByKey
    : EMPTY_THREAD_JUMP_LABELS;
  const orderedSidebarThreadKeys = visibleSidebarThreadKeys;
  const prewarmedSidebarThreadKeys = useMemo(
    () => getSidebarThreadIdsToPrewarm(visibleSidebarThreadKeys),
    [visibleSidebarThreadKeys],
  );
  const prewarmedSidebarThreadRefs = useMemo(
    () =>
      prewarmedSidebarThreadKeys.flatMap((threadKey) => {
        const ref = parseScopedThreadKey(threadKey);
        return ref ? [ref] : [];
      }),
    [prewarmedSidebarThreadKeys],
  );

  useEffect(() => {
    updateThreadJumpHintsVisibility(shouldShowThreadJumpHintsNow);
  }, [shouldShowThreadJumpHintsNow, updateThreadJumpHintsVisibility]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutContext = getCurrentSidebarShortcutContext();

      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: shortcutContext,
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        const targetThreadKey = resolveAdjacentThreadId({
          threadIds: orderedSidebarThreadKeys,
          currentThreadId: routeThreadKey,
          direction: traversalDirection,
        });
        if (!targetThreadKey) {
          return;
        }
        const targetThread = sidebarThreadByKey.get(targetThreadKey);
        if (!targetThread) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return;
      }

      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetThreadKey = threadJumpThreadKeys[jumpIndex];
      if (!targetThreadKey) {
        return;
      }
      const targetThread = sidebarThreadByKey.get(targetThreadKey);
      if (!targetThread) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
    };

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    getCurrentSidebarShortcutContext,
    keybindings,
    navigateToThread,
    orderedSidebarThreadKeys,
    platform,
    routeThreadKey,
    sidebarThreadByKey,
    threadJumpThreadKeys,
  ]);

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (!useThreadSelectionStore.getState().hasSelection()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection]);

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState)
      : null;
  const commandPaletteShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "commandPalette.toggle",
    newThreadShortcutLabelOptions,
  );
  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            toastManager.add({
              type: "success",
              title: "Update downloaded",
              description: "Restart the app from the update button to install it.",
            });
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not download update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not start update download",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      const confirmed = window.confirm(
        getDesktopUpdateInstallConfirmationMessage(desktopUpdateState),
      );
      if (!confirmed) return;
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
    }
  }, [desktopUpdateButtonAction, desktopUpdateButtonDisabled, desktopUpdateState]);

  const expandThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectKey)) return current;
      const next = new Set(current);
      next.add(projectKey);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectKey)) return current;
      const next = new Set(current);
      next.delete(projectKey);
      return next;
    });
  }, []);

  return (
    <>
      {prewarmedSidebarThreadRefs.map((threadRef) => (
        <SidebarThreadDetailPrewarmer key={scopedThreadKey(threadRef)} threadRef={threadRef} />
      ))}
      <div className="flex min-h-0 flex-1">
        <SidebarAppNavRail pathname={pathname} />
        {showSecondarySidebar ? (
          <div className="flex min-w-60 flex-1 flex-col group-data-[state=collapsed]:hidden md:min-w-0">
            {showChatSidebar || showEmailSidebar ? (
              <SidebarChromeHeader isElectron={isElectron} />
            ) : null}

            {isOnSettings ? (
              <SettingsSidebarNav pathname={pathname} />
            ) : isOnIssues ? (
              <SavedViewsRail />
            ) : showEmailSidebar ? (
              <>
                <EmailSidebarContent
                  commandPaletteShortcutLabel={commandPaletteShortcutLabel}
                  onCreateNewEmail={handleCreateNewEmail}
                />

                <SidebarChromeFooter />
              </>
            ) : (
              <>
                <SidebarProjectsContent
                  showArm64IntelBuildWarning={showArm64IntelBuildWarning}
                  arm64IntelBuildWarningDescription={arm64IntelBuildWarningDescription}
                  desktopUpdateButtonAction={desktopUpdateButtonAction}
                  desktopUpdateButtonDisabled={desktopUpdateButtonDisabled}
                  handleDesktopUpdateButtonClick={handleDesktopUpdateButtonClick}
                  projectSortOrder={sidebarProjectSortOrder}
                  threadSortOrder={sidebarThreadSortOrder}
                  projectGroupingMode={sidebarProjectGroupingMode}
                  threadPreviewCount={sidebarThreadPreviewCount}
                  updateSettings={updateSettings}
                  openAddProject={openAddProjectCommandPalette}
                  isManualProjectSorting={isManualProjectSorting}
                  projectDnDSensors={projectDnDSensors}
                  projectCollisionDetection={projectCollisionDetection}
                  handleProjectDragStart={handleProjectDragStart}
                  handleProjectDragEnd={handleProjectDragEnd}
                  handleProjectDragCancel={handleProjectDragCancel}
                  onCreateNewChat={handleCreateNewChat}
                  handleNewThread={handleNewThread}
                  archiveThread={archiveThread}
                  deleteThread={deleteThread}
                  pinnedProjects={pinnedProjects}
                  pinnedThreads={pinnedThreads}
                  chatThreads={chatThreads}
                  projectListProjects={projectListProjects}
                  folders={listFolders}
                  pinnedFolders={pinnedFolders}
                  archivedProjects={archivedProjects}
                  expandedThreadListsByProject={expandedThreadListsByProject}
                  activeRouteProjectKey={activeRouteProjectKey}
                  routeThreadKey={routeThreadKey}
                  newChatShortcutLabel={null}
                  newThreadShortcutLabel={newThreadShortcutLabel}
                  commandPaletteShortcutLabel={commandPaletteShortcutLabel}
                  threadJumpLabelByKey={visibleThreadJumpLabelByKey}
                  attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                  resolveThreadProjectCwd={resolveThreadProjectCwd}
                  expandThreadListForProject={expandThreadListForProject}
                  collapseThreadListForProject={collapseThreadListForProject}
                  dragInProgressRef={dragInProgressRef}
                  suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                  suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                  attachProjectListAutoAnimateRef={attachProjectListAutoAnimateRef}
                />

                <SidebarChromeFooter />
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
