import { createFileRoute } from "@tanstack/react-router";

import { TriageInbox } from "../components/issues/triage/TriageInbox";

export const Route = createFileRoute("/issues_/triage")({ component: TriageInbox });
