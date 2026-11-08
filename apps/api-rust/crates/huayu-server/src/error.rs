use std::collections::BTreeMap;

use axum::{
    Json,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Serialize, de::DeserializeOwned};

use crate::i18n::ApiLocale;

/// Stable API identifiers. Messages and HTTP status are resolved at the response boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidName,
    InvalidDocument,
    NotFound,
    ServerError,
    InvalidRequest,
    CollaborationClosed,
    CollaboratorRemoved,
    SharedResourceForbidden,
    RoomFull,
    SharedScopeForbidden,
    WorkspacePrivate,
    InvalidHost,
    InvalidOrigin,
    MediaFileRequired,
    CoverDecoderUnavailable,
    AudioDecoderUnavailable,
    MediaBusy,
    MediaTimeout,
    CoverTimeout,
    AudioUnreadable,
    RecordingCoverUnavailable,
    InvalidAudioRange,
    NoAudioTrack,
    InvalidRecordingDuration,
    AnalysisTooLong,
    ImageAssetRequired,
    InvalidUpload,
    InvalidFilename,
    UploadInterrupted,
    DocumentUploadTooLarge,
    FileTooLarge,
    UploadRequired,
    PdfTextUnreadable,
    InvalidDocx,
    DocxBodyMissing,
    DocxBodyTooLarge,
    DocxBodyUnreadable,
    InvalidDocxBody,
    WorkbookUnreadable,
    WorksheetUnreadable,
    WorkbookTextTooLarge,
    TextNotUtf8,
    UnsupportedDocumentFormat,
    DocumentTextTooLarge,
    InvalidWebUrl,
    UnsupportedWebUrl,
    WebHostMissing,
    InvalidWebPort,
    WebDnsFailed,
    WebAddressForbidden,
    WebFetchFailed,
    InvalidWebRedirect,
    WebResponseUnreadable,
    WebReadInterrupted,
    WebPageTooLarge,
    TooManyWebRedirects,
    LocalCoverRequired,
    StalePreview,
    CanvasTooLarge,
    TemplateMetadataTooLong,
    BuiltinTemplateReadOnly,
    CollaborationNotOpen,
    MethodNotAllowed,
    RequestTooLarge,
    UnsupportedMediaType,
}

impl ErrorCode {
    fn status(self) -> StatusCode {
        match self {
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::ServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::CollaborationClosed
            | Self::CollaboratorRemoved
            | Self::SharedResourceForbidden
            | Self::SharedScopeForbidden
            | Self::WorkspacePrivate
            | Self::InvalidHost
            | Self::InvalidOrigin => StatusCode::FORBIDDEN,
            Self::RoomFull | Self::StalePreview => StatusCode::CONFLICT,
            Self::CoverDecoderUnavailable | Self::AudioDecoderUnavailable | Self::MediaBusy => {
                StatusCode::SERVICE_UNAVAILABLE
            }
            Self::MediaTimeout | Self::CoverTimeout => StatusCode::GATEWAY_TIMEOUT,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::RequestTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::UnsupportedMediaType => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            _ => StatusCode::UNPROCESSABLE_ENTITY,
        }
    }

    fn params(self) -> BTreeMap<&'static str, usize> {
        match self {
            Self::InvalidName => BTreeMap::from([("min", 1), ("max", huayu_core::MAX_NAME_CHARS)]),
            Self::RoomFull => BTreeMap::from([("max", crate::projects::MAX_COLLABORATORS)]),
            Self::InvalidFilename => BTreeMap::from([("max", crate::files::MAX_FILE_NAME_CHARS)]),
            Self::DocumentUploadTooLarge => {
                BTreeMap::from([("maxMb", crate::files::MAX_DOCUMENT_BYTES / (1024 * 1024))])
            }
            Self::FileTooLarge => {
                BTreeMap::from([("maxMb", crate::files::MAX_UPLOAD_BYTES / (1024 * 1024))])
            }
            _ => BTreeMap::new(),
        }
    }

    fn message(self, locale: ApiLocale) -> &'static str {
        let (zh_cn, en) = match self {
            Self::InvalidName => (
                "名称应包含 {min} 至 {max} 个字符",
                "Names must contain {min}–{max} characters",
            ),
            Self::InvalidDocument => ("画布数据格式有误", "Invalid canvas data"),
            Self::NotFound => ("未找到对应内容", "Content not found"),
            Self::ServerError => (
                "操作失败，请稍后重试",
                "Something went wrong. Please try again shortly.",
            ),
            Self::InvalidRequest => ("请求数据格式有误", "Invalid request data"),
            Self::CollaborationClosed => (
                "协作链接已关闭或失效",
                "This collaboration link is disabled or no longer valid",
            ),
            Self::CollaboratorRemoved => (
                "你已被移出协作，请联系房主",
                "You were removed from this room. Contact the host.",
            ),
            Self::SharedResourceForbidden => (
                "只能使用当前画布中的附件，请从本地上传文件",
                "Use attachments from this canvas or upload a local file",
            ),
            Self::RoomFull => (
                "房间已有 {max} 位协作者，请稍后重试",
                "This room already has {max} collaborators. Try again later.",
            ),
            Self::SharedScopeForbidden => (
                "协作链接仅可访问当前画布",
                "This collaboration link only grants access to its canvas",
            ),
            Self::WorkspacePrivate => (
                "这是私人工作区，请通过协作链接打开画布",
                "This workspace is private. Open a canvas using a collaboration link.",
            ),
            Self::InvalidHost => ("当前访问地址不被允许", "This host is not allowed"),
            Self::InvalidOrigin => ("请求来源不被允许", "This request origin is not allowed"),
            Self::MediaFileRequired => ("请选择视频或音频文件", "Choose a video or audio file"),
            Self::CoverDecoderUnavailable => (
                "暂时无法生成录屏封面",
                "Recording cover generation is unavailable",
            ),
            Self::AudioDecoderUnavailable => (
                "本地音轨解码暂不可用",
                "Local audio decoding is unavailable",
            ),
            Self::MediaBusy => (
                "正在处理其他录屏，请稍后重试",
                "Another recording is being processed. Try again shortly.",
            ),
            Self::MediaTimeout => (
                "音轨读取超时，请重试",
                "Audio decoding timed out. Please try again.",
            ),
            Self::CoverTimeout => (
                "录屏封面读取超时，请重试",
                "Recording cover loading timed out. Please try again.",
            ),
            Self::AudioUnreadable => (
                "无法读取这段录屏的音轨，请确认文件完整且包含声音",
                "Couldn’t read this recording’s audio. Check that the file is complete and contains sound.",
            ),
            Self::RecordingCoverUnavailable => (
                "这段录屏暂时无法显示预览",
                "A preview is unavailable for this recording",
            ),
            Self::InvalidAudioRange => (
                "音轨分段范围有误，单次最多读取五分钟",
                "Invalid audio segment range. Read up to five minutes at a time.",
            ),
            Self::NoAudioTrack => (
                "录屏没有可读取的音轨",
                "The recording has no readable audio track",
            ),
            Self::InvalidRecordingDuration => ("录屏时长有误", "Invalid recording duration"),
            Self::AnalysisTooLong => ("分析文本过长", "Analysis text is too long"),
            Self::ImageAssetRequired => ("请选择可读取的图片素材", "Choose a readable image file"),
            Self::InvalidUpload => ("文件上传数据有误", "Invalid file upload data"),
            Self::InvalidFilename => (
                "文件名不能超过 {max} 个字符，且不能包含无效字符",
                "File names must contain at most {max} characters and no invalid characters",
            ),
            Self::UploadInterrupted => (
                "文件上传中断，请重试",
                "Upload interrupted. Please try again.",
            ),
            Self::DocumentUploadTooLarge => (
                "待解析文档不能超过 {maxMb} MB",
                "Documents to parse can’t exceed {maxMb} MB",
            ),
            Self::FileTooLarge => ("文件不能超过 {maxMb} MB", "Files can’t exceed {maxMb} MB"),
            Self::UploadRequired => ("请选择需要上传的文件", "Choose a file to upload"),
            Self::PdfTextUnreadable => (
                "无法提取 PDF 文本，请使用包含文字的 PDF",
                "Couldn’t extract PDF text. Use a PDF that contains selectable text.",
            ),
            Self::InvalidDocx => ("DOCX 文件格式有误", "Invalid DOCX format"),
            Self::DocxBodyMissing => ("DOCX 中缺少正文", "The DOCX file has no document body"),
            Self::DocxBodyTooLarge => ("DOCX 正文过大", "The DOCX document body is too large"),
            Self::DocxBodyUnreadable => {
                ("无法读取 DOCX 正文", "Couldn’t read the DOCX document body")
            }
            Self::InvalidDocxBody => ("DOCX 正文格式有误", "Invalid DOCX document body"),
            Self::WorkbookUnreadable => ("无法读取工作簿", "Couldn’t read workbook"),
            Self::WorksheetUnreadable => ("无法读取工作表", "Couldn’t read worksheet"),
            Self::WorkbookTextTooLarge => (
                "工作簿文本过多，请拆分文件",
                "The workbook contains too much text. Split it into smaller files.",
            ),
            Self::TextNotUtf8 => (
                "文本文件应使用 UTF-8 编码",
                "Text files must use UTF-8 encoding",
            ),
            Self::UnsupportedDocumentFormat => {
                ("不支持解析该文件格式", "This file format can’t be parsed")
            }
            Self::DocumentTextTooLarge => (
                "文档文本过多，请拆分文件",
                "The document contains too much text. Split it into smaller files.",
            ),
            Self::InvalidWebUrl => ("网页地址格式有误", "Invalid web address"),
            Self::UnsupportedWebUrl => (
                "仅支持不含凭据的 HTTP 或 HTTPS 网页地址",
                "Use an HTTP or HTTPS web address without credentials",
            ),
            Self::WebHostMissing => ("网页地址缺少域名", "The web address is missing a domain"),
            Self::InvalidWebPort => ("网页端口有误", "Invalid web port"),
            Self::WebDnsFailed => ("无法解析网页域名", "Couldn’t resolve the domain"),
            Self::WebAddressForbidden => (
                "该地址无法作为外部网页读取",
                "This address can’t be read as an external page",
            ),
            Self::WebFetchFailed => (
                "无法读取网页，请检查地址后重试",
                "Couldn’t read the page. Check the address and try again.",
            ),
            Self::InvalidWebRedirect => ("网页跳转地址有误", "Invalid redirect URL"),
            Self::WebResponseUnreadable => (
                "网页未返回可读取的内容",
                "The page returned no readable content",
            ),
            Self::WebReadInterrupted => ("网页读取中断", "Page loading interrupted"),
            Self::WebPageTooLarge => ("网页内容过大", "The page is too large"),
            Self::TooManyWebRedirects => ("网页跳转次数过多", "Too many page redirects"),
            Self::LocalCoverRequired => ("封面应使用本地图片", "Use a local image for the cover"),
            Self::StalePreview => (
                "画布已更新，请重试",
                "The canvas has changed. Please try again.",
            ),
            Self::CanvasTooLarge => (
                "画布数据过大，请减少嵌入内容后重试",
                "Canvas data is too large. Reduce embedded content and try again.",
            ),
            Self::TemplateMetadataTooLong => (
                "模板描述或标签过长",
                "The example description or tags are too long",
            ),
            Self::BuiltinTemplateReadOnly => {
                ("内置示例无法删除", "Built-in examples can’t be deleted")
            }
            Self::CollaborationNotOpen => ("协作尚未开启", "Collaboration is not enabled"),
            Self::MethodNotAllowed => (
                "此接口不支持该请求方法",
                "This endpoint does not support this request method",
            ),
            Self::RequestTooLarge => ("请求内容过大", "The request body is too large"),
            Self::UnsupportedMediaType => {
                ("请求内容类型不受支持", "Unsupported request content type")
            }
        };
        match locale {
            ApiLocale::ZhCn => zh_cn,
            ApiLocale::En => en,
        }
    }
}

#[derive(Clone, Copy, Debug, thiserror::Error)]
#[error("{code:?}")]
pub struct ApiError {
    pub(crate) code: ErrorCode,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(code: ErrorCode) -> Self {
        Self { code }
    }

    pub fn not_found() -> Self {
        Self::new(ErrorCode::NotFound)
    }

    pub fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(%error, "local operation failed");
        Self::new(ErrorCode::ServerError)
    }

    pub(crate) fn for_status(status: StatusCode) -> Self {
        Self::new(match status {
            StatusCode::NOT_FOUND => ErrorCode::NotFound,
            StatusCode::METHOD_NOT_ALLOWED => ErrorCode::MethodNotAllowed,
            StatusCode::PAYLOAD_TOO_LARGE => ErrorCode::RequestTooLarge,
            StatusCode::UNSUPPORTED_MEDIA_TYPE => ErrorCode::UnsupportedMediaType,
            status if status.is_server_error() => ErrorCode::ServerError,
            _ => ErrorCode::InvalidRequest,
        })
    }

    pub(crate) fn response(self, locale: ApiLocale) -> Response {
        let params = self.code.params();
        let mut message = self.code.message(locale).to_owned();
        for (name, value) in &params {
            message = message.replace(&format!("{{{name}}}"), &value.to_string());
        }
        (
            self.code.status(),
            Json(ErrorBody {
                code: self.code,
                message,
                params,
            }),
        )
            .into_response()
    }
}

#[derive(Serialize)]
struct ErrorBody {
    code: ErrorCode,
    message: String,
    params: BTreeMap<&'static str, usize>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = self.response(ApiLocale::ZhCn);
        // The outer request middleware renders this error in the negotiated language.
        response.extensions_mut().insert(self);
        response
    }
}

impl From<huayu_store::StoreError> for ApiError {
    fn from(error: huayu_store::StoreError) -> Self {
        match error {
            huayu_store::StoreError::NotFound => Self::not_found(),
            huayu_store::StoreError::Validation(error) => Self::new(match error {
                huayu_core::ValidationError::InvalidName => ErrorCode::InvalidName,
                huayu_core::ValidationError::InvalidDocument => ErrorCode::InvalidDocument,
            }),
            _ => Self::internal(error),
        }
    }
}

pub(crate) struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;
    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) =
            Json::<T>::from_request(request, state)
                .await
                .map_err(|error| match error.status() {
                    StatusCode::PAYLOAD_TOO_LARGE => ApiError::new(ErrorCode::RequestTooLarge),
                    StatusCode::UNSUPPORTED_MEDIA_TYPE => {
                        ApiError::new(ErrorCode::UnsupportedMediaType)
                    }
                    _ => ApiError::new(ErrorCode::InvalidRequest),
                })?;
        Ok(Self(value))
    }
}
