import { useTranslations } from "@/i18n";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

function ErrorFallback() {
  const { t } = useTranslations();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg font-medium">
        {t("common.thisPageCannotBeDisplayed")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("common.refreshToTryAgain")}
      </p>
      <Button onClick={() => window.location.reload()}>
        {t("common.refreshPage")}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <ErrorFallback />;
    return this.props.children;
  }
}
