//! The service computer owns the workspace; links grant access to one canvas.

use std::{
    collections::HashSet,
    net::{IpAddr, SocketAddr},
};

use axum::http::{HeaderMap, Method, Uri, header};
use huayu_core::Project;
use serde_json::Value;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, ErrorCode};

#[derive(Clone)]
pub(crate) enum CanvasAccess {
    Owner {
        project_id: Option<String>,
    },
    Shared {
        project_id: String,
        token: String,
        assets: HashSet<String>,
        member_id: String,
        session_token: String,
    },
}

impl CanvasAccess {
    pub(crate) async fn ensure_active(&self, state: &AppState) -> ApiResult<()> {
        if let Self::Shared {
            project_id,
            token,
            session_token,
            ..
        } = self
        {
            let project = state.store.project(project_id).await?;
            if project.active_share_token() != Some(token.as_str()) {
                return Err(ApiError::new(ErrorCode::CollaborationClosed));
            }
            let member = state
                .store
                .collaboration_member(project_id, session_token)
                .await?;
            if !member.is_some_and(|member| !member.removed && member.share_token == *token) {
                return Err(ApiError::new(ErrorCode::CollaboratorRemoved));
            }
        }
        Ok(())
    }

    pub(crate) fn member_id(&self) -> &str {
        match self {
            Self::Owner { .. } => "host",
            Self::Shared { member_id, .. } => member_id,
        }
    }

    pub(crate) fn member_cookie(&self) -> Option<String> {
        match self {
            Self::Owner { .. } => None,
            Self::Shared {
                project_id,
                session_token,
                ..
            } => Some(format!(
                "huayu_member_{project_id}={session_token}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=2592000"
            )),
        }
    }

    pub(crate) fn project_id(&self) -> Option<&str> {
        match self {
            Self::Owner { project_id } => project_id.as_deref(),
            Self::Shared { project_id, .. } => Some(project_id),
        }
    }

    pub(crate) fn share_token(&self) -> Option<&str> {
        match self {
            Self::Owner { .. } => None,
            Self::Shared { token, .. } => Some(token),
        }
    }

    pub(crate) fn validate_assets(&self, referenced: &HashSet<String>) -> ApiResult<()> {
        if let Self::Shared { assets, .. } = self
            && !referenced.is_subset(assets)
        {
            return Err(ApiError::new(ErrorCode::SharedResourceForbidden));
        }
        Ok(())
    }

    pub(crate) fn asset_cookie(&self) -> Option<String> {
        match self {
            Self::Shared {
                project_id, token, ..
            } => Some(format!(
                "huayu_canvas_{project_id}={token}; Path=/api/assets/; HttpOnly; SameSite=Strict"
            )),
            Self::Owner { .. } => None,
        }
    }
}

/// Extracts local attachment references, including images embedded in generated HTML.
pub(crate) fn referenced_assets<'a>(
    records: impl IntoIterator<Item = &'a Value>,
) -> HashSet<String> {
    fn collect(value: &Value, found: &mut HashSet<String>) {
        match value {
            Value::String(value) => {
                for suffix in value.split("/api/assets/").skip(1) {
                    let id: String = suffix
                        .chars()
                        .take_while(|character| character.is_ascii_hexdigit() || *character == '-')
                        .collect();
                    if let Ok(id) = Uuid::parse_str(&id) {
                        found.insert(id.to_string());
                    }
                }
            }
            Value::Array(values) => values.iter().for_each(|value| collect(value, found)),
            Value::Object(values) => values.values().for_each(|value| collect(value, found)),
            _ => {}
        }
    }
    let mut found = HashSet::new();
    for record in records {
        collect(record, &mut found);
    }
    found
}

pub(crate) async fn project_assets(
    state: &AppState,
    project: &Project,
) -> ApiResult<HashSet<String>> {
    let mut assets = state.store.project_asset_ids(&project.id).await?;
    if let Some(document) = &project.document {
        assets.extend(referenced_assets(document.store.values()));
    }
    Ok(assets)
}

async fn shared_access(
    state: &AppState,
    project_id: &str,
    token: &str,
    headers: &HeaderMap,
) -> ApiResult<CanvasAccess> {
    let project = state
        .store
        .project(project_id)
        .await
        .map_err(|_| ApiError::new(ErrorCode::CollaborationClosed))?;
    if project.active_share_token() != Some(token) {
        return Err(ApiError::new(ErrorCode::CollaborationClosed));
    }
    let cookie_name = format!("huayu_member_{project_id}");
    let session_token = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies
                .split(';')
                .filter_map(|cookie| cookie.trim().split_once('='))
                .find(|(name, _)| *name == cookie_name)
                .map(|(_, value)| value)
        });
    let member = match session_token {
        Some(session_token) => state
            .store
            .collaboration_member(project_id, session_token)
            .await?
            .filter(|member| member.share_token == token),
        None => None,
    };
    if member.as_ref().is_some_and(|member| member.removed) {
        return Err(ApiError::new(ErrorCode::CollaboratorRemoved));
    }
    if state
        .rooms
        .lock()
        .await
        .get(project_id)
        .is_some_and(|room| !room.can_admit(member.as_ref().map(|member| member.id.as_str())))
    {
        return Err(ApiError::new(ErrorCode::RoomFull));
    }
    let member = match member {
        Some(member) => member,
        None => {
            state
                .store
                .create_collaboration_member(project_id, token)
                .await?
        }
    };
    let assets = project_assets(state, &project).await?;
    Ok(CanvasAccess::Shared {
        project_id: project.id,
        token: token.to_owned(),
        assets,
        member_id: member.id,
        session_token: member.session_token,
    })
}

pub(crate) async fn authorize(
    state: &AppState,
    method: &Method,
    uri: &Uri,
    headers: &HeaderMap,
    connection: Option<SocketAddr>,
) -> ApiResult<CanvasAccess> {
    let path = uri.path();
    let query: Vec<_> = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes()).collect();
    let token = query
        .iter()
        .find(|(key, _)| key == "share")
        .map(|(_, value)| value.as_ref())
        .or_else(|| {
            headers
                .get("x-huayu-share")
                .and_then(|value| value.to_str().ok())
        });
    let canvas = headers
        .get("x-huayu-canvas")
        .and_then(|value| value.to_str().ok());
    let project_path = path.strip_prefix("/api/projects/");
    let project_id = canvas.or_else(|| project_path.and_then(|path| path.split('/').next()));
    if let Some(token) = token {
        let project_id =
            project_id.ok_or_else(|| ApiError::new(ErrorCode::SharedScopeForbidden))?;
        let access = shared_access(state, project_id, token, headers).await?;
        let read = method == Method::GET || method == Method::HEAD;
        let project_route = project_path.and_then(|value| value.strip_prefix(project_id));
        let allowed = matches!(project_route, Some("") if read)
            || matches!(project_route, Some("/document") if method == Method::PATCH)
            || matches!(project_route, Some("/events") if read)
            || (path == "/api/assets" && method == Method::POST)
            || (path == "/api/documents/parse" && method == Method::POST)
            || (path == "/api/unfurl" && read);
        if let Some(asset_id) = path.strip_prefix("/api/assets/")
            && read
        {
            access.validate_assets(&HashSet::from([asset_id.to_owned()]))?;
            return Ok(access);
        }
        if !allowed {
            return Err(ApiError::new(ErrorCode::SharedScopeForbidden));
        }
        return Ok(access);
    }

    let local_ip = |ip: IpAddr| {
        ip.is_loopback() || (!state.address.ip().is_unspecified() && ip == state.address.ip())
    };
    let mut peer = connection.map(|address| address.ip());
    if peer.is_some_and(local_ip)
        && let Some(forwarded) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
    {
        for value in forwarded.rsplit(',') {
            let ip = value
                .trim()
                .parse::<IpAddr>()
                .map_err(|_| ApiError::new(ErrorCode::WorkspacePrivate))?;
            if !local_ip(ip) {
                peer = Some(ip);
                break;
            }
        }
    }
    if peer.is_some_and(local_ip) {
        return Ok(CanvasAccess::Owner {
            project_id: canvas.map(str::to_owned),
        });
    }

    // Browser media elements use an HttpOnly, asset-path-only capability cookie.
    if (method == Method::GET || method == Method::HEAD)
        && let Some(asset_id) = path.strip_prefix("/api/assets/")
        && let Some(cookies) = headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok())
    {
        for cookie in cookies.split(';') {
            let Some((name, token)) = cookie.trim().split_once('=') else {
                continue;
            };
            let Some(project_id) = name.strip_prefix("huayu_canvas_") else {
                continue;
            };
            if Uuid::parse_str(project_id).is_err() {
                continue;
            }
            if let Ok(access) = shared_access(state, project_id, token, headers).await
                && access
                    .validate_assets(&HashSet::from([asset_id.to_owned()]))
                    .is_ok()
            {
                return Ok(access);
            }
        }
    }
    Err(ApiError::new(ErrorCode::WorkspacePrivate))
}
