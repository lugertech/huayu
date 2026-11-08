import { LocalizedError } from "@/i18n/errors";
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const fullCrop = (): Crop => ({ x: 0, y: 0, w: 1, h: 1 });
export function clampCrop(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Crop {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const left = Math.min(0.99, Math.min(clamp(a.x), clamp(b.x)));
  const top = Math.min(0.99, Math.min(clamp(a.y), clamp(b.y)));
  return {
    x: left,
    y: top,
    w: Math.max(0.01, Math.min(1 - left, Math.abs(clamp(b.x) - clamp(a.x)))),
    h: Math.max(0.01, Math.min(1 - top, Math.abs(clamp(b.y) - clamp(a.y)))),
  };
}
export function imagePan(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const maxX = Math.max(0, (width - viewportWidth) / 2);
  const maxY = Math.max(0, (height - viewportHeight) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}
export function cropPixels(crop: Crop, width: number, height: number) {
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.round(crop.w * width))),
    h: Math.max(1, Math.min(height - y, Math.round(crop.h * height))),
  };
}
export async function rotateImage(
  blob: Blob,
  turns: number,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const quarter = ((turns % 4) + 4) % 4;
    const canvas = document.createElement("canvas");
    canvas.width = quarter % 2 ? bitmap.height : bitmap.width;
    canvas.height = quarter % 2 ? bitmap.width : bitmap.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new LocalizedError({
        key: "results.image.thisImageCannotBeEditedRightNow",
      });
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((quarter * Math.PI) / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvas;
  } finally {
    bitmap.close();
  }
}
export async function croppedImage(source: HTMLCanvasElement, crop: Crop) {
  const box = cropPixels(crop, source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  const context = canvas.getContext("2d");
  if (!context)
    throw new LocalizedError({ key: "results.image.cannotSaveImage" });
  context.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(
              new LocalizedError({ key: "results.image.cannotSaveTheImage" }),
            ),
      "image/png",
    ),
  );
  return { blob, width: box.w, height: box.h };
}
