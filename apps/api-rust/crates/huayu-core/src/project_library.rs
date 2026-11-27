//! A read-only projection of the files shown in a project's attachment drawer.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Document, Project};

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
}

#[derive(Debug, Serialize)]
pub struct LibraryItemDetail {
    #[serde(flatten)]
    item: LibraryItem,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase", bound(deserialize = "'de: 'a"))]
struct AttachmentProps<'a> {
    name: Option<&'a str>,
    file_name: Option<&'a str>,
    file_extension: Option<&'a str>,
    file_size: Option<u64>,
    src: Option<&'a str>,
    asset_id: Option<&'a str>,
    text: Option<&'a str>,
    result: Option<&'a str>,
    html_content: Option<&'a str>,
}

/// Summaries include attachments across all pages in record order.
pub fn project_library_items(project: &Project) -> Vec<LibraryItem> {
    let Some(document) = &project.document else {
        return Vec::new();
    };
    document
        .store
        .iter()
        .filter_map(|(id, record)| attachment(project, document, id, record).map(|(item, _)| item))
        .collect()
}

/// Looks up one attachment by its record ID and includes its full content when available.
pub fn project_library_item(project: &Project, id: &str) -> Option<LibraryItemDetail> {
    let document = project.document.as_ref()?;
    let record = document.store.get(id)?;
    let (item, content) = attachment(project, document, id, record)?;
    Some(LibraryItemDetail {
        item,
        content: content.map(str::to_owned),
    })
}

fn attachment<'a>(
    project: &Project,
    document: &Document,
    id: &str,
    record: &'a Value,
) -> Option<(LibraryItem, Option<&'a str>)> {
    if record["typeName"] != "shape" || record["isDeleted"] == true {
        return None;
    }
    let props = AttachmentProps::deserialize(&record["props"]).ok()?;
    let asset = props.asset_id.and_then(|id| document.store.get(id));
    let source = props
        .src
        .filter(|value| !value.trim().is_empty())
        .or_else(|| asset.and_then(|asset| asset["props"]["src"].as_str()));
    let (kind, extension, url, content) = match record["type"].as_str() {
        Some("ai-image" | "image") => (LibraryKind::Image, "png", source, None),
        Some("speech") => (LibraryKind::Audio, "mp3", props.src, None),
        Some("website") => (LibraryKind::Website, "html", None, props.html_content),
        Some("file") => (
            LibraryKind::Document,
            "txt",
            props.src,
            props
                .result
                .filter(|value| !value.trim().is_empty())
                .or(props.text),
        ),
        _ => return None,
    };
    let url = url.filter(|value| !value.trim().is_empty());
    let content = content.filter(|value| !value.trim().is_empty());
    if url.is_none() && content.is_none() {
        return None;
    }
    let name = props
        .file_name
        .filter(|value| !value.trim().is_empty())
        .or(props.name.filter(|value| !value.trim().is_empty()))
        .or_else(|| asset.and_then(|asset| asset["props"]["name"].as_str()))
        .unwrap_or("");
    let named_extension = props
        .file_extension
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
    let item = LibraryItem {
        project_id: project.id.clone(),
        project_name: project.name.clone(),
        shape_id: id.to_owned(),
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
    };
    Some((item, content))
}
