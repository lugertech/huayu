use axum::{
    Json,
    extract::{Path, State},
};
use huayu_core::project_library::{LibraryItem, project_library_items};

use crate::{ApiError, ApiResult, AppState};

pub(crate) async fn list(State(state): State<AppState>) -> ApiResult<Json<Vec<LibraryItem>>> {
    Ok(Json(state.store.project_library_items().await?))
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    Path((project_id, shape_id)): Path<(String, String)>,
) -> ApiResult<Json<LibraryItem>> {
    let project = state.store.project(&project_id).await?;
    let item = project_library_items(&project)
        .into_iter()
        .find(|item| item.shape_id == shape_id)
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(item))
}
