import { errorText } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { useEffect, useState } from "react";
import type { Editor } from "@/features/canvas/editor";
import { Download, FileText, MoreHorizontal, Focus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestInspection, focusShapes } from "@/workflow/context";
import {
  collectDownloadableFiles,
  downloadFile,
  type DownloadableFile,
} from "@/features/canvas/file-collector";
import { useToast } from "../../../components/common/ToastProvider";

export function FileDownloadDrawer({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
}) {
  const { t, locale } = useTranslations();
  const [files, setFiles] = useState<DownloadableFile[]>([]);
  const { showToast } = useToast();
  useEffect(() => {
    if (!open) return;
    const refresh = () => setFiles(collectDownloadableFiles(editor, locale));
    refresh();
    return editor.store.listen(refresh, { scope: "document" });
  }, [open, editor, locale]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{t("canvas.files.label")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("canvas.files.description")}
        </DialogDescription>
        {files.length ? (
          files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 border-b py-3 last:border-0"
            >
              {file.source === "image" ? (
                <button
                  type="button"
                  aria-label={t("canvas.viewImage")}
                  className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onOpenChange(false);
                    requestInspection(editor, file.shapeId);
                  }}
                >
                  <img
                    src={file.downloadUrl}
                    alt=""
                    className="size-12 rounded-md border bg-muted object-contain"
                  />
                </button>
              ) : (
                <FileText className="mx-3 size-6 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {file.sourceLabel}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("canvas.files.downloadNamed", {
                  arg0: file.fileName,
                })}
                onClick={() =>
                  downloadFile(file).catch((error) =>
                    showToast({
                      title: t("common.downloadFailed"),
                      description: errorText(error, locale),
                      variant: "destructive",
                    }),
                  )
                }
              >
                <Download />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("assets.assetActions", {
                        name: file.fileName,
                      })}
                    >
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      onOpenChange(false);
                      editor.select(file.shapeId);
                      focusShapes(editor, [file.shapeId]);
                    }}
                  >
                    <Focus />
                    {t("assets.locateOnCanvas")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("canvas.files.empty")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
export default FileDownloadDrawer;
