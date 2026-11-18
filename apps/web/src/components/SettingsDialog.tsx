import {
  t,
  useLocale,
  useLanguagePreference,
  setLanguage,
  type LanguagePreference,
} from "@/i18n";
import { useEffect, useState } from "react";
import { Monitor, Moon, Settings2, SlidersHorizontal, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/lib/theme";
import { useIsMobile } from "@/lib/use-mobile";
import { ModelSettings } from "./ModelSettings";
import type { Capability } from "@/ai/settings";

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
  initialCapability = "text",
  modelSetup = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "general" | "models";
  initialCapability?: Capability;
  modelSetup?: boolean;
}) {
  useLocale();
  const language = useLanguagePreference();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  const { theme, setTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex h-14 shrink-0 items-center border-b px-5">
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("settings.description")}
          </DialogDescription>
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "general" | "models")}
          orientation={isMobile ? "horizontal" : "vertical"}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList
            aria-label={t("settings.categoriesLabel")}
            className="w-full shrink-0 justify-start gap-1 rounded-none border-b bg-muted/40 p-3 group-data-[orientation=horizontal]/tabs:h-auto group-data-[orientation=vertical]/tabs:h-full md:w-44 md:border-r md:border-b-0"
          >
            <TabsTrigger
              value="general"
              className="h-9 min-w-0 flex-1 justify-start gap-2 px-2 text-xs md:flex-none md:px-3 md:text-sm [&_svg]:hidden md:[&_svg]:inline"
            >
              <SlidersHorizontal />
              {t("settings.general")}
            </TabsTrigger>
            <TabsTrigger
              value="models"
              className="h-9 min-w-0 flex-1 justify-start gap-2 px-2 text-xs md:flex-none md:px-3 md:text-sm [&_svg]:hidden md:[&_svg]:inline"
            >
              <Settings2 />
              {t("settings.models.title")}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="general"
            className="min-h-0 min-w-0 overflow-y-auto p-5 md:p-8"
          >
            <h2 className="text-base font-medium">{t("settings.general")}</h2>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
              <div className="space-y-1.5">
                <Label htmlFor="interface-language">
                  {t("settings.language.label")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.language.description")}
                </p>
              </div>
              <NativeSelect
                id="interface-language"
                aria-label={t("settings.language.label")}
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as LanguagePreference)
                }
              >
                <NativeSelectOption value="system">
                  {t("settings.language.system")}
                </NativeSelectOption>
                <NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
                <NativeSelectOption value="en">English</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
              <div className="space-y-1.5">
                <Label htmlFor="appearance-theme">
                  {t("settings.appearance.label")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.appearance.description")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeIcon className="size-4 text-muted-foreground" />
                <NativeSelect
                  id="appearance-theme"
                  aria-label={t("settings.appearance.label")}
                  value={theme}
                  onChange={(event) =>
                    setTheme(event.target.value as "light" | "dark" | "system")
                  }
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
          </TabsContent>
          <TabsContent
            value="models"
            keepMounted
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <ModelSettings
              initialCapability={initialCapability}
              modelSetup={modelSetup}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
