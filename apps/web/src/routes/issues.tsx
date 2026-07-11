import { createFileRoute, redirect } from "@tanstack/react-router";

import { IssuesPage } from "../components/issues/IssuesPage";

export const Route = createFileRoute("/issues")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: IssuesRouteView,
});

function IssuesRouteView() {
  return <IssuesPage />;
}
