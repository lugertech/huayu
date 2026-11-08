use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};

use axum::{Json, extract::Query};
use encoding_rs::{Encoding, UTF_8};
use futures_util::StreamExt;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{ApiError, ApiResult};

#[derive(Deserialize)]
pub(crate) struct UnfurlQuery {
    url: String,
    #[serde(default, rename = "includeHtml")]
    include_html: bool,
}

#[derive(Serialize)]
pub(crate) struct Metadata {
    title: String,
    description: String,
    image: String,
    favicon: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    html: Option<String>,
}

pub(crate) async fn unfurl(Query(query): Query<UnfurlQuery>) -> ApiResult<Json<Metadata>> {
    let mut url = Url::parse(&query.url).map_err(|_| ApiError::invalid("网页地址格式有误"))?;
    for _ in 0..5 {
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(ApiError::invalid("仅支持不含凭据的 HTTP 或 HTTPS 网页地址"));
        }
        let hostname = url
            .host_str()
            .ok_or_else(|| ApiError::invalid("网页地址缺少域名"))?
            .to_owned();
        let port = url
            .port_or_known_default()
            .ok_or_else(|| ApiError::invalid("网页端口有误"))?;
        let addresses: Vec<SocketAddr> = tokio::net::lookup_host((hostname.as_str(), port))
            .await
            .map_err(|_| ApiError::invalid("无法解析网页域名"))?
            .collect();
        if addresses.is_empty()
            || addresses
                .iter()
                .any(|address| !public_address(address.ip()))
        {
            return Err(ApiError::invalid("该地址无法作为外部网页读取"));
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(&hostname, &addresses)
            .build()
            .map_err(ApiError::internal)?;
        let response = client
            .get(url.clone())
            .header("User-Agent", "Huayu/0.1")
            .send()
            .await
            .map_err(|_| ApiError::invalid("无法读取网页，请检查地址后重试"))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| ApiError::invalid("网页跳转地址有误"))?;
            url = url
                .join(location)
                .map_err(|_| ApiError::invalid("网页跳转地址有误"))?;
            continue;
        }
        if !response.status().is_success() {
            return Err(ApiError::invalid("网页未返回可读取的内容"));
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| ApiError::invalid("网页读取中断"))?;
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return Err(ApiError::invalid("网页内容过大"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let html = decode_html(&bytes, content_type.as_deref())?;
        return Ok(Json(metadata(&html, &url, query.include_html)?));
    }
    Err(ApiError::invalid("网页跳转次数过多"))
}

/// Decodes text before extracting metadata or forwarding HTML to the canvas.
/// A BOM takes precedence over HTTP headers, then HTML declarations, then UTF-8.
fn decode_html(bytes: &[u8], content_type: Option<&str>) -> ApiResult<String> {
    let content_encoding = |content_type: &str| {
        content_type.split(';').skip(1).find_map(|parameter| {
            let (name, value) = parameter.trim().split_once('=')?;
            if !name.trim().eq_ignore_ascii_case("charset") {
                return None;
            }
            Encoding::for_label(value.trim().trim_matches(['\'', '"']).as_bytes())
        })
    };
    let mut encoding = Encoding::for_bom(bytes)
        .map(|(encoding, _)| encoding)
        .or_else(|| content_type.and_then(content_encoding));
    if encoding.is_none() {
        // Charset labels and HTML attribute syntax are ASCII in legacy pages too.
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]);
        let document = Html::parse_document(&head);
        let selector =
            Selector::parse("meta[charset], meta[http-equiv]").map_err(ApiError::internal)?;
        encoding = document.select(&selector).find_map(|node| {
            if let Some(charset) = node.value().attr("charset") {
                return Encoding::for_label(charset.as_bytes());
            }
            if node
                .value()
                .attr("http-equiv")
                .is_some_and(|value| value.eq_ignore_ascii_case("content-type"))
            {
                return node.value().attr("content").and_then(content_encoding);
            }
            None
        });
    }
    Ok(encoding.unwrap_or(UTF_8).decode(bytes).0.into_owned())
}

fn metadata(html: &str, url: &Url, include_html: bool) -> ApiResult<Metadata> {
    let document = Html::parse_document(html);
    let title_selector = Selector::parse("title").map_err(ApiError::internal)?;
    let description_selector =
        Selector::parse("meta[name=description],meta[property='og:description']")
            .map_err(ApiError::internal)?;
    let image_selector =
        Selector::parse("meta[property='og:image']").map_err(ApiError::internal)?;
    let title = document
        .select(&title_selector)
        .next()
        .map(|node| node.text().collect::<String>())
        .unwrap_or_else(|| url.host_str().unwrap_or_default().to_owned());
    let description = document
        .select(&description_selector)
        .next()
        .and_then(|node| node.value().attr("content"))
        .unwrap_or_default()
        .to_owned();
    let image = document
        .select(&image_selector)
        .next()
        .and_then(|node| node.value().attr("content"))
        .and_then(|value| url.join(value).ok())
        .filter(|value| matches!(value.scheme(), "https" | "http"))
        .map(|value| value.to_string())
        .unwrap_or_default();
    let favicon = url
        .join("/favicon.ico")
        .map(|value| value.to_string())
        .unwrap_or_default();
    Ok(Metadata {
        title,
        description,
        image,
        favicon,
        html: include_html.then(|| html.to_owned()),
    })
}

fn public_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && !ip.is_broadcast()
                && !ip.is_unspecified()
                && ip.octets()[0] != 0
        }
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() {
                return public_address(IpAddr::V4(ip));
            }
            !ip.is_loopback()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && (ip.segments()[0] & 0xfe00) != 0xfc00
                && (ip.segments()[0] & 0xffc0) != 0xfe80
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_html, metadata};
    use encoding_rs::{GBK, SHIFT_JIS};
    use url::Url;

    #[test]
    fn decodes_http_charset_before_reading_metadata_and_html() {
        let source =
            "<title>中文标题</title><meta name='description' content='网页摘要'><p>原始内容</p>";
        let (bytes, _, errors) = GBK.encode(source);
        assert!(!errors);
        let html = decode_html(&bytes, Some("text/html; Charset=\"GB2312\"")).unwrap();
        let value = metadata(&html, &Url::parse("https://example.com/").unwrap(), true).unwrap();
        assert_eq!(value.title, "中文标题");
        assert_eq!(value.description, "网页摘要");
        assert_eq!(value.html.as_deref(), Some(source));
    }

    #[test]
    fn reads_html_charset_and_legacy_content_type_declarations() {
        let japanese = "<meta charset='Shift_JIS'><title>日本語のページ</title>";
        let (bytes, _, errors) = SHIFT_JIS.encode(japanese);
        assert!(!errors);
        assert_eq!(decode_html(&bytes, None).unwrap(), japanese);
        let chinese = "<meta http-equiv='Content-Type' content='text/html; charset=gb18030'><title>中文</title>";
        let (bytes, _, errors) = GBK.encode(chinese);
        assert!(!errors);
        assert_eq!(
            decode_html(&bytes, Some("text/html; charset=unknown")).unwrap(),
            chinese
        );
    }

    #[test]
    fn preserves_utf8_and_respects_bom_and_http_precedence() {
        let utf8 = "<title>中文 · English · 日本語</title>";
        assert_eq!(decode_html(utf8.as_bytes(), None).unwrap(), utf8);
        let bom = [b"\xef\xbb\xbf".as_slice(), utf8.as_bytes()].concat();
        assert_eq!(
            decode_html(&bom, Some("text/html; charset=gbk")).unwrap(),
            utf8
        );
        let source = "<meta charset='utf-8'><title>中文</title>";
        let (bytes, _, errors) = GBK.encode(source);
        assert!(!errors);
        assert_eq!(
            decode_html(&bytes, Some("text/html; charset=gbk")).unwrap(),
            source
        );
    }
}
