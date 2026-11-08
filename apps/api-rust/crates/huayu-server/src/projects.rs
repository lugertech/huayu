use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

use axum::{
    Extension, Json,
    extract::{
        Path, Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::StatusCode,
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use huayu_core::{Document, DocumentPatch, Project, Template, validate_record};
use serde::{Deserialize, Deserializer, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult, AppState,
    access::{CanvasAccess, project_assets, referenced_assets},
    error::ApiJson,
};

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
    cover_revision: Option<i64>,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PointerTool {
    Pointer,
    Laser,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Pointer {
    x: f64,
    y: f64,
    tool: PointerTool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PointerButton {
    Down,
    #[default]
    Up,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Presence {
    pointer: Option<Pointer>,
    button: PointerButton,
    selected_element_ids: HashMap<String, bool>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct Peer {
    id: Uuid,
    member_id: String,
    role: MemberRole,
    joined_at: i64,
    #[serde(flatten)]
    presence: Presence,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MemberRole {
    Host,
    Collaborator,
}

const MAX_COLLABORATORS: usize = 15;
const MAX_DOCUMENT_PATCH_BYTES: usize = 32 * 1024 * 1024;
// The live message adds a type and optional target UUID around the document patch.
const MAX_CLIENT_MESSAGE_BYTES: usize = MAX_DOCUMENT_PATCH_BYTES + 1024;

pub(crate) struct Room {
    sender: broadcast::Sender<RoomEvent>,
    peers: HashMap<Uuid, Peer>,
}

impl Room {
    pub(crate) fn can_admit(&self, member_id: Option<&str>) -> bool {
        let members: HashSet<_> = self
            .peers
            .values()
            .filter(|peer| peer.role == MemberRole::Collaborator)
            .map(|peer| peer.member_id.as_str())
            .collect();
        member_id.is_some_and(|id| members.contains(id)) || members.len() < MAX_COLLABORATORS
    }
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum ClientEvent {
    SceneUpdate { patch: DocumentPatch },
    SceneInit { target: Uuid, patch: DocumentPatch },
    Presence { presence: Presence },
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
    Peers {
        client_id: Uuid,
        peers: Vec<Peer>,
        max_collaborators: usize,
    },
    MemberRemoved {
        member_id: String,
    },
    RoomFull {
        max_collaborators: usize,
    },
    PeerJoined {
        peer: Peer,
    },
    PeerLeft {
        client_id: Uuid,
    },
    Presence {
        peer: Peer,
    },
    SceneUpdate {
        client_id: Uuid,
        target: Option<Uuid>,
        patch: DocumentPatch,
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
    // Preview validation and document writes share this lock, so a late
    // thumbnail cannot overwrite a cover rendered from a newer document.
    if body.cover.is_some()
        && let Some(revision) = body.cover_revision
        && state.store.project(&id).await?.revision != revision
    {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "STALE_PREVIEW",
            "画布已更新，请重试",
        ));
    }
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
    if let Some(room) = state.rooms.lock().await.remove(&id) {
        let _ = room.sender.send(RoomEvent::Deleted);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub(crate) struct Revision {
    revision: i64,
}

pub(crate) async fn patch_document(
    State(state): State<AppState>,
    Extension(access): Extension<CanvasAccess>,
    Path(id): Path<String>,
    Query(query): Query<AccessQuery>,
    ApiJson(patch): ApiJson<DocumentPatch>,
) -> ApiResult<Json<Revision>> {
    if serde_json::to_vec(&patch)
        .map_err(ApiError::internal)?
        .len()
        > MAX_DOCUMENT_PATCH_BYTES
    {
        return Err(ApiError::invalid("画布数据过大，请减少嵌入内容后重试"));
    }
    let _guard = state.mutations.lock().await;
    access.ensure_active(&state).await?;
    let current = state.store.project(&id).await?;
    let query = AccessQuery {
        share: access.share_token().map(str::to_owned).or(query.share),
    };
    check_shared_access(&current, &query)?;
    let assets = referenced_assets(patch.upsert.iter());
    access.validate_assets(&assets)?;
    let project = state.store.patch_document(&id, &patch).await?;
    if access.share_token().is_none() {
        state.store.grant_project_assets(&id, &assets).await?;
    }
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

pub(crate) async fn remove_member(
    State(state): State<AppState>,
    Path((id, member_id)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let _guard = state.mutations.lock().await;
    let project = state.store.project(&id).await?;
    let token = project
        .share_token
        .as_deref()
        .filter(|_| project.is_collaborative)
        .ok_or_else(|| ApiError::invalid("协作尚未开启"))?;
    state
        .store
        .remove_collaboration_member(&id, &member_id, token)
        .await?;
    if let Some(room) = state.rooms.lock().await.get_mut(&id) {
        room.peers.retain(|_, peer| peer.member_id != member_id);
        let _ = room.sender.send(RoomEvent::MemberRemoved { member_id });
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn events(
    State(state): State<AppState>,
    Extension(access): Extension<CanvasAccess>,
    Path(id): Path<String>,
    Query(query): Query<AccessQuery>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    let guard = state.mutations.lock().await;
    let project = state.store.project(&id).await?;
    check_shared_access(&project, &query)?;
    access.ensure_active(&state).await?;
    let receiver = room_sender(&state, &id).await.subscribe();
    drop(guard);
    Ok(upgrade
        .max_message_size(MAX_CLIENT_MESSAGE_BYTES)
        .max_frame_size(MAX_CLIENT_MESSAGE_BYTES)
        .on_upgrade(move |socket| stream_events(socket, state, id, project, receiver, access)))
}

async fn room_sender(state: &AppState, id: &str) -> broadcast::Sender<RoomEvent> {
    state
        .rooms
        .lock()
        .await
        .entry(id.to_owned())
        .or_insert_with(|| Room {
            sender: broadcast::channel(256).0,
            peers: HashMap::new(),
        })
        .sender
        .clone()
}

async fn stream_events(
    socket: WebSocket,
    state: AppState,
    id: String,
    project: Project,
    mut receiver: broadcast::Receiver<RoomEvent>,
    access: CanvasAccess,
) {
    let (mut sender, mut incoming) = socket.split();
    let mut known_assets = match project_assets(&state, &project).await {
        Ok(assets) => assets,
        Err(_) => return,
    };
    let events = room_sender(&state, &id).await;
    let client_id = Uuid::new_v4();
    let mut peer = Peer {
        id: client_id,
        member_id: access.member_id().to_owned(),
        role: if access.share_token().is_some() {
            MemberRole::Collaborator
        } else {
            MemberRole::Host
        },
        joined_at: chrono::Utc::now().timestamp_millis(),
        presence: Presence::default(),
    };
    // Admission and removal share the mutation lock; the last place cannot be double-booked.
    let admission = {
        let _guard = state.mutations.lock().await;
        if let Err(error) = access.ensure_active(&state).await {
            Some(if error.code == "COLLABORATOR_REMOVED" {
                RoomEvent::MemberRemoved {
                    member_id: peer.member_id.clone(),
                }
            } else {
                RoomEvent::Collaboration { enabled: false }
            })
        } else {
            let mut rooms = state.rooms.lock().await;
            let Some(room) = rooms.get_mut(&id) else {
                return;
            };
            if peer.role == MemberRole::Collaborator && !room.can_admit(Some(&peer.member_id)) {
                Some(RoomEvent::RoomFull {
                    max_collaborators: MAX_COLLABORATORS,
                })
            } else {
                if let Some(existing) = room
                    .peers
                    .values()
                    .find(|existing| existing.member_id == peer.member_id)
                {
                    peer.joined_at = existing.joined_at;
                }
                room.peers.insert(client_id, peer.clone());
                None
            }
        }
    };
    if let Some(event) = admission {
        let _ = send_event(&mut sender, &event).await;
        let _ = sender.send(Message::Close(None)).await;
        return;
    }
    let initial = RoomEvent::Snapshot {
        document: project.document,
        revision: project.revision,
    };
    let peers = peer_snapshot(&state, &id, client_id).await;
    if send_event(&mut sender, &initial).await.is_err()
        || send_event(&mut sender, &peers).await.is_err()
    {
        leave_room(&state, &id, client_id, &events).await;
        return;
    }
    let _ = events.send(RoomEvent::PeerJoined { peer: peer.clone() });
    let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
    let mut last_message = Instant::now();
    loop {
        tokio::select! {
            message = incoming.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => {
                        last_message = Instant::now();
                        let Ok(message) = serde_json::from_str::<ClientEvent>(&text) else {
                            continue;
                        };
                        if !state.rooms.lock().await.get(&id).is_some_and(|room| room.peers.contains_key(&client_id)) {
                            let _ = send_event(&mut sender, &RoomEvent::MemberRemoved { member_id: peer.member_id.clone() }).await;
                            break;
                        }
                        let (target, patch) = match message {
                            ClientEvent::Presence { presence } => {
                                if presence.selected_element_ids.len() > 50_000
                                    || presence.selected_element_ids.keys().any(|key| key.is_empty() || key.len() >= 256)
                                {
                                    continue;
                                }
                                {
                                    let mut rooms = state.rooms.lock().await;
                                    let Some(room) = rooms.get_mut(&id) else {
                                        break;
                                    };
                                    let Some(current) = room.peers.get_mut(&client_id) else { break; };
                                    current.presence = presence.clone();
                                }
                                let _ = events.send(RoomEvent::Presence {
                                    peer: Peer { presence, ..peer.clone() },
                                });
                                continue;
                            }
                            ClientEvent::SceneUpdate { patch } => (None, patch),
                            ClientEvent::SceneInit { target, patch } => (Some(target), patch),
                        };
                        if patch.client_id.len() > 120
                            || patch.upsert.len() + patch.remove.len() > 50_000
                            || patch.upsert.iter().any(|record| validate_record(record).is_err())
                            || patch.remove.iter().any(|key| key.is_empty() || key.len() >= 256)
                        {
                            continue;
                        }
                        let referenced = referenced_assets(patch.upsert.iter());
                        let new_assets = referenced.difference(&known_assets).cloned().collect();
                        if !referenced.is_subset(&known_assets) {
                            if access.share_token().is_some() {
                                let Ok(allowed) = state.store.project_asset_ids(&id).await else { break; };
                                if !referenced.is_subset(&known_assets.union(&allowed).cloned().collect()) {
                                    continue;
                                }
                            } else if state.store.grant_project_assets(&id, &new_assets).await.is_err() {
                                break;
                            }
                            known_assets.extend(new_assets);
                        }
                        // Live previews are only relayed. PATCH /document owns persistence.
                        let _ = events.send(RoomEvent::SceneUpdate { client_id, target, patch });
                    }
                    Some(Ok(Message::Ping(value))) => {
                        last_message = Instant::now();
                        if sender.send(Message::Pong(value)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => last_message = Instant::now(),
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
                                if let Err(error) = access.ensure_active(&state).await {
                                    let event = if error.code == "COLLABORATOR_REMOVED" {
                                        RoomEvent::MemberRemoved { member_id: peer.member_id.clone() }
                                    } else { RoomEvent::Collaboration { enabled: false } };
                                    let _ = send_event(&mut sender, &event).await;
                                    break;
                                }
                                let peers = peer_snapshot(&state, &id, client_id).await;
                                if send_event(&mut sender, &peers).await.is_err() {
                                    break;
                                }
                                RoomEvent::Snapshot { document: project.document, revision: project.revision }
                            }
                            Err(_) => break,
                        }
                    }
                };
                if let RoomEvent::SceneUpdate { client_id: source, target, .. } = &event
                    && (*source == client_id || target.is_some_and(|target| target != client_id))
                {
                    continue;
                }
                if matches!(event, RoomEvent::Collaboration { enabled: true })
                    && access.share_token().is_some()
                    && access.ensure_active(&state).await.is_err()
                {
                    let _ = send_event(&mut sender, &RoomEvent::Collaboration { enabled: false }).await;
                    break;
                }
                if send_event(&mut sender, &event).await.is_err() { break; }
                if matches!(event, RoomEvent::MemberRemoved { ref member_id } if *member_id == peer.member_id) { break; }
                if matches!(event, RoomEvent::Deleted) { break; }
                if access.share_token().is_some() && matches!(event, RoomEvent::Collaboration { enabled: false }) { break; }
            }
            _ = heartbeat.tick() => {
                if last_message.elapsed() > Duration::from_secs(75)
                    || sender.send(Message::Ping(Vec::new().into())).await.is_err()
                {
                    break;
                }
            }
        }
    }
    leave_room(&state, &id, client_id, &events).await;
}

async fn peer_snapshot(state: &AppState, id: &str, client_id: Uuid) -> RoomEvent {
    let rooms = state.rooms.lock().await;
    let peers = rooms
        .get(id)
        .map(|room| room.peers.values().cloned().collect())
        .unwrap_or_default();
    RoomEvent::Peers {
        client_id,
        peers,
        max_collaborators: MAX_COLLABORATORS,
    }
}

async fn leave_room(
    state: &AppState,
    id: &str,
    client_id: Uuid,
    events: &broadcast::Sender<RoomEvent>,
) {
    if let Some(room) = state.rooms.lock().await.get_mut(id) {
        room.peers.remove(&client_id);
    }
    let _ = events.send(RoomEvent::PeerLeft { client_id });
}

async fn send_event(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    event: &RoomEvent,
) -> Result<(), axum::Error> {
    let content = serde_json::to_string(event).map_err(axum::Error::new)?;
    sender.send(Message::Text(content.into())).await
}
