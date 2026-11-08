import { describe, expect, it } from "vite-plus/test";
import { clampCrop, cropPixels, fullCrop, imagePan } from "./image-edit";
describe("local image crop geometry", () => {
  it("keeps a zoomed image within reach and centers images smaller than the viewport", () => {
    expect(imagePan(900, -900, 1200, 800, 800, 600)).toEqual({
      x: 200,
      y: -100,
    });
    expect(imagePan(200, 200, 400, 300, 800, 600)).toMatchObject({
      x: 0,
      y: 0,
    });
  });
  it("produces the same crop when dragging in either direction", () => {
    expect(clampCrop({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 })).toEqual(
      clampCrop({ x: 0.8, y: 0.9 }, { x: 0.1, y: 0.2 }),
    );
  });
  it("keeps a crop inside the source pixels, including release beyond the edge", () => {
    const crop = clampCrop({ x: 0.5, y: 0.5 }, { x: 1.4, y: 1.7 });
    expect(cropPixels(crop, 800, 600)).toEqual({
      x: 400,
      y: 300,
      w: 400,
      h: 300,
    });
    expect(
      cropPixels(clampCrop({ x: 0.5, y: 0.5 }, { x: -1, y: -2 }), 800, 600),
    ).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(
      cropPixels(clampCrop({ x: 1, y: 1 }, { x: 1, y: 1 }), 800, 600),
    ).toEqual({ x: 792, y: 594, w: 8, h: 6 });
  });
  it("preserves full original dimensions and never exports an empty bitmap", () => {
    expect(cropPixels(fullCrop(), 801, 601)).toEqual({
      x: 0,
      y: 0,
      w: 801,
      h: 601,
    });
    expect(cropPixels({ x: 1, y: 1, w: 0, h: 0 }, 800, 600)).toEqual({
      x: 799,
      y: 599,
      w: 1,
      h: 1,
    });
  });
});
