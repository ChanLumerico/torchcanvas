import type { GraphModel, GraphNodePresentationMeta } from '../domain/graph/types';
import { BoundaryResolver } from '../domain/graph/BoundaryResolver';
import { buildGraphIndex, getOrderedContainerChildren } from '../domain/graph/utils';
import { getLayerDefinition } from '../domain/layers';
import { getNodeBehavior } from '../domain/nodes';
import type { LayerParamValue, LayerParams, ModuleType } from '../domain/layers';

type ShapeToken = string | number;

function propagateImplicitContainerShapes(
  graph: GraphModel,
  containerId: string,
  currentShape: string,
  metaByNodeId: Record<string, GraphNodePresentationMeta>,
): string {
  const childNodes = getOrderedContainerChildren(graph, containerId);
  let nextShape = currentShape;

  childNodes.forEach((childNode) => {
    const childBehavior = getNodeBehavior(childNode.moduleType);

    if (childBehavior.usesImplicitChildExecution()) {
      nextShape = propagateImplicitContainerShapes(graph, childNode.id, nextShape, metaByNodeId);
      metaByNodeId[childNode.id].outputShape = nextShape;
      metaByNodeId[childNode.id].shapeError = false;
      return;
    }

    if (childBehavior.isContainer()) {
      throw new Error(`Nested non-callable container ${childNode.moduleType} is not shape-inferable.`);
    }

    nextShape = calculateLayerShape(childNode.moduleType, childNode.params, [nextShape]);
    metaByNodeId[childNode.id].outputShape = nextShape;
    metaByNodeId[childNode.id].shapeError = false;
  });

  return nextShape;
}

function markImplicitContainerDescendantsConnected(
  graph: GraphModel,
  containerId: string,
  connected: boolean,
  metaByNodeId: Record<string, GraphNodePresentationMeta>,
): void {
  getOrderedContainerChildren(graph, containerId).forEach((childNode) => {
    metaByNodeId[childNode.id].connected = connected;

    if (getNodeBehavior(childNode.moduleType).isContainer()) {
      markImplicitContainerDescendantsConnected(graph, childNode.id, connected, metaByNodeId);
    }
  });
}

export function inferGraphNodeMeta(graph: GraphModel): Record<string, GraphNodePresentationMeta> {
  const index = buildGraphIndex(graph);
  const rootIds = new Set(
    new BoundaryResolver(graph).getExecutableBoundaries().roots.map((node) => node.id),
  );
  const metaByNodeId = Object.fromEntries(
    graph.nodes.map((node) => [
      node.id,
      {
        outputShape: undefined,
        shapeError: false,
        connected: index.connectedIds.has(node.id),
      } satisfies GraphNodePresentationMeta,
    ]),
  ) as Record<string, GraphNodePresentationMeta>;

  index.topologicalOrder.forEach((nodeId) => {
    const node = index.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const parentNode = node.containerId ? index.nodeMap.get(node.containerId) : undefined;
    if (parentNode && getNodeBehavior(parentNode.moduleType).usesImplicitChildExecution()) {
      return;
    }

    try {
      const sources = index.reverseList.get(node.id) ?? [];
      const rootInputShape =
        sources.length === 0 && rootIds.has(node.id)
          ? graph.inputsByNodeId[node.id]?.shape.trim()
          : null;

      if (sources.length === 0 && !rootInputShape) {
        return;
      }

      const inputShapes: string[] =
        sources.length === 0
          ? rootInputShape
            ? [rootInputShape]
            : []
          : sources
              .map((sourceId) => metaByNodeId[sourceId]?.outputShape)
              .filter((shape): shape is string => typeof shape === 'string');

      if (sources.length > 0 && inputShapes.length !== sources.length) {
        return;
      }

      if (getNodeBehavior(node.moduleType).usesImplicitChildExecution()) {
        metaByNodeId[node.id].outputShape = propagateImplicitContainerShapes(
          graph,
          node.id,
          inputShapes[0],
          metaByNodeId,
        );
        return;
      }

      metaByNodeId[node.id].outputShape = calculateLayerShape(
        node.moduleType,
        node.params,
        inputShapes,
      );
    } catch {
      metaByNodeId[node.id].shapeError = true;
      metaByNodeId[node.id].outputShape = 'Error: Dimension Mismatch';
    }
  });

  graph.nodes
    .filter((node) => getLayerDefinition(node.moduleType).kind === 'container')
    .forEach((containerNode) => {
      const childNodes = getOrderedContainerChildren(graph, containerNode.id);
      const hasConnectedChild = childNodes.some((childNode) => index.connectedIds.has(childNode.id));
      const parentNode = containerNode.containerId
        ? index.nodeMap.get(containerNode.containerId)
        : undefined;
      const inheritedConnected = parentNode
        ? getNodeBehavior(parentNode.moduleType).usesImplicitChildExecution() &&
          metaByNodeId[parentNode.id]?.connected
        : false;
      metaByNodeId[containerNode.id].connected = getNodeBehavior(containerNode.moduleType).getConnectedState({
        explicitConnected: index.connectedIds.has(containerNode.id) || inheritedConnected,
        hasConnectedChild,
      });

      if (getNodeBehavior(containerNode.moduleType).usesImplicitChildExecution()) {
        markImplicitContainerDescendantsConnected(
          graph,
          containerNode.id,
          metaByNodeId[containerNode.id].connected,
          metaByNodeId,
        );
      }
    });

  return metaByNodeId;
}

function parseShape(shape: string): ShapeToken[] {
  return shape
    .replace(/[[\]()]/g, '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? value : parsed;
    });
}

function formatShape(shape: ShapeToken[]): string {
  return `[${shape.join(', ')}]`;
}

function toNumericValue(value: LayerParamValue | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toNumericArray(value: LayerParamValue | undefined, count: number, fallback: number): number[] {
  if (typeof value === 'string' && value.startsWith('[')) {
    const parsed = parseShape(value)
      .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry));

    if (parsed.length >= count) {
      return parsed.slice(0, count) as number[];
    }
  }

  return Array(count).fill(toNumericValue(value, fallback));
}

function calculateSpatialDimension(
  inputDimension: ShapeToken,
  kernel: number,
  stride: number,
  padding: number,
  dilation = 1,
  transpose = false,
  outputPadding = 0,
): ShapeToken {
  if (typeof inputDimension !== 'number') {
    return inputDimension;
  }

  if (transpose) {
    return (inputDimension - 1) * stride - 2 * padding + dilation * (kernel - 1) + outputPadding + 1;
  }

  return Math.floor((inputDimension + 2 * padding - dilation * (kernel - 1) - 1) / stride + 1);
}

function getKernelArguments(params: LayerParams, count: number) {
  return {
    kernel: toNumericArray(params.kernel_size, count, 3),
    stride: toNumericArray(params.stride, count, 1),
    padding: toNumericArray(params.padding, count, 0),
    dilation: toNumericArray(params.dilation, count, 1),
    outputPadding: toNumericArray(params.output_padding, count, 0),
  };
}

function calculateLayerShape(type: ModuleType, params: LayerParams, inputShapes: string[]): string {
  if (inputShapes.length === 0) {
    throw new Error('No inputs available');
  }

  const inputShape = parseShape(inputShapes[0]);

  switch (true) {
    case type.startsWith('ConvTranspose'): {
      const dimension = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inputShape.length !== dimension + 2) {
        throw new Error(`${type} expects ${dimension + 2}D input`);
      }

      const { kernel, stride, padding, dilation, outputPadding } = getKernelArguments(params, dimension);
      const outChannels = toNumericValue(params.out_channels, 64);
      const spatialShape = inputShape
        .slice(2)
        .map((entry, index) =>
          calculateSpatialDimension(
            entry,
            kernel[index],
            stride[index],
            padding[index],
            dilation[index],
            true,
            outputPadding[index],
          ),
        );

      return formatShape([inputShape[0], outChannels, ...spatialShape]);
    }
    case type.startsWith('Conv'): {
      const dimension = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inputShape.length !== dimension + 2) {
        throw new Error(`${type} expects ${dimension + 2}D input`);
      }

      const { kernel, stride, padding, dilation } = getKernelArguments(params, dimension);
      const outChannels = toNumericValue(params.out_channels, 64);
      const spatialShape = inputShape
        .slice(2)
        .map((entry, index) =>
          calculateSpatialDimension(
            entry,
            kernel[index],
            stride[index],
            padding[index],
            dilation[index],
          ),
        );

      return formatShape([inputShape[0], outChannels, ...spatialShape]);
    }
    case type.includes('Pool') && !type.includes('Adaptive'): {
      const dimension = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inputShape.length !== dimension + 2) {
        throw new Error(`${type} expects ${dimension + 2}D input`);
      }

      const { kernel, stride, padding, dilation } = getKernelArguments(params, dimension);
      const spatialShape = inputShape
        .slice(2)
        .map((entry, index) =>
          calculateSpatialDimension(
            entry,
            kernel[index],
            stride[index],
            padding[index],
            dilation[index],
          ),
        );

      return formatShape([inputShape[0], inputShape[1], ...spatialShape]);
    }
    case type.includes('AdaptiveAvgPool'): {
      const dimension = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inputShape.length !== dimension + 2) {
        throw new Error(`${type} expects ${dimension + 2}D input`);
      }

      const outputSize = params.output_size;
      const resolvedSize: ShapeToken[] =
        typeof outputSize === 'string' && outputSize.startsWith('[')
          ? parseShape(outputSize)
          : [
              typeof outputSize === 'undefined'
                ? dimension === 1
                  ? 1
                  : 7
                : typeof outputSize === 'boolean'
                  ? String(outputSize)
                  : outputSize,
            ];

      return formatShape([inputShape[0], inputShape[1], ...resolvedSize]);
    }
    case type === 'Linear': {
      if (inputShape.length < 2) {
        throw new Error('Linear expects at least 2D input');
      }

      const outFeatures = toNumericValue(params.out_features, 10);
      const outputShape = [...inputShape];
      outputShape[outputShape.length - 1] = outFeatures;
      return formatShape(outputShape);
    }
    case type === 'Bilinear': {
      const outFeatures = toNumericValue(params.out_features, 64);
      return formatShape([inputShape[0], outFeatures]);
    }
    case type === 'Flatten': {
      const startDimension = toNumericValue(params.start_dim, 1);
      const endDimension = toNumericValue(params.end_dim, -1);
      const normalizedStart = startDimension < 0 ? inputShape.length + startDimension : startDimension;
      const normalizedEnd = endDimension < 0 ? inputShape.length + endDimension : endDimension;
      const middleShape = inputShape.slice(normalizedStart, normalizedEnd + 1);

      let flattenedDimension: ShapeToken = 1;
      middleShape.forEach((entry) => {
        if (typeof entry === 'number' && typeof flattenedDimension === 'number') {
          flattenedDimension *= entry;
        } else {
          flattenedDimension = '...';
        }
      });

      return formatShape([
        ...inputShape.slice(0, normalizedStart),
        flattenedDimension,
        ...inputShape.slice(normalizedEnd + 1),
      ]);
    }
    case type === 'Unflatten': {
      const dimension = toNumericValue(params.dim, 1);
      const unflattenedSize =
        typeof params.unflattened_size === 'string' && params.unflattened_size.startsWith('[')
          ? parseShape(params.unflattened_size)
          : [
              typeof params.unflattened_size === 'boolean'
                ? String(params.unflattened_size)
                : (params.unflattened_size ?? '[64, 7, 7]'),
            ];
      const outputShape = [...inputShape];
      outputShape.splice(dimension, 1, ...unflattenedSize);
      return formatShape(outputShape);
    }
    case type === 'Upsample': {
      if (typeof params.size === 'string' && params.size.startsWith('[')) {
        return formatShape([inputShape[0], inputShape[1], ...parseShape(params.size)]);
      }

      if (typeof params.scale_factor !== 'undefined') {
        const scaleFactor = toNumericValue(params.scale_factor, 1);
        const spatialShape = inputShape
          .slice(2)
          .map((entry) => (typeof entry === 'number' ? Math.floor(entry * scaleFactor) : '...'));
        return formatShape([inputShape[0], inputShape[1], ...spatialShape]);
      }

      return formatShape(inputShape);
    }
    default:
      return formatShape(inputShape);
  }
}
