import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Focus,
  Layers,
  Sparkles,
  X,
  Plus,
  Maximize2,
  Undo2,
} from "lucide-react";
import { useEditor } from "@/canvas/editor";
import { COMPONENT_CONFIGS } from "@/config/components";
import {
  createConnectedComponent,
  connectedShapes,
} from "@/utils/connectionParser";
import { runWorkflow } from "@/workflow/execute";
import {
  COMPOSE_EVENT,
  focusShapes,
  hasVisibleContent,
  materialLabel,
  materialShapes,
  canInspect,
  requestInspection,
} from "@/workflow/context";
import {
  composerStorageKey,
  parseComposerState,
  openComposer,
  updateComposer,
  completeComposer,
  type CreationType,
} from "@/workflow/composerDraft";
import { useToast } from "@/Components/common/ToastProvider";
import { modelSettingsAction } from "@/lib/settings-event";
import { resultKind } from "@/workflow/results";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

const outputs: Array<{ type: CreationType; label: string; hint: string }> = [
  {
    type: "instruction",
    get label() {
      return t("common.text");
    },
    get hint() {
      return t("canvas.composer.whatWouldYouLikeToWriteFromTheseMaterials");
    },
  },
  {
    type: "ai-image",
    get label() {
      return t("common.image");
    },
    get hint() {
      return t("canvas.composer.describeTheImageYoudLikeToCreate");
    },
  },
  {
    type: "website",
    get label() {
      return t("common.webPage");
    },
    get hint() {
      return t("canvas.composer.describeThePagesContentAndInteractions");
    },
  },
  {
    type: "chart",
    get label() {
      return t("common.chart");
    },
    get hint() {
      return t("canvas.composer.whatStructureOrProcessWouldYouLikeToMapOut");
    },
  },
  {
    type: "speech",
    get label() {
      return t("common.speech");
    },
    get hint() {
      return t("canvas.composer.describeTheContentToReadAloud");
    },
  },
  {
    type: "file",
    get label() {
      return t("canvas.composer.document");
    },
    get hint() {
      return t("canvas.composer.describeTheDocumentAndItsFormat");
    },
  },
];

export function SelectionComposer({ projectId }: { projectId: string }) {
  useLocale();
  const editor = useEditor();
  const pageId = editor.getCurrentPageId();
  const storageKey = composerStorageKey(projectId, pageId);
  return <PageComposer key={storageKey} storageKey={storageKey} />;
}

function PageComposer({ storageKey }: { storageKey: string }) {
  useLocale();
  const editor = useEditor();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState(() => {
    try {
      return parseComposerState(localStorage.getItem(storageKey));
    } catch {
      return parseComposerState(null);
    }
  });
  const [saved, setSaved] = useState(true);
  const draft = drafts.drafts.find((item) => item.key === drafts.activeKey);
  const sourceIds = draft?.sourceIds ?? null;
  const prompt = draft?.prompt || "";
  const type = draft?.type || "instruction";
  const setPrompt = (prompt: string) =>
    setDrafts((state) => updateComposer(state, { prompt }));
  const setType = (type: CreationType) =>
    setDrafts((state) => updateComposer(state, { type }));
  const setSourceIds = (sourceIds: string[] | null) =>
    setDrafts((state) =>
      sourceIds === null
        ? { ...state, activeKey: null }
        : updateComposer(state, { sourceIds }),
    );
  const open = (ids: string[]) =>
    setDrafts((state) => openComposer(state, ids));
  const input = useRef<HTMLTextAreaElement>(null);
  const creating = useRef(false);
  const selected = materialShapes(editor, editor.getSelectedShapeIds());
  const sources = materialShapes(editor, sourceIds || []);
  const output = outputs.find((item) => item.type === type)!;
  const Icon = COMPONENT_CONFIGS[type].icon;
  const resumable = drafts.drafts.find((item) => item.prompt.trim());
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, ...drafts }),
      );
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [drafts, storageKey]);
  useEffect(() => {
    function open(event: Event) {
      const ids = materialShapes(
        editor,
        (event as CustomEvent<string[]>).detail,
      ).map((shape) => shape.id);
      if (ids.length) {
        setDrafts((state) => openComposer(state, ids));
      }
    }
    const container = editor.container;
    container?.addEventListener(COMPOSE_EVENT, open);
    return () => container?.removeEventListener(COMPOSE_EVENT, open);
  }, [editor]);
  useEffect(() => {
    if (!sourceIds) return;
    let frame = requestAnimationFrame(() => {
      focusShapes(editor, sourceIds);
      input.current?.focus({ preventScroll: true });
    });
    const container = editor.container;
    let initial = true;
    const observer = new ResizeObserver(() => {
      if (initial) {
        initial = false;
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => focusShapes(editor, sourceIds));
    });
    if (container) observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [drafts.activeKey, editor, sourceIds]);

  function create(run: boolean) {
    if (creating.current || !sources.length || !prompt.trim()) return;
    creating.current = true;
    try {
      const id = createConnectedComponent(
        editor,
        sources.map((shape) => shape.id),
        type,
        prompt.trim(),
      );
      if (!id)
        throw new Error(
          t("canvas.composer.theseMaterialsAreNoLongerOnThisPage"),
        );
      editor.select(id);
      focusShapes(editor, [id]);
      setDrafts((state) => completeComposer(state));
      if (run)
        void runWorkflow(editor, id)
          .then(() => {
            const result = connectedShapes(editor, id, "next").find(
              (shape) => shape.type === "ai-text",
            );
            showToast({
              title: t("canvas.creationComplete"),
              action: {
                label: t("canvas.viewResult"),
                onClick: () => requestInspection(editor, result?.id || id),
              },
            });
          })
          .catch((error) => {
            if (error instanceof Error && error.name === "AbortError") return;
            showToast({
              title: t("canvas.composer.creationIncomplete"),
              action: modelSettingsAction(error),
              description:
                error instanceof Error ? error.message : t("common.tryAgain"),
              variant: "destructive",
            });
          });
    } catch (error) {
      showToast({
        title: t("canvas.composer.cannotAddACreativeStep"),
        description:
          error instanceof Error ? error.message : t("common.tryAgain"),
        variant: "destructive",
      });
    } finally {
      creating.current = false;
    }
  }

  if (sourceIds)
    return (
      <form
        className="board-composer bg-card text-card-foreground"
        aria-label={t("canvas.composer.createFromMaterials")}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          create(true);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            setSourceIds(null);
          }
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            create(true);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" />
            {t("projects.createFromThis")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("canvas.composer.closeCreationPanel")}
            onClick={() => setSourceIds(null)}
          >
            <X />
          </Button>
        </div>
        <div
          className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto px-4"
          aria-label={t("canvas.composer.materialsForThisCreation")}
        >
          {sources.map((shape) => (
            <span
              key={shape.id}
              className="flex max-w-full items-center gap-1 rounded-md border bg-muted/40 pl-2 text-xs"
            >
              <button
                type="button"
                title={materialLabel(shape)}
                className="max-w-44 truncate py-1.5 text-left outline-none focus-visible:underline"
                onClick={() => focusShapes(editor, [shape.id])}
              >
                {materialLabel(shape)}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("canvas.composer.removeMaterial", {
                  arg0: materialLabel(shape),
                })}
                onClick={() =>
                  setSourceIds(
                    sources
                      .filter((item) => item.id !== shape.id)
                      .map((item) => item.id),
                  )
                }
              >
                <X />
              </Button>
            </span>
          ))}
          {selected.some(
            (shape) => !sources.some((source) => source.id === shape.id),
          ) && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-7"
              onClick={() =>
                setSourceIds([
                  ...new Set([
                    ...sources.map((shape) => shape.id),
                    ...selected.map((shape) => shape.id),
                  ]),
                ])
              }
            >
              <Plus />
              {t("canvas.composer.addSelected")}
            </Button>
          )}
          {!sources.length && (
            <p className="py-1 text-xs text-muted-foreground">
              {t("canvas.composer.selectContentOnTheCanvasThenAddItAsMaterial")}
            </p>
          )}
        </div>
        <Textarea
          ref={input}
          data-composer-input
          aria-label={t("canvas.composer.creationInstructions")}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={output.hint}
          className="min-h-32 flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm leading-6 shadow-none focus-visible:ring-0"
        />
        {!prompt && type === "instruction" && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {[
              t("canvas.composer.extractKeyPoints"),
              t("results.tryAnotherWayOfSayingIt"),
              t("canvas.composer.expandIntoAnArticle"),
            ].map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setPrompt(label);
                  input.current?.focus();
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("canvas.composer.chooseAnOutputType")}
                >
                  <Icon size={14} />
                  {output.label}
                  <ChevronDown />
                </Button>
              }
            />
            <DropdownMenuContent className="w-36" side="top">
              {outputs.map((item) => {
                const ItemIcon = COMPONENT_CONFIGS[item.type].icon;
                return (
                  <DropdownMenuItem
                    key={item.type}
                    onClick={() => setType(item.type)}
                  >
                    <ItemIcon size={14} />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!sources.length || !prompt.trim()}
              onClick={() => create(false)}
            >
              {t("canvas.composer.addStepOnly")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!sources.length || !prompt.trim()}
            >
              {t("canvas.composer.startCreating")}
              <ArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
        {prompt.trim() && (
          <div
            className="flex items-center justify-between px-4 pb-3 text-[11px] text-muted-foreground"
            role="status"
          >
            <span>
              {saved
                ? t("results.draftKept")
                : t("canvas.composer.yourDraftHasntBeenSaved")}
            </span>
            <span className="hidden sm:inline">
              {t("canvas.composer.ctrlEnterToStart")}
            </span>
          </div>
        )}
      </form>
    );

  return (
    <>
      {selected.length > 0 && editor.getCurrentToolId() === "select" && (
        <div
          className="board-selection-actions rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <Layers className="size-3.5" />
            {t("canvas.materialCount", { count: selected.length })}
          </span>
          {selected.length === 1 && canInspect(selected[0]) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => requestInspection(editor, selected[0].id)}
            >
              <Maximize2 />
              {resultKind(selected[0])
                ? t("canvas.node.viewWork")
                : t("canvas.node.openEditor")}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              if (selected.length === 1 && resultKind(selected[0]))
                requestInspection(editor, selected[0].id, { refine: true });
              else open(selected.map((shape) => shape.id));
            }}
          >
            <Sparkles />
            {t("projects.createFromThis")}
          </Button>
        </div>
      )}
      {!selected.length && resumable && (
        <Button
          className="board-resume-draft"
          variant="outline"
          size="sm"
          onClick={() =>
            setDrafts((state) => ({ ...state, activeKey: resumable.key }))
          }
        >
          <Undo2 />
          {t("canvas.composer.continueUnfinishedCreation")}
        </Button>
      )}
      {editor.getCurrentPageShapes().some((shape) => shape.type !== "group") &&
        !hasVisibleContent(editor) && (
          <Button
            className="board-back-to-content"
            variant="outline"
            onClick={() =>
              editor.getSelectedShapeIds().length
                ? focusShapes(editor, editor.getSelectedShapeIds())
                : editor.zoomToFit()
            }
          >
            <Focus />
            {editor.getSelectedShapeIds().length
              ? t("canvas.composer.backToSelection")
              : t("canvas.composer.backToContent")}
          </Button>
        )}
    </>
  );
}
