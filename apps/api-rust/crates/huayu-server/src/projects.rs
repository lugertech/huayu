use axum::{
    Json,
    extract::{
        Path, Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::StatusCode,
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use huayu_core::{Document, DocumentPatch, Project, Template};
use serde::{Deserialize, Deserializer, Serialize};
use tokio::sync::broadcast;

use crate::{ApiError, ApiResult, AppState, error::ApiJson};

#[derive(Default, Deserialize)]
pub(crate) struct ListQuery {
    search: Option<String>,
}

#[derive(Default, Deserialize)]
pub(crate) struct AccessQuery {
    share: Option<String>,
}

fn check_shared_access(project: &Project, query: &AccessQuery) -> ApiResult<()> {
    if let Some(token) = &query.share
        && (!project.is_collaborative || project.share_token.as_ref() != Some(token))
    {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "COLLABORATION_CLOSED",
            "协作链接已关闭或失效",
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateRequest {
    name: String,
    document: Option<Document>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct UpdateRequest {
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_cover")]
    cover: Option<Option<String>>,
}

// An omitted cover preserves it; an explicit null clears it.
fn deserialize_cover<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CollaborativeRequest {
    enabled: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PromoteRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum RoomEvent {
    Snapshot {
        document: Option<Document>,
        revision: i64,
    },
    Patch {
        patch: DocumentPatch,
        revision: i64,
    },
    Deleted,
    Collaboration {
        enabled: bool,
    },
}

pub(crate) async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<Vec<Project>>> {
    Ok(Json(state.store.projects(query.search.as_deref()).await?))
}

pub(crate) async fn create(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<CreateRequest>,
) -> ApiResult<(StatusCode, Json<Project>)> {
    let _guard = state.mutations.lock().await;
    Ok((
        StatusCode::CREATED,
        Json(
            state
                .store
                .create_project(&body.name, body.document, None)
                .await?,
        ),
    ))
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<AccessQuery>,
) -> ApiResult<Json<Project>> {
    let project = state.store.project(&id).await?;
    check_shared_access(&project, &query)?;
    Ok(Json(project))
}

pub(crate) async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<UpdateRequest>,
) -> ApiResult<Json<Project>> {
    if body
        .cover
        .as_ref()
        .and_then(Option::as_ref)
        .is_some_and(|cover| {
            !(cover.starts_with("/api/assets/")
                || (cover.starts_with("data:image/png;base64,") && cover.len() <= 512 * 1024))
        })
    {
        return Err(ApiError::invalid("封面应使用本地图片"));
    }
    let _guard = state.mutations.lock().await;
    Ok(Json(
        state
            .store
            .update_project(&id, body.name.as_deref(), body.cover)
            .await?,
    ))
}

pub(crate) async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let _guard = state.mutations.lock().await;
    state.store.delete_project(&id).await?;
    if let Some(sender) = state.rooms.lock().await.remove(&id) {
        let _ = sender.send(RoomEvent::Deleted);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub(crate) struct Revision {
    revision: i64,
}

pub(crate) async fn patch_document(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<AccessQuery>,
    ApiJson(patch): ApiJson<DocumentPatch>,
) -> ApiResult<Json<Revision>> {
    if serde_json::to_vec(&patch)
        .map_err(ApiError::internal)?
        .len()
        > 32 * 1024 * 1024
    {
        return Err(ApiError::invalid("画布数据过大，请减少嵌入内容后重试"));
    }
    let _guard = state.mutations.lock().await;
    check_shared_access(&state.store.project(&id).await?, &query)?;
    let project = state.store.patch_document(&id, &patch).await?;
    let sender = room_sender(&state, &id).await;
    let _ = sender.send(RoomEvent::Patch {
        patch,
        revision: project.revision,
    });
    Ok(Json(Revision {
        revision: project.revision,
    }))
}

pub(crate) async fn collaborative(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<CollaborativeRequest>,
) -> ApiResult<Json<Project>> {
    let _guard = state.mutations.lock().await;
    let project = state.store.collaborative(&id, body.enabled).await?;
    let _ = room_sender(&state, &id)
        .await
        .send(RoomEvent::Collaboration {
            enabled: body.enabled,
        });
    Ok(Json(project))
}

pub(crate) async fn templates(State(state): State<AppState>) -> ApiResult<Json<Vec<Template>>> {
    Ok(Json(state.store.templates().await?))
}

pub(crate) async fn fork(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<(StatusCode, Json<Project>)> {
    let _guard = state.mutations.lock().await;
    Ok((
        StatusCode::CREATED,
        Json(state.store.fork_template(&id).await?),
    ))
}

pub(crate) async fn promote(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PromoteRequest>,
) -> ApiResult<(StatusCode, Json<Template>)> {
    if body.description.len() > 2000
        || body.tags.len() > 20
        || body.tags.iter().any(|tag| tag.len() > 120)
    {
        return Err(ApiError::invalid("模板描述或标签过长"));
    }
    let _guard = state.mutations.lock().await;
    Ok((
        StatusCode::CREATED,
        Json(
            state
                .store
                .promote_template(&id, &body.name, &body.description, body.tags)
                .await?,
        ),
    ))
}

pub(crate) async fn delete_template(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    if id.starts_with("builtin-") {
        return Err(ApiError::invalid("内置示例无法删除"));
    }
    let _guard = state.mutations.lock().await;
    state.store.delete_template(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn events(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<AccessQuery>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    let guard = state.mutations.lock().await;
    let project = state.store.project(&id).await?;
    check_shared_access(&project, &query)?;
    let receiver = room_sender(&state, &id).await.subscribe();
    drop(guard);
    Ok(
        upgrade
            .on_upgrade(move |socket| stream_events(socket, state, id, project, receiver, query)),
    )
}

async fn room_sender(state: &AppState, id: &str) -> broadcast::Sender<RoomEvent> {
    state
        .rooms
        .lock()
        .await
        .entry(id.to_owned())
        .or_insert_with(|| broadcast::channel(128).0)
        .clone()
}

async fn stream_events(
    socket: WebSocket,
    state: AppState,
    id: String,
    project: Project,
    mut receiver: broadcast::Receiver<RoomEvent>,
    access: AccessQuery,
) {
    let (mut sender, mut incoming) = socket.split();
    let initial = RoomEvent::Snapshot {
        document: project.document,
        revision: project.revision,
    };
    if send_event(&mut sender, &initial).await.is_err() {
        return;
    }
    let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(25));
    loop {
        tokio::select! {
            message = incoming.next() => {
                match message {
                    Some(Ok(Message::Ping(value))) => { if sender.send(Message::Pong(value)).await.is_err() { break; } }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            event = receiver.recv() => {
                let event = match event {
                    Ok(event) => event,
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        match state.store.project(&id).await {
                            Ok(project) => {
                                if check_shared_access(&project, &access).is_err() {
                                    let _ = send_event(&mut sender, &RoomEvent::Collaboration { enabled: false }).await;
                                    break;
                                }
                                RoomEvent::Snapshot { document: project.document, revision: project.revision }
                            },
                            Err(_) => break,
                        }
                    }
                };
                if send_event(&mut sender, &event).await.is_err() { break; }
                if matches!(event, RoomEvent::Deleted) { break; }
                if access.share.is_some() && matches!(event, RoomEvent::Collaboration { enabled: false }) { break; }
            }
            _ = heartbeat.tick() => {
                if sender.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
            }
        }
    }
}

async fn send_event(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    event: &RoomEvent,
) -> Result<(), axum::Error> {
    let content = serde_json::to_string(event).map_err(axum::Error::new)?;
    sender.send(Message::Text(content.into())).await
}
