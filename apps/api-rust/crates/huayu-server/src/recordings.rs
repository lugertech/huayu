use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use huayu_core::Recording;
use serde::Deserialize;

use crate::{ApiError, ApiResult, AppState, ErrorCode, error::ApiJson};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateRecording {
    name: String,
    asset_id: String,
    project_id: Option<String>,
    duration: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct UpdateRecording {
    name: Option<String>,
    duration: Option<f64>,
    transcript: Option<String>,
    analysis: Option<String>,
}

pub(crate) async fn list(State(state): State<AppState>) -> ApiResult<Json<Vec<Recording>>> {
    Ok(Json(state.store.recordings().await?))
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Recording>> {
    Ok(Json(state.store.recording(&id).await?))
}

pub(crate) async fn create(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<CreateRecording>,
) -> ApiResult<(StatusCode, Json<Recording>)> {
    if !body.duration.is_finite() || body.duration < 0.0 {
        return Err(ApiError::new(ErrorCode::InvalidRecordingDuration));
    }
    let asset = state.store.asset(&body.asset_id).await?;
    if !asset.mime.starts_with("video/") && !asset.mime.starts_with("audio/") {
        return Err(ApiError::new(ErrorCode::MediaFileRequired));
    }
    Ok((
        StatusCode::CREATED,
        Json(
            state
                .store
                .save_recording(&body.name, &asset, body.duration, body.project_id)
                .await?,
        ),
    ))
}

pub(crate) async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<UpdateRecording>,
) -> ApiResult<Json<Recording>> {
    if body
        .duration
        .is_some_and(|duration| !duration.is_finite() || duration < 0.0)
    {
        return Err(ApiError::new(ErrorCode::InvalidRecordingDuration));
    }
    if body
        .transcript
        .as_ref()
        .is_some_and(|text| text.len() > 2 * 1024 * 1024)
        || body
            .analysis
            .as_ref()
            .is_some_and(|text| text.len() > 2 * 1024 * 1024)
    {
        return Err(ApiError::new(ErrorCode::AnalysisTooLong));
    }
    Ok(Json(
        state
            .store
            .update_recording(
                &id,
                body.name.as_deref(),
                body.duration,
                body.transcript,
                body.analysis,
            )
            .await?,
    ))
}

pub(crate) async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state.store.delete_recording(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}
