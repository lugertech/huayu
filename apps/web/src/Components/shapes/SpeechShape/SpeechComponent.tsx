import { useLocale } from "@/i18n";
import type { SpeechShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function SpeechComponent({ shape }: { shape: SpeechShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
