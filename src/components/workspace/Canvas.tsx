import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import type {
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
import {
  graphToDerivedSequentialEdges,
  type ModuleData,
} from '../../domain/graph/reactFlowAdapter';
import { getContainerDropTargetAtPosition, type ContainerDropTarget } from '../../domain/graph/utils';
import { useWorkspaceStore, type NetworkNode } from '../../store/workspaceStore';
import ModuleNode from './ModuleNode';
import ContainerNode from './ContainerNode';
import Omnibar from './Omnibar';
import { TORCHCANVAS_FIT_VIEW_EVENT } from './workspaceEvents';

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
  const positionsById = useWorkspaceStore((state) => state.layout.positionsById);
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
  const [containerDropTarget, setContainerDropTarget] = useState<ContainerDropTarget | null>(null);
  const [recentContainerInsertion, setRecentContainerInsertion] = useState<{
    containerId: string;
    childId: string;
  } | null>(null);

  useEffect(() => {
    if (!recentContainerInsertion) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentContainerInsertion(null);
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [recentContainerInsertion]);

  const derivedEdges = useMemo(() => graphToDerivedSequentialEdges(graph), [graph]);
  const displayedEdges = useMemo(() => [...edges, ...derivedEdges], [derivedEdges, edges]);
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isDropTarget:
            node.type === 'containerNode' && containerDropTarget?.containerId === node.id,
          dropPreviewIndex:
            node.type === 'containerNode' && containerDropTarget?.containerId === node.id
              ? containerDropTarget.insertAt
              : null,
          pulseContainer: recentContainerInsertion?.containerId === node.id,
          pulseChild: recentContainerInsertion?.childId === node.id,
        },
      })),
    [containerDropTarget, nodes, recentContainerInsertion],
  );

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

  const resolveContainerDropTarget = useCallback(
    (clientX: number, clientY: number, candidateType?: ModuleType, excludeNodeId?: string) => {
      if (!candidateType) {
        return null;
      }

      return getContainerDropTargetAtPosition(
        graph,
        { positionsById },
        getFlowPosition(clientX, clientY),
        candidateType,
        excludeNodeId,
      );
    },
    [getFlowPosition, graph, positionsById],
  );

  const triggerContainerInsertionPulse = useCallback((containerId: string, childId: string) => {
    setRecentContainerInsertion({ containerId, childId });
  }, []);

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

  useEffect(() => {
    const handleFitView = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (useWorkspaceStore.getState().graph.nodes.length > 0) {
            reactFlow.fitView({
              padding: 0.2,
              duration: 200,
              includeHiddenNodes: true,
            });
          } else {
            reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 150 });
          }
        });
      });
    };

    window.addEventListener(TORCHCANVAS_FIT_VIEW_EVENT, handleFitView);
    return () => window.removeEventListener(TORCHCANVAS_FIT_VIEW_EVENT, handleFitView);
  }, [reactFlow]);

  const onDragOver = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const type = event.dataTransfer.getData('application/reactflow') as ModuleType;
      setContainerDropTarget(resolveContainerDropTarget(event.clientX, event.clientY, type));
    },
    [resolveContainerDropTarget],
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !reactFlowWrapper.current?.contains(nextTarget as Node)) {
      setContainerDropTarget(null);
    }
  }, []);

  const onNodeDrag = useCallback(
    (event: ReactMouseEvent, node: NetworkNode) => {
      setContainerDropTarget(
        resolveContainerDropTarget(event.clientX, event.clientY, node.data.type, node.id),
      );
    },
    [resolveContainerDropTarget],
  );

  const onNodeDragStop = useCallback(
    (event: ReactMouseEvent, node: NetworkNode) => {
      const target =
        containerDropTarget ??
        resolveContainerDropTarget(event.clientX, event.clientY, node.data.type, node.id);

      if (target) {
        reparentNode(node.id, target.containerId, { insertAt: target.insertAt });
        triggerContainerInsertionPulse(target.containerId, node.id);
      } else if (node.parentNode) {
        reparentNode(node.id, undefined);
      }

      setContainerDropTarget(null);
    },
    [containerDropTarget, reparentNode, resolveContainerDropTarget, triggerContainerInsertionPulse],
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
        setContainerDropTarget(null);
        return;
      }

      const position = getFlowPosition(event.clientX, event.clientY);
      const target = resolveContainerDropTarget(event.clientX, event.clientY, type);
      const node = createWorkspaceNode(type, position.x, position.y);
      addNode(
        node,
        target
          ? {
              parentId: target.containerId,
              insertAt: target.insertAt,
            }
          : undefined,
      );
      setSelectedNode(node.id);
      if (target) {
        triggerContainerInsertionPulse(target.containerId, node.id);
      }
      setContainerDropTarget(null);
      revealNode(position.x, position.y);
    },
    [
      addNode,
      createWorkspaceNode,
      getFlowPosition,
      revealNode,
      resolveContainerDropTarget,
      setSelectedNode,
      triggerContainerInsertionPulse,
    ],
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
      const target = getContainerDropTargetAtPosition(
        graph,
        { positionsById },
        { x: omnibarPos.flowX, y: omnibarPos.flowY },
        type,
      );
      addNode(
        node,
        target
          ? {
              parentId: target.containerId,
              insertAt: target.insertAt,
            }
          : undefined,
      );
      setSelectedNode(node.id);
      if (target) {
        triggerContainerInsertionPulse(target.containerId, node.id);
      }
      revealNode(omnibarPos.flowX, omnibarPos.flowY);
      setOmnibarPos(null);
    },
    [addNode, createWorkspaceNode, graph, omnibarPos, positionsById, revealNode, setSelectedNode, triggerContainerInsertionPulse],
  );

  return (
    <div
      className="flex-1 h-full w-full relative"
      ref={reactFlowWrapper}
      onClick={() => setOmnibarPos(null)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
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
        nodes={displayedNodes}
        edges={displayedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeClick={(_event, edge) => {
          if (edge.data?.derived) {
            return;
          }

          setSelectedEdge(edge.id);
        }}
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
