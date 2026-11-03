import { t, useLocale } from "@/i18n";
import { Layers } from "lucide-react";
import { useEditor, type CanvasShape } from "@/canvas/editor";
import { connectedShapes } from "@/utils/connectionParser";
import { materialLabel, materialText, focusShapes } from "@/workflow/context";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export function NodeMaterials({ shape }: { shape: CanvasShape }) {
  useLocale();
  const editor = useEditor();
  const sources = connectedShapes(editor, shape.id, "previous").filter(
    (source) => source.type !== "start",
  );
  if (!sources.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            aria-label={t("canvas.viewInputCount", { count: sources.length })}
            title={t("canvas.inputCount", { count: sources.length })}
          >
            <Layers />
            {sources.length}
          </Button>
        }
      />
      <DropdownMenuContent className="w-72" align="start">
        {sources.map((source) => (
          <DropdownMenuItem
            key={source.id}
            className="items-start py-2"
            onClick={() => {
              editor.select(source.id);
              focusShapes(editor, [source.id]);
            }}
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {materialLabel(source)}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                {source.type === "website"
                  ? t("canvas.webContent")
                  : ["ai-image", "image"].includes(source.type)
                    ? t("canvas.referenceImage")
                    : materialText(source).slice(0, 200) ||
                      t("workflow.canvasContent")}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
