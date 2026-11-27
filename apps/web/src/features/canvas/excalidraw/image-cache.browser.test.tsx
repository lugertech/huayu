import { createRoot } from "react-dom/client";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { expect, it, vi } from "vite-plus/test";

function rgba(context: CanvasRenderingContext2D, x: number, y: number) {
  return context
    .getImageData(Math.round(x), Math.round(y), 1, 1)
    .data.join(",");
}

it.each(["decode first", "replace first"])(
  "draws the shared PNG on both replacement elements (%s)",
  async (order) => {
    const png = document.createElement("canvas");
    png.width = 64;
    png.height = 48;
    const ctx = png.getContext("2d")!;
    ctx.fillStyle = "#28a870";
    ctx.fillRect(0, 0, 32, 48);
    ctx.fillStyle = "#dc6440";
    ctx.fillRect(32, 0, 32, 48);
    const file: BinaryFileData = {
      id: "shared-png" as BinaryFileData["id"],
      dataURL: png.toDataURL() as BinaryFileData["dataURL"],
      mimeType: "image/png",
      created: 1,
    };

    // Hold only the native decoder requested by Excalidraw for this exact PNG.
    const pending: HTMLImageElement[] = [];
    const setSrc = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    )!.set!;
    const gate = vi
      .spyOn(HTMLImageElement.prototype, "src", "set")
      .mockImplementation(function (this: HTMLImageElement, url: string) {
        if (url === file.dataURL) pending.push(this);
        else setSrc.call(this, url);
      });

    const host = document.body.appendChild(document.createElement("div"));
    host.style.cssText = "position:fixed;inset:0";
    const root = createRoot(host);
    try {
      const left = [40, 160];
      const elements = convertToExcalidrawElements(
        left.map((x) => ({
          type: "image",
          x,
          y: 40,
          width: 64,
          height: 48,
          fileId: file.id,
        })),
      );
      const api = await new Promise<ExcalidrawImperativeAPI>(
        (excalidrawAPI) => {
          root.render(
            <Excalidraw
              excalidrawAPI={excalidrawAPI}
              initialData={{ elements }}
            />,
          );
        },
      );
      function pixels(y: number) {
        const canvas = host.querySelector<HTMLCanvasElement>("canvas.static")!;
        const context = canvas.getContext("2d")!;
        const { scrollX, scrollY, zoom } = api.getAppState();
        const scale = zoom.value * window.devicePixelRatio;
        return left.flatMap((x) =>
          [8, 56].map((dx) =>
            rgba(
              context,
              (x + dx + scrollX) * scale,
              (y + 8 + scrollY) * scale,
            ),
          ),
        );
      }
      const original = left.flatMap(() => [rgba(ctx, 8, 8), rgba(ctx, 56, 8)]);
      // A painted placeholder must differ from the empty row below it.
      await expect.poll(() => pixels(40)[0] !== pixels(140)[0]).toBe(true);
      const placeholder = pixels(40);
      api.addFiles([file]);
      await expect.poll(() => pending.length).toBeGreaterThan(0);

      const decodePng = async () => {
        gate.mockRestore();
        for (const image of pending) image.src = file.dataURL;
        await Promise.all(pending.map((image) => image.decode()));
      };
      if (order === "decode first") {
        await decodePng();
        await expect.poll(() => pixels(40)).toEqual(original);
      }

      // Apply a remote scene replacement with the existing IDs and fileId,
      // as the store bridge does when handling a collaboration snapshot.
      const moved = restoreElements(
        api.getSceneElements().map((element) => ({
          ...element,
          y: 140,
        })),
        null,
        { repairBindings: true },
      );
      api.updateScene({
        elements: moved,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      if (order === "replace first") {
        await expect.poll(() => pixels(140)).toEqual(placeholder);
        await decodePng();
      }
      await expect
        .poll(() => pixels(140), {
          message: "decoded PNG pixels on both moved elements",
        })
        .toEqual(original);
    } finally {
      gate.mockRestore();
      root.unmount();
      host.remove();
    }
  },
);
