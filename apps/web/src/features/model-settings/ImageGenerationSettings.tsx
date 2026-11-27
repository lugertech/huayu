import { useState } from "react";
import { ChevronDown, ChevronRight, Image, Sparkles } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  defaultImageConnection,
  IMAGE_PROVIDERS,
  modelCheckStatus,
  updateConnection,
  type ImageConnection,
  type ImageProvider,
  type ModelSettings,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectionChecks } from "./ConnectionChecks";
import {
  ConnectionKeyField,
  ConnectionStatus,
  ConnectionSwitch,
  ConnectionTextField,
} from "./ConnectionFields";

const services = {
  "gpt-image": { name: "GPT Image", Icon: Image },
  seedream: { name: "Seedream", Icon: Sparkles },
};

export function ImageGenerationSettings({
  draft,
  active,
  onDefault,
  onChange,
}: {
  draft: ModelSettings;
  active: boolean;
  onDefault: (provider: ImageProvider) => void;
  onChange: (previous: ImageConnection, next: ImageConnection) => void;
}) {
  const { t } = useTranslations();
  const defaultProvider = defaultImageConnection(draft)?.provider;
  const [expanded, setExpanded] = useState<ImageProvider | null>(
    defaultProvider ?? IMAGE_PROVIDERS[0],
  );

  return (
    <div className="grid gap-5">
      <h2 className="flex min-h-12 items-center border-b border-border/70 pb-3 text-lg/6 font-semibold">
        {t("models.imageGeneration")}
      </h2>
      <div className="divide-y divide-border/70">
        {IMAGE_PROVIDERS.map((provider) => {
          const connection = draft.images[provider];
          const { name, Icon } = services[provider];
          const status = modelCheckStatus("image", connection);
          const open = expanded === provider;

          return (
            <section key={provider} className="space-y-4 py-4 first:pt-0">
              <div
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border border-border/80 pr-3",
                  open && "bg-muted/45 dark:bg-muted/65",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-11 min-w-0 flex-1 flex-wrap justify-start gap-x-2.5 gap-y-1 border-0 py-1.5 font-normal"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : provider)}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      provider === "seedream" &&
                        "text-blue-600 dark:text-blue-400",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{name}</span>
                  {defaultProvider === provider && (
                    <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("settings.models.default")}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <ConnectionStatus status={status} />
                    {open ? (
                      <ChevronDown
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        {status === "unconfigured" && (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {t("settings.models.configure")}
                          </span>
                        )}
                        <ChevronRight
                          className="size-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </span>
                </Button>
                <ConnectionSwitch
                  name={name}
                  checked={connection.enabled}
                  onChange={(enabled) =>
                    onChange(
                      connection,
                      updateConnection(connection, { enabled }),
                    )
                  }
                />
              </div>
              {open && (
                <div className="grid gap-4 px-0.5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <ConnectionTextField
                      label={t(
                        provider === "seedream"
                          ? "settings.models.modelOrEndpointId"
                          : "settings.models.modelId",
                      )}
                      value={connection.model}
                      onChange={(model) =>
                        onChange(
                          connection,
                          updateConnection(connection, { model }),
                        )
                      }
                    />
                    <ConnectionKeyField
                      value={connection.apiKey}
                      onChange={(apiKey) =>
                        onChange(
                          connection,
                          updateConnection(connection, { apiKey }),
                        )
                      }
                    />
                  </div>
                  <ConnectionChecks
                    connection={connection}
                    operations={["image", "image-edit"]}
                    active={active}
                    onChange={onChange}
                    extra={(operation) =>
                      operation === "image" &&
                      defaultProvider !== provider &&
                      status !== "unconfigured" &&
                      status !== "disabled" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => onDefault(provider)}
                        >
                          {t("settings.models.setDefault")}
                        </Button>
                      ) : null
                    }
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
