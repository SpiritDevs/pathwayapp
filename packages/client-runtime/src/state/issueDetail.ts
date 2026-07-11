import {
  WS_METHODS,
  type IssueComment,
  type IssueCommentReaction,
  type IssueDetail,
  type IssueEventRecord,
} from "@pathwayos/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { issueKey, parseIssueKey } from "./entities.ts";
import type { ScopedIssueRef } from "./models.ts";
import { createEnvironmentRpcSubscriptionAtomFamily } from "./runtime.ts";

const ISSUE_DETAIL_IDLE_TTL_MS = 5 * 60_000;
const EMPTY_COMMENTS: ReadonlyArray<IssueComment> = Object.freeze([]);
const EMPTY_REACTIONS: ReadonlyArray<IssueCommentReaction> = Object.freeze([]);
const EMPTY_EVENTS: ReadonlyArray<IssueEventRecord> = Object.freeze([]);
const EMPTY_COMMENT_TREE: ReadonlyArray<IssueCommentTreeNode> = Object.freeze([]);

export interface IssueCommentTreeNode {
  readonly comment: IssueComment;
  readonly children: ReadonlyArray<IssueCommentTreeNode>;
}

export function buildCommentTree(
  comments: ReadonlyArray<IssueComment>,
): ReadonlyArray<IssueCommentTreeNode> {
  if (comments.length === 0) return EMPTY_COMMENT_TREE;
  const mutable = new Map<
    IssueComment["id"],
    { readonly comment: IssueComment; readonly children: IssueCommentTreeNode[] }
  >();
  for (const comment of comments) mutable.set(comment.id, { comment, children: [] });
  const roots: IssueCommentTreeNode[] = [];
  for (const comment of comments) {
    const node = mutable.get(comment.id);
    if (node === undefined) continue;
    const parent =
      comment.parentCommentId === null ? undefined : mutable.get(comment.parentCommentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
}

export function createEnvironmentIssueDetailAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const subscriptionAtom = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:issues:detail",
    tag: WS_METHODS.issuesSubscribeDetail,
    idleTtlMs: ISSUE_DETAIL_IDLE_TTL_MS,
  });
  const stateAtomFamily = Atom.family((key: string) => {
    const ref = parseIssueKey(key);
    return subscriptionAtom({
      environmentId: ref.environmentId,
      input: { issueId: ref.issueId },
    });
  });
  const detailAtomFamily = Atom.family((key: string) =>
    Atom.make((get): IssueDetail | null => {
      const item = Option.getOrNull(AsyncResult.value(get(stateAtomFamily(key))));
      return item?.kind === "detail" ? item.detail : null;
    }).pipe(
      Atom.setIdleTTL(ISSUE_DETAIL_IDLE_TTL_MS),
      Atom.withLabel(`environment-issue-detail:${key}`),
    ),
  );
  const commentsAtomFamily = Atom.family((key: string) =>
    Atom.make(
      (get): ReadonlyArray<IssueComment> => get(detailAtomFamily(key))?.comments ?? EMPTY_COMMENTS,
    ).pipe(
      Atom.setIdleTTL(ISSUE_DETAIL_IDLE_TTL_MS),
      Atom.withLabel(`environment-issue-comments:${key}`),
    ),
  );
  const commentTreeAtomFamily = Atom.family((key: string) => {
    let previousComments: ReadonlyArray<IssueComment> = EMPTY_COMMENTS;
    let previousTree: ReadonlyArray<IssueCommentTreeNode> = EMPTY_COMMENT_TREE;
    return Atom.make((get) => {
      const comments = get(commentsAtomFamily(key));
      if (comments === previousComments) return previousTree;
      previousComments = comments;
      previousTree = buildCommentTree(comments);
      return previousTree;
    }).pipe(
      Atom.setIdleTTL(ISSUE_DETAIL_IDLE_TTL_MS),
      Atom.withLabel(`environment-issue-comment-tree:${key}`),
    );
  });
  const reactionsAtomFamily = Atom.family((key: string) =>
    Atom.make(
      (get): ReadonlyArray<IssueCommentReaction> =>
        get(detailAtomFamily(key))?.reactions ?? EMPTY_REACTIONS,
    ).pipe(
      Atom.setIdleTTL(ISSUE_DETAIL_IDLE_TTL_MS),
      Atom.withLabel(`environment-issue-reactions:${key}`),
    ),
  );
  const eventsAtomFamily = Atom.family((key: string) =>
    Atom.make(
      (get): ReadonlyArray<IssueEventRecord> => get(detailAtomFamily(key))?.events ?? EMPTY_EVENTS,
    ).pipe(
      Atom.setIdleTTL(ISSUE_DETAIL_IDLE_TTL_MS),
      Atom.withLabel(`environment-issue-events:${key}`),
    ),
  );

  return {
    stateAtom: (ref: ScopedIssueRef) => stateAtomFamily(issueKey(ref)),
    detailAtom: (ref: ScopedIssueRef) => detailAtomFamily(issueKey(ref)),
    commentsAtom: (ref: ScopedIssueRef) => commentsAtomFamily(issueKey(ref)),
    commentTreeAtom: (ref: ScopedIssueRef) => commentTreeAtomFamily(issueKey(ref)),
    reactionsAtom: (ref: ScopedIssueRef) => reactionsAtomFamily(issueKey(ref)),
    eventsAtom: (ref: ScopedIssueRef) => eventsAtomFamily(issueKey(ref)),
  };
}
