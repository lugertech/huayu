import { LocalizedError } from "@/i18n/errors";
import {
  createShapeId,
  createBindingId,
  type ShapeId,
  plainText,
} from "@/features/canvas/engine/model";
import { loadSnapshot } from "@/features/canvas/engine/editor";
function normalizeShapeId(id?: string): ShapeId {
  return id?.startsWith("shape:") ? (id as ShapeId) : createShapeId(id);
}
import { chat, parseModelJSON } from "../../ai/provider";
import { blobForSource, blobAsDataURL } from "../../api/resources";
import { modelPrompts } from "@/ai/prompts";
import { getSettings, requireConnection } from "@/ai/settings";
import { executeLayoutEvent } from "./agent-layout";

// Agent API请求接口
export interface AgentAPIRequest {
  query: string;
  viewport_bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  shapes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    type: string;
    shapeId: string;
    text: string;
  }>;
  stream: boolean;
  snapshot?: string;
}

// Agent响应中的事件类型
export interface AgentEvent {
  _type:
    | "message"
    | "think"
    | "create"
    | "delete"
    | "move"
    | "update"
    | "label"
    | "review"
    | string;
  [key: string]: any;
}

export interface AgentResponse {
  events?: AgentEvent[];
  actions?: AgentEvent[]; // 兼容两种格式
}

export class AgentAPIError extends LocalizedError {}

export function completeAgentEvents(text: string): AgentEvent[] {
  const start = text.search(/"(?:events|actions)"\s*:\s*\[/);
  if (start < 0) return [];
  const offset = text.indexOf("[", start) + 1;
  const events: AgentEvent[] = [];
  let depth = 0;
  let token: "object" | "string" | "escape" = "object";
  let begin = -1;
  for (let i = offset; i < text.length; i++) {
    const char = text[i];
    if (token !== "object") {
      if (token === "escape") token = "string";
      else if (char === "\\") token = "escape";
      else if (char === '"') token = "object";
      continue;
    }
    if (char === '"') {
      token = "string";
      continue;
    }
    if (char === "{" && depth++ === 0) begin = i;
    if (char === "}" && --depth === 0 && begin >= 0) {
      try {
        events.push(JSON.parse(text.slice(begin, i + 1)));
      } catch {
        break;
      }
    }
    if (char === "]" && depth === 0) break;
  }
  return events;
}

export async function callAgentSSE(
  request: AgentAPIRequest,
  onProgress?: (events: AgentEvent[]) => void,
  signal?: AbortSignal,
  settings = getSettings(),
): Promise<AgentEvent[]> {
  const capability = request.snapshot ? "vision" : "text";
  const connection = requireConnection(capability, settings);
  const content: import("../../ai/provider").ChatPart[] = [
    {
      type: "text",
      text: JSON.stringify({
        query: request.query,
        viewport_bounds: request.viewport_bounds,
        shapes: request.shapes,
      }),
    },
  ];
  if (request.snapshot)
    content.push({
      type: "image_url",
      image_url: {
        url: request.snapshot.startsWith("data:")
          ? request.snapshot
          : await blobAsDataURL(await blobForSource(request.snapshot, signal)),
      },
    });
  let partial = "";
  let delivered = 0;
  const raw = await chat(
    [
      { role: "system", content: modelPrompts().agent },
      { role: "user", content },
    ],
    {
      capability,
      connection,
      signal,
      onDelta: request.stream
        ? (delta) => {
            partial += delta;
            const events = completeAgentEvents(partial);
            if (events.length > delivered) {
              onProgress?.(events.slice(delivered));
              delivered = events.length;
            }
          }
        : undefined,
    },
  );
  const response = parseModelJSON<AgentResponse>(raw);
  const events = response.events || response.actions;
  if (!Array.isArray(events))
    throw new AgentAPIError({
      key: "canvas.theModelReturnedInvalidDrawingActions",
    });
  signal?.throwIfAborted();
  if (events.length > delivered) onProgress?.(events.slice(delivered));
  return events;
}

export function buildAgentRequest(
  query: string,
  viewportBounds: { x: number; y: number; w: number; h: number },
  shapes: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    text?: string;
  }> = [],
  snapshot?: string,
): AgentAPIRequest {
  const request: AgentAPIRequest = {
    query,
    viewport_bounds: viewportBounds,
    shapes: shapes.map((shape) => ({
      x: shape.x,
      y: shape.y,
      w: shape.w || 0,
      h: shape.h || 0,
      type: shape.type,
      shapeId: shape.id,
      text: shape.text || "",
    })),
    stream: true,
  };

  if (snapshot) {
    request.snapshot = snapshot;
  }

  return request;
}

/**
 * 事件执行器 - 将Agent事件转换为画布操作
 */
export class AgentEventExecutor {
  private editor: any;

  constructor(editor: any) {
    this.editor = editor;
  }

  /**
   * 执行事件列表
   */
  executeEvents(events: AgentEvent[]): void {
    const before = this.editor.store.getDocumentSnapshot();
    try {
      this.editor.run(() => {
        for (const event of events) {
          const normalized = {
            ...event,
            ...(event.shapeId
              ? { shapeId: normalizeShapeId(event.shapeId) }
              : {}),
            ...(event.update
              ? {
                  update: {
                    ...event.update,
                    shapeId: normalizeShapeId(event.update.shapeId),
                  },
                }
              : {}),
          };
          this.executeEvent(normalized);
        }
      });
    } catch {
      loadSnapshot(this.editor.store, { document: before });
      throw new AgentAPIError({ key: "canvas.drawingActionsCannotBeApplied" });
    }
  }

  /**
   * 执行单个事件
   */
  private executeEvent(event: AgentEvent): void {
    // 支持 type 和 _type 两种字段名
    const eventType = event.type || event._type;
    if (executeLayoutEvent(this.editor, event)) return;

    switch (eventType) {
      case "message":
      case "think":
      case "review":
      case "update-todo-list":
        // These events do not create or update canvas records.
        break;
      case "create":
        this.handleCreate(event);
        break;
      case "delete":
        this.handleDelete(event);
        break;
      case "move":
        this.handleMove(event);
        break;
      case "update":
        this.handleUpdate(event);
        break;
      case "label":
        this.handleLabel(event);
        break;
      case "pen":
        this.handlePen(event);
        break;
      default:
    }
  }

  private handleCreate(event: any): void {
    const { shape } = event;
    if (!shape) return;

    // 使用提供的shapeId或创建新的
    const shapeId = shape.shapeId
      ? normalizeShapeId(shape.shapeId)
      : createShapeId();
    const shapeProps: any = {
      id: shapeId,
      x: shape.x,
      y: shape.y,
    };

    // 从Agent返回的数据中获取shape类型
    const aliases: Record<string, string> = {
      pill: "oval",
      "parallelogram-right": "rhombus",
      "parallelogram-left": "rhombus-2",
      "fat-arrow-right": "arrow-right",
      "fat-arrow-left": "arrow-left",
      "fat-arrow-up": "arrow-up",
      "fat-arrow-down": "arrow-down",
    };
    const shapeType =
      aliases[shape.type || shape._type] || shape.type || shape._type;

    // 根据类型映射画布 shape
    switch (shapeType) {
      // Geo 形状类型
      case "rectangle":
      case "ellipse":
      case "triangle":
      case "diamond":
      case "hexagon":
      case "oval":
      case "cloud":
      case "pentagon":
      case "octagon":
      case "star":
      case "rhombus":
      case "rhombus-2":
      case "trapezoid":
      case "arrow-right":
      case "arrow-left":
      case "arrow-up":
      case "arrow-down":
      case "x-box":
      case "check-box":
      case "heart":
        // 所有这些都是 geo 形状的子类型
        shapeProps.type = "geo";
        shapeProps.props = {
          geo: this.mapGeoType(shapeType),
          w: shape.w,
          h: shape.h,
          fill: this.mapFillType(shape.fill || "none"),
          color: this.mapColor(shape.color),
          dash: this.mapDashType(shape.dash || "solid"),
          size: this.mapSizeType(shape.size || "m"),
          font: this.mapFontType(shape.font || "draw"),
          align: this.mapAlignType(shape.align || "middle"),
          verticalAlign: this.mapVerticalAlignType(
            shape.verticalAlign || "middle",
          ),
        };

        // 如果有文本，geo shape 使用 richText 属性
        if (shape.text) {
          shapeProps.props.richText = {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: shape.text,
                  },
                ],
              },
            ],
          };
        }
        break;

      // 笔记类型 - 映射为 note shape 或 text shape
      case "note":
        shapeProps.type = "note";
        shapeProps.props = {
          w: shape.w || 200,
          h: shape.h || 100,
          color: this.mapColor(shape.color || "yellow"),
          fill: this.mapFillType(shape.fill || "solid"),
          size: this.mapSizeType(shape.size || "m"),
          font: this.mapFontType(shape.font || "draw"),
          align: this.mapAlignType(shape.align || "start"),
          verticalAlign: this.mapVerticalAlignType(
            shape.verticalAlign || "start",
          ),
        };

        // 如果有文本 使用 richText 属性
        if (shape.text) {
          shapeProps.props.richText = {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: shape.text,
                  },
                ],
              },
            ],
          };
        }
        break;

      // 画笔/手绘类型
      case "pen":
        shapeProps.type = "draw";
        shapeProps.props = {
          color: this.mapColor(shape.color),
          size: this.mapSizeType(shape.size || "m"),
          segments: shape.segments || [],
          isPen: shape.isPen ?? true,
        };
        break;

      case "text":
        // 只在真正需要纯文本元素时创建text shape
        shapeProps.type = "text";
        shapeProps.props = {
          color: this.mapColor(shape.color || "black"),
          size: "m",
          font: "draw",
          textAlign: shape.textAlign || "start",
          autoSize: true,
          // text shape使用richText而不是text
          richText: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: shape.text
                  ? [
                      {
                        type: "text",
                        text: shape.text,
                      },
                    ]
                  : [],
              },
            ],
          },
          w: shape.w || 200,
        };
        break;

      case "line":
        shapeProps.type = "line";
        shapeProps.props = {
          color: this.mapColor(shape.color),
          dash: "solid",
          size: "m",
          spline: "line",
          // line使用points而不是handles
          points: {
            a1: {
              id: "a1",
              index: "a1" as any,
              x: 0,
              y: 0,
            },
            a2: {
              id: "a2",
              index: "a2" as any,
              x: (shape.x2 || 0) - (shape.x1 || 0),
              y: (shape.y2 || 0) - (shape.y1 || 0),
            },
          },
        };
        // line的位置设置为起点
        shapeProps.x = shape.x1 || shape.x || 0;
        shapeProps.y = shape.y1 || shape.y || 0;
        break;

      case "arrow":
        shapeProps.type = "arrow";
        shapeProps.props = {
          color: this.mapColor(shape.color),
          text: shape.text || "",
          bend: shape.bend || 0,
          dash: "solid",
          size: "m",
          // arrow使用start和end属性，相对于arrow的x,y位置
          start: {
            x: 0,
            y: 0,
          },
          end: {
            x: (shape.x2 || 0) - (shape.x1 || 0),
            y: (shape.y2 || 0) - (shape.y1 || 0),
          },
        };
        // arrow的位置设置为起点
        shapeProps.x = shape.x1 || shape.x || 0;
        shapeProps.y = shape.y1 || shape.y || 0;
        break;

      case "frame":
        shapeProps.type = "frame";
        shapeProps.props = {
          w: shape.w || 200,
          h: shape.h || 200,
          name: shape.name || shape.text || "",
        };
        break;

      case "group":
        // group 通常不通过 createShape 直接创建，而是通过 groupShapes
        return;

      case "image":
        shapeProps.type = "image";
        shapeProps.props = {
          w: shape.w || 200,
          h: shape.h || 200,
          assetId: shape.assetId || null,
          playing: shape.playing ?? true,
          url: shape.url || "",
        };
        break;

      case "video":
        shapeProps.type = "video";
        shapeProps.props = {
          w: shape.w || 200,
          h: shape.h || 200,
          assetId: shape.assetId || null,
          playing: shape.playing ?? true,
          currentTime: shape.currentTime || 0,
        };
        break;

      case "embed":
        shapeProps.type = "embed";
        shapeProps.props = {
          w: shape.w || 200,
          h: shape.h || 200,
          url: shape.url || "",
        };
        break;

      case "bookmark":
        shapeProps.type = "bookmark";
        shapeProps.props = {
          w: shape.w || 300,
          h: shape.h || 320,
          assetId: shape.assetId || null,
          url: shape.url || "",
        };
        break;

      case "draw":
        shapeProps.type = "draw";
        shapeProps.props = {
          color: this.mapColor(shape.color || "black"),
          fill: this.mapFillType(shape.fill || "none"),
          dash: this.mapDashType(shape.dash || "draw"),
          size: this.mapSizeType(shape.size || "m"),
          segments: shape.segments || [
            {
              type: "free",
              points: shape.points || [{ x: 0, y: 0, z: 0.5 }],
            },
          ],
          isComplete: shape.isComplete || false,
          isClosed: shape.isClosed || false,
          isPen: shape.isPen || false,
        };
        break;

      case "highlight":
        shapeProps.type = "highlight";
        shapeProps.props = {
          color: this.mapColor(shape.color || "yellow"),
          size: this.mapSizeType(shape.size || "m"),
          segments: shape.segments || [
            {
              type: "free",
              points: shape.points || [{ x: 0, y: 0, z: 0.5 }],
            },
          ],
          isComplete: shape.isComplete || false,
          isPen: shape.isPen || false,
        };
        break;

      default:
        // 尝试创建一个基础的几何形状作为回退
        shapeProps.type = "geo";
        shapeProps.props = {
          geo: "rectangle",
          w: shape.w || 100,
          h: shape.h || 100,
          fill: "none",
          color: "black",
        };
        break;
    }

    if (shapeProps.props.richText)
      shapeProps.props.text = plainText(shapeProps.props.richText);
    this.editor.createShape(shapeProps);
    if (shapeProps.type === "arrow") {
      for (const [terminal, source] of [
        ["start", shape.fromId],
        ["end", shape.toId],
      ] as const) {
        if (!source) continue;
        const target = normalizeShapeId(source);
        if (!this.editor.getShape(target))
          throw new AgentAPIError({
            key: "canvas.aShapeConnectedByThisArrowNoLongerExists",
          });
        this.editor.createBinding({
          id: createBindingId(),
          type: "arrow",
          fromId: shapeId,
          toId: target,
          props: {
            terminal,
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isPrecise: false,
            isExact: false,
          },
        });
      }
    }
  }

  private handleDelete(event: any): void {
    this.editor.deleteShape(event.shapeId);
  }

  private handleMove(event: any): void {
    const existingShape = this.editor.getShape(event.shapeId);
    if (!existingShape) return;

    this.editor.updateShape({
      id: event.shapeId,
      type: existingShape.type,
      x: event.x,
      y: event.y,
    });
  }

  private handleUpdate(event: any): void {
    const existingShape = this.editor.getShape(event.update.shapeId);
    if (!existingShape) return;

    const updateData = { ...event.update };
    const newShapeType = updateData._type || updateData.type;
    delete updateData.shapeId;
    delete updateData._type;
    delete updateData.type;

    // 检查是否需要改变形状类型
    if (
      newShapeType &&
      this.needsShapeTypeChange(existingShape.type, newShapeType)
    ) {
      // 如果需要改变形状类型，删除旧形状并创建新形状
      this.editor.deleteShape(existingShape.id);
      this.handleCreate({
        shape: {
          ...updateData,
          type: newShapeType,
          _type: newShapeType,
          shapeId: existingShape.id.replace("shape:", ""),
        },
      });
      return;
    }

    // 根据shape类型分离属性
    const shapeUpdate: any = {
      id: event.update.shapeId,
      type: existingShape.type,
    };

    if (existingShape.type === "line") {
      // line shape 特殊处理
      const { x1, y1, x2, y2, color, dash, size } = updateData;

      // line的位置通过x,y设置（通常是起点）
      if (x1 !== undefined && y1 !== undefined) {
        shapeUpdate.x = x1;
        shapeUpdate.y = y1;
      }

      // line的终点通过props.points设置
      if (
        x1 !== undefined &&
        y1 !== undefined &&
        x2 !== undefined &&
        y2 !== undefined
      ) {
        shapeUpdate.props = {
          ...existingShape.props,
          points: {
            a1: {
              id: "a1",
              index: "a1" as any,
              x: 0,
              y: 0,
            },
            a2: {
              id: "a2",
              index: "a2" as any,
              x: x2 - x1,
              y: y2 - y1,
            },
          },
        };
      }

      // 设置line的样式属性
      if (color || dash || size) {
        if (!shapeUpdate.props) {
          shapeUpdate.props = { ...existingShape.props };
        }
        if (color) shapeUpdate.props.color = this.mapColor(color);
        if (dash) shapeUpdate.props.dash = dash;
        if (size) shapeUpdate.props.size = size;
      }
    } else if (existingShape.type === "arrow") {
      // arrow shape 特殊处理
      const { x1, y1, x2, y2, color, dash, size, text } = updateData;

      // arrow的位置通过x,y设置（通常是起点）
      if (x1 !== undefined && y1 !== undefined) {
        shapeUpdate.x = x1;
        shapeUpdate.y = y1;
      }

      // arrow的终点通过props.start和props.end设置
      if (
        x1 !== undefined &&
        y1 !== undefined &&
        x2 !== undefined &&
        y2 !== undefined
      ) {
        shapeUpdate.props = {
          ...existingShape.props,
          start: { x: 0, y: 0 },
          end: { x: x2 - x1, y: y2 - y1 },
        };
      }

      // 设置arrow的样式属性
      if (color || dash || size || text) {
        if (!shapeUpdate.props) {
          shapeUpdate.props = { ...existingShape.props };
        }
        if (color) shapeUpdate.props.color = this.mapColor(color);
        if (dash) shapeUpdate.props.dash = dash;
        if (size) shapeUpdate.props.size = size;
        if (text) shapeUpdate.props.text = text;
      }
    } else {
      // 其他shape类型的通用处理
      const { x, y, w, h, ...styleProps } = updateData;

      // 如果有位置属性，直接设置在 shape 层级
      if (x !== undefined) shapeUpdate.x = x;
      if (y !== undefined) shapeUpdate.y = y;

      // 根据shape类型过滤有效的样式属性
      if (
        Object.keys(styleProps).length > 0 ||
        w !== undefined ||
        h !== undefined
      ) {
        let filteredProps: any = {};

        if (existingShape.type === "geo") {
          // geo shape 支持的所有属性
          const allowedGeoProps = [
            "align",
            "color",
            "dash",
            "fill",
            "font",
            "geo",
            "growY",
            "h",
            "labelColor",
            "richText",
            "scale",
            "size",
            "url",
            "verticalAlign",
            "w",
          ];

          // 如果有新的几何形状类型，更新 geo 属性
          if (newShapeType && this.isGeoShape(newShapeType)) {
            filteredProps.geo = this.mapGeoType(newShapeType);
          }

          // 处理文本/注释更新
          if (styleProps.text) {
            filteredProps.richText = {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: styleProps.text,
                    },
                  ],
                },
              ],
            };
          }

          Object.keys(styleProps).forEach((key) => {
            if (
              allowedGeoProps.includes(key) &&
              key !== "text" &&
              key !== "note"
            ) {
              if (key === "fill") {
                // fill 属性需要映射为有效的填充类型
                filteredProps[key] = this.mapFillType(styleProps[key]);
              } else if (key === "color" || key === "labelColor") {
                // color 属性需要映射为有效的颜色
                filteredProps[key] = this.mapColor(styleProps[key]);
              } else if (key === "dash") {
                // dash 属性需要映射为有效的线条样式
                filteredProps[key] = this.mapDashType(styleProps[key]);
              } else if (key === "size") {
                // size 属性需要映射为有效的尺寸
                filteredProps[key] = this.mapSizeType(styleProps[key]);
              } else if (key === "font") {
                // font 属性需要映射为有效的字体
                filteredProps[key] = this.mapFontType(styleProps[key]);
              } else if (key === "align") {
                // align 属性需要映射为有效的对齐方式
                filteredProps[key] = this.mapAlignType(styleProps[key]);
              } else if (key === "verticalAlign") {
                // verticalAlign 属性需要映射为有效的垂直对齐方式
                filteredProps[key] = this.mapVerticalAlignType(styleProps[key]);
              } else {
                filteredProps[key] = styleProps[key];
              }
            }
          });
        } else if (existingShape.type === "text") {
          // text shape 特殊处理
          const allowedTextProps = [
            "align",
            "autoSize",
            "color",
            "font",
            "richText",
            "scale",
            "size",
            "textAlign",
            "w",
          ];

          Object.keys(styleProps).forEach((key) => {
            if (allowedTextProps.includes(key) || key === "text") {
              if (key === "text") {
                // text 属性需要转换为 richText
                filteredProps.richText = {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: styleProps[key],
                        },
                      ],
                    },
                  ],
                };
              } else if (key === "color") {
                filteredProps[key] = this.mapColor(styleProps[key]);
              } else if (key === "font") {
                filteredProps[key] = this.mapFontType(styleProps[key]);
              } else if (key === "size") {
                filteredProps[key] = this.mapSizeType(styleProps[key]);
              } else if (key === "align" || key === "textAlign") {
                filteredProps[key] = this.mapAlignType(styleProps[key]);
              } else {
                filteredProps[key] = styleProps[key];
              }
            }
          });
        } else {
          // 其他类型的shape，保留所有属性
          filteredProps = styleProps;
        }

        shapeUpdate.props = {
          ...existingShape.props,
          ...filteredProps,
        };

        // 如果有尺寸属性，也放在 props 中
        if (w !== undefined) shapeUpdate.props.w = w;
        if (h !== undefined) shapeUpdate.props.h = h;
      }
    }

    if (shapeUpdate.props?.richText)
      shapeUpdate.props.text = plainText(shapeUpdate.props.richText);
    if (
      shapeUpdate.props &&
      ["arrow", "line"].includes(existingShape.type) &&
      updateData.x2 !== undefined
    )
      shapeUpdate.props.excalidraw = undefined;
    this.editor.updateShape(shapeUpdate);
  }

  private handleLabel(event: any): void {
    const existingShape = this.editor.getShape(event.shapeId);
    if (!existingShape) return;

    const updateProps: any = { ...existingShape.props, text: event.text };

    // 根据shape类型设置正确的文本属性
    if (existingShape.type === "geo") {
      // geo shape 使用 richText
      updateProps.richText = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: event.text,
              },
            ],
          },
        ],
      };
    } else if (existingShape.type === "text") {
      // text shape 也使用 richText
      updateProps.richText = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: event.text,
              },
            ],
          },
        ],
      };
    } else {
      // 其他类型的shape可能支持直接的text属性
      updateProps.text = event.text;
    }

    this.editor.updateShape({
      id: event.shapeId,
      type: existingShape.type,
      props: updateProps,
    });
  }

  private handlePen(event: any): void {
    if (
      !event.points ||
      !Array.isArray(event.points) ||
      event.points.length === 0
    ) {
      return;
    }

    // 生成唯一的shape ID
    const shapeId = createShapeId();

    // 计算边界框以确定shape的位置和尺寸
    const xs = event.points.map((p: any) => p.x);
    const ys = event.points.map((p: any) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    // 调整points相对于shape的原点
    const adjustedSegments = [
      {
        type: "free",
        points: event.points.map((point: any) => ({
          x: point.x - minX,
          y: point.y - minY,
          z: 0.5,
        })),
      },
    ];

    const shapeProps: any = {
      id: shapeId,
      type: "draw",
      x: minX,
      y: minY,
      props: {
        color: this.mapColor(event.color || "black"),
        fill: this.mapFillType(event.fill || "none"),
        dash: this.mapDashType(event.style === "smooth" ? "draw" : "solid"),
        size: this.mapSizeType("m"), // 默认中等大小
        segments: adjustedSegments,
        isComplete: event.closed || true,
        isClosed: event.closed || false,
        isPen: true, // 标记为笔画
      },
    };

    // 创建形状
    this.editor.createShape(shapeProps);
  }

  /**
   * 颜色映射
   */
  private mapColor(color: string): string {
    const colorMap: Record<string, string> = {
      "light-blue": "light-blue",
      "light-green": "light-green",
      "light-yellow": "yellow",
      "light-orange": "orange",
      "light-violet": "violet",
      "light-red": "light-red",
      "light-grey": "grey",
      red: "red",
      green: "green",
      blue: "blue",
      orange: "orange",
      yellow: "yellow",
      black: "black",
      violet: "violet",
      grey: "grey",
      white: "white",
    };
    return colorMap[color] || "black";
  }

  /**
   * 检查是否需要改变形状类型
   */
  private needsShapeTypeChange(
    currentType: string,
    newShapeType: string,
  ): boolean {
    // 将新的形状类型映射到 画布 的实际类型
    let targetType: string;

    // 判断新形状类型应该映射为什么 画布 类型
    if (
      [
        "rectangle",
        "ellipse",
        "triangle",
        "diamond",
        "hexagon",
        "oval",
        "cloud",
        "pentagon",
        "octagon",
        "star",
        "rhombus",
        "rhombus-2",
        "trapezoid",
        "arrow-right",
        "arrow-left",
        "arrow-up",
        "arrow-down",
        "x-box",
        "check-box",
        "heart",
      ].includes(newShapeType)
    ) {
      targetType = "geo";
    } else if (newShapeType === "line") {
      targetType = "line";
    } else if (newShapeType === "arrow") {
      targetType = "arrow";
    } else if (newShapeType === "text") {
      targetType = "text";
    } else if (newShapeType === "note") {
      targetType = "note";
    } else if (newShapeType === "pen") {
      targetType = "draw";
    } else {
      targetType = "geo"; // 默认为 geo
    }
    return currentType !== targetType;
  }

  /**
   * 判断是否为几何形状类型
   */
  private isGeoShape(shapeType: string): boolean {
    return [
      "rectangle",
      "ellipse",
      "triangle",
      "diamond",
      "hexagon",
      "oval",
      "cloud",
      "pentagon",
      "octagon",
      "star",
      "rhombus",
      "rhombus-2",
      "trapezoid",
      "arrow-right",
      "arrow-left",
      "arrow-up",
      "arrow-down",
      "x-box",
      "check-box",
      "heart",
    ].includes(shapeType);
  }

  /**
   * 几何形状映射
   */
  private mapGeoType(type: string): string {
    // 基于你提供的完整形状列表进行映射
    const geoMap: Record<string, string> = {
      // 基础几何形状
      rectangle: "rectangle",
      ellipse: "ellipse",
      triangle: "triangle",
      diamond: "diamond",
      hexagon: "hexagon",
      oval: "oval",
      cloud: "cloud",
      pentagon: "pentagon",
      octagon: "octagon",
      star: "star",
      rhombus: "rhombus",
      "rhombus-2": "rhombus-2",
      trapezoid: "trapezoid",

      // 箭头形状（作为 geo 类型）
      "arrow-right": "arrow-right",
      "arrow-left": "arrow-left",
      "arrow-up": "arrow-up",
      "arrow-down": "arrow-down",

      // 特殊形状
      "x-box": "x-box",
      "check-box": "check-box",
      heart: "heart",

      // 兼容性映射
      square: "rectangle",
      circle: "ellipse",
    };

    const result = geoMap[type] || "rectangle";
    return result;
  }

  /**
   * 填充类型映射
   */
  private mapFillType(fill: string): string {
    // 画布 的 fill 属性只接受: "none" | "semi" | "solid" | "pattern" | "fill"
    const fillMap: Record<string, string> = {
      none: "none",
      transparent: "none",
      empty: "none",
      semi: "semi",
      "semi-transparent": "semi",
      solid: "solid",
      filled: "solid",
      pattern: "pattern",
      fill: "solid",
      // 颜色值映射为 solid 填充
      "light-blue": "solid",
      "light-green": "solid",
      "light-yellow": "solid",
      "light-orange": "solid",
      "light-violet": "solid",
      "light-red": "solid",
      "light-grey": "solid",
      red: "solid",
      green: "solid",
      blue: "solid",
      orange: "solid",
      yellow: "solid",
      black: "solid",
      violet: "solid",
      grey: "solid",
      white: "solid",
    };

    return fillMap[fill] || "none";
  }

  /**
   * 线条样式映射
   */
  private mapDashType(dash: string): string {
    // 画布 的 dash 属性: "draw" | "solid" | "dashed" | "dotted"
    const dashMap: Record<string, string> = {
      solid: "solid",
      dashed: "dashed",
      dotted: "dotted",
      draw: "draw",
      none: "solid",
      normal: "solid",
    };
    return dashMap[dash] || "solid";
  }

  /**
   * 尺寸映射
   */
  private mapSizeType(size: string): string {
    // 画布 的 size 属性: "s" | "m" | "l" | "xl"
    const sizeMap: Record<string, string> = {
      s: "s",
      small: "s",
      m: "m",
      medium: "m",
      l: "l",
      large: "l",
      xl: "xl",
      "extra-large": "xl",
    };
    return sizeMap[size] || "m";
  }

  /**
   * 字体映射
   */
  private mapFontType(font: string): string {
    // 画布 的 font 属性: "draw" | "sans" | "serif" | "mono"
    const fontMap: Record<string, string> = {
      draw: "draw",
      sans: "sans",
      serif: "serif",
      mono: "mono",
      monospace: "mono",
      "sans-serif": "sans",
    };
    return fontMap[font] || "draw";
  }

  /**
   * 水平对齐映射
   */
  private mapAlignType(align: string): string {
    // 画布 的 align 属性: "start" | "middle" | "end"
    const alignMap: Record<string, string> = {
      start: "start",
      left: "start",
      middle: "middle",
      center: "middle",
      end: "end",
      right: "end",
    };
    return alignMap[align] || "middle";
  }

  /**
   * 垂直对齐映射
   */
  private mapVerticalAlignType(align: string): string {
    // 画布 的 verticalAlign 属性: "start" | "middle" | "end"
    const alignMap: Record<string, string> = {
      start: "start",
      top: "start",
      middle: "middle",
      center: "middle",
      end: "end",
      bottom: "end",
    };
    return alignMap[align] || "middle";
  }
}
