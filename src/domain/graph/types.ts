import type { ModuleType, LayerParams } from '../layers';

export interface ModelInputBinding {
  argumentName: string;
  shape: string;
}

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GraphNodeDimensions {
  width: number;
  height: number;
}

export interface GraphSelection {
  nodeId: string | null;
  edgeId: string | null;
}

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface GraphNode {
  id: string;
  moduleType: ModuleType;
  attributeName: string;
  params: LayerParams;
  containerId?: string;
  containerOrder?: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface GraphModel {
  modelName: string;
  inputsByNodeId: Record<string, ModelInputBinding>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphLayoutState {
  positionsById: Record<string, GraphPosition>;
  dimensionsById: Record<string, GraphNodeDimensions>;
  selection: GraphSelection;
  viewport?: GraphViewport;
}

export interface GraphSnapshot {
  graph: GraphModel;
  layout: GraphLayoutState;
}

export interface GraphNodePresentationMeta {
  outputShape?: string;
  shapeError: boolean;
  connected: boolean;
}
