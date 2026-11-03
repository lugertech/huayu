//! Local media probing, recording covers and bounded PCM extraction. Input is always a stored asset UUID.

use std::{path::PathBuf, process::Stdio, sync::OnceLock, time::Duration};

use axum::{
    Json,
    body::Body,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use huayu_core::Asset;
use serde::{Deserialize, Serialize};
use tokio::{process::Command, sync::Semaphore, time::timeout};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState};

const CHUNK_SECONDS: f64 = 300.0;
const MEDIA_FORMATS: &str =
    "matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,avi,wav,mp3,ogg,flac,aac,aiff,mpeg,mpegts,asf";
static MEDIA_WORKERS: OnceLock<Semaphore> = OnceLock::new();

#[derive(Serialize)]
pub(crate) struct MediaInfo {
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    has_audio: bool,
    audio_chunk_seconds: f64,
}

#[derive(Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<String>,
}

#[derive(Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

#[derive(Deserialize)]
struct ProbeResult {
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AudioQuery {
    #[serde(default)]
    start: f64,
    #[serde(default = "chunk_seconds")]
    duration: f64,
}

fn chunk_seconds() -> f64 {
    CHUNK_SECONDS
}

async fn recording_asset(state: &AppState, id: &str) -> ApiResult<(Asset, PathBuf)> {
    let recording = state.store.recording(id).await?;
    Uuid::parse_str(&recording.asset_id).map_err(|_| ApiError::not_found())?;
    let asset = state.store.asset(&recording.asset_id).await?;
    if !asset.mime.starts_with("audio/") && !asset.mime.starts_with("video/") {
        return Err(ApiError::invalid("请选择视频或音频文件"));
    }
    let path = state.data_dir.join("assets").join(&asset.id);
    Ok((asset, path))
}

#[derive(Clone, Copy)]
enum MediaTask {
    Audio,
    Cover,
}

fn decoder_unavailable(task: MediaTask) -> ApiError {
    if matches!(task, MediaTask::Cover) {
        return ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "COVER_DECODER_UNAVAILABLE",
            "暂时无法生成录屏封面",
        );
    }
    ApiError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "AUDIO_DECODER_UNAVAILABLE",
        "本地音轨解码暂不可用",
    )
}

async fn media_command(command: &mut Command, task: MediaTask) -> ApiResult<Vec<u8>> {
    let _permit = timeout(
        Duration::from_secs(match task {
            MediaTask::Audio => 15,
            MediaTask::Cover => 3,
        }),
        MEDIA_WORKERS.get_or_init(|| Semaphore::new(2)).acquire(),
    )
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "MEDIA_BUSY",
            "正在处理其他录屏，请稍后重试",
        )
    })?
    .map_err(ApiError::internal)?;
    let result = timeout(
        Duration::from_secs(match task {
            MediaTask::Audio => 120,
            MediaTask::Cover => 10,
        }),
        command.stdin(Stdio::null()).kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::GATEWAY_TIMEOUT,
            "MEDIA_TIMEOUT",
            match task {
                MediaTask::Audio => "音轨读取超时，请重试",
                MediaTask::Cover => "录屏封面读取超时，请重试",
            },
        )
    })?
    .map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            decoder_unavailable(task)
        } else {
            ApiError::internal(error)
        }
    })?;
    if !result.status.success() {
        return Err(match task {
            MediaTask::Audio => {
                ApiError::invalid("无法读取这段录屏的音轨，请确认文件完整且包含声音")
            }
            MediaTask::Cover => ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "RECORDING_COVER_UNAVAILABLE",
                "这段录屏暂时无法显示预览",
            ),
        });
    }
    Ok(result.stdout)
}

pub(crate) async fn info(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<MediaInfo>> {
    let (_, path) = recording_asset(&state, &id).await?;
    let output = media_command(
        Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                MEDIA_FORMATS,
                "-show_entries",
                "format=duration:stream=codec_type,width,height,duration",
                "-of",
                "json",
            ])
            .arg(path),
        MediaTask::Audio,
    )
    .await?;
    let probe: ProbeResult = serde_json::from_slice(&output).map_err(ApiError::internal)?;
    let video = probe
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("video"));
    let duration = probe
        .format
        .and_then(|format| format.duration)
        .and_then(|value| value.parse::<f64>().ok())
        .or_else(|| {
            probe
                .streams
                .iter()
                .filter_map(|stream| stream.duration.as_ref()?.parse::<f64>().ok())
                .reduce(f64::max)
        })
        .filter(|duration| duration.is_finite() && *duration > 0.0)
        .unwrap_or(state.store.recording(&id).await?.duration);
    Ok(Json(MediaInfo {
        duration,
        width: video.and_then(|stream| stream.width),
        height: video.and_then(|stream| stream.height),
        has_audio: probe
            .streams
            .iter()
            .any(|stream| stream.codec_type.as_deref() == Some("audio")),
        audio_chunk_seconds: CHUNK_SECONDS,
    }))
}

pub(crate) async fn audio(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<AudioQuery>,
) -> ApiResult<Response> {
    if !query.start.is_finite()
        || query.start < 0.0
        || !query.duration.is_finite()
        || query.duration <= 0.0
        || query.duration > CHUNK_SECONDS
    {
        return Err(ApiError::invalid("音轨分段范围有误，单次最多读取五分钟"));
    }
    let (_, path) = recording_asset(&state, &id).await?;
    let output = media_command(
        Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                MEDIA_FORMATS,
                "-ss",
            ])
            .arg(query.start.to_string())
            .arg("-i")
            .arg(path)
            .arg("-t")
            .arg(query.duration.to_string())
            .args([
                "-map",
                "0:a:0",
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                "-f",
                "wav",
                "pipe:1",
            ]),
        MediaTask::Audio,
    )
    .await?;
    if output.len() < 44 || output.len() > 11 * 1024 * 1024 {
        return Err(ApiError::invalid("录屏没有可读取的音轨"));
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "audio/wav")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(output))
        .map_err(ApiError::internal)
}

/// Selects a representative early frame without changing the recording or its metadata.
/// The browser may cache this immutable source image; decoding shares the media worker limit.
pub(crate) async fn cover(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (asset, path) = recording_asset(&state, &id).await?;
    if asset.mime.starts_with("audio/") {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let output = media_command(
        Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                MEDIA_FORMATS,
                "-i",
            ])
            .arg(path)
            .args([
                "-map",
                "0:v:0",
                "-an",
                "-sn",
                "-vf",
                "scale=640:360:force_original_aspect_ratio=decrease,thumbnail=30,setsar=1",
                "-frames:v",
                "1",
                "-threads",
                "1",
                "-c:v",
                "mjpeg",
                "-q:v",
                "3",
                "-f",
                "image2pipe",
                "pipe:1",
            ]),
        MediaTask::Cover,
    )
    .await?;
    if !output.starts_with(&[0xff, 0xd8]) || !output.ends_with(&[0xff, 0xd9]) {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "RECORDING_COVER_UNAVAILABLE",
            "这段录屏暂时无法显示预览",
        ));
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "image/jpeg")
        .header(header::CACHE_CONTROL, "private, max-age=86400")
        .body(Body::from(output))
        .map_err(ApiError::internal)
}
