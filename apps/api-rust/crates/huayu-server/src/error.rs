use axum::{
    Json,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Serialize, de::DeserializeOwned};

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct ApiError {
    status: StatusCode,
    pub(crate) code: &'static str,
    message: String,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_FAILED",
            message,
        )
    }
    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", "未找到对应内容")
    }
    pub fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(%error, "local operation failed");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "SERVER_ERROR",
            "操作失败，请稍后重试",
        )
    }
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    code: &'a str,
    message: &'a str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                code: self.code,
                message: &self.message,
            }),
        )
            .into_response()
    }
}

impl From<huayu_store::StoreError> for ApiError {
    fn from(error: huayu_store::StoreError) -> Self {
        match error {
            huayu_store::StoreError::NotFound => Self::not_found(),
            huayu_store::StoreError::Validation(error) => Self::invalid(error.to_string()),
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
        let Json(value) = Json::<T>::from_request(request, state)
            .await
            .map_err(|_| ApiError::invalid("请求数据格式有误"))?;
        Ok(Self(value))
    }
}
