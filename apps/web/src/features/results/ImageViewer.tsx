import { errorText } from "@/i18n/errors";
import { useTranslations, type MessageKey } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Crop as CropIcon,
  RotateCw,
  Maximize,
  ZoomIn,
  ZoomOut,
  Loader2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { blobForSource } from "@/api/backend";
import {
  clampCrop,
  croppedImage,
  cropPixels,
  fullCrop,
  rotateImage,
  type Crop,
  imagePan,
} from "./image-edit";

export function ImageViewer({
  src,
  name,
  locked,
  onSave,
  onSize,
  onEditingChange,
}: {
  src: string;
  name: string;
  locked: boolean;
  onSave: (blob: Blob, width: number, height: number) => Promise<void>;
  onSize?: (width: number, height: number) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { t, locale } = useTranslations();
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [available, setAvailable] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ scale: 0, x: 0, y: 0 });
  const [phase, setPhase] = useState<
    "viewing" | "decoding" | "editing" | "saving"
  >("viewing");
  const editing = phase !== "viewing";
  const busy = phase === "decoding" || phase === "saving";
  const [turns, setTurns] = useState(0);
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<Error | MessageKey | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    mode: "crop" | "pan";
  } | null>(null);
  const fit = Math.min(available.w / size.w, available.h / size.h, 1);
  const scale = view.scale || fit;
  const errorMessage =
    error instanceof Error ? errorText(error, locale) : error && t(error);
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const display = { w: size.w * scale, h: size.h * scale };
  const fitted = { w: size.w * fit, h: size.h * fit };
  const selection = cropPixels(crop, size.w, size.h);
  const zoom = useRef<(factor: number, x?: number, y?: number) => void>(
    () => {},
  );
  zoom.current = (factor, x = available.w / 2, y = available.h / 2) => {
    const next = Math.max(Math.min(fit, 0.1), Math.min(8, scale * factor));
    const ratio = next / scale;
    setView({
      scale: next,
      ...imagePan(
        (view.x + available.w / 2 - x) * ratio - available.w / 2 + x,
        (view.y + available.h / 2 - y) * ratio - available.h / 2 + y,
        size.w * next,
        size.h * next,
        available.w,
        available.h,
      ),
    });
  };
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({
        w: Math.max(1, entry.contentRect.width - 32),
        h: Math.max(1, entry.contentRect.height - 32),
      });
      setView({ scale: 0, x: 0, y: 0 });
    });
    observer.observe(element);
    function wheel(event: WheelEvent) {
      if (editing || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      zoom.current(
        Math.exp(-event.deltaY * 0.01),
        event.clientX - rect.left - 16,
        event.clientY - rect.top - 16,
      );
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, [editing]);
  useEffect(() => {
    setView({ scale: 0, x: 0, y: 0 });
    if (!editing) {
      canvas.current = null;
      setPreview("");
      return;
    }
    let active = true;
    let url = "";
    setPhase("decoding");
    setError(null);
    void blobForSource(src)
      .then((blob) => rotateImage(blob, turns))
      .then((value) => {
        if (!active) return;
        canvas.current = value;
        url = value.toDataURL("image/png");
        setPreview(url);
        setSize({ w: value.width, h: value.height });
        setCrop(fullCrop());
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason
              : "results.image.imageCannotBeLoaded",
          );
      })
      .finally(() => {
        if (active) setPhase("editing");
      });
    return () => {
      active = false;
    };
  }, [src, editing, turns]);
  async function save() {
    if (!canvas.current || busy) return;
    setPhase("saving");
    setError(null);
    try {
      const result = await croppedImage(canvas.current, crop);
      await onSave(result.blob, result.width, result.height);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason : "results.image.cannotSaveTheImage",
      );
    } finally {
      setPhase("editing");
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        {editing ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPhase("viewing");
                setTurns(0);
              }}
            >
              <Undo2 />
              {t("results.image.cancel")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("results.image.rotateImageClockwise")}
              disabled={busy}
              onClick={() => setTurns((value) => value + 1)}
            >
              <RotateCw />
              {t("results.image.rotate")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setCrop(fullCrop())}
            >
              {t("results.image.reset")}
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("results.image.zoomOut")}
              onClick={() => zoom.current(0.8)}
            >
              <ZoomOut />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("results.image.originalSize")}
              className="min-w-16 tabular-nums"
              onClick={() => setView({ scale: 1, x: 0, y: 0 })}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("results.image.zoomIn")}
              onClick={() => zoom.current(1.25)}
            >
              <ZoomIn />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("results.image.fitImageToWindow")}
              onClick={() => setView({ scale: 0, x: 0, y: 0 })}
            >
              <Maximize />
            </Button>
          </div>
        )}
        {editing ? (
          <Button
            size="sm"
            disabled={busy || !canvas.current}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="animate-spin" />}
            {t("results.image.saveAsNewImage")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() => setPhase("decoding")}
          >
            <CropIcon />
            {t("results.image.cropAndRotate")}
          </Button>
        )}
      </div>
      {errorMessage && (
        <div
          role="alert"
          className="border-b px-4 py-2 text-xs text-destructive"
        >
          {errorMessage}
        </div>
      )}
      <div
        ref={area}
        tabIndex={0}
        data-result-focus
        aria-label={
          editing
            ? t("results.image.imageCropArea")
            : t("results.image.imageViewer")
        }
        className={`result-image-area relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden outline-none ${editing ? "cursor-crosshair" : scale > fit ? "cursor-grab active:cursor-grabbing" : ""}`}
        onKeyDown={(event) => {
          if (editing) return;
          if (["+", "=", "-", "0", "1"].includes(event.key))
            event.preventDefault();
          if (["+", "="].includes(event.key)) zoom.current(1.25);
          if (event.key === "-") zoom.current(0.8);
          if (event.key === "0" || event.key === "1")
            setView({ scale: event.key === "0" ? 0 : 1, x: 0, y: 0 });
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || busy) return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          if (editing) {
            const x =
              (event.clientX - rect.left - (rect.width - fitted.w) / 2) /
              fitted.w;
            const y =
              (event.clientY - rect.top - (rect.height - fitted.h) / 2) /
              fitted.h;
            if (x < 0 || x > 1 || y < 0 || y > 1) return;
            drag.current = { x, y, startX: 0, startY: 0, mode: "crop" };
          } else
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              startX: view.x,
              startY: view.y,
              mode: "pan",
            };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          if (current.mode === "crop") {
            const rect = event.currentTarget.getBoundingClientRect();
            setCrop(
              clampCrop(current, {
                x:
                  (event.clientX - rect.left - (rect.width - fitted.w) / 2) /
                  fitted.w,
                y:
                  (event.clientY - rect.top - (rect.height - fitted.h) / 2) /
                  fitted.h,
              }),
            );
          } else if (scale > fit)
            setView((value) => ({
              ...value,
              ...imagePan(
                current.startX + event.clientX - current.x,
                current.startY + event.clientY - current.y,
                size.w * scale,
                size.h * scale,
                available.w,
                available.h,
              ),
            }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="relative shrink-0"
          style={{
            width: editing ? fitted.w : display.w,
            height: editing ? fitted.h : display.h,
            transform: editing
              ? undefined
              : `translate(${view.x}px, ${view.y}px)`,
          }}
        >
          <img
            src={editing ? preview || src : src}
            alt={name}
            draggable={false}
            className="size-full select-none object-contain"
            onLoad={(event) => {
              if (!editing) {
                setSize({
                  w: event.currentTarget.naturalWidth,
                  h: event.currentTarget.naturalHeight,
                });
                onSize?.(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                );
              }
            }}
            onError={() => setError("results.image.reopenHint")}
          />
          {editing && (
            <div
              className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_100vmax_#0008]"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
            >
              <div className="absolute inset-x-1/3 inset-y-0 border-x border-white/30" />
              <div className="absolute inset-x-0 inset-y-1/3 border-y border-white/30" />
            </div>
          )}
        </div>
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2
              className="size-5 animate-spin"
              aria-label={t("results.image.processingImage")}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          {editing
            ? t("results.image.dragToSelectACrop")
            : t("results.image.zoomInThenDragToExploreTheDetails")}
        </span>
        <span className="shrink-0 tabular-nums">
          {editing
            ? `${selection.w} × ${selection.h}`
            : `${size.w} × ${size.h}`}
        </span>
      </div>
    </div>
  );
}
