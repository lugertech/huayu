import { useLocale } from "@/i18n";
import type { InstructionShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function InstructionComponent({ shape }: { shape: InstructionShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
