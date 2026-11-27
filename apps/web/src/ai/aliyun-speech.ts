import { LocalizedError } from "@/i18n/errors";
import {
  ALIYUN_ASR_MODEL,
  ALIYUN_TTS_MODEL,
  type SpeechConnection,
  type TranscriptionConnection,
} from "./model-config";
import {
  blobDataUrl,
  decodeBase64,
  invalidModelResponse,
  isEventStream,
  isRecord,
  modelEvents,
  modelRequest,
} from "./model-request";

const DASHSCOPE_STREAM_HEADERS = { "X-DashScope-SSE": "enable" };

export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Transcription {
  text: string;
  segments: SpeechSegment[];
}

export function requestSpeech(
  text: string,
  connection: SpeechConnection,
  signal?: AbortSignal,
  timeout?: number,
) {
  return modelRequest(
    "speech",
    connection,
    signal,
    async (request, requestSignal) => {
      const response = await request(
        "api/v1/services/audio/tts/SpeechSynthesizer",
        {
          model: ALIYUN_TTS_MODEL,
          input: {
            text,
            voice: connection.voice.trim(),
            format: "mp3",
          },
        },
        DASHSCOPE_STREAM_HEADERS,
      );
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let finished = false;
      for await (const { body } of modelEvents(response, requestSignal)) {
        if (!isRecord(body.output)) throw invalidModelResponse("speech");
        const { audio, finish_reason } = body.output;
        if (isRecord(audio) && typeof audio.data === "string" && audio.data)
          chunks.push(decodeBase64(audio.data));
        if (finish_reason === "stop") finished = true;
      }
      if (!finished || !chunks.some((chunk) => chunk.length))
        throw invalidModelResponse("speech");
      const result = new Blob(chunks, { type: "audio/mpeg" });
      const header = new Uint8Array(await result.slice(0, 3).arrayBuffer());
      const hasId3 =
        header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
      const hasMp3Frame = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
      if (!hasId3 && !hasMp3Frame) throw invalidModelResponse("speech");
      return result;
    },
    timeout,
  );
}

export function requestTranscription(
  file: Blob,
  name: string,
  connection: TranscriptionConnection,
  signal?: AbortSignal,
  timeout?: number,
) {
  return modelRequest(
    "transcription",
    connection,
    signal,
    async (request, requestSignal): Promise<Transcription> => {
      const extension = name.split(".").pop()?.toLowerCase();
      const mime = file.type.split(";")[0];
      const format =
        mime === "audio/wav" ||
        mime === "audio/x-wav" ||
        mime === "audio/wave" ||
        extension === "wav"
          ? "wav"
          : mime === "audio/mpeg" || mime === "audio/mp3" || extension === "mp3"
            ? "mp3"
            : mime === "audio/opus" || extension === "opus"
              ? "opus"
              : undefined;
      if (!format)
        throw new LocalizedError({ key: "api.unsupportedFileFormat" });
      const data = await blobDataUrl(
        file,
        format === "mp3" ? "audio/mpeg" : "audio/" + format,
      );
      const response = await request(
        "api/v1/services/aigc/multimodal-generation/generation",
        {
          model: ALIYUN_ASR_MODEL,
          input: {
            messages: [
              {
                role: "user",
                content: [{ type: "input_audio", input_audio: { data } }],
              },
            ],
          },
          parameters: { format },
        },
        DASHSCOPE_STREAM_HEADERS,
      );
      let text: string | undefined;
      let pendingSentence = false;
      const finished = new Map<string, SpeechSegment>();
      function readOutput(body: unknown) {
        if (!isRecord(body) || !isRecord(body.output))
          throw invalidModelResponse("transcription");
        const output = body.output;
        if (typeof output.text === "string") text = output.text;
        const sentences: unknown[] = Array.isArray(output.sentences)
          ? output.sentences
          : [output.sentence];
        const sentenceRecords = sentences.filter(isRecord);
        if (sentenceRecords.length)
          pendingSentence = sentenceRecords.some(
            (sentence) => sentence.sentence_end === false,
          );
        for (const sentence of sentenceRecords) {
          if (sentence.sentence_end !== true) continue;
          const {
            begin_time,
            end_time,
            text,
            speaker_id,
            sentence_id,
            channel_id,
          } = sentence;
          if (
            typeof begin_time !== "number" ||
            !Number.isFinite(begin_time) ||
            begin_time < 0 ||
            typeof end_time !== "number" ||
            !Number.isFinite(end_time) ||
            end_time <= begin_time ||
            typeof text !== "string" ||
            !text.trim()
          )
            continue;
          const key =
            String(channel_id ?? 0) + "/" + String(sentence_id ?? begin_time);
          finished.set(key, {
            start: begin_time / 1000,
            end: end_time / 1000,
            text,
            ...(typeof speaker_id === "number" && {
              speaker: String(speaker_id),
            }),
          });
        }
      }
      if (isEventStream(response)) {
        for await (const { body } of modelEvents(response, requestSignal))
          readOutput(body);
      } else {
        readOutput(await response.json());
      }
      if (text === undefined || pendingSentence)
        throw invalidModelResponse("transcription");
      return {
        text,
        segments: [...finished.values()].sort(
          (first, second) => first.start - second.start,
        ),
      };
    },
    timeout,
  );
}
