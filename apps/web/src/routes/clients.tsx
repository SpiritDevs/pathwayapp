import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

export const Route = createFileRoute("/clients")({
  component: ClientsRouteView,
});

function ClientsRouteView() {
  return <AppPlaceholderView title="Clients" description="Client records will appear here." />;
}
