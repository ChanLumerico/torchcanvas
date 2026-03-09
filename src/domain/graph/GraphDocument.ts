import type { Connection } from 'reactflow';

import { sanitizePythonIdentifier } from '../../compiler/pythonSerializer';
import type { LayerParamValue } from '../layers';
import { getNodeBehavior } from '../nodes';
import { BoundaryResolver } from './BoundaryResolver';
import type {
  GraphEdge,
  GraphLayoutState,
  GraphModel,
  GraphPosition,
  GraphSnapshot,
  ModelInputBinding,
} from './types';
import {
  cloneGraphLayoutState,
  cloneGraphModel,
  getOrderedContainerChildren,
  normalizeWorkspaceGraphLayout,
  omitDimensions,
  omitPositions,
} from './utils';
import { canConnectGraphNodes } from './validation';

export interface GraphDocumentState {
  graph: GraphModel;
  layout: GraphLayoutState;
}

export interface ReparentDocumentOptions {
  insertAt?: number;
  absolutePosition?: GraphPosition;
}

function cloneState(state: GraphDocumentState): GraphDocumentState {
  return {
    graph: cloneGraphModel(state.graph),
    layout: cloneGraphLayoutState(state.layout),
  };
}

function syncInputs(graph: GraphModel): GraphModel {
  return {
    ...graph,
    inputsByNodeId: new BoundaryResolver(graph).syncInputsByNodeId(graph.inputsByNodeId ?? {}),
  };
}

function finalizeState(state: GraphDocumentState): GraphDocumentState {
  const graphWithInputs = syncInputs(state.graph);
  return normalizeWorkspaceGraphLayout(graphWithInputs, state.layout);
}

function isNodeDescendantOf(graph: GraphModel, nodeId: string, ancestorId: string): boolean {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  let currentNode = nodeMap.get(nodeId);

  while (currentNode?.containerId) {
    if (currentNode.containerId === ancestorId) {
      return true;
    }

    currentNode = nodeMap.get(currentNode.containerId);
  }

  return false;
}

function canNestInContainer(graph: GraphModel, childId: string, parentId: string): boolean {
  if (childId === parentId || isNodeDescendantOf(graph, parentId, childId)) {
    return false;
  }

  const childNode = graph.nodes.find((candidate) => candidate.id === childId);
  const parentNode = graph.nodes.find((candidate) => candidate.id === parentId);
  if (!childNode || !parentNode) {
    return false;
  }

  const childBehavior = getNodeBehavior(childNode.moduleType);
  const parentBehavior = getNodeBehavior(parentNode.moduleType);
  return childBehavior.canBeNestedIn(parentBehavior) && parentBehavior.canAcceptChild(childBehavior);
}

function collectNodeSubtreeIds(graph: GraphModel, rootNodeId: string): Set<string> {
  const subtreeIds = new Set<string>([rootNodeId]);
  let didExpand = true;

  while (didExpand) {
    didExpand = false;
    graph.nodes.forEach((node) => {
      if (node.containerId && subtreeIds.has(node.containerId) && !subtreeIds.has(node.id)) {
        subtreeIds.add(node.id);
        didExpand = true;
      }
    });
  }

  return subtreeIds;
}

function omitEdgesForNodeIds(graph: GraphModel, nodeIds: Set<string>): GraphModel {
  return {
    ...graph,
    edges: graph.edges.filter(
      (edge) => !nodeIds.has(edge.sourceId) && !nodeIds.has(edge.targetId),
    ),
  };
}

function reorderContainerChildren(
  graph: GraphModel,
  containerId: string,
  orderedChildIds: string[],
): GraphModel {
  const nextOrderByNodeId = new Map(
    orderedChildIds.map((childId, index) => [childId, index] as const),
  );

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.containerId !== containerId) {
        return node;
      }

      return {
        ...node,
        containerOrder: nextOrderByNodeId.get(node.id) ?? 0,
      };
    }),
  };
}

function reparentGraphNode(
  graph: GraphModel,
  childId: string,
  parentId: string | undefined,
  insertAt?: number,
): GraphModel {
  const childNode = graph.nodes.find((candidate) => candidate.id === childId);
  if (!childNode) {
    return graph;
  }

  const previousParentId = childNode.containerId;
  const nextParentId = parentId && canNestInContainer(graph, childId, parentId) ? parentId : undefined;
  const previousParentNode = previousParentId
    ? graph.nodes.find((candidate) => candidate.id === previousParentId)
    : undefined;
  const nextParentNode = nextParentId
    ? graph.nodes.find((candidate) => candidate.id === nextParentId)
    : undefined;
  const removeImplicitChildEdges =
    (previousParentNode && getNodeBehavior(previousParentNode.moduleType).usesImplicitChildExecution()) ||
    (nextParentNode && getNodeBehavior(nextParentNode.moduleType).usesImplicitChildExecution());

  let nextGraph: GraphModel = {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== childId) {
        return node;
      }

      if (!nextParentId) {
        return {
          ...node,
          containerId: undefined,
          containerOrder: undefined,
        };
      }

      return {
        ...node,
        containerId: nextParentId,
        containerOrder: typeof insertAt === 'number' ? insertAt : Number.MAX_SAFE_INTEGER,
      };
    }),
  };

  if (removeImplicitChildEdges) {
    nextGraph = omitEdgesForNodeIds(nextGraph, collectNodeSubtreeIds(nextGraph, childId));
  }

  const affectedParents = new Set<string>();
  if (previousParentId) {
    affectedParents.add(previousParentId);
  }
  if (nextParentId) {
    affectedParents.add(nextParentId);
  }

  affectedParents.forEach((affectedParentId) => {
    let childIds = getOrderedContainerChildren(nextGraph, affectedParentId).map((node) => node.id);
    if (affectedParentId === nextParentId) {
      childIds = childIds.filter((currentChildId) => currentChildId !== childId);
      const safeInsertAt = Math.max(0, Math.min(insertAt ?? childIds.length, childIds.length));
      childIds.splice(safeInsertAt, 0, childId);
    }

    nextGraph = reorderContainerChildren(nextGraph, affectedParentId, childIds);
  });

  return nextGraph;
}

function clearRemovedNodes(graph: GraphModel, removedNodeIds: Set<string>): GraphModel {
  return {
    ...graph,
    inputsByNodeId: Object.fromEntries(
      Object.entries(graph.inputsByNodeId).filter(([nodeId]) => !removedNodeIds.has(nodeId)),
    ),
    nodes: graph.nodes
      .filter((node) => !removedNodeIds.has(node.id))
      .map((node) =>
        node.containerId && removedNodeIds.has(node.containerId)
          ? { ...node, containerId: undefined }
          : node,
      ),
    edges: graph.edges.filter(
      (edge) => !removedNodeIds.has(edge.sourceId) && !removedNodeIds.has(edge.targetId),
    ),
  };
}

function createEdgeId(graph: GraphModel, sourceId: string, targetId: string): string {
  const baseId = `edge-${sourceId}-${targetId}`;
  if (!graph.edges.some((edge) => edge.id === baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (graph.edges.some((edge) => edge.id === `${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

export class GraphDocument {
  private readonly state: GraphDocumentState;

  constructor(graph: GraphModel, layout: GraphLayoutState) {
    this.state = finalizeState(cloneState({ graph, layout }));
  }

  snapshot(): GraphDocumentState {
    return cloneState(this.state);
  }

  private next(graph: GraphModel, layout: GraphLayoutState): GraphDocument {
    return new GraphDocument(graph, layout);
  }

  addTopLevelNode(node: GraphModel['nodes'][number], position: GraphPosition): GraphDocument {
    return this.next(
      {
        ...this.state.graph,
        nodes: [...this.state.graph.nodes, node],
      },
      {
        ...this.state.layout,
        positionsById: {
          ...this.state.layout.positionsById,
          [node.id]: position,
        },
      },
    );
  }

  insertIntoContainer(
    node: GraphModel['nodes'][number],
    position: GraphPosition,
    parentId: string,
    insertAt?: number,
  ): GraphDocument {
    const nextGraph = reparentGraphNode(
      {
        ...this.state.graph,
        nodes: [...this.state.graph.nodes, node],
      },
      node.id,
      parentId,
      insertAt,
    );

    return this.next(
      nextGraph,
      {
        ...this.state.layout,
        positionsById: {
          ...this.state.layout.positionsById,
          [node.id]: position,
        },
      },
    );
  }

  reparentNode(
    childId: string,
    parentId: string | undefined,
    options?: ReparentDocumentOptions,
  ): GraphDocument {
    const nextGraph = reparentGraphNode(
      this.state.graph,
      childId,
      parentId,
      options?.insertAt,
    );
    const nextLayout =
      !parentId && options?.absolutePosition
        ? {
            ...this.state.layout,
            positionsById: {
              ...this.state.layout.positionsById,
              [childId]: options.absolutePosition,
            },
          }
        : this.state.layout;

    return this.next(nextGraph, nextLayout);
  }

  extractChildToCanvas(childId: string, absolutePosition: GraphPosition): GraphDocument {
    return this.reparentNode(childId, undefined, { absolutePosition });
  }

  moveTopLevelNode(nodeId: string, absolutePosition: GraphPosition): GraphDocument {
    return this.next(
      this.state.graph,
      {
        ...this.state.layout,
        positionsById: {
          ...this.state.layout.positionsById,
          [nodeId]: absolutePosition,
        },
      },
    );
  }

  connectNodes(connection: Connection): GraphDocument {
    if (!connection.source || !connection.target) {
      return this;
    }

    if (!canConnectGraphNodes(this.state.graph, connection)) {
      return this;
    }

    const nextEdge: GraphEdge = {
      id: createEdgeId(this.state.graph, connection.source, connection.target),
      sourceId: connection.source,
      targetId: connection.target,
    };

    return this.next(
      {
        ...this.state.graph,
        edges: [...this.state.graph.edges, nextEdge],
      },
      this.state.layout,
    );
  }

  deleteNode(nodeId: string): GraphDocument {
    const removedNodeIds = new Set([nodeId]);
    const nextGraph = clearRemovedNodes(this.state.graph, removedNodeIds);
    const nextLayout: GraphLayoutState = {
      ...this.state.layout,
      positionsById: omitPositions(this.state.layout.positionsById, removedNodeIds),
      dimensionsById: omitDimensions(this.state.layout.dimensionsById, removedNodeIds),
      selection:
        this.state.layout.selection.nodeId === nodeId
          ? { nodeId: null, edgeId: null }
          : this.state.layout.selection,
    };

    return this.next(nextGraph, nextLayout);
  }

  deleteNodes(nodeIds: Set<string>): GraphDocument {
    const nextGraph = clearRemovedNodes(this.state.graph, nodeIds);
    const nextLayout: GraphLayoutState = {
      ...this.state.layout,
      positionsById: omitPositions(this.state.layout.positionsById, nodeIds),
      dimensionsById: omitDimensions(this.state.layout.dimensionsById, nodeIds),
      selection:
        (this.state.layout.selection.nodeId && nodeIds.has(this.state.layout.selection.nodeId)) ||
        (this.state.layout.selection.edgeId &&
          !nextGraph.edges.some((edge) => edge.id === this.state.layout.selection.edgeId))
          ? { nodeId: null, edgeId: null }
          : this.state.layout.selection,
    };

    return this.next(nextGraph, nextLayout);
  }

  deleteEdge(edgeId: string): GraphDocument {
    return this.next(
      {
        ...this.state.graph,
        edges: this.state.graph.edges.filter((edge) => edge.id !== edgeId),
      },
      {
        ...this.state.layout,
        selection:
          this.state.layout.selection.edgeId === edgeId
            ? { nodeId: null, edgeId: null }
            : this.state.layout.selection,
      },
    );
  }

  deleteEdges(edgeIds: Set<string>): GraphDocument {
    return this.next(
      {
        ...this.state.graph,
        edges: this.state.graph.edges.filter((edge) => !edgeIds.has(edge.id)),
      },
      {
        ...this.state.layout,
        selection:
          this.state.layout.selection.edgeId && edgeIds.has(this.state.layout.selection.edgeId)
            ? { nodeId: null, edgeId: null }
            : this.state.layout.selection,
      },
    );
  }

  updateNodeParams(nodeId: string, params: Record<string, LayerParamValue>): GraphDocument {
    return this.next(
      {
        ...this.state.graph,
        nodes: this.state.graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, params: { ...node.params, ...params } } : node,
        ),
      },
      this.state.layout,
    );
  }

  updateNodeAttributeName(nodeId: string, name: string): GraphDocument {
    const node = this.state.graph.nodes.find((entry) => entry.id === nodeId);
    const nextGraph = {
      ...this.state.graph,
      nodes: this.state.graph.nodes.map((entry) =>
        entry.id === nodeId ? { ...entry, attributeName: name } : entry,
      ),
    };

    if (node && nextGraph.inputsByNodeId[nodeId]) {
      const previousFallback = sanitizePythonIdentifier(node.attributeName, `input_${nodeId}`);
      if (nextGraph.inputsByNodeId[nodeId].argumentName === previousFallback) {
        nextGraph.inputsByNodeId[nodeId] = {
          ...nextGraph.inputsByNodeId[nodeId],
          argumentName: sanitizePythonIdentifier(name, `input_${nodeId}`),
        };
      }
    }

    return this.next(nextGraph, this.state.layout);
  }

  updateModelInput(nodeId: string, patch: Partial<ModelInputBinding>): GraphDocument {
    return this.next(
      {
        ...this.state.graph,
        inputsByNodeId: {
          ...this.state.graph.inputsByNodeId,
          [nodeId]: {
            argumentName: patch.argumentName ?? this.state.graph.inputsByNodeId[nodeId]?.argumentName ?? '',
            shape: patch.shape ?? this.state.graph.inputsByNodeId[nodeId]?.shape ?? '',
          },
        },
      },
      this.state.layout,
    );
  }

  syncModelInputs(): GraphDocument {
    return this.next(syncInputs(this.state.graph), this.state.layout);
  }

  toSnapshot(): GraphSnapshot {
    return {
      graph: cloneGraphModel(this.state.graph),
      layout: cloneGraphLayoutState(this.state.layout),
    };
  }
}
