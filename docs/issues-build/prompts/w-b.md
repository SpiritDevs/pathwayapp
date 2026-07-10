# Task W-B — Issue detail page, side peek, threaded comments, markdown editor

Work in the current repo root (a pathwayOS worktree). React 19, Lexical, Base UI wrappers.

READ FIRST:
1. docs/issues-build/interface-freeze.md §7 (W-B bullets), §2 — BINDING.
2. /private/tmp/claude-501/-Users-coreybaines-GitHub-pathwayapp/21f4374e-b3a6-4301-813d-f1f7860f47f0/scratchpad/scout-web.md — §2 routing, §4 RightPanelSheet (use it; do NOT touch rightPanelStore), §7 Lexical guidance.
3. Data plane: apps/web/src/state/issues.ts + issueEntities.ts (useIssue, useIssueDetail, buildCommentTree, commands), packages/contracts/src/issues.ts.
4. Exemplars: ComposerPromptEditor.tsx (LexicalComposer structure ONLY — you build RichText), ChatMarkdown.tsx (rendering), RightPanelSheet.tsx, components/ui/*.

DELIVERABLES (ownership — ONLY these; do NOT touch IssuesPage/list/board files except the single onPeek wiring noted below):
- apps/web/src/components/issues/editor/MarkdownEditor.tsx (new, reusable) — Lexical RichTextPlugin editor with @lexical/markdown transformers (headings, bold/italic/code, lists, quotes, links, code blocks), markdown-string value in/out (controlled-ish: value + onChange(markdown)), placeholder, min-height prop, cmd+enter submit callback; @-mention support: a mention plugin listing actors (from useIssueActors) on "@", inserting a mention text node rendered as a chip (serialize as `@[DisplayName](actorId)` in markdown out; keep parsing simple/regex). Check package.json for @lexical/markdown & @lexical/list availability first; if a package is missing, add it to apps/web/package.json dependencies matching the installed lexical version and note it in the summary (do not run bun install).
- MarkdownView.tsx — render issue/comment markdown via ChatMarkdown (or a thin wrapper handling the mention syntax → chip).
- detail/IssueDetailPage.tsx + routes/issues.$identifier.tsx — full page: breadcrumb (team key › identifier), editable title (inline input, blur/enter saves), MarkdownEditor for description (edit-in-place: view mode → click to edit → save/cancel), SubIssuesList (progress bar, rows navigate; "Add sub-issue" quick input), RelationsList (blocks/blocked-by/related/duplicate sections with add-relation popover: search issues), ThreadLinks (linked threads with status chips + "Start work" button when none working → issuesEnvironment.startWork; navigate to thread on click via buildThreadRouteParams if resolvable locally), ActivityFeed (issueEvents rendered as compact timeline lines: "<actor> changed state to Done · 2h"), CommentThread + CommentComposer at bottom. Right properties sidebar: PropertiesSidebar.tsx — state, assignee, priority, labels, estimate (per team scale), due date (ui date input or plain input), cycle, epic, milestone, team (move w/ re-key confirm dialog noting the identifier changes), delete (soft, with toast + undo via restore) / restore banner when deletedAt.
- detail/CommentThread.tsx — threaded (buildCommentTree), reply inline, emoji reactions (small picker popover with ~16 common emoji; reaction chips with counts, toggle on click), edited marker, soft-deleted placeholder ("comment deleted"), agent-author comments get a subtle robot badge next to the name.
- detail/CommentComposer.tsx — MarkdownEditor + submit (cmd+enter), replyTo state.
- detail/IssuePeek.tsx — RightPanelSheet rendering a condensed IssueDetailPage body for a selected issue ref; selected state in a tiny zustand store issuePeekStore.ts (yours): {peekIssueRef, openPeek, closePeek}. Wire W-A's stub: in IssuesListView/IssuesBoardView the onPeek prop is already threaded — pass openPeek where those components are instantiated (IssuesPage). This is your ONLY allowed edit outside your dirs; keep it to prop wiring lines.
- Identifier route resolves via aliases too: lookup by identifier over useIssues; if not found show not-found empty state with search link.

RULES:
- Never use `any`. Density + tone match the rest of the app (text-sm, muted-foreground).
- Do NOT run vp check / typecheck / lint / tests / dev servers / build / bun install. Validation deferred.
- Commit when done: `[new feature] Add issue detail page, peek, and threaded markdown comments`.
- Print final summary: files, deviations + why, any new deps added to package.json.
