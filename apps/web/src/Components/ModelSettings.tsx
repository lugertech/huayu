import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  useModelSettings,
  saveSettings,
  defaultSettings,
  connectionIssue,
  type Capability,
  type ModelSettings as Settings,
} from "@/ai/settings";
import { testConnection } from "@/ai/provider";
import { useToast } from "./common/ToastProvider";

export function ModelSettings({
  onClose,
  initialCapability = "text",
}: {
  onClose: () => void;
  initialCapability?: Capability;
}) {
  useLocale();
  const saved = useModelSettings();
  const [draft, setDraft] = useState<Settings>(() => structuredClone(saved));
  const [capability, setCapability] = useState<Capability>(initialCapability);
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    status: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const { showToast } = useToast();
  const connection = draft.connections[capability];
  const issue = connectionIssue(capability, connection);
  const purpose = {
    text: "settings.models.textPurpose",
    vision: "settings.models.visionPurpose",
    image: "settings.models.imagePurpose",
    speech: "settings.models.speechPurpose",
    transcription: "settings.models.transcriptionPurpose",
    search: "settings.models.searchPurpose",
  } as const;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  useEffect(() => () => request.current?.abort(), []);

  function resetTest() {
    request.current?.abort();
    request.current = null;
    setTesting(false);
    setResult(null);
  }
  function change(key: keyof typeof connection, value: string) {
    resetTest();
    setDraft((current) => ({
      ...current,
      connections: {
        ...current.connections,
        [capability]: { ...current.connections[capability], [key]: value },
      },
    }));
  }
  function save() {
    try {
      saveSettings(draft);
      resetTest();
      showToast({ title: t("settings.models.saved") });
      onClose();
    } catch {
      showToast({
        title: t("settings.models.saveFailed"),
        description: t("settings.storageUnavailable"),
        variant: "destructive",
      });
    }
  }
  async function test() {
    if (testing) {
      resetTest();
      return;
    }
    if (issue) {
      setResult({ status: "error", message: issue.message });
      document
        .getElementById(
          { baseUrl: "model-url", model: "model-name", apiKey: "model-key" }[
            issue.field
          ],
        )
        ?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setTesting(true);
    setResult(null);
    try {
      const value = await testConnection(
        capability,
        connection,
        controller.signal,
      );
      if (request.current === controller) setResult(value);
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted)
        setResult({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : t("settings.models.connectionFailed"),
        });
    } finally {
      if (request.current === controller) {
        request.current = null;
        setTesting(false);
      }
    }
  }
  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
        <h2 className="text-base font-medium">{t("settings.models.title")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("settings.models.optionalDescription")}
        </p>
        <p className="mt-2 mb-6 text-xs leading-5 text-muted-foreground">
          {t("settings.models.privacyDescription")}
        </p>
        <Tabs
          value={capability}
          onValueChange={(value) => {
            resetTest();
            setCapability(value as Capability);
            setVisible(false);
          }}
        >
          <TabsList className="grid w-full grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-6">
            {CAPABILITIES.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-auto min-h-10 whitespace-normal px-2 py-2 text-xs leading-4"
                aria-label={`${CAPABILITY_LABELS[value]} · ${t(connectionIssue(value, draft.connections[value]) ? "settings.models.notConfigured" : "settings.models.detailsComplete")}`}
              >
                {CAPABILITY_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={capability} className="space-y-5 pt-4">
            <div className="space-y-1.5 text-xs leading-5 text-muted-foreground">
              <p className="font-medium text-foreground" role="status">
                {t(
                  issue
                    ? "settings.models.notConfigured"
                    : result
                      ? "settings.models.detailsComplete"
                      : "settings.models.readyToTest",
                )}
              </p>
              <p>{t(purpose[capability])}</p>
            </div>
            {capability !== "text" && capability !== "search" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("settings.models.reuseServiceQuestion")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetTest();
                    setDraft((current) => ({
                      ...current,
                      connections: {
                        ...current.connections,
                        [capability]: {
                          ...current.connections[capability],
                          baseUrl: current.connections.text.baseUrl,
                          apiKey: current.connections.text.apiKey,
                        },
                      },
                    }));
                  }}
                >
                  <Link2 /> {t("settings.models.reuseTextService")}
                </Button>
              </div>
            )}
            {capability === "search" && (
              <div className="space-y-2">
                <Label htmlFor="search-provider">
                  {t("settings.models.searchProvider")}
                </Label>
                <NativeSelect
                  id="search-provider"
                  value={connection.provider}
                  onChange={(event) => {
                    change("provider", event.target.value);
                    change(
                      "baseUrl",
                      event.target.value === "brave"
                        ? "https://api.search.brave.com"
                        : "https://api.tavily.com",
                    );
                  }}
                >
                  <NativeSelectOption value="tavily">Tavily</NativeSelectOption>
                  <NativeSelectOption value="brave">
                    Brave Search
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="model-url">
                {t("settings.models.serviceUrl")}
              </Label>
              <Input
                id="model-url"
                aria-invalid={
                  result?.status === "error" && issue?.field === "baseUrl"
                }
                aria-describedby={
                  result?.status === "error" && issue?.field === "baseUrl"
                    ? "model-url-issue"
                    : undefined
                }
                value={connection.baseUrl}
                onChange={(event) => change("baseUrl", event.target.value)}
                placeholder="http://localhost:11434/v1"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {capability === "search"
                  ? t("settings.models.searchUrlHint")
                  : t("settings.models.serviceUrlHint")}
              </p>
              {result?.status === "error" && issue?.field === "baseUrl" && (
                <p
                  id="model-url-issue"
                  role="alert"
                  className="text-xs leading-5 text-destructive"
                >
                  {result.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-key">{t("settings.models.apiKey")}</Label>
              <div className="flex gap-2">
                <Input
                  id="model-key"
                  aria-invalid={
                    result?.status === "error" && issue?.field === "apiKey"
                  }
                  aria-describedby={
                    result?.status === "error" && issue?.field === "apiKey"
                      ? "model-key-issue"
                      : undefined
                  }
                  type={visible ? "text" : "password"}
                  value={connection.apiKey}
                  onChange={(event) => change("apiKey", event.target.value)}
                  placeholder={t("settings.models.apiKeyHint")}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={
                    visible
                      ? t("settings.models.hideKey")
                      : t("settings.models.showKey")
                  }
                  onClick={() => setVisible((value) => !value)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {result?.status === "error" && issue?.field === "apiKey" && (
                <p
                  id="model-key-issue"
                  role="alert"
                  className="text-xs leading-5 text-destructive"
                >
                  {result.message}
                </p>
              )}
            </div>
            {capability !== "search" && (
              <div className="space-y-2">
                <Label htmlFor="model-name">
                  {t("settings.models.modelName")}
                </Label>
                <Input
                  id="model-name"
                  aria-invalid={
                    result?.status === "error" && issue?.field === "model"
                  }
                  aria-describedby={
                    result?.status === "error" && issue?.field === "model"
                      ? "model-name-issue"
                      : undefined
                  }
                  value={connection.model}
                  onChange={(event) => change("model", event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {result?.status === "error" && issue?.field === "model" && (
                  <p
                    id="model-name-issue"
                    role="alert"
                    className="text-xs leading-5 text-destructive"
                  >
                    {result.message}
                  </p>
                )}
              </div>
            )}
            {capability === "speech" && (
              <div className="space-y-2">
                <Label htmlFor="model-voice">
                  {t("settings.models.voice")}
                </Label>
                <Input
                  id="model-voice"
                  value={connection.voice}
                  onChange={(event) => change("voice", event.target.value)}
                  placeholder="alloy"
                />
              </div>
            )}
            {capability === "transcription" && (
              <div className="space-y-2">
                <Label htmlFor="transcription-format">
                  {t("settings.models.transcriptionOutput")}
                </Label>
                <NativeSelect
                  id="transcription-format"
                  value={connection.transcriptionFormat || "verbose_json"}
                  onChange={(event) =>
                    change("transcriptionFormat", event.target.value)
                  }
                >
                  <NativeSelectOption value="verbose_json">
                    {t("settings.models.textWithTimestamps")}
                  </NativeSelectOption>
                  <NativeSelectOption value="json">
                    {t("settings.models.textOnly")}
                  </NativeSelectOption>
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  {t("settings.models.transcriptionFormatHint")}
                </p>
              </div>
            )}
            <div className="space-y-3">
              <Button variant="outline" size="sm" onClick={test}>
                {testing && <Loader2 className="animate-spin" />}
                {testing
                  ? t("settings.models.cancelTest")
                  : t("settings.models.testConnection")}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  capability === "search"
                    ? "settings.models.testSearchScope"
                    : capability === "text" || capability === "vision"
                      ? "settings.models.testTextScope"
                      : "settings.models.testListScope",
                )}
              </p>
              {result && !(result.status === "error" && issue) && (
                <p
                  role="status"
                  className={`flex items-start gap-2 text-xs leading-5 ${result.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {result.status === "success" ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  )}
                  {result.message}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="shrink-0 border-t bg-muted/30 p-4">
        <div className="mb-3 flex min-h-4 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span role="status">
            {dirty
              ? t("settings.models.unsavedChanges")
              : t("settings.models.allChangesSaved")}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            className="mr-auto text-muted-foreground"
            onClick={() => {
              resetTest();
              setDraft(defaultSettings());
              setVisible(false);
            }}
          >
            <RotateCcw />
            {t("settings.models.clearConnections")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!dirty}>
            <Check />
            {t("settings.models.saveSettings")}
          </Button>
        </div>
      </div>
    </form>
  );
}
