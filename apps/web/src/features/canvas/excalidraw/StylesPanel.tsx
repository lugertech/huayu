import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CaptureUpdateAction, useI18n } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ArrowUpRight, Ellipsis, SlidersHorizontal, Type } from "lucide-react";
import { useTranslations } from "@/i18n";
import { getStylesPanelMode } from "./styles-panel";

type PropertyGroup =
  | "stroke"
  | "background"
  | "shape"
  | "arrow"
  | "text"
  | "actions";
type NativePanel = {
  host: HTMLElement;
  column: HTMLElement;
  groups: PropertyGroup[];
  stroke: string;
  background: string;
};

/** Adapts 0.18.1's native actions to upstream's compact panel layout.
 * Controls stay in Excalidraw's React tree, with their selection and history.
 * Remove this adapter when the published package exposes compact styles UI.
 */
export function StylesPanel({
  stage,
  api,
  disabled,
}: {
  stage: RefObject<HTMLDivElement | null>;
  api: ExcalidrawImperativeAPI;
  disabled: boolean;
}) {
  const { t: nativeT, langCode } = useI18n();
  const { t } = useTranslations();
  const [panel, setPanel] = useState<NativePanel | null>(null);
  const [open, setOpen] = useState<PropertyGroup | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useLayoutEffect(() => {
    const element = stage.current;
    const native = element?.querySelector<HTMLElement>(".excalidraw");
    if (!element || !native) return;
    let frame = 0;
    let host: HTMLElement | null = null;
    let selection = "";
    let width = 0;
    let height = 0;
    let hadColorPopup = false;
    const sync = () => {
      const state = api.getAppState();
      // Native Range measures while compact groups are hidden. Size its value
      // bubble with CSS so it also stays correct when a group first opens.
      for (const range of native.querySelectorAll<HTMLInputElement>(
        '[data-testid="opacity"]',
      ))
        range.parentElement?.style.setProperty("--board-opacity", range.value);
      const mode = getStylesPanelMode(
        element.clientWidth,
        element.clientHeight,
      );
      if (element.clientWidth !== width || element.clientHeight !== height) {
        width = element.clientWidth;
        height = element.clientHeight;
        element.style.setProperty("--board-stage-width", `${width}px`);
        element.style.setProperty("--board-stage-height", `${height}px`);
        element.dataset.stylesPanelMode = mode;
        setOpen(null);
        const closeMenu = mode !== "compact" && state.openMenu === "shape";
        if (state.openPopup || closeMenu)
          api.updateScene({
            appState: {
              openPopup: null,
              openMenu: closeMenu ? null : state.openMenu,
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
      }
      if (
        hadColorPopup &&
        !state.openPopup &&
        (openRef.current === "stroke" || openRef.current === "background")
      )
        setOpen(null);
      hadColorPopup =
        state.openPopup === "elementStroke" ||
        state.openPopup === "elementBackground";
      const nextSelection = `${state.activeTool.type}:${Object.keys(state.selectedElementIds).join(",")}`;
      if (nextSelection !== selection) {
        selection = nextSelection;
        setOpen(null);
      }
      const compact = mode === "compact" && !disabled;
      const edit = native.querySelector<HTMLButtonElement>(
        '.App-bottom-bar button[aria-label="' + nativeT("buttons.edit") + '"]',
      );
      if (edit) edit.dataset.boardStyleToggle = "true";
      // This stable release enters mobile UI at 730px. Keep its native action
      // section mounted between 600–729px, then present it as a side rail.
      if (
        compact &&
        native.classList.contains("excalidraw--mobile") &&
        !state.viewModeEnabled &&
        !state.openDialog &&
        !state.openSidebar &&
        state.openMenu === null
      ) {
        api.updateScene({
          appState: { openMenu: "shape" },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      const nextHost = compact
        ? native.querySelector<HTMLElement>(".App-menu__left, .App-mobile-menu")
        : null;
      if (host !== nextHost) {
        if (host) delete host.dataset.boardCompactPanel;
        host = nextHost;
      }
      const column = host?.querySelector<HTMLElement>(".panelColumn");
      if (!host || !column) {
        setPanel((current) => (current ? null : current));
        return;
      }
      host.dataset.boardCompactPanel = "true";
      const groups = new Set<PropertyGroup>();
      let stroke = "transparent";
      let background = "transparent";
      for (const child of column.children) {
        if (!(child instanceof HTMLElement)) continue;
        // Native stroke wrappers can be empty for image-only selections.
        if (!child.childElementCount) {
          delete child.dataset.boardPropertyGroup;
          continue;
        }
        const heading = child.querySelector("legend, h3")?.textContent;
        let group: PropertyGroup = "shape";
        if (child.querySelector(".color-picker-container")) {
          group =
            heading === nativeT("labels.stroke") ? "stroke" : "background";
          const color =
            child
              .querySelector<HTMLElement>(".active-color")
              ?.style.getPropertyValue("--swatch-color") || "transparent";
          if (group === "stroke") stroke = color;
          else background = color;
        } else if (
          [nativeT("labels.arrowheads"), nativeT("labels.arrowtypes")].includes(
            heading || "",
          )
        ) {
          group = "arrow";
        } else if (
          [
            nativeT("labels.fontSize"),
            nativeT("labels.fontFamily"),
            nativeT("labels.textAlign"),
          ].includes(heading || "") ||
          child.querySelector('[data-testid="align-top"]')
        ) {
          group = "text";
        } else if (
          [
            nativeT("labels.layers"),
            nativeT("labels.align"),
            nativeT("labels.actions"),
          ].includes(heading || "")
        ) {
          group = "actions";
        }
        child.dataset.boardPropertyGroup = group;
        groups.add(group);
      }
      const ordered = (
        ["stroke", "background", "shape", "arrow", "text", "actions"] as const
      ).filter((group) => groups.has(group));
      if (openRef.current && !groups.has(openRef.current)) setOpen(null);
      setPanel((current) =>
        current?.host === host &&
        current.column === column &&
        current.stroke === stroke &&
        current.background === background &&
        current.groups.join() === ordered.join()
          ? current
          : { host: host!, column, groups: ordered, stroke, background },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const mutations = new MutationObserver(schedule);
    mutations.observe(native, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const unsubscribe = api.onChange(schedule);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      unsubscribe();
      if (host) delete host.dataset.boardCompactPanel;
    };
  }, [api, disabled, langCode, stage, nativeT]);

  const host = panel?.host;
  const column = panel?.column;
  useLayoutEffect(() => {
    if (!host || !column) return;
    host.dataset.boardOpenProperty = open || "";
    if (!open) return;
    const trigger = rail.current?.querySelector<HTMLButtonElement>(
      `[data-property="${open}"]`,
    );
    const position = () => {
      const bounds = stage.current!.getBoundingClientRect();
      const hostBounds = host.getBoundingClientRect();
      const anchor = trigger?.getBoundingClientRect();
      const height = column.getBoundingClientRect().height;
      const top = Math.max(
        bounds.top + 12,
        Math.min(anchor?.top || hostBounds.top, bounds.bottom - height - 16),
      );
      column.style.setProperty(
        "--board-property-top",
        `${top - hostBounds.top}px`,
      );
    };
    position();
    column
      .querySelector<HTMLElement>(
        `[data-board-property-group="${open}"] :is(button, input):not([disabled])`,
      )
      ?.focus({ preventScroll: true });
    const resize = new ResizeObserver(position);
    resize.observe(column);
    if (open === "stroke" || open === "background")
      column
        .querySelector<HTMLButtonElement>(
          `[data-board-property-group="${open}"] .active-color`,
        )
        ?.click();
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const target = event.target;
      // The native color picker owns outside clicks, including eyedropping.
      if (
        (open === "stroke" || open === "background") &&
        api.getAppState().openPopup
      )
        return;
      // Let a nested native picker handle Escape before closing its parent.
      if (
        target instanceof Element &&
        target.closest(
          "[data-radix-popper-content-wrapper], .excalidraw-popover",
        )
      )
        return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape" || api.getAppState().openPopup) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(null);
        trigger?.focus({ preventScroll: true });
      } else if (
        target instanceof Element &&
        target.closest('[role="dialog"]')
      ) {
        return;
      } else if (target instanceof Node && !host.contains(target)) {
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", dismiss, true);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
      delete host.dataset.boardOpenProperty;
    };
  }, [api, open, host, column, stage]);

  if (!panel) return null;
  const labels = {
    stroke: nativeT("labels.stroke"),
    background: nativeT("labels.background"),
    shape: t("canvas.styles"),
    arrow: nativeT("toolBar.arrow"),
    text: nativeT("toolBar.text"),
    actions: nativeT("labels.actions"),
  };
  return createPortal(
    <div
      ref={rail}
      className="board-style-rail"
      role="toolbar"
      aria-label={nativeT("headings.selectedShapeActions")}
      data-canvas-ui
      onScroll={() => {
        setOpen(null);
        if (api.getAppState().openPopup)
          api.updateScene({
            appState: { openPopup: null },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
      }}
    >
      {panel.groups.map((group) => (
        <button
          key={group}
          type="button"
          data-property={group}
          title={labels[group]}
          aria-label={labels[group]}
          aria-expanded={open === group}
          onClick={() => setOpen(open === group ? null : group)}
        >
          {group === "stroke" || group === "background" ? (
            <span
              className="board-style-swatch"
              data-outline={group === "stroke" || undefined}
              style={{
                color: panel.stroke,
                background:
                  group === "stroke" ? "transparent" : panel.background,
              }}
            />
          ) : group === "shape" ? (
            <SlidersHorizontal />
          ) : group === "arrow" ? (
            <ArrowUpRight />
          ) : group === "text" ? (
            <Type />
          ) : (
            <Ellipsis />
          )}
        </button>
      ))}
    </div>,
    panel.host,
  );
}
