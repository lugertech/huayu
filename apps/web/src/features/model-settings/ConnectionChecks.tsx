import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Globe,
  Image,
  ImagePlus,
  LoaderCircle,
  Mic,
  Type,
} from "lucide-react";
import { useTranslations, type MessageKey } from "@/i18n";
import {
  LocalizedError,
  errorText,
  translatedErrorMessage,
} from "@/i18n/errors";
import {
  configurationIssue,
  modelCheckStatus,
  type Capability,
  type CheckResult,
  type Connection,
  type ModelCheck,
} from "@/ai/settings";
import { testModelOperation } from "@/ai/provider";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "./ConnectionFields";

const checks = {
  text: {
    label: "settings.models.text",
    action: "settings.models.testText",
    Icon: Type,
  },
  vision: {
    label: "models.imageUnderstanding",
    action: "settings.models.testImageUnderstanding",
    Icon: Image,
  },
  image: {
    label: "models.imageGeneration",
    action: "settings.models.testImageGeneration",
    Icon: Image,
  },
  "image-edit": {
    label: "settings.models.referenceImage",
    action: "settings.models.testReferenceImage",
    Icon: ImagePlus,
  },
  speech: {
    label: "models.textToSpeech",
    action: "settings.models.previewVoice",
    Icon: AudioLines,
  },
  transcription: {
    label: "api.transcription",
    action: "settings.models.testTranscription",
    Icon: Mic,
  },
  search: {
    label: "models.webSearch",
    action: "settings.models.testSearch",
    Icon: Globe,
  },
} satisfies Record<
  ModelCheck,
  { label: MessageKey; action: MessageKey; Icon: typeof Type }
>;

type CheckView<C extends Connection> = {
  target: C;
  operation: ModelCheck;
} & (
  | { state: "testing"; request: AbortController }
  | { state: "inputError"; error: LocalizedError }
  | { state: "preview"; blob: Blob }
);

export function ConnectionChecks<C extends Connection>({
  connection,
  operations,
  active,
  onChange,
  extra,
}: {
  connection: C;
  operations: readonly ModelCheck[];
  active: boolean;
  onChange: (previous: C, next: C) => void;
  extra?: (operation: ModelCheck) => ReactNode;
}) {
  const { locale, t } = useTranslations();
  const current = useRef<AbortController | null>(null);
  const [view, setView] = useState<CheckView<C> | null>(null);
  const result =
    view?.target === connection &&
    (view.state !== "testing" || !view.request.signal.aborted)
      ? view
      : null;
  const testing = result?.state === "testing";

  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [connection, active],
  );

  async function check(operation: ModelCheck) {
    if (current.current) {
      current.current.abort();
      current.current = null;
      setView(null);
      return;
    }

    const capability: Capability =
      operation === "image-edit" ? "image" : operation;
    const issue = configurationIssue(capability, connection);
    if (issue) {
      setView({
        operation,
        target: connection,
        state: "inputError",
        error: issue.error,
      });
      return;
    }

    const request = new AbortController();
    current.current = request;
    setView({ operation, target: connection, state: "testing", request });

    function complete(outcome: CheckResult, preview?: Blob) {
      if (request.signal.aborted || current.current !== request) return;
      const next = {
        ...connection,
        checks: { ...connection.checks, [operation]: outcome },
      };

      onChange(connection, next);
      setView(
        preview
          ? { operation, target: next, state: "preview", blob: preview }
          : null,
      );
      current.current = null;
    }

    try {
      const { preview, ...outcome } = await testModelOperation(
        operation,
        connection,
        request.signal,
        locale,
      );
      complete(outcome, preview);
    } catch (error) {
      complete({
        status: "failed",
        error: (error instanceof LocalizedError && error.translation) || {
          key: "settings.models.connectionFailed",
        },
      });
    }
  }

  return (
    <div className="divide-y divide-border/70 border-t border-border/70">
      {operations.map((operation) => {
        const { Icon, label, action } = checks[operation];
        const currentCheck = result?.operation === operation ? result : null;
        const record = connection.checks[operation];
        const checking = currentCheck?.state === "testing";
        const status = checking
          ? "testing"
          : modelCheckStatus(operation, { ...connection, enabled: true });
        const failure =
          currentCheck?.state === "inputError"
            ? errorText(currentCheck.error, locale)
            : record?.status === "failed"
              ? translatedErrorMessage(record.error, locale)
              : undefined;

        return (
          <div key={operation} className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex min-w-24 items-center gap-2.5 md:w-1/4">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(label)}
              </div>
              <div className="mr-auto min-w-20" role="status">
                <ConnectionStatus status={status} />
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {extra?.(operation)}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border/75 bg-card"
                  disabled={testing && !checking}
                  onClick={() => void check(operation)}
                >
                  {checking && (
                    <LoaderCircle
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {t(checking ? "settings.models.cancelTest" : action)}
                </Button>
              </div>
            </div>
            {failure && (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {failure}
              </p>
            )}
            {currentCheck?.state === "preview" && (
              <VoicePreview blob={currentCheck.blob} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function VoicePreview({ blob }: { blob: Blob }) {
  const { t } = useTranslations();
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return (
    <audio
      ref={audio}
      controls
      preload="metadata"
      aria-label={t("settings.models.previewVoice")}
      className="mt-2 h-9 w-full max-w-sm"
    />
  );
}
