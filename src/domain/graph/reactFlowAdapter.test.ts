import { describe, expect, it } from 'vitest';

import { graphToDerivedSequentialEdges } from './reactFlowAdapter';
import type { GraphModel } from './types';

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
          stroke: '#334155CC',
          strokeWidth: 2.25,
        }),
      }),
    ]);
  });
});
