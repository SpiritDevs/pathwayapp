import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

export const Route = createFileRoute("/issues")({
  component: IssuesRouteView,
});

function IssuesRouteView() {
  return <AppPlaceholderView title="Issues" description="Issue tracking will appear here." />;
}
