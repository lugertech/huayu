import { createBlankProject } from "@/features/projects/create-project";
import { t, useLocale, type MessageKey } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  FilePenLine,
  FolderOpen,
  Loader2,
  Search,
  Settings2,
  SquarePen,
  Video,
} from "lucide-react";
import { api, type Project, type Recording } from "@/api/client";
import { searchScore } from "@/lib/search";
import { lastOpenedProject } from "@/lib/recent-project";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "./common/ToastProvider";

type SearchItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  icon: typeof Search;
  to?: string;
};

export function QuickSearch({
  open,
  onOpenChange,
  onModels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModels: () => void;
}) {
  const locale = useLocale();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<MessageKey[]>([]);
  const [reload, setReload] = useState(0);
  const [activeId, setActiveId] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const handoff = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveId("");
      handoff.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setErrors([]);
    void Promise.allSettled([
      api<Project[]>("/api/projects", { signal: controller.signal }),
      api<Recording[]>("/api/recordings", { signal: controller.signal }),
    ]).then(([projectResult, recordingResult]) => {
      if (controller.signal.aborted) return;
      setProjects(
        projectResult.status === "fulfilled" ? projectResult.value : [],
      );
      setRecordings(
        recordingResult.status === "fulfilled" ? recordingResult.value : [],
      );
      setErrors([
        ...(projectResult.status === "rejected"
          ? ["navigation.projects" as const]
          : []),
        ...(recordingResult.status === "rejected"
          ? ["navigation.recordings" as const]
          : []),
      ]);
      setLoading(false);
    });
    return () => controller.abort();
  }, [open, reload]);

  const items = useMemo(() => {
    const text = (key: MessageKey) => t(key, undefined, locale);
    const lastProjectId = lastOpenedProject();
    const rank = (values: SearchItem[], limit: number) =>
      values
        .map((item) => ({
          item,
          score: searchScore(
            query,
            item.name,
            `${item.group} ${item.description}`,
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ item }) => item);
    return [
      ...rank(
        [...projects]
          .sort(
            (a, b) =>
              Number(b.id === lastProjectId) - Number(a.id === lastProjectId) ||
              b.updated_at.localeCompare(a.updated_at),
          )
          .map((project) => ({
            id: `project-${project.id}`,
            name: project.name,
            group: text("navigation.projects"),
            description: text("canvas.open"),
            icon: FilePenLine,
            to: `/drawing/${project.id}`,
          })),
        query.trim() ? 10 : 5,
      ),
      ...rank(
        [...recordings]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((recording) => ({
            id: `recording-${recording.id}`,
            name: recording.name,
            group: text("navigation.recordings"),
            description: recording.transcript
              ? text("search.reviewRecordingAndTranscript")
              : text("search.reviewRecordingAndStartTranscription"),
            icon: Video,
            to: `/recordings/${recording.id}/analysis`,
          })),
        query.trim() ? 6 : 3,
      ),
      ...rank(
        [
          {
            id: "create",
            name: text("projects.create"),
            description: text("search.startWithABlankCanvas"),
            group: text("search.actions"),
            icon: SquarePen,
          },
          {
            id: "projects",
            name: text("projects.all"),
            description: text("search.browseProjectsAndExamples"),
            group: text("search.actions"),
            icon: FolderOpen,
            to: "/projects",
          },
          {
            id: "recordings",
            name: text("recordings.all"),
            description: text("search.recordTranscribeAndReview"),
            group: text("search.actions"),
            icon: Video,
            to: "/recordings",
          },
          {
            id: "models",
            name: text("settings.models.title"),
            description: text("search.openSettingsToConnectAnAiService"),
            group: text("search.actions"),
            icon: Settings2,
          },
        ],
        4,
      ),
    ];
  }, [projects, recordings, query, locale]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const activeItem = items[activeIndex];

  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeItem?.id]);

  async function choose(item: SearchItem) {
    if (creatingRef.current) return;
    if (item.id === "models") {
      handoff.current = true;
      onOpenChange(false);
      onModels();
    } else if (item.to) {
      handoff.current = true;
      onOpenChange(false);
      navigate(item.to);
    } else if (item.id === "create") {
      creatingRef.current = true;
      setCreating(true);
      try {
        const project = await createBlankProject();
        handoff.current = true;
        onOpenChange(false);
        navigate(`/drawing/${project.id}`);
      } catch (error) {
        input.current?.focus();
        showToast({
          title: t("projects.createFailed"),
          description: errorText(error),
          variant: "destructive",
        });
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={input}
        finalFocus={() => (handoff.current ? false : undefined)}
        className="top-4 flex max-h-[min(34rem,calc(100dvh-2rem))] -translate-y-0 flex-col gap-0 overflow-hidden p-0 shadow-xl sm:top-[min(18vh,8rem)] sm:max-h-[min(34rem,calc(100dvh-10rem))] sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("search.description")}
        </DialogDescription>
        <div className="flex shrink-0 items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            role="combobox"
            aria-label={t("search.inputLabel")}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              activeItem ? `${listId}-${activeItem.id}` : undefined
            }
            autoComplete="off"
            placeholder={t("search.placeholder")}
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveId("");
            }}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              )
                return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (items.length)
                  setActiveId(
                    items[
                      (activeIndex +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                        items.length
                    ].id,
                  );
              } else if (event.key === "Enter" && activeItem) {
                event.preventDefault();
                void choose(activeItem);
              }
            }}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
            aria-label={t("search.closeQuickSearch")}
            className="text-muted-foreground"
          >
            Esc
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" ref={list}>
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"
            >
              <Loader2 className="size-3 animate-spin" />
              {t("search.searching")}
            </p>
          )}
          {!!errors.length && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground"
            >
              <span>
                {t("search.cannotLoad", {
                  items: errors
                    .map((key) => t(key, undefined, locale))
                    .join(t("common.listSeparator")),
                })}
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setReload((value) => value + 1);
                  input.current?.focus();
                }}
              >
                {t("common.retry")}
              </Button>
            </div>
          )}
          <div
            role="listbox"
            id={listId}
            aria-label={t("search.searchResults")}
            aria-busy={loading}
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.id} role="presentation">
                  {items[index - 1]?.group !== item.group && (
                    <p
                      role="presentation"
                      className="px-3 pt-3 pb-1.5 text-xs text-muted-foreground"
                    >
                      {item.group === t("navigation.projects") && !query.trim()
                        ? t("projects.recent")
                        : item.group === t("navigation.recordings") &&
                            !query.trim()
                          ? t("search.recentRecordings")
                          : item.group}
                    </p>
                  )}
                  <button
                    role="option"
                    id={`${listId}-${item.id}`}
                    aria-selected={activeItem?.id === item.id}
                    tabIndex={-1}
                    disabled={creating}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none aria-selected:bg-accent disabled:opacity-60"
                    onMouseMove={() => setActiveId(item.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void choose(item)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                      {creating && item.id === "create" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    {activeItem?.id === item.id && (
                      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {!loading && !items.length && (
            <div role="status" className="px-6 py-12 text-center">
              <Search className="mx-auto mb-3 size-6 text-muted-foreground opacity-60" />
              <p className="text-sm">{t("search.noResultsFound")}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("search.emptyHint")}
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {query.trim()
              ? t("search.resultCount", { count: items.length })
              : t("search.pickUpWhereYouLeftOff")}
          </span>
          <span className="hidden items-center gap-3 sm:flex">
            <span>{t("search.selectShortcut")}</span>
            <span>{t("search.openShortcut")}</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
