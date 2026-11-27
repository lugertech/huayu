export interface MindmapData {
  content: string;
  children: MindmapData[];
}

// 节点布局信息
export interface NodeLayout {
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
export interface ConnectionLayout {
  fromId: string;
  toId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// 布局配置
export const mindmapLayout = {
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
  const width = text.length * fontSize * 0.6 + mindmapLayout.nodePadding * 2;
  return Math.max(
    mindmapLayout.minNodeWidth,
    Math.min(width, mindmapLayout.maxNodeWidth),
  );
}

// 计算文本高度
function getTextHeight(text: string, width: number, fontSize: number): number {
  const lineHeight = fontSize * mindmapLayout.lineHeight;
  const availableWidth = width - mindmapLayout.nodePadding * 2;
  const charsPerLine = Math.floor(availableWidth / (fontSize * 0.6));
  const lines = Math.ceil(text.length / charsPerLine);
  const contentHeight = lines * lineHeight;
  const totalHeight = contentHeight + mindmapLayout.nodePadding * 2;
  return Math.max(totalHeight, mindmapLayout.minNodeHeight);
}

// 计算子树高度
function calculateSubtreeHeight(node: MindmapData, level: number = 0): number {
  const fontSize =
    mindmapLayout.fontSize[level as keyof typeof mindmapLayout.fontSize] ||
    mindmapLayout.fontSize[2];
  const nodeWidth = getTextWidth(node.content, fontSize);
  const nodeHeight = getTextHeight(node.content, nodeWidth, fontSize);

  if (node.children.length === 0) {
    return nodeHeight;
  }
  const childrenHeight = node.children.reduce((sum, child) => {
    return (
      sum + calculateSubtreeHeight(child, level + 1) + mindmapLayout.verticalGap
    );
  }, -mindmapLayout.verticalGap);
  return Math.max(nodeHeight, childrenHeight);
}

// 递归布局节点
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
  const currentIndex = nodes.length;
  const nodeId = `node-${currentIndex}`;

  const fontSize =
    mindmapLayout.fontSize[level as keyof typeof mindmapLayout.fontSize] ||
    mindmapLayout.fontSize[2];
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
    const childX = x + nodeWidth + mindmapLayout.horizontalGap;
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
      childY += childSubtreeHeight + mindmapLayout.verticalGap;
    });
  }

  return { width: nodeWidth, height: subtreeHeight };
}

export function layoutMindmap(data: MindmapData) {
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
