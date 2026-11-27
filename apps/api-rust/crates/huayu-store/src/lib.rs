//! SQLite persistence for projects, templates, files, and recordings.
//! This crate has no HTTP or model-provider dependency.

mod entities;
mod library;

pub use library::LibraryQuery;

use std::collections::HashSet;

use chrono::Utc;
use huayu_core::{Asset, Document, DocumentPatch, Project, Recording, Template, ValidationError};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectOptions, ConnectionTrait, Database,
    DatabaseConnection, DbErr, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, SqlErr,
    TransactionTrait, sea_query::LikeExpr,
};
use uuid::Uuid;

use entities::{asset, project, recording, template};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database operation failed")]
    Database(#[from] DbErr),
    #[error("record not found")]
    NotFound,
    #[error(transparent)]
    Validation(#[from] ValidationError),
    #[error("stored document is invalid")]
    InvalidData(#[from] serde_json::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

fn name_contains(text: &str) -> LikeExpr {
    let escaped = text
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_");
    LikeExpr::new(format!("%{escaped}%")).escape('!')
}

pub struct CollaborationMember {
    pub id: String,
    pub share_token: String,
    pub session_token: String,
    pub removed: bool,
}

#[derive(serde::Deserialize)]
struct BuiltinTemplateSeed {
    id: String,
    name: String,
    description: String,
    recipe: String,
    tag: String,
}

#[derive(Clone)]
pub struct Store {
    db: DatabaseConnection,
}

impl Store {
    /// Opens the dedicated local database and applies versioned migrations transactionally.
    pub async fn open(database_url: &str) -> StoreResult<Self> {
        let mut options = ConnectOptions::new(database_url);
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await?;
        db.execute_unprepared(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        )
        .await?;
        db.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL)",
        )
        .await?;
        for (id, sql) in [
            (
                "0001_initial",
                include_str!("../migrations/0001_initial.sql"),
            ),
            (
                "0002_asset_library",
                include_str!("../migrations/0002_asset_library.sql"),
            ),
            (
                "0003_project_assets",
                include_str!("../migrations/0003_project_assets.sql"),
            ),
            (
                "0004_collaboration_members",
                include_str!("../migrations/0004_collaboration_members.sql"),
            ),
            (
                "0005_recording_project",
                include_str!("../migrations/0005_recording_project.sql"),
            ),
            (
                "0006_library_source",
                include_str!("../migrations/0006_library_source.sql"),
            ),
        ] {
            let migration = db
                .query_one_raw(sea_orm::Statement::from_sql_and_values(
                    sea_orm::DbBackend::Sqlite,
                    "SELECT id FROM schema_migrations WHERE id = ?",
                    [id.into()],
                ))
                .await?;
            if migration.is_none() {
                let transaction = db.begin().await?;
                transaction.execute_unprepared(sql).await?;
                transaction
                    .execute_raw(sea_orm::Statement::from_sql_and_values(
                        sea_orm::DbBackend::Sqlite,
                        "INSERT INTO schema_migrations (id) VALUES (?)",
                        [id.into()],
                    ))
                    .await?;
                transaction.commit().await?;
            }
        }
        let store = Self { db };
        store.seed_templates().await?;
        Ok(store)
    }

    pub async fn projects(&self, search: Option<&str>) -> StoreResult<Vec<Project>> {
        let mut query = project::Entity::find().order_by_desc(project::Column::UpdatedAt);
        if let Some(search) = search.filter(|value| !value.is_empty()) {
            query = query.filter(project::Column::Name.like(name_contains(search)));
        }
        let rows = query.all(&self.db).await?;
        rows.into_iter()
            .map(|mut row| {
                row.document = None;
                project_from_row(row)
            })
            .collect()
    }

    pub async fn project(&self, id: &str) -> StoreResult<Project> {
        let row = project::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        project_from_row(row)
    }

    /// Derives the catalogue from live projects. Deleted shapes and projects disappear without
    /// maintaining a second set of files; full payloads are returned only by the detail API.
    pub async fn project_library_items(
        &self,
    ) -> StoreResult<Vec<huayu_core::project_library::LibraryItem>> {
        let projects = project::Entity::find()
            .order_by_desc(project::Column::UpdatedAt)
            .all(&self.db)
            .await?;
        let mut items = Vec::new();
        for row in projects {
            let project = project_from_row(row)?;
            items.extend(huayu_core::project_library::project_library_items(&project));
        }
        Ok(items)
    }

    /// Associates attachments with a canvas without exposing the global asset library.
    pub async fn grant_project_assets(
        &self,
        project_id: &str,
        assets: &HashSet<String>,
    ) -> StoreResult<()> {
        if assets.is_empty() {
            return Ok(());
        }
        let transaction = self.db.begin().await?;
        for asset_id in assets {
            transaction.execute_raw(sea_orm::Statement::from_sql_and_values(
                sea_orm::DbBackend::Sqlite,
                "INSERT OR IGNORE INTO project_assets (project_id, asset_id) SELECT ?, id FROM assets WHERE id = ?",
                [project_id.into(), asset_id.as_str().into()],
            )).await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn project_asset_ids(&self, project_id: &str) -> StoreResult<HashSet<String>> {
        let rows = self
            .db
            .query_all_raw(sea_orm::Statement::from_sql_and_values(
                sea_orm::DbBackend::Sqlite,
                "SELECT asset_id FROM project_assets WHERE project_id = ?",
                [project_id.into()],
            ))
            .await?;
        rows.into_iter()
            .map(|row| row.try_get("", "asset_id").map_err(StoreError::from))
            .collect()
    }

    pub async fn collaboration_member(
        &self,
        project_id: &str,
        session_token: &str,
    ) -> StoreResult<Option<CollaborationMember>> {
        let row = self.db.query_one_raw(sea_orm::Statement::from_sql_and_values(
            sea_orm::DbBackend::Sqlite,
            "SELECT id, share_token, session_token, removed FROM collaboration_members WHERE project_id = ? AND session_token = ?",
            [project_id.into(), session_token.into()],
        )).await?;
        row.map(|row| {
            Ok(CollaborationMember {
                id: row.try_get("", "id")?,
                share_token: row.try_get("", "share_token")?,
                session_token: row.try_get("", "session_token")?,
                removed: row.try_get("", "removed")?,
            })
        })
        .transpose()
    }

    pub async fn create_collaboration_member(
        &self,
        project_id: &str,
        share_token: &str,
    ) -> StoreResult<CollaborationMember> {
        let member = CollaborationMember {
            id: Uuid::new_v4().to_string(),
            share_token: share_token.to_owned(),
            session_token: Uuid::new_v4().to_string(),
            removed: false,
        };
        self.db.execute_raw(sea_orm::Statement::from_sql_and_values(
            sea_orm::DbBackend::Sqlite,
            "INSERT INTO collaboration_members (id, project_id, share_token, session_token, created_at) VALUES (?, ?, ?, ?, ?)",
            [member.id.as_str().into(), project_id.into(), share_token.into(), member.session_token.as_str().into(), timestamp().into()],
        )).await?;
        Ok(member)
    }

    pub async fn remove_collaboration_member(
        &self,
        project_id: &str,
        member_id: &str,
        share_token: &str,
    ) -> StoreResult<()> {
        let result = self.db.execute_raw(sea_orm::Statement::from_sql_and_values(
            sea_orm::DbBackend::Sqlite,
            "UPDATE collaboration_members SET removed = 1 WHERE project_id = ? AND id = ? AND share_token = ?",
            [project_id.into(), member_id.into(), share_token.into()],
        )).await?;
        if result.rows_affected() == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    pub async fn create_project(
        &self,
        name: &str,
        document: Option<Document>,
        recipe: Option<String>,
    ) -> StoreResult<Project> {
        let name = huayu_core::validate_name(name)?;
        if let Some(document) = &document {
            document.validate()?;
        }
        let now = timestamp();
        let model = project::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(name.to_owned()),
            cover: Set(None),
            document: Set(document.map(serde_json::to_value).transpose()?),
            recipe: Set(recipe),
            revision: Set(0),
            is_collaborative: Set(false),
            share_token: Set(None),
            created_at: Set(now.clone()),
            updated_at: Set(now),
        }
        .insert(&self.db)
        .await?;
        project_from_row(model)
    }

    pub async fn update_project(
        &self,
        id: &str,
        name: Option<&str>,
        cover: Option<Option<String>>,
    ) -> StoreResult<Project> {
        let row = project::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let name = name.map(huayu_core::validate_name).transpose()?;
        let name_changed = name.is_some_and(|name| name != row.name);
        let mut active = row.into_active_model();
        if let Some(name) = name {
            active.name = Set(name.to_owned());
        }
        if let Some(cover) = cover {
            active.cover = Set(cover);
        }
        if name_changed {
            active.updated_at = Set(timestamp());
        }
        project_from_row(active.update(&self.db).await?)
    }

    pub async fn delete_project(&self, id: &str) -> StoreResult<()> {
        let result = project::Entity::delete_by_id(id).exec(&self.db).await?;
        if result.rows_affected == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    /// The caller serializes project mutations; only document records change the document revision.
    pub async fn patch_document(&self, id: &str, patch: &DocumentPatch) -> StoreResult<Project> {
        let row = project::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let mut document: Document = row
            .document
            .clone()
            .map(serde_json::from_value)
            .transpose()?
            .unwrap_or_default();
        if !document.apply(patch)? {
            return project_from_row(row);
        }
        let revision = row.revision;
        let mut active = row.into_active_model();
        active.document = Set(Some(serde_json::to_value(document)?));
        active.revision = Set(revision + 1);
        active.updated_at = Set(timestamp());
        project_from_row(active.update(&self.db).await?)
    }

    pub async fn collaborative(&self, id: &str, enabled: bool) -> StoreResult<Project> {
        let row = project::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let mut active = row.into_active_model();
        active.is_collaborative = Set(enabled);
        active.share_token = Set(if enabled {
            Some(Uuid::new_v4().to_string())
        } else {
            None
        });
        project_from_row(active.update(&self.db).await?)
    }

    pub async fn templates(&self) -> StoreResult<Vec<Template>> {
        let rows = template::Entity::find()
            .order_by_desc(template::Column::CreatedAt)
            .all(&self.db)
            .await?;
        rows.into_iter().map(template_from_row).collect()
    }

    pub async fn fork_template(&self, id: &str) -> StoreResult<Project> {
        let row = template::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let document = row
            .document
            .clone()
            .map(serde_json::from_value)
            .transpose()?;
        let project = self
            .create_project(&row.name, document, row.recipe.clone())
            .await?;
        let count = row.fork_count;
        let mut active = row.into_active_model();
        active.fork_count = Set(count + 1);
        active.update(&self.db).await?;
        Ok(project)
    }

    pub async fn promote_template(
        &self,
        id: &str,
        name: &str,
        description: &str,
        tags: Vec<String>,
    ) -> StoreResult<Template> {
        let project = self.project(id).await?;
        let row = template::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(huayu_core::validate_name(name)?.to_owned()),
            description: Set(description.to_owned()),
            cover: Set(project.cover),
            document: Set(project.document.map(serde_json::to_value).transpose()?),
            recipe: Set(project.recipe),
            tags: Set(serde_json::to_value(tags)?),
            fork_count: Set(0),
            created_at: Set(timestamp()),
        }
        .insert(&self.db)
        .await?;
        template_from_row(row)
    }

    pub async fn delete_template(&self, id: &str) -> StoreResult<()> {
        let result = template::Entity::delete_by_id(id).exec(&self.db).await?;
        if result.rows_affected == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    /// Stores an attachment and its optional canvas association in one transaction.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError::NotFound`] if the target canvas no longer exists, or a
    /// database error if either write fails. Failed writes retain neither record.
    pub async fn save_asset(&self, value: Asset, project_id: Option<&str>) -> StoreResult<Asset> {
        let transaction = self.db.begin().await?;
        if let Some(project_id) = project_id {
            project::Entity::find_by_id(project_id)
                .one(&transaction)
                .await?
                .ok_or(StoreError::NotFound)?;
        }
        asset::ActiveModel {
            id: Set(value.id.clone()),
            name: Set(value.name.clone()),
            mime: Set(value.mime.clone()),
            size: Set(value.size),
            created_at: Set(value.created_at.clone()),
        }
        .insert(&transaction)
        .await?;
        if let Some(project_id) = project_id {
            transaction
                .execute_raw(sea_orm::Statement::from_sql_and_values(
                    sea_orm::DbBackend::Sqlite,
                    "INSERT INTO project_assets (project_id, asset_id) VALUES (?, ?)",
                    [project_id.into(), value.id.as_str().into()],
                ))
                .await?;
        }
        transaction.commit().await?;
        Ok(value)
    }

    pub async fn asset(&self, id: &str) -> StoreResult<Asset> {
        let row = asset::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        Ok(Asset {
            id: row.id,
            name: row.name,
            mime: row.mime,
            size: row.size,
            created_at: row.created_at,
        })
    }

    pub async fn recordings(&self) -> StoreResult<Vec<Recording>> {
        let rows = recording::Entity::find()
            .order_by_desc(recording::Column::CreatedAt)
            .all(&self.db)
            .await?;
        Ok(rows.into_iter().map(recording_from_row).collect())
    }

    pub async fn recording(&self, id: &str) -> StoreResult<Recording> {
        let row = recording::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        Ok(recording_from_row(row))
    }

    /// Saves a recording with an optional association to an existing canvas.
    ///
    /// Returns [`StoreError::NotFound`] if the referenced asset or canvas is missing.
    pub async fn save_recording(
        &self,
        name: &str,
        asset: &Asset,
        duration: f64,
        project_id: Option<String>,
    ) -> StoreResult<Recording> {
        let row = recording::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(huayu_core::validate_name(name)?.to_owned()),
            asset_id: Set(asset.id.clone()),
            project_id: Set(project_id),
            duration: Set(duration),
            size: Set(asset.size),
            transcript: Set(None),
            analysis: Set(None),
            created_at: Set(timestamp()),
        }
        .insert(&self.db)
        .await
        .map_err(|error| match error.sql_err() {
            Some(SqlErr::ForeignKeyConstraintViolation(_)) => StoreError::NotFound,
            _ => StoreError::Database(error),
        })?;
        Ok(recording_from_row(row))
    }

    pub async fn update_recording(
        &self,
        id: &str,
        name: Option<&str>,
        duration: Option<f64>,
        transcript: Option<String>,
        analysis: Option<String>,
    ) -> StoreResult<Recording> {
        let row = recording::Entity::find_by_id(id)
            .one(&self.db)
            .await?
            .ok_or(StoreError::NotFound)?;
        let mut active = row.into_active_model();
        if let Some(name) = name {
            active.name = Set(huayu_core::validate_name(name)?.to_owned());
        }
        if let Some(duration) = duration {
            active.duration = Set(duration);
        }
        if let Some(transcript) = transcript {
            active.transcript = Set(Some(transcript));
        }
        if let Some(analysis) = analysis {
            active.analysis = Set(Some(analysis));
        }
        Ok(recording_from_row(active.update(&self.db).await?))
    }

    pub async fn delete_recording(&self, id: &str) -> StoreResult<()> {
        let result = recording::Entity::delete_by_id(id).exec(&self.db).await?;
        if result.rows_affected == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }

    async fn seed_templates(&self) -> StoreResult<()> {
        let quick_start: Vec<BuiltinTemplateSeed> =
            serde_json::from_str(include_str!("../../../../../templates/quick-start.json"))?;
        let catalog: Vec<BuiltinTemplateSeed> =
            serde_json::from_str(include_str!("../../../../../templates/catalog.json"))?;
        for entry in quick_start.into_iter().chain(catalog) {
            if template::Entity::find_by_id(&entry.id)
                .one(&self.db)
                .await?
                .is_some()
            {
                continue;
            }
            template::ActiveModel {
                id: Set(entry.id),
                name: Set(entry.name),
                description: Set(entry.description),
                cover: Set(None),
                document: Set(None),
                recipe: Set(Some(entry.recipe)),
                tags: Set(serde_json::json!([entry.tag])),
                fork_count: Set(0),
                created_at: Set(timestamp()),
            }
            .insert(&self.db)
            .await?;
        }
        Ok(())
    }
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn project_from_row(row: project::Model) -> StoreResult<Project> {
    Ok(Project {
        id: row.id,
        name: row.name,
        cover: row.cover,
        document: row.document.map(serde_json::from_value).transpose()?,
        recipe: row.recipe,
        revision: row.revision,
        is_collaborative: row.is_collaborative,
        share_token: row.share_token,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn template_from_row(row: template::Model) -> StoreResult<Template> {
    Ok(Template {
        id: row.id,
        name: row.name,
        description: row.description,
        cover: row.cover,
        document: row.document.map(serde_json::from_value).transpose()?,
        recipe: row.recipe,
        tags: serde_json::from_value(row.tags)?,
        fork_count: row.fork_count,
        created_at: row.created_at,
    })
}

fn recording_from_row(row: recording::Model) -> Recording {
    Recording {
        id: row.id,
        name: row.name,
        asset_id: row.asset_id,
        project_id: row.project_id,
        duration: row.duration,
        size: row.size,
        transcript: row.transcript,
        analysis: row.analysis,
        created_at: row.created_at,
    }
}
