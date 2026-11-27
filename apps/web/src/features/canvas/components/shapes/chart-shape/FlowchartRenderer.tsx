import { useTranslations } from "@/i18n";
import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import * as DropdownMenu from "@/components/ui/canvas-menu";

import {
  layoutFlowchart,
  flowchartLayout,
  type FlowchartData,
  type NodeLayout,
  type FlowchartNode,
  type FlowchartEdge,
  type EdgeLayout,
} from "../../../charts/flowchart-layout";

interface FlowchartRendererProps {
  data: FlowchartData;
  width: number;
  height: number;
  onDataChange?: (newData: FlowchartData) => void;
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
  const { t } = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const isDragging = dragStart !== null;
  const hasInitialized = useRef(false);

  // 选中和编辑状态
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<{
    id: string;
    label: string;
    value: string;
  } | null>(null);
  const editValue = editingNode?.value ?? "";
  function setEditValue(value: string) {
    setEditingNode((current) => (current ? { ...current, value } : null));
  }
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
      setEditingNode({ id: nodeId, label, value: label });
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
    [data, onDataChange, t],
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
    setDragStart(null);
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
      flowchartLayout.colors[node.node.data.nodeType] ||
      flowchartLayout.colors.process;
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
                    padding: `${flowchartLayout.decisionPadding}px`,
                    fontSize: `${flowchartLayout.fontSize}px`,
                    color: colors.text,
                    fontWeight: 500,
                    lineHeight: flowchartLayout.lineHeight,
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
                    padding: `${flowchartLayout.nodePadding}px`,
                    fontSize: `${flowchartLayout.fontSize}px`,
                    color: colors.text,
                    fontWeight: 500,
                    lineHeight: flowchartLayout.lineHeight,
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
                fontSize: `${flowchartLayout.fontSize}px`,
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
