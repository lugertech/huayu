-- Keep a source snapshot even after the original project is renamed or deleted.
ALTER TABLE library_assets ADD COLUMN source_project_id TEXT;
ALTER TABLE library_assets ADD COLUMN source_project_name TEXT;
