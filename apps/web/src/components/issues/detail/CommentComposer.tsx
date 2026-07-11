import type { ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueCommentId } from "@pathwayos/contracts";
import { SendIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { MarkdownEditor } from "../editor/MarkdownEditor";

export function CommentComposer(props: {
  readonly issueRef: ScopedIssueRef;
  readonly replyTo?: IssueCommentId | null;
  readonly replyLabel?: string | undefined;
  readonly onCancelReply?: (() => void) | undefined;
  readonly onSubmitted?: (() => void) | undefined;
  readonly compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createComment = useAtomCommand(issuesEnvironment.createComment);
  const canSubmit = body.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await createComment({
      environmentId: props.issueRef.environmentId,
      input: {
        issueId: props.issueRef.issueId,
        bodyMd: body.trim(),
        ...(props.replyTo ? { parentCommentId: props.replyTo } : {}),
      },
    });
    setSubmitting(false);
    if (result._tag === "Failure") return;
    setBody("");
    props.onSubmitted?.();
  };

  return (
    <div className="space-y-2">
      {props.replyTo ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Replying to {props.replyLabel ?? "comment"}</span>
          <Button
            aria-label="Cancel reply"
            onClick={props.onCancelReply}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
      <MarkdownEditor
        environmentId={props.issueRef.environmentId}
        minHeight={props.compact ? 72 : 96}
        onChange={setBody}
        onSubmit={() => void submit()}
        placeholder={props.replyTo ? "Write a reply…" : "Leave a comment…"}
        value={body}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">⌘ Enter to send</span>
        <Button disabled={!canSubmit} onClick={() => void submit()} size="sm">
          <SendIcon />
          {submitting ? "Sending…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
