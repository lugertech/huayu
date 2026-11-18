export function limitName(name: string, max = 120) {
  return Array.from(name).slice(0, max).join("");
}

const mediaExtensions: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg", "jpe", "jfif"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/svg+xml": ["svg"],
  "image/avif": ["avif"],
  "image/bmp": ["bmp"],
  "image/tiff": ["tiff", "tif"],
  "image/x-icon": ["ico"],
  "video/mp4": ["mp4", "m4v"],
  "audio/mp4": ["m4a", "mp4"],
  "video/webm": ["webm"],
  "audio/webm": ["webm", "weba"],
  "audio/mpeg": ["mp3", "mp2", "mpga"],
  "audio/mp3": ["mp3"],
  "audio/aac": ["aac"],
  "audio/x-m4a": ["m4a"],
  "audio/wav": ["wav", "wave"],
  "audio/x-wav": ["wav", "wave"],
  "audio/ogg": ["ogg", "oga", "opus"],
  "video/ogg": ["ogv", "ogg"],
  "audio/flac": ["flac"],
  "video/quicktime": ["mov", "qt"],
};

export function mediaFileName(name: string, mime?: string) {
  const base = name.replace(/[\\/]/g, "_");
  if (!mime) return base;
  const extensions = mediaExtensions[mime.split(";")[0].trim().toLowerCase()];
  const suffix = /\.([a-z0-9]{1,10})$/i.exec(base)?.[1].toLowerCase();
  if (suffix && (!extensions || extensions.includes(suffix))) return base;
  return base + "." + (extensions?.[0] ?? "bin");
}
