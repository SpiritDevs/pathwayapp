import type { IssuesSnapshot, IssuesStreamItem } from "@pathwayos/contracts";

function upsertById<A extends { readonly id: string }>(
  rows: ReadonlyArray<A>,
  row: A,
): ReadonlyArray<A> {
  const index = rows.findIndex((candidate) => candidate.id === row.id);
  if (index < 0) {
    return [...rows, row];
  }
  if (rows[index] === row) {
    return rows;
  }
  const next = rows.slice();
  next[index] = row;
  return next;
}

function removeById<A extends { readonly id: string }>(
  rows: ReadonlyArray<A>,
  id: string,
): ReadonlyArray<A> {
  const index = rows.findIndex((candidate) => candidate.id === id);
  if (index < 0) {
    return rows;
  }
  return [...rows.slice(0, index), ...rows.slice(index + 1)];
}

export function applyIssuesStreamItem(
  snapshot: IssuesSnapshot,
  item: IssuesStreamItem,
): IssuesSnapshot {
  switch (item.kind) {
    case "snapshot":
      return item.snapshot;
    case "status":
      return snapshot.online === item.online && snapshot.syncedAt === item.syncedAt
        ? snapshot
        : { ...snapshot, online: item.online, syncedAt: item.syncedAt };
    case "upsert": {
      if (item.seq <= snapshot.mirrorSeq) return snapshot;
      const base = { ...snapshot, mirrorSeq: item.seq };
      switch (item.entity.table) {
        case "teams":
          return { ...base, teams: upsertById(snapshot.teams, item.entity.row) };
        case "memberships":
          return { ...base, memberships: upsertById(snapshot.memberships, item.entity.row) };
        case "states":
          return { ...base, states: upsertById(snapshot.states, item.entity.row) };
        case "labels":
          return { ...base, labels: upsertById(snapshot.labels, item.entity.row) };
        case "actors":
          return { ...base, actors: upsertById(snapshot.actors, item.entity.row) };
        case "cycles":
          return { ...base, cycles: upsertById(snapshot.cycles, item.entity.row) };
        case "epics":
          return { ...base, epics: upsertById(snapshot.epics, item.entity.row) };
        case "milestones":
          return { ...base, milestones: upsertById(snapshot.milestones, item.entity.row) };
        case "issues":
          return { ...base, issues: upsertById(snapshot.issues, item.entity.row) };
        case "relations":
          return { ...base, relations: upsertById(snapshot.relations, item.entity.row) };
        case "threadLinks":
          return { ...base, threadLinks: upsertById(snapshot.threadLinks, item.entity.row) };
        case "savedViews":
          return { ...base, savedViews: upsertById(snapshot.savedViews, item.entity.row) };
        default:
          return snapshot;
      }
    }
    case "remove": {
      if (item.seq <= snapshot.mirrorSeq) return snapshot;
      const base = { ...snapshot, mirrorSeq: item.seq };
      switch (item.table) {
        case "teams":
          return { ...base, teams: removeById(snapshot.teams, item.id) };
        case "memberships":
          return { ...base, memberships: removeById(snapshot.memberships, item.id) };
        case "states":
          return { ...base, states: removeById(snapshot.states, item.id) };
        case "labels":
          return { ...base, labels: removeById(snapshot.labels, item.id) };
        case "actors":
          return { ...base, actors: removeById(snapshot.actors, item.id) };
        case "cycles":
          return { ...base, cycles: removeById(snapshot.cycles, item.id) };
        case "epics":
          return { ...base, epics: removeById(snapshot.epics, item.id) };
        case "milestones":
          return { ...base, milestones: removeById(snapshot.milestones, item.id) };
        case "issues":
          return { ...base, issues: removeById(snapshot.issues, item.id) };
        case "relations":
          return { ...base, relations: removeById(snapshot.relations, item.id) };
        case "threadLinks":
          return { ...base, threadLinks: removeById(snapshot.threadLinks, item.id) };
        case "savedViews":
          return { ...base, savedViews: removeById(snapshot.savedViews, item.id) };
        default:
          return snapshot;
      }
    }
    default:
      return snapshot;
  }
}
