import { useLocale } from "@/i18n";
import type { AITextShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function AITextComponent({ shape }: { shape: AITextShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
