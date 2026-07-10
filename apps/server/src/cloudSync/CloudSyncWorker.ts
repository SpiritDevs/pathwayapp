import { CloudSyncBatchResult, type OrchestrationEvent, type ThreadId } from "@pathwayos/contracts";
import { convexHttpActionsUrl } from "@pathwayos/shared/convexUrl";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { RELAY_ENVIRONMENT_CREDENTIAL_SECRET } from "../cloud/config.ts";
import { convexUrlConfig } from "../cloud/publicConfig.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as CloudSyncState from "./CloudSyncState.ts";

const BATCH_SIZE = 200;
const RETRY_DELAY = "5 seconds";

export class CloudSyncWorkerError extends Schema.TaggedErrorClass<CloudSyncWorkerError>()(
  "CloudSyncWorkerError",
  {
    operation: Schema.Literals(["initialize", "read", "publish"]),
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class CloudSyncWorker extends Context.Service<
  CloudSyncWorker,
  {
    readonly syncOnce: Effect.Effect<boolean, CloudSyncWorkerError>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("pathwayos/cloudSync/CloudSyncWorker") {}

export function orchestrationEventThreadId(event: OrchestrationEvent): ThreadId | null {
  const payload = event.payload as { readonly threadId?: unknown };
  if (typeof payload.threadId === "string") return payload.threadId as ThreadId;
  return event.aggregateKind === "thread" ? (event.aggregateId as ThreadId) : null;
}

export function cloudSyncBatchId(
  environmentId: string,
  sequenceFromExclusive: number,
  sequenceToInclusive: number,
): string {
  return `${environmentId}:${sequenceFromExclusive}:${sequenceToInclusive}`;
}

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const stateStore = yield* CloudSyncState.CloudSyncState;

  const readCredential = secrets.get(RELAY_ENVIRONMENT_CREDENTIAL_SECRET).pipe(
    Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes).trim())),
    Effect.map(Option.filter((value) => value.length > 0)),
    Effect.mapError(
      (cause) =>
        new CloudSyncWorkerError({
          operation: "read",
          message: "Could not read the cloud environment credential.",
          cause,
        }),
    ),
  );

  const readHttpActionsUrl = convexUrlConfig.pipe(
    Effect.map(convexHttpActionsUrl),
    Effect.map((value) => Option.fromNullishOr(value)),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

  const ensureCutover = Effect.fn("CloudSyncWorker.ensureCutover")(
    function* () {
      const existing = yield* stateStore.get;
      if (existing !== null) return existing;

      const [active, archived] = yield* Effect.all([
        snapshots.getShellSnapshot(),
        snapshots.getArchivedShellSnapshot(),
      ]);
      const localThreadIds = Array.from(
        new Set([...active.threads, ...archived.threads].map((thread) => thread.id)),
      );
      return yield* stateStore.initializeFreshCutover(
        Math.max(active.snapshotSequence, archived.snapshotSequence),
        localThreadIds,
      );
    },
    Effect.mapError(
      (cause) =>
        new CloudSyncWorkerError({
          operation: "initialize",
          message: "Could not initialize the cloud synchronization cutover.",
          cause,
        }),
    ),
  );

  const syncOnce: CloudSyncWorker["Service"]["syncOnce"] = Effect.gen(function* () {
    const state = yield* ensureCutover();
    const [credential, actionsUrl] = yield* Effect.all([readCredential, readHttpActionsUrl]);
    if (Option.isNone(credential) || Option.isNone(actionsUrl)) return false;

    const persistedEvents = Array.from(
      yield* engine.readEvents(state.acknowledgedSequence).pipe(
        Stream.take(BATCH_SIZE),
        Stream.runCollect,
        Effect.mapError(
          (cause) =>
            new CloudSyncWorkerError({
              operation: "read",
              message: "Could not read pending orchestration events.",
              cause,
            }),
        ),
      ),
    );
    if (persistedEvents.length === 0) return false;

    const publishable = yield* Effect.filter(
      persistedEvents,
      (event) => {
        const threadId = orchestrationEventThreadId(event);
        return threadId === null
          ? Effect.succeed(true)
          : stateStore.isLocalOnlyThread(threadId).pipe(Effect.map((localOnly) => !localOnly));
      },
      { concurrency: 8 },
    ).pipe(
      Effect.mapError(
        (cause) =>
          new CloudSyncWorkerError({
            operation: "read",
            message: "Could not resolve cloud ownership for pending events.",
            cause,
          }),
      ),
    );
    const lastSequence = persistedEvents.at(-1)!.sequence;
    const environmentId = yield* environment.getEnvironmentId;
    const batchId = cloudSyncBatchId(environmentId, state.acknowledgedSequence, lastSequence);
    const payload = {
      environmentId,
      batchId,
      sequenceFromExclusive: state.acknowledgedSequence,
      sequenceToInclusive: lastSequence,
      events: publishable,
      createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
    };

    const result = yield* HttpClientRequest.post(`${actionsUrl.value}/v1/sync/batches`).pipe(
      HttpClientRequest.bearerToken(credential.value),
      HttpClientRequest.bodyJson(payload),
      Effect.flatMap(httpClient.execute),
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(CloudSyncBatchResult)),
      Effect.mapError(
        (cause) =>
          new CloudSyncWorkerError({
            operation: "publish",
            message: "Could not publish the pending cloud synchronization batch.",
            cause,
          }),
      ),
    );
    if (result.batchId !== batchId || result.acceptedThroughSequence !== lastSequence) {
      return yield* new CloudSyncWorkerError({
        operation: "publish",
        message: "The cloud synchronization acknowledgement did not match the published batch.",
      });
    }
    yield* stateStore.acknowledge(result.acceptedThroughSequence).pipe(
      Effect.mapError(
        (cause) =>
          new CloudSyncWorkerError({
            operation: "publish",
            message: "Could not acknowledge the cloud synchronization batch.",
            cause,
          }),
      ),
    );
    return true;
  });

  const start: CloudSyncWorker["Service"]["start"] = Effect.fn("CloudSyncWorker.start")(
    function* () {
      // Establish the migration boundary synchronously. Startup callers run
      // this before any welcome auto-bootstrap commands, so threads already
      // present at upgrade time can never be mistaken for cloud-owned work.
      yield* ensureCutover().pipe(
        Effect.catch((error) =>
          Effect.logError("cloud synchronization cutover initialization failed", { error }),
        ),
      );
      yield* Effect.gen(function* () {
        while (true) {
          const published = yield* syncOnce.pipe(
            Effect.catch((error) =>
              stateStore.recordFailure(error.message).pipe(
                Effect.catch(() => Effect.void),
                Effect.andThen(Effect.logWarning("cloud synchronization attempt failed", error)),
                Effect.as(false),
              ),
            ),
          );
          if (!published) yield* Effect.sleep(RETRY_DELAY);
        }
      }).pipe(Effect.forkScoped);
    },
  );

  return CloudSyncWorker.of({ syncOnce, start });
});

export const layer = Layer.effect(CloudSyncWorker, make);
