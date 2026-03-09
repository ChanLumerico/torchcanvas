import { describe, expect, it } from 'vitest';

import {
  ACTIVE_CONTAINER_ACCENT,
  getDisplayedAccentColor,
  graphToReactFlowEdges,
} from './reactFlowAdapter';
import type { GraphLayoutState, GraphModel, GraphNodePresentationMeta } from './types';

function createMetaByNodeId(
  entries: Partial<Record<string, Partial<GraphNodePresentationMeta>>>,
): Record<string, GraphNodePresentationMeta> {
  return Object.fromEntries(
    Object.entries(entries).map(([nodeId, meta]) => [
      nodeId,
      {
        outputShape: undefined,
        shapeError: false,
        connected: false,
        ...meta,
      },
    ]),
  ) as Record<string, GraphNodePresentationMeta>;
}

describe('reactFlowAdapter', () => {
  it('uses the active container accent for connected containers', () => {
    expect(getDisplayedAccentColor('Sequential', true)).toBe(ACTIVE_CONTAINER_ACCENT);
    expect(getDisplayedAccentColor('Sequential', false)).toBe('#334155');
    expect(getDisplayedAccentColor('Linear', true)).toBe('#EF4444');
  });

  it('uses the active container accent for connected sequential edges', () => {
    const graph: GraphModel = {
      modelName: 'ConnectedSequentialGraph',
      inputsByNodeId: {},
      nodes: [
        { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
        {
          id: 'conv',
          moduleType: 'Conv2d',
          attributeName: 'conv2d_1',
          params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
          containerId: 'seq',
          containerOrder: 0,
        },
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu_1',
          params: { inplace: true },
          containerId: 'seq',
          containerOrder: 1,
        },
        {
          id: 'head',
          moduleType: 'Linear',
          attributeName: 'head',
          params: { in_features: 64, out_features: 10 },
        },
      ],
      edges: [
        { id: 'edge-seq-head', sourceId: 'seq', targetId: 'head' },
      ],
    };
    const layout: GraphLayoutState = {
      positionsById: {},
      dimensionsById: {},
      selection: {
        nodeId: null,
        edgeId: null,
      },
    };
    const metaByNodeId = createMetaByNodeId({
      seq: { connected: true },
      conv: { connected: true },
      relu: { connected: true },
      head: { connected: true },
    });

    expect(
      graphToReactFlowEdges(graph, layout, metaByNodeId)[0]?.style,
    ).toEqual(
      expect.objectContaining({
        stroke: ACTIVE_CONTAINER_ACCENT,
        strokeWidth: 2,
      }),
    );
  });
});
