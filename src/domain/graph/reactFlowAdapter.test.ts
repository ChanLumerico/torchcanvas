import { describe, expect, it } from 'vitest';

import {
  ACTIVE_CONTAINER_ACCENT,
  graphToDerivedSequentialEdges,
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
  it('renders sequential derived edges as straight vertical read-only edges using the container color', () => {
    const graph: GraphModel = {
      modelName: 'AdapterGraph',
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
      ],
      edges: [],
    };

    expect(graphToDerivedSequentialEdges(graph)).toEqual([
      expect.objectContaining({
        source: 'conv',
        target: 'relu',
        sourceHandle: 'sequential-bottom',
        targetHandle: 'sequential-top',
        type: 'straight',
        className: 'sequential-derived-edge',
        selectable: false,
        focusable: false,
        deletable: false,
        data: {
          derived: true,
          readOnly: true,
        },
        style: expect.objectContaining({
          stroke: '#334155',
          strokeWidth: 2.25,
        }),
      }),
    ]);
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

    expect(
      graphToDerivedSequentialEdges(graph, metaByNodeId)[0]?.style,
    ).toEqual(
      expect.objectContaining({
        stroke: ACTIVE_CONTAINER_ACCENT,
        strokeWidth: 2.25,
      }),
    );
  });
});
