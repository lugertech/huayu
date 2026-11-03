CREATE TABLE asset_folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES asset_folders(id) ON DELETE SET NULL
);

CREATE TABLE library_assets (
    id TEXT PRIMARY KEY NOT NULL REFERENCES assets(id),
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    folder_id TEXT REFERENCES asset_folders(id) ON DELETE SET NULL,
    trashed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX library_assets_folder ON library_assets(folder_id, trashed);
