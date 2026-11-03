import { t } from "@/i18n";
import { CanvasStore } from "./store";
import {
  defaultProps,
  createShapeId,
  createBindingId,
  type CanvasShape,
  type ArrowBinding,
  type CanvasSession,
  type VecLike,
  type DocumentSnapshot,
  type OtherRecord,
} from "./model";

export class Bounds {
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {}
  get width() {
    return this.w;
  }
  get height() {
    return this.h;
  }
  get minX() {
    return this.x;
  }
  get minY() {
    return this.y;
  }
  get maxX() {
    return this.x + this.w;
  }
  get maxY() {
    return this.y + this.h;
  }
  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }
  get point() {
    return { x: this.x, y: this.y };
  }
  contains(point: VecLike) {
    return (
      point.x >= this.x &&
      point.y >= this.y &&
      point.x <= this.maxX &&
      point.y <= this.maxY
    );
  }
  static union(bounds: Bounds[]) {
    if (!bounds.length) return new Bounds(0, 0, 1, 1);
    const x = Math.min(...bounds.map((bound) => bound.x));
    const y = Math.min(...bounds.map((bound) => bound.y));
    return new Bounds(
      x,
      y,
      Math.max(...bounds.map((bound) => bound.maxX)) - x,
      Math.max(...bounds.map((bound) => bound.maxY)) - y,
    );
  }
}
export interface ShapeInput {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  rotation?: number;
  parentId?: string;
  index?: string;
  opacity?: number;
  isLocked?: boolean;
  props?: Record<string, any>;
  meta?: Record<string, unknown>;
}
export interface RenderBridge {
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  container: HTMLElement;
  exportSVG?: (
    ids: string[],
    options: { background?: boolean; padding?: number },
  ) => Promise<{ svg: string; width: number; height: number } | undefined>;
  exportPNG?: (
    ids: string[],
    options: {
      background?: boolean;
      padding?: number;
      scale?: number;
      format?: string;
    },
  ) => Promise<{ blob: Blob; width: number; height: number }>;
}
const emptySession = (pageId: string): CanvasSession => ({
  version: 1,
  currentPageId: pageId,
  camera: { x: 80, y: 80, z: 1 },
  selectedShapeIds: [],
  pageStates: [],
});
export function normalizeSession(
  value: any,
  store: CanvasStore,
): CanvasSession {
  const pages = store
    .allRecords()
    .filter((record) => record.typeName === "page");
  const page = pages.some((record) => record.id === value?.currentPageId)
    ? value.currentPageId
    : pages[0]?.id || "page:page";
  const base = emptySession(page);
  const pageState = value?.pageStates?.find(
    (state: any) => state.pageId === page,
  );
  const camera = value?.camera || pageState?.camera;
  if (
    camera &&
    [camera.x, camera.y, camera.z].every(Number.isFinite) &&
    camera.z > 0
  )
    base.camera = {
      x: camera.x,
      y: camera.y,
      z: Math.min(4, Math.max(0.05, camera.z)),
    };
  base.selectedShapeIds = (
    value?.selectedShapeIds ||
    pageState?.selectedShapeIds ||
    []
  ).filter((id: string) => store.get(id)?.typeName === "shape");
  base.pageStates = Array.isArray(value?.pageStates) ? value.pageStates : [];
  return base;
}
export class Editor {
  private tool = "select";
  private bridge?: RenderBridge;
  private editingId: string | null = null;
  theme: "light" | "dark" = "light";
  styles = {
    color: "black",
    fill: "none",
    dash: "solid",
    size: "m",
    font: "sans",
    geo: "rectangle",
    opacity: 1,
  };
  user = {
    updateUserPreferences: (preferences: {
      colorScheme?: "light" | "dark";
      locale?: string;
    }) => {
      if (preferences.colorScheme && this.theme !== preferences.colorScheme) {
        this.theme = preferences.colorScheme;
        this.store.notifySession();
      }
    },
  };
  constructor(readonly store: CanvasStore) {
    store.session = normalizeSession(store.session, store);
  }
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  getVersion = () => this.store.getVersion();
  get session(): CanvasSession {
    const current = this.store.session;
    if (!current || current.version !== 1)
      this.store.session = normalizeSession(current, this.store);
    if (!this.store.get(this.store.session.currentPageId))
      this.store.session = normalizeSession(this.store.session, this.store);
    return this.store.session;
  }
  mount(bridge: RenderBridge) {
    this.bridge = bridge;
    bridge.setViewport(this.viewport);
    return () => {
      this.bridge = undefined;
    };
  }
  get container() {
    return this.bridge?.container;
  }
  get viewport() {
    const camera = this.session.camera;
    return { x: camera.x * camera.z, y: camera.y * camera.z, zoom: camera.z };
  }
  setViewport(
    viewport: { x: number; y: number; zoom: number },
    fromSurface = false,
  ) {
    this.session.camera = {
      x: viewport.x / viewport.zoom,
      y: viewport.y / viewport.zoom,
      z: viewport.zoom,
    };
    if (!fromSurface) this.bridge?.setViewport(viewport);
    this.store.notifySession();
  }
  get pages() {
    return this.store
      .allRecords()
      .filter((record): record is OtherRecord => record.typeName === "page")
      .sort((a, b) => String(a.index).localeCompare(String(b.index)));
  }
  getCurrentPageId() {
    return this.session.currentPageId;
  }
  setCurrentPage(id: string) {
    if (
      this.store.get(id)?.typeName !== "page" ||
      id === this.getCurrentPageId()
    )
      return;
    const previous = {
      pageId: this.getCurrentPageId(),
      camera: { ...this.session.camera },
      selectedShapeIds: [],
    };
    const states = (this.session.pageStates || []).filter(
      (state) => state.pageId !== previous.pageId,
    );
    const next = states.find((state) => state.pageId === id);
    states.push(previous);
    this.store.session = {
      ...this.session,
      currentPageId: id,
      selectedShapeIds: [],
      camera: next?.camera || { x: 80, y: 80, z: 1 },
      pageStates: states,
    };
    this.bridge?.setViewport(this.viewport);
    this.store.notifySession();
  }
  createPage(name = `Page ${this.pages.length + 1}`) {
    const id = `page:${crypto.randomUUID()}`;
    this.store.put([
      {
        id,
        typeName: "page",
        name,
        index: `b${String(Date.now()).padStart(15, "0")}`,
        meta: {},
      },
    ]);
    this.setCurrentPage(id);
    return id;
  }
  renamePage(id: string, name: string) {
    const record = this.store.get(id);
    if (record?.typeName === "page" && name.trim())
      this.store.put([{ ...record, name: name.trim().slice(0, 120) }]);
  }
  deletePage(id: string) {
    if (this.pages.length < 2) throw new Error(t("canvas.keepAtLeastOnePage"));
    this.run(() => {
      this.deleteShapes(
        this.store
          .allRecords()
          .filter(
            (record) =>
              record.typeName === "shape" && this.pageOf(record.id) === id,
          )
          .map((record) => record.id),
      );
      this.store.remove([id]);
    });
    if (
      this.getCurrentPageId() === id ||
      !this.store.get(this.session.currentPageId)
    ) {
      this.store.session = normalizeSession(this.session, this.store);
      this.bridge?.setViewport(this.viewport);
      this.store.notifySession();
    }
  }
  pageOf(id: string): string {
    let record = this.store.get(id);
    let depth = 0;
    while (record?.typeName === "shape" && depth++ < 100)
      record = this.store.get(record.parentId);
    return record?.typeName === "page" ? record.id : "";
  }
  getShape<T extends CanvasShape = CanvasShape>(
    value: string | CanvasShape,
  ): T | undefined {
    const shape = typeof value === "string" ? this.store.get(value) : value;
    return shape?.typeName === "shape" ? (shape as T) : undefined;
  }
  getCurrentPageShapes() {
    return this.store
      .allRecords()
      .filter(
        (record) =>
          record.typeName === "shape" &&
          this.pageOf(record.id) === this.getCurrentPageId(),
      ) as CanvasShape[];
  }
  getCurrentPageShapeIds() {
    return new Set(this.getCurrentPageShapes().map((shape) => shape.id));
  }
  getSelectedShapeIds() {
    return this.session.selectedShapeIds.filter((id) => !!this.getShape(id));
  }
  getSelectedShapes() {
    return this.getSelectedShapeIds().map((id) => this.getShape(id)!);
  }
  select(...ids: string[]) {
    this.session.selectedShapeIds = [
      ...new Set(ids.filter((id) => !!this.getShape(id))),
    ];
    this.store.notifySession();
    return this;
  }
  deselect(...ids: string[]) {
    return this.select(
      ...this.getSelectedShapeIds().filter((id) => !ids.includes(id)),
    );
  }
  selectAll() {
    return this.select(...this.getCurrentPageShapeIds());
  }
  setEditingShape(id: string | null) {
    this.editingId = id;
    this.store.notifySession();
  }
  getEditingShapeId() {
    return this.editingId;
  }
  getCurrentToolId() {
    return this.tool;
  }
  setCurrentTool(tool: string) {
    this.tool = tool;
    this.editingId = null;
    this.store.notifySession();
    return this;
  }
  createShape(input: ShapeInput) {
    this.store.historyBoundary();
    const id = input.id || createShapeId();
    const shape: CanvasShape = {
      id,
      typeName: "shape",
      type: input.type,
      x: input.x || 0,
      y: input.y || 0,
      rotation: input.rotation || 0,
      opacity: input.opacity ?? this.styles.opacity,
      index:
        input.index ||
        `b${String(Date.now()).padStart(15, "0")}-${crypto.randomUUID().slice(0, 8)}`,
      parentId: input.parentId || this.getCurrentPageId(),
      isLocked: !!input.isLocked,
      meta: input.meta || {},
      props: {
        ...defaultProps(input.type),
        ...([
          "geo",
          "line",
          "arrow",
          "draw",
          "highlight",
          "text",
          "note",
        ].includes(input.type)
          ? this.styles
          : {}),
        ...(input.type === "note" && this.styles.color === "black"
          ? { color: "yellow" }
          : {}),
        ...input.props,
      },
    };
    this.store.put([shape]);
    return this;
  }
  updateShape(input: Partial<ShapeInput> & { id: string }) {
    const shape = this.getShape(input.id);
    if (shape)
      this.store.put([
        { ...shape, ...input, props: { ...shape.props, ...input.props } },
      ]);
    return this;
  }
  updateShapes(inputs: Array<Partial<ShapeInput> & { id: string }>) {
    this.store.historyBoundary();
    this.run(() => inputs.forEach((input) => this.updateShape(input)));
    return this;
  }
  deleteShape(id: string) {
    return this.deleteShapes([id]);
  }
  deleteShapes(ids: string[]) {
    this.store.historyBoundary();
    const removed = new Set(ids);
    let previousSize = -1;
    while (previousSize !== removed.size) {
      previousSize = removed.size;
      for (const record of this.store.allRecords()) {
        if (record.typeName === "shape" && removed.has(record.parentId))
          removed.add(record.id);
        if (
          record.typeName === "binding" &&
          (removed.has(record.fromId) || removed.has(record.toId))
        ) {
          removed.add(record.id);
          if (removed.has(record.toId)) removed.add(record.fromId);
        }
      }
    }
    this.store.remove([...removed]);
    this.deselect(...removed);
    return this;
  }
  createBinding(
    input: Partial<ArrowBinding> & {
      fromId: string;
      toId: string;
      props: ArrowBinding["props"];
    },
  ) {
    if (!this.getShape(input.fromId) || !this.getShape(input.toId))
      throw new Error(t("canvas.aConnectedShapeNoLongerExists"));
    this.store.put([
      {
        id: input.id || createBindingId(),
        typeName: "binding",
        type: "arrow",
        meta: {},
        ...input,
      } as ArrowBinding,
    ]);
    return this;
  }
  createBindings(
    inputs: Array<
      Partial<ArrowBinding> & {
        fromId: string;
        toId: string;
        props: ArrowBinding["props"];
      }
    >,
  ) {
    this.run(() => inputs.forEach((input) => this.createBinding(input)));
    return this;
  }
  getBindingsToShape<T = ArrowBinding>(id: string, type = "arrow"): T[] {
    return this.store
      .allRecords()
      .filter(
        (record) =>
          record.typeName === "binding" &&
          record.toId === id &&
          record.type === type,
      ) as T[];
  }
  getBindingsFromShape<T = ArrowBinding>(id: string, type = "arrow"): T[] {
    return this.store
      .allRecords()
      .filter(
        (record) =>
          record.typeName === "binding" &&
          record.fromId === id &&
          record.type === type,
      ) as T[];
  }
  getShapeGeometry(value: string | CanvasShape) {
    const shape = this.getShape(value);
    if (!shape) return { bounds: new Bounds(0, 0, 1, 1) };
    const bounds = this.localBounds(shape);
    return { bounds };
  }
  localBounds(shape: CanvasShape): Bounds {
    const props = shape.props;
    if (shape.type === "group") {
      const children = this.getChildren(shape.id);
      if (children.length) {
        const world = Bounds.union(
          children
            .map((child) => this.getShapePageBounds(child)!)
            .filter(Boolean),
        );
        const origin = this.getPageTransform(shape);
        return new Bounds(
          world.x - origin.x,
          world.y - origin.y,
          world.w,
          world.h,
        );
      }
    }
    if (shape.type === "arrow") {
      const points = [
        props.start || { x: 0, y: 0 },
        props.end || { x: 100, y: 0 },
      ];
      return Bounds.union(
        points.map((point) => new Bounds(point.x, point.y, 1, 1)),
      );
    }
    if (["draw", "highlight", "line"].includes(shape.type)) {
      const points: VecLike[] =
        shape.type === "line"
          ? Object.values(props.points || {})
          : (props.segments || []).flatMap(
              (segment: any) => segment.points || [],
            );
      if (points.length)
        return Bounds.union(
          points.map((point) => new Bounds(point.x, point.y, 1, 1)),
        );
    }
    return new Bounds(
      0,
      0,
      Math.max(1, props.w || 200),
      Math.max(1, props.h || (shape.type === "text" ? 40 : 200)),
    );
  }
  getPageTransform(
    shape: CanvasShape,
    seen = new Set<string>(),
  ): { x: number; y: number; rotation: number } {
    if (seen.has(shape.id))
      return { x: shape.x, y: shape.y, rotation: shape.rotation };
    seen.add(shape.id);
    const parent = this.getShape(shape.parentId);
    if (!parent) return { x: shape.x, y: shape.y, rotation: shape.rotation };
    const transform = this.getPageTransform(parent, seen);
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    return {
      x: transform.x + shape.x * cos - shape.y * sin,
      y: transform.y + shape.x * sin + shape.y * cos,
      rotation: transform.rotation + shape.rotation,
    };
  }
  getShapePageBounds(value: string | CanvasShape): Bounds | undefined {
    const shape = this.getShape(value);
    if (!shape) return;
    if (shape.type === "arrow") {
      const { start, end } = this.arrowPoints(shape);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const bend = shape.props.bend || 0;
      const control = {
        x: (start.x + end.x) / 2 - (dy / length) * bend * 2,
        y: (start.y + end.y) / 2 + (dx / length) * bend * 2,
      };
      const points = [start, end];
      for (const axis of ["x", "y"] as const) {
        const denominator = start[axis] - 2 * control[axis] + end[axis];
        const t = denominator
          ? (start[axis] - control[axis]) / denominator
          : -1;
        if (t > 0 && t < 1)
          points.push({
            x:
              (1 - t) ** 2 * start.x +
              2 * (1 - t) * t * control.x +
              t * t * end.x,
            y:
              (1 - t) ** 2 * start.y +
              2 * (1 - t) * t * control.y +
              t * t * end.y,
          });
      }
      return Bounds.union(
        points.map((point) => new Bounds(point.x, point.y, 1, 1)),
      );
    }
    if (shape.type === "group") {
      const children = this.getChildren(shape.id);
      if (children.length)
        return Bounds.union(
          children
            .map((child) => this.getShapePageBounds(child)!)
            .filter(Boolean),
        );
    }
    const bounds = this.localBounds(shape);
    const transform = this.getPageTransform(shape);
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const points = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.maxX, y: bounds.y },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.x, y: bounds.maxY },
    ];
    return Bounds.union(
      points.map(
        (point) =>
          new Bounds(
            transform.x + point.x * cos - point.y * sin,
            transform.y + point.x * sin + point.y * cos,
            0,
            0,
          ),
      ),
    );
  }
  arrowPoints(shape: CanvasShape): { start: VecLike; end: VecLike } {
    const transform = this.getPageTransform(shape);
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const result = Object.fromEntries(
      ["start", "end"].map((terminal) => {
        const point = shape.props[terminal] || {
          x: terminal === "end" ? 100 : 0,
          y: 0,
        };
        return [
          terminal,
          {
            x: transform.x + point.x * cos - point.y * sin,
            y: transform.y + point.x * sin + point.y * cos,
          },
        ];
      }),
    ) as { start: VecLike; end: VecLike };
    const bindings = this.getBindingsFromShape(shape.id);
    for (const binding of bindings) {
      const target = this.getShape(binding.toId);
      if (!target || target.type === "arrow") continue;
      const bounds = this.getShapePageBounds(target);
      if (!bounds) continue;
      const anchor = binding.props.normalizedAnchor || { x: 0.5, y: 0.5 };
      let point = {
        x: bounds.x + bounds.w * anchor.x,
        y: bounds.y + bounds.h * anchor.y,
      };
      if (
        binding.props.isPrecise &&
        Number.isFinite(target.props.w) &&
        Number.isFinite(target.props.h)
      ) {
        const origin = this.getPageTransform(target);
        const x = target.props.w * anchor.x;
        const y = target.props.h * anchor.y;
        point = {
          x:
            origin.x +
            x * Math.cos(origin.rotation) -
            y * Math.sin(origin.rotation),
          y:
            origin.y +
            x * Math.sin(origin.rotation) +
            y * Math.cos(origin.rotation),
        };
      }
      if (!binding.props.isExact && anchor.x === 0.5 && anchor.y === 0.5) {
        const otherBinding = bindings.find(
          (other) => other.props.terminal !== binding.props.terminal,
        );
        const otherShape = otherBinding && this.getShape(otherBinding.toId);
        const other =
          otherShape && otherShape.type !== "arrow"
            ? this.getShapePageBounds(otherShape)?.center
            : result[binding.props.terminal === "start" ? "end" : "start"];
        if (other) {
          const dx = other.x - bounds.center.x;
          const dy = other.y - bounds.center.y;
          const amount = Math.min(
            bounds.w / 2 / Math.max(Math.abs(dx), 0.001),
            bounds.h / 2 / Math.max(Math.abs(dy), 0.001),
          );
          point = {
            x: bounds.center.x + dx * amount,
            y: bounds.center.y + dy * amount,
          };
        }
      }
      result[binding.props.terminal] = point;
    }
    return result;
  }
  getChildren(id: string) {
    return this.getCurrentPageShapes().filter((shape) => shape.parentId === id);
  }
  descendants(id: string): CanvasShape[] {
    const results: CanvasShape[] = [];
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length)
      for (const child of this.getChildren(queue.shift()!))
        if (!seen.has(child.id)) {
          seen.add(child.id);
          results.push(child);
          queue.push(child.id);
        }
    return results;
  }
  reparentShapes(ids: string[], parentId: string) {
    const parent = this.getShape(parentId);
    const origin = parent
      ? this.getPageTransform(parent)
      : { x: 0, y: 0, rotation: 0 };
    this.run(() => {
      for (const id of ids) {
        const shape = this.getShape(id);
        if (
          !shape ||
          id === parentId ||
          this.descendants(id).some((child) => child.id === parentId)
        )
          continue;
        const point = this.getPageTransform(shape);
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        this.updateShape({
          id,
          parentId,
          x: dx * Math.cos(origin.rotation) + dy * Math.sin(origin.rotation),
          y: -dx * Math.sin(origin.rotation) + dy * Math.cos(origin.rotation),
          rotation: point.rotation - origin.rotation,
        });
      }
    });
  }
  groupShapes(ids: string[] = this.getSelectedShapeIds()) {
    if (ids.length < 2) return;
    const bounds = Bounds.union(
      ids.map((id) => this.getShapePageBounds(id)!).filter(Boolean),
    );
    const id = createShapeId();
    this.run(() => {
      this.createShape({
        id,
        type: "group",
        x: bounds.x,
        y: bounds.y,
        props: { w: bounds.w, h: bounds.h },
      });
      this.reparentShapes(ids, id);
    });
    this.select(id);
    return id;
  }
  ungroupShapes(ids = this.getSelectedShapeIds()) {
    this.run(() => {
      for (const id of ids) {
        const shape = this.getShape(id);
        if (shape?.type !== "group") continue;
        const children = this.getChildren(id);
        this.reparentShapes(
          children.map((child) => child.id),
          shape.parentId,
        );
        this.store.remove([id]);
        this.select(...children.map((child) => child.id));
      }
    });
  }
  moveShapes(ids: string[], dx: number, dy: number) {
    const selected = new Set(ids);
    this.updateShapes(
      ids
        .filter((id) => !selected.has(this.getShape(id)?.parentId))
        .map((id) => {
          const shape = this.getShape(id)!;
          return { id, x: shape.x + dx, y: shape.y + dy };
        }),
    );
  }
  duplicateShapes(ids = this.getSelectedShapeIds(), offset = { x: 32, y: 32 }) {
    const all = new Map<string, CanvasShape>();
    for (const id of ids) {
      const shape = this.getShape(id);
      if (shape) {
        all.set(id, shape);
        this.descendants(id).forEach((child) => all.set(child.id, child));
      }
    }
    const mapping = new Map([...all.keys()].map((id) => [id, createShapeId()]));
    this.run(() => {
      for (const shape of all.values())
        this.createShape({
          ...structuredClone(shape),
          id: mapping.get(shape.id),
          parentId: mapping.get(shape.parentId) || shape.parentId,
          x: shape.x + (mapping.has(shape.parentId) ? 0 : offset.x),
          y: shape.y + (mapping.has(shape.parentId) ? 0 : offset.y),
        });
      for (const record of this.store.allRecords())
        if (
          record.typeName === "binding" &&
          mapping.has(record.fromId) &&
          mapping.has(record.toId)
        )
          this.createBinding({
            ...structuredClone(record),
            id: createBindingId(),
            fromId: mapping.get(record.fromId)!,
            toId: mapping.get(record.toId)!,
          });
    });
    const result = ids.map((id) => mapping.get(id)!).filter(Boolean);
    this.select(...result);
    return result;
  }
  getViewportPageBounds() {
    const rect = this.bridge?.container.getBoundingClientRect();
    const camera = this.session.camera;
    return new Bounds(
      -camera.x,
      -camera.y,
      (rect?.width || 1200) / camera.z,
      (rect?.height || 800) / camera.z,
    );
  }
  screenToPage(point: VecLike) {
    const rect = this.bridge?.container.getBoundingClientRect();
    const camera = this.session.camera;
    return {
      x: (point.x - (rect?.left || 0)) / camera.z - camera.x,
      y: (point.y - (rect?.top || 0)) / camera.z - camera.y,
    };
  }
  zoomToFit(_options?: unknown) {
    const shapes = this.getCurrentPageShapes().filter(
      (shape) => shape.type !== "group",
    );
    if (!shapes.length) return;
    this.zoomToBounds(
      Bounds.union(
        shapes.map((shape) => this.getShapePageBounds(shape)!).filter(Boolean),
      ),
    );
  }
  zoomToBounds(bounds: Bounds) {
    const rect = this.bridge?.container.getBoundingClientRect();
    const width = rect?.width || 1200;
    const height = rect?.height || 800;
    const z = Math.min(
      1.2,
      Math.max(
        0.05,
        Math.min(
          (width - (width < 700 ? 48 : 120)) / Math.max(bounds.w, 1),
          (height - (height < 600 ? 100 : 140)) / Math.max(bounds.h, 1),
        ),
      ),
    );
    this.setViewport({
      x: width / 2 - bounds.center.x * z,
      y: height / 2 - bounds.center.y * z,
      zoom: z,
    });
  }
  zoomBy(factor: number) {
    const bounds = this.getViewportPageBounds();
    const zoom = Math.min(4, Math.max(0.05, this.session.camera.z * factor));
    const rect = this.bridge?.container.getBoundingClientRect();
    this.setViewport({
      x: (rect?.width || 1200) / 2 - bounds.center.x * zoom,
      y: (rect?.height || 800) / 2 - bounds.center.y * zoom,
      zoom,
    });
  }
  updateStyles(styles: Partial<typeof this.styles>) {
    Object.assign(this.styles, styles);
    this.updateShapes(
      this.getSelectedShapes().map((shape) => ({
        id: shape.id,
        ...("opacity" in styles ? { opacity: styles.opacity } : {}),
        props: Object.fromEntries(
          Object.entries(styles).filter(([key]) => key !== "opacity"),
        ),
      })),
    );
    this.store.notifySession();
  }
  setLock(ids = this.getSelectedShapeIds()) {
    const locked = !this.getSelectedShapes().every((shape) => shape.isLocked);
    this.updateShapes(ids.map((id) => ({ id, isLocked: locked })));
  }
  reorder(where: "front" | "back") {
    this.updateShapes(
      this.getSelectedShapeIds().map((id, i) => ({
        id,
        index: `${where === "front" ? "z" : "A"}${Date.now()}-${i}`,
      })),
    );
  }
  run<T>(operation: () => T) {
    this.store.historyBoundary();
    return this.store.batch(operation);
  }
  undo() {
    this.store.restoreHistory("undo");
  }
  redo() {
    this.store.restoreHistory("redo");
  }
  async getSvgString(
    ids: string[],
    options: { background?: boolean; padding?: number } = {},
  ) {
    if (this.bridge?.exportSVG) return this.bridge.exportSVG(ids, options);
    const { exportSVG } = await import("./export");
    return exportSVG(this, ids, options);
  }
  async toImage(
    ids: string[],
    options: {
      format?: string;
      background?: boolean;
      padding?: number;
      scale?: number;
    } = {},
  ) {
    if (this.bridge?.exportPNG) return this.bridge.exportPNG(ids, options);
    const { exportPNG } = await import("./export");
    return exportPNG(this, ids, options);
  }
}
export function getSnapshot(store: CanvasStore): {
  document: DocumentSnapshot;
  session: CanvasSession;
} {
  return {
    document: {
      store: structuredClone(store.serialize()),
      schema: structuredClone(store.schema.serialize()),
    },
    session: structuredClone(store.session),
  };
}
export function loadSnapshot(
  store: CanvasStore,
  value: { document?: DocumentSnapshot; session?: CanvasSession | unknown },
) {
  if (value.document) store.replace(value.document);
  if (value.session) {
    store.session = normalizeSession(value.session, store);
    store.notifySession();
  }
}
