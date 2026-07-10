import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS email_sandbox_agent_audit (
      audit_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      provider_instance_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      outcome TEXT NOT NULL,
      message_id TEXT,
      result_count INTEGER NOT NULL,
      filter_summary TEXT
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS email_sandbox_agent_audit_project_created
    ON email_sandbox_agent_audit(project_id, created_at DESC)
  `;
});
