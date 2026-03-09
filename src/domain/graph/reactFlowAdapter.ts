import type { CSSProperties } from 'react';
import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from 'reactflow';

import { getLayerColor, isContainerModule, type LayerParams, type ModuleType } from '../layers';
import type {
  GraphEdge,
  GraphLayoutState,
  GraphModel,
  GraphNode,
  GraphNodeDimensions,
  GraphNodePresentationMeta,
  GraphPosition,
} from './types';
import {
  buildContainerLayoutIndex,
  getContainerChildren,
  getSequentialDerivedEdgePairs,
  isSequentialChild,
} from './utils';

export const ACTIVE_CONTAINER_ACCENT = '#94A3B8';

export interface ModuleData {
  type: ModuleType;
  params: LayerParams;
  attributeName: string;
  outputShape?: string;
  shapeError?: boolean;
  connected?: boolean;
  compact?: boolean;
  parentContainerType?: ModuleType;
  hideHandles?: boolean;
  containerChildCount?: number;
  isDropTarget?: boolean;
  dropPreviewIndex?: number | null;
  dropPreviewTop?: number | null;
  dropPreviewHeight?: number | null;
  dropPreviewWidth?: number | null;
  dropPreviewLeft?: number | null;
  dropPreviewMode?: 'slot' | 'empty-centered';
  pulseContainer?: boolean;
  pulseChild?: boolean;
  previewShifted?: boolean;
  previewGhost?: boolean;
  dragSourceHidden?: boolean;
  previewExpanded?: boolean;
}

export type NetworkNode = ReactFlowNode<ModuleData>;
export interface EdgeData {
  derived?: boolean;
  readOnly?: boolean;
}

export type Edge = ReactFlowEdge<EdgeData>;
const DEFAULT_EDGE_COLOR = '#EE4C2C';

function getStoredDimensions(
  nodeId: string,
  layout: GraphLayoutState,
): GraphNodeDimensions | undefined {
  const dimensions = layout.dimensionsById[nodeId];
  if (!dimensions) {
    return undefined;
  }

  return dimensions.width > 0 && dimensions.height > 0 ? dimensions : undefined;
}

function toRelativePosition(
  node: GraphNode,
  layout: GraphLayoutState,
): GraphPosition {
  const absolutePosition = layout.positionsById[node.id] ?? { x: 0, y: 0 };

  if (!node.containerId) {
    return absolutePosition;
  }

  const parentPosition = layout.positionsById[node.containerId] ?? { x: 0, y: 0 };
  return {
    x: absolutePosition.x - parentPosition.x,
    y: absolutePosition.y - parentPosition.y,
  };
}

function createEdgeStyle(color: string): CSSProperties {
  return {
    stroke: color,
    strokeWidth: 2,
  };
}

function getDisplayedNodeAccentColor(
  node: Pick<GraphNode, 'moduleType'>,
  meta?: GraphNodePresentationMeta,
): string {
  if (isContainerModule(node.moduleType) && meta?.connected) {
    return ACTIVE_CONTAINER_ACCENT;
  }

  return getLayerColor(node.moduleType);
}

export function createGraphNodeFromReactFlowNode(node: NetworkNode): {
  graphNode: GraphNode;
  position: GraphPosition;
} {
  return {
    graphNode: {
      id: node.id,
      moduleType: node.data.type,
      attributeName: node.data.attributeName,
      params: structuredClone(node.data.params),
    },
    position: {
      x: node.position.x,
      y: node.position.y,
    },
  };
}

export function getAbsolutePositionForReactFlowNode(
  node: Pick<NetworkNode, 'id' | 'position'>,
  graph: GraphModel,
  layout: GraphLayoutState,
): GraphPosition {
  const graphNode = graph.nodes.find((candidate) => candidate.id === node.id);
  if (!graphNode?.containerId) {
    return node.position;
  }

  const parentPosition = layout.positionsById[graphNode.containerId] ?? { x: 0, y: 0 };
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
}

export function graphToReactFlowNodes(
  graph: GraphModel,
  layout: GraphLayoutState,
  metaByNodeId: Record<string, GraphNodePresentationMeta>,
): NetworkNode[] {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const containerChildren = getContainerChildren(graph);
  const containerLayoutIndex = buildContainerLayoutIndex(graph);

  return graph.nodes.map((node) => {
    const meta = metaByNodeId[node.id];
    const isContainer = isContainerModule(node.moduleType);
    const parentNode = node.containerId ? nodeMap.get(node.containerId) : undefined;
    const compact = Boolean(node.containerId);
    const childLayout = compact ? containerLayoutIndex.childLayoutsByNodeId.get(node.id) ?? null : null;
    const dimensions = isContainer
      ? containerLayoutIndex.dimensionsByNodeId.get(node.id)
      : compact
        ? childLayout?.dimensions
        : getStoredDimensions(node.id, layout);

    return {
      id: node.id,
      type: isContainer ? 'containerNode' : 'moduleNode',
      position:
        compact && childLayout
          ? childLayout.position
          : toRelativePosition(node, layout),
      width: dimensions?.width,
      height: dimensions?.height,
      style: dimensions
        ? {
            width: dimensions.width,
            height: dimensions.height,
          }
        : undefined,
      parentNode: node.containerId,
      draggable: true,
      selected: layout.selection.nodeId === node.id,
      data: {
        type: node.moduleType,
        params: structuredClone(node.params),
        attributeName: node.attributeName,
        outputShape: meta?.outputShape,
        shapeError: meta?.shapeError,
        connected: meta?.connected,
        compact: childLayout?.presentation.compact ?? compact,
        parentContainerType: parentNode?.moduleType,
        hideHandles: childLayout?.presentation.hideHandles ?? isSequentialChild(graph, node.id),
        containerChildCount: isContainer ? (containerChildren.get(node.id)?.length ?? 0) : undefined,
      },
    };
  });
}

export function graphToReactFlowEdges(
  graph: GraphModel,
  layout: GraphLayoutState,
  metaByNodeId?: Record<string, GraphNodePresentationMeta>,
): Edge[] {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));

  return graph.edges.map((edge): Edge => {
    const sourceNode = nodeMap.get(edge.sourceId);

    return {
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'smoothstep',
      animated: true,
      interactionWidth: 20,
      selected: layout.selection.edgeId === edge.id,
      data: {
        derived: false,
      },
      style: createEdgeStyle(
        sourceNode
          ? getDisplayedNodeAccentColor(sourceNode, metaByNodeId?.[sourceNode.id])
          : DEFAULT_EDGE_COLOR,
      ),
    };
  });
}

export function graphToDerivedSequentialEdges(
  graph: GraphModel,
  metaByNodeId?: Record<string, GraphNodePresentationMeta>,
): Edge[] {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));

  return getSequentialDerivedEdgePairs(graph).map((edge) => {
    const containerNode = nodeMap.get(edge.containerId);
    const containerColor = containerNode
      ? getDisplayedNodeAccentColor(containerNode, metaByNodeId?.[containerNode.id])
      : DEFAULT_EDGE_COLOR;

    return {
      id: `derived:${edge.containerId}:${edge.sourceId}:${edge.targetId}`,
      source: edge.sourceId,
      target: edge.targetId,
      sourceHandle: 'sequential-bottom',
      targetHandle: 'sequential-top',
      type: 'straight',
      className: 'sequential-derived-edge',
      animated: false,
      selectable: false,
      focusable: false,
      deletable: false,
      interactionWidth: 0,
      data: {
        derived: true,
        readOnly: true,
      },
      style: {
        stroke: containerColor,
        strokeWidth: 2.25,
      },
    };
  });
}

export function createGraphEdgeFromReactFlowEdge(edge: Edge): GraphEdge {
  return {
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
  };
}
