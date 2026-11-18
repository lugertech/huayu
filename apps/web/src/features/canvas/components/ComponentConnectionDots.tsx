import { useState } from "react";
import { Plus } from "lucide-react";
import { errorText } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { useEditor, type CanvasShape } from "@/features/canvas/editor";
import {
  COMPONENT_CONFIGS,
  componentConfig,
  type ComponentType,
} from "@/config/components";
import { createConnectedComponent } from "@/features/canvas/connection-parser";
import { connectionProblem, linkWorkflow } from "@/workflow/connections";
import { materialLabel } from "@/workflow/context";
import { useToast } from "@/components/common/ToastProvider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

const types: ComponentType[] = [
  "instruction",
  "ai-text",
  "ai-image",
  "website",
  "chart",
  "speech",
  "file",
];
const menuItemClassName = "min-h-9 gap-2.5 px-3";

type ConnectionShape = Pick<CanvasShape, "id" | "type">;

function ConnectionMenu({
  shape,
  side,
  inert,
}: {
  shape: ConnectionShape;
  side: "left" | "right";
  inert?: boolean;
}) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const label = t(
    side === "left" ? "common.addInputMaterial" : "common.addNextStep",
  );
  const candidates = open
    ? editor
        .getCurrentPageShapes()
        .filter(
          (candidate) =>
            candidate.id !== shape.id &&
            !["arrow", "line", "group", "start"].includes(candidate.type) &&
            (side === "left" || candidate.type in COMPONENT_CONFIGS),
        )
    : [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        type="button"
        inert={inert || undefined}
        className="connection-button board-connection-port absolute top-1/2 z-10 flex size-9 -translate-y-1/2 touch-manipulation items-center justify-center"
        style={{ [side]: shape.type === "frame" ? -34 : -18 }}
        data-canvas-ui
        data-connection-id={shape.id}
        data-connection-side={side}
        aria-label={label}
        title={label}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.preventBaseUIHandler()}
        onClick={(event) => {
          // Wait for an actual click so dragging cannot release onto a menu item.
          event.preventBaseUIHandler();
          setOpen(!open);
        }}
      >
        <span className="flex size-4 items-center justify-center rounded-full border border-primary/70 bg-background text-primary shadow-xs">
          <Plus className="size-3" aria-hidden="true" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 p-2"
        side={side}
        align="center"
        sideOffset={12}
      >
        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuLabel className="px-3 pb-2">
            {t(
              side === "right"
                ? "canvas.connections.createNextStep"
                : "canvas.connections.createInputMaterial",
            )}
          </DropdownMenuLabel>
          {types.map((type) => {
            const config = componentConfig(type, locale);
            const Icon = config.icon;
            return (
              <DropdownMenuItem
                key={type}
                className={menuItemClassName}
                onClick={() => {
                  const id = createConnectedComponent(
                    editor,
                    [shape.id],
                    type,
                    "",
                    side,
                  );
                  if (id) editor.select(id);
                }}
              >
                <Icon />
                {config.displayName}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-0 my-1.5" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={menuItemClassName}>
            {t("canvas.connections.connectAnExistingCard")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-64 space-y-0.5 p-2"
            side={side}
            sideOffset={8}
          >
            {candidates.length ? (
              candidates.map((candidate) => {
                const from = side === "right" ? shape.id : candidate.id;
                const to = side === "right" ? candidate.id : shape.id;
                const problem = connectionProblem(editor, from, to, locale);
                const name = materialLabel(candidate, locale);
                return (
                  <DropdownMenuItem
                    key={candidate.id}
                    className={menuItemClassName}
                    disabled={!!problem}
                    title={problem || name}
                    onClick={() => {
                      try {
                        linkWorkflow(editor, from, to);
                        editor.select(to);
                      } catch (error) {
                        showToast({
                          title: t("canvas.connections.failed"),
                          description:
                            error instanceof Error
                              ? errorText(error, locale)
                              : t("canvas.connections.selectACardAgain"),
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <span className="truncate">{name}</span>
                    {problem && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {t("canvas.connections.unavailable")}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {t("canvas.connections.noCardsAvailableToConnect")}
              </div>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ComponentConnectionDots({
  shape,
  inert,
}: {
  shape: ConnectionShape;
  inert?: boolean;
}) {
  const editor = useEditor();
  const selected = editor.getSelectedShapeIds();
  if (selected.length !== 1 || selected[0] !== shape.id) return null;
  return (
    <>
      {shape.type !== "frame" && (
        <ConnectionMenu shape={shape} side="left" inert={inert} />
      )}
      <ConnectionMenu shape={shape} side="right" inert={inert} />
    </>
  );
}
