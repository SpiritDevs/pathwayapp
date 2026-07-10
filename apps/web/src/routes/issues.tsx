import { createFileRoute } from "@tanstack/react-router";

import { IssuesPage } from "../components/issues/IssuesPage";

export const Route = createFileRoute("/issues")({
  component: IssuesRouteView,
});

function IssuesRouteView() {
  return <IssuesPage />;
}
