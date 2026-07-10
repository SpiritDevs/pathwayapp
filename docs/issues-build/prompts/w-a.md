# Task W-A — Issues page: grouped list + Kanban board + filters + saved views

Work in the current repo root (a pathwayOS worktree). React 19, Tailwind v4, Base UI wrappers in components/ui, dnd-kit, @legendapp/list.

READ FIRST:
1. docs/issues-build/interface-freeze.md §7 (W-A bullets), §1 (enums), §2 (types) — BINDING.
2. /private/tmp/claude-501/-Users-coreybaines-GitHub-pathwayapp/21f4374e-b3a6-4301-813d-f1f7860f47f0/scratchpad/scout-web.md — §2 routing, §3 design system, §5 dnd-kit patterns, §6 LegendList, §9 CommandPalette/hotkeys, §10 zustand persist.
3. The already-built data plane: apps/web/src/state/issues.ts + issueEntities.ts (hooks), packages/client-runtime/src/state/issuesCommands.ts (command wrappers), packages/contracts/src/issues.ts, packages/shared fractionalIndex (orderKeyBetween).
4. Exemplars: components/Sidebar.tsx (dnd), chat/MessagesTimeline.tsx (LegendList), ui/* (menu, popover, command, badge, tooltip, kbd), appNavRoutes.ts, uiStateStore.ts / rightPanelStore.ts (persist patterns).

DELIVERABLES (ownership — ONLY these; do NOT touch components/issues/detail/** or editor/** or triage/**):
- apps/web/src/components/issues/IssuesPage.tsx — page shell: header (title, view switcher list/board via ui toggle-group, "New issue" button), FilterBar, DisplayOptions popover, active saved-view name, offline banner when snapshot meta online=false ("Issues are read-only while offline"), triage chip linking to /issues/triage showing untriaged count.
- IssuesListView.tsx — grouped, virtualized (LegendList per group; groups collapsible), rows via IssueRow.tsx (priority icon, identifier muted mono, title, label chips, due date w/ overdue color, estimate, assignee avatar, state icon; click → navigate to /issues/$identifier; a peek affordance is a stub callback prop `onPeek(issueRef)` wired later by W-B — keep the prop, call it on spacebar). Drag: dnd-kit SortableContext per group, cross-group drop sets the group's dimension (state/assignee/priority/label/cycle/epic/team) + orderKey via orderKeyBetween of neighbors, issuesEnvironment.updateIssue. Multi-select with x / shift-click; bulk context menu (state, priority, assignee, labels, delete).
- IssuesBoardView.tsx — columns from current groupBy (default state; columns ordered by state position / priority order / etc.), horizontally scrollable, each column a LegendList; IssueCard.tsx (title, identifier, priority, labels, avatar, sub-issue progress if parent); dnd-kit with a DragOverlay (net-new — card ghost while dragging), drop into column = set dimension + orderKey between neighbors; optional swimlanes rows when display.swimlaneBy != none (grid of column×lane cells; keep simple, one LegendList per cell only when lanes active); column headers show count + "+" quick-create (inline title input creating issue with that column's dimension preset).
- FilterBar.tsx — chip-based filters per IssueFilterConfig (team, state, assignee, priority, label, cycle, epic, text search input debounced 250ms); each chip a ui/popover with command-style list; clear-all.
- DisplayOptions.tsx — popover: view mode, groupBy, swimlaneBy, orderBy, showCompleted, showTriage, showSubIssues toggles.
- SavedViewsRail.tsx — secondary sidebar for /issues: pinned + all saved views (personal & team sections), create/update ("Save view"/"Update view" from current config), rename/delete via context menu, position drag optional (skip if time-costly: use position field + up/down menu items). Wire secondary sidebar visibility: extend appNavRoutes.ts shouldShowSecondarySidebar for /issues + render the rail in the same layout slot settings uses (inspect AppSidebarLayout and follow how settings/email do it; minimal diff).
- issuesUiStateStore.ts (apps/web/src, new) — zustand persist (pattern B, key "pathwayos:issues-ui-state:v1", version 1): current filters/display (when no saved view selected), selectedViewId, collapsed group ids, board column collapsed ids. Selecting a saved view loads its config; editing config with a view selected marks it dirty (enable "Update view").
- routes/issues.tsx — replace placeholder: render IssuesPage. (routeTree.gen.ts regenerates itself; do not hand-edit it.)
- CommandPalette.tsx — add "Create issue" (opens quick-create dialog: title input + team select + priority; ui/dialog) and "Go to issue" (search by identifier/title over useIssues, navigate). Keep edits minimal and additive.
- Keyboard (window-keydown idiom from scout §9, respect defaultPrevented + isCommandPaletteOpen): c = quick-create dialog, j/k or arrows = move selection, x = toggle multi-select, s/a/p/l = open state/assignee/priority/label popover for selection, cmd+enter in quick-create = create.
- Empty states: no teams yet → CTA to /settings/teams; no issues → friendly empty (ui/empty).

QUALITY BAR: this is the flagship surface — Linear-tight density (text-sm, muted identifiers, 28px rows-ish), zero layout shift while dragging, snappy optimistic feel (mutations round-trip; rely on mirror re-emit; use local pending state only where reordering would visibly snap back — acceptable v1: none). Priority icons: use lucide (SignalHigh/SignalMedium/SignalLow/AlertTriangle for urgent, Minus for none) mapped in a shared issuePresentation.ts (also yours: priority labels/icons, state category icons/colors, avatar color hashing).

RULES:
- Never use `any`. Match ui/* composition idioms; cn() for classes; lucide per-icon imports.
- Do NOT run vp check / typecheck / lint / tests / dev servers / build. Validation deferred.
- Commit when done: `[new feature] Add issues list and board views with filters and saved views`.
- Print final summary: files, deviations + why.
