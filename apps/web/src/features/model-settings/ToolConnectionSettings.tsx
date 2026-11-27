import { useId } from "react";
import { Cloud, Globe, Link2 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  CAPABILITY_MESSAGE_KEYS,
  updateConnection,
  type ModelSettings,
  type SearchConnection,
  type SpeechConnection,
  type TranscriptionConnection,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ConnectionChecks } from "./ConnectionChecks";
import {
  ConnectionKeyField,
  ConnectionSwitch,
  ConnectionTextField,
} from "./ConnectionFields";

type ToolConnection =
  | SpeechConnection
  | TranscriptionConnection
  | SearchConnection;

const operations = {
  "aliyun-tts": "speech",
  "aliyun-asr": "transcription",
  tavily: "search",
} as const;

export function ToolConnectionSettings({
  connection,
  draft,
  active,
  onChange,
}: {
  connection: ToolConnection;
  draft: ModelSettings;
  active: boolean;
  onChange: (previous: ToolConnection, next: ToolConnection) => void;
}) {
  const { t } = useTranslations();
  const regionId = useId();
  const operation = operations[connection.provider];
  const name = t(CAPABILITY_MESSAGE_KEYS[operation]);
  const isSearch = connection.provider === "tavily";
  const source =
    connection.provider === "aliyun-tts" ? draft.transcription : draft.speech;
  const canReuse =
    !isSearch &&
    source.apiKey.trim() &&
    source.workspaceId.trim() &&
    (!connection.workspaceId.trim() ||
      (connection.workspaceId.trim() === source.workspaceId.trim() &&
        connection.region === source.region)) &&
    (!connection.apiKey.trim() || connection.apiKey !== source.apiKey);

  return (
    <div className="grid gap-5">
      <h2 className="flex min-h-12 items-center border-b border-border/70 pb-3 text-lg/6 font-semibold">
        {name}
      </h2>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/45 px-3 dark:bg-muted/65">
        <span className="flex min-w-0 items-center gap-2.5">
          {isSearch ? (
            <Globe className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Cloud
              className="size-4 shrink-0 text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
          )}
          {isSearch ? "Tavily" : t("settings.models.aliyun")}
        </span>
        <ConnectionSwitch
          name={name}
          checked={connection.enabled}
          onChange={(enabled) =>
            onChange(connection, updateConnection(connection, { enabled }))
          }
        />
      </div>

      {!isSearch && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={regionId}>{t("settings.models.region")}</Label>
            <NativeSelect
              id={regionId}
              className="w-full [&>select]:h-9 [&>select]:border-border/80 [&>select]:bg-muted/45 dark:[&>select]:bg-muted/70"
              value={connection.region}
              onChange={(event) => {
                const region = event.currentTarget.value;
                if (region === "cn-beijing" || region === "ap-southeast-1")
                  onChange(
                    connection,
                    updateConnection(connection, { region }),
                  );
              }}
            >
              <NativeSelectOption value="cn-beijing">
                {t("settings.models.beijing")}
              </NativeSelectOption>
              <NativeSelectOption value="ap-southeast-1">
                {t("settings.models.singapore")}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <ConnectionTextField
            label={t("settings.models.workspaceId")}
            value={connection.workspaceId}
            onChange={(workspaceId) =>
              onChange(
                connection,
                updateConnection(connection, { workspaceId }),
              )
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ConnectionKeyField
          value={connection.apiKey}
          onChange={(apiKey) =>
            onChange(connection, updateConnection(connection, { apiKey }))
          }
        />
        {connection.provider === "aliyun-tts" && (
          <ConnectionTextField
            label={t("settings.models.voice")}
            value={connection.voice}
            onChange={(voice) =>
              onChange(connection, updateConnection(connection, { voice }))
            }
          />
        )}
      </div>
      {canReuse && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-fit text-muted-foreground"
          onClick={() =>
            onChange(
              connection,
              updateConnection(connection, {
                region: source.region,
                workspaceId: source.workspaceId,
                apiKey: source.apiKey,
              }),
            )
          }
        >
          <Link2 />
          {t(
            connection.provider === "aliyun-tts"
              ? "settings.models.useTranscriptionConnection"
              : "settings.models.useSpeechConnection",
          )}
        </Button>
      )}
      <ConnectionChecks
        connection={connection}
        operations={[operation]}
        active={active}
        onChange={onChange}
      />
    </div>
  );
}
