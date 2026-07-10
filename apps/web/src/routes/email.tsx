import { createFileRoute } from "@tanstack/react-router";

import { EmailInboxView } from "../email/EmailInboxView";

export const Route = createFileRoute("/email")({
  component: EmailRouteView,
});

function EmailRouteView() {
  return <EmailInboxView />;
}
