import type {
  GraphLayoutState,
  GraphModel,
  GraphNode,
  GraphNodeDimensions,
  GraphPosition,
} from './types';
import { isContainerModule, type ModuleType } from '../layers';
import {
  CONTAINER_LAYOUT,
  getNodeBehavior,
  type AbstractContainerNodeBehavior,
  type ContainerChildLayout,
} from '../nodes';

export interface GraphIndex {
  nodeMap: Map<string, GraphNode>;
  adjacencyList: Map<string, string[]>;
  reverseList: Map<string, string[]>;
  inDegree: Map<string, number>;
  topologicalOrder: string[];
  connectedIds: Set<string>;
  hasCycle: boolean;
}

export interface ContainerDropTarget {
  containerId: string;
  insertAt: number;
}

export interface ContainerLayoutIndex {
  dimensionsByNodeId: Map<string, GraphNodeDimensions>;
  childLayoutsByNodeId: Map<string, ContainerChildLayout>;
}

function getContainerBehavior(type: ModuleType | undefined): AbstractContainerNodeBehavior | null {
  if (!type) {
    return null;
  }

  const behavior = getNodeBehavior(type);
  return behavior.isContainer() ? (behavior as AbstractContainerNodeBehavior) : null;
}

function getLeafChildWidth(
  parentBehavior: AbstractContainerNodeBehavior,
  availableWidth: number,
): number {
  if (parentBehavior.usesImplicitChildExecution()) {
    return Math.min(CONTAINER_LAYOUT.centeredSequentialChildWidth, availableWidth);
  }

  return availableWidth;
}

function getChildLeftOffset(
  parentBehavior: AbstractContainerNodeBehavior,
  containerWidth: number,
  childWidth: number,
): number {
  if (parentBehavior.usesImplicitChildExecution()) {
    return Math.max(0, Math.round((containerWidth - childWidth) / 2));
  }

  return CONTAINER_LAYOUT.paddingX;
}

function measureContainerLayoutRecursively(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  containerId: string,
  containerWidth: number,
  index: ContainerLayoutIndex,
  nodeMap: Map<string, GraphNode>,
): GraphNodeDimensions {
  const cacheKey = `${containerId}:${containerWidth}`;
  const cachedDimensions = index.dimensionsByNodeId.get(cacheKey);
  if (cachedDimensions) {
    return cachedDimensions;
  }

  const containerNode = nodeMap.get(containerId);
  const containerBehavior = containerNode ? getContainerBehavior(containerNode.moduleType) : null;
  if (!containerNode || !containerBehavior) {
    return {
      width: containerWidth,
      height: CONTAINER_LAYOUT.minHeight,
    };
  }

  const children = getOrderedContainerChildren(graph, containerId);
  const availableWidth = Math.max(containerWidth - CONTAINER_LAYOUT.paddingX * 2, 0);
  let nextY = CONTAINER_LAYOUT.stackTop;

  children.forEach((childNode) => {
    const childBehavior = getNodeBehavior(childNode.moduleType);
    const childDimensions = childBehavior.isContainer()
      ? measureContainerLayoutRecursively(graph, childNode.id, availableWidth, index, nodeMap)
      : {
          width: getLeafChildWidth(containerBehavior, availableWidth),
          height: CONTAINER_LAYOUT.childHeight,
        };
    const childLayout: ContainerChildLayout = {
      position: {
        x: getChildLeftOffset(containerBehavior, containerWidth, childDimensions.width),
        y: nextY,
      },
      dimensions: childDimensions,
      presentation: {
        compact: !childBehavior.isContainer(),
        hideHandles: !containerBehavior.getConnectionPolicy().allowDirectChildConnections,
      },
    };

    index.childLayoutsByNodeId.set(childNode.id, childLayout);
    nextY += childDimensions.height + CONTAINER_LAYOUT.childGap;
  });

  const dimensions = {
    width: containerWidth,
    height: Math.max(
      CONTAINER_LAYOUT.minHeight,
      children.length === 0
        ? CONTAINER_LAYOUT.minHeight
        : nextY - CONTAINER_LAYOUT.childGap + CONTAINER_LAYOUT.bottomPadding,
    ),
  };

  index.dimensionsByNodeId.set(cacheKey, dimensions);
  index.dimensionsByNodeId.set(containerId, dimensions);
  return dimensions;
}

export function buildContainerLayoutIndex(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
): ContainerLayoutIndex {
  const index: ContainerLayoutIndex = {
    dimensionsByNodeId: new Map<string, GraphNodeDimensions>(),
    childLayoutsByNodeId: new Map<string, ContainerChildLayout>(),
  };
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));

  graph.nodes
    .filter((node) => isContainerModule(node.moduleType) && !node.containerId)
    .forEach((containerNode) => {
      measureContainerLayoutRecursively(
        graph,
        containerNode.id,
        CONTAINER_LAYOUT.width,
        index,
        nodeMap,
      );
    });

  return index;
}

function getInsertIndexFromChildLayouts(
  childLayouts: ContainerChildLayout[],
  relativeY: number,
): number {
  if (childLayouts.length === 0) {
    return 0;
  }

  for (let index = 0; index < childLayouts.length; index += 1) {
    const childLayout = childLayouts[index];
    const midpoint = childLayout.position.y + childLayout.dimensions.height / 2;
    if (relativeY <= midpoint) {
      return index;
    }
  }

  return childLayouts.length;
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
): Map<string, string[]> {
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index] as const));
  const children = new Map<string, string[]>();

  graph.nodes
    .filter((node) => Boolean(node.containerId))
    .sort((leftNode, rightNode) => {
      const leftRank =
        typeof leftNode.containerOrder === 'number'
          ? leftNode.containerOrder
          : (nodeOrder.get(leftNode.id) ?? 0);
      const rightRank =
        typeof rightNode.containerOrder === 'number'
          ? rightNode.containerOrder
          : (nodeOrder.get(rightNode.id) ?? 0);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (nodeOrder.get(leftNode.id) ?? 0) - (nodeOrder.get(rightNode.id) ?? 0);
    })
    .forEach((node) => {
      if (!node.containerId) {
        return;
      }

      const entries = children.get(node.containerId) ?? [];
      entries.push(node.id);
      children.set(node.containerId, entries);
    });

  return children;
}

export function getOrderedContainerChildren(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  containerId: string,
): GraphNode[] {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const children = getContainerChildren(graph).get(containerId) ?? [];
  return children
    .map((childId) => nodeMap.get(childId))
    .filter((node): node is GraphNode => Boolean(node));
}

export function normalizeContainerOrders(graph: GraphModel): GraphModel {
  const orderedChildrenByContainer = getContainerChildren(graph);
  const orderByNodeId = new Map<string, number>();

  orderedChildrenByContainer.forEach((childIds) => {
    childIds.forEach((childId, index) => {
      orderByNodeId.set(childId, index);
    });
  });

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!node.containerId) {
        return node.containerOrder === undefined ? node : { ...node, containerOrder: undefined };
      }

      const containerOrder = orderByNodeId.get(node.id) ?? 0;
      return node.containerOrder === containerOrder
        ? node
        : { ...node, containerOrder };
    }),
  };
}

export function getContainerChildWidth(containerType?: ModuleType): number {
  return getContainerBehavior(containerType)?.getChildWidth()
    ?? CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2;
}

export function getContainerChildRelativePosition(
  containerOrder: number,
  containerType?: ModuleType,
): GraphPosition {
  const behavior = getContainerBehavior(containerType);
  return behavior?.getChildLayout(containerOrder).position ?? {
    x: CONTAINER_LAYOUT.paddingX,
    y:
      CONTAINER_LAYOUT.stackTop +
      containerOrder * (CONTAINER_LAYOUT.childHeight + CONTAINER_LAYOUT.childGap),
  };
}

export function getContainerChildAbsolutePosition(
  parentPosition: GraphPosition,
  containerOrder: number,
  containerType?: ModuleType,
): GraphPosition {
  const relativePosition = getContainerChildRelativePosition(containerOrder, containerType);
  return {
    x: parentPosition.x + relativePosition.x,
    y: parentPosition.y + relativePosition.y,
  };
}

export function getContainerDimensionsByChildCount(
  childCount: number,
  containerType?: ModuleType,
): GraphNodeDimensions {
  return (
    getContainerBehavior(containerType)?.getContainerDimensions(childCount) ?? {
      width: CONTAINER_LAYOUT.width,
      height: CONTAINER_LAYOUT.minHeight,
    }
  );
}

export function getContainerDimensions(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  containerId: string,
): GraphNodeDimensions {
  return (
    buildContainerLayoutIndex(graph).dimensionsByNodeId.get(containerId) ??
    getContainerDimensionsByChildCount(getOrderedContainerChildren(graph, containerId).length)
  );
}

export function syncContainerChildPositions(
  graph: GraphModel,
  layout: GraphLayoutState,
): GraphLayoutState {
  const nextPositions = { ...layout.positionsById };
  const orderedGraph = normalizeContainerOrders(graph);
  const layoutIndex = buildContainerLayoutIndex(orderedGraph);

  const syncContainerChildren = (containerId: string) => {
    const parentPosition = nextPositions[containerId] ?? { x: 0, y: 0 };
    const childNodes = getOrderedContainerChildren(orderedGraph, containerId);

    childNodes.forEach((childNode) => {
      const childLayout = layoutIndex.childLayoutsByNodeId.get(childNode.id);
      if (!childLayout) {
        return;
      }

      nextPositions[childNode.id] = {
        x: parentPosition.x + childLayout.position.x,
        y: parentPosition.y + childLayout.position.y,
      };

      if (isContainerModule(childNode.moduleType)) {
        syncContainerChildren(childNode.id);
      }
    });
  };

  orderedGraph.nodes
    .filter((node) => isContainerModule(node.moduleType) && !node.containerId)
    .forEach((containerNode) => {
      syncContainerChildren(containerNode.id);
    });

  return {
    ...layout,
    positionsById: nextPositions,
  };
}

export function normalizeWorkspaceGraphLayout(
  graph: GraphModel,
  layout: GraphLayoutState,
): { graph: GraphModel; layout: GraphLayoutState } {
  const normalizedGraph = normalizeContainerOrders(graph);
  return {
    graph: normalizedGraph,
    layout: syncContainerChildPositions(normalizedGraph, layout),
  };
}

export function isSequentialChild(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  nodeId: string,
): boolean {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const node = nodeMap.get(nodeId);
  if (!node?.containerId) {
    return false;
  }

  const parentNode = nodeMap.get(node.containerId);
  return Boolean(parentNode && getNodeBehavior(parentNode.moduleType).usesImplicitChildExecution());
}

export function getSequentialDerivedEdgePairs(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
): Array<{ containerId: string; sourceId: string; targetId: string }> {
  return graph.nodes
    .filter((node) => getNodeBehavior(node.moduleType).usesImplicitChildExecution())
    .flatMap((containerNode) => {
      const children = getOrderedContainerChildren(graph, containerNode.id);
      return children.slice(0, -1).map((childNode, index) => ({
        containerId: containerNode.id,
        sourceId: childNode.id,
        targetId: children[index + 1].id,
      }));
    });
}

export function getContainerDropTargetAtPosition(
  graph: Pick<GraphModel, 'nodes' | 'edges'>,
  layout: Pick<GraphLayoutState, 'positionsById'>,
  position: GraphPosition,
  candidateType?: ModuleType,
  excludeNodeId?: string,
): ContainerDropTarget | null {
  const candidateBehavior = candidateType ? getNodeBehavior(candidateType) : null;
  if (!candidateBehavior) {
    return null;
  }

  const layoutIndex = buildContainerLayoutIndex(graph);

  const candidates = graph.nodes
    .filter((node) => isContainerModule(node.moduleType))
    .map((node) => {
      const absolutePosition = layout.positionsById[node.id];
      if (!absolutePosition) {
        return null;
      }

      const containerBehavior = getContainerBehavior(node.moduleType);
      if (
        !containerBehavior ||
        !candidateBehavior.canBeNestedIn(containerBehavior) ||
        !containerBehavior.canAcceptChild(candidateBehavior)
      ) {
        return null;
      }

      const containerDimensions =
        layoutIndex.dimensionsByNodeId.get(node.id) ??
        getContainerDimensionsByChildCount(getOrderedContainerChildren(graph, node.id).length);
      const orderedChildren = getOrderedContainerChildren(graph, node.id).filter(
        (childNode) => childNode.id !== excludeNodeId,
      );
      const childLayouts = orderedChildren
        .map((childNode) => layoutIndex.childLayoutsByNodeId.get(childNode.id))
        .filter((childLayout): childLayout is ContainerChildLayout => Boolean(childLayout));
      const zone = {
        x: CONTAINER_LAYOUT.paddingX,
        y: CONTAINER_LAYOUT.stackTop - Math.floor(CONTAINER_LAYOUT.childGap / 2),
        width: Math.max(0, containerDimensions.width - CONTAINER_LAYOUT.paddingX * 2),
        height: Math.max(
          CONTAINER_LAYOUT.childHeight,
          containerDimensions.height -
            (CONTAINER_LAYOUT.stackTop - Math.floor(CONTAINER_LAYOUT.childGap / 2)) -
            Math.floor(CONTAINER_LAYOUT.bottomPadding / 2),
        ),
      };

      const isWithinZone =
        position.x >= absolutePosition.x + zone.x &&
        position.x <= absolutePosition.x + zone.x + zone.width &&
        position.y >= absolutePosition.y + zone.y &&
        position.y <= absolutePosition.y + zone.y + zone.height;

      if (!isWithinZone) {
        return null;
      }

      const relativeY = position.y - absolutePosition.y;
      const insertAt = getInsertIndexFromChildLayouts(childLayouts, relativeY);

      return {
        containerId: node.id,
        insertAt,
        area: zone.width * zone.height,
      };
    })
    .filter((candidate): candidate is ContainerDropTarget & { area: number } => Boolean(candidate))
    .sort((left, right) => left.area - right.area);

  if (candidates.length === 0) {
    return null;
  }

  return {
    containerId: candidates[0].containerId,
    insertAt: candidates[0].insertAt,
  };
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
