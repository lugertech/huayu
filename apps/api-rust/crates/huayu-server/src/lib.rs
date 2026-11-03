//! Local Axum application. The server never receives model connection settings or API keys.

mod error;
mod files;
mod library;
mod media;
mod projects;
mod recordings;
mod unfurl;

use std::{
    collections::HashMap,
    env,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::Arc,
};

use axum::{
    Router,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, StatusCode, header, uri::Authority},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use huayu_store::Store;
use serde::Serialize;
use tokio::sync::{Mutex, broadcast};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

pub use error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct Config {
    pub address: SocketAddr,
    pub data_dir: PathBuf,
    pub web_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let host: IpAddr = env::var("HUAYU_HOST")
            .unwrap_or_else(|_| "127.0.0.1".to_owned())
            .parse()?;
        let port: u16 = env::var("HUAYU_PORT")
            .unwrap_or_else(|_| "5858".to_owned())
            .parse()?;
        Ok(Self {
            address: SocketAddr::new(host, port),
            data_dir: env::var_os("HUAYU_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("var/dev")),
            web_dir: env::var_os("HUAYU_WEB_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("apps/web/dist")),
        })
    }
}

#[derive(Clone)]
pub(crate) struct AppState {
    store: Store,
    data_dir: PathBuf,
    address: SocketAddr,
    mutations: Arc<Mutex<()>>,
    rooms: Arc<Mutex<HashMap<String, broadcast::Sender<projects::RoomEvent>>>>,
}

pub struct Application {
    config: Config,
    router: Router,
}

impl Application {
    /// Initializes only the configured local data directory; no external services are contacted.
    pub async fn new(config: Config) -> Result<Self, Box<dyn std::error::Error>> {
        tokio::fs::create_dir_all(config.data_dir.join("assets")).await?;
        let database = config.data_dir.join("huayu.sqlite3");
        let database = database.to_str().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "database path is not valid UTF-8",
            )
        })?;
        // SQLite decodes URL escapes; encode the filesystem path exactly once.
        let database: String = url::form_urlencoded::byte_serialize(database.as_bytes()).collect();
        let store =
            Store::open(&format!("sqlite:{}?mode=rwc", database.replace('+', "%20"))).await?;
        let state = AppState {
            store,
            data_dir: config.data_dir.clone(),
            address: config.address,
            mutations: Arc::new(Mutex::new(())),
            rooms: Arc::new(Mutex::new(HashMap::new())),
        };
        let api = Router::new()
            .route("/health", get(health))
            .route("/projects", get(projects::list).post(projects::create))
            .route(
                "/projects/{id}",
                get(projects::detail)
                    .patch(projects::update)
                    .delete(projects::delete),
            )
            .route("/projects/{id}/document", patch(projects::patch_document))
            .route(
                "/projects/{id}/collaboration",
                post(projects::collaborative),
            )
            .route("/projects/{id}/events", get(projects::events))
            .route("/projects/{id}/template", post(projects::promote))
            .route("/templates", get(projects::templates))
            .route(
                "/templates/{id}",
                axum::routing::delete(projects::delete_template),
            )
            .route("/templates/{id}/fork", post(projects::fork))
            .route("/assets", post(files::upload))
            .route("/assets/{id}", get(files::download))
            .route("/library/assets", get(library::list).post(library::create))
            .route(
                "/library/assets/{id}",
                get(library::detail).patch(library::update),
            )
            .route(
                "/library/folders",
                get(library::folders).post(library::create_folder),
            )
            .route(
                "/library/folders/{id}",
                patch(library::rename_folder).delete(library::remove_folder),
            )
            .route("/documents/parse", post(files::parse))
            .route("/unfurl", get(unfurl::unfurl))
            .route(
                "/recordings",
                get(recordings::list).post(recordings::create),
            )
            .route(
                "/recordings/{id}",
                get(recordings::detail)
                    .patch(recordings::update)
                    .delete(recordings::delete),
            )
            .route("/recordings/{id}/cover", get(media::cover))
            .route("/recordings/{id}/media", get(media::info))
            .route("/recordings/{id}/audio", get(media::audio))
            .fallback(|| async { ApiError::not_found().into_response() });
        let router = Router::new()
            .nest("/api", api)
            .fallback_service(
                ServeDir::new(&config.web_dir)
                    .fallback(ServeFile::new(config.web_dir.join("index.html"))),
            )
            .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
            .layer(middleware::from_fn_with_state(state.clone(), local_request))
            .layer(TraceLayer::new_for_http())
            .with_state(state);
        Ok(Self { config, router })
    }

    pub fn router(&self) -> Router {
        self.router.clone()
    }

    pub async fn run(self) -> Result<(), Box<dyn std::error::Error>> {
        let listener = tokio::net::TcpListener::bind(self.config.address).await?;
        tracing::info!(address = %listener.local_addr()?, "画语已启动");
        axum::serve(listener, self.router)
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await?;
        Ok(())
    }
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
}

async fn health() -> axum::Json<Health> {
    axum::Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

// Host validation also prevents DNS rebinding against the local, account-free API.
async fn local_request(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let allowed = host.parse::<Authority>().is_ok_and(|authority| {
        let hostname = authority.host().trim_matches(['[', ']']);
        hostname == "localhost"
            || hostname.parse::<IpAddr>().is_ok_and(|ip| {
                ip.is_loopback()
                    || (!state.address.ip().is_unspecified() && ip == state.address.ip())
            })
    });
    if !allowed {
        return ApiError::new(
            StatusCode::FORBIDDEN,
            "INVALID_HOST",
            "当前访问地址不被允许",
        )
        .into_response();
    }
    if let Some(origin) = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    {
        let expected_http = format!("http://{host}");
        let expected_https = format!("https://{host}");
        if origin != expected_http && origin != expected_https {
            return ApiError::new(StatusCode::FORBIDDEN, "INVALID_ORIGIN", "请求来源不被允许")
                .into_response();
        }
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    if response
        .headers()
        .get(header::CONTENT_TYPE)
        .is_some_and(|value| value.as_bytes().starts_with(b"application/json"))
    {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    response
}
