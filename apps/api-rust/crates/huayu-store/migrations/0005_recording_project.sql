ALTER TABLE recordings ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX recordings_project_id ON recordings(project_id);
