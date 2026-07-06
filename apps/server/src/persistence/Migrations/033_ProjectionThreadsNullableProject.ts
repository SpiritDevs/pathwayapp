import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
    PRAGMA table_info(projection_threads)
  `;

  const projectIdColumn = columns.find((column) => column.name === "project_id");
  if (!projectIdColumn || projectIdColumn.notnull === 0) {
    return;
  }

  yield* sql`DROP INDEX IF EXISTS idx_projection_threads_project_id`;
  yield* sql`DROP INDEX IF EXISTS idx_projection_threads_project_archived_at`;
  yield* sql`DROP INDEX IF EXISTS idx_projection_threads_project_deleted_created`;
  yield* sql`DROP INDEX IF EXISTS idx_projection_threads_shell_active`;
  yield* sql`DROP INDEX IF EXISTS idx_projection_threads_shell_archived`;

  yield* sql`ALTER TABLE projection_threads RENAME TO projection_threads__project_nullable_old`;

  yield* sql`
    CREATE TABLE projection_threads (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      branch TEXT,
      worktree_path TEXT,
      latest_turn_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      runtime_mode TEXT NOT NULL DEFAULT 'full-access',
      interaction_mode TEXT NOT NULL DEFAULT 'default',
      model_selection_json TEXT NOT NULL,
      archived_at TEXT,
      latest_user_message_at TEXT,
      pending_approval_count INTEGER NOT NULL DEFAULT 0,
      pending_user_input_count INTEGER NOT NULL DEFAULT 0,
      has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0
    )
  `;

  yield* sql`
    INSERT INTO projection_threads (
      thread_id,
      project_id,
      title,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      deleted_at,
      runtime_mode,
      interaction_mode,
      model_selection_json,
      archived_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan
    )
    SELECT
      thread_id,
      project_id,
      title,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      deleted_at,
      runtime_mode,
      interaction_mode,
      model_selection_json,
      archived_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan
    FROM projection_threads__project_nullable_old
  `;

  yield* sql`DROP TABLE projection_threads__project_nullable_old`;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id
    ON projection_threads(project_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_archived_at
    ON projection_threads(project_id, archived_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_deleted_created
    ON projection_threads(project_id, deleted_at, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_shell_active
    ON projection_threads(deleted_at, archived_at, project_id, created_at, thread_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_shell_archived
    ON projection_threads(deleted_at, archived_at, project_id, thread_id)
  `;
});
