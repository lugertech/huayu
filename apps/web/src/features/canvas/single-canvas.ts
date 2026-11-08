import {
  Bounds,
  Editor,
  createShapeId,
  type CanvasRecord,
  type CanvasShape,
  type CanvasStore,
  type OtherRecord,
} from "./editor";
import {
  generationFingerprint,
  generationInfo,
  resultIsStale,
} from "@/workflow/freshness";

/** Preserve legacy pages as named areas of one canvas, including their connections. */
export function mergeCanvasPages(store: CanvasStore) {
  const pages = store
    .allRecords()
    .filter((record): record is OtherRecord => record.typeName === "page")
    .sort((a, b) => String(a.index).localeCompare(String(b.index)));
  if (pages.length < 2) return;

  const editor = new Editor(store);
  const session = editor.session;
  const shapes = store
    .allRecords()
    .filter((record): record is CanvasShape => record.typeName === "shape");
  const contents = new Map(
    pages.map((page) => [
      page.id,
      shapes.filter((shape) => editor.pageOf(shape.id) === page.id),
    ]),
  );
  const fresh = new Set<string>();
  try {
    for (const page of pages) {
      store.session = { ...session, currentPageId: page.id };
      for (const shape of contents.get(page.id)!)
        if (generationInfo(shape) && !resultIsStale(editor, shape.id))
          fresh.add(shape.id);
    }
  } finally {
    store.session = session;
  }

  const target = pages[0];
  const original = contents.get(target.id)!;
  const bounds = original.length
    ? Bounds.union(original.map((shape) => editor.getShapePageBounds(shape)!))
    : undefined;
  let right = bounds?.maxX;
  let top = bounds?.y;
  const upsert: CanvasRecord[] = [];
  const remove = pages.slice(1).map((page) => page.id);

  for (const [index, page] of pages.slice(1).entries()) {
    const items = contents.get(page.id)!;
    if (!items.length) continue;
    const area = Bounds.union(
      items.map((shape) => editor.getShapePageBounds(shape)!),
    );
    top ??= area.y;
    const x = right === undefined ? area.x : right + 200;
    const dx = x - area.x;
    const dy = top - area.y;
    const prefix = `z:single-canvas:${String(index).padStart(6, "0")}:`;
    for (const shape of items)
      upsert.push({
        ...shape,
        index: `${prefix}1:${shape.index}`,
        ...(shape.parentId === page.id
          ? { parentId: target.id, x: shape.x + dx, y: shape.y + dy }
          : {}),
      });
    const name = String(page.name || "");
    const width = Math.max(160, name.length * 14);
    if (name)
      upsert.push({
        id: createShapeId(`single-canvas-title:${page.id}`),
        typeName: "shape",
        type: "text",
        parentId: target.id,
        x,
        y: top - 48,
        rotation: 0,
        opacity: 1,
        isLocked: false,
        index: `${prefix}0`,
        meta: {},
        props: { text: name, w: width, h: 28, fontSize: 20, color: "grey" },
      });
    right = x + Math.max(area.w, width);
  }

  store.batch(() => {
    store.put(upsert);
    store.remove(remove);
    store.session = {
      ...session,
      currentPageId: target.id,
      pageStates: [],
    };
    const after = new Editor(store);
    const refreshed: CanvasRecord[] = [];
    for (const id of fresh) {
      const shape = after.getShape(id)!;
      refreshed.push({
        ...shape,
        props: {
          ...shape.props,
          generation: {
            ...generationInfo(shape)!,
            fingerprint: generationFingerprint(after, id),
          },
        },
      });
    }
    store.put(refreshed);
  });
  return {
    upsert: [...new Set([...upsert.map((record) => record.id), ...fresh])].map(
      (id) => store.get(id)!,
    ),
    remove,
  };
}
