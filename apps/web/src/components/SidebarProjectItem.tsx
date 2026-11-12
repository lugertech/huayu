import { useId, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Ellipsis, Loader2, Pencil, Trash2 } from "lucide-react";
import { t, useLocale } from "@/i18n";
import { errorText, LocalizedError } from "@/i18n/errors";
import { api, type Project } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SidebarProjectItem({
  project,
  onNavigate,
}: {
  project: Project;
  onNavigate?: () => void;
}) {
  useLocale();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const titleRow = useRef<HTMLDivElement>(null);
  const titleViewport = useRef<HTMLSpanElement>(null);
  const titleContent = useRef<HTMLSpanElement>(null);
  const deleted = useRef(false);

  useLayoutEffect(() => {
    const viewport = titleViewport.current!;
    const content = titleContent.current!;
    const row = titleRow.current!;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let canPlay = row.matches(":hover") && matchMedia("(hover: hover)").matches;
    let distance = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let movement: Animation | undefined;
    let fade: Animation | undefined;
    const position = () => {
      const transform = getComputedStyle(content).transform;
      return transform === "none"
        ? 0
        : Math.max(0, -new DOMMatrixReadOnly(transform).m41);
    };
    const stopAnimations = () => {
      if (movement) movement.onfinish = null;
      movement?.cancel();
      fade?.cancel();
      movement = undefined;
      fade = undefined;
    };
    const settle = (value: number) => {
      content.style.transform = `translate3d(${-value}px, 0, 0)`;
      viewport.style.setProperty("--sidebar-title-offset", `${value}px`);
      stopAnimations();
      content.style.willChange = "";
    };
    const move = (target: number, pause: number) => {
      const from = position();
      settle(from);
      if (reducedMotion.matches || distance <= 1) {
        settle(0);
        return;
      }
      content.style.willChange = "transform";
      const options: KeyframeAnimationOptions = {
        duration: (Math.abs(target - from) / 38) * 1000,
        delay: pause,
        easing: "linear",
        fill: "both",
      };
      movement = content.animate(
        [
          { transform: `translate3d(${-from}px, 0, 0)` },
          { transform: `translate3d(${-target}px, 0, 0)` },
        ],
        options,
      );
      fade = viewport.animate(
        [
          { "--sidebar-title-offset": `${from}px` },
          { "--sidebar-title-offset": `${target}px` },
        ],
        options,
      );
      movement.startTime = fade.startTime = document.timeline.currentTime;
      movement.onfinish = () => {
        canPlay = false;
        settle(0);
      };
    };
    const schedule = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (canPlay) move(distance, position() < 0.1 ? 500 : 0);
      }, 100);
    };
    const measure = () => {
      const next = Math.max(
        0,
        content.getBoundingClientRect().width -
          viewport.getBoundingClientRect().width,
      );
      if (Math.abs(next - distance) <= 0.1) return;
      distance = next;
      viewport.style.setProperty("--sidebar-title-distance", `${distance}px`);
      if (canPlay) schedule();
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      canPlay = true;
      measure();
      schedule();
    };
    const leave = () => {
      canPlay = false;
      clearTimeout(resizeTimer);
      settle(0);
    };
    const motionChanged = () => {
      clearTimeout(resizeTimer);
      if (reducedMotion.matches) settle(0);
      else if (canPlay) schedule();
    };
    measure();
    if (canPlay) schedule();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    row.addEventListener("pointercancel", leave);
    reducedMotion.addEventListener("change", motionChanged);
    return () => {
      clearTimeout(resizeTimer);
      stopAnimations();
      content.style.transform = "";
      content.style.willChange = "";
      viewport.style.removeProperty("--sidebar-title-offset");
      viewport.style.removeProperty("--sidebar-title-distance");
      observer.disconnect();
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
      row.removeEventListener("pointercancel", leave);
      reducedMotion.removeEventListener("change", motionChanged);
    };
  }, [project.name]);

  async function rename() {
    if (busy || !name.trim()) return;
    if (name.trim() === project.name) {
      setAction(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setAction(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error
          : new LocalizedError({ key: "common.operationFailedRetry" }),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      deleted.current = true;
      setAction(null);
      if (pathname === `/drawing/${project.id}`) {
        navigate("/projects", { replace: true });
        onNavigate?.();
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error
          : new LocalizedError({ key: "common.operationFailedRetry" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        ref={titleRow}
        className="sidebar-project-row"
        data-active={pathname === `/drawing/${project.id}`}
        data-menu-open={menuOpen}
      >
        <NavLink
          to={`/drawing/${project.id}`}
          onClick={onNavigate}
          title={project.name}
          className="sidebar-item sidebar-project-link"
        >
          <span ref={titleViewport} className="sidebar-project-title">
            <span ref={titleContent} className="block w-max">
              {project.name}
            </span>
          </span>
        </NavLink>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                ref={menu}
                variant="ghost"
                size="icon-sm"
                className="sidebar-project-more"
              />
            }
            aria-label={t("projects.actionsFor", { name: project.name })}
          >
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-44"
            finalFocus={action ? false : menu}
          >
            <DropdownMenuItem
              onClick={() => {
                setName(project.name);
                setError(null);
                setAction("rename");
              }}
            >
              <Pencil />
              {t("common.rename")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setError(null);
                setAction("delete");
              }}
            >
              <Trash2 />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog
        open={action === "rename"}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent
          initialFocus={input}
          finalFocus={menu}
          showCloseButton={!busy}
          aria-describedby={undefined}
        >
          <DialogTitle>{t("projects.renameProject")}</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {t("projects.projectName")}
            </label>
            <Input
              ref={input}
              id={inputId}
              value={name}
              maxLength={120}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229)
                )
                  event.preventDefault();
              }}
            />
            {error && (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errorText(error)}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={action === "delete"}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <AlertDialogContent
          finalFocus={() =>
            deleted.current
              ? (document.querySelector<HTMLAnchorElement>(
                  `.sidebar-project-link:not([href="/drawing/${project.id}"])`,
                ) ??
                document.querySelector<HTMLAnchorElement>(
                  ".sidebar-navigation a",
                ))
              : menu.current
          }
        >
          <AlertDialogTitle>
            {t("recordings.delete", { name: project.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projects.thisCannotBeUndone")}
            {t("projects.exportAnythingYouWantToKeepFirst")}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {errorText(error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy && (
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
