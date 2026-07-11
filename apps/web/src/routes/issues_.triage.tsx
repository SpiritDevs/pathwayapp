import { createFileRoute, redirect } from "@tanstack/react-router";

import { TriageInbox } from "../components/issues/triage/TriageInbox";

export const Route = createFileRoute("/issues_/triage")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: TriageInbox,
});
