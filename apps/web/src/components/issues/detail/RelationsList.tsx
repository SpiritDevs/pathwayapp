import type { EnvironmentIssue, ScopedIssueRef } from "@pathwayos/client-runtime/state/issues";
import type { IssueRelation, RelationType } from "@pathwayos/contracts";
import { Link2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { useIssues } from "~/state/issueEntities";
import { issuesEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";

type RelationSection = "blocks" | "blocked-by" | "related" | "duplicate";

function relatedIssueId(
  relation: IssueRelation,
  issueId: EnvironmentIssue["id"],
): EnvironmentIssue["id"] {
  return relation.issueId === issueId ? relation.relatedIssueId : relation.issueId;
}

export function RelationsList(props: {
  readonly issue: EnvironmentIssue;
  readonly issueRef: ScopedIssueRef;
  readonly relations: ReadonlyArray<IssueRelation>;
}) {
  const issues = useIssues();
  const createRelation = useAtomCommand(issuesEnvironment.createRelation);
  const deleteRelation = useAtomCommand(issuesEnvironment.deleteRelation);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<RelationSection>("related");
  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return issues
      .filter(
        (issue) =>
          issue.environmentId === props.issueRef.environmentId &&
          issue.id !== props.issue.id &&
          issue.deletedAt === null &&
          (!normalized ||
            `${issue.identifier} ${issue.title}`.toLocaleLowerCase().includes(normalized)),
      )
      .slice(0, 8);
  }, [issues, props.issue.id, props.issueRef.environmentId, query]);

  const categorized = (kind: RelationSection) =>
    props.relations.filter((relation) => {
      if (kind === "blocked-by")
        return relation.relationType === "blocks" && relation.relatedIssueId === props.issue.id;
      if (kind === "blocks")
        return relation.relationType === "blocks" && relation.issueId === props.issue.id;
      return relation.relationType === kind;
    });

  const add = (candidate: EnvironmentIssue) => {
    const relationType: RelationType = section === "blocked-by" ? "blocks" : section;
    const issueId = section === "blocked-by" ? candidate.id : props.issue.id;
    const relatedIssue = section === "blocked-by" ? props.issue.id : candidate.id;
    return createRelation({
      environmentId: props.issueRef.environmentId,
      input: { issueId, relatedIssueId: relatedIssue, relationType },
    });
  };

  return (
    <section className="border-t py-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Relations
        </h2>
        <Popover>
          <PopoverTrigger render={<Button size="xs" variant="ghost" />}>
            <PlusIcon /> Add
          </PopoverTrigger>
          <PopoverPopup align="end" className="w-80" viewportClassName="space-y-2 p-2">
            <div className="grid grid-cols-4 gap-1">
              {(["blocks", "blocked-by", "related", "duplicate"] as const).map((kind) => (
                <button
                  className={`rounded px-1 py-1 text-[11px] ${section === kind ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                  key={kind}
                  onClick={() => setSection(kind)}
                  type="button"
                >
                  {kind}
                </button>
              ))}
            </div>
            <Input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search issues…"
              type="search"
              value={query}
            />
            <div className="max-h-56 overflow-y-auto">
              {candidates.map((candidate) => (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  key={candidate.id}
                  onClick={() => void add(candidate)}
                  type="button"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {candidate.identifier}
                  </span>
                  <span className="truncate">{candidate.title}</span>
                </button>
              ))}
            </div>
          </PopoverPopup>
        </Popover>
      </div>
      {(["blocks", "blocked-by", "related", "duplicate"] as const).map((kind) => {
        const entries = categorized(kind);
        if (entries.length === 0) return null;
        return (
          <div className="mt-2" key={kind}>
            <div className="mb-1 text-xs capitalize text-muted-foreground">{kind}</div>
            {entries.map((relation) => {
              const related = issues.find(
                (issue) => issue.id === relatedIssueId(relation, props.issue.id),
              );
              return (
                <div className="group flex items-center gap-2 py-1 text-sm" key={relation.id}>
                  <Link2Icon className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {related?.identifier ?? "Issue"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {related?.title ?? "Unavailable issue"}
                  </span>
                  <Button
                    aria-label="Remove relation"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() =>
                      void deleteRelation({
                        environmentId: props.issueRef.environmentId,
                        input: { relationId: relation.id },
                      })
                    }
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              );
            })}
          </div>
        );
      })}
      {props.relations.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No relations.</p>
      ) : null}
    </section>
  );
}
