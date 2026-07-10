import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS email_sandbox_project_sources (
      source_id TEXT PRIMARY KEY,
      sandbox_id TEXT,
      environment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      logical_project_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      capture_enabled INTEGER NOT NULL DEFAULT 0,
      agent_access_enabled INTEGER NOT NULL DEFAULT 1,
      smtp_port INTEGER,
      port_changed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'disabled',
      last_error TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(environment_id, project_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS email_sandbox_project_sources_environment_status
    ON email_sandbox_project_sources(environment_id, status)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS email_sandbox_messages (
      message_id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL,
      sandbox_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      envelope_from TEXT,
      envelope_to_json TEXT NOT NULL,
      from_json TEXT NOT NULL,
      to_json TEXT NOT NULL,
      cc_json TEXT NOT NULL,
      bcc_json TEXT NOT NULL,
      reply_to_json TEXT NOT NULL,
      subject TEXT NOT NULL,
      received_at TEXT NOT NULL,
      text_body TEXT,
      html_body TEXT,
      text_truncated INTEGER NOT NULL DEFAULT 0,
      html_truncated INTEGER NOT NULL DEFAULT 0,
      attachments_json TEXT NOT NULL,
      raw_mime_path TEXT NOT NULL,
      raw_size_bytes INTEGER NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'pending',
      read_at TEXT,
      last_error TEXT,
      FOREIGN KEY(source_id) REFERENCES email_sandbox_project_sources(source_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS email_sandbox_messages_project_received
    ON email_sandbox_messages(project_id, received_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS email_sandbox_messages_source_received
    ON email_sandbox_messages(source_id, received_at DESC)
  `;
});
