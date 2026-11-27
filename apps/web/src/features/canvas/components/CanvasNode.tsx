import { mediaFileName } from "@/lib/file-name";
import { LocalizedError } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useEditor } from "@/features/canvas/editor";
import {
  Copy,
  Download,
  Globe,
  ImageIcon,
  Loader2,
  Upload,
  ArrowUpRight,
  Video,
  FileText,
  Volume2,
  ChartNetwork,
  RefreshCw,
  ImageUp,
  Maximize,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ComponentToolSelect } from "./ComponentToolSelect";
import { ComponentConnectionDots } from "./ComponentConnectionDots";
import { ComponentHeader } from "./ComponentHeader";
import { canvasErrorToast } from "./CanvasErrorToast";
import { isSharedCanvas } from "@/lib/canvas-access";
import { DEFAULT_IMAGE_RATIO, IMAGE_SIZE_PRESETS } from "@/workflow/image-size";
import { componentPlaceholder } from "@/config/components";
import { formatDuration } from "@/features/recording/duration";
import { applyComponentUpload, uploadComponentFile } from "@/workflow/uploads";
import { previewHTML } from "../../results/WebPreview";
import { useToast } from "@/components/common/ToastProvider";
import {
  runWorkflow,
  useNodeBusy,
  useNodeExecution,
  type NodeData,
} from "@/workflow/execute";
import type { AIComponentShape } from "@/types/components";
import { blobForSource } from "@/api/resources";
import { downloadBlob } from "@/api/client";
import { MindmapRenderer } from "./shapes/chart-shape/MindmapRenderer";
import type { MindmapData } from "../charts/mindmap-layout";
import { FlowchartRenderer } from "./shapes/chart-shape/FlowchartRenderer";
import type { FlowchartData } from "../charts/flowchart-layout";

export function CanvasNode({
  shape,
  expanded = false,
  overview = false,
  onClose,
}: {
  shape: AIComponentShape;
  expanded?: boolean;
  overview?: boolean;
  onClose?: () => void;
}) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const { showToast } = useToast();
  const props = shape.props as NodeData;
  const running = useNodeBusy(editor, shape.id);
  const execution = useNodeExecution(editor, shape.id, locale);
  const selected = editor.getSelectedShapeIds().includes(shape.id);
  const container = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  useEffect(() => {
    if (!expanded || !container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setDisplaySize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      }),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [expanded]);
  const [uploading, setUploading] = useState(false);
  const [imageDrop, setImageDrop] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  function update(updates: Partial<NodeData>) {
    editor.updateShape({ id: shape.id, type: shape.type, props: updates });
  }
  function failed(error: unknown, retry?: () => void) {
    showToast(canvasErrorToast(editor, error, retry));
  }
  async function run() {
    try {
      await runWorkflow(editor, shape.id);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        failed(error, () => void run());
    }
  }
  async function upload(file: File) {
    if (
      uploading ||
      running ||
      props.isLocked ||
      !["ai-image", "speech", "file"].includes(shape.type)
    )
      return;
    setUploading(true);
    try {
      applyComponentUpload(
        editor,
        shape.id,
        await uploadComponentFile(
          shape.type as "ai-image" | "speech" | "file",
          file,
        ),
      );
    } catch (error) {
      failed(error);
    } finally {
      setUploading(false);
    }
  }
  async function download() {
    try {
      if (shape.type === "website")
        downloadBlob(
          new Blob([props.htmlContent || ""], { type: "text/html" }),
          `${props.name || t("common.webPage")}.html`,
        );
      else if (props.src) {
        const blob = await blobForSource(props.src);
        downloadBlob(
          blob,
          props.fileName ||
            mediaFileName(props.name || t("api.generatedContent"), blob.type),
        );
      } else
        downloadBlob(
          new Blob([props.result || props.text || ""], {
            type: "text/plain;charset=utf-8",
          }),
          `${props.name || t("common.textContent")}.txt`,
        );
    } catch (error) {
      failed(error);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        props.htmlContent || props.result || props.text || "",
      );
      showToast({ title: t("common.copied") });
    } catch (error) {
      failed(error);
    }
  }
  function fullscreen() {
    if (!props.htmlContent) return;
    const popup = window.open(
      "about:blank",
      "_blank",
      "width=1200,height=800,scrollbars=yes,resizable=yes",
    );
    if (!popup) {
      failed(new LocalizedError({ key: "canvas.tools.popupBlocked" }));
      return;
    }
    popup.opener = null;
    popup.document.title = props.name || t("common.webPage");
    popup.document.body.style.cssText = "margin:0;height:100vh;overflow:hidden";
    const frame = popup.document.createElement("iframe");
    frame.title = t("canvas.webPreview");
    frame.setAttribute("sandbox", "allow-scripts allow-forms");
    frame.referrerPolicy = "no-referrer";
    frame.srcdoc = previewHTML(props.htmlContent);
    frame.style.cssText = "width:100%;height:100%;border:0;display:block";
    popup.document.body.appendChild(frame);
  }
  const isText = shape.type === "ai-text";
  const isInstruction = shape.type === "instruction";
  const isChart = shape.type === "chart";
  const hasResource = !!props.src || !!props.htmlContent;
  let chart: MindmapData | FlowchartData | null = null;
  try {
    const data: unknown = props.chartData ? JSON.parse(props.chartData) : null;
    if (data && typeof data === "object") {
      if (
        "nodes" in data &&
        Array.isArray(data.nodes) &&
        "edges" in data &&
        Array.isArray(data.edges)
      )
        chart = data as FlowchartData;
      else if (
        "content" in data &&
        typeof data.content === "string" &&
        "children" in data &&
        Array.isArray(data.children)
      )
        chart = data as MindmapData;
    }
  } catch {
    /* Imported invalid chart data uses the empty state. */
  }
  const textValue = isText
    ? (props.result ?? props.text ?? "")
    : props.text || "";
  const placeholder = componentPlaceholder(shape.type, locale);
  const OutputIcon =
    {
      "ai-image": ImageIcon,
      speech: Volume2,
      website: Globe,
      file: FileText,
      chart: ChartNetwork,
    }[shape.type] || FileText;
  return (
    <div
      ref={container}
      className="canvas-node relative h-full w-full"
      data-node-id={shape.id}
      data-node-type={shape.type}
      data-selected={selected || undefined}
      data-image-drop={imageDrop || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        const allowed =
          shape.type === "ai-image" &&
          !uploading &&
          !running &&
          !props.isLocked &&
          !shape.isLocked;
        event.dataTransfer.dropEffect = allowed ? "copy" : "none";
        setImageDrop(allowed);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setImageDrop(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        setImageDrop(false);
        if (
          shape.type !== "ai-image" ||
          uploading ||
          running ||
          props.isLocked ||
          shape.isLocked
        )
          return;
        const file = event.dataTransfer.files[0];
        if (file) void upload(file);
      }}
      onFocusCapture={() => {
        if (!expanded && !selected) editor.select(shape.id);
      }}
    >
      {imageDrop && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center rounded-md border-2 border-ring bg-accent/20 p-3">
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
            {t(props.src ? "assets.replaceImage" : "assets.useImage")}
          </span>
        </div>
      )}
      {["ai-image", "speech", "file"].includes(shape.type) && (
        <input
          ref={input}
          type="file"
          className="hidden"
          accept={
            shape.type === "ai-image"
              ? "image/*"
              : shape.type === "speech"
                ? "audio/*,video/webm"
                : ".txt,.md,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.css,.js,.pdf,.docx,.xlsx,.xls,.ods"
          }
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      )}
      {!expanded && <ComponentConnectionDots shape={shape} inert={overview} />}
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-card text-card-foreground ${expanded ? "rounded-xl" : "board-node-surface"}`}
        data-running={execution.status === "running" || undefined}
      >
        <ComponentHeader
          shape={shape}
          compact={!expanded}
          onRun={run}
          onToggleLock={() => update({ isLocked: !props.isLocked })}
          onClose={onClose}
        />
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          inert={overview || undefined}
          onPointerDown={(event) => {
            if (editor.getCurrentToolId() !== "arrow") event.stopPropagation();
          }}
          onWheel={(event) => event.stopPropagation()}
        >
          {shape.type === "ai-image" && props.src && (
            <div className="min-h-0 flex-1 bg-muted/30">
              <img
                src={props.src}
                alt={props.description || t("common.image")}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
          )}
          {((!isText &&
            !isInstruction &&
            !hasResource &&
            !(isChart && chart)) ||
            shape.type === "file") && (
            <div className="flex min-h-12 flex-1 flex-col items-center justify-center gap-3 px-3 text-muted-foreground">
              {["ai-image", "file"].includes(shape.type) && !props.src ? (
                <button
                  type="button"
                  className="rounded-md p-2 hover:bg-accent"
                  aria-label={t("canvas.uploadFile")}
                  disabled={uploading || running || props.isLocked}
                  onClick={() => input.current?.click()}
                >
                  <OutputIcon className="size-8" />
                </button>
              ) : (
                <OutputIcon className="size-8" />
              )}
              <p className="max-w-full truncate text-xs" title={props.fileName}>
                {shape.type === "file" && props.fileName
                  ? props.fileName
                  : placeholder}
              </p>
              {shape.type === "file" && !!props.fileSize && (
                <p className="text-xs">
                  {(props.fileSize / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}
          {shape.type === "speech" && props.src && (
            <audio
              key={props.src}
              src={props.src}
              controls
              className="my-2 h-9 w-full px-2"
            />
          )}
          {shape.type === "website" && props.htmlContent && (
            <iframe
              key={previewVersion}
              title={t("canvas.webPreview")}
              className="min-h-0 w-full flex-1 border-0"
              srcDoc={previewHTML(props.htmlContent)}
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              style={{
                pointerEvents:
                  editor.getCurrentToolId() === "arrow" ? "none" : "auto",
              }}
            />
          )}
          {isChart && chart && (
            <div className="min-h-0 flex-1 overflow-hidden">
              {"nodes" in chart ? (
                <FlowchartRenderer
                  data={chart as FlowchartData}
                  width={displaySize?.w || props.w}
                  height={Math.max(
                    80,
                    (displaySize?.h || props.h) - (expanded ? 44 : 36) - 20,
                  )}
                  onDataChange={(data) =>
                    update({
                      chartData: JSON.stringify(data),
                    })
                  }
                />
              ) : (
                <MindmapRenderer
                  data={chart as MindmapData}
                  width={displaySize?.w || props.w}
                  height={Math.max(
                    80,
                    (displaySize?.h || props.h) - (expanded ? 44 : 36) - 20,
                  )}
                  onDataChange={(data) =>
                    update({
                      chartData: JSON.stringify(data),
                    })
                  }
                />
              )}
            </div>
          )}
          {(isText || isInstruction) && (
            <Textarea
              aria-label={placeholder.replace("…", "")}
              placeholder={placeholder}
              value={textValue}
              disabled={running || props.isLocked}
              className={`min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent p-3 text-base leading-relaxed shadow-none focus-visible:ring-0 ${isInstruction ? "pb-12" : ""}`}
              onChange={(event) =>
                update(
                  isText
                    ? {
                        text: event.target.value,
                        result: undefined,
                        generation: undefined,
                      }
                    : { text: event.target.value },
                )
              }
            />
          )}
          {props.recordingSource && !isSharedCanvas() && (
            <Link
              to={`/recordings/${encodeURIComponent(props.recordingSource.id)}/analysis?t=${props.recordingSource.start}`}
              className="flex shrink-0 items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              title={props.recordingSource.name}
            >
              <Video className="size-3" />
              <span className="truncate">{props.recordingSource.name}</span>
              <span className="ml-auto shrink-0 tabular-nums">
                {formatDuration(props.recordingSource.start)}
              </span>
              <ArrowUpRight className="size-3 shrink-0" />
            </Link>
          )}
          {(isInstruction ||
            ["ai-image", "speech", "file"].includes(shape.type) ||
            (shape.type === "website" && props.htmlContent)) && (
            <div
              data-node-controls
              data-position="bottom-left"
              className={`absolute z-10 flex gap-2 ${isInstruction ? "bottom-2 left-2" : "bottom-3 left-3"}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {isInstruction && (
                <Button
                  variant={props.useWebSearch ? "default" : "outline"}
                  size="icon-sm"
                  className="node-tool-button"
                  title={t("models.webSearch")}
                  aria-label={t("models.webSearch")}
                  aria-pressed={!!props.useWebSearch}
                  disabled={running || props.isLocked}
                  onClick={() => update({ useWebSearch: !props.useWebSearch })}
                >
                  <Globe />
                </Button>
              )}
              {["ai-image", "speech", "file"].includes(shape.type) && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="node-tool-button"
                  title={t(
                    shape.type === "ai-image"
                      ? "canvas.tools.uploadImage"
                      : shape.type === "speech"
                        ? "canvas.tools.uploadAudio"
                        : "canvas.uploadFile",
                  )}
                  aria-label={t(
                    shape.type === "ai-image"
                      ? "canvas.tools.uploadImage"
                      : shape.type === "speech"
                        ? "canvas.tools.uploadAudio"
                        : "canvas.uploadFile",
                  )}
                  disabled={uploading || running || props.isLocked}
                  onClick={() => input.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" />
                  ) : shape.type === "ai-image" ? (
                    <ImageUp />
                  ) : (
                    <Upload />
                  )}
                </Button>
              )}
              {shape.type === "website" && props.htmlContent && (
                <>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="node-tool-button"
                    title={t("canvas.tools.fullscreen")}
                    aria-label={t("canvas.tools.fullscreen")}
                    onClick={fullscreen}
                  >
                    <Maximize />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="node-tool-button"
                    title={t("common.refreshPage")}
                    aria-label={t("common.refreshPage")}
                    onClick={() => setPreviewVersion((value) => value + 1)}
                  >
                    <RefreshCw />
                  </Button>
                </>
              )}
              {((shape.type === "file" && (props.result || props.text)) ||
                (shape.type === "website" && props.htmlContent)) && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="node-tool-button"
                  title={t("canvas.copyContent")}
                  aria-label={t("canvas.copyContent")}
                  onClick={copy}
                >
                  <Copy />
                </Button>
              )}
              {((["ai-image", "speech"].includes(shape.type) && props.src) ||
                (shape.type === "website" && props.htmlContent) ||
                (shape.type === "file" &&
                  (props.result || props.text) &&
                  props.fileName)) && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="node-tool-button"
                  title={t("canvas.downloadContent")}
                  aria-label={t("canvas.downloadContent")}
                  disabled={uploading}
                  onClick={download}
                >
                  <Download />
                </Button>
              )}
            </div>
          )}
          {shape.type === "ai-image" && (
            <div
              data-node-controls
              data-position="bottom-right"
              className="absolute right-3 bottom-3 z-10"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ComponentToolSelect
                label={t("results.imageRatio")}
                value={props.imageSize || DEFAULT_IMAGE_RATIO}
                disabled={uploading || running || props.isLocked}
                options={IMAGE_SIZE_PRESETS.map(({ ratio, width, height }) => ({
                  value: ratio,
                  label: ratio,
                  icon:
                    width === height
                      ? Square
                      : width > height
                        ? RectangleHorizontal
                        : RectangleVertical,
                }))}
                onChange={(imageSize) => update({ imageSize })}
              />
            </div>
          )}
          {isChart && (
            <div
              data-node-controls
              data-position="bottom-right"
              className="absolute right-2 bottom-2 z-10"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ComponentToolSelect
                label={t("canvas.chartType")}
                value={props.chartType || "mindmap"}
                disabled={running || props.isLocked}
                options={[
                  {
                    value: "mindmap",
                    label: t("canvas.chart.mindmap"),
                    icon: ChartNetwork,
                  },
                  {
                    value: "flowchart",
                    label: t("canvas.chart.flowchart"),
                    icon: Workflow,
                  },
                ]}
                onChange={(chartType) => update({ chartType })}
              />
            </div>
          )}
          {shape.type === "speech" && props.src && (
            <span
              className={`absolute right-3 bottom-3 rounded-full px-2 py-1 text-xs ${props.isUploaded ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}
            >
              {t(
                props.isUploaded
                  ? "canvas.tools.uploaded"
                  : "canvas.tools.generated",
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
