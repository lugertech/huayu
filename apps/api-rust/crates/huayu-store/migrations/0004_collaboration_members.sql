CREATE TABLE collaboration_members (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    share_token TEXT NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
