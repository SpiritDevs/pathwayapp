import {
  DEFAULT_RUNTIME_MODE,
  ThreadId,
  type ModelSelection,
  type ProviderInteractionMode,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type RuntimeMode,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@pathwayos/contracts";
import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@pathwayos/client-runtime/environment";
import type { EnvironmentProject } from "@pathwayos/client-runtime/state/models";
import {
  createModelSelection,
  getProviderOptionBooleanSelectionValue,
  getProviderOptionStringSelectionValue,
  normalizeModelSlug,
} from "@pathwayos/shared/model";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@pathwayos/shared/projectScripts";
import { nextTerminalId } from "@pathwayos/shared/terminalLabels";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CircleXIcon,
  CloudIcon,
  FileDiffIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  Globe2Icon,
  ListChecksIcon,
  MailIcon,
  MessageCircleIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  PresentationIcon,
  SearchIcon,
  SparklesIcon,
  TableIcon,
  TargetIcon,
  TerminalSquareIcon,
  type LucideIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

import {
  useComposerDraftStore,
  type DraftId,
  type DraftThreadEnvMode,
} from "../composerDraftStore";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import { BranchToolbarEnvModeSelector } from "./BranchToolbarEnvModeSelector";
import type { EnvMode } from "./BranchToolbar.logic";
import { ComposerFooterModeControls } from "./chat/ComposerFooterModeControls";
import { PanelLayoutControls } from "./chat/PanelLayoutControls";
import { usePrimarySettings } from "../hooks/useSettings";
import { newDraftId, newThreadId } from "../lib/utils";
import {
  type AppModelOption,
  getAppModelOptionsForInstance,
  resolveAppModelSelectionForInstance,
} from "../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../providerInstances";
import { useProjects } from "../state/entities";
import {
  primaryServerConfigAtom,
  primaryServerKeybindingsAtom,
  primaryServerProvidersAtom,
} from "../state/server";
import { terminalEnvironment } from "../state/terminal";
import { useAtomCommand } from "../state/use-atom-command";
import { DEFAULT_INTERACTION_MODE, type ThreadTerminalGroup } from "../types";
import { ProviderModelPicker } from "./chat/ProviderModelPicker";
import { getComposerProviderState } from "./chat/composerProviderState";
import { shouldRenderTraitsControls, TraitsPicker } from "./chat/TraitsPicker";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "./ui/menu";
import { Separator } from "./ui/separator";
import { SidebarInset } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useOpenAddProjectCommandPalette } from "../commandPaletteContext";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { cn } from "../lib/utils";
import { ProjectFavicon } from "./ProjectFavicon";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { buildDraftThreadRouteParams } from "../threadRoutes";
import { markDraftForAutoSubmit } from "../lib/draftAutoSubmit";
import { MobileWorkspaceTopbar } from "./MobileWorkspaceTopbar";

const pendingConnectionCards = [
  {
    title: "Connect messaging",
    description: "Get context from recent team discussions",
    icon: SparklesIcon,
    iconClassName: "text-[#36c5f0]",
  },
  {
    title: "Connect email",
    description: "Summarize stakeholder asks from email",
    icon: MailIcon,
    iconClassName: "text-[#ea4335]",
  },
  {
    title: "Connect files",
    description: "Review results, research, and plans",
    icon: CloudIcon,
    iconClassName: "text-[#4285f4]",
  },
] as const;

const FALLBACK_PENDING_MODEL_SELECTION = createModelSelection(
  ProviderInstanceId.make("codex"),
  "gpt-5.5",
);

const fallbackModelOptions = [
  { label: "5.5", value: "gpt-5.5" },
  { label: "5.4", value: "gpt-5.4" },
  { label: "5.3", value: "gpt-5.3" },
] as const;

const fallbackEffortOptions = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
] as const;

const PENDING_RIGHT_PANEL_WIDTH_STORAGE_KEY = "pathwayos:pending-right-panel-width";
const PENDING_RIGHT_PANEL_MIN_WIDTH = 360;
const PENDING_RIGHT_PANEL_DEFAULT_WIDTH = 704;
const PENDING_RIGHT_PANEL_MAX_WIDTH_PX = 1400;
const PENDING_RIGHT_PANEL_MAX_WIDTH_FRACTION = 0.7;

type PendingComposerMode = "goal" | "plan" | "conversation";

interface PendingWorkspaceSelection {
  readonly project: EnvironmentProject | null;
}

const pendingComposerModeConfig: Record<
  PendingComposerMode,
  {
    title: string;
    pinnedTitle: string;
    description: string;
    icon: LucideIcon;
  }
> = {
  goal: {
    title: "Goal",
    pinnedTitle: "Goal",
    description: "Set a goal that Codex will keep working towards",
    icon: TargetIcon,
  },
  plan: {
    title: "Plan mode",
    pinnedTitle: "Plan",
    description: "Turn plan mode on",
    icon: ListChecksIcon,
  },
  conversation: {
    title: "Conversation mode",
    pinnedTitle: "Conversation",
    description: "Talk only, no code changes",
    icon: MessageCircleIcon,
  },
};

const pendingComposerAddItems = [
  {
    section: "Add",
    items: [
      {
        title: "Files and folders",
        icon: PaperclipIcon,
      },
      {
        title: "Attach Helium",
        icon: SparklesIcon,
      },
      {
        title: "Goal",
        description: "Set a goal that Codex will keep working towards",
        icon: TargetIcon,
        mode: "goal",
      },
      {
        title: "Plan mode",
        description: "Turn plan mode on",
        icon: ListChecksIcon,
        mode: "plan",
      },
      {
        title: "Conversation mode",
        description: "Talk only, no code changes",
        icon: MessageCircleIcon,
        mode: "conversation",
      },
    ],
  },
  {
    section: "Plugins",
    items: [
      {
        title: "Documents",
        description: "Create and edit document artifacts",
        icon: FileTextIcon,
        iconClassName: "text-blue-500",
      },
      {
        title: "PDF",
        description: "Read, create, and verify PDF files",
        icon: FileIcon,
        iconClassName: "text-red-500",
      },
      {
        title: "Spreadsheets",
        description: "Create and edit spreadsheet files",
        icon: TableIcon,
        iconClassName: "text-emerald-600",
      },
      {
        title: "Presentations",
        description: "Create and edit presentations",
        icon: PresentationIcon,
        iconClassName: "text-amber-500",
      },
      {
        title: "Template Creator",
        description: "Create or update personal artifact templates",
        icon: SparklesIcon,
        iconClassName: "text-pink-400",
        muted: true,
      },
    ],
  },
] as const;

interface PendingDraftIds {
  readonly draftId: DraftId;
  readonly threadId: ReturnType<typeof newThreadId>;
}

function formatFallbackModelLabel(model: string): string {
  const option = fallbackModelOptions.find((candidate) => candidate.value === model);
  return option?.label ?? model.replace(/^gpt-/, "");
}

function PendingComposerModelControls() {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const settings = usePrimarySettings();
  const stickyActiveProvider = useComposerDraftStore((store) => store.stickyActiveProvider);
  const stickyModelSelectionByProvider = useComposerDraftStore(
    (store) => store.stickyModelSelectionByProvider,
  );
  const setStickyModelSelection = useComposerDraftStore((store) => store.setStickyModelSelection);
  const [localSelection, setLocalSelection] = useState<ModelSelection | null>(null);
  const [prompt, setPrompt] = useState("");
  const stickySelection = stickyActiveProvider
    ? stickyModelSelectionByProvider[stickyActiveProvider]
    : null;
  const providerInstanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );
  const preferredSelection =
    localSelection ?? stickySelection ?? settings.textGenerationModelSelection ?? null;
  const selectedEntry = preferredSelection
    ? providerInstanceEntries.find(
        (entry) => entry.instanceId === preferredSelection.instanceId && entry.enabled,
      )
    : undefined;
  const activeEntry =
    selectedEntry ??
    providerInstanceEntries.find((entry) => entry.enabled && entry.isAvailable) ??
    providerInstanceEntries.find((entry) => entry.enabled) ??
    providerInstanceEntries[0] ??
    null;

  const commitSelection = (
    instanceId: ProviderInstanceId,
    model: string,
    options?: ReadonlyArray<ProviderOptionSelection>,
  ) => {
    const nextSelection = createModelSelection(instanceId, model, options);
    setLocalSelection(nextSelection);
    setStickyModelSelection(nextSelection);
  };

  if (activeEntry === null) {
    const fallbackSelection = preferredSelection ?? FALLBACK_PENDING_MODEL_SELECTION;
    const fallbackModel = fallbackSelection.model || FALLBACK_PENDING_MODEL_SELECTION.model;
    const fallbackEffort =
      getProviderOptionStringSelectionValue(fallbackSelection.options, "reasoningEffort") ??
      "medium";
    const fallbackFastMode =
      getProviderOptionBooleanSelectionValue(fallbackSelection.options, "fastMode") ?? false;
    const fallbackOptions = [
      { id: "reasoningEffort", value: fallbackEffort },
      { id: "fastMode", value: fallbackFastMode },
    ] satisfies ReadonlyArray<ProviderOptionSelection>;

    return (
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="hidden h-7 max-w-36 cursor-pointer items-center gap-1 rounded-md px-2 text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground sm:flex"
            />
          }
        >
          <span className="font-medium text-foreground/80">
            {formatFallbackModelLabel(fallbackModel)}
          </span>
          {fallbackFastMode ? (
            <ZapIcon aria-hidden="true" className="size-3 shrink-0 text-amber-500" />
          ) : null}
          <span>
            {fallbackEffortOptions.find((option) => option.value === fallbackEffort)?.label}
          </span>
          <ChevronDownIcon className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="end" className="w-[31rem] overflow-hidden p-0">
          <div className="grid min-h-72 grid-cols-[3rem_minmax(0,1fr)_10rem]">
            <div className="flex flex-col items-center gap-1 border-r border-border/70 bg-muted/35 p-1.5">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md bg-accent text-foreground"
                aria-label="Codex models"
              >
                <SparklesIcon className="size-4" />
              </button>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-accent/70 hover:text-foreground"
                aria-label="Claude models"
              >
                <span className="font-medium text-xs">C</span>
              </button>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-accent/70 hover:text-foreground"
                aria-label="OpenAI models"
              >
                <span className="font-medium text-xs">O</span>
              </button>
            </div>

            <div className="min-w-0 border-r border-border/70 p-2">
              <div className="flex h-9 items-center border-b border-primary/80 px-1.5 text-muted-foreground/70 text-sm">
                Search models...
              </div>
              <MenuRadioGroup
                value={fallbackModel}
                onValueChange={(model) => {
                  commitSelection(
                    FALLBACK_PENDING_MODEL_SELECTION.instanceId,
                    model,
                    fallbackOptions,
                  );
                }}
              >
                {fallbackModelOptions.map((option) => (
                  <MenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="min-h-14 pe-2 ps-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">GPT-{option.label}</span>
                      <span className="mt-0.5 text-muted-foreground text-xs">Codex</span>
                    </span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </div>

            <div className="p-2">
              <MenuGroup>
                <MenuGroupLabel>Effort</MenuGroupLabel>
                <MenuRadioGroup
                  value={fallbackEffort}
                  onValueChange={(effort) => {
                    commitSelection(FALLBACK_PENDING_MODEL_SELECTION.instanceId, fallbackModel, [
                      { id: "reasoningEffort", value: effort },
                      { id: "fastMode", value: fallbackFastMode },
                    ]);
                  }}
                >
                  {fallbackEffortOptions.map((option) => (
                    <MenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuGroupLabel>Speed</MenuGroupLabel>
                <MenuRadioGroup
                  value={fallbackFastMode ? "fast" : "normal"}
                  onValueChange={(speed) => {
                    commitSelection(FALLBACK_PENDING_MODEL_SELECTION.instanceId, fallbackModel, [
                      { id: "reasoningEffort", value: fallbackEffort },
                      { id: "fastMode", value: speed === "fast" },
                    ]);
                  }}
                >
                  <MenuRadioItem value="normal">Normal</MenuRadioItem>
                  <MenuRadioItem value="fast">Fast</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
            </div>
          </div>
        </MenuPopup>
      </Menu>
    );
  }

  const selectedModel =
    preferredSelection?.instanceId === activeEntry.instanceId
      ? (resolveAppModelSelectionForInstance(
          activeEntry.instanceId,
          settings,
          providers,
          preferredSelection.model,
        ) ?? activeEntry.models[0]?.slug)
      : (resolveAppModelSelectionForInstance(activeEntry.instanceId, settings, providers, null) ??
        activeEntry.models[0]?.slug);
  const selectedModelOptions =
    preferredSelection?.instanceId === activeEntry.instanceId ? preferredSelection.options : null;
  const modelOptionsByInstance = new Map<ProviderInstanceId, ReadonlyArray<AppModelOption>>();
  for (const entry of providerInstanceEntries) {
    modelOptionsByInstance.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry));
  }
  const selectedProviderModels = activeEntry.models as ReadonlyArray<ServerProviderModel>;
  const composerProviderState = getComposerProviderState({
    provider: activeEntry.driverKind,
    model: selectedModel ?? "",
    models: selectedProviderModels,
    modelOptions: selectedModelOptions,
  });
  const shouldRenderTraitsPicker = shouldRenderTraitsControls({
    provider: activeEntry.driverKind,
    models: selectedProviderModels,
    model: selectedModel,
    modelOptions: composerProviderState.modelOptionsForDispatch,
    prompt,
  });
  const selectedModelForPicker =
    selectedModelOptions === null
      ? (selectedModel ?? FALLBACK_PENDING_MODEL_SELECTION.model)
      : createModelSelection(activeEntry.instanceId, selectedModel ?? "", selectedModelOptions)
          .model;
  const selectedModelForPickerWithCustomFallback = (() => {
    const currentOptions = modelOptionsByInstance.get(activeEntry.instanceId) ?? [];
    if (currentOptions.some((option) => option.slug === selectedModelForPicker)) {
      return selectedModelForPicker;
    }
    return (
      normalizeModelSlug(selectedModelForPicker, activeEntry.driverKind) ?? selectedModelForPicker
    );
  })();

  return (
    <>
      <ProviderModelPicker
        compact
        activeInstanceId={activeEntry.instanceId}
        model={selectedModelForPickerWithCustomFallback}
        lockedProvider={null}
        instanceEntries={providerInstanceEntries}
        modelOptionsByInstance={modelOptionsByInstance}
        triggerClassName="h-7 max-w-36"
        {...(composerProviderState.modelPickerIconClassName
          ? { activeProviderIconClassName: composerProviderState.modelPickerIconClassName }
          : {})}
        onInstanceModelChange={(instanceId, model) => {
          const entry = providerInstanceEntries.find(
            (candidate) => candidate.instanceId === instanceId,
          );
          const nextModel =
            resolveAppModelSelectionForInstance(instanceId, settings, providers, model) ?? model;
          const { modelOptionsForDispatch } = getComposerProviderState({
            provider: entry?.driverKind ?? ProviderDriverKind.make("codex"),
            model: nextModel,
            models: entry?.models ?? [],
            modelOptions: undefined,
          });
          commitSelection(instanceId, nextModel, modelOptionsForDispatch);
        }}
      />
      {shouldRenderTraitsPicker ? (
        <>
          <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
          <TraitsPicker
            provider={activeEntry.driverKind}
            instanceId={activeEntry.instanceId}
            models={selectedProviderModels}
            model={selectedModel}
            modelOptions={composerProviderState.modelOptionsForDispatch}
            prompt={prompt}
            triggerClassName="h-7 max-w-36 px-2"
            onPromptChange={setPrompt}
            onModelOptionsChange={(nextOptions) => {
              commitSelection(
                activeEntry.instanceId,
                selectedModel ?? FALLBACK_PENDING_MODEL_SELECTION.model,
                nextOptions,
              );
            }}
          />
        </>
      ) : null}
    </>
  );
}

function PendingComposerAccessControl() {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);

  return (
    <ComposerFooterModeControls
      showInteractionModeToggle={false}
      interactionMode="default"
      runtimeMode={runtimeMode}
      showPlanToggle={false}
      planSidebarLabel="Plan"
      planSidebarOpen={false}
      showLeadingSeparator={false}
      runtimeModeTriggerClassName="h-7 px-2 text-[#f25c2b] hover:bg-[#f25c2b]/10 hover:text-[#f25c2b] data-[popup-open]:bg-[#f25c2b]/10 data-[popup-open]:text-[#f25c2b]"
      onToggleInteractionMode={() => {}}
      onRuntimeModeChange={setRuntimeMode}
      onTogglePlanSidebar={() => {}}
    />
  );
}

function PendingComposerModeChip({
  mode,
  onClear,
}: {
  mode: PendingComposerMode;
  onClear: () => void;
}) {
  const option = pendingComposerModeConfig[mode];
  const Icon = option.icon;
  const pinnedTitle = option.pinnedTitle;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="group/mode-clear flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Clear ${pinnedTitle}`}
            onClick={onClear}
          />
        }
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <Icon className="absolute size-4 opacity-100 transition-opacity group-hover/mode-clear:opacity-0 group-focus-visible/mode-clear:opacity-0" />
          <CircleXIcon className="absolute size-4 opacity-0 transition-opacity group-hover/mode-clear:opacity-100 group-focus-visible/mode-clear:opacity-100" />
        </span>
        <span className="truncate">{pinnedTitle}</span>
      </TooltipTrigger>
      <TooltipPopup side="top">Cancel {pinnedTitle.toLowerCase()}</TooltipPopup>
    </Tooltip>
  );
}

function PendingComposerAddContextMenu({
  selectedMode,
  onSelectMode,
}: {
  selectedMode: PendingComposerMode | null;
  onSelectMode: (mode: PendingComposerMode) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/65 transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
            aria-label="Add context"
          />
        }
      >
        <PlusIcon className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start" className="w-[42rem] max-w-[calc(100vw-2rem)] rounded-[18px] p-0">
        {pendingComposerAddItems.map((section, sectionIndex) => (
          <MenuGroup key={section.section}>
            {sectionIndex > 0 ? <MenuDivider className="my-1" /> : null}
            <MenuGroupLabel className="px-3 pt-2 pb-1 font-normal text-muted-foreground/70 text-xs">
              {section.section}
            </MenuGroupLabel>
            {section.items.map((item) => {
              const Icon = item.icon;
              const iconClassName = "iconClassName" in item ? item.iconClassName : undefined;
              const description = "description" in item ? item.description : undefined;
              const muted = "muted" in item && item.muted;
              const mode = "mode" in item ? (item.mode as PendingComposerMode) : null;
              const selected = mode !== null && selectedMode === mode;

              return (
                <MenuItem
                  key={item.title}
                  className={[
                    "grid min-h-8 cursor-pointer grid-cols-[1rem_minmax(0,max-content)_1fr] items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                    muted ? "text-muted-foreground/55" : "",
                    selected ? "bg-accent text-foreground" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (mode !== null) {
                      onSelectMode(mode);
                    }
                  }}
                >
                  <Icon className={["size-4", iconClassName ?? ""].join(" ")} />
                  <span className={muted ? "" : "text-foreground"}>{item.title}</span>
                  {description ? (
                    <span className="min-w-0 truncate text-muted-foreground/55 text-sm">
                      {description}
                    </span>
                  ) : null}
                </MenuItem>
              );
            })}
          </MenuGroup>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function PendingComposerWorkspaceControls({
  selectedComposerMode,
  draftId,
  threadId,
  onWorkspaceSelectionChange,
}: {
  selectedComposerMode: PendingComposerMode | null;
  draftId: DraftId;
  threadId: ThreadId;
  onWorkspaceSelectionChange?: (selection: PendingWorkspaceSelection) => void;
}) {
  const projects = useProjects();
  const openAddProject = useOpenAddProjectCommandPalette();
  const [activeProjectKey, setActiveProjectKey] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"choose-project" | "just-talk">(
    "choose-project",
  );
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [envMode, setEnvMode] = useState<EnvMode>("local");
  const [startFromOrigin, setStartFromOrigin] = useState(false);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const draftThread = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        project,
        ref: scopeProjectRef(project.environmentId, project.id),
      })),
    [projects],
  );
  const activeProjectOption = activeProjectKey
    ? (projectOptions.find((option) => scopedProjectKey(option.ref) === activeProjectKey) ?? null)
    : null;
  const activeProject = activeProjectOption?.project ?? null;
  const projectRef = useMemo(
    () => (activeProject ? scopeProjectRef(activeProject.environmentId, activeProject.id) : null),
    [activeProject],
  );
  const logicalProjectKey = useMemo(
    () => (projectRef ? scopedProjectKey(projectRef) : null),
    [projectRef],
  );
  const pendingInteractionMode: ProviderInteractionMode =
    selectedComposerMode === "plan" ? "plan" : "default";
  const normalizedProjectSearchQuery = projectSearchQuery.trim().toLocaleLowerCase();
  const filteredProjectOptions = normalizedProjectSearchQuery
    ? projectOptions.filter(({ project }) =>
        project.title.toLocaleLowerCase().includes(normalizedProjectSearchQuery),
      )
    : projectOptions;

  useEffect(() => {
    if (
      activeProjectKey &&
      !projectOptions.some((option) => scopedProjectKey(option.ref) === activeProjectKey)
    ) {
      setActiveProjectKey(null);
      setWorkspaceMode("choose-project");
    }
  }, [activeProjectKey, projectOptions]);

  useEffect(() => {
    if (!projectRef || !logicalProjectKey) {
      return;
    }
    setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, {
      threadId,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: pendingInteractionMode,
      envMode,
      startFromOrigin,
    });
  }, [
    draftId,
    envMode,
    logicalProjectKey,
    pendingInteractionMode,
    projectRef,
    setLogicalProjectDraftThreadId,
    startFromOrigin,
    threadId,
  ]);

  useEffect(() => {
    onWorkspaceSelectionChange?.({ project: activeProject });
  }, [activeProject, onWorkspaceSelectionChange]);

  useEffect(() => {
    setDraftThreadContext(draftId, { interactionMode: pendingInteractionMode });
  }, [draftId, pendingInteractionMode, setDraftThreadContext]);

  const handleEnvModeChange = (mode: EnvMode) => {
    setEnvMode(mode);
    setDraftThreadContext(draftId, { envMode: mode as DraftThreadEnvMode });
  };

  return (
    <>
      {activeProject && projectRef ? (
        <>
          <span className="group/project-clear flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-accent hover:text-foreground">
            <button
              type="button"
              className="relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear selected project"
              onClick={() => {
                setActiveProjectKey(null);
                setWorkspaceMode("choose-project");
              }}
            >
              <ProjectFavicon
                environmentId={activeProject.environmentId}
                cwd={activeProject.workspaceRoot}
                className="size-4 rounded-full group-hover/project-clear:opacity-0 group-focus-visible/project-clear:opacity-0"
              />
              <XIcon className="pointer-events-none absolute size-3.5 opacity-0 transition-opacity group-hover/project-clear:opacity-100 group-focus-visible/project-clear:opacity-100" />
            </button>
            <span className="truncate">{activeProject.title}</span>
          </span>
          <BranchToolbarEnvModeSelector
            envLocked={false}
            effectiveEnvMode={draftThread?.envMode ?? envMode}
            activeWorktreePath={draftThread?.worktreePath ?? null}
            onEnvModeChange={handleEnvModeChange}
          />
          <BranchToolbarBranchSelector
            className="hidden sm:flex"
            environmentId={projectRef.environmentId}
            threadId={threadId}
            draftId={draftId}
            envLocked={false}
            effectiveEnvModeOverride={draftThread?.envMode ?? envMode}
            startFromOrigin={draftThread?.startFromOrigin ?? startFromOrigin}
            onStartFromOriginChange={(nextStartFromOrigin) => {
              setStartFromOrigin(nextStartFromOrigin);
              setDraftThreadContext(draftId, { startFromOrigin: nextStartFromOrigin });
            }}
          />
        </>
      ) : workspaceMode === "just-talk" ? (
        <span className="group/project-clear flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <button
            type="button"
            className="relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear Just Talk"
            onClick={() => {
              setActiveProjectKey(null);
              setWorkspaceMode("choose-project");
            }}
          >
            <MessageCircleIcon className="size-4 group-hover/project-clear:opacity-0 group-focus-visible/project-clear:opacity-0" />
            <XIcon className="pointer-events-none absolute size-3.5 opacity-0 transition-opacity group-hover/project-clear:opacity-100 group-focus-visible/project-clear:opacity-100" />
          </button>
          <span className="truncate">Just Talk</span>
        </span>
      ) : (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
                aria-label="Choose project"
              />
            }
          >
            <FolderIcon className="size-4 shrink-0" />
            <span className="truncate">Choose project</span>
          </MenuTrigger>
          <MenuPopup align="start" className="w-64">
            <div className="flex h-9 items-center gap-2 border-b border-border/80 px-2 text-muted-foreground">
              <SearchIcon className="size-4 shrink-0" />
              <input
                type="search"
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.currentTarget.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Search projects"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <div className="py-1">
              <MenuItem
                className="cursor-pointer"
                onClick={() => {
                  setActiveProjectKey(null);
                  setWorkspaceMode("just-talk");
                  setProjectSearchQuery("");
                }}
              >
                <MessageCircleIcon className="size-4" />
                <span className="truncate">Just Talk</span>
              </MenuItem>
              <MenuDivider />
              {filteredProjectOptions.length > 0 ? (
                filteredProjectOptions.map(({ project, ref }) => (
                  <MenuItem
                    key={scopedProjectKey(ref)}
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveProjectKey(scopedProjectKey(ref));
                      setWorkspaceMode("choose-project");
                      setProjectSearchQuery("");
                    }}
                  >
                    <ProjectFavicon
                      environmentId={project.environmentId}
                      cwd={project.workspaceRoot}
                      className="size-4"
                    />
                    <span className="truncate">{project.title}</span>
                  </MenuItem>
                ))
              ) : (
                <div className="px-2 py-2 text-muted-foreground text-sm">No projects found</div>
              )}
            </div>
            <MenuDivider />
            <MenuSub>
              <MenuSubTrigger className="cursor-pointer">
                <PlusIcon className="size-4" />
                <span>New project</span>
              </MenuSubTrigger>
              <MenuSubPopup className="w-48">
                <MenuItem className="cursor-pointer" onClick={openAddProject}>
                  <PlusIcon className="size-4" />
                  <span>Start from scratch</span>
                </MenuItem>
                <MenuItem className="cursor-pointer" onClick={openAddProject}>
                  <FolderIcon className="size-4" />
                  <span>Use an existing folder</span>
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          </MenuPopup>
        </Menu>
      )}
    </>
  );
}

function NoActiveThreadPanelControls({
  terminalOpen,
  rightPanelOpen,
  onToggleTerminal,
  onToggleRightPanel,
}: {
  terminalOpen: boolean;
  rightPanelOpen: boolean;
  onToggleTerminal: () => void;
  onToggleRightPanel: () => void;
}) {
  return (
    <div className="workspace-titlebar-controls z-50 hidden gap-1 [-webkit-app-region:no-drag] md:flex">
      <PanelLayoutControls
        terminalAvailable
        terminalOpen={terminalOpen}
        terminalShortcutLabel={null}
        rightPanelAvailable
        rightPanelOpen={rightPanelOpen}
        rightPanelShortcutLabel={null}
        onToggleTerminal={onToggleTerminal}
        onToggleRightPanel={onToggleRightPanel}
      />
    </div>
  );
}

function PendingTerminalDrawer({
  threadId,
  project,
}: {
  threadId: ThreadId;
  project: EnvironmentProject | null;
}) {
  const primaryServerConfig = useAtomValue(primaryServerConfigAtom);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openTerminal = useAtomCommand(terminalEnvironment.open, "terminal open");
  const closeTerminalMutation = useAtomCommand(terminalEnvironment.close, "terminal close");
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [terminalIds, setTerminalIds] = useState<string[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState("");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const hasAutoOpenedRef = useRef(false);

  const environmentId =
    project?.environmentId ?? primaryServerConfig?.environment.environmentId ?? null;
  const threadRef = useMemo<ScopedThreadRef | null>(
    () => (environmentId ? scopeThreadRef(environmentId, threadId) : null),
    [environmentId, threadId],
  );
  const cwd = useMemo(
    () =>
      project
        ? projectScriptCwd({ project: { cwd: project.workspaceRoot }, worktreePath: null })
        : "~",
    [project],
  );
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({ project: { cwd: project.workspaceRoot }, worktreePath: null })
        : {},
    [project],
  );
  const terminalGroups = useMemo<ThreadTerminalGroup[]>(
    () => (terminalIds.length > 0 ? [{ id: "pending-terminal-group", terminalIds }] : []),
    [terminalIds],
  );
  const terminalLaunchLocationsById = useMemo(
    () =>
      new Map(
        terminalIds.map((terminalId) => [terminalId, { cwd, worktreePath: null, runtimeEnv }]),
      ),
    [cwd, runtimeEnv, terminalIds],
  );

  const createNewTerminal = useCallback(() => {
    if (!threadRef) {
      return;
    }
    const terminalId = nextTerminalId(terminalIds);
    setTerminalIds((current) => [...current, terminalId]);
    setActiveTerminalId(terminalId);
    setFocusRequestId((value) => value + 1);
    void openTerminal({
      environmentId: threadRef.environmentId,
      input: {
        threadId,
        terminalId,
        cwd,
        env: runtimeEnv,
      },
    });
  }, [cwd, openTerminal, runtimeEnv, terminalIds, threadId, threadRef]);

  useEffect(() => {
    if (!threadRef || hasAutoOpenedRef.current || terminalIds.length > 0) {
      return;
    }
    hasAutoOpenedRef.current = true;
    const terminalId = "term-1";
    setTerminalIds([terminalId]);
    setActiveTerminalId(terminalId);
    setFocusRequestId((value) => value + 1);
    void openTerminal({
      environmentId: threadRef.environmentId,
      input: {
        threadId,
        terminalId,
        cwd,
        env: runtimeEnv,
      },
    });
  }, [cwd, openTerminal, runtimeEnv, terminalIds.length, threadId, threadRef]);

  const closeTerminal = useCallback(
    (terminalId: string) => {
      if (!threadRef) {
        return;
      }
      void closeTerminalMutation({
        environmentId: threadRef.environmentId,
        input: {
          threadId,
          terminalId,
          deleteHistory: true,
        },
      });
      setTerminalIds((current) => {
        const nextIds = current.filter((id) => id !== terminalId);
        setActiveTerminalId((activeId) =>
          activeId === terminalId ? (nextIds.at(-1) ?? "") : activeId,
        );
        return nextIds;
      });
      setFocusRequestId((value) => value + 1);
    },
    [closeTerminalMutation, threadId, threadRef],
  );

  if (!threadRef) {
    return null;
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-40">
      <ThreadTerminalDrawer
        threadRef={threadRef}
        threadId={threadId}
        cwd={cwd}
        worktreePath={null}
        runtimeEnv={runtimeEnv}
        visible
        height={terminalHeight}
        terminalIds={terminalIds}
        activeTerminalId={activeTerminalId}
        terminalGroups={terminalGroups}
        activeTerminalGroupId="pending-terminal-group"
        focusRequestId={focusRequestId}
        onSplitTerminal={createNewTerminal}
        onSplitTerminalVertical={createNewTerminal}
        onNewTerminal={createNewTerminal}
        onActiveTerminalChange={(terminalId) => {
          setActiveTerminalId(terminalId);
          setFocusRequestId((value) => value + 1);
        }}
        onCloseTerminal={closeTerminal}
        onHeightChange={setTerminalHeight}
        onAddTerminalContext={() => undefined}
        keybindings={keybindings}
        terminalLaunchLocationsById={terminalLaunchLocationsById}
      />
    </div>
  );
}

function usePendingRightPanelMaxWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let frame = 0;
    const handleResize = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setViewportWidth(window.innerWidth);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return Math.min(
    PENDING_RIGHT_PANEL_MAX_WIDTH_PX,
    Math.floor(viewportWidth * PENDING_RIGHT_PANEL_MAX_WIDTH_FRACTION),
  );
}

function PendingRightToolsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const maxWidth = usePendingRightPanelMaxWidth();
  const { width, handlers } = useResizableWidth({
    storageKey: PENDING_RIGHT_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: PENDING_RIGHT_PANEL_DEFAULT_WIDTH,
    minWidth: PENDING_RIGHT_PANEL_MIN_WIDTH,
    maxWidth,
    edge: "left",
  });
  const [resizing, setResizing] = useState(false);
  const resizeHandlers = useMemo(
    () => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button === 0) {
          setResizing(true);
        }
        handlers.onPointerDown(event);
      },
      onPointerMove: handlers.onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerUp(event);
        setResizing(false);
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        handlers.onPointerCancel(event);
        setResizing(false);
      },
    }),
    [handlers],
  );
  useEffect(() => {
    if (!resizing || typeof window === "undefined") {
      return;
    }
    const stopResizing = () => setResizing(false);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("blur", stopResizing);
    return () => {
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
    };
  }, [resizing]);
  const tools = [
    {
      label: "Browser",
      description: "Open a local app or URL.",
      icon: Globe2Icon,
      available: false,
    },
    {
      label: "Terminal",
      description: "Start a shell in this workspace.",
      icon: TerminalSquareIcon,
      available: true,
    },
    {
      label: "Files",
      description: "Browse and read workspace files.",
      icon: FileIcon,
      available: true,
    },
    {
      label: "Diff",
      description: "Review changes in this thread.",
      icon: FileDiffIcon,
      available: false,
    },
  ] as const;

  return (
    <aside
      className={cn(
        "absolute top-0 bottom-0 z-30 flex min-w-0 border-l border-border bg-background/95 shadow-[-12px_0_28px_rgba(15,23,42,0.08)] backdrop-blur",
        resizing ? "transition-none" : "transition-[right,width] duration-200 ease-linear",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={{
        right: open ? 0 : `-${width}px`,
        width: `${width}px`,
        maxWidth: "calc(100vw - var(--app-nav-rail-width))",
      }}
      aria-hidden={!open}
    >
      {open ? <RightPanelResizeHandle handlers={resizeHandlers} /> : null}
      {open ? (
        <Button
          className="absolute right-3 top-3 z-10"
          size="icon-sm"
          variant="ghost"
          aria-label="Close right panel"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      ) : null}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <div className="mb-5 text-center">
            <h3 className="text-sm font-medium text-foreground">Open a surface</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose what to show in the right panel.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.label}
                  type="button"
                  className={[
                    "flex min-h-28 w-full flex-col items-start rounded-lg border border-border/80 bg-card/40 p-4 text-left transition",
                    tool.available
                      ? "cursor-pointer hover:border-border hover:bg-accent/60"
                      : "cursor-not-allowed opacity-40",
                  ].join(" ")}
                  aria-disabled={!tool.available}
                >
                  <Icon className="mb-3 size-5" />
                  <span className="text-sm font-medium">{tool.label}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {tool.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function NoActiveThreadState() {
  const navigate = useNavigate();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [selectedComposerMode, setSelectedComposerMode] = useState<PendingComposerMode | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [{ draftId, threadId }] = useState<PendingDraftIds>(() => ({
    draftId: newDraftId(),
    threadId: newThreadId(),
  }));
  const [workspaceSelection, setWorkspaceSelection] = useState<PendingWorkspaceSelection>({
    project: null,
  });
  const [pendingTerminalThreadId, setPendingTerminalThreadId] = useState(() => newThreadId());
  const [connectionCardsVisible, setConnectionCardsVisible] = useState(true);
  const primaryServerConfig = useAtomValue(primaryServerConfigAtom);
  const standaloneEnvironmentId = primaryServerConfig?.environment.environmentId ?? null;
  const setComposerPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const setStandaloneDraftThreadId = useComposerDraftStore(
    (store) => store.setStandaloneDraftThreadId,
  );
  const canStartDraft =
    prompt.trim().length > 0 &&
    (workspaceSelection.project !== null || standaloneEnvironmentId !== null);
  const handleWorkspaceSelectionChange = useCallback((selection: PendingWorkspaceSelection) => {
    setWorkspaceSelection((current) => {
      const currentKey = current.project
        ? scopedProjectKey(scopeProjectRef(current.project.environmentId, current.project.id))
        : "home";
      const nextKey = selection.project
        ? scopedProjectKey(scopeProjectRef(selection.project.environmentId, selection.project.id))
        : "home";
      if (currentKey !== nextKey) {
        setPendingTerminalThreadId(newThreadId());
      }
      return selection;
    });
  }, []);
  const submitPendingComposer = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!canStartDraft) {
        return;
      }
      const targetProject = workspaceSelection.project;
      if (targetProject) {
        const targetProjectRef = scopeProjectRef(targetProject.environmentId, targetProject.id);
        setLogicalProjectDraftThreadId(
          scopedProjectKey(targetProjectRef),
          targetProjectRef,
          draftId,
          {
            threadId,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: selectedComposerMode === "plan" ? "plan" : DEFAULT_INTERACTION_MODE,
            envMode: "local",
            startFromOrigin: false,
          },
        );
      } else if (standaloneEnvironmentId) {
        setStandaloneDraftThreadId(standaloneEnvironmentId, draftId, {
          threadId,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: selectedComposerMode === "plan" ? "plan" : DEFAULT_INTERACTION_MODE,
        });
      } else {
        return;
      }
      setComposerPrompt(draftId, prompt);
      markDraftForAutoSubmit(draftId);
      void navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(draftId),
      });
    },
    [
      canStartDraft,
      draftId,
      navigate,
      prompt,
      selectedComposerMode,
      setComposerPrompt,
      setLogicalProjectDraftThreadId,
      setStandaloneDraftThreadId,
      standaloneEnvironmentId,
      threadId,
      workspaceSelection.project,
    ],
  );
  const onPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      submitPendingComposer();
    },
    [submitPendingComposer],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <MobileWorkspaceTopbar
          title="Agents"
          actions={
            <PanelLayoutControls
              terminalAvailable
              terminalOpen={terminalOpen}
              terminalShortcutLabel={null}
              rightPanelAvailable
              rightPanelOpen={rightPanelOpen}
              rightPanelShortcutLabel={null}
              onToggleTerminal={() => setTerminalOpen((open) => !open)}
              onToggleRightPanel={() => setRightPanelOpen((open) => !open)}
            />
          }
        />
        <NoActiveThreadPanelControls
          terminalOpen={terminalOpen}
          rightPanelOpen={rightPanelOpen}
          onToggleTerminal={() => setTerminalOpen((open) => !open)}
          onToggleRightPanel={() => setRightPanelOpen((open) => !open)}
        />
        <PendingRightToolsPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
        <Empty className="flex-1 px-6">
          <div className="w-full max-w-[46rem]">
            <EmptyHeader className="max-w-none">
              <EmptyTitle className="text-balance text-center text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">
                What should we build today?
              </EmptyTitle>
              <EmptyDescription className="sr-only">
                Start a new chat once a project is available.
              </EmptyDescription>
            </EmptyHeader>

            <form
              className="mt-11 rounded-[22px] bg-muted/58 pb-2 shadow-[0_18px_45px_hsl(var(--foreground)/0.08)]"
              onSubmit={submitPendingComposer}
            >
              <div className="rounded-[18px] border border-border/70 bg-background shadow-[0_12px_32px_hsl(var(--foreground)/0.12)]">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  onKeyDown={onPromptKeyDown}
                  placeholder="Do anything"
                  rows={1}
                  className="block min-h-18 w-full resize-none rounded-t-[18px] bg-transparent px-4 pt-4 text-left text-sm text-foreground outline-none placeholder:text-muted-foreground/42"
                />
                <div className="flex items-center gap-2 px-3 pb-2.5">
                  <PendingComposerAddContextMenu
                    selectedMode={selectedComposerMode}
                    onSelectMode={setSelectedComposerMode}
                  />

                  <div className="flex items-center text-[#f25c2b] text-sm">
                    <PendingComposerAccessControl />
                  </div>

                  {selectedComposerMode ? (
                    <PendingComposerModeChip
                      mode={selectedComposerMode}
                      onClear={() => setSelectedComposerMode(null)}
                    />
                  ) : null}

                  <div className="ml-auto flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <div className="hidden min-w-0 items-center gap-1 sm:flex">
                      <PendingComposerModelControls />
                    </div>
                    <button
                      type="button"
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Voice input"
                    >
                      <MicIcon className="size-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={!canStartDraft}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-all duration-150",
                        canStartDraft
                          ? "cursor-pointer bg-foreground text-background shadow-md shadow-foreground/20 ring-2 ring-ring/25 hover:scale-105 hover:bg-foreground/90"
                          : "cursor-not-allowed bg-muted-foreground/35 text-background/80 opacity-60",
                      )}
                      aria-label="Send message"
                    >
                      <ArrowUpIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-4 px-4 pt-1.5 text-sm text-muted-foreground">
                <PendingComposerWorkspaceControls
                  selectedComposerMode={selectedComposerMode}
                  draftId={draftId}
                  threadId={threadId}
                  onWorkspaceSelectionChange={handleWorkspaceSelectionChange}
                />
              </div>
            </form>

            {connectionCardsVisible ? (
              <div className="group/connection-cards relative mx-auto mt-8 max-w-[41.5rem]">
                <button
                  type="button"
                  className="absolute -right-2 -top-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground opacity-0 shadow-sm transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/connection-cards:opacity-100"
                  aria-label="Dismiss connection suggestions"
                  onClick={() => setConnectionCardsVisible(false)}
                >
                  <XIcon className="size-4" />
                </button>
                <div className="grid gap-3 sm:grid-cols-3">
                  {pendingConnectionCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.title}
                        type="button"
                        className="relative min-h-[7.125rem] cursor-pointer rounded-xl border border-border/70 bg-background p-3 text-left shadow-xs transition-colors hover:bg-accent/35"
                      >
                        <Icon className={`size-4 ${card.iconClassName}`} />
                        <div className="mt-4 text-sm font-medium text-foreground">{card.title}</div>
                        <div className="mt-1 text-sm leading-snug text-muted-foreground">
                          {card.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </Empty>
        {terminalOpen ? (
          <PendingTerminalDrawer
            key={pendingTerminalThreadId}
            threadId={pendingTerminalThreadId}
            project={workspaceSelection.project}
          />
        ) : null}
      </div>
    </SidebarInset>
  );
}
