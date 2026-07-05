import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

function HomeRouteView() {
  return (
    <AppPlaceholderView title="Home" description="Your workspace overview will appear here." />
  );
}

export const Route = createFileRoute("/_workspace-chat/")({
  component: HomeRouteView,
});
