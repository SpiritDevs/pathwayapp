import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_teams (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
      key TEXT NOT NULL, cycle_config_json TEXT NOT NULL, estimate_scale TEXT NOT NULL,
      repo_links_json TEXT NOT NULL, default_repo_logical_key TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_memberships (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_states (
      id TEXT PRIMARY KEY, team_id TEXT, name TEXT NOT NULL, color TEXT NOT NULL,
      category TEXT NOT NULL, position REAL NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_labels (
      id TEXT PRIMARY KEY, team_id TEXT, name TEXT NOT NULL, color TEXT NOT NULL,
      description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_actors (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, display_name TEXT NOT NULL,
      avatar_color TEXT NOT NULL, avatar_url TEXT, owner_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_cycles (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, number INTEGER NOT NULL, name TEXT,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_epics (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
      status TEXT NOT NULL, start_date TEXT, target_date TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_milestones (
      id TEXT PRIMARY KEY, epic_id TEXT NOT NULL, name TEXT NOT NULL, target_date TEXT,
      position REAL NOT NULL, completed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_issues (
      id TEXT PRIMARY KEY, team_id TEXT, number INTEGER NOT NULL, identifier TEXT NOT NULL,
      title TEXT NOT NULL, priority INTEGER NOT NULL, state_id TEXT NOT NULL,
      assignee_actor_id TEXT, creator_actor_id TEXT NOT NULL, label_ids_json TEXT NOT NULL,
      estimate REAL, due_date TEXT, cycle_id TEXT, epic_id TEXT, milestone_id TEXT,
      parent_issue_id TEXT, order_key TEXT NOT NULL, delegation_status TEXT,
      triaged INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_relations (
      id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, relation_type TEXT NOT NULL,
      related_issue_id TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_thread_links (
      id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, environment_id TEXT NOT NULL,
      thread_id TEXT NOT NULL, logical_project_key TEXT, status TEXT NOT NULL,
      created_by_actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_saved_views (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, team_id TEXT, owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL, icon TEXT, color TEXT, filters_json TEXT NOT NULL,
      display_json TEXT NOT NULL, position REAL NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, row_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS issues_mirror_state (
      scope TEXT PRIMARY KEY,
      cursor_seq INTEGER NOT NULL,
      synced_at TEXT,
      last_error TEXT,
      workspace_key TEXT NOT NULL,
      viewer_user_id TEXT
    )
  `;
  yield* sql`
    INSERT OR IGNORE INTO issues_mirror_state (
      scope, cursor_seq, synced_at, last_error, workspace_key, viewer_user_id
    ) VALUES ('issues', 0, NULL, 'Issues mirror has not synchronized yet.', 'WS', NULL)
  `;

  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_teams_key ON issues_mirror_teams(key)`;
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_mirror_memberships_team_actor ON issues_mirror_memberships(team_id, actor_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_states_team_position ON issues_mirror_states(team_id, position)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_labels_team_name ON issues_mirror_labels(team_id, name)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_actors_owner_kind ON issues_mirror_actors(owner_user_id, kind)`;
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_mirror_cycles_team_number ON issues_mirror_cycles(team_id, number)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_epics_status ON issues_mirror_epics(status)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_milestones_epic_position ON issues_mirror_milestones(epic_id, position)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_issues_identifier ON issues_mirror_issues(identifier)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_issues_team_state ON issues_mirror_issues(team_id, state_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_issues_assignee ON issues_mirror_issues(assignee_actor_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_relations_issue ON issues_mirror_relations(issue_id, related_issue_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_thread_links_issue ON issues_mirror_thread_links(issue_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_thread_links_thread ON issues_mirror_thread_links(environment_id, thread_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_issues_mirror_saved_views_owner_position ON issues_mirror_saved_views(owner_user_id, position)`;
});
