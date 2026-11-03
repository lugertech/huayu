import { t, useLocale } from "@/i18n";
import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import * as DropdownMenu from "@/ui/canvas-menu";

// 流程图数据结构
export interface FlowchartNode {
  id: string;
  type: string;
  data: {
    label: string;
    nodeType: "start" | "end" | "process" | "decision" | "input" | "output";
  };
}

export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

interface FlowchartRendererProps {
  data: FlowchartData;
  width: number;
  height: number;
  onDataChange?: (newData: FlowchartData) => void;
}

// 节点布局信息
interface NodeLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: FlowchartNode;
  layer: number;
}

// 连接线布局信息
interface EdgeLayout {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  edge: FlowchartEdge;
}

// 布局配置
const LAYOUT_CONFIG = {
  minNodeHeight: 36,
  lineHeight: 1.5,
  horizontalGap: 100,
  verticalGap: 80,
  nodePadding: 16,
  minNodeWidth: 150,
  maxNodeWidth: 300,
  fontSize: 15,
  // 决策节点需要更多内边距(因为是菱形)
  decisionPadding: 45,
  colors: {
    start: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" },
    end: { bg: "#ef4444", text: "#ffffff", border: "#dc2626" },
    process: { bg: "#3b82f6", text: "#ffffff", border: "#2563eb" },
    decision: { bg: "#f59e0b", text: "#ffffff", border: "#d97706" },
    input: { bg: "#8b5cf6", text: "#ffffff", border: "#7c3aed" },
    output: { bg: "#06b6d4", text: "#ffffff", border: "#0891b2" },
  },
};

// 计算节点尺寸的辅助函数
function calculateNodeSize(
  text: string,
  nodeType: string,
): { width: number; height: number } {
  const padding =
    nodeType === "decision"
      ? LAYOUT_CONFIG.decisionPadding
      : LAYOUT_CONFIG.nodePadding;
  const fontSize = LAYOUT_CONFIG.fontSize;

  // 创建临时canvas来测量文本
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return {
      width: LAYOUT_CONFIG.minNodeWidth,
      height: LAYOUT_CONFIG.minNodeHeight,
    };

  ctx.font = `${fontSize}px sans-serif`;

  // 按最大宽度分行
  const maxWidth = LAYOUT_CONFIG.maxNodeWidth - padding * 2;
  const words = text.split("");
  const lines: string[] = [];
  let currentLine = "";

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  // 计算实际需要的宽度（取所有行中最宽的）
  let actualWidth = 0;
  lines.forEach((line) => {
    const metrics = ctx.measureText(line);
    actualWidth = Math.max(actualWidth, metrics.width);
  });

  const width = Math.max(
    LAYOUT_CONFIG.minNodeWidth,
    Math.min(LAYOUT_CONFIG.maxNodeWidth, actualWidth + padding * 2),
  );

  const lineHeight = fontSize * LAYOUT_CONFIG.lineHeight;
  const height = Math.max(
    LAYOUT_CONFIG.minNodeHeight,
    lines.length * lineHeight + padding * 2,
  );

  return { width, height };
}

// 分层布局算法
export function layoutFlowchart(data: FlowchartData): {
  nodes: NodeLayout[];
  edges: EdgeLayout[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
} {
  const nodeLayouts: NodeLayout[] = [];
  const edgeLayouts: EdgeLayout[] = [];

  if (data.nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  // 构建邻接表
  const adjacency = new Map<string, string[]>();
  data.edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  });

  // 找到起始节点（没有入边的节点或type为start的节点）
  const startNode =
    data.nodes.find((n) => n.data.nodeType === "start") || data.nodes[0];

  // BFS分层
  const layers = new Map<string, number>();
  const queue: Array<{ id: string; layer: number }> = [
    { id: startNode.id, layer: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    if (visited.has(id)) continue;

    visited.add(id);
    layers.set(id, layer);

    const neighbors = adjacency.get(id) || [];
    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        queue.push({ id: neighborId, layer: layer + 1 });
      }
    });
  }

  // 将未访问的节点分配到最后一层
  data.nodes.forEach((node) => {
    if (!layers.has(node.id)) {
      layers.set(node.id, Math.max(...Array.from(layers.values())) + 1);
    }
  });

  // 按层分组
  const layerGroups = new Map<number, FlowchartNode[]>();
  data.nodes.forEach((node) => {
    const layer = layers.get(node.id) || 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(node);
  });

  // 首先计算所有节点的尺寸
  const nodeSizes = new Map<string, { width: number; height: number }>();
  data.nodes.forEach((node) => {
    const size = calculateNodeSize(node.data.label, node.data.nodeType);
    nodeSizes.set(node.id, size);
  });

  // 计算每层的最大宽度
  const maxWidthPerLayer = new Map<number, number>();
  Array.from(layerGroups.entries()).forEach(([layer, nodes]) => {
    const maxWidth = Math.max(
      ...nodes.map(
        (n) => nodeSizes.get(n.id)?.width || LAYOUT_CONFIG.minNodeWidth,
      ),
    );
    maxWidthPerLayer.set(layer, maxWidth);
  });

  // 计算全局最大高度(所有节点中的最大高度)
  const globalMaxHeight = Math.max(
    ...Array.from(nodeSizes.values()).map((s) => s.height),
  );

  Array.from(layerGroups.entries()).forEach(([layer, nodes]) => {
    // 计算该层的 x 位置(累加前面所有层的最大宽度)
    let layerX = 50;
    for (let i = 0; i < layer; i++) {
      const prevLayerMaxWidth =
        maxWidthPerLayer.get(i) || LAYOUT_CONFIG.minNodeWidth;
      layerX += prevLayerMaxWidth + LAYOUT_CONFIG.horizontalGap;
    }

    const startY = 50;
    const layerMaxWidth =
      maxWidthPerLayer.get(layer) || LAYOUT_CONFIG.minNodeWidth;

    let currentY = startY;
    nodes.forEach((node) => {
      const size = nodeSizes.get(node.id) || {
        width: LAYOUT_CONFIG.minNodeWidth,
        height: LAYOUT_CONFIG.minNodeHeight,
      };

      // 在层内水平居中对齐节点
      const nodeX = layerX + (layerMaxWidth - size.width) / 2;
      // 在全局最大高度空间内垂直居中节点
      const nodeY = currentY + (globalMaxHeight - size.height) / 2;

      nodeLayouts.push({
        id: node.id,
        x: nodeX,
        y: nodeY,
        w: size.width,
        h: size.height,
        node,
        layer,
      });

      currentY += globalMaxHeight + LAYOUT_CONFIG.verticalGap;
    });
  });

  // 计算连接线位置
  data.edges.forEach((edge) => {
    const sourceNode = nodeLayouts.find((n) => n.id === edge.source);
    const targetNode = nodeLayouts.find((n) => n.id === edge.target);

    if (sourceNode && targetNode) {
      edgeLayouts.push({
        id: edge.id,
        startX: sourceNode.x + sourceNode.w,
        startY: sourceNode.y + sourceNode.h / 2,
        endX: targetNode.x,
        endY: targetNode.y + targetNode.h / 2,
        edge,
      });
    }
  });

  // 计算边界
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodeLayouts.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  });

  return {
    nodes: nodeLayouts,
    edges: edgeLayouts,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 100,
      height: maxY - minY + 100,
    },
  };
}

// 生成贝塞尔曲线路径
function getBezierPath(edge: EdgeLayout): string {
  const dx = edge.endX - edge.startX;
  const controlOffset = Math.abs(dx) * 0.5;
  return `M ${edge.startX} ${edge.startY} C ${edge.startX + controlOffset} ${edge.startY}, ${edge.endX - controlOffset} ${edge.endY}, ${edge.endX} ${edge.endY}`;
}

export function FlowchartRenderer({
  data,
  onDataChange,
}: FlowchartRendererProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const hasInitialized = useRef(false);

  // 选中和编辑状态
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 计算布局
  const { nodes, edges, bounds } = useMemo(() => layoutFlowchart(data), [data]);

  // 初始化视图
  useEffect(() => {
    // 只在首次加载时初始化 transform,避免拖动时重置
    if (hasInitialized.current || bounds.width === 0 || !containerRef.current)
      return;

    // 使用 requestAnimationFrame 确保容器已渲染
    requestAnimationFrame(() => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const containerHeight = rect.height;

      if (containerWidth === 0 || containerHeight === 0) return;

      const scaleX = containerWidth / bounds.width;
      const scaleY = containerHeight / bounds.height;
      const scale = Math.min(scaleX, scaleY, 1) * 1.2;

      const contentWidth = bounds.width * scale;
      const contentHeight = bounds.height * scale;

      setTransform({
        x: (containerWidth - contentWidth) / 2 - bounds.minX * scale,
        y: (containerHeight - contentHeight) / 2 - bounds.minY * scale,
        scale,
      });

      hasInitialized.current = true;
    });
  }, [bounds]);

  // 聚焦输入框
  useEffect(() => {
    if (editingNode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingNode]);

  // 单击选中节点
  const handleNodeClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
  }, []);

  // 双击节点开始编辑
  const handleNodeDoubleClick = useCallback(
    (nodeId: string, label: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode({ id: nodeId, label });
      setEditValue(label);
    },
    [],
  );

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    if (!editingNode || !onDataChange) {
      setEditingNode(null);
      return;
    }

    if (editValue.trim() && editValue !== editingNode.label) {
      const newNodes = data.nodes.map((node) =>
        node.id === editingNode.id
          ? { ...node, data: { ...node.data, label: editValue.trim() } }
          : node,
      );
      onDataChange({ ...data, nodes: newNodes });
    }
    setEditingNode(null);
  }, [editingNode, editValue, data, onDataChange]);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditingNode(null);
  }, []);

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  // 添加节点
  const handleAddNode = useCallback(
    (
      sourceNodeId: string,
      nodeType: "start" | "end" | "process" | "decision" | "input" | "output",
    ) => {
      if (!onDataChange) return;

      // 生成新节点ID
      const newNodeId = `node_${Date.now()}`;
      const newNode: FlowchartNode = {
        id: newNodeId,
        type: "default",
        data: {
          label: t("canvas.chart.newNode"),
          nodeType: nodeType,
        },
      };

      // 生成新边ID
      const newEdgeId = `edge_${Date.now()}`;
      const newEdge: FlowchartEdge = {
        id: newEdgeId,
        source: sourceNodeId,
        target: newNodeId,
      };

      onDataChange({
        nodes: [...data.nodes, newNode],
        edges: [...data.edges, newEdge],
      });
    },
    [data, onDataChange],
  );

  // 删除节点
  const handleDeleteNode = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onDataChange) return;

      const newNodes = data.nodes.filter((n) => n.id !== nodeId);
      const newEdges = data.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      );
      onDataChange({ nodes: newNodes, edges: newEdges });
      setSelectedNodeId(null);
    },
    [data, onDataChange],
  );

  // 点击空白处取消选中
  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // 画布拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || editingNode) return;

      // 检查是否点击了可交互元素
      const target = e.target as Element;
      const isInteractive =
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest("button") ||
        target.closest("input");

      // 只要不是交互元素,就允许拖拽
      if (!isInteractive) {
        e.stopPropagation();
        setIsDragging(true);
        setDragStart({
          x: e.clientX - transform.x,
          y: e.clientY - transform.y,
        });
        handleBackgroundClick();
      }
    },
    [transform, editingNode, handleBackgroundClick],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      e.stopPropagation();
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 缩放控制
  const handleZoom = useCallback(
    (zoomIn: boolean) => {
      const delta = zoomIn ? 1.1 : 0.9;
      const newScale = Math.max(0.3, Math.min(2, transform.scale * delta));

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        // 以容器中心为缩放点
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        setTransform((prev) => ({
          scale: newScale,
          x: centerX - (centerX - prev.x) * (newScale / prev.scale),
          y: centerY - (centerY - prev.y) * (newScale / prev.scale),
        }));
      }
    },
    [transform.scale],
  );

  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleZoom(true);
    },
    [handleZoom],
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleZoom(false);
    },
    [handleZoom],
  );

  // 计算编辑框位置
  const getEditInputPosition = useCallback(
    (node: NodeLayout) => {
      return {
        left: node.x * transform.scale + transform.x,
        top: node.y * transform.scale + transform.y,
        width: node.w * transform.scale,
        height: node.h * transform.scale,
      };
    },
    [transform],
  );

  // 获取选中节点
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // 渲染不同类型的节点
  const renderNode = (node: NodeLayout) => {
    const colors =
      LAYOUT_CONFIG.colors[node.node.data.nodeType] ||
      LAYOUT_CONFIG.colors.process;
    const isEditing = editingNode?.id === node.id;
    const isSelected = selectedNodeId === node.id;

    switch (node.node.data.nodeType) {
      case "decision": {
        // 菱形
        const cx = node.x + node.w / 2;
        const cy = node.y + node.h / 2;
        const diamondPath = `M ${cx} ${node.y} L ${node.x + node.w} ${cy} L ${cx} ${node.y + node.h} L ${node.x} ${cy} Z`;

        return (
          <g key={node.id}>
            <path
              d={diamondPath}
              fill={isEditing ? "#fef3c7" : colors.bg}
              stroke={isSelected ? "#f59e0b" : colors.border}
              strokeWidth={isSelected ? 2 : 1}
            />
            {!isEditing && (
              <foreignObject
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: `${LAYOUT_CONFIG.decisionPadding}px`,
                    fontSize: `${LAYOUT_CONFIG.fontSize}px`,
                    color: colors.text,
                    fontWeight: 500,
                    lineHeight: LAYOUT_CONFIG.lineHeight,
                    wordBreak: "break-word",
                    textAlign: "center",
                  }}
                >
                  {node.node.data.label}
                </div>
              </foreignObject>
            )}
          </g>
        );
      }
      default: {
        // 矩形（start/end为圆角矩形）
        const rx =
          node.node.data.nodeType === "start" ||
          node.node.data.nodeType === "end"
            ? 25
            : 6;

        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={rx}
              fill={isEditing ? "#fef3c7" : colors.bg}
              stroke={isSelected ? "#f59e0b" : colors.border}
              strokeWidth={isSelected ? 2 : 1}
            />
            {!isEditing && (
              <foreignObject
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: `${LAYOUT_CONFIG.nodePadding}px`,
                    fontSize: `${LAYOUT_CONFIG.fontSize}px`,
                    color: colors.text,
                    fontWeight: 500,
                    lineHeight: LAYOUT_CONFIG.lineHeight,
                    wordBreak: "break-word",
                    textAlign: "center",
                  }}
                >
                  {node.node.data.label}
                </div>
              </foreignObject>
            )}
          </g>
        );
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0 overflow-hidden cursor-grab active:cursor-grabbing bg-gray-50 relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg
        width="100%"
        height="100%"
        className="flowchart-bg block"
        overflow="visible"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* 连接线 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        {edges.map((edge) => (
          <g key={edge.id}>
            <path
              d={getBezierPath(edge)}
              stroke="#94a3b8"
              strokeWidth={2}
              fill="none"
              markerEnd="url(#arrowhead)"
            />
            {edge.edge.label && (
              <text
                x={(edge.startX + edge.endX) / 2}
                y={(edge.startY + edge.endY) / 2 - 15}
                fontSize={11}
                fill="#64748b"
                textAnchor="middle"
                fontWeight={500}
                style={{ pointerEvents: "none" }}
              >
                {edge.edge.label}
              </text>
            )}
          </g>
        ))}

        {/* 节点 */}
        {nodes.map((node) => (
          <g
            key={node.id}
            style={{ cursor: "pointer" }}
            onClick={(e) => handleNodeClick(node.id, e)}
            onDoubleClick={(e) =>
              handleNodeDoubleClick(node.id, node.node.data.label, e)
            }
          >
            {renderNode(node)}
          </g>
        ))}
      </svg>

      {/* 缩放控制按钮 */}
      <div
        className="absolute bottom-3 left-3 flex gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
          title={t("canvas.chart.zoomOut")}
        >
          <Minus size={14} className="text-muted-foreground" />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
          title={t("canvas.chart.zoomIn")}
        >
          <Plus size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* 编辑输入框 */}
      {editingNode &&
        (() => {
          const node = nodes.find((n) => n.id === editingNode.id);
          if (!node) return null;
          const pos = getEditInputPosition(node);

          return (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute text-center border-2 border-amber-500 rounded outline-none bg-amber-50"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                height: pos.height,
                fontSize: `${LAYOUT_CONFIG.fontSize}px`,
              }}
            />
          );
        })()}

      {/* 操作按钮 */}
      {selectedNode && !editingNode && (
        <div
          className="absolute flex gap-2 items-center"
          style={{
            left:
              (selectedNode.x + selectedNode.w + 8) * transform.scale +
              transform.x,
            top:
              (selectedNode.y + selectedNode.h / 2) * transform.scale +
              transform.y,
            transform: "translateY(-50%)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 添加节点下拉菜单 */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
                title={t("canvas.chart.addNode")}
              >
                <Plus size={14} className="text-muted-foreground" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="bg-popover border border-input rounded-md shadow-lg p-1 z-[9999] min-w-[100px]"
                sideOffset={5}
                align="start"
              >
                {[
                  { type: "start", label: t("canvas.start") },
                  { type: "process", label: t("canvas.chart.process") },
                  { type: "decision", label: t("canvas.chart.decision") },
                  { type: "input", label: t("canvas.input") },
                  { type: "output", label: t("canvas.chart.output") },
                  { type: "end", label: t("canvas.chart.end") },
                ].map((option) => (
                  <DropdownMenu.Item
                    key={option.type}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded hover:bg-accent cursor-pointer outline-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddNode(selectedNode.id, option.type as any);
                    }}
                  >
                    <span className="font-medium">{option.label}</span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* 删除按钮 */}
          <button
            onClick={(e) => handleDeleteNode(selectedNode.id, e)}
            className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
            title={t("canvas.chart.deleteNode")}
          >
            <Trash2 size={14} className="text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
