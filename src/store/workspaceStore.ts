import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge as ReactFlowEdge, Connection, NodeChange, EdgeChange } from 'reactflow';

export type Edge = ReactFlowEdge;

export type ModuleType = 'Input' | 'Output' | 'Conv2d' | 'Linear' | 'ReLU' | 'BatchNorm2d' | 'MaxPool2d' | 'Concat';

export const TYPE_COLORS: Record<ModuleType, string> = {
  Input: '#10B981', // emerald-500
  Output: '#F43F5E', // rose-500
  Conv2d: '#F97316', // orange-500
  Linear: '#EF4444', // red-500
  ReLU: '#F59E0B', // amber-500
  BatchNorm2d: '#A855F7', // purple-500
  MaxPool2d: '#06B6D4', // cyan-500
  Concat: '#D946EF', // fuchsia-500
};

export interface ModuleData {
  type: ModuleType;
  params: Record<string, any>;
}

export type NetworkNode = Node<ModuleData>;

interface WorkspaceState {
  nodes: NetworkNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: NetworkNode) => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeParams: (id: string, params: Record<string, any>) => void;
}

const initialNodes: NetworkNode[] = [
  {
    id: '1',
    type: 'moduleNode',
    position: { x: 100, y: 150 },
    data: { type: 'Input', params: { shape: '[B, 3, 224, 224]' } },
  },
  {
    id: '2',
    type: 'moduleNode',
    position: { x: 350, y: 150 },
    data: { type: 'Conv2d', params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 } },
  },
  {
    id: '3',
    type: 'moduleNode',
    position: { x: 600, y: 150 },
    data: { type: 'ReLU', params: { inplace: true } },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: true, style: { stroke: '#EE4C2C', strokeWidth: 2 } },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep', animated: true, style: { stroke: '#EE4C2C', strokeWidth: 2 } },
];

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    const nodes = get().nodes;
    const sourceNode = nodes.find(n => n.id === connection.source) as NetworkNode;
    const strokeColor = sourceNode ? TYPE_COLORS[sourceNode.data.type as ModuleType] : '#EE4C2C';
    
    set({
      edges: addEdge({ 
        ...connection, 
        type: 'smoothstep', 
        animated: true, 
        style: { stroke: strokeColor, strokeWidth: 2 } 
      }, get().edges),
    });
  },
  addNode: (node) => {
    set({ nodes: [...get().nodes, node] });
  },
  setSelectedNode: (id) => {
    set({ selectedNodeId: id });
  },
  updateNodeParams: (id, params) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, params: { ...node.data.params, ...params } } };
        }
        return node;
      }),
    });
  },
}));
