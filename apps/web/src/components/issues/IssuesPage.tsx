import { InboxIcon, KanbanIcon, ListIcon, PlusIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { isCommandPaletteOpen } from "~/commandPaletteContext";
import { useIssuesUiStateStore } from "~/issuesUiStateStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useIssueActors, useIssueCycles, useIssueEpics, useIssueLabels, useIssues, useIssueSavedViews, useIssueStates, useIssuesSnapshotMeta, useIssueTeams } from "~/state/issueEntities";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { SidebarInset } from "~/components/ui/sidebar";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { MobileWorkspaceTopbar } from "~/components/MobileWorkspaceTopbar";

import { DisplayOptions } from "./DisplayOptions";
import { IssuePeek } from "./detail/IssuePeek";
import { useIssuePeekStore } from "./issuePeekStore";
import { FilterBar } from "./FilterBar";
import { openIssueQuickCreate } from "./IssueQuickCreateDialog";
import { IssuesBoardView } from "./IssuesBoardView";
import { IssuesListView } from "./IssuesListView";
import { filterIssues } from "./issuesView";

export function IssuesPage() {
  const environmentId = usePrimaryEnvironmentId();
  const allIssues = useIssues().filter((issue) => issue.environmentId === environmentId);
  const teams = useIssueTeams(environmentId);
  const states = useIssueStates(environmentId);
  const actors = useIssueActors(environmentId);
  const labels = useIssueLabels(environmentId);
  const cycles = useIssueCycles(environmentId);
  const epics = useIssueEpics(environmentId);
  const savedViews = useIssueSavedViews(environmentId);
  const meta = useIssuesSnapshotMeta(environmentId);
  const filters = useIssuesUiStateStore((state) => state.filters);
  const display = useIssuesUiStateStore((state) => state.display);
  const selectedViewId = useIssuesUiStateStore((state) => state.selectedViewId);
  const setFilters = useIssuesUiStateStore((state) => state.setFilters);
  const setDisplay = useIssuesUiStateStore((state) => state.setDisplay);
  const selectView = useIssuesUiStateStore((state) => state.selectView);
  const openPeek = useIssuePeekStore((state) => state.openPeek);
  const activeTeams = useMemo(() => teams.filter((item) => item.deletedAt === null), [teams]);
  const activeStates = useMemo(() => states.filter((item) => item.deletedAt === null), [states]);
  const activeActors = useMemo(() => actors.filter((item) => item.deletedAt === null), [actors]);
  const activeLabels = useMemo(() => labels.filter((item) => item.deletedAt === null), [labels]);
  const activeCycles = useMemo(() => cycles.filter((item) => item.deletedAt === null), [cycles]);
  const activeEpics = useMemo(() => epics.filter((item) => item.deletedAt === null), [epics]);
  const activeSavedViews = useMemo(() => savedViews.filter((item) => item.deletedAt === null), [savedViews]);
  const selectedView = activeSavedViews.find((view) => view.id === selectedViewId) ?? null;
  const visibleIssues = useMemo(() => filterIssues(allIssues, filters, display, activeStates), [activeStates, allIssues, display, filters]);
  const lookup = useMemo(() => ({ teams: activeTeams, states: activeStates, actors: activeActors, labels: activeLabels, cycles: activeCycles, epics: activeEpics }), [activeActors, activeCycles, activeEpics, activeLabels, activeStates, activeTeams]);
  const untriagedCount = allIssues.filter((issue) => !issue.triaged && issue.deletedAt === null).length;

  useEffect(() => {
    if (selectedViewId !== null && meta.workspaceKey !== null && !selectedView) selectView(null);
  }, [meta.workspaceKey, selectView, selectedView, selectedViewId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!meta.online || event.defaultPrevented || isCommandPaletteOpen() || event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault(); openIssueQuickCreate();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [meta.online]);

  const changeView = (values: unknown[]) => {
    const viewMode = values[0];
    if (viewMode === "list" || viewMode === "board") setDisplay({ ...display, viewMode });
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <MobileWorkspaceTopbar title="Issues" />
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="text-sm font-semibold">Issues</h1>{selectedView ? <span className="truncate text-xs text-muted-foreground">/ {selectedView.name}</span> : null}</div></div>
          <ToggleGroup className="ml-auto" value={[display.viewMode]} onValueChange={changeView} size="xs" variant="outline">
            <Toggle value="list" aria-label="List view"><ListIcon /></Toggle><Toggle value="board" aria-label="Board view"><KanbanIcon /></Toggle>
          </ToggleGroup>
          <a href="/issues/triage" className="inline-flex"><Badge variant={untriagedCount ? "warning" : "outline"}><InboxIcon /> Triage {untriagedCount}</Badge></a>
          <DisplayOptions display={display} onChange={setDisplay} />
          <Button size="xs" onClick={openIssueQuickCreate} disabled={!meta.online}><PlusIcon /> New issue</Button>
        </header>
        {!meta.online && meta.workspaceKey !== null ? <Alert variant="warning" className="m-3 mb-0 rounded-lg py-2"><TriangleAlertIcon /><AlertDescription>Issues are read-only while offline</AlertDescription></Alert> : null}
        <FilterBar filters={filters} onChange={setFilters} teams={activeTeams} states={activeStates} actors={activeActors} labels={activeLabels} cycles={activeCycles} epics={activeEpics} />
        {meta.workspaceKey === null ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading issues…</div> : activeTeams.length === 0 ? (
          <Empty><EmptyMedia variant="icon"><UsersIcon /></EmptyMedia><EmptyHeader><EmptyTitle>No teams yet</EmptyTitle><EmptyDescription>Create a team to give issues a workflow, key, and ownership boundary.</EmptyDescription></EmptyHeader><EmptyContent><Button render={<a href="/settings/teams" />}>Set up teams</Button></EmptyContent></Empty>
        ) : allIssues.length === 0 ? (
          <Empty><EmptyMedia variant="icon"><InboxIcon /></EmptyMedia><EmptyHeader><EmptyTitle>Your issue workspace is clear</EmptyTitle><EmptyDescription>Create the first issue or save a view for the work you want to track.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={openIssueQuickCreate} disabled={!meta.online}><PlusIcon /> Create issue</Button></EmptyContent></Empty>
        ) : visibleIssues.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>No matching issues</EmptyTitle><EmptyDescription>Try clearing one or more filters.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => setFilters({})}>Clear filters</Button></EmptyContent></Empty>
        ) : display.viewMode === "board" ? <IssuesBoardView issues={visibleIssues} display={display} lookup={lookup} readOnly={!meta.online} /> : <IssuesListView issues={visibleIssues} display={display} lookup={lookup} readOnly={!meta.online} onPeek={openPeek} />}
        <IssuePeek />
      </div>
    </SidebarInset>
  );
}
