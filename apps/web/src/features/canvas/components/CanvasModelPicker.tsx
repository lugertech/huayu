import { useRef, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Eye,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  connectionBaseUrl,
  IMAGE_PROVIDERS,
  modelCheckStatus,
  type ImageProvider,
  type ModelSettings,
} from "@/ai/model-config";
import {
  connectionFor,
  saveSettingsEdits,
  useModelSettings,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/common/ToastProvider";
import { LocalizedError } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { openModelSettings } from "@/lib/settings-event";
import type { Editor } from "@/features/canvas/editor";
import { canvasErrorToast } from "./CanvasErrorToast";

type Choice = { label: string; group: string; model: string } & (
  | { kind: "language"; id: string; vision: boolean }
  | { kind: "image"; id: ImageProvider }
);

const imageNames: Record<ImageProvider, string> = {
  "gpt-image": "GPT Image",
  seedream: "Seedream",
};

export function CanvasModelPicker({ editor }: { editor: Editor }) {
  const { t } = useTranslations();
  const { showToast } = useToast();
  const settings = useModelSettings();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"text" | "image">("text");
  const [visionOnly, setVisionOnly] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const capability = tab === "image" ? "image" : visionOnly ? "vision" : "text";
  const selected = connectionFor(capability, settings);
  const activeId =
    selected?.provider === "language" ? selected.id : selected?.provider;
  const triggerName =
    selected?.provider === "language"
      ? selected.name.trim() || selected.model
      : selected
        ? imageNames[selected.provider]
        : t("canvas.models.trigger");
  const choices: Choice[] =
    tab === "image"
      ? IMAGE_PROVIDERS.flatMap((provider) => {
          const connection = settings.images[provider];
          const status = modelCheckStatus("image", connection);
          if (status === "unconfigured" || status === "disabled") return [];
          return [
            {
              kind: "image",
              id: provider,
              label: imageNames[provider],
              group:
                provider === "gpt-image"
                  ? "OpenAI"
                  : t("canvas.models.volcengine"),
              model: connection.model,
            },
          ];
        })
      : settings.language.flatMap((connection) => {
          const status = modelCheckStatus("text", connection);
          const vision = connection.checks.vision?.status === "verified";
          if (
            status === "unconfigured" ||
            status === "disabled" ||
            (visionOnly && !vision)
          )
            return [];
          const hostname = new URL(connectionBaseUrl(connection)).hostname;
          return [
            {
              kind: "language",
              id: connection.id,
              label: connection.name.trim() || connection.model,
              model: connection.model,
              group: hostname === "api.openai.com" ? "OpenAI" : hostname,
              vision,
            },
          ];
        });
  const filtered = query.trim().toLocaleLowerCase();
  const groups = new Map<string, Choice[]>();
  for (const choice of choices) {
    if (
      ![choice.label, choice.group, choice.model].some((name) =>
        name.toLocaleLowerCase().includes(filtered),
      )
    )
      continue;
    const group = groups.get(choice.group);
    if (group) group.push(choice);
    else groups.set(choice.group, [choice]);
  }
  function select(choice: Choice) {
    const selection: ModelSettings["selection"] = {
      ...settings.selection,
      ...(choice.kind === "image"
        ? { image: choice.id }
        : { [visionOnly ? "vision" : "text"]: choice.id }),
    };
    try {
      saveSettingsEdits(settings, { ...settings, selection });
      setOpen(false);
    } catch {
      showToast(
        canvasErrorToast(
          editor,
          new LocalizedError({ key: "settings.storageUnavailable" }),
        ),
      );
    }
  }
  function configure() {
    setOpen(false);
    openModelSettings(capability);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="board-toolbar-button board-toolbar-model"
            aria-label={t("canvas.models.choose")}
            title={triggerName}
          />
        }
      >
        <Box />
        <span className="board-toolbar-model-label max-w-36 truncate">
          {triggerName}
        </span>
        <ChevronDown className="board-toolbar-model-label !size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        initialFocus={search}
        aria-label={t("canvas.models.choose")}
        className="w-[23rem] max-w-[calc(100vw-1.5rem)] gap-0 p-0"
        data-canvas-ui
      >
        <div className="space-y-2.5 border-b border-border/70 p-2.5">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("canvas.models.search")}
              placeholder={t("canvas.models.search")}
              className="h-8 bg-muted/35 pl-8 focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring/35"
            />
          </label>
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label={t("settings.models.title")}
          >
            {(["text", "image"] as const).map((value) => (
              <Button
                key={value}
                variant={tab === value ? "secondary" : "ghost"}
                size="xs"
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setQuery("");
                }}
              >
                {t(
                  value === "text"
                    ? "settings.models.language"
                    : "models.imageGeneration",
                )}
              </Button>
            ))}
            {tab === "text" && (
              <Button
                variant={visionOnly ? "secondary" : "ghost"}
                size="xs"
                className="ml-auto"
                aria-pressed={visionOnly}
                onClick={() => setVisionOnly(!visionOnly)}
              >
                <Eye />
                {t("models.imageUnderstanding")}
              </Button>
            )}
          </div>
        </div>
        {groups.size > 0 ? (
          <div className="max-h-[min(48dvh,22rem)] overflow-y-auto p-1.5">
            {[...groups].map(([group, rows]) => (
              <div key={group}>
                <div className="truncate px-2.5 py-1.5 text-xs text-muted-foreground">
                  {group}
                </div>
                {rows.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={choice.id === activeId}
                    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-start outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
                    onClick={() => select(choice)}
                  >
                    <span
                      className="flex size-4 shrink-0 items-center"
                      aria-hidden="true"
                    >
                      {choice.id === activeId && <Check className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {choice.label}
                    </span>
                    {choice.kind === "image" && (
                      <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                        {choice.model}
                      </span>
                    )}
                    {choice.kind === "language" && choice.vision && (
                      <span className="flex shrink-0 items-center gap-1 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                        <Eye className="size-3" />
                        {t("models.imageUnderstanding")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t(
              choices.length
                ? "canvas.models.noMatches"
                : "canvas.models.empty",
            )}
          </div>
        )}
        <div className="border-t border-border/70 p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={configure}
          >
            <SlidersHorizontal />
            {t("models.connection.openSettings")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
