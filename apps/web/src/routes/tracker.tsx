import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

export const Route = createFileRoute("/tracker")({
  component: TrackerRouteView,
});

function TrackerRouteView() {
  return <AppPlaceholderView title="Tracker" description="Time tracking will appear here." />;
}
