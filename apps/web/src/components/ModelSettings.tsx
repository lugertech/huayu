import { t, useLocale } from "@/i18n";
import {
  errorText,
  LocalizedError,
  translatedErrorMessage,
  type ErrorTranslation,
} from "@/i18n/errors";
import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  OPENAI_API_BASE_URL,
  TAVILY_API_ORIGIN,
  useModelSettings,
  changedConnectionFields,
  saveConnectionEdits,
  defaultSettings,
  connectionIssue,
  type Capability,
  type Connection,
  type ConnectionEdits,
} from "@/ai/settings";
import { testConnection } from "@/ai/provider";
import { useToast } from "./common/ToastProvider";

export function ModelSettings({
  onClose,
  initialCapability = "text",
  modelSetup = false,
}: {
  onClose: () => void;
  initialCapability?: Capability;
  modelSetup?: boolean;
}) {
  useLocale();
  const saved = useModelSettings();
  const [edits, setEdits] = useState<ConnectionEdits>({});
  function editedConnection(value: Capability): Connection {
    return { ...saved.connections[value], ...edits[value] };
  }
  const [capability, setCapability] = useState<Capability>(initialCapability);
  const connection = editedConnection(capability);
  const testTarget = JSON.stringify([capability, connection]);
  const [visible, setVisible] = useState(false);
  const [testState, setTestState] = useState<
    | { status: "idle" }
    | { status: "testing"; target: string }
    | {
        status: "complete";
        target: string;
        result: {
          status: "success" | "warning" | "error";
          message: Error | ErrorTranslation;
        };
      }
  >({ status: "idle" });
  const testing =
    testState.status === "testing" && testState.target === testTarget;
  const result =
    testState.status === "complete" && testState.target === testTarget
      ? testState.result
      : null;
  const resultMessage = result
    ? result.message instanceof Error
      ? errorText(result.message)
      : translatedErrorMessage(result.message)
    : "";
  const request = useRef<AbortController | null>(null);
  const { showToast } = useToast();
  const issue = connectionIssue(capability, connection);
  const settingUpOpenAI =
    modelSetup &&
    capability === "text" &&
    connection.baseUrl.trim().replace(/\/+$/, "") === OPENAI_API_BASE_URL;
  const purpose = {
    text: "settings.models.textPurpose",
    vision: "settings.models.visionPurpose",
    image: "settings.models.imagePurpose",
    speech: "settings.models.speechPurpose",
    transcription: "settings.models.transcriptionPurpose",
    search: "settings.models.searchPurpose",
  } as const;
  const dirty = CAPABILITIES.some(
    (value) =>
      JSON.stringify(saved.connections[value]) !==
      JSON.stringify(editedConnection(value)),
  );

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [testTarget],
  );

  function resetTest() {
    request.current?.abort();
    request.current = null;
    setTestState({ status: "idle" });
  }
  function change(fields: Partial<Connection>) {
    resetTest();
    setEdits((current) => ({
      ...current,
      [capability]: changedConnectionFields(saved.connections[capability], {
        ...saved.connections[capability],
        ...current[capability],
        ...fields,
      }),
    }));
  }
  function save() {
    try {
      saveConnectionEdits(edits);
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
    if (request.current) {
      resetTest();
      return;
    }
    if (issue) {
      setTestState({
        status: "complete",
        target: testTarget,
        result: { status: "error", message: issue.error },
      });
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
    setTestState({ status: "testing", target: testTarget });
    try {
      const value = await testConnection(
        capability,
        connection,
        controller.signal,
      );
      if (request.current === controller)
        setTestState({ status: "complete", target: testTarget, result: value });
    } catch (error) {
      if (request.current === controller && !controller.signal.aborted)
        setTestState({
          status: "complete",
          target: testTarget,
          result: {
            status: "error",
            message:
              error instanceof Error
                ? error
                : new LocalizedError({
                    key: "settings.models.connectionFailed",
                  }),
          },
        });
    } finally {
      if (request.current === controller) {
        request.current = null;
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
          {t(
            modelSetup
              ? "settings.models.setupDescription"
              : "settings.models.optionalDescription",
          )}
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
                aria-label={`${CAPABILITY_LABELS[value]} · ${t(connectionIssue(value, editedConnection(value)) ? "settings.models.notConfigured" : "settings.models.detailsComplete")}`}
              >
                {CAPABILITY_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={capability} className="space-y-5 pt-4">
            {!settingUpOpenAI && (
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
            )}
            {capability !== "text" && capability !== "search" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("settings.models.reuseServiceQuestion")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = editedConnection("text");
                    change({ baseUrl: text.baseUrl, apiKey: text.apiKey });
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
                    const provider =
                      event.target.value === "brave" ? "brave" : "tavily";
                    change({
                      provider,
                      baseUrl:
                        provider === "brave"
                          ? "https://api.search.brave.com"
                          : TAVILY_API_ORIGIN,
                      apiKey: "",
                    });
                    setVisible(false);
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
                onChange={(event) => change({ baseUrl: event.target.value })}
                placeholder="http://localhost:11434/v1"
                autoComplete="off"
                spellCheck={false}
              />
              {!settingUpOpenAI && (
                <p className="text-xs text-muted-foreground">
                  {capability === "search"
                    ? t("settings.models.searchUrlHint")
                    : t("settings.models.serviceUrlHint")}
                </p>
              )}
              {result?.status === "error" && issue?.field === "baseUrl" && (
                <p
                  id="model-url-issue"
                  role="alert"
                  className="text-xs leading-5 text-destructive"
                >
                  {resultMessage}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="model-key">{t("settings.models.apiKey")}</Label>
                {settingUpOpenAI && (
                  <a
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.models.getOpenAIKey")}
                  </a>
                )}
              </div>
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
                  onChange={(event) => change({ apiKey: event.target.value })}
                  placeholder={
                    settingUpOpenAI
                      ? undefined
                      : t("settings.models.apiKeyHint")
                  }
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
                  {resultMessage}
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
                  onChange={(event) => change({ model: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                {result?.status === "error" && issue?.field === "model" && (
                  <p
                    id="model-name-issue"
                    role="alert"
                    className="text-xs leading-5 text-destructive"
                  >
                    {resultMessage}
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
                  onChange={(event) => change({ voice: event.target.value })}
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
                    change({
                      transcriptionFormat:
                        event.target.value === "json" ? "json" : "verbose_json",
                    })
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
                  {resultMessage}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="shrink-0 border-t bg-muted/30 p-4">
        {(dirty || !modelSetup) && (
          <div className="mb-3 flex min-h-4 items-center justify-between gap-3 text-xs text-muted-foreground">
            <span role="status">
              {dirty
                ? t("settings.models.unsavedChanges")
                : t("settings.models.allChangesSaved")}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!modelSetup && (
            <Button
              variant="ghost"
              className="mr-auto text-muted-foreground"
              onClick={() => {
                resetTest();
                const defaults = defaultSettings().connections;
                setEdits(
                  Object.fromEntries(
                    CAPABILITIES.map((value) => [
                      value,
                      changedConnectionFields(
                        saved.connections[value],
                        defaults[value],
                      ),
                    ]),
                  ),
                );
                setVisible(false);
              }}
            >
              <RotateCcw />
              {t("settings.models.clearConnections")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t(modelSetup ? "settings.models.setupLater" : "common.cancel")}
          </Button>
          <Button type="submit" disabled={!dirty}>
            {t("settings.models.saveSettings")}
          </Button>
        </div>
      </div>
    </form>
  );
}
