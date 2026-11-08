use axum::{
    Router,
    body::{Body, to_bytes},
    extract::ConnectInfo,
    http::{HeaderMap, Request, StatusCode},
};
use huayu_server::{Application, Config};
use serde_json::{Value, json};
use tempfile::TempDir;
use tower::ServiceExt;

async fn application() -> (TempDir, Router) {
    let directory = TempDir::new().expect("independent API test directory");
    let app = Application::new(Config {
        address: "127.0.0.1:0".parse().expect("loopback test address"),
        data_dir: directory.path().join("data"),
        web_dir: directory.path().join("web"),
    })
    .await
    .expect("local test application starts");
    (directory, app.router())
}

async fn send(router: &Router, request: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let response = router
        .clone()
        .oneshot(request)
        .await
        .expect("local API request completes");
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("bounded API response");
    let value = serde_json::from_slice(&bytes).expect("localized error is JSON");
    (status, headers, value)
}

#[tokio::test]
async fn error_responses_follow_each_request_language_and_keep_codes_and_parameters() {
    let (_directory, router) = application().await;
    let router = &router;
    let requests = [
        (
            "en-US,en;q=0.9",
            "en",
            "Names must contain 1–120 characters",
        ),
        ("zh-CN", "zh-CN", "名称应包含 1 至 120 个字符"),
        ("fr, en;q=0.8", "en", "Names must contain 1–120 characters"),
        ("de", "zh-CN", "名称应包含 1 至 120 个字符"),
    ]
    .into_iter()
    .map(|(language, selected, message)| async move {
        let request = Request::builder()
            .method("POST")
            .uri("/api/projects")
            .header("host", "127.0.0.1")
            .header("accept-language", language)
            .header("content-type", "application/json")
            .extension(ConnectInfo(
                "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
            ))
            .body(Body::from(json!({"name":""}).to_string()))
            .unwrap();
        let (status, headers, value) = send(router, request).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(
            value,
            json!({"code":"INVALID_NAME","message":message,"params":{"min":1,"max":120}})
        );
        assert_eq!(headers["content-language"], selected);
        assert_eq!(headers["cache-control"], "no-store");
        assert_eq!(headers["vary"], "Accept-Language");
    });
    futures_util::future::join_all(requests).await;
}

#[tokio::test]
async fn early_access_and_framework_rejections_use_the_same_localized_contract() {
    let (_directory, router) = application().await;
    for (method, path, host, body, expected_status, expected_code) in [
        (
            "GET",
            "/api/projects",
            "invalid.example",
            "",
            StatusCode::FORBIDDEN,
            "INVALID_HOST",
        ),
        (
            "GET",
            "/api/unfurl",
            "127.0.0.1",
            "",
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST",
        ),
        (
            "POST",
            "/api/projects",
            "127.0.0.1",
            "{",
            StatusCode::UNPROCESSABLE_ENTITY,
            "INVALID_REQUEST",
        ),
        (
            "POST",
            "/api/assets",
            "127.0.0.1",
            "{}",
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST",
        ),
        (
            "PUT",
            "/api/projects",
            "127.0.0.1",
            "",
            StatusCode::METHOD_NOT_ALLOWED,
            "METHOD_NOT_ALLOWED",
        ),
        (
            "GET",
            "/api/missing-route",
            "127.0.0.1",
            "",
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
        ),
    ] {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("host", host)
            .header("accept-language", "en")
            .header("content-type", "application/json")
            .extension(ConnectInfo(
                "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
            ))
            .body(Body::from(body))
            .unwrap();
        let (status, headers, value) = send(&router, request).await;
        assert_eq!(status, expected_status, "{method} {path}");
        assert_eq!(value["code"], expected_code, "{method} {path}");
        assert_eq!(headers["content-language"], "en");
        assert!(value["message"].as_str().unwrap().is_ascii());
        assert!(value["params"].is_object());
        if status == StatusCode::METHOD_NOT_ALLOWED {
            assert!(headers.contains_key("allow"));
        }
    }
}

#[tokio::test]
async fn successful_data_preserves_user_content_and_does_not_store_language() {
    let (_directory, router) = application().await;
    let request = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("host", "127.0.0.1")
        .header("accept-language", "en")
        .header("content-type", "application/json")
        .extension(ConnectInfo(
            "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
        ))
        .body(Body::from(json!({"name":"保留项目名称"}).to_string()))
        .unwrap();
    let (status, headers, value) = send(&router, request).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(value["name"], "保留项目名称");
    assert!(value.get("locale").is_none());
    assert!(!headers.contains_key("content-language"));
}
