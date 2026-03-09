import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from 'reactflow';
import type {
  Connection,
  EdgeChange,
  NodeChange,
  Node as ReactFlowNode,
} from 'reactflow';

import { inferGraphNodeMeta } from '../compiler/shapeInference';
import {
  createGraphNodeFromReactFlowNode,
  getAbsolutePositionForReactFlowNode,
  graphToReactFlowEdges,
  graphToReactFlowNodes,
  type Edge,
  type ModuleData,
  type NetworkNode,
} from '../domain/graph/reactFlowAdapter';
import { GraphDocument } from '../domain/graph/GraphDocument';
import type {
  GraphLayoutState,
  GraphModel,
  GraphPosition,
  GraphSnapshot,
} from '../domain/graph/types';
import {
  cloneGraphLayoutState,
  cloneGraphModel,
  createEmptyGraphLayout,
  createEmptyGraphModel,
  normalizeWorkspaceGraphLayout,
} from '../domain/graph/utils';
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

interface AddNodeOptions {
  parentId?: string;
  insertAt?: number;
}

interface ReparentNodeOptions {
  insertAt?: number;
  absolutePosition?: GraphPosition;
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
  updateModelInput: (id: string, patch: { argumentName?: string; shape?: string }) => void;
  syncModelInputs: () => void;
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
      const normalizedWorkspace = new GraphDocument(
        cloneGraphModel(graph),
        {
          ...cloneGraphLayoutState(layout),
          selection: { nodeId: null, edgeId: null },
        },
      ).snapshot();
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
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .connectNodes(connection)
        .snapshot();

      commitWorkspace(
        nextWorkspace.graph,
        nextWorkspace.layout,
      );
    },

    isValidConnection: (connection) => {
      const state = get();
      return canConnectGraphNodes(state.graph, connection);
    },

    onEdgesDelete: (deletedEdges) => {
      const state = get();
      const removedEdgeIds = new Set(deletedEdges.map((edge) => edge.id));
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .deleteEdges(removedEdgeIds)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    onNodesDelete: (deletedNodes) => {
      const state = get();
      const removedNodeIds = new Set(deletedNodes.map((node) => node.id));
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .deleteNodes(removedNodeIds)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    addNode: (node, options) => {
      const state = get();
      const { graphNode, position } = createGraphNodeFromReactFlowNode(node);
      const nextWorkspace = options?.parentId
        ? new GraphDocument(state.graph, state.layout)
            .insertIntoContainer(graphNode, position, options.parentId, options.insertAt)
            .snapshot()
        : new GraphDocument(state.graph, state.layout)
            .addTopLevelNode(graphNode, position)
            .snapshot();

      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    deleteNodeById: (id) => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .deleteNode(id)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    deleteEdgeById: (id) => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .deleteEdge(id)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
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
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .updateNodeParams(id, params)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    updateNodeAttributeName: (id, name) => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .updateNodeAttributeName(id, name)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    updateModelInput: (id, patch) => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .updateModelInput(id, patch)
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
    },

    syncModelInputs: () => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .syncModelInputs()
        .snapshot();
      applyWorkspaceState(nextWorkspace.graph, nextWorkspace.layout);
    },

    reparentNode: (childId, parentId, options) => {
      const state = get();
      const nextWorkspace = new GraphDocument(state.graph, state.layout)
        .reparentNode(
          childId,
          parentId && parentId !== childId ? parentId : undefined,
          options,
        )
        .snapshot();
      commitWorkspace(nextWorkspace.graph, nextWorkspace.layout);
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
