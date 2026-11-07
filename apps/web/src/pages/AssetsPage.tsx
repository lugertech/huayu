import { ShellSidebarTrigger } from "@/Components/Shell";
import { AssetBrowser } from "@/features/asset-library/AssetBrowser";
export function AssetsPage() {
  return (
    <main className="flex h-full min-h-0 flex-col">
      <AssetBrowser navigation={<ShellSidebarTrigger />} />
    </main>
  );
}
