import { useLocale } from "@/i18n";
import type { WebsiteShape } from "../../../types/components";
import { CanvasNode } from "../../canvas/CanvasNode";

export function WebsiteComponent({ shape }: { shape: WebsiteShape }) {
  useLocale();
  return <CanvasNode shape={shape} />;
}
