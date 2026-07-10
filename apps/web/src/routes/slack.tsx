import { createFileRoute } from "@tanstack/react-router";

import { SlackWorkspace } from "../slack/SlackWorkspace";

export const Route = createFileRoute("/slack")({
  component: SlackRouteView,
});

function SlackRouteView() {
  return <SlackWorkspace />;
}
