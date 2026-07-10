import type { IssueSavedView } from "@pathwayos/contracts";
import { Link } from "@tanstack/react-router";
import { BookmarkIcon, ChevronDownIcon, ChevronUpIcon, EllipsisIcon, InboxIcon, PinIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";

import { useIssuesUiStateStore } from "~/issuesUiStateStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useIssueSavedViews, useIssuesSnapshotMeta } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";

function ViewItem({ view, pinned }: { view: IssueSavedView; pinned: boolean }) {
  const environmentId = usePrimaryEnvironmentId();
  const selectedViewId = useIssuesUiStateStore((state) => state.selectedViewId);
  const selectView = useIssuesUiStateStore((state) => state.selectView);
  const togglePinnedView = useIssuesUiStateStore((state) => state.togglePinnedView);
  const updateView = useAtomCommand(issuesEnvironment.updateView, { reportFailure: true });
  const deleteView = useAtomCommand(issuesEnvironment.deleteView, { reportFailure: true });
  if (environmentId === null) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="sm" isActive={selectedViewId === view.id} className="pr-8 text-[13px]" onClick={() => selectView(view)}>
        <BookmarkIcon className="size-3.5" /><span>{view.name}</span>
      </SidebarMenuButton>
      <Menu>
        <MenuTrigger render={<SidebarMenuAction showOnHover />} aria-label={`Actions for ${view.name}`}><EllipsisIcon /></MenuTrigger>
        <MenuPopup align="start" side="right">
          <MenuItem onClick={() => togglePinnedView(view.id)}><PinIcon />{pinned ? "Unpin" : "Pin"}</MenuItem>
          <MenuItem onClick={() => { const name = window.prompt("Rename saved view", view.name)?.trim(); if (name) void updateView({ environmentId, input: { viewId: view.id, patch: { name } } }); }}>Rename</MenuItem>
          <MenuItem onClick={() => void updateView({ environmentId, input: { viewId: view.id, patch: { position: Math.max(0, view.position - 1) } } })}><ChevronUpIcon />Move up</MenuItem>
          <MenuItem onClick={() => void updateView({ environmentId, input: { viewId: view.id, patch: { position: view.position + 1 } } })}><ChevronDownIcon />Move down</MenuItem>
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => { if (window.confirm(`Delete “${view.name}”?`)) void deleteView({ environmentId, input: { viewId: view.id } }); }}><Trash2Icon />Delete</MenuItem>
        </MenuPopup>
      </Menu>
    </SidebarMenuItem>
  );
}

export function SavedViewsRail() {
  const environmentId = usePrimaryEnvironmentId();
  const views = useIssueSavedViews(environmentId);
  const meta = useIssuesSnapshotMeta(environmentId);
  const filters = useIssuesUiStateStore((state) => state.filters);
  const display = useIssuesUiStateStore((state) => state.display);
  const selectedViewId = useIssuesUiStateStore((state) => state.selectedViewId);
  const dirty = useIssuesUiStateStore((state) => state.dirty);
  const pinnedViewIds = useIssuesUiStateStore((state) => state.pinnedViewIds);
  const markViewSaved = useIssuesUiStateStore((state) => state.markViewSaved);
  const createView = useAtomCommand(issuesEnvironment.createView, { reportFailure: true });
  const updateView = useAtomCommand(issuesEnvironment.updateView, { reportFailure: true });
  const sortedViews = useMemo(() => views.filter((view) => view.deletedAt === null).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [views]);
  const pinned = sortedViews.filter((view) => pinnedViewIds.includes(view.id));
  const personal = sortedViews.filter((view) => view.scope === "personal");
  const team = sortedViews.filter((view) => view.scope === "team");
  const selected = sortedViews.find((view) => view.id === selectedViewId) ?? null;

  const save = async () => {
    if (environmentId === null || !meta.online) return;
    if (selected && dirty) {
      await updateView({ environmentId, input: { viewId: selected.id, patch: { filters, display } } });
      markViewSaved({ ...selected, filters, display });
      return;
    }
    const name = window.prompt("Saved view name")?.trim();
    if (!name) return;
    await createView({ environmentId, input: { scope: "personal", teamId: null, name, filters, display, position: sortedViews.length } });
  };

  const renderSection = (label: string, items: ReadonlyArray<IssueSavedView>) => items.length ? (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>{items.map((view) => <ViewItem key={view.id} view={view} pinned={pinnedViewIds.includes(view.id)} />)}</SidebarMenu>
    </SidebarGroup>
  ) : null;

  return (
    <>
      <SidebarHeader className="h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center border-b px-3 py-0">
        <span className="text-sm font-semibold">Issues</span>
        <Button className="ml-auto" size="icon-xs" variant="ghost" onClick={() => void save()} disabled={!meta.online} aria-label={selected && dirty ? "Update view" : "Save view"}>
          {selected && dirty ? <SaveIcon /> : <PlusIcon />}
        </Button>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        <SidebarGroup className="py-1"><SidebarMenu><SidebarMenuItem><SidebarMenuButton size="sm" isActive={selectedViewId === null} className="text-[13px]" onClick={() => useIssuesUiStateStore.getState().selectView(null)}><BookmarkIcon className="size-3.5" /><span>All issues</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
        {renderSection("Pinned", pinned)}
        {renderSection("Personal", personal)}
        {renderSection("Team", team)}
        {!sortedViews.length ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Save the current filters to create your first view.</p> : null}
        <SidebarGroup className="mt-auto py-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" className="text-[13px]" render={<Link to="/issues/triage" />}>
                <InboxIcon className="size-3.5" />
                <span>Triage</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" className="text-[13px]" render={<Link to="/issues/trash" />}>
                <Trash2Icon className="size-3.5" />
                <span>Trash</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <Button size="sm" variant="outline" className="w-full" onClick={() => void save()} disabled={!meta.online || (selected !== null && !dirty)}>
          <SaveIcon />{selected ? "Update view" : "Save view"}
        </Button>
      </SidebarFooter>
    </>
  );
}
