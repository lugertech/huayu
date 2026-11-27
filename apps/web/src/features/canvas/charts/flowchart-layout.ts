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

// 节点布局信息
export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: FlowchartNode;
  layer: number;
}

// 连接线布局信息
export interface EdgeLayout {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  edge: FlowchartEdge;
}

// 布局配置
export const flowchartLayout = {
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
      ? flowchartLayout.decisionPadding
      : flowchartLayout.nodePadding;
  const fontSize = flowchartLayout.fontSize;

  // 创建临时canvas来测量文本
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return {
      width: flowchartLayout.minNodeWidth,
      height: flowchartLayout.minNodeHeight,
    };

  ctx.font = `${fontSize}px sans-serif`;

  // 按最大宽度分行
  const maxWidth = flowchartLayout.maxNodeWidth - padding * 2;
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
    flowchartLayout.minNodeWidth,
    Math.min(flowchartLayout.maxNodeWidth, actualWidth + padding * 2),
  );

  const lineHeight = fontSize * flowchartLayout.lineHeight;
  const height = Math.max(
    flowchartLayout.minNodeHeight,
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
        (n) => nodeSizes.get(n.id)?.width || flowchartLayout.minNodeWidth,
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
        maxWidthPerLayer.get(i) || flowchartLayout.minNodeWidth;
      layerX += prevLayerMaxWidth + flowchartLayout.horizontalGap;
    }

    const startY = 50;
    const layerMaxWidth =
      maxWidthPerLayer.get(layer) || flowchartLayout.minNodeWidth;

    let currentY = startY;
    nodes.forEach((node) => {
      const size = nodeSizes.get(node.id) || {
        width: flowchartLayout.minNodeWidth,
        height: flowchartLayout.minNodeHeight,
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

      currentY += globalMaxHeight + flowchartLayout.verticalGap;
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
