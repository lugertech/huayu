import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useEditor } from "@/canvas/editor";
import {
  Copy,
  Download,
  Globe,
  ImageIcon,
  Loader2,
  Mic,
  Upload,
  ArrowUpRight,
  Video,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { ComponentConnectionDots } from "../common/ComponentConnectionDots";
import { ComponentHeader } from "../common/ComponentHeader";
import { NodeMaterials } from "./NodeMaterials";
import { requestComposition, requestInspection } from "@/workflow/context";
import { modelSettingsAction } from "@/lib/settings-event";
import { Markdown } from "../common/Markdown";
import { componentPlaceholder } from "@/config/components";
import { formatDuration } from "@/recording/Recorder";
import { resultKind } from "@/workflow/results";
import { previewHTML } from "../results/WebPreview";
import { useToast, type ToastOptions } from "../common/ToastProvider";
import {
  runWorkflow,
  useNodeRunning,
  useNodeExecution,
  type NodeData,
} from "@/workflow/execute";
import type { AIComponentShape } from "@/types/components";
import {
  uploadFileAPI,
  documentUploadAPI,
  extractAPIData,
  audioRecognizeAPI,
  blobForSource,
} from "@/api/backend";
import { downloadBlob } from "@/api/client";
import {
  MindmapRenderer,
  type MindmapData,
} from "../shapes/ChartShape/MindmapRenderer";
import {
  FlowchartRenderer,
  type FlowchartData,
} from "../shapes/ChartShape/FlowchartRenderer";

export function CanvasNode({
  shape,
  expanded = false,
  onClose,
}: {
  shape: AIComponentShape;
  expanded?: boolean;
  onClose?: () => void;
}) {
  useLocale();
  const editor = useEditor();
  const { showToast } = useToast();
  const props = shape.props as NodeData;
  const running = useNodeRunning(editor, shape.id);
  const execution = useNodeExecution(editor, shape.id);
  const selected = editor.getSelectedShapeIds().includes(shape.id);
  const [showResult, setShowResult] = useState(!!props.result);
  const [reading, setReading] = useState(
    expanded && !!(props.result || (props.recordingSource && props.text)),
  );
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
  useEffect(() => {
    if (execution.status === "success" && props.result) setShowResult(true);
  }, [execution.status, props.result]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function update(updates: Partial<NodeData>) {
    editor.updateShape({ id: shape.id, type: shape.type, props: updates });
  }
  function failed(error: unknown, action?: ToastOptions["action"]) {
    showToast({
      title: t("common.operationFailed"),
      description:
        error instanceof Error ? error.message : t("common.tryAgain"),
      variant: "destructive",
      action: modelSettingsAction(error) ?? action,
    });
  }
  async function run() {
    try {
      await runWorkflow(editor, shape.id);
      if (running) showToast({ title: t("canvas.creationStopped") });
      else
        showToast({
          title: t("canvas.creationComplete"),
          action: {
            label: t("canvas.viewResult"),
            onClick: () => requestInspection(editor, shape.id),
          },
        });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        failed(error, {
          label: t("common.retry"),
          onClick: () => void run(),
        });
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      if (shape.type === "file") {
        const value = extractAPIData(await documentUploadAPI(file));
        update({
          src: value.src,
          text: value.text,
          result: value.text,
          name: file.name,
          fileName: file.name,
          fileExtension: file.name.split(".").pop(),
          fileSize: file.size,
          isUploaded: true,
        });
      } else {
        if (shape.type === "ai-image" && !file.type.startsWith("image/"))
          throw new Error(t("canvas.chooseAnImageFile"));
        if (
          shape.type === "speech" &&
          !file.type.startsWith("audio/") &&
          !file.type.startsWith("video/")
        )
          throw new Error(t("canvas.chooseAnAudioFile"));
        const value = await uploadFileAPI(file);
        update({
          src: value.data.file_path,
          name: file.name,
          ...(shape.type === "speech" ? { isUploaded: true } : {}),
          result: "",
          isUploaded: true,
          generation: undefined,
        });
      }
    } catch (error) {
      failed(error);
    } finally {
      setUploading(false);
    }
  }
  async function recognize() {
    if (!props.src) return;
    setUploading(true);
    try {
      const result = await audioRecognizeAPI(props.src);
      update({ result: result.data.text, text: result.data.text });
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
      else if (props.src)
        downloadBlob(
          await blobForSource(props.src),
          props.fileName ||
            `${props.name || t("api.generatedContent")}.${shape.type === "ai-image" ? "png" : "mp3"}`,
        );
      else
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
  const isText = shape.type === "ai-text";
  const isInstruction = shape.type === "instruction";
  const showingResult =
    isInstruction && props.result && (showResult || (!expanded && !selected));
  const isChart = shape.type === "chart";
  const hasResource = !!props.src || !!props.htmlContent;
  let chart: MindmapData | FlowchartData | null = null;
  try {
    chart = props.chartData ? JSON.parse(props.chartData) : null;
  } catch {
    /* Invalid user data is left editable. */
  }
  const textValue =
    isText || (shape.type === "file" && props.isUploaded)
      ? (props.result ?? props.text ?? "")
      : props.text || "";
  const placeholder = componentPlaceholder(shape.type);
  const box = editor.getShapePageBounds(shape);
  const view = editor.getViewportPageBounds();
  const actionsAbove =
    box &&
    box.maxY + 64 / editor.session.camera.z >
      view.maxY - 64 / editor.session.camera.z;
  const actions = (
    <div
      className={
        expanded
          ? "flex min-h-9 items-center justify-between gap-1 border-t px-2 py-1"
          : `node-actionbar absolute inset-x-0 z-20 flex min-h-9 flex-wrap items-center justify-between gap-1 rounded-lg border bg-popover p-1 shadow-md ${actionsAbove ? "bottom-full mb-2" : "top-full mt-2"}`
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <NodeMaterials shape={shape} />
        {isInstruction && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("models.webSearch")}
            aria-label={t("models.webSearch")}
            aria-pressed={!!props.useWebSearch}
            onClick={() => update({ useWebSearch: !props.useWebSearch })}
            className={props.useWebSearch ? "bg-accent" : ""}
          >
            <Globe />
          </Button>
        )}
        {["ai-image", "speech", "file"].includes(shape.type) && (
          <>
            <input
              ref={input}
              type="file"
              className="hidden"
              accept={
                shape.type === "ai-image"
                  ? "image/*"
                  : shape.type === "speech"
                    ? "audio/*,video/webm"
                    : ".txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.pdf,.docx,.xlsx"
              }
              onChange={upload}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={uploading || running}
              title={t("canvas.uploadFile")}
              aria-label={t("canvas.uploadFile")}
              onClick={() => input.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            </Button>
          </>
        )}
        {shape.type === "speech" && props.src && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("canvas.transcribeAudio")}
            aria-label={t("canvas.transcribeAudio")}
            disabled={uploading}
            onClick={recognize}
          >
            <Mic />
          </Button>
        )}
        {shape.type === "ai-image" && (
          <NativeSelect
            aria-label={t("results.imageRatio")}
            className="h-7 w-20 text-xs"
            value={props.imageSize || "1:1"}
            onChange={(event) => update({ imageSize: event.target.value })}
          >
            {["1:1", "3:2", "4:3", "16:9", "21:9", "2:3", "3:4", "9:16"].map(
              (ratio) => (
                <NativeSelectOption key={ratio} value={ratio}>
                  {ratio}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
        )}
        {isChart && (
          <NativeSelect
            aria-label={t("canvas.chartType")}
            className="h-7 text-xs"
            value={props.chartType || "mindmap"}
            onChange={(event) =>
              update({
                chartType: event.target.value,
                chartData: undefined,
              })
            }
          >
            <NativeSelectOption value="mindmap">
              {t("canvas.chart.mindmap")}
            </NativeSelectOption>
            <NativeSelectOption value="flowchart">
              {t("canvas.chart.flowchart")}
            </NativeSelectOption>
          </NativeSelect>
        )}
        {shape.type === "file" && props.fileName && (
          <span
            className="max-w-20 truncate text-xs text-muted-foreground"
            title={props.fileName}
          >
            {props.fileName}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {(props.result || props.text || hasResource || props.chartData) && (
          <Button
            variant="ghost"
            size="xs"
            aria-label={t("canvas.createFromThisContent")}
            disabled={running}
            onClick={() =>
              resultKind(shape)
                ? requestInspection(editor, shape.id, { refine: true })
                : requestComposition(editor, [shape.id])
            }
          >
            {t("projects.createFromThis")}
            <ArrowUpRight />
          </Button>
        )}
        {(props.result || props.text || props.htmlContent) && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("canvas.copyContent")}
            aria-label={t("canvas.copyContent")}
            onClick={copy}
          >
            <Copy />
          </Button>
        )}
        {(props.src || props.result || props.text || props.htmlContent) && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("canvas.downloadContent")}
            aria-label={t("canvas.downloadContent")}
            onClick={download}
          >
            <Download />
          </Button>
        )}
      </div>
    </div>
  );
  return (
    <div
      ref={container}
      className="canvas-node relative h-full w-full"
      data-node-id={shape.id}
      data-node-type={shape.type}
      data-selected={selected || undefined}
      onFocusCapture={() => {
        if (!expanded && !selected) editor.select(shape.id);
      }}
    >
      {!expanded && <ComponentConnectionDots shape={shape} />}
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-card text-card-foreground ${expanded ? "rounded-xl" : "board-node-surface"}`}
        data-running={execution.status === "running" || undefined}
      >
        <ComponentHeader
          shape={shape}
          compact={!expanded}
          expandLabel={
            resultKind(shape)
              ? t("canvas.node.viewWork")
              : t("canvas.node.openEditor")
          }
          onRun={run}
          onToggleLock={() => update({ isLocked: !props.isLocked })}
          onExpand={
            expanded ? undefined : () => requestInspection(editor, shape.id)
          }
          onClose={onClose}
        />
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          onPointerDown={(event) => {
            if (editor.getCurrentToolId() !== "arrow") event.stopPropagation();
          }}
          onWheel={(event) => event.stopPropagation()}
        >
          {shape.type === "ai-image" && props.src && (
            <button
              type="button"
              aria-label={t("canvas.viewImage")}
              className="relative min-h-0 flex-1 bg-muted/30 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => requestInspection(editor, shape.id)}
            >
              <img
                src={props.src}
                alt={props.description || t("common.image")}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </button>
          )}
          {shape.type === "ai-image" && !props.src && (
            <div className="flex min-h-12 flex-1 items-center justify-center text-muted-foreground">
              <ImageIcon className="size-8" />
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
              {props.chartType === "flowchart" ? (
                <FlowchartRenderer
                  data={chart as FlowchartData}
                  width={displaySize?.w || props.w}
                  height={Math.max(
                    80,
                    (displaySize?.h || props.h) -
                      (expanded ? 80 : 36) -
                      (expanded || selected ? 64 : 0),
                  )}
                  onDataChange={(data) =>
                    update({
                      chartData: JSON.stringify(data),
                      result: JSON.stringify(data),
                    })
                  }
                />
              ) : (
                <MindmapRenderer
                  data={chart as MindmapData}
                  width={displaySize?.w || props.w}
                  height={Math.max(
                    80,
                    (displaySize?.h || props.h) -
                      (expanded ? 80 : 36) -
                      (expanded || selected ? 64 : 0),
                  )}
                  onDataChange={(data) =>
                    update({
                      chartData: JSON.stringify(data),
                      result: JSON.stringify(data),
                    })
                  }
                />
              )}
            </div>
          )}
          {isInstruction && props.result && (expanded || selected) && (
            <div className="flex shrink-0 gap-1 border-b px-3 py-1.5">
              <Button
                variant={!showResult ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setShowResult(false)}
              >
                {t("canvas.input")}
              </Button>
              <Button
                variant={showResult ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setShowResult(true)}
              >
                {t("canvas.result")}
              </Button>
            </div>
          )}
          {expanded &&
            (isText || (shape.type === "file" && props.isUploaded)) &&
            textValue && (
              <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
                <Button
                  variant={reading ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setReading(true)}
                >
                  {t("results.read")}
                </Button>
                <Button
                  variant={!reading ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setReading(false)}
                >
                  {t("common.edit")}
                </Button>
              </div>
            )}
          {expanded &&
          (showingResult ||
            (reading &&
              (isText || (shape.type === "file" && props.isUploaded)))) ? (
            <div
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto px-6 py-5 outline-none sm:px-9"
              data-content-reading
              aria-label={t("canvas.readContent")}
            >
              <Markdown>
                {isInstruction ? props.result || "" : textValue}
              </Markdown>
            </div>
          ) : showingResult ? (
            <Textarea
              readOnly
              aria-label={t("canvas.generatedResult")}
              value={props.result}
              className="min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent p-3.5 text-sm leading-7 shadow-none focus-visible:ring-0"
            />
          ) : (!hasResource && !(isChart && chart)) || expanded || selected ? (
            <Textarea
              aria-label={placeholder.replace("…", "")}
              placeholder={placeholder}
              value={textValue}
              disabled={running || props.isLocked}
              className={`w-full resize-none rounded-none border-0 bg-transparent p-3 shadow-none focus-visible:ring-0 ${hasResource || shape.type === "ai-image" || (isChart && chart) ? "h-16 min-h-12" : "min-h-0 flex-1"} ${isText ? "text-base leading-relaxed" : "text-sm"}`}
              onChange={(event) =>
                update(
                  isText
                    ? {
                        text: event.target.value,
                        result: undefined,
                        generation: undefined,
                      }
                    : {
                        text: event.target.value,
                        ...(shape.type === "file" && props.isUploaded
                          ? { result: event.target.value }
                          : {}),
                      },
                )
              }
            />
          ) : textValue ? (
            <p className="shrink-0 truncate border-t px-3 py-1.5 text-xs text-muted-foreground">
              {textValue}
            </p>
          ) : null}
          {props.recordingSource && (
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
          {expanded && actions}
        </div>
      </div>
      {!expanded && selected && actions}
    </div>
  );
}
