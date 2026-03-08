import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import type {
  Node,
  OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  createDefaultAttributeName,
  getDefaultParams,
  getLayerColor,
  isContainerModule,
  type ModuleType,
} from '../../domain/layers';
import type { ModuleData } from '../../domain/graph/reactFlowAdapter';
import { useWorkspaceStore, type NetworkNode } from '../../store/workspaceStore';
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
  const reactFlow = useReactFlow<ModuleData>();
  const [omnibarPos, setOmnibarPos] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  const graph = useWorkspaceStore((state) => state.graph);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const onNodesChange = useWorkspaceStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkspaceStore((state) => state.onEdgesChange);
  const onConnect = useWorkspaceStore((state) => state.onConnect);
  const isValidConnection = useWorkspaceStore((state) => state.isValidConnection);
  const onNodesDelete = useWorkspaceStore((state) => state.onNodesDelete);
  const onEdgesDelete = useWorkspaceStore((state) => state.onEdgesDelete);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const setSelectedNode = useWorkspaceStore((state) => state.setSelectedNode);
  const setSelectedEdge = useWorkspaceStore((state) => state.setSelectedEdge);
  const reparentNode = useWorkspaceStore((state) => state.reparentNode);

  const getFlowPosition = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) {
        return { x: 80, y: 80 };
      }

      const viewport = reactFlow.getViewport();
      const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
      const projected = {
        x: (clientX - bounds.left - viewport.x) / zoom,
        y: (clientY - bounds.top - viewport.y) / zoom,
      };

      if (Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
        return projected;
      }

      return {
        x: Math.max(80, bounds.width / 2 - 80),
        y: Math.max(80, bounds.height / 2 - 40),
      };
    },
    [reactFlow],
  );

  const revealNode = useCallback(
    (x: number, y: number) => {
      window.requestAnimationFrame(() => {
        reactFlow.setCenter(x + 80, y + 40, {
          zoom: 1,
          duration: 180,
        });
      });
    },
    [reactFlow],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierPressed) {
        return;
      }

      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useWorkspaceStore.getState().undo();
      } else if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
        event.preventDefault();
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

  const onNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: NetworkNode) => {
      if (node.type === 'containerNode') {
        return;
      }

      const intersections = reactFlow.getIntersectingNodes(node);
      const container = intersections.find((entry: Node) => entry.type === 'containerNode');
      reparentNode(node.id, container?.id);
    },
    [reactFlow, reparentNode],
  );

  const createWorkspaceNode = useCallback(
    (type: ModuleType, x: number, y: number): NetworkNode => ({
      id: getId(),
      type: isContainerModule(type) ? 'containerNode' : 'moduleNode',
      position: { x, y },
      data: {
        type,
        attributeName: createDefaultAttributeName(type, graph.nodes),
        params: getDefaultParams(type),
      },
    }),
    [graph.nodes],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const type = event.dataTransfer.getData('application/reactflow') as ModuleType;
      if (!type) {
        return;
      }

      const position = getFlowPosition(event.clientX, event.clientY);
      const node = createWorkspaceNode(type, position.x, position.y);
      addNode(node);
      setSelectedNode(node.id);
      revealNode(position.x, position.y);
    },
    [addNode, createWorkspaceNode, getFlowPosition, revealNode, setSelectedNode],
  );

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      if (params.nodes.length === 1 && params.edges.length === 0) {
        setSelectedNode(params.nodes[0].id);
        return;
      }

      if (params.edges.length === 1 && params.nodes.length === 0) {
        setSelectedEdge(params.edges[0].id);
        return;
      }

      setSelectedNode(null);
    },
    [setSelectedEdge, setSelectedNode],
  );

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element>) => {
      event.preventDefault();
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const position = getFlowPosition(event.clientX, event.clientY);

      setOmnibarPos({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowX: position.x,
        flowY: position.y,
      });
    },
    [getFlowPosition],
  );

  const onOmnibarAdd = useCallback(
    (type: ModuleType) => {
      if (!omnibarPos) {
        return;
      }

      const node = createWorkspaceNode(type, omnibarPos.flowX, omnibarPos.flowY);
      addNode(node);
      setSelectedNode(node.id);
      revealNode(omnibarPos.flowX, omnibarPos.flowY);
      setOmnibarPos(null);
    },
    [addNode, createWorkspaceNode, omnibarPos, revealNode, setSelectedNode],
  );

  return (
    <div
      className="flex-1 h-full w-full relative"
      ref={reactFlowWrapper}
      onClick={() => setOmnibarPos(null)}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {omnibarPos && (
        <Omnibar
          key={`${omnibarPos.flowX}-${omnibarPos.flowY}`}
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
        isValidConnection={isValidConnection}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeClick={(_event, edge) => setSelectedEdge(edge.id)}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
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
          nodeColor={(node: { data?: Partial<ModuleData> }) => {
            const type = node.data?.type;
            const connected = node.data?.connected;
            if (!type) {
              return '#EE4C2C';
            }

            const alwaysColored = type === 'Input' || type === 'Output';
            if (!connected && !alwaysColored) {
              return '#4B5563';
            }

            return getLayerColor(type);
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
