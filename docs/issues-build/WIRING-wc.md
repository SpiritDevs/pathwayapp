# W-C integration wiring

- Add **Triage** (`/issues/triage`) and **Trash** (`/issues/trash`) links to the bottom section of `SavedViewsRail` during the integration pass. W-C intentionally did not edit that W-A-owned file.
- The new TanStack route files are source inputs. `routeTree.gen.ts` must regenerate during the integration build/dev pass; W-C intentionally did not run a build or dev server.
