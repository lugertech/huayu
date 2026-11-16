use std::{path::Path, process::Stdio, time::Duration};

use tokio::{fs, io::AsyncReadExt, process::Command, sync::Semaphore, time::timeout};

use crate::{ApiError, ApiResult, ErrorCode};

const MAX_DOCUMENT_TEXT_BYTES: usize = 4 * 1024 * 1024;
const CONVERSION_TIMEOUT: Duration = Duration::from_secs(30);
static CONVERSION_WORKERS: Semaphore = Semaphore::const_new(2);

pub(crate) async fn extract(path: &Path, extension: &str, python: &Path) -> ApiResult<String> {
    let (unreadable, too_large) = match extension {
        "pdf" => (
            ErrorCode::PdfTextUnreadable,
            ErrorCode::DocumentTextTooLarge,
        ),
        "docx" => (ErrorCode::InvalidDocx, ErrorCode::DocumentTextTooLarge),
        "xls" | "xlsx" | "ods" => (
            ErrorCode::WorkbookUnreadable,
            ErrorCode::WorkbookTextTooLarge,
        ),
        "txt" | "md" | "csv" | "tsv" | "json" | "yaml" | "yml" | "xml" | "html" | "css" | "js" => {
            let bytes = fs::read(path).await.map_err(ApiError::internal)?;
            let text =
                String::from_utf8(bytes).map_err(|_| ApiError::new(ErrorCode::TextNotUtf8))?;
            let text = text.trim_start_matches('\u{feff}');
            if text.len() > MAX_DOCUMENT_TEXT_BYTES {
                return Err(ApiError::new(ErrorCode::DocumentTextTooLarge));
            }
            return Ok(text.to_owned());
        }
        _ => return Err(ApiError::new(ErrorCode::UnsupportedDocumentFormat)),
    };

    timeout(CONVERSION_TIMEOUT, async {
        let _permit = CONVERSION_WORKERS
            .acquire()
            .await
            .map_err(ApiError::internal)?;
        let file = fs::File::open(path).await.map_err(ApiError::internal)?;
        let mut child = Command::new(python)
            .args([
                "-I",
                "-X",
                "utf8",
                "-c",
                include_str!("document_converter.py"),
            ])
            .arg(extension)
            .stdin(Stdio::from(file.into_std().await))
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| {
                tracing::warn!(%error, "could not start document converter");
                ApiError::new(ErrorCode::DocumentParserUnavailable)
            })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ApiError::internal("missing document converter stdout"))?;
        let mut bytes = Vec::new();
        stdout
            .take(u64::try_from(MAX_DOCUMENT_TEXT_BYTES).map_err(ApiError::internal)? + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(ApiError::internal)?;
        if bytes.len() > MAX_DOCUMENT_TEXT_BYTES {
            return Err(ApiError::new(too_large));
        }
        let status = child.wait().await.map_err(ApiError::internal)?;
        if !status.success() {
            // The adapter reserves exit codes for failures the API can report precisely.
            let code = match status.code() {
                Some(2) => {
                    tracing::warn!("document converter dependencies are unavailable");
                    ErrorCode::DocumentParserUnavailable
                }
                Some(3) => ErrorCode::DocumentContentTooLarge,
                Some(4) => ErrorCode::DocxBodyTooLarge,
                _ => unreadable,
            };
            return Err(ApiError::new(code));
        }
        let text = String::from_utf8(bytes).map_err(ApiError::internal)?;
        if extension == "pdf" && text.trim().is_empty() {
            return Err(ApiError::new(ErrorCode::PdfTextUnreadable));
        }
        Ok(text)
    })
    .await
    .map_err(|_| ApiError::new(ErrorCode::DocumentParseTimeout))?
}
