import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';
import type {
  Connection,
  EdgeChange,
  NodeChange,
  Node as ReactFlowNode,
} from 'reactflow';

import { inferGraphNodeMeta } from '../compiler/shapeInference';
import {
  createGraphNodeFromReactFlowNode,
  createGraphEdgeFromReactFlowEdge,
  getAbsolutePositionForReactFlowNode,
  graphToReactFlowEdges,
  graphToReactFlowNodes,
  type Edge,
  type ModuleData,
  type NetworkNode,
} from '../domain/graph/reactFlowAdapter';
import type {
  GraphLayoutState,
  GraphModel,
  GraphSnapshot,
} from '../domain/graph/types';
import {
  cloneGraphLayoutState,
  cloneGraphModel,
  createEmptyGraphLayout,
  createEmptyGraphModel,
  getOrderedContainerChildren,
  normalizeWorkspaceGraphLayout,
  omitDimensions,
  omitPositions,
} from '../domain/graph/utils';
import { getNodeBehavior } from '../domain/nodes';
import { createProjectComparisonSignature } from '../domain/project/projectFile';
import { canConnectGraphNodes } from '../domain/graph/validation';
import type { LayerParamValue, ModuleType } from '../domain/layers';

const MAX_HISTORY = 50;

function createInitialSnapshot(): GraphSnapshot {
  return {
    graph: createEmptyGraphModel(),
    layout: createEmptyGraphLayout(),
  };
}

function materializeWorkspace(graph: GraphModel, layout: GraphLayoutState) {
  const metaByNodeId = inferGraphNodeMeta(graph);
  return {
    graph,
    layout,
    modelName: graph.modelName,
    selectedNodeId: layout.selection.nodeId,
    selectedEdgeId: layout.selection.edgeId,
    nodes: graphToReactFlowNodes(graph, layout, metaByNodeId),
    edges: graphToReactFlowEdges(graph, layout),
  };
}

function createSnapshot(graph: GraphModel, layout: GraphLayoutState): GraphSnapshot {
  return {
    graph: cloneGraphModel(graph),
    layout: cloneGraphLayoutState(layout),
  };
}

function getNormalizedWorkspace(graph: GraphModel, layout: GraphLayoutState) {
  return normalizeWorkspaceGraphLayout(graph, layout);
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

function omitEdgesForNodeIds(graph: GraphModel, nodeIds: Set<string>): GraphModel {
  return {
    ...graph,
    edges: graph.edges.filter(
      (edge) => !nodeIds.has(edge.sourceId) && !nodeIds.has(edge.targetId),
    ),
  };
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

interface AddNodeOptions {
  parentId?: string;
  insertAt?: number;
}

interface ReparentNodeOptions {
  insertAt?: number;
}

function clearRemovedContainers(graph: GraphModel, removedNodeIds: Set<string>): GraphModel {
  return {
    ...graph,
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

interface WorkspaceState {
  graph: GraphModel;
  layout: GraphLayoutState;
  modelName: string;
  nodes: NetworkNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  history: GraphSnapshot[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  persistedProjectBaseline: string;
  undo: () => void;
  redo: () => void;
  resetWorkspace: () => void;
  replaceWorkspace: (graph: GraphModel, layout: GraphLayoutState) => void;
  markPersistedBaseline: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection) => boolean;
  onEdgesDelete: (edges: Edge[]) => void;
  onNodesDelete: (nodes: NetworkNode[]) => void;
  addNode: (node: NetworkNode, options?: AddNodeOptions) => void;
  deleteNodeById: (id: string) => void;
  deleteEdgeById: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  updateNodeParams: (id: string, params: Record<string, LayerParamValue>) => void;
  updateNodeAttributeName: (id: string, name: string) => void;
  reparentNode: (childId: string, parentId: string | undefined, options?: ReparentNodeOptions) => void;
  setModelName: (name: string) => void;
}

const initialSnapshot = createInitialSnapshot();
const initialMaterialized = materializeWorkspace(initialSnapshot.graph, initialSnapshot.layout);
const initialPersistedBaseline = createProjectComparisonSignature(
  initialSnapshot.graph,
  initialSnapshot.layout,
);

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  function applyWorkspaceState(
    graph: GraphModel,
    layout: GraphLayoutState,
    history = get().history,
    historyIndex = get().historyIndex,
    persistedProjectBaseline = get().persistedProjectBaseline,
  ) {
    const normalizedWorkspace = getNormalizedWorkspace(graph, layout);
    const currentBaseline = createProjectComparisonSignature(
      normalizedWorkspace.graph,
      normalizedWorkspace.layout,
    );

    set({
      ...materializeWorkspace(normalizedWorkspace.graph, normalizedWorkspace.layout),
      history,
      historyIndex,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      isDirty: currentBaseline !== persistedProjectBaseline,
      persistedProjectBaseline,
    });
  }

  function commitWorkspace(graph: GraphModel, layout: GraphLayoutState) {
    const state = get();
    const normalizedWorkspace = getNormalizedWorkspace(graph, layout);
    const trimmedHistory = state.history.slice(0, state.historyIndex + 1);
    const nextHistory = [
      ...trimmedHistory,
      createSnapshot(normalizedWorkspace.graph, normalizedWorkspace.layout),
    ].slice(-MAX_HISTORY);
    const nextHistoryIndex = nextHistory.length - 1;
    applyWorkspaceState(
      normalizedWorkspace.graph,
      normalizedWorkspace.layout,
      nextHistory,
      nextHistoryIndex,
    );
  }

  return {
    ...initialMaterialized,
    history: [createSnapshot(initialSnapshot.graph, initialSnapshot.layout)],
    historyIndex: 0,
    canUndo: false,
    canRedo: false,
    isDirty: false,
    persistedProjectBaseline: initialPersistedBaseline,

    undo: () => {
      const state = get();
      if (state.historyIndex === 0) {
        return;
      }

      const nextHistoryIndex = state.historyIndex - 1;
      const snapshot = state.history[nextHistoryIndex];
      applyWorkspaceState(
        cloneGraphModel(snapshot.graph),
        {
          ...cloneGraphLayoutState(snapshot.layout),
          selection: { nodeId: null, edgeId: null },
        },
        state.history,
        nextHistoryIndex,
      );
    },

    redo: () => {
      const state = get();
      if (state.historyIndex >= state.history.length - 1) {
        return;
      }

      const nextHistoryIndex = state.historyIndex + 1;
      const snapshot = state.history[nextHistoryIndex];
      applyWorkspaceState(
        cloneGraphModel(snapshot.graph),
        {
          ...cloneGraphLayoutState(snapshot.layout),
          selection: { nodeId: null, edgeId: null },
        },
        state.history,
        nextHistoryIndex,
      );
    },

    resetWorkspace: () => {
      const snapshot = createInitialSnapshot();
      const persistedProjectBaseline = createProjectComparisonSignature(
        snapshot.graph,
        snapshot.layout,
      );
      applyWorkspaceState(
        snapshot.graph,
        snapshot.layout,
        [createSnapshot(snapshot.graph, snapshot.layout)],
        0,
        persistedProjectBaseline,
      );
    },

    replaceWorkspace: (graph, layout) => {
      const normalizedWorkspace = getNormalizedWorkspace(
        cloneGraphModel(graph),
        {
          ...cloneGraphLayoutState(layout),
          selection: { nodeId: null, edgeId: null },
        },
      );
      const persistedProjectBaseline = createProjectComparisonSignature(
        normalizedWorkspace.graph,
        normalizedWorkspace.layout,
      );

      applyWorkspaceState(
        normalizedWorkspace.graph,
        normalizedWorkspace.layout,
        [createSnapshot(normalizedWorkspace.graph, normalizedWorkspace.layout)],
        0,
        persistedProjectBaseline,
      );
    },

    markPersistedBaseline: () => {
      const state = get();
      const normalizedWorkspace = getNormalizedWorkspace(
        state.graph,
        state.layout,
      );
      const persistedProjectBaseline = createProjectComparisonSignature(
        normalizedWorkspace.graph,
        normalizedWorkspace.layout,
      );

      applyWorkspaceState(
        normalizedWorkspace.graph,
        normalizedWorkspace.layout,
        state.history,
        state.historyIndex,
        persistedProjectBaseline,
      );
    },

    onNodesChange: (changes) => {
      const state = get();
      const nextNodes = applyNodeChanges(changes, state.nodes) as NetworkNode[];
      const nextPositions = { ...state.layout.positionsById };
      const nextDimensions = { ...state.layout.dimensionsById };
      const graphNodeMap = new Map(state.graph.nodes.map((node) => [node.id, node] as const));

      nextNodes
        .slice()
        .sort((leftNode, rightNode) => {
          const leftHasParent = Boolean(graphNodeMap.get(leftNode.id)?.containerId);
          const rightHasParent = Boolean(graphNodeMap.get(rightNode.id)?.containerId);
          return Number(leftHasParent) - Number(rightHasParent);
        })
        .forEach((node) => {
          nextPositions[node.id] = getAbsolutePositionForReactFlowNode(
            node,
            state.graph,
            { ...state.layout, positionsById: nextPositions },
          );

          if (typeof node.width === 'number' && typeof node.height === 'number') {
            nextDimensions[node.id] = {
              width: node.width,
              height: node.height,
            };
          }
        });

      const selectedNodes = nextNodes.filter((node) => node.selected);
      const nextLayout: GraphLayoutState = {
        ...state.layout,
        positionsById: nextPositions,
        dimensionsById: nextDimensions,
        selection: { nodeId: null, edgeId: null },
      };
      nextLayout.selection = {
        nodeId: selectedNodes.length === 1 ? selectedNodes[0].id : null,
        edgeId: selectedNodes.length > 0 ? null : state.layout.selection.edgeId,
      };

      applyWorkspaceState(state.graph, nextLayout);
    },

    onEdgesChange: (changes) => {
      const state = get();
      const nextEdges = applyEdgeChanges(changes, state.edges);
      const selectedEdges = nextEdges.filter((edge) => edge.selected);
      const nextLayout: GraphLayoutState = {
        ...state.layout,
        selection: {
          nodeId: selectedEdges.length > 0 ? null : state.layout.selection.nodeId,
          edgeId: selectedEdges.length === 1 ? selectedEdges[0].id : null,
        },
      };

      applyWorkspaceState(state.graph, nextLayout);
    },

    onConnect: (connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      const state = get();
      if (!canConnectGraphNodes(state.graph, connection)) {
        return;
      }

      const projectedEdges = graphToReactFlowEdges(state.graph, state.layout);
      const nextProjectedEdges = addEdge(connection, projectedEdges);
      const createdEdge = nextProjectedEdges.find(
        (edge) => !state.graph.edges.some((existingEdge) => existingEdge.id === edge.id),
      );

      if (!createdEdge) {
        return;
      }

      commitWorkspace(
        {
          ...state.graph,
          edges: [...state.graph.edges, createGraphEdgeFromReactFlowEdge(createdEdge)],
        },
        state.layout,
      );
    },

    isValidConnection: (connection) => {
      const state = get();
      return canConnectGraphNodes(state.graph, connection);
    },

    onEdgesDelete: (deletedEdges) => {
      const state = get();
      const removedEdgeIds = new Set(deletedEdges.map((edge) => edge.id));
      commitWorkspace(
        {
          ...state.graph,
          edges: state.graph.edges.filter((edge) => !removedEdgeIds.has(edge.id)),
        },
        {
          ...state.layout,
          selection:
            state.layout.selection.edgeId && removedEdgeIds.has(state.layout.selection.edgeId)
              ? { nodeId: null, edgeId: null }
              : state.layout.selection,
        },
      );
    },

    onNodesDelete: (deletedNodes) => {
      const state = get();
      const removedNodeIds = new Set(deletedNodes.map((node) => node.id));
      const nextGraph = clearRemovedContainers(state.graph, removedNodeIds);
      const nextLayout: GraphLayoutState = {
        ...state.layout,
        positionsById: omitPositions(state.layout.positionsById, removedNodeIds),
        dimensionsById: omitDimensions(state.layout.dimensionsById, removedNodeIds),
        selection:
          (state.layout.selection.nodeId && removedNodeIds.has(state.layout.selection.nodeId)) ||
          (state.layout.selection.edgeId &&
            !nextGraph.edges.some((edge) => edge.id === state.layout.selection.edgeId))
            ? { nodeId: null, edgeId: null }
            : state.layout.selection,
      };

      commitWorkspace(nextGraph, nextLayout);
    },

    addNode: (node, options) => {
      const state = get();
      const { graphNode, position } = createGraphNodeFromReactFlowNode(node);
      const nextGraph = options?.parentId
        ? reparentGraphNode(
            {
              ...state.graph,
              nodes: [...state.graph.nodes, graphNode],
            },
            node.id,
            options.parentId,
            options.insertAt,
          )
        : {
            ...state.graph,
            nodes: [...state.graph.nodes, graphNode],
          };

      commitWorkspace(
        nextGraph,
        {
          ...state.layout,
          positionsById: {
            ...state.layout.positionsById,
            [node.id]: position,
          },
        },
      );
    },

    deleteNodeById: (id) => {
      const state = get();
      const removedNodeIds = new Set([id]);
      const nextGraph = clearRemovedContainers(state.graph, removedNodeIds);
      const nextLayout: GraphLayoutState = {
        ...state.layout,
        positionsById: omitPositions(state.layout.positionsById, removedNodeIds),
        dimensionsById: omitDimensions(state.layout.dimensionsById, removedNodeIds),
        selection:
          state.layout.selection.nodeId === id
            ? { nodeId: null, edgeId: null }
            : state.layout.selection,
      };

      commitWorkspace(nextGraph, nextLayout);
    },

    deleteEdgeById: (id) => {
      const state = get();
      commitWorkspace(
        {
          ...state.graph,
          edges: state.graph.edges.filter((edge) => edge.id !== id),
        },
        {
          ...state.layout,
          selection: state.layout.selection.edgeId === id ? { nodeId: null, edgeId: null } : state.layout.selection,
        },
      );
    },

    setSelectedNode: (id) => {
      const state = get();
      applyWorkspaceState(state.graph, {
        ...state.layout,
        selection: {
          nodeId: id,
          edgeId: null,
        },
      });
    },

    setSelectedEdge: (id) => {
      const state = get();
      applyWorkspaceState(state.graph, {
        ...state.layout,
        selection: {
          nodeId: null,
          edgeId: id,
        },
      });
    },

    updateNodeParams: (id, params) => {
      const state = get();
      commitWorkspace(
        {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === id ? { ...node, params: { ...node.params, ...params } } : node,
          ),
        },
        state.layout,
      );
    },

    updateNodeAttributeName: (id, name) => {
      const state = get();
      commitWorkspace(
        {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === id ? { ...node, attributeName: name } : node,
          ),
        },
        state.layout,
      );
    },

    reparentNode: (childId, parentId, options) => {
      const state = get();

      commitWorkspace(
        reparentGraphNode(state.graph, childId, parentId && parentId !== childId ? parentId : undefined, options?.insertAt),
        state.layout,
      );
    },

    setModelName: (name) => {
      const state = get();
      applyWorkspaceState(
        {
          ...state.graph,
          modelName: name,
        },
        state.layout,
      );
    },
  };
});

export type { Edge, ModuleData, ModuleType, NetworkNode, ReactFlowNode };
