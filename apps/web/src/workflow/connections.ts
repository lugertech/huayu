import { getTranslator, type Locale, type MessageKey } from "@/i18n";
import { LocalizedError } from "@/i18n/errors";
import type { Editor } from "@/features/canvas/editor";
import { COMPONENT_CONFIGS } from "@/config/components";
import {
  connectedShapes,
  connectShapes,
} from "@/features/canvas/connection-parser";

export function connectionProblem(
  editor: Editor,
  from: string,
  to: string,
  locale?: Locale,
): string | null {
  const key = connectionProblemKey(editor, from, to);
  return key ? getTranslator(locale)(key) : null;
}

function connectionProblemKey(
  editor: Editor,
  from: string,
  to: string,
): MessageKey | null {
  const source = editor.getShape(from);
  const target = editor.getShape(to);
  const page = editor.getCurrentPageId();
  if (
    !source ||
    !target ||
    editor.pageOf(from) !== page ||
    editor.pageOf(to) !== page
  )
    return "workflow.thisCardIsNoLongerOnTheCurrentPage";
  if (from === to) return "workflow.chooseADifferentCard";
  if (
    !(target.type in COMPONENT_CONFIGS) ||
    ["frame", "ai-draw", "interactive-web"].includes(target.type)
  )
    return "workflow.connectToACreativeStep";
  if (["arrow", "group"].includes(source.type))
    return "workflow.chooseAvailableMaterial";
  if (connectedShapes(editor, from, "next").some((shape) => shape.id === to))
    return "workflow.theseCardsAreAlreadyConnected";
  const pending = [to];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === from) return "workflow.thisConnectionWouldCreateACycle";
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(
      ...connectedShapes(editor, id, "next").map((shape) => shape.id),
    );
  }
  return null;
}

export function linkWorkflow(editor: Editor, from: string, to: string) {
  const problem = connectionProblemKey(editor, from, to);
  if (problem) throw new LocalizedError({ key: problem });
  let id: string | undefined;
  editor.run(() => {
    id = connectShapes(editor, from, to);
  });
  return id;
}
