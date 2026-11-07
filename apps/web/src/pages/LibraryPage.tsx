import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp,
  AudioLines,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Image,
  LayoutGrid,
  Library,
  List,
  ListFilter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api, PROJECTS_CHANGED_EVENT, type ProjectChange } from "@/api/client";
import { useTranslations } from "@/i18n";
import { ShellSidebarTrigger } from "@/Components/Shell";
import { useToast } from "@/Components/common/ToastProvider";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { LoadingRegion } from "@/ui/loading-region";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { LibraryPreview } from "@/features/library/LibraryPreview";
import {
  LIBRARY_KINDS,
  downloadLibraryItem,
  filterLibraryItems,
  groupLibraryItems,
  libraryItemKey,
  libraryItemName,
  libraryItemUrl,
  type LibraryItem,
  type LibraryKind,
} from "@/features/library/library";
import "@/features/library/library.css";

const icons = {
  image: Image,
  website: Globe,
  document: FileText,
  audio: AudioLines,
};
export function LibraryPage() {
  const { t, locale } = useTranslations();
  const { showToast } = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [grouped, setGrouped] = useState(
    () => localStorage.getItem("huayu:library-grouped") === "true",
  );
  const [view, setView] = useState<"list" | "grid">(() =>
    localStorage.getItem("huayu:library-view") === "grid" ? "grid" : "list",
  );
  const [expanded, setExpanded] = useState(new Set<string>());
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    api<LibraryItem[]>("/api/library", { signal: controller.signal })
      .then((items) => {
        setItems(items);
        setProject((id) =>
          id && !items.some((item) => item.project_id === id) ? "" : id,
        );
        setPreview((current) => {
          if (!current) return null;
          const item = items.find(
            (item) => libraryItemKey(item) === libraryItemKey(current),
          );
          return !item
            ? null
            : item.updated_at !== current.updated_at
              ? item
              : current;
        });
        setError("");
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoaded(true);
          setRefreshing(false);
        }
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<ProjectChange | undefined>).detail;
      if (change?.type === "deleted") {
        setItems((items) =>
          items.filter((item) => item.project_id !== change.id),
        );
        setPreview((item) => (item?.project_id === change.id ? null : item));
        setProject((id) => (id === change.id ? "" : id));
      }
      refresh();
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, changed);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  const projects = useMemo(() => groupLibraryItems(items), [items]);
  const filtered = useMemo(
    () => filterLibraryItems(items, search, kind, project, sort),
    [items, search, kind, project, sort],
  );
  const groups = useMemo(
    () =>
      grouped
        ? groupLibraryItems(filtered)
        : [{ id: "all", name: "", updatedAt: "", items: filtered }],
    [filtered, grouped],
  );
  const date = (value: string) =>
    new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  async function download(item: LibraryItem) {
    setDownloading(libraryItemKey(item));
    try {
      await downloadLibraryItem(item);
    } catch (error) {
      showToast({
        title: t("common.downloadFailed"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  }
  function itemView(item: LibraryItem) {
    const Icon = icons[item.kind];
    const url = libraryItemUrl(item);
    const name = libraryItemName(item);
    return (
      <li key={libraryItemKey(item)} className="library-item">
        <button
          className="library-item-main"
          onClick={() => setPreview(item)}
          aria-label={t("library.previewNamed", { name })}
        >
          <span className="library-thumbnail" data-kind={item.kind}>
            {item.kind === "image" && url ? (
              <img src={url} alt="" loading="lazy" />
            ) : (
              <Icon className="library-kind-icon" />
            )}
            {view === "grid" && item.excerpt && (
              <span className="library-excerpt">{item.excerpt}</span>
            )}
          </span>
          <span className="library-item-name" title={name}>
            {name}
          </span>
        </button>
        <span className="library-type">{t(`library.kind.${item.kind}`)}</span>
        {!grouped && (
          <Link
            className="library-project"
            to={`/drawing/${item.project_id}`}
            title={item.project_name}
          >
            {item.project_name}
          </Link>
        )}
        <time className="library-date" dateTime={item.updated_at}>
          {date(item.updated_at)}
        </time>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="library-item-menu"
                aria-label={t("library.actionsNamed", { name })}
              >
                {downloading === libraryItemKey(item) ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MoreHorizontal />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setPreview(item)}>
              <Search />
              {t("library.preview")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  to={`/drawing/${item.project_id}`}
                  state={{ inspectShapeId: item.shape_id }}
                />
              }
            >
              <ExternalLink />
              {t("library.openInProject")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={downloading !== null}
              onClick={() => void download(item)}
            >
              <Download />
              {t("library.download")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  }
  return (
    <main className="library-page">
      <div className="library-page-inner">
        <header className="library-header">
          <div className="flex items-center gap-3">
            <ShellSidebarTrigger />
            <h1>{t("library.title")}</h1>
          </div>
          <div className="library-search">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("library.search")}
              aria-label={t("library.search")}
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("library.clearSearch")}
                onClick={() => setSearch("")}
              >
                <X />
              </Button>
            )}
          </div>
        </header>
        <div className="library-toolbar">
          <div
            className="library-filters"
            role="group"
            aria-label={t("library.filterType")}
          >
            {(["all", ...LIBRARY_KINDS] as const).map((value) => (
              <Button
                key={value}
                variant="ghost"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {t(`library.kind.${value}`)}
              </Button>
            ))}
          </div>
          <div className="library-tools">
            <NativeSelect
              aria-label={t("library.filterProject")}
              value={project}
              onChange={(event) => setProject(event.target.value)}
              className="library-project-select"
            >
              <NativeSelectOption value="">
                {t("library.allProjects")}
              </NativeSelectOption>
              {projects.map((item) => (
                <NativeSelectOption value={item.id} key={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("library.refresh")}
              title={t("library.refresh")}
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("library.viewOptions")}
                    title={t("library.viewOptions")}
                  >
                    <ListFilter />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuCheckboxItem
                  checked={grouped}
                  onCheckedChange={(value) => {
                    setGrouped(value);
                    localStorage.setItem(
                      "huayu:library-grouped",
                      String(value),
                    );
                  }}
                >
                  {t("library.groupByProject")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {(["newest", "oldest", "name"] as const).map((value) => (
                  <DropdownMenuItem key={value} onClick={() => setSort(value)}>
                    {sort === value ? (
                      <Check />
                    ) : (
                      <ArrowDownUp className="opacity-40" />
                    )}
                    {t(`library.sort.${value}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div
              className="library-view-toggle"
              role="group"
              aria-label={t("library.viewMode")}
            >
              {(["grid", "list"] as const).map((value) => (
                <Button
                  variant="ghost"
                  size="icon"
                  key={value}
                  aria-pressed={view === value}
                  aria-label={t(`library.view.${value}`)}
                  title={t(`library.view.${value}`)}
                  onClick={() => {
                    setView(value);
                    localStorage.setItem("huayu:library-view", value);
                  }}
                >
                  {value === "grid" ? <LayoutGrid /> : <List />}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {error && loaded && (
          <div className="library-error" role="alert">
            <span>{error}</span>
            <Button variant="outline" onClick={refresh}>
              {t("library.retry")}
            </Button>
          </div>
        )}
        <LoadingRegion
          id="project-library"
          loading={!loaded}
          placeholder={
            <div className="library-placeholder">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} />
              ))}
            </div>
          }
        >
          {filtered.length ? (
            <div
              className="library-content"
              data-view={view}
              data-grouped={grouped}
            >
              {groups.map((group) => {
                const limit = view === "grid" ? 6 : 5;
                const shown =
                  !grouped || expanded.has(group.id) || search
                    ? group.items
                    : group.items.slice(0, limit);
                return (
                  <section
                    className="library-group"
                    key={group.id}
                    aria-label={group.name || t("library.kind.all")}
                  >
                    {grouped && (
                      <header className="library-group-header">
                        <Link to={`/drawing/${group.id}`}>
                          <FolderOpen className="size-4 text-muted-foreground" />
                          <h2>{group.name}</h2>
                        </Link>
                        <span className="library-count">
                          {group.items.length}
                        </span>
                        <time dateTime={group.updatedAt}>
                          {date(group.updatedAt)}
                        </time>
                      </header>
                    )}
                    {view === "list" && !grouped && (
                      <div className="library-columns" aria-hidden="true">
                        <span>{t("library.name")}</span>
                        <span>{t("library.type")}</span>
                        {!grouped && <span>{t("library.project")}</span>}
                        <span>{t("library.updated")}</span>
                        <span />
                      </div>
                    )}
                    <ul className="library-items">{shown.map(itemView)}</ul>
                    {grouped && !search && group.items.length > limit && (
                      <Button
                        variant="ghost"
                        className="library-show-more"
                        onClick={() =>
                          setExpanded((previous) => {
                            const next = new Set(previous);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                      >
                        {expanded.has(group.id)
                          ? t("library.showLess")
                          : t("library.showMore", {
                              count: group.items.length - limit,
                            })}
                        <ChevronDown
                          className={
                            expanded.has(group.id) ? "rotate-180" : undefined
                          }
                        />
                      </Button>
                    )}
                  </section>
                );
              })}
              <p className="library-total">
                {t("library.total", { count: filtered.length })}
              </p>
            </div>
          ) : (
            !error && (
              <div className="library-empty">
                <Library className="size-9 text-muted-foreground" />
                <h2>
                  {t(
                    search || kind !== "all" || project
                      ? "library.noMatches"
                      : "library.empty",
                  )}
                </h2>
                <p>
                  {t(
                    search || kind !== "all" || project
                      ? "library.adjustFilters"
                      : "library.emptyHint",
                  )}
                </p>
                {search || kind !== "all" || project ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setKind("all");
                      setProject("");
                    }}
                  >
                    {t("library.clearFilters")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link to="/projects" />}
                  >
                    <FolderOpen />
                    {t("library.browseProjects")}
                  </Button>
                )}
              </div>
            )
          )}
        </LoadingRegion>
      </div>
      {preview && (
        <LibraryPreview
          key={libraryItemKey(preview)}
          item={preview}
          onClose={() => setPreview(null)}
          onMissing={refresh}
        />
      )}
    </main>
  );
}
