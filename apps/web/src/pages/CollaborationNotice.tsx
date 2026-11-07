import { useTranslations } from "@/i18n";
import { UsersRound, UserRoundX, Link2Off } from "lucide-react";
import type { CollaborationExit } from "@/canvas/sync";
import { Button } from "@/ui/button";

export function CollaborationNotice({ reason }: { reason: CollaborationExit }) {
  const { t } = useTranslations();
  const Icon =
    reason === "full"
      ? UsersRound
      : reason === "removed"
        ? UserRoundX
        : Link2Off;
  return (
    <div
      className="flex max-w-sm flex-col items-center gap-3 text-center"
      role="status"
    >
      <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-medium">
        {t(
          reason === "full"
            ? "collaboration.fullTitle"
            : reason === "removed"
              ? "collaboration.removedTitle"
              : "canvas.share.linkUnavailable",
        )}
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          reason === "full"
            ? "collaboration.fullDescription"
            : reason === "removed"
              ? "collaboration.removedDescription"
              : "collaboration.closedDescription",
        )}
      </p>
      {reason === "full" && (
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => location.reload()}
        >
          {t("collaboration.tryJoining")}
        </Button>
      )}
    </div>
  );
}
