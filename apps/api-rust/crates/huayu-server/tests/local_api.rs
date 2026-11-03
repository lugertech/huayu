use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use huayu_server::{Application, Config};
use serde_json::{Value, json};
use tempfile::TempDir;
use tower::ServiceExt;

async fn application(directory: &TempDir) -> Application {
    Application::new(Config {
        address: "127.0.0.1:0".parse().expect("valid loopback test address"),
        data_dir: directory.path().join("data"),
        web_dir: directory.path().join("web"),
    })
    .await
    .expect("test application starts in its temporary directory")
}

async fn request(router: &Router, method: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_vec(&body).expect("JSON request value serializes"),
        ))
        .expect("valid test JSON request");
    let response = router
        .clone()
        .oneshot(request)
        .await
        .expect("test router handles the JSON request");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 40 * 1024 * 1024)
        .await
        .expect("JSON response body stays within the test limit");
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("test API response is valid JSON")
    };
    (status, value)
}

#[tokio::test]
async fn projects_merge_records_persist_across_restart_and_fork_templates() {
    let directory = TempDir::new().unwrap();
    let app = application(&directory).await;
    let router = app.router();
    let (status, project) =
        request(&router, "POST", "/api/projects", json!({"name":"集成验证"})).await;
    assert_eq!(status, StatusCode::CREATED);
    let id = project["id"].as_str().unwrap();
    let path = format!("/api/projects/{id}/document");
    let left = json!({"upsert":[{"id":"shape:left","typeName":"shape","type":"ai-text","props":{"text":"左分支"}}],"remove":[],"schema":{"schemaVersion":2},"client_id":"left-tab"});
    let right = json!({"upsert":[{"id":"shape:right","typeName":"shape","type":"ai-text","props":{"text":"右分支"}}],"remove":[],"client_id":"right-tab"});
    let ((left_status, _), (right_status, _)) = tokio::join!(
        request(&router, "PATCH", &path, left.clone()),
        request(&router, "PATCH", &path, right)
    );
    assert_eq!(left_status, StatusCode::OK);
    assert_eq!(right_status, StatusCode::OK);
    let (_, saved) = request(&router, "GET", &format!("/api/projects/{id}"), Value::Null).await;
    assert_eq!(saved["document"]["store"].as_object().unwrap().len(), 2);
    assert_eq!(saved["revision"], 2);
    let (_, unchanged) = request(&router, "PATCH", &path, left).await;
    assert_eq!(unchanged["revision"], 2);
    let invalid = json!({"upsert":[{"id":"instance:test","typeName":"instance"}],"remove":["shape:left"],"client_id":"bad"});
    assert_eq!(
        request(&router, "PATCH", &path, invalid).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let (_, saved) = request(&router, "GET", &format!("/api/projects/{id}"), Value::Null).await;
    assert_eq!(saved["document"]["store"].as_object().unwrap().len(), 2);
    let (status, template) = request(
        &router,
        "POST",
        &format!("/api/projects/{id}/template"),
        json!({"name":"复用示例","tags":["验证"]}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let template_id = template["id"].as_str().unwrap();
    let (status, fork) = request(
        &router,
        "POST",
        &format!("/api/templates/{template_id}/fork"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_ne!(fork["id"], project["id"]);
    assert_eq!(fork["document"], saved["document"]);
    drop(router);
    drop(app);
    let reopened = application(&directory).await;
    let (_, restored) = request(
        &reopened.router(),
        "GET",
        &format!("/api/projects/{id}"),
        Value::Null,
    )
    .await;
    assert_eq!(restored["document"], saved["document"]);
    let (_, templates) = request(&reopened.router(), "GET", "/api/templates", Value::Null).await;
    assert_eq!(templates.as_array().unwrap().len(), 25);
    assert_eq!(
        request(
            &reopened.router(),
            "DELETE",
            &format!("/api/projects/{id}"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(
            &reopened.router(),
            "GET",
            &format!("/api/projects/{id}"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn builtin_templates_are_available_without_model_configuration_and_survive_restart() {
    let directory = TempDir::new().unwrap();
    let app = application(&directory).await;
    let router = app.router();
    let catalog: Vec<Value> =
        serde_json::from_str(include_str!("../../../../../templates/catalog.json")).unwrap();
    assert_eq!(catalog.len(), 20);
    let (status, templates) = request(&router, "GET", "/api/templates", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    let templates = templates.as_array().unwrap();
    assert_eq!(templates.len(), 24);
    for preset in &catalog {
        let id = preset["id"].as_str().unwrap();
        let template = templates.iter().find(|item| item["id"] == id).unwrap();
        assert_eq!(template["name"], preset["name"]);
        assert_eq!(template["recipe"], preset["recipe"]);
        let (status, project) = request(
            &router,
            "POST",
            &format!("/api/templates/{id}/fork"),
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(project["recipe"], preset["recipe"]);
        assert_ne!(project["id"], preset["id"]);
        assert!(project["document"].is_null());
    }
    drop(router);
    drop(app);
    let reopened = application(&directory).await;
    let (_, templates) = request(&reopened.router(), "GET", "/api/templates", Value::Null).await;
    assert_eq!(templates.as_array().unwrap().len(), 24);
    for preset in &catalog {
        let template = templates
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["id"] == preset["id"])
            .unwrap();
        assert_eq!(template["fork_count"], 1);
    }
    let (_, projects) = request(&reopened.router(), "GET", "/api/projects", Value::Null).await;
    assert_eq!(projects.as_array().unwrap().len(), 20);
}

#[tokio::test]
async fn refreshing_a_preview_preserves_document_revision_and_edit_time() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let (_, project) = request(&router, "POST", "/api/projects", json!({"name":"预览验证"})).await;
    let path = format!("/api/projects/{}", project["id"].as_str().unwrap());
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let (status, preview) = request(
        &router,
        "PATCH",
        &path,
        json!({"cover":"/api/assets/preview"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview["cover"], "/api/assets/preview");
    assert_eq!(preview["updated_at"], project["updated_at"]);
    assert_eq!(preview["revision"], project["revision"]);
    assert_eq!(preview["document"], project["document"]);
    let (_, renamed) = request(&router, "PATCH", &path, json!({"name":"新的名称"})).await;
    assert_ne!(renamed["updated_at"], project["updated_at"]);
}

#[tokio::test]
async fn collaboration_links_require_the_current_enabled_token() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let (_, project) = request(&router, "POST", "/api/projects", json!({"name":"协作验证"})).await;
    let path = format!("/api/projects/{}", project["id"].as_str().unwrap());
    let (_, enabled) = request(
        &router,
        "POST",
        &format!("{path}/collaboration"),
        json!({"enabled":true}),
    )
    .await;
    let token = enabled["share_token"].as_str().unwrap();
    let shared = format!("{path}?share={token}");
    assert_eq!(
        request(&router, "GET", &shared, Value::Null).await.0,
        StatusCode::OK
    );
    assert_eq!(
        request(&router, "GET", &format!("{path}?share=wrong"), Value::Null)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let patch = json!({"upsert":[{"id":"shape:shared","typeName":"shape","type":"ai-text","props":{"text":"协作内容"}}],"remove":[],"schema":{"schemaVersion":2},"client_id":"shared-tab"});
    assert_eq!(
        request(
            &router,
            "PATCH",
            &format!("{path}/document?share={token}"),
            patch.clone()
        )
        .await
        .0,
        StatusCode::OK
    );
    request(
        &router,
        "POST",
        &format!("{path}/collaboration"),
        json!({"enabled":false}),
    )
    .await;
    let (status, error) = request(&router, "GET", &shared, Value::Null).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(error["code"], "COLLABORATION_CLOSED");
    assert_eq!(
        request(
            &router,
            "PATCH",
            &format!("{path}/document?share={token}"),
            patch
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(&router, "GET", &path, Value::Null).await.0,
        StatusCode::OK
    );
    let (_, reenabled) = request(
        &router,
        "POST",
        &format!("{path}/collaboration"),
        json!({"enabled":true}),
    )
    .await;
    assert_ne!(reenabled["share_token"], enabled["share_token"]);
    assert_eq!(
        request(&router, "GET", &shared, Value::Null).await.0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn clearing_a_preview_preserves_document_revision_and_edit_time() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let (_, project) = request(
        &router,
        "POST",
        "/api/projects",
        json!({"name": "清除预览"}),
    )
    .await;
    let path = format!("/api/projects/{}", project["id"].as_str().unwrap());
    request(
        &router,
        "PATCH",
        &path,
        json!({"cover": "/api/assets/preview"}),
    )
    .await;
    let (_, unchanged) = request(&router, "PATCH", &path, json!({})).await;
    assert_eq!(unchanged["cover"], "/api/assets/preview");
    let (_, cleared) = request(&router, "PATCH", &path, json!({"cover": null})).await;
    assert_eq!(cleared["cover"], Value::Null);
    assert_eq!(cleared["revision"], project["revision"]);
    assert_eq!(cleared["updated_at"], project["updated_at"]);
    let (_, restored) = request(&router, "GET", &path, Value::Null).await;
    assert_eq!(restored["cover"], Value::Null);
}

#[tokio::test]
async fn bracketed_ipv6_hosts_work_with_and_without_a_port() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    for host in ["[::1]", "[::1]:5858"] {
        let response = router
            .clone()
            .oneshot(
                Request::get("/api/health")
                    .header("host", host)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "host {host}");
    }
}

#[tokio::test]
async fn database_paths_preserve_literal_url_characters() {
    let directory = TempDir::new().unwrap();
    let data_dir = directory.path().join("data #1%2Fcache &+中文");
    let config = Config {
        address: "127.0.0.1:0".parse().unwrap(),
        data_dir: data_dir.clone(),
        web_dir: directory.path().join("web"),
    };
    let app = Application::new(config.clone()).await.unwrap();
    let (status, project) = request(
        &app.router(),
        "POST",
        "/api/projects",
        json!({"name": "路径验证"}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(
        data_dir.join("huayu.sqlite3").is_file(),
        "database stays in the configured directory"
    );
    drop(app);
    let reopened = Application::new(config).await.unwrap();
    let (status, restored) = request(
        &reopened.router(),
        "GET",
        &format!("/api/projects/{}", project["id"].as_str().unwrap()),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(restored["name"], "路径验证");
}

#[tokio::test]
async fn failed_document_parsing_does_not_keep_uploaded_assets() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    for (name, content) in [
        ("broken.pdf", b"not a pdf".as_slice()),
        ("unsupported.bin", b"unsupported".as_slice()),
        ("broken.txt", &[0xff, 0xfe]),
    ] {
        let response = multipart_request(
            &router,
            "/api/documents/parse",
            name,
            "application/octet-stream",
            content,
        )
        .await;
        assert_eq!(
            response.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "file {name}"
        );
    }
    let oversized = vec![b'a'; 10 * 1024 * 1024 + 1];
    let response = multipart_request(
        &router,
        "/api/documents/parse",
        "large.txt",
        "text/plain",
        &oversized,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        std::fs::read_dir(directory.path().join("data/assets"))
            .unwrap()
            .count(),
        0
    );
}

async fn multipart_request(
    router: &Router,
    route: &str,
    name: &str,
    mime: &str,
    bytes: &[u8],
) -> axum::response::Response {
    let mut body = format!("--huayu-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n").into_bytes();
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n--huayu-boundary--\r\n");
    let request = Request::post(route)
        .header("host", "127.0.0.1")
        .header(
            "content-type",
            "multipart/form-data; boundary=huayu-boundary",
        )
        .body(Body::from(body))
        .expect("valid test multipart request");
    router
        .clone()
        .oneshot(request)
        .await
        .expect("test router handles the multipart request")
}

async fn upload(router: &Router, route: &str, name: &str, mime: &str, bytes: &[u8]) -> Value {
    let response = multipart_request(router, route, name, mime, bytes).await;
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("upload response body stays within the test limit");
    serde_json::from_slice(&bytes).expect("upload response is valid JSON")
}

#[tokio::test]
async fn library_folders_images_and_trash_persist_without_removing_project_files() {
    let directory = TempDir::new().unwrap();
    let app = application(&directory).await;
    let router = app.router();
    let (_, parent) = request(
        &router,
        "POST",
        "/api/library/folders",
        json!({"name":"灵感","parent_id":null}),
    )
    .await;
    let (_, child) = request(
        &router,
        "POST",
        "/api/library/folders",
        json!({"name":"街景","parent_id":parent["id"]}),
    )
    .await;
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#345cff"/></svg>"##;
    let file = upload(&router, "/api/assets", "街景.svg", "image/svg+xml", svg).await;
    let asset_id = file["id"].as_str().unwrap();
    let details = json!({"asset_id":asset_id,"name":"傍晚的街景","width":640,"height":400,"folder_id":child["id"],"trashed":false});
    assert_eq!(
        request(&router, "POST", "/api/library/assets", details)
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    let (_, listed) = request(
        &router,
        "GET",
        "/api/library/assets?search=%E8%A1%97%E6%99%AF&sort=oldest",
        Value::Null,
    )
    .await;
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["assets"][0]["width"], 640);
    let path = format!("/api/library/assets/{asset_id}");
    let (_, item) = request(&router, "GET", &path, Value::Null).await;
    assert_eq!(item["folder_id"], child["id"]);
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?offset=1&limit=1",
            Value::Null
        )
        .await
        .1["assets"],
        json!([])
    );
    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"新的名字","folder_id":"missing","trashed":false})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let child_path = format!("/api/library/folders/{}", child["id"].as_str().unwrap());
    assert_eq!(
        request(&router, "PATCH", &child_path, json!({"name":"城市素材"}))
            .await
            .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(&router, "DELETE", &child_path, Value::Null).await.0,
        StatusCode::NO_CONTENT
    );
    let (_, item) = request(&router, "GET", &path, Value::Null).await;
    assert_eq!(item["folder_id"], parent["id"]);
    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"城市傍晚","folder_id":parent["id"],"trashed":true})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(&router, "GET", "/api/library/assets", Value::Null)
            .await
            .1["total"],
        0
    );
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?trash=true",
            Value::Null
        )
        .await
        .1["total"],
        1
    );
    assert_eq!(
        request(&router, "GET", &path, Value::Null).await.0,
        StatusCode::NOT_FOUND
    );
    let response = router
        .clone()
        .oneshot(
            Request::get(format!("/api/assets/{asset_id}"))
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(response.into_body(), 4096).await.unwrap().as_ref(),
        svg
    );
    drop(router);
    drop(app);
    let reopened = application(&directory).await;
    let router = reopened.router();
    assert_eq!(
        request(&router, "GET", "/api/library/folders", Value::Null)
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?trash=true",
            Value::Null
        )
        .await
        .1["assets"][0]["name"],
        "城市傍晚"
    );
    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"城市傍晚","folder_id":null,"trashed":false})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(&router, "GET", &path, Value::Null).await.1["folder_id"],
        Value::Null
    );
    let text = upload(&router, "/api/assets", "note.txt", "text/plain", b"note").await;
    assert_eq!(request(&router, "POST", "/api/library/assets", json!({"asset_id":text["id"],"name":"bad","width":10,"height":10,"folder_id":null,"trashed":false})).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn library_root_filter_and_folder_counts_follow_moves_trash_and_folder_deletion() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let (_, parent) = request(
        &router,
        "POST",
        "/api/library/folders",
        json!({"name":"Brand","parent_id":null}),
    )
    .await;
    let (_, child) = request(
        &router,
        "POST",
        "/api/library/folders",
        json!({"name":"Campaign","parent_id":parent["id"]}),
    )
    .await;
    let (_, leaf) = request(
        &router,
        "POST",
        "/api/library/folders",
        json!({"name":"Posters","parent_id":child["id"]}),
    )
    .await;
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>"#;
    let file = upload(&router, "/api/assets", "poster.svg", "image/svg+xml", svg).await;
    let path = format!("/api/library/assets/{}", file["id"].as_str().unwrap());
    let response = request(
        &router, "POST", "/api/library/assets",
        json!({"asset_id":file["id"],"name":"Poster","width":10,"height":20,"folder_id":null,"trashed":false}),
    ).await;
    assert_eq!(response.0, StatusCode::NO_CONTENT);
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?unfiled=true",
            Value::Null
        )
        .await
        .1["total"],
        1
    );
    let (_, folders) = request(&router, "GET", "/api/library/folders", Value::Null).await;
    assert!(
        folders
            .as_array()
            .unwrap()
            .iter()
            .all(|folder| folder["asset_count"] == 0)
    );

    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"Poster","folder_id":child["id"],"trashed":false})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?unfiled=true",
            Value::Null
        )
        .await
        .1["total"],
        0
    );
    assert_eq!(
        request(&router, "GET", "/api/library/assets", Value::Null)
            .await
            .1["total"],
        1
    );
    let (_, folders) = request(&router, "GET", "/api/library/folders", Value::Null).await;
    assert_eq!(
        folders
            .as_array()
            .unwrap()
            .iter()
            .find(|folder| folder["id"] == child["id"])
            .unwrap()["asset_count"],
        1
    );

    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"Poster","folder_id":child["id"],"trashed":true})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let (_, folders) = request(&router, "GET", "/api/library/folders", Value::Null).await;
    assert!(
        folders
            .as_array()
            .unwrap()
            .iter()
            .all(|folder| folder["asset_count"] == 0)
    );
    assert_eq!(
        request(
            &router,
            "GET",
            "/api/library/assets?trash=true",
            Value::Null
        )
        .await
        .1["total"],
        1
    );
    assert_eq!(
        request(
            &router,
            "PATCH",
            &path,
            json!({"name":"Poster","folder_id":child["id"],"trashed":false})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );

    let child_path = format!("/api/library/folders/{}", child["id"].as_str().unwrap());
    assert_eq!(
        request(&router, "DELETE", &child_path, Value::Null).await.0,
        StatusCode::NO_CONTENT
    );
    let (_, folders) = request(&router, "GET", "/api/library/folders", Value::Null).await;
    let folders = folders.as_array().unwrap();
    assert_eq!(
        folders
            .iter()
            .find(|folder| folder["id"] == parent["id"])
            .unwrap()["asset_count"],
        1
    );
    assert_eq!(
        folders
            .iter()
            .find(|folder| folder["id"] == leaf["id"])
            .unwrap()["parent_id"],
        parent["id"]
    );
    assert_eq!(
        request(&router, "GET", &path, Value::Null).await.1["folder_id"],
        parent["id"]
    );
}

#[tokio::test]
async fn recording_covers_are_decodable_frames_for_landscape_and_short_portrait_videos() {
    if !std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        eprintln!("FFmpeg is unavailable; recording-cover integration is skipped");
        return;
    }
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    for (size, seconds, expected_width, expected_height) in
        [("960x540", "0.3", 640, 360), ("300x700", "0.04", 154, 360)]
    {
        let source = directory.path().join(format!("{size}.webm"));
        let created = std::process::Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                &format!("testsrc2=size={size}:rate=12"),
                "-t",
                seconds,
                "-c:v",
                "libvpx",
                "-deadline",
                "realtime",
            ])
            .arg(&source)
            .output()
            .unwrap();
        assert!(
            created.status.success(),
            "{}",
            String::from_utf8_lossy(&created.stderr)
        );
        let bytes = std::fs::read(&source).unwrap();
        let asset = upload(&router, "/api/assets", "screen.webm", "video/webm", &bytes).await;
        let (status, recording) = request(
            &router,
            "POST",
            "/api/recordings",
            json!({"name":"Cover test","asset_id":asset["id"],"duration":0}),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let url = format!(
            "/api/recordings/{}/cover",
            recording["id"].as_str().unwrap()
        );
        let response = router
            .clone()
            .oneshot(
                Request::get(&url)
                    .header("host", "127.0.0.1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "image/jpeg");
        assert_eq!(
            response.headers()["cache-control"],
            "private, max-age=86400"
        );
        let cover = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        assert!(cover.starts_with(&[0xff, 0xd8]));
        assert!(cover.ends_with(&[0xff, 0xd9]));
        let image_path = directory.path().join("cover.jpg");
        std::fs::write(&image_path, &cover).unwrap();
        let decoded = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
            ])
            .arg(image_path)
            .output()
            .unwrap();
        assert!(decoded.status.success());
        let dimensions: Value = serde_json::from_slice(&decoded.stdout).unwrap();
        assert_eq!(dimensions["streams"][0]["width"], expected_width);
        assert_eq!(dimensions["streams"][0]["height"], expected_height);
        let (_, unchanged) = request(
            &router,
            "GET",
            &format!("/api/recordings/{}", recording["id"].as_str().unwrap()),
            Value::Null,
        )
        .await;
        assert_eq!(unchanged, recording);
    }
    assert_eq!(
        request(&router, "GET", "/api/recordings/missing/cover", Value::Null)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn recording_cover_failures_do_not_break_recordings_or_generate_fake_previews() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let asset = upload(
        &router,
        "/api/assets",
        "audio.wav",
        "audio/wav",
        b"audio-only",
    )
    .await;
    let (_, recording) = request(
        &router,
        "POST",
        "/api/recordings",
        json!({"name":"Audio","asset_id":asset["id"],"duration":1}),
    )
    .await;
    assert_eq!(
        request(
            &router,
            "GET",
            &format!(
                "/api/recordings/{}/cover",
                recording["id"].as_str().unwrap()
            ),
            Value::Null
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let asset = upload(
        &router,
        "/api/assets",
        "broken.webm",
        "video/webm",
        b"broken media",
    )
    .await;
    let (_, recording) = request(
        &router,
        "POST",
        "/api/recordings",
        json!({"name":"Broken video","asset_id":asset["id"],"duration":1}),
    )
    .await;
    let path = format!("/api/recordings/{}", recording["id"].as_str().unwrap());
    let (status, error) = request(&router, "GET", &format!("{path}/cover"), Value::Null).await;
    assert!(
        status == StatusCode::UNPROCESSABLE_ENTITY || status == StatusCode::SERVICE_UNAVAILABLE
    );
    assert!(
        error["code"] == "RECORDING_COVER_UNAVAILABLE"
            || error["code"] == "COVER_DECODER_UNAVAILABLE"
    );
    assert_eq!(
        request(&router, "GET", &path, Value::Null).await.1,
        recording
    );
}

#[tokio::test]
async fn recording_audio_is_decoded_locally_in_bounded_segments() {
    if !std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        eprintln!("FFmpeg is unavailable; local decoder integration is skipped");
        return;
    }
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let samples = vec![0_u8; 32000];
    let sample_bytes = u32::try_from(samples.len()).expect("test audio fits in a WAV data chunk");
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36_u32 + sample_bytes).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&16000_u32.to_le_bytes());
    wav.extend_from_slice(&32000_u32.to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&sample_bytes.to_le_bytes());
    wav.extend_from_slice(&samples);
    let asset = upload(&router, "/api/assets", "recording.wav", "audio/wav", &wav).await;
    let (_, recording) = request(
        &router,
        "POST",
        "/api/recordings",
        json!({"name":"音轨验证","asset_id":asset["id"],"duration":1}),
    )
    .await;
    let path = format!("/api/recordings/{}", recording["id"].as_str().unwrap());
    let (status, info) = request(&router, "GET", &format!("{path}/media"), Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(info["has_audio"], true);
    assert_eq!(info["audio_chunk_seconds"], 300.0);
    assert!((info["duration"].as_f64().unwrap() - 1.0).abs() < 0.01);
    let response = router
        .clone()
        .oneshot(
            Request::get(format!("{path}/audio?start=0.25&duration=0.5"))
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "audio/wav");
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    assert_eq!(&bytes[..4], b"RIFF");
    let format = bytes.windows(4).position(|bytes| bytes == b"fmt ").unwrap();
    assert_eq!(
        u32::from_le_bytes(bytes[format + 12..format + 16].try_into().unwrap()),
        16000
    );
    assert!(bytes.len() > 15000 && bytes.len() < 18000);
    assert_eq!(
        request(
            &router,
            "GET",
            &format!("{path}/audio?duration=301"),
            Value::Null
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        request(
            &router,
            "GET",
            &format!("{path}/audio?start=-1"),
            Value::Null
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[tokio::test]
async fn local_uploads_parse_documents_and_support_recording_ranges_and_analysis() {
    let directory = TempDir::new().unwrap();
    let app = application(&directory).await;
    let router = app.router();
    let parsed = upload(
        &router,
        "/api/documents/parse",
        "../材料.txt",
        "text/plain",
        "本地文档内容".as_bytes(),
    )
    .await;
    assert_eq!(parsed["text"], "本地文档内容");
    assert_eq!(parsed["asset"]["name"], "材料.txt");
    assert!(!directory.path().join("材料.txt").exists());
    let asset = upload(
        &router,
        "/api/assets",
        "recording.webm",
        "video/webm",
        b"0123456789",
    )
    .await;
    let download = Request::get(asset["url"].as_str().unwrap())
        .header("host", "127.0.0.1")
        .header("range", "bytes=2-5")
        .body(Body::empty())
        .unwrap();
    let response = router.clone().oneshot(download).await.unwrap();
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        response.headers()["content-security-policy"],
        "default-src 'none'; sandbox"
    );
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap().as_ref(),
        b"2345"
    );
    let (status, recording) = request(
        &router,
        "POST",
        "/api/recordings",
        json!({"name":"录屏验证","asset_id":asset["id"],"duration":12.5}),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let path = format!("/api/recordings/{}", recording["id"].as_str().unwrap());
    let (_, analyzed) = request(
        &router,
        "PATCH",
        &path,
        json!({"transcript":"讨论结果","analysis":"后续安排"}),
    )
    .await;
    assert_eq!(analyzed["analysis"], "后续安排");
    assert_eq!(analyzed["transcript"], "讨论结果");
    assert_eq!(
        request(&router, "DELETE", &path, Value::Null).await.0,
        StatusCode::NO_CONTENT
    );
}

#[tokio::test]
async fn local_api_rejects_cross_origin_access_and_has_no_model_configuration_endpoint() {
    let directory = TempDir::new().unwrap();
    let router = application(&directory).await.router();
    let external_request = Request::post("/api/projects")
        .header("host", "127.0.0.1")
        .header("origin", "https://unrelated.example")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        router
            .clone()
            .oneshot(external_request)
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &router,
            "POST",
            "/api/models",
            json!({"api_key":"example-only"})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &router,
            "POST",
            "/api/projects",
            json!({"name":"测试","model_config":{"api_key":"example-only"}})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let request = Request::get("/api/health")
        .header("host", "unrelated.example")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        router.oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn browser_routes_return_the_app_with_success_while_missing_api_routes_stay_not_found() {
    let directory = TempDir::new().unwrap();
    let web = directory.path().join("web");
    tokio::fs::create_dir_all(&web).await.unwrap();
    tokio::fs::write(web.join("index.html"), "<!doctype html><title>画语</title>")
        .await
        .unwrap();
    let router = application(&directory).await.router();
    let response = router
        .clone()
        .oneshot(
            Request::get("/drawing/example")
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    assert_eq!(
        request(&router, "GET", "/api/missing", Value::Null).await.0,
        StatusCode::NOT_FOUND
    );
}
