import { createFileRoute } from "@tanstack/react-router";

import { AppPlaceholderView } from "../components/AppPlaceholderView";

export const Route = createFileRoute("/projects")({
  component: ProjectsRouteView,
});

function ProjectsRouteView() {
  return <AppPlaceholderView title="Projects" description="Project management will appear here." />;
}
