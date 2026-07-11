import { createFileRoute, redirect } from "@tanstack/react-router";

import { IssueDetailPage, IssueNotFound } from "~/components/issues/detail/IssueDetailPage";
import { useActiveEnvironmentId } from "~/state/entities";
import { useIssues } from "~/state/issueEntities";

export const Route = createFileRoute("/issues_/$identifier")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: IssueIdentifierRoute,
});

function IssueIdentifierRoute() {
  const { identifier } = Route.useParams();
  const activeEnvironmentId = useActiveEnvironmentId();
  const issues = useIssues();
  const normalized = identifier.toLocaleLowerCase();
  const matches = issues.filter((issue) => issue.identifier.toLocaleLowerCase() === normalized);
  const issue =
    matches.find((candidate) => candidate.environmentId === activeEnvironmentId) ??
    matches[0] ??
    null;
  if (!issue) return <IssueNotFound identifier={identifier} />;
  return <IssueDetailPage issueRef={{ environmentId: issue.environmentId, issueId: issue.id }} />;
}
