//! A read-only projection of the files shown in a project's attachment drawer.

use serde::{Deserialize, Serialize};

use crate::Project;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LibraryKind {
    Image,
    Website,
    Document,
    Audio,
}

#[derive(Clone, Debug, Serialize)]
pub struct LibraryItem {
    pub project_id: String,
    pub project_name: String,
    pub shape_id: String,
    pub name: String,
    pub kind: LibraryKind,
    pub extension: String,
    pub size: Option<u64>,
    pub updated_at: String,
    pub url: Option<String>,
    pub excerpt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct AttachmentProps {
    name: Option<String>,
    file_name: Option<String>,
    file_extension: Option<String>,
    file_size: Option<u64>,
    src: Option<String>,
    asset_id: Option<String>,
    text: Option<String>,
    result: Option<String>,
    html_content: Option<String>,
}

/// Matches the attachment types in the canvas's `collectDownloadableFiles`: files, generated
/// websites, images and speech. Includes all pages; other canvas content and unused assets stay out.
pub fn project_library_items(project: &Project) -> Vec<LibraryItem> {
    let Some(document) = &project.document else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for (id, record) in &document.store {
        if record["typeName"] != "shape" || record["isDeleted"] == true {
            continue;
        }
        let Ok(props) = serde_json::from_value::<AttachmentProps>(record["props"].clone()) else {
            continue;
        };
        let asset = props
            .asset_id
            .as_ref()
            .and_then(|id| document.store.get(id));
        let source = props
            .src
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| asset.and_then(|asset| asset["props"]["src"].as_str()));
        let (kind, extension, url, content) = match record["type"].as_str() {
            Some("ai-image" | "image") => (LibraryKind::Image, "png", source, None),
            Some("speech") => (LibraryKind::Audio, "mp3", props.src.as_deref(), None),
            Some("website") => (
                LibraryKind::Website,
                "html",
                None,
                props.html_content.as_deref(),
            ),
            Some("file") => (
                LibraryKind::Document,
                "txt",
                props.src.as_deref(),
                props
                    .result
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .or(props.text.as_deref()),
            ),
            _ => continue,
        };
        let url = url.filter(|value| !value.trim().is_empty());
        let content = content.filter(|value| !value.trim().is_empty());
        if url.is_none() && content.is_none() {
            continue;
        }
        let name = props
            .file_name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .or(props
                .name
                .as_deref()
                .filter(|value| !value.trim().is_empty()))
            .or_else(|| asset.and_then(|asset| asset["props"]["name"].as_str()))
            .unwrap_or("");
        let named_extension = props
            .file_extension
            .as_deref()
            .filter(|value| !value.is_empty())
            .or_else(|| {
                name.rsplit_once('.')
                    .map(|(_, extension)| extension)
                    .filter(|value| !value.is_empty() && value.len() <= 10)
            })
            .filter(|candidate| match kind {
                LibraryKind::Document => true,
                LibraryKind::Image => matches!(
                    candidate.to_ascii_lowercase().as_str(),
                    "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "avif" | "bmp"
                ),
                LibraryKind::Audio => matches!(
                    candidate.to_ascii_lowercase().as_str(),
                    "mp3" | "wav" | "webm" | "m4a" | "flac" | "ogg"
                ),
                _ => false,
            });
        let extension = named_extension
            .unwrap_or(extension)
            .trim_start_matches('.')
            .to_lowercase();
        items.push(LibraryItem {
            project_id: project.id.clone(),
            project_name: project.name.clone(),
            shape_id: id.clone(),
            name: name.to_owned(),
            kind,
            extension,
            size: props.file_size,
            updated_at: project.updated_at.clone(),
            url: url.map(str::to_owned),
            excerpt: if kind == LibraryKind::Document {
                content.unwrap_or("").chars().take(240).collect()
            } else {
                String::new()
            },
            content: content.map(str::to_owned),
        });
    }
    items
}
