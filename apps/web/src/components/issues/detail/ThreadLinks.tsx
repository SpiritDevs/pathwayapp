import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, PlayIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useThreadRefs, useThreadShell } from "~/state/entities";
import { useIssueThreadLinks } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { buildThreadRouteParams } from "~/threadRoutes";

function ThreadLinkRow(props: {
  readonly threadRef: ReturnType<typeof useThreadRefs>[number] | null;
  readonly status: "linked" | "working" | "closed";
  readonly onOpen: () => void;
}) {
  const shell = useThreadShell(props.threadRef);
  return (
    <button
      className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-primary"
      disabled={!props.threadRef}
      onClick={props.onOpen}
      type="button"
    >
      <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {shell?.title ??
          (props.threadRef ? props.threadRef.threadId : "Thread unavailable locally")}
      </span>
      <Badge size="sm" variant={props.status === "working" ? "success" : "secondary"}>
        {props.status}
      </Badge>
    </button>
  );
}

export function ThreadLinks(props: {
  readonly issue: EnvironmentIssue;
  readonly issueRef: ScopedIssueRef;
}) {
  const navigate = useNavigate();
  const refs = useThreadRefs();
  const links = useIssueThreadLinks(props.issueRef);
  const startWork = useAtomCommand(issuesEnvironment.startWork);
  const hasWorking = links.some((link) => link.status === "working");
  return (
    <section className="border-t py-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Linked threads
        </h2>
        {!hasWorking ? (
          <Button
            onClick={() =>
              void startWork({
                environmentId: props.issueRef.environmentId,
                input: { issueId: props.issue.id },
              })
            }
            size="xs"
            variant="outline"
          >
            <PlayIcon /> Start work
          </Button>
        ) : null}
      </div>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked threads.</p>
      ) : null}
      {links.map((link) => {
        const threadRef =
          refs.find(
            (ref) => ref.environmentId === link.environmentId && ref.threadId === link.threadId,
          ) ?? null;
        return (
          <ThreadLinkRow
            key={link.id}
            onOpen={() => {
              if (threadRef)
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(threadRef),
                });
            }}
            status={link.status}
            threadRef={threadRef}
          />
        );
      })}
    </section>
  );
}
