import { LocalizedError } from "@/i18n/errors";
export interface AudioChunk {
  blob: Blob;
  start: number;
  duration: number;
}

/** Decodes locally and splits mono 16 kHz PCM into five-minute WAV files. */
export async function extractRecordingAudio(
  blob: Blob,
  signal?: AbortSignal,
): Promise<AudioChunk[]> {
  const context = new AudioContext();
  try {
    signal?.throwIfAborted();
    const original = await context.decodeAudioData(await blob.arrayBuffer());
    signal?.throwIfAborted();
    const sampleRate = 16000;
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(original.duration * sampleRate),
      sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = original;
    source.connect(offline.destination);
    source.start();
    const buffer = await offline.startRendering();
    const samples = buffer.getChannelData(0);
    const chunks: AudioChunk[] = [];
    const chunkLength = sampleRate * 300;
    for (let start = 0; start < samples.length; start += chunkLength) {
      signal?.throwIfAborted();
      const end = Math.min(start + chunkLength, samples.length);
      chunks.push({
        blob: encodeWav(samples.subarray(start, end), sampleRate),
        start: start / sampleRate,
        duration: (end - start) / sampleRate,
      });
    }
    return chunks;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new LocalizedError(
      { key: "recordings.cannotReadTheRecordingsAudio" },
      {
        cause: error,
      },
    );
  } finally {
    await context.close();
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  function text(offset: number, value: string) {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index));
  }
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      value < 0 ? value * 32768 : value * 32767,
      true,
    );
  }
  return new Blob([wav], { type: "audio/wav" });
}
