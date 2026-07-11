import { IssuesDomainError, type IssueDetailStreamItem, type IssueId } from "@pathwayos/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import * as IssuesCommandClient from "./IssuesCommandClient.ts";
import { IssuesGateway } from "./IssuesGateway.ts";
import * as IssuesMirrorStore from "./IssuesMirrorStore.ts";
import * as IssuesMirrorWorker from "./IssuesMirrorWorker.ts";

const persistenceError = (message: string) => new IssuesDomainError({ code: "invalid", message });

const clientError = (error: IssuesCommandClient.IssuesCommandClientError) => {
  if (error.message.includes("GUARDRAIL")) {
    return new IssuesDomainError({ code: "guardrail", message: error.message });
  }
  if (error.message.includes("FORBIDDEN") || error.message.includes("ACCESS_DENIED")) {
    return new IssuesDomainError({ code: "forbidden", message: error.message });
  }
  if (error.message.includes("NOT_FOUND")) {
    return new IssuesDomainError({ code: "not-found", message: error.message });
  }
  if (error.message.includes("CONFLICT")) {
    return new IssuesDomainError({ code: "conflict", message: error.message });
  }
  if (error.message.includes("INVALID")) {
    return new IssuesDomainError({ code: "invalid", message: error.message });
  }
  if (error.kind === "offline" || error.status === undefined || error.status >= 500) {
    return new IssuesDomainError({ code: "offline", message: error.message });
  }
  switch (error.status) {
    case 400:
    case 422:
      return new IssuesDomainError({ code: "invalid", message: error.message });
    case 403:
      return new IssuesDomainError({ code: "forbidden", message: error.message });
    case 404:
      return new IssuesDomainError({ code: "not-found", message: error.message });
    case 409:
      return new IssuesDomainError({ code: "conflict", message: error.message });
    default:
      return new IssuesDomainError({ code: "offline", message: error.message });
  }
};

const make = Effect.gen(function* () {
  const client = yield* IssuesCommandClient.IssuesCommandClient;
  const store = yield* IssuesMirrorStore.IssuesMirrorStore;
  const worker = yield* IssuesMirrorWorker.IssuesMirrorWorker;

  const getIssueDetail = (issueId: IssueId) =>
    client.getIssueDetail(issueId).pipe(Effect.mapError(clientError));
  const recoverDetailStream = (
    stream: Stream.Stream<IssueDetailStreamItem, IssuesDomainError>,
  ): Stream.Stream<IssueDetailStreamItem> =>
    stream.pipe(
      Stream.catchCause((cause) =>
        Stream.fromEffect(Effect.logWarning("issues detail stream refresh failed", cause)).pipe(
          Stream.flatMap(() => Stream.empty),
        ),
      ),
    );

  return IssuesGateway.of({
    execute: (command, attribution) => {
      if (attribution.kind === "agent" && command.type === "issue.purge") {
        return Effect.fail(
          new IssuesDomainError({
            code: "forbidden",
            message: "Agents may not permanently purge issues.",
          }),
        );
      }
      return client.execute(command, attribution).pipe(
        Effect.mapError(clientError),
        Effect.tap(() =>
          worker.syncOnce.pipe(
            Effect.catch((error) =>
              Effect.logWarning("issues mirror immediate synchronization failed", error),
            ),
            Effect.forkDetach,
          ),
        ),
      );
    },
    getSnapshot: store.getSnapshot.pipe(
      Effect.mapError(() => persistenceError("Could not read the local issues mirror.")),
    ),
    getIssueDetail,
    changes: store.changes,
    subscribeChanges: store.subscribeChanges,
    detailChanges: (issueId) => {
      const issueUpserts = store.changes.pipe(
        Stream.filter(
          (item) =>
            item.kind === "upsert" &&
            item.entity.table === "issues" &&
            item.entity.row.id === issueId,
        ),
        Stream.debounce(Duration.millis(300)),
        Stream.map(() => undefined),
      );
      const periodic = Stream.fromSchedule(Schedule.spaced("10 seconds")).pipe(
        Stream.map(() => undefined),
      );
      const refreshed = Stream.merge(issueUpserts, periodic).pipe(
        Stream.mapEffect(() => getIssueDetail(issueId)),
        Stream.map((detail): IssueDetailStreamItem => ({ kind: "detail", detail })),
      );
      return recoverDetailStream(
        Stream.concat(
          Stream.fromEffect(getIssueDetail(issueId)).pipe(
            Stream.map((detail): IssueDetailStreamItem => ({ kind: "detail", detail })),
          ),
          refreshed,
        ),
      );
    },
  });
});

export const layer = Layer.effect(IssuesGateway, make);
