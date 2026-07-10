import { createFileRoute } from "@tanstack/react-router";

import { AccountTeamsSettings } from "../components/settings/AccountTeamsSettings";

function SettingsAccountRoute() {
  return <AccountTeamsSettings />;
}

export const Route = createFileRoute("/settings/account")({
  component: SettingsAccountRoute,
});
