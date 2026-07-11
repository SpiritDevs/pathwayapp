import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`DROP INDEX IF EXISTS idx_issues_mirror_teams_key`;
  yield* sql`DROP INDEX IF EXISTS idx_issues_mirror_issues_identifier`;
  yield* sql`DROP INDEX IF EXISTS idx_issues_mirror_thread_links_thread`;

  yield* sql`CREATE INDEX idx_issues_mirror_teams_key ON issues_mirror_teams(key)`;
  yield* sql`CREATE INDEX idx_issues_mirror_issues_identifier ON issues_mirror_issues(identifier)`;
  yield* sql`CREATE INDEX idx_issues_mirror_thread_links_thread ON issues_mirror_thread_links(environment_id, thread_id)`;
});
