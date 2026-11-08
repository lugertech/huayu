use axum::{
    body::Body,
    extract::Request,
    http::{HeaderMap, HeaderValue, Method, header},
    middleware::Next,
    response::Response,
};

use crate::ApiError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ApiLocale {
    ZhCn,
    En,
}

impl ApiLocale {
    fn from_headers(headers: &HeaderMap) -> Self {
        let mut selected = Self::ZhCn;
        let mut highest_quality = 0.0_f32;
        for value in headers.get_all(header::ACCEPT_LANGUAGE) {
            let Ok(value) = value.to_str() else {
                continue;
            };
            for language in value.split(',') {
                let mut parts = language.split(';');
                let tag = parts.next().unwrap_or_default().trim();
                let locale = match tag.split('-').next().unwrap_or_default() {
                    primary if primary.eq_ignore_ascii_case("en") => Self::En,
                    primary if primary.eq_ignore_ascii_case("zh") || primary == "*" => Self::ZhCn,
                    _ => continue,
                };
                let quality = parts
                    .find_map(|parameter| {
                        let (name, value) = parameter.trim().split_once('=')?;
                        name.trim()
                            .eq_ignore_ascii_case("q")
                            .then(|| value.trim().parse::<f32>().ok())
                    })
                    .unwrap_or(Some(1.0));
                if let Some(quality) = quality
                    && quality > highest_quality
                    && quality <= 1.0
                {
                    highest_quality = quality;
                    selected = locale;
                }
            }
        }
        selected
    }

    fn language_tag(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::En => "en",
        }
    }
}

/// Localizes business and extractor errors, including early access rejections.
/// Successful data and authored content keep their original representation.
pub(crate) async fn localize_errors(request: Request, next: Next) -> Response {
    let locale = ApiLocale::from_headers(request.headers());
    let head_request = request.method() == Method::HEAD;
    let path = request.uri().path();
    let api_request = path == "/api" || path.starts_with("/api/");
    let mut response = next.run(request).await;
    let error = response.extensions_mut().remove::<ApiError>().or_else(|| {
        (api_request
            && (response.status().is_client_error() || response.status().is_server_error()))
        .then(|| ApiError::for_status(response.status()))
    });
    if let Some(error) = error {
        // Keep status, access cookies, Allow and security headers from the original response.
        *response.body_mut() = if head_request {
            Body::empty()
        } else {
            error.response(locale).into_body()
        };
        let headers = response.headers_mut();
        headers.remove(header::CONTENT_LENGTH);
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        headers.insert(
            header::CONTENT_LANGUAGE,
            HeaderValue::from_static(locale.language_tag()),
        );
        headers.append(header::VARY, HeaderValue::from_static("Accept-Language"));
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::{ApiLocale, localize_errors};
    use axum::{
        Router,
        body::{Body, to_bytes},
        extract::DefaultBodyLimit,
        http::{HeaderMap, HeaderValue, Request, StatusCode, header},
        middleware,
        routing::post,
    };
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use crate::error::ApiJson;

    #[test]
    fn negotiates_supported_languages_and_quality_without_shared_state() {
        for (value, expected) in [
            ("en", ApiLocale::En),
            ("en-US,en;q=0.9", ApiLocale::En),
            ("EN-gb", ApiLocale::En),
            ("zh-TW", ApiLocale::ZhCn),
            ("en;q=0.2, zh-CN;q=0.9", ApiLocale::ZhCn),
            ("fr, en;q=0.8, zh;q=0.5", ApiLocale::En),
            ("zh;q=0, en;q=0.5", ApiLocale::En),
            ("en;q=0", ApiLocale::ZhCn),
            ("en;q=invalid,zh", ApiLocale::ZhCn),
            ("en;q=NaN", ApiLocale::ZhCn),
            ("en;q=2", ApiLocale::ZhCn),
            ("de,fr", ApiLocale::ZhCn),
            ("*", ApiLocale::ZhCn),
            ("", ApiLocale::ZhCn),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(
                header::ACCEPT_LANGUAGE,
                HeaderValue::from_str(value).unwrap(),
            );
            assert_eq!(ApiLocale::from_headers(&headers), expected, "{value}");
        }
        assert_eq!(ApiLocale::from_headers(&HeaderMap::new()), ApiLocale::ZhCn);
    }

    #[tokio::test]
    async fn oversized_json_uses_the_localized_contract_and_head_errors_have_no_body() {
        let router = Router::new()
            .route("/api/test", post(|_: ApiJson<Value>| async {}))
            .layer(DefaultBodyLimit::max(16))
            .layer(middleware::from_fn(localize_errors));
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/test")
                    .header("accept-language", "en")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"name":"A".repeat(32)}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(response.headers()["content-language"], "en");
        let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
        let error: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            error,
            json!({"code":"REQUEST_TOO_LARGE","message":"The request body is too large","params":{}})
        );

        let response = router
            .oneshot(
                Request::builder()
                    .method("HEAD")
                    .uri("/api/test")
                    .header("accept-language", "en")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(response.headers()["content-language"], "en");
        assert!(response.headers().contains_key("allow"));
        assert!(
            to_bytes(response.into_body(), 4096)
                .await
                .unwrap()
                .is_empty()
        );
    }
}
