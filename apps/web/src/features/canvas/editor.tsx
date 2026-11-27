import { LocalizedError } from "@/i18n/errors";
import { useLocale } from "@/i18n";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import type { Editor } from "./engine/editor";
export const EditorContext = createContext<Editor | null>(null);
export function useEditor() {
  const editor = useContext(EditorContext);
  if (!editor)
    throw new LocalizedError({ key: "canvas.theCanvasIsntReadyYet" });
  useSyncExternalStore(editor.subscribe, editor.getVersion);
  return editor;
}
export function HTMLContainer(props: HTMLAttributes<HTMLDivElement>) {
  useLocale();
  return <div {...props} />;
}
