import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

import { useWorkspaceStore, TYPE_COLORS } from '../../store/workspaceStore';
import type { ModuleType, NetworkNode } from '../../store/workspaceStore';
import ModuleNode from './ModuleNode';
import Omnibar from './Omnibar';

const nodeTypes = {
  moduleNode: ModuleNode,
};

let id = 10;
const getId = () => `dndnode_${id++}`;

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [omnibarPos, setOmnibarPos] = useState<{ x: number, y: number, flowX: number, flowY: number } | null>(null);
  
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const onNodesChange = useWorkspaceStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkspaceStore((state) => state.onEdgesChange);
  const onConnect = useWorkspaceStore((state) => state.onConnect);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const setSelectedNode = useWorkspaceStore((state) => state.setSelectedNode);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

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

      const newNode: NetworkNode = {
        id: getId(),
        type: 'moduleNode',
        position,
        data: { type, params: getDefaultParams(type) },
      };

      addNode(newNode);
    },
    [reactFlowInstance, addNode]
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

    const newNode: NetworkNode = {
      id: getId(),
      type: 'moduleNode',
      position: { x: omnibarPos.flowX, y: omnibarPos.flowY },
      data: { type, params: getDefaultParams(type) },
    };

    addNode(newNode);
    setOmnibarPos(null);
  }, [omnibarPos, addNode]);

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
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
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
          nodeColor={(node: any) => TYPE_COLORS[node.data.type as ModuleType] || '#EE4C2C'} 
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
    case 'Conv2d': return { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 };
    case 'Linear': return { in_features: 512, out_features: 10 };
    case 'ReLU': return { inplace: true };
    case 'MaxPool2d': return { kernel_size: 2, stride: 2, padding: 0 };
    case 'BatchNorm2d': return { num_features: 64 };
    case 'Input': return { shape: '[B, 3, 224, 224]' };
    default: return {};
  }
}
