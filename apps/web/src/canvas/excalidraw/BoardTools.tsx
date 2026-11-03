import { t, useLocale } from "@/i18n";
import type {
  ExcalidrawImperativeAPI,
  AppState,
} from "@excalidraw/excalidraw/types";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Frame,
  Hand,
  Image,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  StickyNote,
  Square,
  Type,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { useEditor, createShapeId } from "@/canvas/editor";
import { uploadAsset } from "@/api/client";
import { useToast } from "@/Components/common/ToastProvider";

export function BoardTools({
  api,
  tool,
}: {
  api: ExcalidrawImperativeAPI;
  tool: AppState["activeTool"]["type"];
}) {
  useLocale();
  const editor = useEditor();
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();
  async function insertImage(file: File) {
    setUploading(true);
    const objectURL = URL.createObjectURL(file);
    try {
      if (!file.type.startsWith("image/"))
        throw new Error(t("canvas.chooseAnImageFile"));
      const image = new window.Image();
      image.src = objectURL;
      await image.decode();
      const w = Math.min(640, image.naturalWidth);
      const h = Math.max(1, (w * image.naturalHeight) / image.naturalWidth);
      const asset = await uploadAsset(file);
      const assetId = `asset:${asset.id}`;
      const id = createShapeId();
      const center = editor.getViewportPageBounds().center;
      editor.run(() => {
        editor.store.put([
          {
            id: assetId,
            typeName: "asset",
            type: "image",
            props: {
              src: asset.url,
              name: file.name,
              mimeType: file.type,
              w: image.naturalWidth,
              h: image.naturalHeight,
            },
            meta: {},
          },
        ]);
        editor.createShape({
          id,
          type: "image",
          x: center.x - w / 2,
          y: center.y - h / 2,
          props: { assetId, w, h },
        });
        editor.select(id);
        editor.setCurrentTool("select");
      });
    } catch (error) {
      showToast({
        title: t("canvas.tools.cannotAddImage"),
        description:
          error instanceof Error ? error.message : t("common.tryAgain"),
        variant: "destructive",
      });
    } finally {
      URL.revokeObjectURL(objectURL);
      setUploading(false);
    }
  }
  const tools = [
    ["selection", t("canvas.tools.select"), MousePointer2],
    ["hand", t("canvas.tools.hand"), Hand],
    ["freedraw", t("canvas.tools.draw"), Pencil],
    ["eraser", t("canvas.tools.eraser"), Eraser],
    ["arrow", t("canvas.tools.arrow"), ArrowUpRight],
    ["rectangle", t("canvas.tools.rectangle"), Square],
    ["ellipse", t("canvas.tools.ellipse"), Circle],
    ["text", t("common.text"), Type],
    ["image", t("common.image"), Image],
  ] as const;
  return (
    <div
      className="board-tool-dock"
      role="toolbar"
      aria-label={t("canvas.tools.canvasTools")}
    >
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void insertImage(file);
        }}
      />
      {tools.map(([type, label, Icon]) => (
        <Tooltip key={type}>
          <TooltipTrigger
            render={
              <Button
                variant={tool === type ? "secondary" : "ghost"}
                size="icon"
                aria-label={label}
                aria-pressed={tool === type}
                disabled={type === "image" && uploading}
                onClick={() =>
                  type === "image"
                    ? imageInput.current?.click()
                    : api.setActiveTool({ type })
                }
              >
                {type === "image" && uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </Button>
            }
          />
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      ))}
      <div className="board-tool-divider mx-1 h-5 border-l" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("canvas.tools.moreCanvasTools")}
            >
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem
            onClick={() => api.setActiveTool({ type: "diamond" })}
          >
            <Diamond />
            {t("canvas.tools.diamond")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => api.setActiveTool({ type: "line" })}>
            <Minus />
            {t("workflow.line")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => api.setActiveTool({ type: "frame" })}
          >
            <Frame />
            {t("canvas.frame")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const p = editor.getViewportPageBounds().center;
              editor.createShape({
                type: "note",
                x: p.x - 100,
                y: p.y - 100,
                props: {
                  w: 200,
                  h: 200,
                  text: t("canvas.tools.writeAnIdea"),
                  color: "yellow",
                  fill: "solid",
                },
              });
            }}
          >
            <StickyNote />
            {t("canvas.tools.stickyNote")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => api.setActiveTool({ type: "embeddable" })}
          >
            <Plus />
            {t("canvas.tools.embeddedContent")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
