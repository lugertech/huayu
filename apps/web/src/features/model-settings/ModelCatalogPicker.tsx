import { useEffect, useId, useRef, useState } from "react";
import { ListFilter, LoaderCircle } from "lucide-react";
import { listLanguageModels } from "@/ai/provider";
import type { LanguageConnection } from "@/ai/model-config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/i18n";
import { LocalizedError, errorText } from "@/i18n/errors";

type CatalogState = { connection: LanguageConnection } & (
  | { status: "loading" }
  | { status: "ready"; models: string[]; selected: ReadonlySet<string> }
  | { status: "failed"; error: LocalizedError }
);

export function ModelCatalogPicker({
  connection,
  configuredModels,
  onApply,
}: {
  connection: LanguageConnection;
  configuredModels: ReadonlySet<string>;
  onApply: (models: readonly string[], selected: ReadonlySet<string>) => void;
}) {
  const { locale, t } = useTranslations();
  const id = useId();
  const search = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [query, setQuery] = useState("");
  const current = catalog?.connection === connection ? catalog : null;
  const ready = current?.status === "ready" ? current : null;
  const searchText = query.trim().toLowerCase();
  const shown =
    ready?.models.filter((model) => model.toLowerCase().includes(searchText)) ??
    [];
  const allShownSelected =
    shown.length > 0 && shown.every((model) => ready?.selected.has(model));
  const canApply =
    ready &&
    (ready.selected.size > 0 ||
      ready.models.some((model) => configuredModels.has(model)));

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [connection],
  );

  function close() {
    request.current?.abort();
    request.current = null;
    setCatalog(null);
  }

  async function loadCatalog() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCatalog({ connection, status: "loading" });
    try {
      const models = await listLanguageModels(connection, controller.signal);
      if (request.current === controller && !controller.signal.aborted)
        setCatalog({
          connection,
          status: "ready",
          models,
          selected: new Set(
            models.filter((model) => configuredModels.has(model)),
          ),
        });
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted)
        setCatalog({
          connection,
          status: "failed",
          error:
            error instanceof LocalizedError &&
            error.translation?.key !== "models.connection.notFound" &&
            error.translation?.key !== "models.theServiceReturnedNoModelList"
              ? error
              : new LocalizedError({ key: "settings.models.modelListFailed" }),
        });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function check(models: readonly string[], checked: boolean) {
    setCatalog((previous) => {
      if (previous?.status !== "ready" || previous.connection !== connection)
        return previous;
      const selected = new Set(previous.selected);
      for (const model of models) {
        if (checked) selected.add(model);
        else selected.delete(model);
      }
      return { ...previous, selected };
    });
  }

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (open) {
          setQuery("");
          void loadCatalog();
        } else {
          close();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-9 bg-card"
            disabled={!connection.baseUrl.trim()}
          />
        }
      >
        <ListFilter />
        {t("settings.models.fetchModels")}
      </DialogTrigger>
      <DialogContent
        initialFocus={search}
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-5 shadow-xl sm:max-w-md"
      >
        <DialogTitle className="pr-8">
          {t("settings.models.availableModels")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("settings.models.catalogDescription")}
        </DialogDescription>

        {current?.status === "loading" || ready?.models.length ? (
          <div className="flex shrink-0 items-center gap-2">
            <Input
              ref={search}
              type="search"
              autoComplete="off"
              className="h-9 min-w-0 flex-1 focus-visible:ring-1"
              aria-label={t("canvas.models.search")}
              placeholder={t("canvas.models.search")}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!shown.length}
              onClick={() => check(shown, !allShownSelected)}
            >
              {t(
                allShownSelected
                  ? "settings.models.clearCatalogSelection"
                  : "settings.models.selectCatalogModels",
              )}
            </Button>
          </div>
        ) : null}

        {current?.status === "loading" && (
          <p
            role="status"
            className="flex items-center gap-2 text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t("common.loading")}
          </p>
        )}
        {current?.status === "failed" && (
          <p role="alert" className="text-destructive">
            {errorText(current.error, locale)}
          </p>
        )}
        {ready &&
          (ready.models.length === 0 ? (
            <p role="status" className="text-muted-foreground">
              {t("settings.models.emptyModelList")}
            </p>
          ) : shown.length ? (
            <div className="min-h-0 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border/70 p-1">
              {shown.map((model, index) => (
                <div
                  key={model}
                  className="flex items-center gap-2.5 rounded-md px-2 hover:bg-muted/65"
                >
                  <Checkbox
                    id={`${id}-${index}`}
                    aria-label={model}
                    checked={ready.selected.has(model)}
                    onCheckedChange={(checked) => check([model], checked)}
                  />
                  <label
                    htmlFor={`${id}-${index}`}
                    className="min-w-0 flex-1 cursor-pointer py-2 break-all"
                  >
                    {model}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p role="status" className="text-muted-foreground">
              {t("search.noResultsFound")}
            </p>
          ))}

        <div className="flex shrink-0 justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          {current?.status === "failed" ? (
            <Button type="button" onClick={() => void loadCatalog()}>
              {t("common.retry")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canApply}
              onClick={() => {
                if (!ready || !canApply) return;
                onApply(ready.models, ready.selected);
                close();
              }}
            >
              {t("settings.models.applyCatalogSelection")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
