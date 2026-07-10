# ADR 0009: Issues UI architecture — dnd-kit, fractional ordering, existing design system

Status: Accepted (2026-07-11)

## Context

The web app already has: dnd-kit (sidebar drag), Base UI + Tailwind v4 + cva
design system (`apps/web/src/components/ui/`), `@legendapp/list`
virtualization, Effect atoms for synced state, zustand + localStorage for
local UI state, TanStack Router file routes, and Lexical.

## Decision

- **Drag & drop**: dnd-kit (`DndContext`/`SortableContext`), reusing the
  sidebar's patterns, for both list (drag within/between groups) and board
  (drag within/between columns, column reorder where the grouping permits).
- **Ordering**: issues carry a **fractional order key** (LexoRank-style
  string) per ordering context; a drag writes one issue's key via a Convex
  mutation. Periodic rebalancing handles key exhaustion. Manual order is a
  sort option; grouped views order within each group.
- **Rendering**: `@legendapp/list` virtualization for list groups and board
  columns; board columns scroll independently.
- **State**: synced issue data flows through the local mirror into Effect
  atoms (same snapshot+delta merge pattern as threads, in
  `packages/client-runtime/src/state/`). Optimistic drag: the client applies
  the move locally and reconciles on the next delta. Current (unsaved)
  filter/display config persists per page in the zustand/localStorage UI
  store; **named saved views** sync via Convex (ADR 0008).
- **Routes**: flesh out `routes/issues.tsx`; add `/issues/$identifier` for
  the full-page detail; peek uses RightPanelSheet.
- **Components**: build on `components/ui/` primitives (menu, popover,
  command, badge, sheet); Lexical for description/comment editors;
  lucide-react icons.
- Keyboard-first parity where cheap: `c` create, `j/k`/arrows navigate,
  `x` multi-select, `s` status, `a` assignee, `p` priority, `l` label,
  cmd+k contextual actions through the existing CommandPalette.

## Consequences

- No new UI dependencies are expected.
- Fractional order keys are allocated client-side at drag time; conflicts
  (two users dropping into the same slot) resolve by Convex write order and
  key uniqueness is not required — ties break by id.
