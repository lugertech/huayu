//! Domain types for local projects. Provider credentials have no server-side representation.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_DOCUMENT_RECORDS: usize = 50_000;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub store: BTreeMap<String, Value>,
    pub schema: Value,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentPatch {
    #[serde(default)]
    pub upsert: Vec<Value>,
    #[serde(default)]
    pub remove: Vec<String>,
    pub schema: Option<Value>,
    pub client_id: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("名称应包含 1 至 120 个字符")]
    InvalidName,
    #[error("画布数据格式有误")]
    InvalidDocument,
}

/// Checks document records at the persistence boundary; session records are never stored.
pub fn validate_record(record: &Value) -> Result<&str, ValidationError> {
    let id = record.get("id").and_then(Value::as_str);
    let type_name = record.get("typeName").and_then(Value::as_str);
    match (id, type_name) {
        (Some(id), Some("shape" | "asset" | "binding" | "page" | "document"))
            if !id.is_empty() && id.len() < 256 =>
        {
            Ok(id)
        }
        _ => Err(ValidationError::InvalidDocument),
    }
}

impl Document {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.store.len() > MAX_DOCUMENT_RECORDS {
            return Err(ValidationError::InvalidDocument);
        }
        for (id, record) in &self.store {
            if validate_record(record)? != id {
                return Err(ValidationError::InvalidDocument);
            }
        }
        Ok(())
    }

    /// Applies a record-level patch without replacing unrelated concurrent edits.
    /// Duplicate upserts use the last record; changes are compared with the final document.
    ///
    /// # Errors
    ///
    /// Returns [`ValidationError::InvalidDocument`] for invalid records or exceeded limits,
    /// leaving all existing records and the schema unchanged.
    pub fn apply(&mut self, patch: &DocumentPatch) -> Result<bool, ValidationError> {
        if patch.upsert.len() + patch.remove.len() > MAX_DOCUMENT_RECORDS
            || patch.client_id.len() > 120
        {
            return Err(ValidationError::InvalidDocument);
        }
        let mut updates: BTreeMap<&str, Option<&Value>> =
            patch.remove.iter().map(|id| (id.as_str(), None)).collect();
        for record in &patch.upsert {
            updates.insert(validate_record(record)?, Some(record));
        }
        let mut record_count = self.store.len();
        for (id, record) in &updates {
            match (self.store.contains_key(*id), record.is_some()) {
                (true, false) => record_count -= 1,
                (false, true) => record_count += 1,
                _ => {}
            }
        }
        if record_count > MAX_DOCUMENT_RECORDS {
            return Err(ValidationError::InvalidDocument);
        }
        let mut changed = false;
        for (id, record) in updates {
            match record {
                Some(record) if self.store.get(id) != Some(record) => {
                    self.store.insert(id.to_owned(), record.clone());
                    changed = true;
                }
                None => changed |= self.store.remove(id).is_some(),
                _ => {}
            }
        }
        if let Some(schema) = &patch.schema
            && self.schema != *schema
        {
            self.schema = schema.clone();
            changed = true;
        }
        Ok(changed)
    }
}

pub fn validate_name(name: &str) -> Result<&str, ValidationError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(ValidationError::InvalidName);
    }
    Ok(name)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub cover: Option<String>,
    pub document: Option<Document>,
    pub recipe: Option<String>,
    pub revision: i64,
    pub is_collaborative: bool,
    pub share_token: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cover: Option<String>,
    pub document: Option<Document>,
    pub recipe: Option<String>,
    pub tags: Vec<String>,
    pub fork_count: i64,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AssetFolder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub asset_count: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LibraryAsset {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    pub width: i32,
    pub height: i32,
    pub folder_id: Option<String>,
    pub trashed: bool,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LibraryAssetDetails {
    pub name: String,
    pub folder_id: Option<String>,
    pub trashed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Recording {
    pub id: String,
    pub name: String,
    pub asset_id: String,
    pub duration: f64,
    pub size: i64,
    pub transcript: Option<String>,
    pub analysis: Option<String>,
    pub created_at: String,
}
