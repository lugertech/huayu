import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  configurationIssue,
  connectionFor,
  newLanguageConnection,
  updateConnection,
  type LanguageConnection,
  type ModelProtocol,
  type ModelSettings,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ConnectionChecks } from "./ConnectionChecks";
import { ModelCatalogPicker } from "./ModelCatalogPicker";
import {
  applyModelCatalog,
  catalogConnections,
} from "./language-model-catalog";
import {
  ConnectionKeyField,
  ConnectionSwitch,
  ConnectionTextField,
} from "./ConnectionFields";

const protocols: Record<ModelProtocol, string> = {
  "chat-completions": "Chat Completions",
  responses: "Responses",
};

const protocolOptions = ["chat-completions", "responses"] as const;

export function LanguageModelSettings({
  draft,
  savedModels,
  editedId,
  incompleteId,
  active,
  initialUse,
  onEdit,
  onEditModel,
  onChange,
}: {
  draft: ModelSettings;
  savedModels: readonly LanguageConnection[];
  editedId: string | null;
  incompleteId?: string;
  active: boolean;
  initialUse: "text" | "vision";
  onEdit: (edit: (settings: ModelSettings) => ModelSettings) => void;
  onEditModel: (id: string | null) => void;
  onChange: (previous: LanguageConnection, next: LanguageConnection) => void;
}) {
  const { t } = useTranslations();
  const protocolId = useId();
  const current =
    draft.language.find((entry) => entry.id === editedId) ??
    draft.language.find((entry) => entry.id === incompleteId) ??
    connectionFor(initialUse, draft) ??
    draft.language[0];
  const isNew = current && !savedModels.some(({ id }) => id === current.id);

  function addModel() {
    const model = newLanguageConnection();
    onEdit((settings) => ({
      ...settings,
      language: [...settings.language, model],
    }));
    onEditModel(model.id);
  }

  function removeModel(id: string) {
    onEdit((settings) => ({
      ...settings,
      language: settings.language.filter((entry) => entry.id !== id),
    }));
  }

  return (
    <div className="grid gap-5">
      <div className="sticky top-0 z-10 flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-card pb-3">
        <h2 className="text-lg/6 font-semibold">
          {t(isNew ? "settings.models.addModel" : "settings.models.language")}
        </h2>
        {isNew ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => removeModel(current.id)}
          >
            {t("settings.models.cancelAddModel")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="bg-card"
            disabled={Boolean(incompleteId)}
            onClick={addModel}
          >
            <Plus />
            {t("settings.models.addModel")}
          </Button>
        )}
      </div>
      {current ? (
        <div className="grid gap-5" key={current.id}>
          {draft.language.length > 1 && (
            <NativeSelect
              className="w-full [&>select]:h-9 [&>select]:bg-muted/45"
              aria-label={t("settings.models.selectModel")}
              value={current.id}
              onChange={(event) => onEditModel(event.currentTarget.value)}
            >
              {draft.language.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.name.trim() ||
                    entry.model.trim() ||
                    t("settings.models.untitledModel")}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}

          <div className="grid gap-4">
            <ConnectionTextField
              label={t("settings.models.displayName")}
              value={current.name}
              onChange={(name) =>
                onChange(current, updateConnection(current, { name }))
              }
            />
            <ConnectionTextField
              label={t("settings.models.serviceUrl")}
              value={current.baseUrl}
              placeholder="https://gateway.example/v1"
              onChange={(baseUrl) =>
                onChange(current, updateConnection(current, { baseUrl }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={protocolId}>
                  {t("settings.models.protocol")}
                </Label>
                <NativeSelect
                  id={protocolId}
                  className="w-full [&>select]:h-9 [&>select]:border-border/80 [&>select]:bg-muted/45 dark:[&>select]:bg-muted/70"
                  value={current.protocol}
                  onChange={(event) => {
                    const protocol =
                      event.currentTarget.value === "responses"
                        ? "responses"
                        : "chat-completions";
                    if (protocol !== current.protocol)
                      onChange(
                        current,
                        updateConnection(current, { protocol }),
                      );
                  }}
                >
                  {protocolOptions.map((protocol) => (
                    <NativeSelectOption key={protocol} value={protocol}>
                      {protocols[protocol]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <ConnectionKeyField
                value={current.apiKey}
                onChange={(apiKey) =>
                  onChange(current, updateConnection(current, { apiKey }))
                }
              />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-border/70 pt-4">
            <ConnectionTextField
              label={t("settings.models.modelId")}
              value={current.model}
              onChange={(model) =>
                onChange(current, updateConnection(current, { model }))
              }
            />
            {active && (
              <ModelCatalogPicker
                connection={current}
                configuredModels={
                  new Set(
                    catalogConnections(draft.language, current).map(
                      ({ model }) => model.trim(),
                    ),
                  )
                }
                onApply={(models, selected) => {
                  const next = applyModelCatalog(
                    draft.language,
                    current,
                    models,
                    selected,
                  );
                  onEdit((settings) =>
                    settings.language === draft.language
                      ? { ...settings, language: next.language }
                      : settings,
                  );
                  onEditModel(next.editedId);
                }}
              />
            )}
          </div>

          {!configurationIssue("text", current) && (
            <details className="rounded-lg border border-border/70">
              <summary className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium">
                {t("settings.models.testConnection")}
              </summary>
              <div className="px-3">
                <ConnectionChecks
                  connection={current}
                  operations={["text", "vision"]}
                  active={active}
                  onChange={onChange}
                  extra={(operation) => {
                    if (operation !== "text" && operation !== "vision")
                      return null;
                    const selected = connectionFor(operation, draft);
                    if (
                      operation === "vision" &&
                      current.checks.vision?.status !== "verified"
                    )
                      return null;
                    if (selected?.id === current.id) {
                      return draft.language.length > 1 ? (
                        <span className="px-2 text-xs text-muted-foreground">
                          {t("settings.models.default")}
                        </span>
                      ) : null;
                    }
                    if (!current.enabled) return null;
                    const capability = t(
                      operation === "text"
                        ? "settings.models.text"
                        : "models.imageUnderstanding",
                    );
                    return (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        aria-label={t("settings.models.setDefaultFor", {
                          capability,
                        })}
                        onClick={() =>
                          onEdit((settings) => ({
                            ...settings,
                            selection: {
                              ...settings.selection,
                              [operation]: current.id,
                            },
                          }))
                        }
                      >
                        {t("settings.models.setDefault")}
                      </Button>
                    );
                  }}
                />
              </div>
            </details>
          )}

          {!isNew && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <ConnectionSwitch
                  name={
                    current.name.trim() ||
                    current.model.trim() ||
                    t("settings.models.untitledModel")
                  }
                  checked={current.enabled}
                  onChange={(enabled) =>
                    onChange(current, updateConnection(current, { enabled }))
                  }
                />
                {t("settings.models.enableModel")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeModel(current.id)}
              >
                <Trash2 />
                {t("settings.models.removeModel")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-sm/5 text-muted-foreground">
          {t("settings.models.noModels")}
        </div>
      )}
    </div>
  );
}
