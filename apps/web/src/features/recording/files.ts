import { mediaFileName } from "@/lib/file-name";
import { blobForSource } from "@/api/resources";
import { downloadBlob, type Recording } from "@/api/client";

export function mediaDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const media = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Number.isFinite(media.duration)
        ? Math.round(media.duration)
        : 0;
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const timer = setTimeout(finish, 4000);
    media.onloadedmetadata = finish;
    media.onerror = finish;
    media.preload = "metadata";
    media.src = url;
  });
}

export async function downloadRecording(recording: Recording) {
  const blob = await blobForSource(`/api/assets/${recording.asset_id}`);
  downloadBlob(blob, mediaFileName(recording.name, blob.type));
}
