import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { ChevronDown, Diamond, Minus, Wand } from "lucide-react";
import { COMPONENT_CONFIGS } from "@/config/components";
import { getToolDockLayout } from "./toolbar-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

/** Keep the native drawing controls; adapt only the frame and overflow tools. */
export function ToolbarTools({
  stage,
  api,
  tool,
}: {
  stage: RefObject<HTMLDivElement | null>;
  api: ExcalidrawImperativeAPI;
  tool: AppState["activeTool"]["type"];
}) {
  const { t: nativeT } = useI18n();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const FrameIcon = COMPONENT_CONFIGS.frame.icon;
  const tools = [
    ["diamond", nativeT("toolBar.diamond"), Diamond, "D"],
    ["line", nativeT("toolBar.line"), Minus, "L"],
    ["laser", nativeT("toolBar.laser"), Wand, "K"],
  ] as const;

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    let frame = 0;
    let trigger: HTMLButtonElement | null = null;
    let row: HTMLElement | null = null;
    let dock: HTMLElement | null = null;
    let positioned: HTMLElement[] = [];
    const sync = () => {
      const next = element.querySelector<HTMLButtonElement>(
        ".App-toolbar-container .App-toolbar__extra-tools-trigger:not(.board-more-tools)",
      );
      if (trigger !== next) {
        if (trigger) delete trigger.dataset.boardNativeTools;
        trigger = next;
      }
      if (trigger) {
        if (
          trigger.parentElement?.querySelector(
            ".App-toolbar__extra-tools-dropdown",
          )
        )
          trigger.click();
        trigger.dataset.boardNativeTools = "true";
      }
      const nextRow = trigger?.parentElement || null;
      if (row !== nextRow) {
        row = nextRow;
        setHost(row);
        setOpen(false);
      }
      const nextDock = element.querySelector<HTMLElement>(
        ".App-toolbar-container",
      );
      if (dock !== nextDock) {
        if (dock) resize.unobserve(dock);
        dock = nextDock;
        if (dock) resize.observe(dock);
      }
      const mobile = element.querySelector(".excalidraw--mobile");
      const propertiesOpen =
        element.dataset.stylesPanelMode === "mobile" &&
        element.dataset.componentSelection !== "true" &&
        !!element.querySelector(".App-mobile-menu");
      const actions = propertiesOpen
        ? null
        : element.querySelector<HTMLElement>(
            mobile
              ? ".App-bottom-bar .App-toolbar-content"
              : ".layer-ui__wrapper__footer-left",
          );
      const misc = propertiesOpen
        ? null
        : element.querySelector<HTMLElement>(".mobile-misc-tools-container");
      const targets =
        dock && actions
          ? [actions, misc].filter((target) => target !== null)
          : [];
      for (const target of positioned) {
        if (targets.includes(target)) continue;
        resize.unobserve(target);
        delete target.dataset.boardBottomActions;
        target.style.removeProperty("left");
        target.style.removeProperty("top");
      }
      for (const target of targets) {
        if (!positioned.includes(target)) resize.observe(target);
      }
      positioned = targets;
      if (dock && actions) {
        actions.dataset.boardBottomActions = "true";
        const styles = getComputedStyle(element);
        const gap = Number.parseFloat(
          styles.getPropertyValue("--board-bottom-gap"),
        );
        const inset = Number.parseFloat(
          styles.getPropertyValue("--board-bottom-side-inset"),
        );
        const bottom = Number.parseFloat(
          styles.getPropertyValue("--board-bottom-inset"),
        );
        const bounds = element.getBoundingClientRect();
        const dockBounds = dock.getBoundingClientRect();
        const actionBounds = actions.getBoundingClientRect();
        const miscBounds = misc?.getBoundingClientRect();
        const auxiliaryWidth =
          actionBounds.width + (miscBounds ? gap + miscBounds.width : 0);
        const auxiliaryHeight = Math.max(
          actionBounds.height,
          miscBounds?.height || 0,
        );
        const layout = getToolDockLayout({
          width: bounds.width,
          dockWidth: dockBounds.width,
          left: inset + auxiliaryWidth,
          right: bounds.width - inset,
          gap,
        });
        element.dataset.toolDockLayout = layout.stacked ? "stacked" : "inline";
        element.style.setProperty(
          "--board-tool-dock-shift",
          `${layout.shift}px`,
        );
        const left = layout.stacked
          ? Math.max(
              inset,
              Math.min(
                (bounds.width - dockBounds.width) / 2,
                bounds.width - inset - auxiliaryWidth,
              ),
            )
          : inset;
        const auxiliaryBottom = layout.stacked
          ? bottom + dockBounds.height + gap
          : bottom + (dockBounds.height - auxiliaryHeight) / 2;
        // Native mobile controls live in separate containers. Position their
        // existing nodes as one action row without replacing their handlers.
        for (const target of targets) {
          const parent = target.offsetParent;
          if (!(parent instanceof HTMLElement)) continue;
          const origin = parent.getBoundingClientRect();
          const height = target.getBoundingClientRect().height;
          const x = left + (target === misc ? actionBounds.width + gap : 0);
          const y =
            bounds.height - auxiliaryBottom - (auxiliaryHeight + height) / 2;
          target.style.left = `${bounds.left + x - origin.left - parent.clientLeft + parent.scrollLeft}px`;
          target.style.top = `${bounds.top + y - origin.top - parent.clientTop + parent.scrollTop}px`;
        }
        // The palette centers above this row. Wait for the custom controls to
        // contribute their widths before revealing its initial position.
        if (
          row?.querySelector(".board-more-tools") &&
          (mobile || element.querySelector(".board-zoom-trigger"))
        )
          element.dataset.toolDockReady = "true";
      } else {
        delete element.dataset.toolDockLayout;
        element.style.removeProperty("--board-tool-dock-shift");
      }
      element.dispatchEvent(new Event("board-tool-dock-layout"));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-styles-panel-mode", "data-component-selection"],
    });
    sync();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      if (trigger) delete trigger.dataset.boardNativeTools;
      for (const target of positioned) {
        delete target.dataset.boardBottomActions;
        target.style.removeProperty("left");
        target.style.removeProperty("top");
      }
      delete element.dataset.toolDockLayout;
      delete element.dataset.toolDockReady;
      element.style.removeProperty("--board-tool-dock-shift");
    };
  }, [stage]);

  function activate(type: "frame" | "diamond" | "line" | "laser") {
    api.setActiveTool({ type });
    setOpen(false);
    stage.current
      ?.querySelector<HTMLElement>(".excalidraw")
      ?.focus({ preventScroll: true });
  }

  if (!host) return null;
  return createPortal(
    <>
      <label
        className="ToolIcon board-frame-tool"
        title={`${nativeT("toolBar.frame")} — F`}
      >
        <input
          type="radio"
          className="ToolIcon_type_radio"
          name="editor-current-shape"
          aria-label={nativeT("toolBar.frame")}
          aria-keyshortcuts="F"
          data-testid="toolbar-frame"
          checked={tool === "frame"}
          onChange={() => activate("frame")}
        />
        <div className="ToolIcon__icon">
          <FrameIcon />
          <span className="ToolIcon__keybinding">F</span>
        </div>
      </label>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className={`ToolIcon ToolIcon_type_button App-toolbar__extra-tools-trigger board-more-tools ${
            tools.some(([type]) => type === tool)
              ? "App-toolbar__extra-tools-trigger--selected"
              : ""
          }`}
          aria-label={nativeT("toolBar.extraTools")}
          title={nativeT("toolBar.extraTools")}
        >
          <span className="ToolIcon__icon">
            <ChevronDown />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          sideOffset={8}
          align="end"
          className="board-extra-tools-menu"
          aria-label={nativeT("toolBar.extraTools")}
          data-canvas-ui
          finalFocus={() =>
            document.activeElement !==
            stage.current?.querySelector(".excalidraw")
          }
        >
          <DropdownMenuRadioGroup value={tool}>
            {tools.map(([type, label, Icon, shortcut]) => (
              <DropdownMenuRadioItem
                key={type}
                value={type}
                closeOnClick
                onClick={() => activate(type)}
              >
                <Icon />
                {label}
                <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>,
    host,
  );
}
