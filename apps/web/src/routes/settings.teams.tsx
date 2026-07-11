import { createFileRoute } from "@tanstack/react-router";

import { TeamsSettings } from "../components/settings/TeamsSettings";

export const Route = createFileRoute("/settings/teams")({ component: TeamsSettings });
