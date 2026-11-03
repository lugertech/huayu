import { useLocale } from "@/i18n";
import type { AIImageShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function AIImageComponent({ shape }: { shape: AIImageShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
