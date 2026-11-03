import { t, useLocale } from "@/i18n";
import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Plus, Minus, Trash2 } from "lucide-react";

// 思维导图数据结构
export interface MindmapData {
  content: string;
  children: MindmapData[];
}

// 节点布局信息
interface NodeLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  data: MindmapData;
  parentId?: string;
  index: number; // 在树中的遍历索引
  path: number[]; // 在树中的路径 [parentChildIndex, ...]
}

// 连接线信息
interface ConnectionLayout {
  fromId: string;
  toId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface MindmapRendererProps {
  data: MindmapData;
  width: number;
  height: number;
  onDataChange?: (newData: MindmapData) => void;
}

// 布局配置
const LAYOUT_CONFIG = {
  minNodeHeight: 36,
  lineHeight: 1.5,
  horizontalGap: 50,
  verticalGap: 16,
  nodePadding: 16,
  minNodeWidth: 150,
  maxNodeWidth: 300,
  fontSize: {
    0: 15,
    1: 15,
    2: 15,
  },
  colors: {
    0: { bg: "#3b82f6", text: "#ffffff", border: "#1d4ed8" },
    1: { bg: "#60a5fa", text: "#ffffff", border: "#2563eb" },
    2: { bg: "#93c5fd", text: "#1e3a5f", border: "#3b82f6" },
  },
};

// 计算文本宽度
function getTextWidth(text: string, fontSize: number): number {
  const width = text.length * fontSize * 0.6 + LAYOUT_CONFIG.nodePadding * 2;
  return Math.max(
    LAYOUT_CONFIG.minNodeWidth,
    Math.min(width, LAYOUT_CONFIG.maxNodeWidth),
  );
}

// 计算文本高度
function getTextHeight(text: string, width: number, fontSize: number): number {
  const lineHeight = fontSize * LAYOUT_CONFIG.lineHeight;
  const availableWidth = width - LAYOUT_CONFIG.nodePadding * 2;
  const charsPerLine = Math.floor(availableWidth / (fontSize * 0.6));
  const lines = Math.ceil(text.length / charsPerLine);
  const contentHeight = lines * lineHeight;
  const totalHeight = contentHeight + LAYOUT_CONFIG.nodePadding * 2;
  return Math.max(totalHeight, LAYOUT_CONFIG.minNodeHeight);
}

// 计算子树高度
function calculateSubtreeHeight(node: MindmapData, level: number = 0): number {
  const fontSize =
    LAYOUT_CONFIG.fontSize[level as keyof typeof LAYOUT_CONFIG.fontSize] ||
    LAYOUT_CONFIG.fontSize[2];
  const nodeWidth = getTextWidth(node.content, fontSize);
  const nodeHeight = getTextHeight(node.content, nodeWidth, fontSize);

  if (node.children.length === 0) {
    return nodeHeight;
  }
  const childrenHeight = node.children.reduce((sum, child) => {
    return (
      sum + calculateSubtreeHeight(child, level + 1) + LAYOUT_CONFIG.verticalGap
    );
  }, -LAYOUT_CONFIG.verticalGap);
  return Math.max(nodeHeight, childrenHeight);
}

// 递归布局节点
let globalIndex = 0;
function layoutNodes(
  node: MindmapData,
  level: number,
  x: number,
  y: number,
  parentId: string | undefined,
  nodes: NodeLayout[],
  connections: ConnectionLayout[],
  path: number[] = [],
): { width: number; height: number } {
  const nodeId = `node-${globalIndex}`;
  const currentIndex = globalIndex;
  globalIndex++;

  const fontSize =
    LAYOUT_CONFIG.fontSize[level as keyof typeof LAYOUT_CONFIG.fontSize] ||
    LAYOUT_CONFIG.fontSize[2];
  const nodeWidth = getTextWidth(node.content, fontSize);
  const nodeHeight = getTextHeight(node.content, nodeWidth, fontSize);
  const subtreeHeight = calculateSubtreeHeight(node, level);
  const nodeY = y + (subtreeHeight - nodeHeight) / 2;

  nodes.push({
    id: nodeId,
    x,
    y: nodeY,
    w: nodeWidth,
    h: nodeHeight,
    level,
    data: node,
    parentId,
    index: currentIndex,
    path: [...path],
  });

  // 添加连接线
  if (parentId) {
    const parentNode = nodes.find((n) => n.id === parentId);
    if (parentNode) {
      connections.push({
        fromId: parentId,
        toId: nodeId,
        startX: parentNode.x + parentNode.w,
        startY: parentNode.y + parentNode.h / 2,
        endX: x,
        endY: nodeY + nodeHeight / 2,
      });
    }
  }

  // 布局子节点
  if (node.children.length > 0) {
    const childX = x + nodeWidth + LAYOUT_CONFIG.horizontalGap;
    let childY = y;

    node.children.forEach((child, childIndex) => {
      const childSubtreeHeight = calculateSubtreeHeight(child, level + 1);
      layoutNodes(
        child,
        level + 1,
        childX,
        childY,
        nodeId,
        nodes,
        connections,
        [...path, childIndex],
      );
      childY += childSubtreeHeight + LAYOUT_CONFIG.verticalGap;
    });
  }

  return { width: nodeWidth, height: subtreeHeight };
}

// 生成贝塞尔曲线路径
function getBezierPath(conn: ConnectionLayout): string {
  const dx = conn.endX - conn.startX;
  const controlOffset = Math.abs(dx) * 0.4;
  return `M ${conn.startX} ${conn.startY} C ${conn.startX + controlOffset} ${conn.startY}, ${conn.endX - controlOffset} ${conn.endY}, ${conn.endX} ${conn.endY}`;
}

// 根据路径更新节点
function updateNodeByPath(
  data: MindmapData,
  path: number[],
  updater: (node: MindmapData) => MindmapData,
): MindmapData {
  if (path.length === 0) {
    return updater(data);
  }

  const [firstIndex, ...restPath] = path;
  const newChildren = data.children.map((child, i) => {
    if (i === firstIndex) {
      return updateNodeByPath(child, restPath, updater);
    }
    return child;
  });

  return { ...data, children: newChildren };
}

// 根据路径删除节点
function deleteNodeByPath(data: MindmapData, path: number[]): MindmapData {
  if (path.length === 0) {
    // 不能删除根节点
    return data;
  }

  if (path.length === 1) {
    const newChildren = data.children.filter((_, i) => i !== path[0]);
    return { ...data, children: newChildren };
  }

  const [firstIndex, ...restPath] = path;
  const newChildren = data.children.map((child, i) => {
    if (i === firstIndex) {
      return deleteNodeByPath(child, restPath);
    }
    return child;
  });

  return { ...data, children: newChildren };
}

// 根据路径添加子节点
function addChildByPath(
  data: MindmapData,
  path: number[],
  newChild: MindmapData,
): MindmapData {
  return updateNodeByPath(data, path, (node) => ({
    ...node,
    children: [...node.children, newChild],
  }));
}

// 移动节点到新位置
function moveNode(
  data: MindmapData,
  fromPath: number[],
  toPath: number[],
  position: "before" | "after" | "child",
): MindmapData {
  if (fromPath.length === 0) return data; // 不能移动根节点

  // 检查是否移动到自己的子节点下
  if (toPath.length >= fromPath.length) {
    let isChild = true;
    for (let i = 0; i < fromPath.length; i++) {
      if (fromPath[i] !== toPath[i]) {
        isChild = false;
        break;
      }
    }
    if (isChild) return data; // 不能移动到自己的子节点
  }

  // 先获取要移动的节点
  let nodeToMove: MindmapData | null = null;
  const getNode = (node: MindmapData, path: number[]): MindmapData | null => {
    if (path.length === 0) return node;
    const [first, ...rest] = path;
    if (first >= node.children.length) return null;
    return getNode(node.children[first], rest);
  };
  nodeToMove = getNode(data, fromPath);
  if (!nodeToMove) return data;

  // 删除原节点
  let newData = deleteNodeByPath(data, fromPath);

  // 调整toPath（如果删除影响了路径）
  const adjustedToPath = [...toPath];
  if (fromPath.length <= toPath.length) {
    let samePrefix = true;
    for (let i = 0; i < fromPath.length - 1; i++) {
      if (fromPath[i] !== toPath[i]) {
        samePrefix = false;
        break;
      }
    }
    if (samePrefix && fromPath.length > 0) {
      const fromIndex = fromPath[fromPath.length - 1];
      const toIndex = toPath[fromPath.length - 1];
      if (toIndex > fromIndex) {
        adjustedToPath[fromPath.length - 1] = toIndex - 1;
      }
    }
  }

  // 插入到新位置
  if (position === "child") {
    newData = addChildByPath(newData, adjustedToPath, nodeToMove);
  } else {
    // 处理 before/after 位置
    if (adjustedToPath.length === 0) {
      // 目标是根节点,before插入到开头,after插入到末尾
      if (position === "before") {
        newData = { ...newData, children: [nodeToMove, ...newData.children] };
      } else {
        newData = { ...newData, children: [...newData.children, nodeToMove] };
      }
    } else {
      // 目标是子节点
      const parentPath = adjustedToPath.slice(0, -1);
      const insertIndex =
        adjustedToPath[adjustedToPath.length - 1] +
        (position === "after" ? 1 : 0);
      newData = updateNodeByPath(newData, parentPath, (node) => {
        const newChildren = [...node.children];
        newChildren.splice(insertIndex, 0, nodeToMove!);
        return { ...node, children: newChildren };
      });
    }
  }

  return newData;
}

export function layoutMindmap(data: MindmapData) {
  globalIndex = 0;
  const nodes: NodeLayout[] = [];
  const connections: ConnectionLayout[] = [];

  layoutNodes(data, 0, 20, 20, undefined, nodes, connections);

  // 计算边界
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }

  return {
    nodes,
    connections,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 40,
      height: maxY - minY + 40,
    },
  };
}

export function MindmapRenderer({ data, onDataChange }: MindmapRendererProps) {
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
    path: number[];
    content: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 节点拖拽状态
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    path: number[];
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startTime: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    path: number[];
    position: "before" | "after" | "child";
  } | null>(null);

  // 计算布局
  const { nodes, connections, bounds } = useMemo(
    () => layoutMindmap(data),
    [data],
  );

  // 初始化视图，居中并适配
  useEffect(() => {
    // 只在首次加载时初始化 transform,避免拖动时重置
    if (hasInitialized.current || !containerRef.current) return;

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
    (nodeId: string, path: number[], content: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNode({ id: nodeId, path, content });
      setEditValue(content);
    },
    [],
  );

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    if (!editingNode || !onDataChange) {
      setEditingNode(null);
      return;
    }

    if (editValue.trim() && editValue !== editingNode.content) {
      const newData = updateNodeByPath(data, editingNode.path, (node) => ({
        ...node,
        content: editValue.trim(),
      }));
      onDataChange(newData);
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
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  // 添加子节点
  const handleAddChild = useCallback(
    (_nodeId: string, path: number[], e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onDataChange) return;

      const newChild: MindmapData = {
        content: t("canvas.chart.newNode"),
        children: [],
      };
      const newData = addChildByPath(data, path, newChild);
      onDataChange(newData);
    },
    [data, onDataChange],
  );

  // 删除节点
  const handleDeleteNode = useCallback(
    (_nodeId: string, path: number[], e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onDataChange || path.length === 0) return; // 不能删除根节点

      const newData = deleteNodeByPath(data, path);
      onDataChange(newData);
      setSelectedNodeId(null);
    },
    [data, onDataChange],
  );

  // 节点拖拽开始
  const handleNodeDragStart = useCallback(
    (nodeId: string, path: number[], e: React.MouseEvent) => {
      if (path.length === 0) return; // 根节点不能拖拽
      e.stopPropagation();
      setDraggingNode({
        id: nodeId,
        path,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        startTime: Date.now(),
      });
    },
    [],
  );

  // 节点拖拽中
  const handleNodeDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingNode) return;
      e.stopPropagation();

      // 更新当前鼠标位置
      setDraggingNode((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
            }
          : null,
      );

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
      const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;

      // 找到鼠标悬停的节点
      let targetNode: NodeLayout | null = null;
      let position: "before" | "after" | "child" = "child";

      for (const node of nodes) {
        if (node.id === draggingNode.id) continue;

        if (
          mouseX >= node.x &&
          mouseX <= node.x + node.w &&
          mouseY >= node.y - 10 &&
          mouseY <= node.y + node.h + 10
        ) {
          targetNode = node;

          // 根据鼠标位置决定放置位置
          const relativeY = mouseY - node.y;
          if (relativeY < node.h * 0.3) {
            position = "before";
          } else if (relativeY > node.h * 0.7) {
            position = "after";
          } else {
            position = "child";
          }
          break;
        }
      }

      if (targetNode) {
        setDropTarget({ id: targetNode.id, path: targetNode.path, position });
      } else {
        setDropTarget(null);
      }
    },
    [draggingNode, nodes, transform],
  );

  // 节点拖拽结束
  const handleNodeDragEnd = useCallback(() => {
    if (draggingNode && dropTarget && onDataChange) {
      const newData = moveNode(
        data,
        draggingNode.path,
        dropTarget.path,
        dropTarget.position,
      );
      onDataChange(newData);
    }
    setDraggingNode(null);
    setDropTarget(null);
  }, [draggingNode, dropTarget, data, onDataChange]);

  // 点击空白处取消选中
  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // 画布拖拽处理
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
        target.closest("textarea") ||
        target.closest("foreignObject");

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
        width: Math.max(node.w * transform.scale, 100),
        height: node.h * transform.scale,
      };
    },
    [transform],
  );

  // 获取选中节点
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0 overflow-hidden bg-gray-50 relative"
      style={{
        cursor: draggingNode ? "grabbing" : isDragging ? "grabbing" : "default",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => {
        handleMouseMove(e);
        handleNodeDragMove(e);
      }}
      onMouseUp={() => {
        handleMouseUp();
        handleNodeDragEnd();
      }}
      onMouseLeave={() => {
        handleMouseUp();
        handleNodeDragEnd();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg
        width="100%"
        height="100%"
        className="mindmap-bg block"
        overflow="visible"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {/* 连接线 */}
        {connections.map((conn, i) => (
          <path
            key={`conn-${i}`}
            d={getBezierPath(conn)}
            stroke="#94a3b8"
            strokeWidth={2}
            fill="none"
          />
        ))}

        {/* 放置目标指示器 */}
        {dropTarget &&
          (() => {
            const targetNode = nodes.find((n) => n.id === dropTarget.id);
            if (!targetNode) return null;

            // 根据position类型显示不同的指示器
            switch (dropTarget.position) {
              case "before":
                // 在目标节点上方显示水平线
                return (
                  <line
                    key="drop-indicator"
                    x1={targetNode.x - 10}
                    y1={targetNode.y}
                    x2={targetNode.x + targetNode.w + 10}
                    y2={targetNode.y}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              case "after":
                // 在目标节点下方显示水平线
                return (
                  <line
                    key="drop-indicator"
                    x1={targetNode.x - 10}
                    y1={targetNode.y + targetNode.h}
                    x2={targetNode.x + targetNode.w + 10}
                    y2={targetNode.y + targetNode.h}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              case "child":
                // 高亮整个目标节点
                return (
                  <rect
                    key="drop-indicator"
                    x={targetNode.x - 2}
                    y={targetNode.y - 2}
                    width={targetNode.w + 4}
                    height={targetNode.h + 4}
                    rx={6}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                );
            }
          })()}

        {/* 节点 */}
        {nodes.map((node) => {
          const colors =
            LAYOUT_CONFIG.colors[
              node.level as keyof typeof LAYOUT_CONFIG.colors
            ] || LAYOUT_CONFIG.colors[2];
          const fontSize =
            LAYOUT_CONFIG.fontSize[
              node.level as keyof typeof LAYOUT_CONFIG.fontSize
            ] || LAYOUT_CONFIG.fontSize[2];
          const isEditing = editingNode?.id === node.id;
          const isSelected = selectedNodeId === node.id;
          const isDraggingThis = draggingNode?.id === node.id;

          // 检查是否真正在拖拽(持续时间超过200ms)
          let isActuallyDragging = false;
          if (isDraggingThis && draggingNode) {
            const elapsedTime = Date.now() - draggingNode.startTime;
            isActuallyDragging = elapsedTime >= 200;
          }

          return (
            <g
              key={node.id}
              style={{
                cursor: draggingNode ? "grabbing" : "pointer",
                opacity: isActuallyDragging ? 0.3 : 1,
              }}
              onClick={(e) => handleNodeClick(node.id, e)}
              onDoubleClick={(e) =>
                handleNodeDoubleClick(node.id, node.path, node.data.content, e)
              }
              onMouseDown={(e) => handleNodeDragStart(node.id, node.path, e)}
            >
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={6}
                fill={isEditing ? "#fef3c7" : colors.bg}
                stroke={
                  isSelected ? "#f59e0b" : isEditing ? "#f59e0b" : colors.border
                }
                strokeWidth={isSelected || isEditing ? 2 : 1}
              />
              {!isEditing && (
                <foreignObject
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px 16px",
                      fontSize: `${fontSize}px`,
                      color: colors.text,
                      fontWeight: node.level === 0 ? 600 : 500,
                      lineHeight: LAYOUT_CONFIG.lineHeight,
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    {node.data.content}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      {/* 拖拽预览节点 */}
      {draggingNode &&
        (() => {
          const draggedNode = nodes.find((n) => n.id === draggingNode.id);
          if (!draggedNode) return null;

          // 检查是否持续时间超过200ms
          const elapsedTime = Date.now() - draggingNode.startTime;
          if (elapsedTime < 200) return null;

          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return null;

          // 计算预览节点的绝对位置(不受SVG transform影响)
          const previewX = draggingNode.currentX - rect.left;
          const previewY = draggingNode.currentY - rect.top;

          const colors =
            LAYOUT_CONFIG.colors[
              draggedNode.level as keyof typeof LAYOUT_CONFIG.colors
            ] || LAYOUT_CONFIG.colors[2];
          const fontSize =
            LAYOUT_CONFIG.fontSize[
              draggedNode.level as keyof typeof LAYOUT_CONFIG.fontSize
            ] || LAYOUT_CONFIG.fontSize[2];

          return (
            <div
              style={{
                position: "absolute",
                left: previewX - (draggedNode.w * transform.scale) / 2,
                top: previewY - (draggedNode.h * transform.scale) / 2,
                width: draggedNode.w * transform.scale,
                height: draggedNode.h * transform.scale,
                opacity: 0.6,
                pointerEvents: "none",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: colors.bg,
                  border: `2px solid ${colors.border}`,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 16px",
                  fontSize: `${fontSize * transform.scale}px`,
                  color: colors.text,
                  fontWeight: draggedNode.level === 0 ? 600 : 500,
                  lineHeight: LAYOUT_CONFIG.lineHeight,
                  wordBreak: "break-word",
                  textAlign: "center",
                }}
              >
                {draggedNode.data.content}
              </div>
            </div>
          );
        })()}

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

          const fontSize =
            LAYOUT_CONFIG.fontSize[
              node.level as keyof typeof LAYOUT_CONFIG.fontSize
            ] || 15;
          const scaledFontSize = fontSize * transform.scale;
          const scaledPadding = 8 * transform.scale;

          return (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute text-center border-2 border-amber-500 rounded outline-none bg-amber-50 resize-none"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                height: pos.height,
                fontSize: `${scaledFontSize}px`,
                lineHeight: LAYOUT_CONFIG.lineHeight,
                padding: `${scaledPadding}px ${scaledPadding * 2}px`,
              }}
            />
          );
        })()}

      {/* 操作按钮（选中节点时显示） */}
      {selectedNode && !editingNode && (
        <div
          className="absolute flex gap-2"
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
          {/* 添加子节点按钮 */}
          <button
            onClick={(e) =>
              handleAddChild(selectedNode.id, selectedNode.path, e)
            }
            className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
            title={t("canvas.chart.addChildNode")}
          >
            <Plus size={14} className="text-muted-foreground" />
          </button>
          {/* 删除按钮（根节点不可删除） */}
          {selectedNode.path.length > 0 && (
            <button
              onClick={(e) =>
                handleDeleteNode(selectedNode.id, selectedNode.path, e)
              }
              className="p-2 bg-popover border border-input rounded shadow hover:bg-accent transition-colors cursor-pointer"
              title={t("canvas.chart.deleteNode")}
            >
              <Trash2 size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
