import { useLocale } from "@/i18n";
import type { ChartShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function AIChartComponent({ shape }: { shape: ChartShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
