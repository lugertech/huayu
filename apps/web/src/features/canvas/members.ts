import { t, type Locale } from "@/i18n";
import type { CanvasPeer } from "./sync";

const colors = [
  {
    stroke: "#2563eb",
    avatar: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  {
    stroke: "#9333ea",
    avatar:
      "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  },
  {
    stroke: "#059669",
    avatar:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  {
    stroke: "#d97706",
    avatar: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  {
    stroke: "#db2777",
    avatar: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
  },
  {
    stroke: "#0891b2",
    avatar: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  },
];

export const memberColor = (peer: CanvasPeer) =>
  colors[
    peer.role === "host"
      ? 0
      : Number.parseInt(peer.member_id.slice(-2), 16) % colors.length
  ];

export const memberName = (peer: CanvasPeer, locale: Locale) =>
  peer.role === "host"
    ? t("collaboration.host", undefined, locale)
    : t("canvas.collaborator", { id: peer.member_id.slice(0, 4) }, locale);
