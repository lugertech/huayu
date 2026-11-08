use std::{
    io::{Cursor, Read},
    path::Path as FilePath,
};

use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, Request, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use calamine::{Reader, open_workbook_auto_from_rs};
use huayu_core::Asset;
use huayu_store::Store;
use serde::Serialize;
use tempfile::TempPath;
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, ErrorCode, access::CanvasAccess};

pub(crate) const MAX_FILE_NAME_CHARS: usize = 240;
pub(crate) const MAX_UPLOAD_BYTES: usize = 512 * 1024 * 1024;
// Multipart boundaries and field headers do not consume the file's byte allowance.
pub(crate) const MAX_UPLOAD_BODY_BYTES: usize = MAX_UPLOAD_BYTES + 64 * 1024;
pub(crate) const MAX_DOCUMENT_BYTES: usize = 10 * 1024 * 1024;

struct PendingAsset {
    asset: Asset,
    path: TempPath,
}

impl PendingAsset {
    async fn save(mut self, store: &Store, project_id: Option<&str>) -> ApiResult<Asset> {
        let asset = store.save_asset(self.asset, project_id).await?;
        self.path.disable_cleanup(true);
        Ok(asset)
    }
}

#[derive(Serialize)]
pub(crate) struct AssetResponse {
    #[serde(flatten)]
    pub asset: Asset,
    pub url: String,
}

impl From<Asset> for AssetResponse {
    fn from(asset: Asset) -> Self {
        Self {
            url: format!("/api/assets/{}", asset.id),
            asset,
        }
    }
}

pub(crate) async fn upload(
    State(state): State<AppState>,
    Extension(access): Extension<CanvasAccess>,
    multipart: Multipart,
) -> ApiResult<Json<AssetResponse>> {
    let upload = receive_asset(&state, multipart, MAX_UPLOAD_BYTES).await?;
    let _guard = state.mutations.lock().await;
    access.ensure_active(&state).await?;
    Ok(Json(
        upload.save(&state.store, access.project_id()).await?.into(),
    ))
}

/// Streams one upload to a UUID-named file. Client paths never influence the filesystem path.
async fn receive_asset(
    state: &AppState,
    mut multipart: Multipart,
    max_bytes: usize,
) -> ApiResult<PendingAsset> {
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::new(ErrorCode::InvalidUpload))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let name = field
            .file_name()
            .unwrap_or("file")
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("file")
            .to_owned();
        if name.chars().count() > MAX_FILE_NAME_CHARS || name.contains(['\r', '\n', '\0']) {
            return Err(ApiError::new(ErrorCode::InvalidFilename));
        }
        let mime = field.content_type().map(str::to_owned).unwrap_or_else(|| {
            mime_guess::from_path(&name)
                .first_or_octet_stream()
                .to_string()
        });
        let id = Uuid::new_v4().to_string();
        let path = state.data_dir.join("assets").join(&id);
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .await
            .map_err(ApiError::internal)?;
        let path = TempPath::try_from_path(path).map_err(ApiError::internal)?;
        let transfer: ApiResult<usize> = async {
            let mut size: usize = 0;
            while let Some(chunk) = field
                .chunk()
                .await
                .map_err(|_| ApiError::new(ErrorCode::UploadInterrupted))?
            {
                size += chunk.len();
                if size > max_bytes {
                    return Err(ApiError::new(if max_bytes == MAX_DOCUMENT_BYTES {
                        ErrorCode::DocumentUploadTooLarge
                    } else {
                        ErrorCode::FileTooLarge
                    }));
                }
                file.write_all(&chunk).await.map_err(ApiError::internal)?;
            }
            file.flush().await.map_err(ApiError::internal)?;
            Ok(size)
        }
        .await;
        drop(file);
        let size = i64::try_from(transfer?).map_err(ApiError::internal)?;
        let asset = Asset {
            id,
            name,
            mime,
            size,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        return Ok(PendingAsset { asset, path });
    }
    Err(ApiError::new(ErrorCode::UploadRequired))
}

pub(crate) async fn download(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> ApiResult<Response> {
    Uuid::parse_str(&id).map_err(|_| ApiError::not_found())?;
    let asset = state.store.asset(&id).await?;
    let response = ServeFile::new(state.data_dir.join("assets").join(&id))
        .oneshot(request)
        .await
        .map_err(ApiError::internal)?;
    let mut response = response.map(Body::new).into_response();
    let mime = HeaderValue::from_str(&asset.mime).map_err(ApiError::internal)?;
    response.headers_mut().insert(header::CONTENT_TYPE, mime);
    let inline = asset.mime.starts_with("image/")
        || asset.mime.starts_with("video/")
        || asset.mime.starts_with("audio/");
    let disposition = if inline { "inline" } else { "attachment" };
    let encoded_name: String =
        url::form_urlencoded::byte_serialize(asset.name.as_bytes()).collect();
    let value = format!(
        "{disposition}; filename=\"download\"; filename*=UTF-8''{}",
        encoded_name.replace('+', "%20")
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&value).map_err(ApiError::internal)?,
    );
    response.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; sandbox"),
    );
    Ok(response)
}

#[derive(Serialize)]
pub(crate) struct ParsedDocument {
    asset: AssetResponse,
    text: String,
}

pub(crate) async fn parse(
    State(state): State<AppState>,
    Extension(access): Extension<CanvasAccess>,
    multipart: Multipart,
) -> ApiResult<Json<ParsedDocument>> {
    let upload = receive_asset(&state, multipart, MAX_DOCUMENT_BYTES).await?;
    let extension = FilePath::new(&upload.asset.name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    let bytes = tokio::fs::read(&*upload.path)
        .await
        .map_err(ApiError::internal)?;
    let text = tokio::task::spawn_blocking(move || extract_document(&bytes, &extension))
        .await
        .map_err(ApiError::internal)??;
    let _guard = state.mutations.lock().await;
    access.ensure_active(&state).await?;
    Ok(Json(ParsedDocument {
        asset: upload.save(&state.store, access.project_id()).await?.into(),
        text,
    }))
}

fn extract_document(bytes: &[u8], extension: &str) -> ApiResult<String> {
    let text = match extension {
        "pdf" => pdf_extract::extract_text_from_mem(bytes)
            .map_err(|_| ApiError::new(ErrorCode::PdfTextUnreadable))?,
        "docx" => {
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
                .map_err(|_| ApiError::new(ErrorCode::InvalidDocx))?;
            let file = archive
                .by_name("word/document.xml")
                .map_err(|_| ApiError::new(ErrorCode::DocxBodyMissing))?;
            if file.size() > 8 * 1024 * 1024 {
                return Err(ApiError::new(ErrorCode::DocxBodyTooLarge));
            }
            let mut xml = String::new();
            file.take(8 * 1024 * 1024 + 1)
                .read_to_string(&mut xml)
                .map_err(|_| ApiError::new(ErrorCode::DocxBodyUnreadable))?;
            let document = roxmltree::Document::parse(&xml)
                .map_err(|_| ApiError::new(ErrorCode::InvalidDocxBody))?;
            let mut text = String::new();
            for paragraph in document.descendants().filter(|node| node.has_tag_name("p")) {
                for node in paragraph
                    .descendants()
                    .filter(|node| node.has_tag_name("t"))
                {
                    if let Some(value) = node.text() {
                        text.push_str(value);
                    }
                }
                text.push('\n');
            }
            text
        }
        "xlsx" | "xls" | "ods" => {
            let mut workbook = open_workbook_auto_from_rs(Cursor::new(bytes.to_vec()))
                .map_err(|_| ApiError::new(ErrorCode::WorkbookUnreadable))?;
            let mut text = String::new();
            for name in workbook.sheet_names() {
                let range = workbook
                    .worksheet_range(&name)
                    .map_err(|_| ApiError::new(ErrorCode::WorksheetUnreadable))?;
                text.push_str(&format!("[{name}]\n"));
                for row in range.rows() {
                    text.push_str(
                        &row.iter()
                            .map(ToString::to_string)
                            .collect::<Vec<_>>()
                            .join("\t"),
                    );
                    text.push('\n');
                    if text.len() > 4 * 1024 * 1024 {
                        return Err(ApiError::new(ErrorCode::WorkbookTextTooLarge));
                    }
                }
            }
            text
        }
        "txt" | "md" | "csv" | "tsv" | "json" | "yaml" | "yml" | "xml" | "html" | "css" | "js" => {
            String::from_utf8(bytes.to_vec())
                .map_err(|_| ApiError::new(ErrorCode::TextNotUtf8))?
                .trim_start_matches('\u{feff}')
                .to_owned()
        }
        _ => return Err(ApiError::new(ErrorCode::UnsupportedDocumentFormat)),
    };
    if text.len() > 4 * 1024 * 1024 {
        return Err(ApiError::new(ErrorCode::DocumentTextTooLarge));
    }
    Ok(text)
}
