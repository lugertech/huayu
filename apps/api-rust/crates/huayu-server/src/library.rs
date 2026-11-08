use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use huayu_core::{AssetFolder, LibraryAsset, LibraryAssetDetails};
use huayu_store::LibraryQuery;
use serde::{Deserialize, Serialize};

use crate::{ApiError, ApiResult, AppState, ErrorCode, error::ApiJson};

#[derive(Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AssetSort {
    #[default]
    Newest,
    Oldest,
}

#[derive(Default, Deserialize)]
pub(crate) struct ListAssets {
    #[serde(default)]
    search: String,
    folder_id: Option<String>,
    #[serde(default)]
    unfiled: bool,
    #[serde(default)]
    trash: bool,
    #[serde(default)]
    sort: AssetSort,
    #[serde(default)]
    offset: u64,
    limit: Option<u64>,
}

#[derive(Serialize)]
pub(crate) struct AssetList {
    assets: Vec<LibraryAsset>,
    total: u64,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListAssets>,
) -> ApiResult<Json<AssetList>> {
    let (assets, total) = state
        .store
        .library_assets(LibraryQuery {
            search: query.search.trim(),
            folder_id: query.folder_id.as_deref(),
            unfiled: query.unfiled,
            trashed: query.trash,
            oldest: matches!(query.sort, AssetSort::Oldest),
            offset: query.offset,
            limit: query.limit.unwrap_or(50).clamp(1, 100),
        })
        .await?;
    Ok(Json(AssetList { assets, total }))
}

#[derive(Deserialize)]
pub(crate) struct CreateAsset {
    asset_id: String,
    width: i32,
    height: i32,
    #[serde(flatten)]
    details: LibraryAssetDetails,
}

pub(crate) async fn create(
    State(state): State<AppState>,
    ApiJson(input): ApiJson<CreateAsset>,
) -> ApiResult<StatusCode> {
    let file = state.store.asset(&input.asset_id).await?;
    if input.width < 0
        || input.height < 0
        || (file.mime.starts_with("image/") && (input.width == 0 || input.height == 0))
    {
        return Err(ApiError::new(ErrorCode::ImageAssetRequired));
    }
    state
        .store
        .add_library_asset(input.asset_id, input.width, input.height, input.details)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(details): ApiJson<LibraryAssetDetails>,
) -> ApiResult<StatusCode> {
    state.store.update_library_asset(&id, details).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<LibraryAsset>> {
    let asset = state.store.library_asset(&id).await?;
    if asset.trashed {
        return Err(ApiError::not_found());
    }
    Ok(Json(asset))
}

pub(crate) async fn folders(State(state): State<AppState>) -> ApiResult<Json<Vec<AssetFolder>>> {
    Ok(Json(state.store.asset_folders().await?))
}

#[derive(Deserialize)]
pub(crate) struct CreateFolder {
    name: String,
    parent_id: Option<String>,
}

pub(crate) async fn create_folder(
    State(state): State<AppState>,
    ApiJson(input): ApiJson<CreateFolder>,
) -> ApiResult<Json<AssetFolder>> {
    Ok(Json(
        state
            .store
            .create_asset_folder(&input.name, input.parent_id)
            .await?,
    ))
}

#[derive(Deserialize)]
pub(crate) struct RenameFolder {
    name: String,
}

pub(crate) async fn rename_folder(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(input): ApiJson<RenameFolder>,
) -> ApiResult<StatusCode> {
    state.store.rename_asset_folder(&id, &input.name).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn remove_folder(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state.store.remove_asset_folder(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}
