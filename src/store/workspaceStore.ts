import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge as ReactFlowEdge, Connection, NodeChange, EdgeChange } from 'reactflow';
import { inferShapes } from '../compiler/shapeInference';

export type Edge = ReactFlowEdge;

export type ModuleType = 
  | 'Input' | 'Output' | 'Concat'
  // Convolutional
  | 'Conv1d' | 'Conv2d' | 'Conv3d'
  | 'ConvTranspose1d' | 'ConvTranspose2d' | 'ConvTranspose3d'
  // Linear
  | 'Linear' | 'Bilinear'
  // Activations
  | 'ReLU' | 'ReLU6' | 'LeakyReLU' | 'PReLU' | 'ELU' | 'SELU' | 'GELU' | 'Sigmoid' | 'Tanh' | 'LogSoftmax' | 'Softmax'
  // Pooling
  | 'MaxPool1d' | 'MaxPool2d' | 'MaxPool3d'
  | 'AvgPool1d' | 'AvgPool2d' | 'AvgPool3d'
  | 'AdaptiveAvgPool1d' | 'AdaptiveAvgPool2d' | 'AdaptiveAvgPool3d'
  // Normalization
  | 'BatchNorm1d' | 'BatchNorm2d' | 'BatchNorm3d'
  | 'LayerNorm' | 'GroupNorm' | 'InstanceNorm1d' | 'InstanceNorm2d' | 'InstanceNorm3d'
  // Utility
  | 'Dropout' | 'Dropout2d' | 'Dropout3d' | 'AlphaDropout'
  | 'Flatten' | 'Unflatten' | 'Upsample';

export const TYPE_COLORS: Record<ModuleType, string> = {
  Input: '#10B981', // emerald-500
  Output: '#F43F5E', // rose-500
  Concat: '#D946EF', // fuchsia-500
  
  // Convolutional (Orange palette)
  Conv1d: '#FB923C', Conv2d: '#F97316', Conv3d: '#EA580C',
  ConvTranspose1d: '#FDBA74', ConvTranspose2d: '#FB923C', ConvTranspose3d: '#F97316',
  
  // Linear (Red palette)
  Linear: '#EF4444', Bilinear: '#DC2626',
  
  // Activations (Amber palette)
  ReLU: '#F59E0B', ReLU6: '#F59E0B', LeakyReLU: '#D97706', PReLU: '#B45309', 
  ELU: '#FBBF24', SELU: '#F59E0B', GELU: '#D97706', 
  Sigmoid: '#FCD34D', Tanh: '#FBBF24', LogSoftmax: '#F59E0B', Softmax: '#F59E0B',
  
  // Pooling (Cyan/Blue palette)
  MaxPool1d: '#22D3EE', MaxPool2d: '#06B6D4', MaxPool3d: '#0891B2',
  AvgPool1d: '#38BDF8', AvgPool2d: '#0EA5E9', AvgPool3d: '#0284C7',
  AdaptiveAvgPool1d: '#60A5FA', AdaptiveAvgPool2d: '#3B82F6', AdaptiveAvgPool3d: '#2563EB',
  
  // Normalization (Purple palette)
  BatchNorm1d: '#C084FC', BatchNorm2d: '#A855F7', BatchNorm3d: '#9333EA',
  LayerNorm: '#E879F9', GroupNorm: '#D946EF', 
  InstanceNorm1d: '#A78BFA', InstanceNorm2d: '#8B5CF6', InstanceNorm3d: '#7C3AED',
  
  // Utility (Slate/Gray palette)
  Dropout: '#94A3B8', Dropout2d: '#64748B', Dropout3d: '#475569', AlphaDropout: '#334155',
  Flatten: '#8B5CF6', Unflatten: '#7C3AED', Upsample: '#6366F1',
};

export interface ModuleData {
  type: ModuleType;
  params: Record<string, any>;
  attributeName: string;
  outputShape?: string; // e.g. [B, 64, 56, 56]
  shapeError?: boolean;
}

export type NetworkNode = Node<ModuleData>;

interface WorkspaceState {
  modelName: string;
  nodes: NetworkNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onEdgesDelete: (edges: Edge[]) => void;
  onNodesDelete: (nodes: NetworkNode[]) => void;
  addNode: (node: NetworkNode) => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeParams: (id: string, params: Record<string, any>) => void;
  updateNodeAttributeName: (id: string, name: string) => void;
  setModelName: (name: string) => void;
}

const initialNodes: NetworkNode[] = [];
const initialEdges: Edge[] = [];

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  modelName: 'GeneratedModel',
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  onNodesChange: (changes: NodeChange[]) => {
    const nextNodes = applyNodeChanges(changes, get().nodes) as NetworkNode[];
    set({ nodes: inferShapes(nextNodes, get().edges) });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    const nextEdges = applyEdgeChanges(changes, get().edges);
    set({ edges: nextEdges, nodes: inferShapes(get().nodes, nextEdges) });
  },
  onConnect: (connection: Connection) => {
    const nodes = get().nodes;
    const sourceNode = nodes.find(n => n.id === connection.source) as NetworkNode;
    const strokeColor = sourceNode ? TYPE_COLORS[sourceNode.data.type as ModuleType] : '#EE4C2C';
    
    const nextEdges = addEdge({ 
        ...connection, 
        type: 'smoothstep', 
        animated: true, 
        style: { stroke: strokeColor, strokeWidth: 2 } 
      }, get().edges);

    set({
      edges: nextEdges,
      nodes: inferShapes(nodes, nextEdges)
    });
  },
  addNode: (node: NetworkNode) => {
    const nextNodes = [...get().nodes, node];
    set({ nodes: inferShapes(nextNodes, get().edges) });
  },
  setSelectedNode: (id: string | null) => {
    set({ selectedNodeId: id });
  },
  updateNodeParams: (id: string, params: Record<string, any>) => {
    const nextNodes = get().nodes.map((node) => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, params: { ...node.data.params, ...params } } };
      }
      return node;
    });
    set({ nodes: inferShapes(nextNodes, get().edges) });
  },
  updateNodeAttributeName: (id: string, name: string) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, attributeName: name } };
        }
        return node;
      })
    });
  },
  onEdgesDelete: (deletedEdges) => {
    const nextEdges = get().edges.filter(
      (edge) => !deletedEdges.some((deleted) => deleted.id === edge.id)
    );
    set({ edges: nextEdges, nodes: inferShapes(get().nodes, nextEdges) });
  },
  onNodesDelete: (deletedNodes) => {
    const deletedNodeIds = new Set(deletedNodes.map((n) => n.id));
    const nextEdges = get().edges.filter(
      (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
    );
    set({ edges: nextEdges, nodes: inferShapes(get().nodes, nextEdges) });
  },
  setModelName: (name) => {
    set({ modelName: name });
  },
}));
