import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** A connection crossing a frame boundary must not move or clip as frame content. */
export function repairFrameArrowMembership(
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] | null {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const detached = new Set<string>();
  for (const element of elements) {
    if (element.type !== "arrow" || !element.frameId) continue;
    const crossesFrame = [element.startBinding, element.endBinding].some(
      (binding) => {
        const target = binding && byId.get(binding.elementId);
        if (!target) return false;
        let parentId = target.frameId;
        while (parentId) {
          if (parentId === element.frameId) return false;
          parentId = byId.get(parentId)?.frameId ?? null;
        }
        return true;
      },
    );
    if (crossesFrame) detached.add(element.id);
  }
  if (!detached.size) return null;
  return elements.map((element) => {
    if (
      !element.frameId ||
      !(
        detached.has(element.id) ||
        (element.type === "text" &&
          element.containerId &&
          detached.has(element.containerId))
      )
    )
      return element;
    return {
      ...element,
      frameId: null,
      version: element.version + 1,
      versionNonce: (element.versionNonce + 1) % 0x80000000,
      updated: Date.now(),
    };
  });
}
