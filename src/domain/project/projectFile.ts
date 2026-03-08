import type {
  GraphLayoutState,
  GraphModel,
  GraphNodeDimensions,
  GraphPosition,
} from '../graph/types';
import { createEmptyGraphLayout } from '../graph/utils';
import { layerRegistry, type LayerParamValue } from '../layers';

export const TORCHCANVAS_PROJECT_APP = 'torchcanvas';
export const TORCHCANVAS_PROJECT_SCHEMA_VERSION = 1;
export const TORCHCANVAS_AUTOSAVE_KEY = 'torchcanvas:autosave:v1';

export interface PersistedProjectLayout {
  positionsById: Record<string, GraphPosition>;
  dimensionsById?: Record<string, GraphNodeDimensions>;
}

export interface TorchCanvasProjectLayoutV1 {
  positionsById: Record<string, GraphPosition>;
  dimensionsById?: Record<string, GraphNodeDimensions>;
}

export interface TorchCanvasProjectV1 {
  app: typeof TORCHCANVAS_PROJECT_APP;
  schemaVersion: typeof TORCHCANVAS_PROJECT_SCHEMA_VERSION;
  savedAt: string;
  graph: GraphModel;
  layout: TorchCanvasProjectLayoutV1;
}

export interface ProjectFileValidationResult {
  isValid: boolean;
  errors: string[];
  project?: TorchCanvasProjectV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLayerParamValue(value: unknown): value is LayerParamValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function normalizePosition(position: GraphPosition): GraphPosition {
  return {
    x: position.x,
    y: position.y,
  };
}

function normalizeDimensions(dimensions: GraphNodeDimensions): GraphNodeDimensions {
  return {
    width: dimensions.width,
    height: dimensions.height,
  };
}

function sortRecord<T>(
  record: Record<string, T>,
  normalizeValue: (value: T) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, normalizeValue(record[key])]),
  );
}

function normalizeGraph(graph: GraphModel): GraphModel {
  return {
    modelName: graph.modelName,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      moduleType: node.moduleType,
      attributeName: node.attributeName,
      params: { ...node.params },
      ...(node.containerId ? { containerId: node.containerId } : {}),
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
    })),
  };
}

function normalizePersistedLayout(layout: PersistedProjectLayout): Required<TorchCanvasProjectLayoutV1> {
  return {
    positionsById: sortRecord(layout.positionsById, normalizePosition),
    dimensionsById: sortRecord(layout.dimensionsById ?? {}, normalizeDimensions),
  };
}

function cloneProject(project: TorchCanvasProjectV1): TorchCanvasProjectV1 {
  return structuredClone(project);
}

export function createProjectComparisonSignature(
  graph: GraphModel,
  layout: PersistedProjectLayout,
): string {
  const normalizedLayout = normalizePersistedLayout(layout);

  return JSON.stringify({
    app: TORCHCANVAS_PROJECT_APP,
    schemaVersion: TORCHCANVAS_PROJECT_SCHEMA_VERSION,
    graph: normalizeGraph(graph),
    layout: normalizedLayout,
  });
}

export function isProjectContentEmpty(
  graph: GraphModel,
  layout: PersistedProjectLayout,
): boolean {
  return (
    graph.modelName === 'GeneratedModel' &&
    graph.nodes.length === 0 &&
    graph.edges.length === 0 &&
    Object.keys(layout.positionsById).length === 0 &&
    Object.keys(layout.dimensionsById ?? {}).length === 0
  );
}

export function createProjectFileName(modelName: string): string {
  const trimmed = modelName.trim();
  const sanitized = trimmed.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${sanitized || 'GeneratedModel'}.torchcanvas.json`;
}

export function serializeProject(
  graph: GraphModel,
  layout: PersistedProjectLayout,
): TorchCanvasProjectV1 {
  const normalizedLayout = normalizePersistedLayout(layout);
  const project: TorchCanvasProjectV1 = {
    app: TORCHCANVAS_PROJECT_APP,
    schemaVersion: TORCHCANVAS_PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    graph: normalizeGraph(graph),
    layout: {
      positionsById: normalizedLayout.positionsById,
    },
  };

  if (Object.keys(normalizedLayout.dimensionsById).length > 0) {
    project.layout.dimensionsById = normalizedLayout.dimensionsById;
  }

  return project;
}

function validateParams(
  params: unknown,
  path: string,
  errors: string[],
): params is Record<string, LayerParamValue> {
  if (!isRecord(params)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (!isLayerParamValue(value)) {
      errors.push(`${path}.${key} must be a string, number, or boolean.`);
    }
  });

  return true;
}

function validatePosition(
  value: unknown,
  path: string,
  errors: string[],
): value is GraphPosition {
  let isValid = true;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) {
    errors.push(`${path}.x must be a finite number.`);
    isValid = false;
  }

  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) {
    errors.push(`${path}.y must be a finite number.`);
    isValid = false;
  }

  return isValid;
}

function validateDimensions(
  value: unknown,
  path: string,
  errors: string[],
): value is GraphNodeDimensions {
  let isValid = true;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width < 0) {
    errors.push(`${path}.width must be a non-negative finite number.`);
    isValid = false;
  }

  if (typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height < 0) {
    errors.push(`${path}.height must be a non-negative finite number.`);
    isValid = false;
  }

  return isValid;
}

export function validateProjectFile(project: unknown): ProjectFileValidationResult {
  const errors: string[] = [];

  if (!isRecord(project)) {
    return {
      isValid: false,
      errors: ['Project file must be a JSON object.'],
    };
  }

  if (project.app !== TORCHCANVAS_PROJECT_APP) {
    errors.push(`Unsupported project app: ${String(project.app)}.`);
  }

  if (project.schemaVersion !== TORCHCANVAS_PROJECT_SCHEMA_VERSION) {
    errors.push(`Unsupported project schema version: ${String(project.schemaVersion)}.`);
  }

  if (typeof project.savedAt !== 'string' || project.savedAt.length === 0) {
    errors.push('savedAt must be a non-empty string.');
  }

  if (!isRecord(project.graph)) {
    errors.push('graph must be an object.');
  }

  if (!isRecord(project.layout)) {
    errors.push('layout must be an object.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const rawGraph = project.graph as Record<string, unknown>;
  const rawLayout = project.layout as Record<string, unknown>;

  if (typeof rawGraph.modelName !== 'string' || rawGraph.modelName.length === 0) {
    errors.push('graph.modelName must be a non-empty string.');
  }

  if (!Array.isArray(rawGraph.nodes)) {
    errors.push('graph.nodes must be an array.');
  }

  if (!Array.isArray(rawGraph.edges)) {
    errors.push('graph.edges must be an array.');
  }

  if (!isRecord(rawLayout.positionsById)) {
    errors.push('layout.positionsById must be an object.');
  }

  if (typeof rawLayout.dimensionsById !== 'undefined' && !isRecord(rawLayout.dimensionsById)) {
    errors.push('layout.dimensionsById must be an object when provided.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const graph: GraphModel = {
    modelName: rawGraph.modelName as string,
    nodes: [],
    edges: [],
  };

  (rawGraph.nodes as unknown[]).forEach((entry, index) => {
    const path = `graph.nodes[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    const { id, moduleType, attributeName, params, containerId } = entry;

    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${path}.id must be a non-empty string.`);
      return;
    }

    if (nodeIds.has(id)) {
      errors.push(`Duplicate node id: ${id}.`);
      return;
    }
    nodeIds.add(id);

    if (typeof moduleType !== 'string' || !(moduleType in layerRegistry)) {
      errors.push(`${path}.moduleType is not a supported TorchCanvas layer.`);
    }

    if (typeof attributeName !== 'string' || attributeName.length === 0) {
      errors.push(`${path}.attributeName must be a non-empty string.`);
    }

    if (!validateParams(params, `${path}.params`, errors)) {
      return;
    }

    if (typeof containerId !== 'undefined' && typeof containerId !== 'string') {
      errors.push(`${path}.containerId must be a string when provided.`);
    }

    if (
      typeof moduleType === 'string' &&
      moduleType in layerRegistry &&
      typeof attributeName === 'string' &&
      attributeName.length > 0 &&
      isRecord(params)
    ) {
      graph.nodes.push({
        id,
        moduleType: moduleType as GraphModel['nodes'][number]['moduleType'],
        attributeName,
        params: { ...(params as Record<string, LayerParamValue>) },
        ...(typeof containerId === 'string' ? { containerId } : {}),
      });
    }
  });

  (rawGraph.edges as unknown[]).forEach((entry, index) => {
    const path = `graph.edges[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    const { id, sourceId, targetId } = entry;
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${path}.id must be a non-empty string.`);
      return;
    }

    if (edgeIds.has(id)) {
      errors.push(`Duplicate edge id: ${id}.`);
      return;
    }
    edgeIds.add(id);

    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      errors.push(`${path}.sourceId must be a non-empty string.`);
    }

    if (typeof targetId !== 'string' || targetId.length === 0) {
      errors.push(`${path}.targetId must be a non-empty string.`);
    }

    if (typeof sourceId === 'string' && typeof targetId === 'string') {
      graph.edges.push({ id, sourceId, targetId });
    }
  });

  const positionsById: Record<string, GraphPosition> = {};
  const dimensionsById: Record<string, GraphNodeDimensions> = {};
  const positionEntries = rawLayout.positionsById as Record<string, unknown>;
  const dimensionsEntries = (rawLayout.dimensionsById ?? {}) as Record<string, unknown>;

  Object.entries(positionEntries).forEach(([nodeId, value]) => {
    const path = `layout.positionsById.${nodeId}`;
    if (!nodeIds.has(nodeId)) {
      errors.push(`${path} references an unknown node.`);
      return;
    }

    if (validatePosition(value, path, errors)) {
      const position = value as GraphPosition;
      positionsById[nodeId] = normalizePosition(position);
    }
  });

  Object.entries(dimensionsEntries).forEach(([nodeId, value]) => {
    const path = `layout.dimensionsById.${nodeId}`;
    if (!nodeIds.has(nodeId)) {
      errors.push(`${path} references an unknown node.`);
      return;
    }

    if (validateDimensions(value, path, errors)) {
      const dimensions = value as GraphNodeDimensions;
      dimensionsById[nodeId] = normalizeDimensions(dimensions);
    }
  });

  graph.nodes.forEach((node) => {
    if (!Object.hasOwn(positionEntries, node.id)) {
      errors.push(`layout.positionsById is missing node ${node.id}.`);
    }

    if (node.containerId && !nodeIds.has(node.containerId)) {
      errors.push(`${node.id} references missing container ${node.containerId}.`);
      return;
    }

    if (node.containerId) {
      const parentNode = graph.nodes.find((candidate) => candidate.id === node.containerId);
      if (!parentNode || !(parentNode.moduleType in layerRegistry) || layerRegistry[parentNode.moduleType].kind !== 'container') {
        errors.push(`${node.id} references invalid container ${node.containerId}.`);
      }
    }
  });

  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      errors.push(`Edge ${edge.id} references a missing source or target node.`);
    }
  });

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const normalizedProject: TorchCanvasProjectV1 = {
    app: TORCHCANVAS_PROJECT_APP,
    schemaVersion: TORCHCANVAS_PROJECT_SCHEMA_VERSION,
    savedAt: project.savedAt as string,
    graph: normalizeGraph(graph),
    layout: {
      positionsById: sortRecord(positionsById, normalizePosition),
      dimensionsById: sortRecord(dimensionsById, normalizeDimensions),
    },
  };

  return {
    isValid: true,
    errors: [],
    project: normalizedProject,
  };
}

export function parseProjectFile(text: string): TorchCanvasProjectV1 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  const result = validateProjectFile(parsed);
  if (!result.isValid || !result.project) {
    throw new Error(result.errors.join('\n'));
  }

  return cloneProject(result.project);
}

export function projectToGraphLayoutState(project: TorchCanvasProjectV1): GraphLayoutState {
  const emptyLayout = createEmptyGraphLayout();

  return {
    ...emptyLayout,
    positionsById: sortRecord(project.layout.positionsById, normalizePosition),
    dimensionsById: sortRecord(project.layout.dimensionsById ?? {}, normalizeDimensions),
  };
}
