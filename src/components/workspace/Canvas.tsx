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
import {
  buildContainerLayoutIndex,
  getContainerDropTargetAtPosition,
  getOrderedContainerChildren,
  type ContainerDropTarget,
} from '../../domain/graph/utils';
import { CONTAINER_LAYOUT, getNodeBehavior } from '../../domain/nodes';
import { useWorkspaceStore, type NetworkNode } from '../../store/workspaceStore';
import ModuleNode from './ModuleNode';
import ContainerNode from './ContainerNode';
import Omnibar from './Omnibar';
import { TORCHCANVAS_FIT_VIEW_EVENT } from './workspaceEvents';

const nodeTypes = {
  moduleNode: ModuleNode,
  containerNode: ContainerNode,
};

type DragOverlayState = {
  nodeId: string;
  nodeType: NetworkNode['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  data: ModuleData;
};

let id = 10;
const getId = () => `dndnode_${id++}`;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getPreviewColor(type: ModuleType, connected?: boolean): string {
  if (!connected) {
    return '#4B5563';
  }

  return getLayerColor(type);
}

function DragOverlayPreview({ overlay }: { overlay: DragOverlayState }) {
  const accentColor = overlay.data.shapeError
    ? '#EF4444'
    : getPreviewColor(overlay.data.type, overlay.data.connected);

  if (overlay.nodeType === 'containerNode') {
    return (
      <div
        data-drag-overlay="true"
        className="fixed pointer-events-none z-[120] rounded-xl border-2 backdrop-blur-md shadow-2xl"
        style={{
          left: overlay.x,
          top: overlay.y,
          width: overlay.width,
          height: overlay.height,
          borderColor: `${accentColor}C0`,
          background:
            `linear-gradient(180deg, ${hexToRgba(accentColor, 0.18)} 0%, rgba(10, 14, 24, 0.92) 38%, rgba(4, 8, 16, 0.92) 100%)`,
          boxShadow: `0 18px 40px ${hexToRgba('#000000', 0.32)}, 0 0 0 1px ${hexToRgba(accentColor, 0.28)}`,
          transform: `scale(${overlay.scale})`,
          transformOrigin: 'top left',
          opacity: 0.96,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-3 border-b rounded-t-[10px]"
          style={{
            backgroundColor: `${accentColor}28`,
            borderColor: `${accentColor}30`,
          }}
        >
          <span className="text-xs font-bold tracking-wider" style={{ color: accentColor }}>
            {overlay.data.type}
          </span>
          <div className="text-[10px] font-mono font-medium text-white/55 bg-black/35 px-2 py-0.5 rounded">
            {overlay.data.attributeName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-drag-overlay="true"
      className="fixed pointer-events-none z-[120] border backdrop-blur-md px-4 flex items-center justify-between gap-3"
      style={{
        left: overlay.x,
        top: overlay.y,
        width: overlay.width,
        height: overlay.height,
        borderRadius: overlay.data.parentContainerType === 'Sequential' ? 10 : 14,
        borderColor: accentColor,
        background:
          `linear-gradient(180deg, ${hexToRgba(accentColor, 0.22)} 0%, ${hexToRgba(accentColor, 0.12)} 100%)`,
        color: accentColor,
        boxShadow:
          `0 18px 38px ${hexToRgba('#000000', 0.28)}, 0 0 0 1px ${hexToRgba(accentColor, 0.42)}`,
        transform: `scale(${overlay.scale})`,
        transformOrigin: 'top left',
        opacity: 0.97,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-bold tracking-wide truncate">{overlay.data.type}</span>
      </div>
      <span className="text-[11px] font-mono text-white/60 truncate">
        {overlay.data.attributeName}
      </span>
    </div>
  );
}

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
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragPreviewType, setDragPreviewType] = useState<ModuleType | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null);
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
  const previewState = useMemo(() => {
    const previewMotionByNodeId = new Map<
      string,
      {
        offsetY: number;
        shifted: boolean;
        ghost: boolean;
      }
    >();
    let previewSlot:
      | {
          containerId: string;
          top: number;
          height: number;
          width: number;
          left: number;
        }
      | null = null;

    if (!dragPreviewType) {
      return { previewMotionByNodeId, previewSlot };
    }

    const layoutIndex = buildContainerLayoutIndex(graph);
    const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const draggingNode = draggingNodeId ? graphNodeById.get(draggingNodeId) : undefined;
    const draggingIsContainer = isContainerModule(dragPreviewType);
    const draggingDimensions =
      draggingNode && draggingIsContainer
        ? layoutIndex.dimensionsByNodeId.get(draggingNode.id)
        : draggingNode
          ? layoutIndex.childLayoutsByNodeId.get(draggingNode.id)?.dimensions
          : undefined;
    const previewHeight =
      draggingDimensions?.height ??
      (draggingIsContainer
        ? getNodeBehavior(dragPreviewType).getContainerDimensions(0).height
        : CONTAINER_LAYOUT.childHeight);
    const previewShiftAmount = previewHeight + CONTAINER_LAYOUT.childGap;

    if (draggingNode?.containerId) {
      previewMotionByNodeId.set(draggingNode.id, {
        offsetY: 0,
        shifted: false,
        ghost: true,
      });
    }

    if (draggingNode?.containerId && containerDropTarget?.containerId !== draggingNode.containerId) {
      const sourceChildren = getOrderedContainerChildren(graph, draggingNode.containerId);
      const sourceIndex = sourceChildren.findIndex((childNode) => childNode.id === draggingNode.id);

      sourceChildren.forEach((childNode, index) => {
        if (index > sourceIndex) {
          previewMotionByNodeId.set(childNode.id, {
            offsetY: -previewShiftAmount,
            shifted: true,
            ghost: false,
          });
        }
      });
    }

    if (!containerDropTarget) {
      return { previewMotionByNodeId, previewSlot };
    }

    const targetContainerNode = graphNodeById.get(containerDropTarget.containerId);
    if (!targetContainerNode) {
      return { previewMotionByNodeId, previewSlot };
    }

    const targetBehavior = getNodeBehavior(targetContainerNode.moduleType);
    const targetChildren = getOrderedContainerChildren(graph, containerDropTarget.containerId);
    const sameContainerReorder = draggingNode?.containerId === containerDropTarget.containerId;
    const filteredTargetChildren = sameContainerReorder
      ? targetChildren.filter((childNode) => childNode.id !== draggingNodeId)
      : targetChildren;
    const targetChildLayouts = filteredTargetChildren
      .map((childNode) => ({
        node: childNode,
        layout: layoutIndex.childLayoutsByNodeId.get(childNode.id),
      }))
      .filter((entry): entry is { node: (typeof filteredTargetChildren)[number]; layout: NonNullable<typeof entry.layout> } => Boolean(entry.layout));

    const previewTop =
      targetChildLayouts.length === 0
        ? CONTAINER_LAYOUT.stackTop
        : containerDropTarget.insertAt >= targetChildLayouts.length
          ? targetChildLayouts[targetChildLayouts.length - 1].layout.position.y +
            targetChildLayouts[targetChildLayouts.length - 1].layout.dimensions.height +
            CONTAINER_LAYOUT.childGap
          : targetChildLayouts[containerDropTarget.insertAt].layout.position.y;

    const previewWidth =
      draggingDimensions?.width ??
      (draggingIsContainer
        ? CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2
        : targetBehavior.getChildWidth());
    const previewLeft =
      draggingNode && draggingNode.containerId === containerDropTarget.containerId
        ? (layoutIndex.childLayoutsByNodeId.get(draggingNode.id)?.position.x ??
          (draggingIsContainer ? CONTAINER_LAYOUT.paddingX : targetBehavior.getChildLeft()))
        : draggingIsContainer
          ? CONTAINER_LAYOUT.paddingX
          : targetBehavior.getChildLeft();

    previewSlot = {
      containerId: containerDropTarget.containerId,
      top: previewTop,
      height: previewHeight,
      width: previewWidth,
      left: previewLeft,
    };

    if (sameContainerReorder && draggingNode) {
      const sourceIndex = targetChildren.findIndex((childNode) => childNode.id === draggingNode.id);

      targetChildren.forEach((childNode, index) => {
        if (childNode.id === draggingNode.id) {
          return;
        }

        let offsetY = 0;
        if (sourceIndex < containerDropTarget.insertAt) {
          if (index > sourceIndex && index <= containerDropTarget.insertAt) {
            offsetY = -previewShiftAmount;
          }
        } else if (sourceIndex > containerDropTarget.insertAt) {
          if (index >= containerDropTarget.insertAt && index < sourceIndex) {
            offsetY = previewShiftAmount;
          }
        }

        if (offsetY !== 0) {
          previewMotionByNodeId.set(childNode.id, {
            offsetY,
            shifted: true,
            ghost: false,
          });
        }
      });

      return { previewMotionByNodeId, previewSlot };
    }

    targetChildren.forEach((childNode, index) => {
      if (index >= containerDropTarget.insertAt) {
        previewMotionByNodeId.set(childNode.id, {
          offsetY: previewShiftAmount,
          shifted: true,
          ghost: false,
        });
      }
    });

    return { previewMotionByNodeId, previewSlot };
  }, [containerDropTarget, dragPreviewType, draggingNodeId, graph]);
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        position: previewState.previewMotionByNodeId.has(node.id)
          ? {
              ...node.position,
              y:
                node.position.y +
                (previewState.previewMotionByNodeId.get(node.id)?.offsetY ?? 0),
            }
          : node.position,
        style: {
          ...(node.style ?? {}),
          ...(previewState.previewMotionByNodeId.has(node.id)
            ? {
                transition:
                  previewState.previewMotionByNodeId.get(node.id)?.ghost
                    ? 'box-shadow 220ms ease, opacity 220ms ease'
                    : 'transform 300ms cubic-bezier(0.22, 1.18, 0.36, 1), box-shadow 220ms ease, opacity 220ms ease',
              }
            : {}),
        },
        data: {
          ...node.data,
          isDropTarget:
            node.type === 'containerNode' && containerDropTarget?.containerId === node.id,
          dropPreviewIndex:
            node.type === 'containerNode' && containerDropTarget?.containerId === node.id
              ? containerDropTarget.insertAt
              : null,
          dropPreviewTop:
            node.type === 'containerNode' && previewState.previewSlot?.containerId === node.id
              ? previewState.previewSlot.top
              : null,
          dropPreviewHeight:
            node.type === 'containerNode' && previewState.previewSlot?.containerId === node.id
              ? previewState.previewSlot.height
              : null,
          dropPreviewWidth:
            node.type === 'containerNode' && previewState.previewSlot?.containerId === node.id
              ? previewState.previewSlot.width
              : null,
          dropPreviewLeft:
            node.type === 'containerNode' && previewState.previewSlot?.containerId === node.id
              ? previewState.previewSlot.left
            : null,
          pulseContainer: recentContainerInsertion?.containerId === node.id,
          pulseChild: recentContainerInsertion?.childId === node.id,
          previewShifted: previewState.previewMotionByNodeId.get(node.id)?.shifted,
          previewGhost: previewState.previewMotionByNodeId.get(node.id)?.ghost,
          dragSourceHidden: dragOverlay?.nodeId === node.id,
        },
      })),
    [containerDropTarget, dragOverlay?.nodeId, nodes, previewState.previewMotionByNodeId, previewState.previewSlot, recentContainerInsertion],
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
      setDragPreviewType(type || null);
      setContainerDropTarget(resolveContainerDropTarget(event.clientX, event.clientY, type));
    },
    [resolveContainerDropTarget],
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !reactFlowWrapper.current?.contains(nextTarget as Node)) {
      setContainerDropTarget(null);
      setDragPreviewType(null);
    }
  }, []);

  const updateDragOverlay = useCallback(
    (event: ReactMouseEvent, node: NetworkNode) => {
      if (!node.parentNode) {
        setDragOverlay(null);
        return;
      }

      setDragOverlay((currentOverlay) => {
        const nodeElement =
          reactFlowWrapper.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.id}"]`);
        const nodeRect = nodeElement?.getBoundingClientRect();
        const baseWidth =
          nodeElement?.offsetWidth ??
          node.width ??
          currentOverlay?.width ??
          220;
        const baseHeight =
          nodeElement?.offsetHeight ??
          node.height ??
          currentOverlay?.height ??
          CONTAINER_LAYOUT.childHeight;
        const scale =
          nodeRect && baseWidth > 0
            ? nodeRect.width / baseWidth
            : reactFlow.getViewport().zoom || 1;

        if (currentOverlay?.nodeId === node.id) {
          return {
            ...currentOverlay,
            x: event.clientX - currentOverlay.offsetX,
            y: event.clientY - currentOverlay.offsetY,
            width: baseWidth,
            height: baseHeight,
            scale,
            data: node.data,
          };
        }

        const offsetX = nodeRect ? event.clientX - nodeRect.left : baseWidth / 2;
        const offsetY = nodeRect ? event.clientY - nodeRect.top : baseHeight / 2;

        return {
          nodeId: node.id,
          nodeType: node.type,
          x: event.clientX - offsetX,
          y: event.clientY - offsetY,
          width: baseWidth,
          height: baseHeight,
          offsetX,
          offsetY,
          scale,
          data: node.data,
        };
      });
    },
    [reactFlow],
  );

  const onNodeDrag = useCallback(
    (event: ReactMouseEvent, node: NetworkNode) => {
      setDraggingNodeId(node.id);
      setDragPreviewType(node.data.type);
      updateDragOverlay(event, node);
      setContainerDropTarget(
        resolveContainerDropTarget(event.clientX, event.clientY, node.data.type, node.id),
      );
    },
    [resolveContainerDropTarget, updateDragOverlay],
  );

  const onNodeDragStart = useCallback(
    (event: ReactMouseEvent, node: NetworkNode) => {
      setDraggingNodeId(node.id);
      setDragPreviewType(node.data.type);
      updateDragOverlay(event, node);
      setContainerDropTarget(
        resolveContainerDropTarget(event.clientX, event.clientY, node.data.type, node.id),
      );
    },
    [resolveContainerDropTarget, updateDragOverlay],
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
        const currentOverlay =
          dragOverlay?.nodeId === node.id
            ? dragOverlay
            : null;
        const absolutePosition = getFlowPosition(
          event.clientX - (currentOverlay?.offsetX ?? 0),
          event.clientY - (currentOverlay?.offsetY ?? 0),
        );

        reparentNode(node.id, undefined, { absolutePosition });
      }

      setContainerDropTarget(null);
      setDraggingNodeId(null);
      setDragPreviewType(null);
      setDragOverlay(null);
    },
    [containerDropTarget, dragOverlay, getFlowPosition, reparentNode, resolveContainerDropTarget, triggerContainerInsertionPulse],
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
        setDragPreviewType(null);
        setDragOverlay(null);
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
      setDragPreviewType(null);
      setDragOverlay(null);
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
        onNodeDragStart={onNodeDragStart}
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

            if (!connected) {
              return '#4B5563';
            }

            return getLayerColor(type);
          }}
        />
      </ReactFlow>

      {dragOverlay && <DragOverlayPreview overlay={dragOverlay} />}
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
