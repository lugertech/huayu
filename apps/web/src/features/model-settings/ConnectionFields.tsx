import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations, type MessageKey } from "@/i18n";
import type { modelCheckStatus } from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const connectionFieldClass =
  "h-9 border-border/80 bg-muted/45 dark:bg-muted/70";

export function ConnectionTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        className={connectionFieldClass}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

export function ConnectionKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslations();
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{t("settings.models.apiKey")}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoComplete="new-password"
          spellCheck={false}
          className={cn(connectionFieldClass, "pr-11")}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          aria-label={t(
            visible ? "settings.models.hideKey" : "settings.models.showKey",
          )}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
}

export function ConnectionSwitch({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslations();
  return (
    <Switch
      checked={checked}
      aria-label={t("settings.models.enableConnection", { name })}
      onCheckedChange={onChange}
      className="data-checked:bg-emerald-600 dark:data-checked:bg-emerald-400"
    />
  );
}

type Status = ReturnType<typeof modelCheckStatus> | "testing";

const statusLabels = {
  unconfigured: "settings.models.notConfigured",
  disabled: "settings.models.disabled",
  pending: "settings.models.pendingVerification",
  verified: "settings.models.verified",
  failed: "settings.models.verificationFailed",
  unsupported: "settings.models.unsupported",
  testing: "settings.models.testing",
} satisfies Record<Status, MessageKey>;

export function ConnectionStatus({ status }: { status: Status }) {
  const { t } = useTranslations();
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5 text-xs/4 font-normal text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status === "verified"
            ? "bg-emerald-600 dark:bg-emerald-400"
            : status === "failed"
              ? "bg-destructive"
              : status === "pending" || status === "testing"
                ? "bg-amber-500"
                : "bg-muted-foreground/50",
        )}
      />
      {t(statusLabels[status])}
    </span>
  );
}
