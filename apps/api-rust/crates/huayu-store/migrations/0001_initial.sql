CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    cover TEXT,
    document TEXT,
    recipe TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    is_collaborative BOOLEAN NOT NULL DEFAULT FALSE,
    share_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX projects_updated_at ON projects(updated_at);
CREATE TABLE templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cover TEXT,
    document TEXT,
    recipe TEXT,
    tags TEXT NOT NULL,
    fork_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE assets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE recordings (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    duration REAL NOT NULL,
    size INTEGER NOT NULL,
    transcript TEXT,
    analysis TEXT,
    created_at TEXT NOT NULL
);
