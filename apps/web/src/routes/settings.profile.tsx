import { createFileRoute } from "@tanstack/react-router";

import { ProfileSettingsPanel } from "../components/settings/ProfileSettings";

function SettingsProfileRoute() {
  return <ProfileSettingsPanel />;
}

export const Route = createFileRoute("/settings/profile")({
  component: SettingsProfileRoute,
});
