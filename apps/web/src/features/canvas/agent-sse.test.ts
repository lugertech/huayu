import { describe, expect, it } from "vite-plus/test";
import { Editor } from "@/features/canvas/engine/editor";
import { createCanvasStore } from "@/features/canvas/engine/store";
import {
  sceneFromEditor,
  applyNativeScene,
} from "@/features/canvas/excalidraw/scene";
import { AgentEventExecutor, completeAgentEvents } from "./agent-sse";

describe("AI drawing commands", () => {
  it.each(
    [
      { type: "pen", field: "isPen" },
      { type: "image", field: "playing" },
      { type: "video", field: "playing" },
    ].flatMap((shape) =>
      [
        { value: false, expected: false },
        { value: true, expected: true },
        { value: undefined, expected: true },
      ].map((state) => ({ ...shape, ...state })),
    ),
  )(
    "preserves $type / $field when value is $value",
    ({ type, field, value, expected }) => {
      const editor = new Editor(createCanvasStore());
      new AgentEventExecutor(editor).executeEvents([
        {
          _type: "create",
          shape: {
            type,
            shapeId: "flags",
            x: 0,
            y: 0,
            w: 120,
            h: 80,
            ...(value === undefined ? {} : { [field]: value }),
          },
        },
      ]);
      expect(editor.getShape("shape:flags")?.props[field]).toBe(expected);
    },
  );

  it("reports only complete events across streamed JSON chunks and quoted braces", () => {
    const text = JSON.stringify({
      events: [
        { _type: "message", text: '引号 \\" 与 {括号}' },
        {
          _type: "create",
          shape: {
            _type: "rectangle",
            shapeId: "a",
            x: 0,
            y: 0,
            w: 100,
            h: 60,
          },
        },
      ],
    });
    const firstEnd = text.indexOf("},{") + 1;
    expect(completeAgentEvents(text.slice(0, firstEnd))).toHaveLength(1);
    expect(completeAgentEvents(text.slice(0, -4))).toHaveLength(1);
    expect(completeAgentEvents(text)).toHaveLength(2);
  });
  it("keeps labels and dimensions editable after native migration and executes layout actions", () => {
    const editor = new Editor(createCanvasStore());
    const executor = new AgentEventExecutor(editor);
    executor.executeEvents([
      {
        _type: "create",
        shape: {
          _type: "rectangle",
          shapeId: "a",
          x: 0,
          y: 10,
          w: 100,
          h: 60,
          text: "原文字",
        },
      },
      {
        _type: "create",
        shape: {
          _type: "rectangle",
          shapeId: "b",
          x: 240,
          y: 100,
          w: 80,
          h: 40,
        },
      },
    ]);
    applyNativeScene(editor, sceneFromEditor(editor));
    executor.executeEvents([
      { _type: "label", shapeId: "a", text: "更新后的文字" },
      { _type: "update", update: { shapeId: "a", w: 180, h: 90 } },
      { _type: "align", shapeIds: ["a", "b"], alignment: "top" },
      {
        _type: "stack",
        shapeIds: ["a", "b"],
        direction: "horizontal",
        gap: 48,
      },
      { _type: "bringToFront", shapeIds: ["a"] },
    ]);
    expect(editor.getShape("shape:a")?.props.w).toBe(180);
    expect(editor.getShape("shape:a")?.props.h).toBe(90);
    expect(editor.getShape("shape:b")?.y).toBe(10);
    expect(editor.getShape("shape:b")?.x).toBe(228);
    expect(editor.getShape("shape:a")?.index.startsWith("z")).toBe(true);
    expect(
      (
        sceneFromEditor(editor).find(
          (element) => element.customData?.huayuLabelFor === "shape:a",
        ) as any
      ).text,
    ).toBe("更新后的文字");
    executor.executeEvents([
      {
        _type: "resize",
        shapeIds: ["a"],
        centerX: 0,
        centerY: 0,
        scaleX: 2,
        scaleY: 2,
      },
      { _type: "rotate", shapeIds: ["a"], centerX: 0, centerY: 0, degrees: 90 },
    ]);
    expect(editor.getShape("shape:a")?.props.w).toBe(360);
    expect(editor.getShape("shape:a")?.rotation).toBeCloseTo(Math.PI / 2);
  });
});
