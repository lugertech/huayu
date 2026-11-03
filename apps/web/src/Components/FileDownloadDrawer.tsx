import { t, useLocale } from "@/i18n";
import { useEffect, useState } from "react";
import type { Editor } from "@/canvas/editor";
import { Download, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/dialog";
import { Button } from "@/ui/button";
import {
  collectDownloadableFiles,
  downloadFile,
  type DownloadableFile,
} from "@/utils/fileCollector";
import { useToast } from "./common/ToastProvider";

export function FileDownloadDrawer({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
}) {
  useLocale();
  const [files, setFiles] = useState<DownloadableFile[]>([]);
  const { showToast } = useToast();
  useEffect(() => {
    if (!open) return;
    const refresh = () => setFiles(collectDownloadableFiles(editor));
    refresh();
    return editor.store.listen(refresh, { scope: "document" });
  }, [open, editor]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{t("canvas.files.label")}</DialogTitle>
        <DialogDescription>{t("canvas.files.description")}</DialogDescription>
        {files.length ? (
          files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <FileText className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {file.sourceLabel}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("canvas.files.downloadNamed", {
                  arg0: file.fileName,
                })}
                onClick={() =>
                  downloadFile(file).catch((error) =>
                    showToast({
                      title: t("common.downloadFailed"),
                      description: error.message,
                      variant: "destructive",
                    }),
                  )
                }
              >
                <Download />
              </Button>
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
