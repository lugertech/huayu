import { transcribe } from "@/ai/provider";
import { getSettings, requireConnection } from "@/ai/settings";
import { blobForSource } from "@/api/resources";
import { extractRecordingAudio } from "@/features/recording/audio";

export async function transcribeSource(
  source: string,
  settings = getSettings(),
  signal?: AbortSignal,
): Promise<string> {
  const blob = await blobForSource(source, signal);
  const connection = requireConnection("transcription", settings);
  const chunks = await extractRecordingAudio(blob, signal);
  const text: string[] = [];
  for (const chunk of chunks) {
    signal?.throwIfAborted();
    text.push(await transcribe(chunk.blob, "audio.wav", signal, connection));
  }
  return text.filter(Boolean).join("\n");
}
