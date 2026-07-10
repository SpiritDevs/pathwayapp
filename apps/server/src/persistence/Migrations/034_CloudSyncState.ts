import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      scope TEXT PRIMARY KEY,
      cutover_sequence INTEGER NOT NULL,
      acknowledged_sequence INTEGER NOT NULL,
      last_attempt_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS cloud_sync_local_only_threads (
      thread_id TEXT PRIMARY KEY,
      recorded_at TEXT NOT NULL
    )
  `;
});
