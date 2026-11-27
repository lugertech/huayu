import { useRef, useState } from "react";
import {
  readLanguagePreference,
  setLanguage,
  useLanguagePreference,
  useTranslations,
} from "@/i18n";
import {
  AudioLines,
  Box,
  Globe,
  Image,
  Mic,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import {
  CAPABILITY_MESSAGE_KEYS,
  IMAGE_PROVIDERS,
  modelCheckStatus,
  type Capability,
} from "@/ai/model-config";
import {
  connectionFor,
  defaultImageConnection,
  useModelSettings,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useTheme } from "@/lib/theme";
import { ConnectionStatus } from "@/features/model-settings/ConnectionFields";
import { ModelSettings } from "@/features/model-settings/ModelSettings";

const modelSections = [
  { key: "text", label: "settings.models.language", Icon: Box },
  { key: "image", label: CAPABILITY_MESSAGE_KEYS.image, Icon: Image },
  { key: "speech", label: CAPABILITY_MESSAGE_KEYS.speech, Icon: AudioLines },
  {
    key: "transcription",
    label: CAPABILITY_MESSAGE_KEYS.transcription,
    Icon: Mic,
  },
  { key: "search", label: CAPABILITY_MESSAGE_KEYS.search, Icon: Globe },
] as const;

type SettingsSection = "general" | (typeof modelSections)[number]["key"];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "general" | "models";
  initialCapability?: Capability;
  modelSetup?: boolean;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
  initialCapability = "text",
  modelSetup = false,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SettingsWorkspace
          key={`${initialTab}-${initialCapability}`}
          initialTab={initialTab}
          initialCapability={initialCapability}
          modelSetup={modelSetup}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function SettingsWorkspace({
  initialTab,
  initialCapability,
  modelSetup,
  onClose,
}: {
  initialTab: "general" | "models";
  initialCapability: Capability;
  modelSetup: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const title = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState({
    tab: initialTab,
    category: initialCapability === "vision" ? "text" : initialCapability,
  });
  const general = view.tab === "general";

  return (
    <DialogContent
      initialFocus={title}
      className="flex h-[calc(100dvh-1rem)] max-h-[44rem] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 text-card-foreground shadow-xl sm:h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-5xl"
    >
      <header className="flex h-12 shrink-0 items-center border-b border-border/70 pr-14 pl-4 md:pl-5">
        <DialogTitle
          ref={title}
          tabIndex={-1}
          className="text-sm font-semibold outline-none"
        >
          {t("settings.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("settings.description")}
        </DialogDescription>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SettingsNavigation
          section={general ? "general" : view.category}
          onSelect={(section) =>
            setView((current) =>
              section === "general"
                ? { ...current, tab: "general" }
                : { tab: "models", category: section },
            )
          }
        />
        <div className="min-h-0 min-w-0 flex-1">
          {general && (
            <div className="h-full overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7">
              <GeneralSettings />
            </div>
          )}
          <div hidden={general} className="h-full">
            <ModelSettings
              category={view.category}
              active={!general}
              initialUse={initialCapability === "vision" ? "vision" : "text"}
              modelSetup={modelSetup}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

function SettingsNavigation({
  section,
  onSelect,
}: {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  const { t } = useTranslations();
  const saved = useModelSettings();
  const savedConnections = {
    text:
      connectionFor("text", saved) ??
      saved.language.find((entry) => entry.id === saved.selection.text) ??
      saved.language.find(
        (entry) => modelCheckStatus("text", entry) !== "unconfigured",
      ),
    image:
      defaultImageConnection(saved) ??
      IMAGE_PROVIDERS.map((provider) => saved.images[provider]).find(
        (entry) => modelCheckStatus("image", entry) !== "unconfigured",
      ),
    speech: saved.speech,
    transcription: saved.transcription,
    search: saved.search,
  };
  const navigationItem =
    "h-auto min-h-9 w-full min-w-0 justify-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm/5 font-normal whitespace-normal aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground";

  return (
    <>
      <nav
        aria-label={t("settings.categoriesLabel")}
        className="hidden min-h-0 w-56 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border/70 bg-muted/35 p-3 md:flex lg:w-64"
      >
        <Button
          type="button"
          variant="ghost"
          className={navigationItem}
          aria-current={section === "general" ? "page" : undefined}
          onClick={() => onSelect("general")}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
          {t("settings.general")}
        </Button>
        <div className="mt-4 mb-1 px-2.5 text-xs/4 font-medium text-muted-foreground">
          {t("settings.models.title")}
        </div>
        <div className="grid gap-0.5">
          {modelSections.map(({ key, label, Icon }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              className={navigationItem}
              aria-current={section === key ? "page" : undefined}
              onClick={() => onSelect(key)}
            >
              <Icon
                className="mt-0.5 size-4 shrink-0 self-start"
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2">
                <span className="min-w-0">{t(label)}</span>
                <ConnectionStatus
                  status={modelCheckStatus(key, savedConnections[key])}
                />
              </span>
            </Button>
          ))}
        </div>
      </nav>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-muted/35 px-4 py-2.5 md:hidden">
        <NativeSelect
          aria-label={t("settings.categoriesLabel")}
          className="min-w-0 flex-1 [&>select]:h-9"
          value={section}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "general") {
              onSelect(value);
            } else {
              const target = modelSections.find(({ key }) => key === value);
              if (target) onSelect(target.key);
            }
          }}
        >
          <NativeSelectOption value="general">
            {t("settings.general")}
          </NativeSelectOption>
          <NativeSelectOptGroup label={t("settings.models.title")}>
            {modelSections.map(({ key, label }) => (
              <NativeSelectOption key={key} value={key}>
                {t(label)}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
        {section !== "general" && (
          <ConnectionStatus
            status={modelCheckStatus(section, savedConnections[section])}
          />
        )}
      </div>
    </>
  );
}

function GeneralSettings() {
  const { t } = useTranslations();
  const language = useLanguagePreference();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="flex min-h-12 items-center border-b border-border/70 pb-3 text-lg/6 font-semibold">
        {t("settings.general")}
      </h2>
      <div className="divide-y divide-border/70">
        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <Label htmlFor="interface-language">
            {t("settings.language.label")}
          </Label>
          <NativeSelect
            id="interface-language"
            value={language}
            onChange={(event) =>
              setLanguage(readLanguagePreference(event.currentTarget.value))
            }
          >
            <NativeSelectOption value="system">
              {t("settings.language.system")}
            </NativeSelectOption>
            <NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
            <NativeSelectOption value="en">English</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <Label htmlFor="appearance-theme">
            {t("settings.appearance.label")}
          </Label>
          <div className="flex items-center gap-2">
            <ThemeIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <NativeSelect
              id="appearance-theme"
              value={theme}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "light" || value === "dark" || value === "system")
                  setTheme(value);
              }}
            >
              <NativeSelectOption value="system">
                {t("settings.appearance.system")}
              </NativeSelectOption>
              <NativeSelectOption value="light">
                {t("settings.appearance.light")}
              </NativeSelectOption>
              <NativeSelectOption value="dark">
                {t("settings.appearance.dark")}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
      </div>
    </div>
  );
}
