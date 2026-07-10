import { createFileRoute } from "@tanstack/react-router";

import { TrashView } from "../components/issues/TrashView";

export const Route = createFileRoute("/issues/trash")({ component: TrashView });
