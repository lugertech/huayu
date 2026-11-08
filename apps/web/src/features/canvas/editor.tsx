import { t, useLocale } from "@/i18n";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import { Editor } from "./engine/editor";
export * from "./engine/editor";
export * from "./engine/model";
export * from "./engine/store";
export const EditorContext = createContext<Editor | null>(null);
export function useEditor() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error(t("canvas.theCanvasIsntReadyYet"));
  useSyncExternalStore(editor.subscribe, editor.getVersion);
  return editor;
}
export function HTMLContainer(props: HTMLAttributes<HTMLDivElement>) {
  useLocale();
  return <div {...props} />;
}
