import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';

import { useWorkspaceStore, TYPE_COLORS } from '../../store/workspaceStore';
import type { ModuleType, NetworkNode } from '../../store/workspaceStore';
import ModuleNode from './ModuleNode';
import ContainerNode from './ContainerNode';
import Omnibar from './Omnibar';

const nodeTypes = {
  moduleNode: ModuleNode,
  containerNode: ContainerNode,
};

let id = 10;
const getId = () => `dndnode_${id++}`;

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [omnibarPos, setOmnibarPos] = useState<{ x: number, y: number, flowX: number, flowY: number } | null>(null);
  
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const onNodesChange = useWorkspaceStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkspaceStore((state) => state.onEdgesChange);
  const onConnect = useWorkspaceStore((state) => state.onConnect);
  const onNodesDelete = useWorkspaceStore((state) => state.onNodesDelete);
  const onEdgesDelete = useWorkspaceStore((state) => state.onEdgesDelete);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const setSelectedNode = useWorkspaceStore((state) => state.setSelectedNode);
  const setSelectedEdge = useWorkspaceStore((state) => state.setSelectedEdge);
  const reparentNode = useWorkspaceStore((state) => state.reparentNode);

  // ── Keyboard shortcuts for undo / redo ─────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useWorkspaceStore.getState().undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        useWorkspaceStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: NetworkNode) => {
    // Check if the node was dropped over a container
    if (node.type === 'containerNode') return; // Cannot put container in container for now

    const intersections = reactFlow.getIntersectingNodes(node);
    const container = intersections.find((n: Node) => n.type === 'containerNode');
    
    // If dropped inside a container, put it there, else unparent it
    reparentNode(node.id, container ? container.id : undefined);
  }, [reactFlow, reparentNode]);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as ModuleType;
      if (typeof type === 'undefined' || !type) {
        return;
      }

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Calculate auto-incremented attribute name based on type
      const sameTypeNodes = nodes.filter(n => n.data.type === type);
      const attrName = `${type.toLowerCase()}_${sameTypeNodes.length + 1}`;

      const isContainer = ['Sequential', 'ModuleList', 'ModuleDict'].includes(type);

      const newNode: NetworkNode = {
        id: getId(),
        type: isContainer ? 'containerNode' : 'moduleNode',
        position,
        data: { type, attributeName: attrName, params: getDefaultParams(type) },
      };

      addNode(newNode);
    },
    [reactFlowInstance, addNode, nodes]
  );

  const onSelectionChange = useCallback((params: any) => {
    if (params.nodes.length === 1) {
      setSelectedNode(params.nodes[0].id);
    } else {
      setSelectedNode(null);
    }
  }, [setSelectedNode]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (!reactFlowInstance) return;

    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    setOmnibarPos({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      flowX: position.x,
      flowY: position.y
    });
  }, [reactFlowInstance]);

  const onOmnibarAdd = useCallback((type: ModuleType) => {
    if (!omnibarPos) return;

    // Calculate auto-incremented attribute name based on type
    const sameTypeNodes = nodes.filter(n => n.data.type === type);
    const attrName = `${type.toLowerCase()}_${sameTypeNodes.length + 1}`;

    const isContainer = ['Sequential', 'ModuleList', 'ModuleDict'].includes(type);

    const newNode: NetworkNode = {
      id: getId(),
      type: isContainer ? 'containerNode' : 'moduleNode',
      position: { x: omnibarPos.flowX, y: omnibarPos.flowY },
      data: { type, attributeName: attrName, params: getDefaultParams(type) },
    };

    addNode(newNode);
    setOmnibarPos(null);
  }, [omnibarPos, addNode, nodes]);

  return (
    <div className="flex-1 h-full w-full relative" ref={reactFlowWrapper} onClick={() => setOmnibarPos(null)}>
      {omnibarPos && (
        <Omnibar 
          position={{ x: omnibarPos.x, y: omnibarPos.y }} 
          onSelect={onOmnibarAdd} 
          onClose={() => setOmnibarPos(null)} 
        />
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeClick={(_evt, edge) => setSelectedEdge(edge.id)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#ffffff" gap={24} size={1} style={{ opacity: 0.05 }} />
        <Controls 
          className="bg-panel border-border shadow-2xl rounded-lg overflow-hidden flex flex-col items-center !m-4" 
          showInteractive={false}
          position="bottom-left"
        />
        <MiniMap 
          className="!bg-panel !border-border !shadow-2xl rounded-xl overflow-hidden !m-4" 
          style={{ width: 140, height: 100 }}
          maskColor="rgba(0, 0, 0, 0.4)" 
          nodeColor={(node: any) => {
            const type = node.data?.type;
            const connected = node.data?.connected;
            const alwaysColored = type === 'Input' || type === 'Output';
            if (!connected && !alwaysColored) return '#4B5563';
            return TYPE_COLORS[type as ModuleType] ?? '#EE4C2C';
          }} 
        />
      </ReactFlow>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function getDefaultParams(type: ModuleType) {
  switch (type) {
    // Convolutional
    case 'Conv1d': return { in_channels: 64, out_channels: 128, kernel_size: 3, stride: 1, padding: 1 };
    case 'Conv2d': return { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 };
    case 'Conv3d': return { in_channels: 16, out_channels: 32, kernel_size: 3, stride: 1, padding: 1 };
    case 'ConvTranspose1d': return { in_channels: 128, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 };
    case 'ConvTranspose2d': return { in_channels: 64, out_channels: 3, kernel_size: 3, stride: 1, padding: 1 };
    case 'ConvTranspose3d': return { in_channels: 32, out_channels: 16, kernel_size: 3, stride: 1, padding: 1 };

    // Linear
    case 'Linear': return { in_features: 512, out_features: 10 };
    case 'Bilinear': return { in1_features: 128, in2_features: 128, out_features: 64 };

    // Activations
    case 'ReLU': case 'ReLU6': return { inplace: true };
    case 'LeakyReLU': return { negative_slope: 0.01, inplace: true };
    case 'PReLU': return { num_parameters: 1 };
    case 'ELU': return { alpha: 1.0, inplace: true };
    case 'SELU': return { inplace: true };
    case 'GELU': return { approximate: 'none' };
    case 'Sigmoid': case 'Tanh': return {};
    case 'Softmax': case 'LogSoftmax': return { dim: 1 };

    // Pooling
    case 'MaxPool1d': case 'AvgPool1d': return { kernel_size: 2, stride: 2, padding: 0 };
    case 'MaxPool2d': case 'AvgPool2d': return { kernel_size: 2, stride: 2, padding: 0 };
    case 'MaxPool3d': case 'AvgPool3d': return { kernel_size: 2, stride: 2, padding: 0 };
    case 'AdaptiveAvgPool1d': return { output_size: 1 };
    case 'AdaptiveAvgPool2d': return { output_size: '[7, 7]' };
    case 'AdaptiveAvgPool3d': return { output_size: '[7, 7, 7]' };

    // Normalization
    case 'BatchNorm1d': return { num_features: 64 };
    case 'BatchNorm2d': return { num_features: 64 };
    case 'BatchNorm3d': return { num_features: 64 };
    case 'LayerNorm': return { normalized_shape: 64 };
    case 'GroupNorm': return { num_groups: 32, num_channels: 64 };
    case 'InstanceNorm1d': case 'InstanceNorm2d': case 'InstanceNorm3d': return { num_features: 64 };

    // Utility
    case 'Dropout': case 'Dropout2d': case 'Dropout3d': case 'AlphaDropout': return { p: 0.5 };
    case 'Flatten': return { start_dim: 1, end_dim: -1 };
    case 'Unflatten': return { dim: 1, unflattened_size: '[64, 7, 7]' };
    case 'Upsample': return { size: '[224, 224]', mode: 'bilinear', align_corners: true };

    case 'Input': return { shape: '[B, 3, 224, 224]' };
    default: return {};
  }
}
