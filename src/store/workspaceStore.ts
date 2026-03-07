import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge as ReactFlowEdge, Connection, NodeChange, EdgeChange } from 'reactflow';

export type Edge = ReactFlowEdge;

export type ModuleType = 'Input' | 'Conv2d' | 'Linear' | 'ReLU' | 'BatchNorm2d' | 'MaxPool2d' | 'Concat' | 'Output';

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
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#EE4C2C', strokeWidth: 2 } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#EE4C2C', strokeWidth: 2 } },
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
    set({
      edges: addEdge({ ...connection, animated: true, style: { stroke: '#EE4C2C', strokeWidth: 2 } }, get().edges),
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
