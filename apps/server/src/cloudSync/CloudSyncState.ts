import { IsoDateTime, NonNegativeInt, ThreadId } from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const SYNC_SCOPE = "orchestration";

export const CloudSyncStateSnapshot = Schema.Struct({
  cutoverSequence: NonNegativeInt,
  acknowledgedSequence: NonNegativeInt,
  lastAttemptAt: Schema.NullOr(IsoDateTime),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type CloudSyncStateSnapshot = typeof CloudSyncStateSnapshot.Type;

export class CloudSyncStateError extends Schema.TaggedErrorClass<CloudSyncStateError>()(
  "CloudSyncStateError",
  {
    operation: Schema.Literals(["initialize", "read", "acknowledge", "record-failure"]),
    cause: Schema.Defect(),
  },
) {}

const isCloudSyncStateError = Schema.is(CloudSyncStateError);

export class CloudSyncState extends Context.Service<
  CloudSyncState,
  {
    readonly initializeFreshCutover: (
      cutoverSequence: number,
      localOnlyThreadIds: ReadonlyArray<ThreadId>,
    ) => Effect.Effect<CloudSyncStateSnapshot, CloudSyncStateError>;
    readonly get: Effect.Effect<CloudSyncStateSnapshot | null, CloudSyncStateError>;
    readonly acknowledge: (
      sequence: number,
    ) => Effect.Effect<CloudSyncStateSnapshot, CloudSyncStateError>;
    readonly recordFailure: (
      message: string,
    ) => Effect.Effect<CloudSyncStateSnapshot, CloudSyncStateError>;
    readonly isLocalOnlyThread: (threadId: ThreadId) => Effect.Effect<boolean, CloudSyncStateError>;
  }
>()("pathwayos/cloudSync/CloudSyncState") {}

const StateRow = Schema.Struct({
  cutoverSequence: NonNegativeInt,
  acknowledgedSequence: NonNegativeInt,
  lastAttemptAt: Schema.NullOr(IsoDateTime),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readState = SqlSchema.findOneOption({
    Request: Schema.Struct({ scope: Schema.String }),
    Result: StateRow,
    execute: ({ scope }) => sql`
      SELECT
        cutover_sequence AS "cutoverSequence",
        acknowledged_sequence AS "acknowledgedSequence",
        last_attempt_at AS "lastAttemptAt",
        last_error AS "lastError",
        updated_at AS "updatedAt"
      FROM cloud_sync_state
      WHERE scope = ${scope}
    `,
  });

  const get: CloudSyncState["Service"]["get"] = readState({ scope: SYNC_SCOPE }).pipe(
    Effect.map((state) => (state._tag === "Some" ? state.value : null)),
    Effect.mapError((cause) => new CloudSyncStateError({ operation: "read", cause })),
  );

  const requireState = Effect.fn("CloudSyncState.requireState")(function* () {
    const state = yield* get;
    if (state === null) {
      return yield* new CloudSyncStateError({
        operation: "read",
        cause: new Error("Cloud sync has not been initialized."),
      });
    }
    return state;
  });

  const initializeFreshCutover: CloudSyncState["Service"]["initializeFreshCutover"] = Effect.fn(
    "CloudSyncState.initializeFreshCutover",
  )(
    function* (cutoverSequence, localOnlyThreadIds) {
      const now = DateTime.formatIso(DateTime.nowUnsafe());
      const normalizedSequence = Math.max(0, Math.floor(cutoverSequence));
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            INSERT OR IGNORE INTO cloud_sync_state (
              scope,
              cutover_sequence,
              acknowledged_sequence,
              last_attempt_at,
              last_error,
              updated_at
            ) VALUES (
              ${SYNC_SCOPE},
              ${normalizedSequence},
              ${normalizedSequence},
              NULL,
              NULL,
              ${now}
            )
          `;
          for (const threadId of localOnlyThreadIds) {
            yield* sql`
              INSERT OR IGNORE INTO cloud_sync_local_only_threads (thread_id, recorded_at)
              VALUES (${threadId}, ${now})
            `;
          }
        }),
      );
      return yield* requireState();
    },
    Effect.mapError((cause) =>
      isCloudSyncStateError(cause)
        ? cause
        : new CloudSyncStateError({ operation: "initialize", cause }),
    ),
  );

  const acknowledge: CloudSyncState["Service"]["acknowledge"] = Effect.fn(
    "CloudSyncState.acknowledge",
  )(
    function* (sequence) {
      const current = yield* requireState();
      const normalized = Math.max(current.acknowledgedSequence, Math.floor(sequence));
      const now = DateTime.formatIso(DateTime.nowUnsafe());
      yield* sql`
        UPDATE cloud_sync_state
        SET acknowledged_sequence = ${normalized},
            last_attempt_at = ${now},
            last_error = NULL,
            updated_at = ${now}
        WHERE scope = ${SYNC_SCOPE}
      `;
      return yield* requireState();
    },
    Effect.mapError((cause) =>
      isCloudSyncStateError(cause)
        ? cause
        : new CloudSyncStateError({ operation: "acknowledge", cause }),
    ),
  );

  const recordFailure: CloudSyncState["Service"]["recordFailure"] = Effect.fn(
    "CloudSyncState.recordFailure",
  )(
    function* (message) {
      yield* requireState();
      const now = DateTime.formatIso(DateTime.nowUnsafe());
      yield* sql`
        UPDATE cloud_sync_state
        SET last_attempt_at = ${now},
            last_error = ${message},
            updated_at = ${now}
        WHERE scope = ${SYNC_SCOPE}
      `;
      return yield* requireState();
    },
    Effect.mapError((cause) =>
      isCloudSyncStateError(cause)
        ? cause
        : new CloudSyncStateError({ operation: "record-failure", cause }),
    ),
  );

  const isLocalOnlyThread: CloudSyncState["Service"]["isLocalOnlyThread"] = (threadId) =>
    sql<{ readonly found: number }>`
      SELECT 1 AS found
      FROM cloud_sync_local_only_threads
      WHERE thread_id = ${threadId}
      LIMIT 1
    `.pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.mapError((cause) => new CloudSyncStateError({ operation: "read", cause })),
    );

  return CloudSyncState.of({
    initializeFreshCutover,
    get,
    acknowledge,
    recordFailure,
    isLocalOnlyThread,
  });
});

export const layer = Layer.effect(CloudSyncState, make);
