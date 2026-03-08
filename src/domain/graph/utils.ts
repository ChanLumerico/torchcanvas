import type {
  GraphLayoutState,
  GraphModel,
  GraphNode,
  GraphNodeDimensions,
  GraphPosition,
} from './types';

export interface GraphIndex {
  nodeMap: Map<string, GraphNode>;
  adjacencyList: Map<string, string[]>;
  reverseList: Map<string, string[]>;
  inDegree: Map<string, number>;
  topologicalOrder: string[];
  connectedIds: Set<string>;
  hasCycle: boolean;
}

export function buildGraphIndex(graph: Pick<GraphModel, 'nodes' | 'edges'>): GraphIndex {
  const nodeMap = new Map<string, GraphNode>();
  const adjacencyList = new Map<string, string[]>();
  const reverseList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const connectedIds = new Set<string>();

  graph.nodes.forEach((node) => {
    nodeMap.set(node.id, node);
    adjacencyList.set(node.id, []);
    reverseList.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  graph.edges.forEach((edge) => {
    if (!nodeMap.has(edge.sourceId) || !nodeMap.has(edge.targetId)) {
      return;
    }

    adjacencyList.get(edge.sourceId)?.push(edge.targetId);
    reverseList.get(edge.targetId)?.push(edge.sourceId);
    inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
    connectedIds.add(edge.sourceId);
    connectedIds.add(edge.targetId);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      continue;
    }

    topologicalOrder.push(currentNodeId);
    adjacencyList.get(currentNodeId)?.forEach((neighborId) => {
      const nextDegree = (inDegree.get(neighborId) ?? 0) - 1;
      inDegree.set(neighborId, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighborId);
      }
    });
  }

  const unresolvedNodeIds = graph.nodes
    .map((node) => node.id)
    .filter((nodeId) => !topologicalOrder.includes(nodeId));

  return {
    nodeMap,
    adjacencyList,
    reverseList,
    inDegree,
    topologicalOrder: [...topologicalOrder, ...unresolvedNodeIds],
    connectedIds,
    hasCycle: unresolvedNodeIds.length > 0,
  };
}

export function getContainerChildren(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  topologicalOrder?: string[],
): Map<string, string[]> {
  const order = topologicalOrder ?? buildGraphIndex(graph).topologicalOrder;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const children = new Map<string, string[]>();

  order.forEach((nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node?.containerId) {
      return;
    }

    const entries = children.get(node.containerId) ?? [];
    entries.push(nodeId);
    children.set(node.containerId, entries);
  });

  return children;
}

export function cloneGraphModel(graph: GraphModel): GraphModel {
  return structuredClone(graph);
}

export function cloneGraphLayoutState(layout: GraphLayoutState): GraphLayoutState {
  return structuredClone(layout);
}

export function createEmptyGraphModel(modelName = 'GeneratedModel'): GraphModel {
  return {
    modelName,
    nodes: [],
    edges: [],
  };
}

export function createEmptyGraphLayout(): GraphLayoutState {
  return {
    positionsById: {},
    dimensionsById: {},
    selection: {
      nodeId: null,
      edgeId: null,
    },
  };
}

export function omitPositions(
  positionsById: Record<string, GraphPosition>,
  removedNodeIds: Set<string>,
): Record<string, GraphPosition> {
  return Object.fromEntries(
    Object.entries(positionsById).filter(([nodeId]) => !removedNodeIds.has(nodeId)),
  );
}

export function omitDimensions(
  dimensionsById: Record<string, GraphNodeDimensions>,
  removedNodeIds: Set<string>,
): Record<string, GraphNodeDimensions> {
  return Object.fromEntries(
    Object.entries(dimensionsById).filter(([nodeId]) => !removedNodeIds.has(nodeId)),
  );
}
