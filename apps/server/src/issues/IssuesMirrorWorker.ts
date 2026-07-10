import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import type * as Scope from "effect/Scope";

import * as IssuesCommandClient from "./IssuesCommandClient.ts";
import * as IssuesMirrorStore from "./IssuesMirrorStore.ts";

const POLL_INTERVAL = "2 seconds";
const DELTA_LIMIT = 500;

export class IssuesMirrorWorkerError extends Schema.TaggedErrorClass<IssuesMirrorWorkerError>()(
  "IssuesMirrorWorkerError",
  {
    operation: Schema.Literals(["read", "sync"]),
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class IssuesMirrorWorker extends Context.Service<
  IssuesMirrorWorker,
  {
    readonly syncOnce: Effect.Effect<boolean, IssuesMirrorWorkerError>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("pathwayos/issues/IssuesMirrorWorker") {}

const make = Effect.gen(function* () {
  const client = yield* IssuesCommandClient.IssuesCommandClient;
  const store = yield* IssuesMirrorStore.IssuesMirrorStore;
  const syncSemaphore = yield* Semaphore.make(1);
  const lastOnline = yield* Ref.make<boolean | null>(null);

  const publishStatusTransition = Effect.fn("IssuesMirrorWorker.publishStatusTransition")(
    function* (online: boolean, syncedAt: string | null, lastError: string | null) {
      const previous = yield* Ref.getAndSet(lastOnline, online);
      if (previous !== online) yield* store.setSyncStatus(online, syncedAt, lastError);
    },
  );

  const syncOnceBase = Effect.gen(function* () {
    let cursor = yield* store.getCursor;
    let appliedRows = false;
    let hasMore = true;
    while (hasMore) {
      const delta = yield* client.mirrorDelta({ sinceSeq: cursor, limit: DELTA_LIMIT });
      yield* store.applyDeltaBatch(delta.rows, delta.nextSeq);
      yield* store.setMetadata(delta.workspaceKey, delta.viewerUserId);
      cursor = delta.nextSeq;
      hasMore = delta.hasMore;
      appliedRows = appliedRows || delta.rows.length > 0;
    }
    const syncedAt = DateTime.formatIso(yield* DateTime.now);
    yield* store.setSyncedAt(syncedAt);
    yield* publishStatusTransition(true, syncedAt, null);
    return appliedRows;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new IssuesMirrorWorkerError({
          operation: "sync",
          message: cause instanceof Error ? cause.message : "Issues mirror synchronization failed.",
          cause,
        }),
    ),
  );

  const syncOnce: IssuesMirrorWorker["Service"]["syncOnce"] =
    syncSemaphore.withPermits(1)(syncOnceBase);

  const start: IssuesMirrorWorker["Service"]["start"] = Effect.fn("IssuesMirrorWorker.start")(
    function* () {
      yield* Effect.gen(function* () {
        while (true) {
          yield* syncOnce.pipe(
            Effect.catch((error) =>
              store.getSnapshot.pipe(
                Effect.flatMap((snapshot) =>
                  publishStatusTransition(false, snapshot.syncedAt, error.message),
                ),
                Effect.catch(() => Effect.void),
                Effect.andThen(Effect.logWarning("issues mirror synchronization attempt failed", error)),
              ),
            ),
          );
          yield* Effect.sleep(POLL_INTERVAL);
        }
      }).pipe(Effect.forkScoped);
    },
  );

  return IssuesMirrorWorker.of({ syncOnce, start });
});

export const layer = Layer.effect(IssuesMirrorWorker, make);
