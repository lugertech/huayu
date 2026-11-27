import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { connectionRequestKey } from "@/ai/model-config";
import {
  configurationIssue,
  connectionFor,
  dismissModelSetup,
  getSettings,
  saveSettingsEdits,
  useModelSettings,
  type Capability,
  type Connection,
  type ModelSettings as SavedSettings,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageModelSettings } from "./LanguageModelSettings";
import { ImageGenerationSettings } from "./ImageGenerationSettings";
import { ToolConnectionSettings } from "./ToolConnectionSettings";

export function ModelSettings({
  category,
  active,
  initialUse,
  modelSetup,
  onClose,
}: {
  category: Exclude<Capability, "vision">;
  active: boolean;
  initialUse: "text" | "vision";
  modelSetup: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useTranslations();
  const saved = useModelSettings();
  const [editedModelId, setEditedModelId] = useState(
    () => connectionFor(initialUse, saved)?.id ?? saved.language[0]?.id ?? null,
  );
  const [session, setSession] = useState<{
    original: SavedSettings;
    draft: SavedSettings;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "failed">(
    "idle",
  );
  const original = session?.original ?? saved;
  const draft = session?.draft ?? saved;
  const incomplete = session?.draft.language.find((entry) => {
    const before = original.language.find(({ id }) => id === entry.id);
    return (
      (!before ||
        connectionRequestKey(before) !== connectionRequestKey(entry)) &&
      configurationIssue("text", entry)
    );
  });
  const issue = incomplete && configurationIssue("text", incomplete);
  const savedFeedback = !session && saveStatus === "saved";
  const saveFailed = session && !issue && saveStatus === "failed";
  const closeLabel = session
    ? "common.cancel"
    : modelSetup && !savedFeedback
      ? "settings.models.setupLater"
      : "common.close";

  function edit(update: (settings: SavedSettings) => SavedSettings) {
    const committed = getSettings();
    setSaveStatus((status) => (status === "failed" ? "idle" : status));
    setSession((current) => {
      const previous = current?.draft ?? committed;
      const next = update(previous);
      if (next === previous) return current;
      const original = current?.original ?? committed;
      return JSON.stringify(next) === JSON.stringify(original)
        ? null
        : { original, draft: next };
    });
  }

  function changeConnection(previous: Connection, next: Connection) {
    edit((settings) => {
      switch (next.provider) {
        case "language":
          if (!settings.language.some((entry) => entry === previous))
            return settings;
          return {
            ...settings,
            language: settings.language.map((entry) =>
              entry === previous ? next : entry,
            ),
          };
        case "gpt-image":
        case "seedream":
          if (settings.images[next.provider] !== previous) return settings;
          return {
            ...settings,
            images: { ...settings.images, [next.provider]: next },
          };
        case "aliyun-tts":
          return settings.speech === previous
            ? { ...settings, speech: next }
            : settings;
        case "aliyun-asr":
          return settings.transcription === previous
            ? { ...settings, transcription: next }
            : settings;
        case "tavily":
          return settings.search === previous
            ? { ...settings, search: next }
            : settings;
      }
    });
  }

  function save() {
    if (!session || issue) return;
    try {
      saveSettingsEdits(session.original, session.draft);
      setSession(null);
      setSaveStatus("saved");
      if (modelSetup) dismissModelSetup();
    } catch {
      setSaveStatus("failed");
    }
  }

  return (
    <form
      autoComplete="off"
      className="flex h-full min-h-0 min-w-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div
        key={category}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7",
          category === "text" && "scroll-pt-12",
        )}
      >
        <div className="mx-auto max-w-2xl">
          {category === "text" ? (
            <LanguageModelSettings
              draft={draft}
              savedModels={original.language}
              editedId={editedModelId}
              incompleteId={incomplete?.id}
              active={active}
              initialUse={initialUse}
              onEdit={edit}
              onEditModel={setEditedModelId}
              onChange={changeConnection}
            />
          ) : category === "image" ? (
            <ImageGenerationSettings
              draft={draft}
              active={active}
              onChange={changeConnection}
              onDefault={(defaultImage) =>
                edit((settings) => ({
                  ...settings,
                  selection: { ...settings.selection, defaultImage },
                }))
              }
            />
          ) : (
            <ToolConnectionSettings
              connection={draft[category]}
              draft={draft}
              active={active}
              onChange={changeConnection}
            />
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t border-border/70 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-end gap-2">
          <span
            role="status"
            className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            {savedFeedback && (
              <>
                <Check
                  className="size-3.5 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {t("settings.models.allChangesSaved")}
              </>
            )}
            {saveFailed && (
              <span className="text-destructive">
                {t("settings.models.saveFailed")}
              </span>
            )}
            {session &&
              !saveFailed &&
              (issue
                ? errorText(issue.error, locale)
                : t("settings.models.unsavedChanges"))}
          </span>
          <Button
            type="button"
            variant="outline"
            className="bg-card"
            onClick={onClose}
          >
            {t(closeLabel)}
          </Button>
          <Button
            type="submit"
            aria-disabled={!session || Boolean(issue)}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            {t("settings.models.saveSettings")}
          </Button>
        </div>
      </footer>
    </form>
  );
}
