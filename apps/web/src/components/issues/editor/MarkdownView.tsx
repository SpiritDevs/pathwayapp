import type { IssueActor } from "@pathwayos/contracts";
import { Fragment, useMemo } from "react";

import ChatMarkdown from "~/components/ChatMarkdown";
import { cn } from "~/lib/utils";

const MENTION_MARKDOWN = /@\[([^\]]+)]\(([^)]+)\)/g;

export function MarkdownView(props: {
  readonly markdown: string;
  readonly actors?: ReadonlyArray<IssueActor>;
  readonly className?: string;
}) {
  const parts = useMemo(() => {
    const output: Array<
      | { kind: "markdown"; value: string }
      | { kind: "mention"; actorId: string; displayName: string }
    > = [];
    let cursor = 0;
    for (const match of props.markdown.matchAll(MENTION_MARKDOWN)) {
      const index = match.index ?? 0;
      if (index > cursor) output.push({ kind: "markdown", value: props.markdown.slice(cursor, index) });
      output.push({
        kind: "mention",
        actorId: match[2] ?? "",
        displayName: match[1] ?? "Unknown",
      });
      cursor = index + match[0].length;
    }
    if (cursor < props.markdown.length) {
      output.push({ kind: "markdown", value: props.markdown.slice(cursor) });
    }
    return output;
  }, [props.markdown]);

  if (parts.length === 0) return null;
  return (
    <div className={cn("min-w-0", props.className)}>
      {parts.map((part, index) => {
        if (part.kind === "markdown") {
          return <ChatMarkdown className="inline" cwd={undefined} key={index} text={part.value} />;
        }
        const actor = props.actors?.find((candidate) => candidate.id === part.actorId);
        return (
          <Fragment key={`${part.actorId}-${index}`}>
            <span className="mx-0.5 inline-flex rounded bg-primary/10 px-1 py-0.5 text-sm font-medium text-primary">
              @{actor?.displayName ?? part.displayName}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
