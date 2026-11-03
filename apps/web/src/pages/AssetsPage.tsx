import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePenLine, Loader2, Plus } from "lucide-react";
import { ShellSidebarTrigger } from "@/Components/Shell";
import { AssetBrowser } from "@/features/asset-library/AssetBrowser";
import { type LibraryAsset } from "@/features/asset-library/assets";
import { api, type Project } from "@/api/client";
import { t, useLocale } from "@/i18n";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/dialog";
import { useToast } from "@/Components/common/ToastProvider";

export function AssetsPage() {
  useLocale();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [inserting, setInserting] = useState<LibraryAsset | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  async function selectCanvas(asset: LibraryAsset) {
    setProjects(await api<Project[]>("/api/projects"));
    setInserting(asset);
  }
  async function newCanvas() {
    if (busy || !inserting) return;
    setBusy(true);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: inserting.name.replace(/\.[^.]+$/, "").slice(0, 120),
        }),
      });
      navigate(`/drawing/${project.id}`, {
        state: { insertAssetId: inserting.id },
      });
    } catch (error) {
      showToast({
        title: t("common.operationFailed"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <main className="flex h-full min-h-0 flex-col">
        <AssetBrowser
          navigation={<ShellSidebarTrigger />}
          onInsert={selectCanvas}
        />
      </main>
      <Dialog
        open={!!inserting}
        onOpenChange={(open) => {
          if (!open && !busy) setInserting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{t("assets.chooseCanvas")}</DialogTitle>
          <DialogDescription>{inserting?.name}</DialogDescription>
          <Button
            variant="outline"
            className="justify-start"
            disabled={busy}
            onClick={() => void newCanvas()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("projects.create")}
          </Button>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {projects.map((project) => (
              <Button
                key={project.id}
                variant="ghost"
                className="w-full justify-start"
                disabled={busy}
                onClick={() =>
                  navigate(`/drawing/${project.id}`, {
                    state: { insertAssetId: inserting!.id },
                  })
                }
              >
                <FilePenLine />
                <span className="truncate">{project.name}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
