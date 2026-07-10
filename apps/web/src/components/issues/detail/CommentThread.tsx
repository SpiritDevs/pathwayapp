import { buildCommentTree, type ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueCommentTreeNode } from "@pathwayos/client-runtime/state/issues";
import type { IssueActor, IssueComment, IssueCommentReaction } from "@pathwayos/contracts";
import { BotIcon, MessageSquareReplyIcon, MoreHorizontalIcon, SmilePlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { useIssuesSnapshotMeta } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { MarkdownView } from "../editor/MarkdownView";
import { CommentComposer } from "./CommentComposer";

const REACTION_EMOJI = ["👍", "👎", "❤️", "🎉", "😄", "😕", "👀", "🚀", "✅", "❌", "🔥", "💯", "🙏", "👏", "🤔", "💡"];

function relativeTime(timestamp: string): string {
  const elapsed = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : new Date(timestamp).toLocaleDateString();
}

function CommentNode(props: {
  readonly node: IssueCommentTreeNode;
  readonly issueRef: ScopedIssueRef;
  readonly actors: ReadonlyArray<IssueActor>;
  readonly reactions: ReadonlyArray<IssueCommentReaction>;
  readonly viewerUserId: string | null;
  readonly depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const toggleReaction = useAtomCommand(issuesEnvironment.toggleReaction);
  const deleteComment = useAtomCommand(issuesEnvironment.deleteComment);
  const comment = props.node.comment;
  const author = props.actors.find((actor) => actor.id === comment.authorActorId);
  const commentReactions = props.reactions.filter(
    (reaction) => reaction.commentId === comment.id && reaction.deletedAt === null,
  );
  const reactionGroups = [...new Set(commentReactions.map((reaction) => reaction.emoji))].map(
    (emoji) => ({
      emoji,
      count: commentReactions.filter((reaction) => reaction.emoji === emoji).length,
      selected: commentReactions.some(
        (reaction) =>
          reaction.emoji === emoji &&
          props.actors.find((actor) => actor.id === reaction.actorId)?.ownerUserId ===
            props.viewerUserId,
      ),
    }),
  );

  const react = (emoji: string) =>
    toggleReaction({
      environmentId: props.issueRef.environmentId,
      input: { commentId: comment.id, emoji },
    });

  return (
    <div className={props.depth > 0 ? "ml-5 border-l pl-4" : ""}>
      <article className="group py-3">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: author?.avatarColor ?? "var(--muted-foreground)" }}
          >
            {author?.displayName.slice(0, 2).toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="truncate font-medium text-foreground">{author?.displayName ?? "Unknown actor"}</span>
              {author?.kind === "agent" ? (
                <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                  <BotIcon className="size-2.5" /> agent
                </span>
              ) : null}
              <span className="text-muted-foreground">· {relativeTime(comment.createdAt)}</span>
              {comment.editedAt ? <span className="text-muted-foreground">edited</span> : null}
            </div>
            {comment.deletedAt ? (
              <p className="mt-1 text-sm italic text-muted-foreground">comment deleted</p>
            ) : (
              <MarkdownView actors={props.actors} className="mt-1" markdown={comment.bodyMd} />
            )}
            {!comment.deletedAt ? (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {reactionGroups.map((reaction) => (
                  <button
                    className={`rounded-full border px-1.5 py-0.5 text-xs transition-colors ${reaction.selected ? "border-primary/40 bg-primary/10" : "border-border hover:bg-accent"}`}
                    key={reaction.emoji}
                    onClick={() => void react(reaction.emoji)}
                    type="button"
                  >
                    {reaction.emoji} {reaction.count}
                  </button>
                ))}
                <Popover>
                  <PopoverTrigger render={<Button aria-label="Add reaction" size="icon-xs" variant="ghost" />}>
                    <SmilePlusIcon />
                  </PopoverTrigger>
                  <PopoverPopup align="start" className="w-52" viewportClassName="grid grid-cols-8 gap-1 p-2">
                    {REACTION_EMOJI.map((emoji) => (
                      <button className="rounded p-1 text-base hover:bg-accent" key={emoji} onClick={() => void react(emoji)} type="button">
                        {emoji}
                      </button>
                    ))}
                  </PopoverPopup>
                </Popover>
                <Button onClick={() => setReplying((value) => !value)} size="xs" variant="ghost">
                  <MessageSquareReplyIcon /> Reply
                </Button>
                <Popover>
                  <PopoverTrigger render={<Button aria-label="Comment actions" className="opacity-0 group-hover:opacity-100" size="icon-xs" variant="ghost" />}>
                    <MoreHorizontalIcon />
                  </PopoverTrigger>
                  <PopoverPopup align="end" className="w-36" viewportClassName="p-1">
                    <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent" onClick={() => void deleteComment({ environmentId: props.issueRef.environmentId, input: { commentId: comment.id } })} type="button">
                      <Trash2Icon className="size-3.5" /> Delete
                    </button>
                  </PopoverPopup>
                </Popover>
              </div>
            ) : null}
            {replying ? (
              <div className="mt-3">
                <CommentComposer
                  compact
                  issueRef={props.issueRef}
                  onCancelReply={() => setReplying(false)}
                  onSubmitted={() => setReplying(false)}
                  replyLabel={author?.displayName}
                  replyTo={comment.id}
                />
              </div>
            ) : null}
          </div>
        </div>
      </article>
      {props.node.children.map((child) => (
        <CommentNode {...props} depth={props.depth + 1} key={child.comment.id} node={child} />
      ))}
    </div>
  );
}

export function CommentThread(props: {
  readonly issueRef: ScopedIssueRef;
  readonly comments: ReadonlyArray<IssueComment>;
  readonly reactions: ReadonlyArray<IssueCommentReaction>;
  readonly actors: ReadonlyArray<IssueActor>;
}) {
  const tree = useMemo(() => buildCommentTree(props.comments), [props.comments]);
  const { viewerUserId } = useIssuesSnapshotMeta(props.issueRef.environmentId);
  if (tree.length === 0) {
    return <p className="py-5 text-sm text-muted-foreground">No comments yet.</p>;
  }
  return (
    <div className="divide-y">
      {tree.map((node) => (
        <CommentNode
          actors={props.actors}
          depth={0}
          issueRef={props.issueRef}
          key={node.comment.id}
          node={node}
          reactions={props.reactions}
          viewerUserId={viewerUserId}
        />
      ))}
    </div>
  );
}
