import { useLocale } from "@/i18n";
import type { FileShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function FileComponent({ shape }: { shape: FileShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
