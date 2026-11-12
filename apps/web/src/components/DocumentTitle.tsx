import { useLayoutEffect } from "react";
import { t, useLocale } from "@/i18n";

export function DocumentTitle({ pageName }: { pageName?: string }) {
  const locale = useLocale();
  const appName = t("app.name", undefined, locale);
  const title = pageName ? `${pageName} - ${appName}` : appName;

  useLayoutEffect(() => {
    document.title = title;
    return () => {
      document.title = t("app.name");
    };
  }, [title]);

  return null;
}
