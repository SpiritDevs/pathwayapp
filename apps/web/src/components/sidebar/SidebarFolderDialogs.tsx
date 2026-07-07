import {
  BookOpenIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  FlameIcon,
  FlaskConicalIcon,
  FolderIcon,
  FolderKanbanIcon,
  Globe2Icon,
  GraduationCapIcon,
  HeartIcon,
  HomeIcon,
  PaletteIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarProjectFolder } from "../../uiStateStore";
import { cn } from "~/lib/utils";
import { ColorSelector, getColorValue } from "../color-selector";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { toastManager } from "../ui/toast";

const FOLDER_ICONS = {
  folder: FolderIcon,
  kanban: FolderKanbanIcon,
  briefcase: BriefcaseBusinessIcon,
  rocket: RocketIcon,
  star: StarIcon,
  heart: HeartIcon,
  flame: FlameIcon,
  zap: ZapIcon,
  sparkles: SparklesIcon,
  globe: Globe2Icon,
  book: BookOpenIcon,
  wrench: WrenchIcon,
  flask: FlaskConicalIcon,
  terminal: TerminalIcon,
  palette: PaletteIcon,
  home: HomeIcon,
  building: Building2Icon,
  "graduation-cap": GraduationCapIcon,
} satisfies Record<string, LucideIcon>;

const FOLDER_ICON_KEYS = Object.keys(FOLDER_ICONS) as ReadonlyArray<keyof typeof FOLDER_ICONS>;

const FOLDER_COLORS = [
  "default",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

function folderIconComponent(icon: string): LucideIcon {
  return FOLDER_ICONS[icon as keyof typeof FOLDER_ICONS] ?? FolderIcon;
}

export function SidebarFolderGlyph(props: { icon: string; color: string; className?: string }) {
  const Icon = folderIconComponent(props.icon);
  return (
    <Icon
      className={props.className}
      style={props.color !== "default" ? { color: getColorValue(props.color) } : undefined}
    />
  );
}

interface SidebarFolderDetailsSheetProps {
  folder: SidebarProjectFolder | null;
  onOpenChange: (open: boolean) => void;
  onSave: (folderId: string, patch: { name: string; icon: string; color: string }) => void;
}

export function SidebarFolderDetailsSheet(props: SidebarFolderDetailsSheetProps) {
  const { folder, onOpenChange, onSave } = props;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("folder");
  const [color, setColor] = useState<string>("default");

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setIcon(folder.icon);
      setColor(folder.color);
    }
  }, [folder]);

  const submit = () => {
    if (!folder) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Folder name cannot be empty",
      });
      return;
    }
    onSave(folder.id, { name: trimmed, icon, color });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={folder !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <SheetPopup className="max-w-[27rem]" side="right">
        <SheetHeader>
          <SheetTitle>Folder details</SheetTitle>
          <SheetDescription>
            {folder ? `Manage ${folder.name}.` : "Manage this folder."}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-6">
          <section>
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-muted-foreground">
                <SidebarFolderGlyph className="size-6" color={color} icon={icon} />
              </span>
              <input
                aria-label="Folder name"
                className="-ml-1 h-7 w-full min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted/45 focus:border-ring focus:bg-background focus:ring-[3px] focus:ring-ring/50"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-medium text-foreground">Icon</div>
            <div className="grid grid-cols-6 gap-1.5">
              {FOLDER_ICON_KEYS.map((iconKey) => {
                const Icon = FOLDER_ICONS[iconKey];
                const selected = iconKey === icon;
                return (
                  <button
                    key={iconKey}
                    aria-label={`Use ${iconKey} icon`}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-9 cursor-pointer items-center justify-center rounded-lg border transition-colors",
                      selected
                        ? "border-ring bg-accent text-foreground ring-[3px] ring-ring/40"
                        : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    type="button"
                    onClick={() => setIcon(iconKey)}
                  >
                    <Icon
                      className="size-4"
                      style={
                        selected && color !== "default"
                          ? { color: getColorValue(color) }
                          : undefined
                      }
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-medium text-foreground">Icon color</div>
            <ColorSelector
              key={folder?.id ?? "none"}
              className="flex-wrap"
              colors={[...FOLDER_COLORS]}
              defaultValue={folder?.color ?? "default"}
              onColorSelect={setColor}
            />
          </section>
        </SheetPanel>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save</Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

export interface SidebarRemoveFolderTarget {
  folder: SidebarProjectFolder;
  projects: readonly SidebarProjectSnapshot[];
}

interface SidebarRemoveFolderDialogProps {
  target: SidebarRemoveFolderTarget | null;
  onOpenChange: (open: boolean) => void;
  onRemoveFolderOnly: (folder: SidebarProjectFolder) => void;
  onRemoveFolderAndProjects: (target: SidebarRemoveFolderTarget) => void;
}

export function SidebarRemoveFolderDialog(props: SidebarRemoveFolderDialogProps) {
  const { target, onOpenChange, onRemoveFolderOnly, onRemoveFolderAndProjects } = props;
  const projectCount = target?.projects.length ?? 0;

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target ? `Remove "${target.folder.name}"?` : "Remove folder?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {projectCount === 0
              ? "This folder is empty. Removing it will not affect any projects."
              : `This folder contains ${projectCount} project${projectCount === 1 ? "" : "s"}. You can remove just the folder and keep its projects in the sidebar, or remove the folder and delete its projects along with their chat history. Deleting projects cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button
            variant={projectCount === 0 ? "destructive" : "secondary"}
            onClick={() => {
              if (!target) {
                return;
              }
              onRemoveFolderOnly(target.folder);
              onOpenChange(false);
            }}
          >
            {projectCount === 0 ? "Remove folder" : "Remove folder only"}
          </Button>
          {projectCount > 0 ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (!target) {
                  return;
                }
                onRemoveFolderAndProjects(target);
                onOpenChange(false);
              }}
            >
              Remove folder and projects
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
