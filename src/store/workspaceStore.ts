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
  omitDimensions,
  omitPositions,
} from '../domain/graph/utils';
import { createProjectComparisonSignature } from '../domain/project/projectFile';
import { canConnectGraphNodes } from '../domain/graph/validation';
import { getLayerDefinition, type LayerParamValue, type ModuleType } from '../domain/layers';

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

function isContainerIdValid(graph: GraphModel, nodeId: string | undefined): nodeId is string {
  if (!nodeId) {
    return false;
  }

  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  return !!node && getLayerDefinition(node.moduleType).kind === 'container';
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
  addNode: (node: NetworkNode) => void;
  deleteNodeById: (id: string) => void;
  deleteEdgeById: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  updateNodeParams: (id: string, params: Record<string, LayerParamValue>) => void;
  updateNodeAttributeName: (id: string, name: string) => void;
  reparentNode: (childId: string, parentId: string | undefined) => void;
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
    const currentBaseline = createProjectComparisonSignature(graph, layout);

    set({
      ...materializeWorkspace(graph, layout),
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
    const trimmedHistory = state.history.slice(0, state.historyIndex + 1);
    const nextHistory = [...trimmedHistory, createSnapshot(graph, layout)].slice(-MAX_HISTORY);
    const nextHistoryIndex = nextHistory.length - 1;
    applyWorkspaceState(graph, layout, nextHistory, nextHistoryIndex);
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
      const normalizedGraph = cloneGraphModel(graph);
      const normalizedLayout: GraphLayoutState = {
        ...cloneGraphLayoutState(layout),
        selection: { nodeId: null, edgeId: null },
      };
      const persistedProjectBaseline = createProjectComparisonSignature(
        normalizedGraph,
        normalizedLayout,
      );

      applyWorkspaceState(
        normalizedGraph,
        normalizedLayout,
        [createSnapshot(normalizedGraph, normalizedLayout)],
        0,
        persistedProjectBaseline,
      );
    },

    markPersistedBaseline: () => {
      const state = get();
      const persistedProjectBaseline = createProjectComparisonSignature(
        state.graph,
        state.layout,
      );

      applyWorkspaceState(
        state.graph,
        state.layout,
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
        selection: {
          nodeId: selectedNodes.length === 1 ? selectedNodes[0].id : null,
          edgeId: selectedNodes.length > 0 ? null : state.layout.selection.edgeId,
        },
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

    addNode: (node) => {
      const state = get();
      const { graphNode, position } = createGraphNodeFromReactFlowNode(node);
      commitWorkspace(
        {
          ...state.graph,
          nodes: [...state.graph.nodes, graphNode],
        },
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

    reparentNode: (childId, parentId) => {
      const state = get();
      const resolvedParentId =
        parentId && parentId !== childId && isContainerIdValid(state.graph, parentId)
          ? parentId
          : undefined;

      commitWorkspace(
        {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === childId ? { ...node, containerId: resolvedParentId } : node,
          ),
        },
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
