import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge as ReactFlowEdge, Connection, NodeChange, EdgeChange } from 'reactflow';
import { inferShapes } from '../compiler/shapeInference';

export type Edge = ReactFlowEdge;

export type ModuleType = 
  | 'Input' | 'Output' | 'Concat'
  | 'Conv1d' | 'Conv2d' | 'Conv3d'
  | 'ConvTranspose1d' | 'ConvTranspose2d' | 'ConvTranspose3d'
  | 'Linear' | 'Bilinear'
  | 'ReLU' | 'ReLU6' | 'LeakyReLU' | 'PReLU' | 'ELU' | 'SELU' | 'GELU' | 'Sigmoid' | 'Tanh' | 'LogSoftmax' | 'Softmax'
  | 'MaxPool1d' | 'MaxPool2d' | 'MaxPool3d'
  | 'AvgPool1d' | 'AvgPool2d' | 'AvgPool3d'
  | 'AdaptiveAvgPool1d' | 'AdaptiveAvgPool2d' | 'AdaptiveAvgPool3d'
  | 'BatchNorm1d' | 'BatchNorm2d' | 'BatchNorm3d'
  | 'LayerNorm' | 'GroupNorm' | 'InstanceNorm1d' | 'InstanceNorm2d' | 'InstanceNorm3d'
  | 'Dropout' | 'Dropout2d' | 'Dropout3d' | 'AlphaDropout'
  | 'Flatten' | 'Unflatten' | 'Upsample'
  | 'Sequential' | 'ModuleList' | 'ModuleDict';

export const TYPE_COLORS: Record<ModuleType, string> = {
  Input: '#10B981', Output: '#F43F5E', Concat: '#D946EF',
  Conv1d: '#FB923C', Conv2d: '#F97316', Conv3d: '#EA580C',
  ConvTranspose1d: '#FDBA74', ConvTranspose2d: '#FB923C', ConvTranspose3d: '#F97316',
  Linear: '#EF4444', Bilinear: '#DC2626',
  ReLU: '#F59E0B', ReLU6: '#F59E0B', LeakyReLU: '#D97706', PReLU: '#B45309',
  ELU: '#FBBF24', SELU: '#F59E0B', GELU: '#D97706',
  Sigmoid: '#FCD34D', Tanh: '#FBBF24', LogSoftmax: '#F59E0B', Softmax: '#F59E0B',
  MaxPool1d: '#22D3EE', MaxPool2d: '#06B6D4', MaxPool3d: '#0891B2',
  AvgPool1d: '#38BDF8', AvgPool2d: '#0EA5E9', AvgPool3d: '#0284C7',
  AdaptiveAvgPool1d: '#60A5FA', AdaptiveAvgPool2d: '#3B82F6', AdaptiveAvgPool3d: '#2563EB',
  BatchNorm1d: '#C084FC', BatchNorm2d: '#A855F7', BatchNorm3d: '#9333EA',
  LayerNorm: '#E879F9', GroupNorm: '#D946EF',
  InstanceNorm1d: '#A78BFA', InstanceNorm2d: '#8B5CF6', InstanceNorm3d: '#7C3AED',
  Dropout: '#94A3B8', Dropout2d: '#64748B', Dropout3d: '#475569', AlphaDropout: '#334155',
  Flatten: '#8B5CF6', Unflatten: '#7C3AED', Upsample: '#6366F1',
  Sequential: '#334155', ModuleList: '#334155', ModuleDict: '#334155',
};

export interface ModuleData {
  type: ModuleType;
  params: Record<string, any>;
  attributeName: string;
  outputShape?: string;
  shapeError?: boolean;
  connected?: boolean;
}

export type NetworkNode = Node<ModuleData>;

// ─── History ──────────────────────────────────────────────────────────────────
interface Snapshot { nodes: NetworkNode[]; edges: Edge[]; }
const MAX_HISTORY = 50;

interface WorkspaceState {
  modelName: string;
  nodes: NetworkNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  // History
  history: Snapshot[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  // Graph handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onEdgesDelete: (edges: Edge[]) => void;
  onNodesDelete: (nodes: NetworkNode[]) => void;
  addNode: (node: NetworkNode) => void;
  deleteNodeById: (id: string) => void;
  deleteEdgeById: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  updateNodeParams: (id: string, params: Record<string, any>) => void;
  updateNodeAttributeName: (id: string, name: string) => void;
  reparentNode: (childId: string, parentId: string | undefined) => void;
  setModelName: (name: string) => void;
}

const initialNodes: NetworkNode[] = [];
const initialEdges: Edge[] = [];

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  /**
   * Call AFTER a structural mutation has been applied via set({nodes, edges}).
   * Saves the NEW state as a history entry so undo can revert to this point
   * and redo can replay it.
   */
  function commitHistory(nodes: NetworkNode[], edges: Edge[]) {
    const { history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push({ nodes, edges });
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    set({
      history: trimmed,
      historyIndex: trimmed.length - 1,
      canUndo: true,
      canRedo: false,
    });
  }

  return {
    modelName: 'GeneratedModel',
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeId: null,
    selectedEdgeId: null,
    history: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,

    // ── Undo: go one step back in history ────────────────────────────────────
    undo: () => {
      const { history, historyIndex } = get();
      const prevIndex = historyIndex - 1;
      if (prevIndex < 0) return;
      const snap = history[prevIndex];
      set({
        nodes: inferShapes(snap.nodes, snap.edges),
        edges: snap.edges,
        historyIndex: prevIndex,
        canUndo: prevIndex > 0,
        canRedo: true,
        selectedNodeId: null,
        selectedEdgeId: null,
      });
    },

    // ── Redo: go one step forward in history ──────────────────────────────────
    redo: () => {
      const { history, historyIndex } = get();
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) return;
      const snap = history[nextIndex];
      set({
        nodes: inferShapes(snap.nodes, snap.edges),
        edges: snap.edges,
        historyIndex: nextIndex,
        canUndo: true,
        canRedo: nextIndex + 1 < history.length,
        selectedNodeId: null,
        selectedEdgeId: null,
      });
    },

    // ── Position / selection changes — no history (too noisy) ────────────────
    onNodesChange: (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, get().nodes) as NetworkNode[];
      set({ nodes: inferShapes(nextNodes, get().edges) });
    },
    onEdgesChange: (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, get().edges);
      set({ edges: nextEdges, nodes: inferShapes(get().nodes, nextEdges) });
    },

    // ── Structural mutations — commit history after each one ──────────────────
    onConnect: (connection: Connection) => {
      const nodes = get().nodes;
      const sourceNode = nodes.find(n => n.id === connection.source) as NetworkNode;
      const strokeColor = sourceNode ? TYPE_COLORS[sourceNode.data.type as ModuleType] : '#EE4C2C';
      const nextEdges = addEdge({
        ...connection,
        type: 'smoothstep',
        animated: true,
        style: { stroke: strokeColor, strokeWidth: 2 },
        interactionWidth: 20,
      }, get().edges);
      const nextNodes = inferShapes(nodes, nextEdges);
      set({ edges: nextEdges, nodes: nextNodes });
      commitHistory(nextNodes, nextEdges);
    },

    addNode: (node: NetworkNode) => {
      const nextNodes = inferShapes([...get().nodes, node], get().edges);
      const nextEdges = get().edges;
      set({ nodes: nextNodes });
      commitHistory(nextNodes, nextEdges);
    },

    deleteNodeById: (id: string) => {
      const nextEdges = get().edges.filter(e => e.source !== id && e.target !== id);
      const nextNodes = inferShapes(get().nodes.filter(n => n.id !== id), nextEdges);
      set({ nodes: nextNodes, edges: nextEdges, selectedNodeId: null, selectedEdgeId: null });
      commitHistory(nextNodes, nextEdges);
    },

    deleteEdgeById: (id: string) => {
      const nextEdges = get().edges.filter(e => e.id !== id);
      const nextNodes = inferShapes(get().nodes, nextEdges);
      set({ edges: nextEdges, nodes: nextNodes, selectedEdgeId: null });
      commitHistory(nextNodes, nextEdges);
    },

    onEdgesDelete: (deletedEdges) => {
      const nextEdges = get().edges.filter(e => !deletedEdges.some(d => d.id === e.id));
      const nextNodes = inferShapes(get().nodes, nextEdges);
      set({ edges: nextEdges, nodes: nextNodes });
      commitHistory(nextNodes, nextEdges);
    },

    onNodesDelete: (deletedNodes) => {
      const ids = new Set(deletedNodes.map(n => n.id));
      const nextEdges = get().edges.filter(e => !ids.has(e.source) && !ids.has(e.target));
      const nextNodes = inferShapes(get().nodes, nextEdges);
      set({ edges: nextEdges, nodes: nextNodes });
      commitHistory(nextNodes, nextEdges);
    },

    // ── Non-structural ────────────────────────────────────────────────────────
    setSelectedNode: (id) => {
      set({ selectedNodeId: id, selectedEdgeId: null });
    },
    setSelectedEdge: (id) => {
      set({ selectedEdgeId: id, selectedNodeId: null });
    },
    updateNodeParams: (id, params) => {
      const nextNodes = get().nodes.map(node =>
        node.id === id
          ? { ...node, data: { ...node.data, params: { ...node.data.params, ...params } } }
          : node
      );
      set({ nodes: inferShapes(nextNodes, get().edges) });
    },
    updateNodeAttributeName: (id, name) => {
      set({
        nodes: get().nodes.map(node =>
          node.id === id ? { ...node, data: { ...node.data, attributeName: name } } : node
        )
      });
    },
    reparentNode: (childId, parentId) => {
      const nextNodes = get().nodes.map(node => {
        if (node.id === childId) {
          if (parentId) {
            // Convert exact canvas coordinates into relative container coordinates
            return { ...node, parentNode: parentId, extent: 'parent' as const };
          } else {
            // Remove parent bounding
            return { ...node, parentNode: undefined, extent: undefined };
          }
        }
        return node;
      });
      set({ nodes: inferShapes(nextNodes, get().edges) });
      commitHistory(nextNodes, get().edges);
    },
    setModelName: (name) => set({ modelName: name }),
  };
});
