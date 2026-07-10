import { createFileRoute } from "@tanstack/react-router";

import { AgentActorsSettings } from "../components/settings/AgentActorsSettings";

export const Route = createFileRoute("/settings/agents")({ component: AgentActorsSettings });
