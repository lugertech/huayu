import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore } from "@/canvas/editor";
import { connectShapes, connectedShapes } from "@/utils/connectionParser";
import {
  applyNativeScene,
  sceneFromEditor,
  shapeIdForElement,
  selectedShapesFromScene,
  sceneBeforeLocalChange,
} from "./scene";

function editor() {
  return new Editor(createCanvasStore());
}
describe("Excalidraw record compatibility", () => {
  it("captures only local card changes while rebasing unrelated native metadata", () => {
    const board = editor();
    board.createShape({
      id: "shape:local",
      type: "ai-text",
      props: { text: "Draft" },
    });
    board.createShape({
      id: "shape:remote",
      type: "instruction",
      props: { text: "Shared" },
    });
    const initial = sceneFromEditor(board);
    board.updateShape({ id: "shape:local", props: { text: "Local edit" } });
    const next = sceneFromEditor(board).map((element) => ({
      ...element,
      version: element.version + 1,
      index: "a1" as typeof element.index,
    }));
    const before = sceneBeforeLocalChange(
      initial,
      next,
      new Set(["shape:local"]),
    );
    expect(before.find((element) => element.id === "shape:local")).toBe(
      initial.find((element) => element.id === "shape:local"),
    );
    expect(before.find((element) => element.id === "shape:remote")).toBe(
      next.find((element) => element.id === "shape:remote"),
    );
  });

  it("keeps additions out of the baseline and deletions in it until native history captures them", () => {
    const board = editor();
    board.createShape({ id: "shape:removed", type: "ai-text" });
    const current = sceneFromEditor(board);
    board.deleteShapes(["shape:removed"]);
    board.createShape({ id: "shape:added", type: "ai-text" });
    const next = sceneFromEditor(board);
    expect(
      sceneBeforeLocalChange(
        current,
        next,
        new Set(["shape:removed", "shape:added"]),
      ),
    ).toEqual(current);
  });

  it("gives uncached card edits distinct native versions without changing untouched cards", () => {
    const board = editor();
    board.createShape({
      id: "shape:local",
      type: "ai-text",
      props: { text: "First draft" },
    });
    board.createShape({
      id: "shape:remote",
      type: "instruction",
      props: { text: "Original instruction" },
    });
    const initial = sceneFromEditor(board);
    expect(sceneFromEditor(board)).toEqual(initial);
    expect(board.getShape("shape:local").props.excalidraw).toBeUndefined();
    board.updateShape({ id: "shape:local", props: { text: "Local edit" } });
    const local = sceneFromEditor(board);
    expect(
      local.find((element) => element.id === "shape:local")!.versionNonce,
    ).not.toBe(
      initial.find((element) => element.id === "shape:local")!.versionNonce,
    );
    expect(local.find((element) => element.id === "shape:remote")).toEqual(
      initial.find((element) => element.id === "shape:remote"),
    );
    board.store.mergeRemoteChanges(() => {
      board.updateShape({ id: "shape:remote", props: { text: "Remote edit" } });
    });
    const remote = sceneFromEditor(board);
    expect(remote.find((element) => element.id === "shape:local")).toEqual(
      local.find((element) => element.id === "shape:local"),
    );
    expect(
      remote.find((element) => element.id === "shape:remote")!.versionNonce,
    ).not.toBe(
      local.find((element) => element.id === "shape:remote")!.versionNonce,
    );
    expect(sceneFromEditor(board)).toEqual(remote);
  });
  it("preserves a newly created selection across an earlier camera notification, but allows native deselection and deletion", () => {
    const board = editor();
    board.createShape({ id: "shape:old", type: "ai-text" });
    const olderScene = sceneFromEditor(board);
    board.createShape({ id: "shape:new", type: "instruction" });
    board.select("shape:new");
    expect(selectedShapesFromScene(board, [], {})).toEqual(["shape:new"]);
    expect(
      selectedShapesFromScene(board, olderScene, { "shape:old": true }),
    ).toEqual(["shape:new"]);
    const scene = sceneFromEditor(board);
    expect(selectedShapesFromScene(board, scene, {})).toEqual([]);
    expect(
      selectedShapesFromScene(board, scene, { "shape:new": true }),
    ).toEqual(["shape:new"]);
    expect(
      selectedShapesFromScene(
        board,
        scene.map((element) => ({ ...element, isDeleted: true })),
        { "shape:new": true },
      ),
    ).toEqual([]);
  });
  it("reads legacy cards, geometry and both arrow bindings without rewriting records", () => {
    const board = editor();
    board.createShape({
      id: "shape:input",
      type: "ai-text",
      x: 40,
      y: 80,
      props: { w: 320, h: 220, text: "保留素材" },
    });
    board.createShape({
      id: "shape:task",
      type: "instruction",
      x: 440,
      y: 80,
      props: { w: 340, h: 260, text: "整理内容" },
    });
    connectShapes(board, "shape:input", "shape:task");
    const before = JSON.stringify(board.store.serialize());
    const scene = sceneFromEditor(board) as any[];
    expect(JSON.stringify(board.store.serialize())).toBe(before);
    expect(
      scene.filter(
        (element) => element.type === "rectangle" && element.customData?.huayu,
      ),
    ).toHaveLength(2);
    expect(scene.every((element) => !element.link)).toBe(true);
    const arrow = scene.find((element) => element.type === "arrow");
    expect(arrow.strokeColor).toBe("#000000");
    expect(arrow.strokeWidth).toBe(2);
    expect(arrow.startArrowhead).toBeNull();
    expect(arrow.endArrowhead).toBe("triangle");
    expect(arrow.startBinding.elementId).toBe("shape:input");
    expect(arrow.endBinding.elementId).toBe("shape:task");
    applyNativeScene(board, scene);
    expect(
      board
        .getCurrentPageShapes()
        .filter((shape) => shape.type === "arrow")
        .every((shape) => shape.props.w > 0 && shape.props.h > 0),
    ).toBe(true);
    expect(
      connectedShapes(board, "shape:task", "previous").map((shape) => shape.id),
    ).toEqual(["shape:input"]);
    expect(board.getShape("shape:input").props.text).toBe("保留素材");
  });
  it("uses filled triangle defaults and preserves explicitly edited native arrow styles", () => {
    const board = editor();
    board.createShape({ id: "shape:arrow", type: "arrow" });
    const initial = sceneFromEditor(board) as any[];
    expect(initial[0]).toMatchObject({
      type: "arrow",
      strokeColor: "#000000",
      strokeWidth: 2,
      startArrowhead: null,
      endArrowhead: "triangle",
    });
    applyNativeScene(board, initial);
    expect(sceneFromEditor(board)[0]).toMatchObject({
      strokeColor: "#000000",
      strokeWidth: 2,
      endArrowhead: "triangle",
    });
    applyNativeScene(board, [
      {
        ...initial[0],
        strokeColor: "#e03131",
        strokeWidth: 4,
        startArrowhead: "dot",
        endArrowhead: "arrow",
        version: initial[0].version + 1,
        versionNonce: initial[0].versionNonce + 1,
      },
    ]);
    expect(sceneFromEditor(board)[0]).toMatchObject({
      strokeColor: "#e03131",
      strokeWidth: 4,
      startArrowhead: "dot",
      endArrowhead: "arrow",
    });
  });
  it("keeps nested rotated frame coordinates through a native round trip", () => {
    const board = editor();
    board.createShape({
      id: "shape:frame",
      type: "frame",
      x: 210,
      y: 120,
      rotation: Math.PI / 6,
      props: { w: 600, h: 400, name: "结构图" },
    });
    board.createShape({
      id: "shape:child",
      type: "geo",
      parentId: "shape:frame",
      x: 40,
      y: 50,
      rotation: Math.PI / 8,
      props: { w: 180, h: 100, geo: "rectangle", text: "中文标签" },
    });
    const before = board.getPageTransform(board.getShape("shape:child"));
    const scene = sceneFromEditor(board);
    applyNativeScene(board, scene);
    const after = board.getPageTransform(board.getShape("shape:child"));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.rotation).toBeCloseTo(before.rotation, 6);
    expect(board.getShape("shape:child").parentId).toBe("shape:frame");
    expect(board.getShape("shape:child").props.text).toBe("中文标签");
  });
  it("retains pressure, elbow points, grouping and native extension data", () => {
    const board = editor();
    board.createShape({
      id: "shape:seed",
      type: "geo",
      props: { w: 100, h: 50 },
    });
    const base = sceneFromEditor(board)[0] as any;
    const ink = {
      ...base,
      id: "native-ink",
      type: "freedraw",
      customData: { futureField: { value: 12 } },
      points: [
        [0, 0],
        [18, 9],
        [40, 1],
      ],
      pressures: [0.1, 0.8, 0.3],
      simulatePressure: false,
      groupIds: ["group-native"],
      width: 40,
      height: 9,
    };
    applyNativeScene(board, [ink]);
    const restored = sceneFromEditor(board)[0] as any;
    expect(restored.points).toEqual(ink.points);
    expect(restored.pressures).toEqual(ink.pressures);
    expect(restored.groupIds).toEqual(ink.groupIds);
    expect(restored.customData.futureField).toEqual({ value: 12 });
    expect(board.getShape("shape:seed")).toBeUndefined();
  });
  it("duplicates embedded AI content with a new record identity", () => {
    const board = editor();
    board.createShape({
      id: "shape:note",
      type: "instruction",
      props: { w: 340, h: 260, text: "保留我的要求", result: "已生成的内容" },
    });
    const original = sceneFromEditor(board)[0];
    const copy = {
      ...structuredClone(original),
      id: "duplicated-native",
      x: 500,
    };
    applyNativeScene(board, [original, copy]);
    expect(board.getCurrentPageShapes()).toHaveLength(2);
    expect(board.getShape("shape:duplicated-native").props.result).toBe(
      "已生成的内容",
    );
    expect(shapeIdForElement(board, copy)).toBe("shape:duplicated-native");
  });
  it("preserves native shape conversion and complete scene deletion", () => {
    const board = editor();
    board.createShape({
      id: "shape:rectangle",
      type: "geo",
      props: { w: 120, h: 80, geo: "rectangle" },
    });
    const diamond = { ...sceneFromEditor(board)[0], type: "diamond" } as any;
    applyNativeScene(board, [diamond]);
    expect((sceneFromEditor(board)[0] as any).type).toBe("diamond");
    applyNativeScene(board, []);
    expect(board.getCurrentPageShapes()).toHaveLength(0);
  });
  it("pastes a native scene onto another page without moving the original records", () => {
    const board = editor();
    const originalPage = board.getCurrentPageId();
    board.createShape({
      id: "shape:input",
      type: "geo",
      props: { w: 180, h: 100, text: "原页面标签" },
    });
    board.createShape({
      id: "shape:task",
      type: "instruction",
      x: 400,
      props: { w: 340, h: 260, text: "原始指令" },
    });
    connectShapes(board, "shape:input", "shape:task");
    const scene = sceneFromEditor(board);
    const nextPage = board.createPage("副本");
    applyNativeScene(board, structuredClone(scene));
    expect(board.pageOf("shape:input")).toBe(originalPage);
    expect(board.getCurrentPageShapes()).toHaveLength(3);
    const input = board
      .getCurrentPageShapes()
      .find((shape) => shape.type === "geo")!;
    const task = board
      .getCurrentPageShapes()
      .find((shape) => shape.type === "instruction")!;
    expect(input.id).not.toBe("shape:input");
    expect(input.props.text).toBe("原页面标签");
    expect(
      connectedShapes(board, task.id, "previous").map((shape) => shape.id),
    ).toEqual([input.id]);
    expect(board.pageOf(task.id)).toBe(nextPage);
    board.setCurrentPage(originalPage);
    expect(
      connectedShapes(board, "shape:task", "previous").map((shape) => shape.id),
    ).toEqual(["shape:input"]);
  });
  it("moves a bound arrow when a workflow or agent changes its target position", () => {
    const board = editor();
    board.createShape({
      id: "shape:a",
      type: "ai-text",
      props: { w: 320, h: 220, text: "素材" },
    });
    board.createShape({
      id: "shape:b",
      type: "instruction",
      x: 500,
      props: { w: 340, h: 260, text: "整理" },
    });
    connectShapes(board, "shape:a", "shape:b");
    applyNativeScene(board, sceneFromEditor(board));
    const before = sceneFromEditor(board).find(
      (element) => element.type === "arrow",
    ) as any;
    board.updateShape({ id: "shape:b", type: "instruction", x: 700, y: 120 });
    const after = sceneFromEditor(board).find(
      (element) => element.type === "arrow",
    ) as any;
    expect(after.x + after.points.at(-1)[0]).toBeCloseTo(
      before.x + before.points.at(-1)[0] + 200,
    );
    expect(after.y + after.points.at(-1)[1]).toBeCloseTo(
      before.y + before.points.at(-1)[1] + 120,
    );
    expect(after.endBinding.elementId).toBe("shape:b");
  });
});
