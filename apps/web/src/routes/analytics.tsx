import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsRouteView,
});

function AnalyticsRouteView() {
  return (
    <AppPlaceholderView title="Analytics" description="Analytics dashboards will appear here." />
  );
}
