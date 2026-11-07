import {
  useEffectEvent,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTranslations } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

type NativeZoom = {
  host: HTMLElement;
  reset: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
};

export function fitBoardElements(
  stage: HTMLElement,
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[],
) {
  if (!elements.length) return;
  const bounds = stage.getBoundingClientRect();
  const canvasOffsets = { top: 16, right: 16, bottom: 16, left: 16 };
  // These overlays live inside the editor, so the app sidebar is already
  // excluded from its bounds. Native fitting still owns zoom and centering.
  for (const [selector, edge] of [
    [".board-component-palette", "left"],
    [".App-menu__left, .App-mobile-menu, .board-asset-panel", "right"],
    [".board-toolbar", "top"],
    [".App-toolbar-container, .zoom-actions", "bottom"],
  ] as const) {
    for (const overlay of stage.querySelectorAll<HTMLElement>(selector)) {
      if (
        !overlay.getClientRects().length ||
        getComputedStyle(overlay).visibility === "hidden"
      )
        continue;
      const rect = overlay.getBoundingClientRect();
      canvasOffsets[edge] = Math.max(
        canvasOffsets[edge],
        (edge === "left"
          ? rect.right - bounds.left
          : edge === "right"
            ? bounds.right - rect.left
            : edge === "top"
              ? rect.bottom - bounds.top
              : bounds.bottom - rect.top) + 16,
      );
    }
  }
  api.updateScene({
    appState: { userToFollow: null },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  api.scrollToContent(elements, {
    fitToContent: true,
    canvasOffsets,
    animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration: 250,
  });
}

export function ZoomMenu({
  stage,
  api,
  boardEventTarget,
}: {
  stage: RefObject<HTMLDivElement | null>;
  api: ExcalidrawImperativeAPI;
  boardEventTarget: (event: KeyboardEvent) => Element | undefined;
}) {
  const { t } = useTranslations();
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const shortcutModifier = isMac ? "⌘" : "Ctrl+";
  const shortcutShift = isMac ? "⇧" : "Shift+";
  const [controls, setControls] = useState<NativeZoom | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{
    percent: number;
    content: boolean;
    selection: boolean;
  } | null>(null);
  const runZoomShortcut = useEffectEvent((event: KeyboardEvent) => {
    const reset = event.code === "Digit0" || event.code === "Numpad0";
    const selectionOnly = event.code === "Digit2";
    if (
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      (!reset && event.code !== "Digit1" && !selectionOnly) ||
      !boardEventTarget(event)
    )
      return;
    const state = api.getAppState();
    const resetButton = reset ? controls?.reset : undefined;
    if (
      state.openDialog ||
      state.openMenu ||
      state.openPopup ||
      state.contextMenu ||
      state.editingTextElement ||
      (reset && !resetButton?.isConnected)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (resetButton) resetButton.click();
    else fitContent(selectionOnly);
  });
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    // Use the menu actions before the native shortcuts apply their own offsets.
    const onKeyDown = (event: KeyboardEvent) => runZoomShortcut(event);
    element.addEventListener("keydown", onKeyDown, true);
    let frame = 0;
    let wrapper: HTMLElement | null = null;
    const sync = () => {
      const reset = element.querySelector<HTMLButtonElement>(
        ".reset-zoom-button:not(.board-zoom-trigger)",
      );
      const row = reset
        ?.closest(".zoom-actions")
        ?.querySelector<HTMLElement>(".Stack_horizontal");
      const zoomIn = row?.querySelector<HTMLButtonElement>(".zoom-in-button");
      const zoomOut = row?.querySelector<HTMLButtonElement>(".zoom-out-button");
      const nextWrapper = reset?.parentElement || null;
      if (wrapper !== nextWrapper) {
        if (wrapper) {
          delete wrapper.dataset.boardZoomHost;
          const previous = wrapper.querySelector<HTMLElement>(
            "[data-board-native-zoom-reset]",
          );
          if (previous) delete previous.dataset.boardNativeZoomReset;
        }
        wrapper = nextWrapper;
        setOpen(false);
      }
      if (wrapper) wrapper.dataset.boardZoomHost = "true";
      if (reset) reset.dataset.boardNativeZoomReset = "true";
      setControls((current) =>
        reset && wrapper && zoomIn && zoomOut
          ? current?.reset === reset && current.host === wrapper
            ? current
            : { reset, host: wrapper, zoomIn, zoomOut }
          : null,
      );
      const state = api.getAppState();
      // Initial data restores the viewport asynchronously. The default zoom
      // is not the project's zoom until Excalidraw finishes loading it.
      if (state.isLoading) return;
      const elements = api.getSceneElements();
      const next = {
        percent: Math.round(state.zoom.value * 100),
        content: elements.length > 0,
        selection: elements.some(
          (element) => state.selectedElementIds[element.id],
        ),
      };
      setView((current) =>
        current?.percent === next.percent &&
        current.content === next.content &&
        current.selection === next.selection
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const resize = new ResizeObserver(() => {
      setOpen(false);
      schedule();
    });
    resize.observe(element);
    const unsubscribe = api.onChange(schedule);
    sync();
    return () => {
      element.removeEventListener("keydown", onKeyDown, true);
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      unsubscribe();
      if (wrapper) {
        delete wrapper.dataset.boardZoomHost;
        const previous = wrapper.querySelector<HTMLElement>(
          "[data-board-native-zoom-reset]",
        );
        if (previous) delete previous.dataset.boardNativeZoomReset;
      }
    };
  }, [api, stage]);

  function fitContent(selectionOnly: boolean) {
    const element = stage.current;
    if (!element) return;
    const state = api.getAppState();
    const elements = api
      .getSceneElements()
      .filter((item) => !selectionOnly || state.selectedElementIds[item.id]);
    fitBoardElements(element, api, elements);
  }

  if (!controls || !view) return null;
  return createPortal(
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="reset-zoom-button zoom-button board-zoom-trigger"
        aria-label={`${t("canvas.zoom.menu")}: ${view.percent}%`}
        data-canvas-ui
      >
        {view.percent}%<ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="board-zoom-menu w-[200px]"
        data-canvas-ui
      >
        <DropdownMenuItem
          disabled={controls.zoomIn.disabled}
          aria-keyshortcuts={isMac ? "Meta+=" : "Control+="}
          onClick={() => controls.zoomIn.click()}
        >
          {t("canvas.zoom.in")}
          <DropdownMenuShortcut aria-hidden="true">
            <span>{shortcutModifier}</span>
            <span>=</span>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={controls.zoomOut.disabled}
          aria-keyshortcuts={isMac ? "Meta+-" : "Control+-"}
          onClick={() => controls.zoomOut.click()}
        >
          {t("canvas.zoom.out")}
          <DropdownMenuShortcut aria-hidden="true">
            <span>{shortcutModifier}</span>
            <span>−</span>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          aria-keyshortcuts="Shift+0"
          onClick={() => controls.reset.click()}
        >
          {t("canvas.zoom.reset")}
          <DropdownMenuShortcut aria-hidden="true">
            <span>{shortcutShift}</span>
            <span>0</span>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!view.content}
          aria-keyshortcuts="Shift+1"
          onClick={() => fitContent(false)}
        >
          {t("canvas.zoom.fitContent")}
          <DropdownMenuShortcut aria-hidden="true">
            <span>{shortcutShift}</span>
            <span>1</span>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!view.selection}
          aria-keyshortcuts="Shift+2"
          onClick={() => fitContent(true)}
        >
          {t("canvas.zoom.fitSelection")}
          <DropdownMenuShortcut aria-hidden="true">
            <span>{shortcutShift}</span>
            <span>2</span>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
    controls.host,
  );
}
