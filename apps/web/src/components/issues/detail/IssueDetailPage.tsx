import type { ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronRightIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import {
  useIssue,
  useIssueActors,
  useIssueDetail,
  useIssueRelations,
  useIssueStates,
  useIssueTeams,
} from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { MarkdownView } from "../editor/MarkdownView";
import { ActivityFeed } from "./ActivityFeed";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import { PropertiesSidebar } from "./PropertiesSidebar";
import { RelationsList } from "./RelationsList";
import { SubIssuesList } from "./SubIssuesList";
import { ThreadLinks } from "./ThreadLinks";

export function IssueNotFound(props: { readonly identifier: string }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>Issue not found</EmptyTitle>
        <EmptyDescription>
          No issue or identifier alias matches {props.identifier}.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link to="/issues" />} variant="outline">
          Search issues
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function IssueDetailPage(props: {
  readonly issueRef: ScopedIssueRef;
  readonly condensed?: boolean;
  readonly onClose?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const issue = useIssue(props.issueRef);
  const detail = useIssueDetail(props.issueRef);
  const teams = useIssueTeams(props.issueRef.environmentId);
  const actors = useIssueActors(props.issueRef.environmentId);
  const states = useIssueStates(props.issueRef.environmentId);
  const relations = useIssueRelations(props.issueRef);
  const updateIssue = useAtomCommand(issuesEnvironment.updateIssue);
  const restoreIssue = useAtomCommand(issuesEnvironment.restoreIssue);
  const [title, setTitle] = useState(issue?.title ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(detail?.descriptionMd ?? "");

  useEffect(() => setTitle(issue?.title ?? ""), [issue?.title]);
  useEffect(() => {
    if (!editingDescription) setDescription(detail?.descriptionMd ?? "");
  }, [detail?.descriptionMd, editingDescription]);

  if (!issue) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading issue…
      </div>
    );
  }

  const team = teams.find((candidate) => candidate.id === issue.teamId);
  const saveTitle = () => {
    const next = title.trim();
    setEditingTitle(false);
    if (!next || next === issue.title) {
      setTitle(issue.title);
      return;
    }
    void updateIssue({
      environmentId: props.issueRef.environmentId,
      input: { issueId: issue.id, patch: { title: next } },
    });
  };
  const saveDescription = () => {
    setEditingDescription(false);
    if (description === (detail?.descriptionMd ?? "")) return;
    void updateIssue({
      environmentId: props.issueRef.environmentId,
      input: { issueId: issue.id, patch: { descriptionMd: description } },
    });
  };

  return (
    <div
      className={cn(
        "h-full min-h-0 bg-background",
        props.condensed ? "overflow-y-auto" : "overflow-hidden",
      )}
    >
      {issue.deletedAt ? (
        <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning/8 px-5 py-2 text-sm">
          <span>This issue is in the trash.</span>
          <Button
            onClick={() =>
              void restoreIssue({
                environmentId: props.issueRef.environmentId,
                input: { issueId: issue.id },
              })
            }
            size="xs"
            variant="outline"
          >
            <RotateCcwIcon /> Restore
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "grid h-full min-h-0",
          props.condensed ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_18rem]",
        )}
      >
        <main
          className={cn("min-w-0", props.condensed ? "px-5 py-5" : "overflow-y-auto px-8 py-6")}
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 flex items-center gap-1 text-xs text-muted-foreground">
              <button
                className="hover:text-foreground"
                onClick={() => void navigate({ to: "/issues" })}
                type="button"
              >
                {team?.key ?? "Workspace"}
              </button>
              <ChevronRightIcon className="size-3" />
              <span>{issue.identifier}</span>
              {props.condensed && props.onClose ? (
                <Button
                  aria-label="Close issue peek"
                  className="ml-auto"
                  onClick={props.onClose}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
            <div className="group mb-5">
              {editingTitle ? (
                <Input
                  autoFocus
                  className="text-xl font-semibold"
                  onBlur={saveTitle}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveTitle();
                    if (event.key === "Escape") {
                      setTitle(issue.title);
                      setEditingTitle(false);
                    }
                  }}
                  size="lg"
                  value={title}
                />
              ) : (
                <button
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => setEditingTitle(true)}
                  type="button"
                >
                  <h1 className="min-w-0 flex-1 text-2xl font-semibold leading-tight tracking-tight">
                    {issue.title}
                  </h1>
                  <PencilIcon className="mt-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
            </div>
            <section className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </h2>
                {!editingDescription ? (
                  <Button onClick={() => setEditingDescription(true)} size="xs" variant="ghost">
                    <PencilIcon /> Edit
                  </Button>
                ) : null}
              </div>
              {editingDescription ? (
                <div className="space-y-2">
                  <MarkdownEditor
                    environmentId={props.issueRef.environmentId}
                    minHeight={160}
                    onChange={setDescription}
                    value={description}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => {
                        setDescription(detail?.descriptionMd ?? "");
                        setEditingDescription(false);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button onClick={saveDescription} size="sm">
                      <CheckIcon /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="min-h-16 w-full rounded-md py-1 text-left"
                  onClick={() => setEditingDescription(true)}
                  type="button"
                >
                  {detail?.descriptionMd ? (
                    <MarkdownView actors={actors} markdown={detail.descriptionMd} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Add a description…</span>
                  )}
                </button>
              )}
            </section>
            <SubIssuesList issue={issue} issueRef={props.issueRef} />
            <RelationsList issue={issue} issueRef={props.issueRef} relations={relations} />
            <ThreadLinks issue={issue} issueRef={props.issueRef} />
            <ActivityFeed actors={actors} events={detail?.events ?? []} states={states} />
            <section className="border-t pt-4">
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Discussion
              </h2>
              <CommentThread
                actors={actors}
                comments={detail?.comments ?? []}
                issueRef={props.issueRef}
                reactions={detail?.reactions ?? []}
              />
              <div className="mt-4 border-t pt-4">
                <CommentComposer issueRef={props.issueRef} />
              </div>
            </section>
          </div>
        </main>
        {!props.condensed ? <PropertiesSidebar issue={issue} issueRef={props.issueRef} /> : null}
      </div>
    </div>
  );
}
