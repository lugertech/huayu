import type { ReactElement } from "react";
import { Download, Pencil, Trash2, Video } from "lucide-react";
import { t, useLocale } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RecordingCardMenuProps = {
  trigger: ReactElement;
  onPreview: () => void;
  onRename: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

export function RecordingCardMenu({
  trigger,
  onPreview,
  onRename,
  onDownload,
  onDelete,
}: RecordingCardMenuProps) {
  useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onPreview}>
          <Video />
          {t("recordings.previewRecording")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <Pencil />
          {t("recordings.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <Download />
          {t("recordings.downloadRecording")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
