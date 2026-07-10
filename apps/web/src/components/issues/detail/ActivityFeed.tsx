import type { IssueActor, IssueEventRecord, IssueWorkflowState } from "@pathwayos/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function relativeTime(timestamp: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function eventDescription(event: IssueEventRecord, states: ReadonlyArray<IssueWorkflowState>): string {
  const payload = isRecord(event.payload) ? event.payload : {};
  const stateId = typeof payload.stateId === "string" ? payload.stateId : null;
  const state = stateId ? states.find((candidate) => candidate.id === stateId) : null;
  if (event.kind.includes("state")) return `changed state to ${state?.name ?? "a new state"}`;
  if (event.kind.includes("assignee")) return "changed the assignee";
  if (event.kind.includes("priority")) return "changed the priority";
  if (event.kind.includes("comment")) return "added a comment";
  if (event.kind.includes("relation")) return "updated a relation";
  if (event.kind.includes("thread")) return "linked a thread";
  if (event.kind.includes("create")) return "created the issue";
  return event.kind.replaceAll(".", " ").replaceAll("_", " ");
}

export function ActivityFeed(props: {
  readonly events: ReadonlyArray<IssueEventRecord>;
  readonly actors: ReadonlyArray<IssueActor>;
  readonly states: ReadonlyArray<IssueWorkflowState>;
}) {
  if (props.events.length === 0) return null;
  return (
    <section className="border-t py-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</h2>
      <div className="space-y-2">
        {props.events.map((event) => {
          const actor = props.actors.find((candidate) => candidate.id === event.actorId);
          return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" key={event.id}>
              <span className="size-1.5 shrink-0 rounded-full bg-border" />
              <span>
                <span className="font-medium text-foreground/80">{actor?.displayName ?? "System"}</span>{" "}
                {eventDescription(event, props.states)} · {relativeTime(event.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
