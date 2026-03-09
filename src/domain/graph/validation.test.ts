import { describe, expect, it } from 'vitest';

import type { GraphModel } from './types';
import { validateGraphConnection, validateGraphForCompilation } from './validation';

function createGraph(
  nodes: GraphModel['nodes'],
  edges: GraphModel['edges'] = [],
  inputsByNodeId: GraphModel['inputsByNodeId'] = {},
): GraphModel {
  return {
    modelName: 'ValidationGraph',
    inputsByNodeId,
    nodes,
    edges,
  };
}

describe('validateGraphConnection', () => {
  it('rejects duplicate edges and self loops', () => {
    const graph = createGraph(
      [
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
        },
        { id: 'relu', moduleType: 'ReLU', attributeName: 'relu', params: { inplace: true } },
      ],
      [{ id: 'edge-1', sourceId: 'linear', targetId: 'relu' }],
    );

    expect(validateGraphConnection(graph, { source: 'linear', target: 'relu' })).toEqual({
      isValid: false,
      code: 'duplicate-edge',
    });
    expect(validateGraphConnection(graph, { source: 'relu', target: 'relu' })).toEqual({
      isValid: false,
      code: 'self-loop',
    });
  });

  it('rejects connections that exceed target input arity', () => {
    const graph = createGraph(
      [
        {
          id: 'image',
          moduleType: 'Linear',
          attributeName: 'image',
          params: { in_features: 128, out_features: 64 },
        },
        {
          id: 'meta',
          moduleType: 'Linear',
          attributeName: 'meta',
          params: { in_features: 128, out_features: 64 },
        },
        {
          id: 'extra',
          moduleType: 'Linear',
          attributeName: 'extra',
          params: { in_features: 128, out_features: 64 },
        },
        {
          id: 'fusion',
          moduleType: 'Bilinear',
          attributeName: 'fusion',
          params: { in1_features: 64, in2_features: 64, out_features: 32 },
        },
      ],
      [
        { id: 'edge-1', sourceId: 'image', targetId: 'fusion' },
        { id: 'edge-2', sourceId: 'meta', targetId: 'fusion' },
      ],
    );

    expect(validateGraphConnection(graph, { source: 'extra', target: 'fusion' })).toEqual({
      isValid: false,
      code: 'max-inputs',
    });
  });

  it('rejects cycles and direct connections to non-callable containers', () => {
    const graph = createGraph(
      [
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
        },
        { id: 'relu', moduleType: 'ReLU', attributeName: 'relu', params: { inplace: true } },
        { id: 'dict', moduleType: 'ModuleDict', attributeName: 'blocks', params: {} },
      ],
      [{ id: 'edge-1', sourceId: 'linear', targetId: 'relu' }],
    );

    expect(validateGraphConnection(graph, { source: 'relu', target: 'linear' })).toEqual({
      isValid: false,
      code: 'cycle',
    });
    expect(validateGraphConnection(graph, { source: 'linear', target: 'dict' })).toEqual({
      isValid: false,
      code: 'non-callable-container',
    });
    expect(validateGraphConnection(graph, { source: 'dict', target: 'relu' })).toEqual({
      isValid: false,
      code: 'non-callable-container',
    });
  });

  it('rejects direct connections to sequential child nodes', () => {
    const graph = createGraph([
      {
        id: 'linear',
        moduleType: 'Linear',
        attributeName: 'linear',
        params: { in_features: 32, out_features: 16 },
      },
      { id: 'seq', moduleType: 'Sequential', attributeName: 'seq', params: {} },
      {
        id: 'relu',
        moduleType: 'ReLU',
        attributeName: 'relu',
        params: { inplace: true },
        containerId: 'seq',
        containerOrder: 0,
      },
    ]);

    expect(validateGraphConnection(graph, { source: 'linear', target: 'relu' })).toEqual({
      isValid: false,
      code: 'container-child-endpoint',
    });
    expect(validateGraphConnection(graph, { source: 'relu', target: 'seq' })).toEqual({
      isValid: false,
      code: 'container-child-endpoint',
    });
  });
});

describe('validateGraphForCompilation', () => {
  it('accepts executable root modules without explicit input nodes', () => {
    const graph = createGraph(
      [
        {
          id: 'conv',
          moduleType: 'Conv2d',
          attributeName: 'conv',
          params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
        },
      ],
      [],
      {
        conv: { argumentName: 'image', shape: '[B, 3, 224, 224]' },
      },
    );

    expect(validateGraphForCompilation(graph)).toEqual([]);
  });

  it('reports invalid compilation states for non-callable containers', () => {
    const graph = createGraph(
      [
        { id: 'dict', moduleType: 'ModuleDict', attributeName: 'blocks', params: {} },
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 64, out_features: 32 },
          containerId: 'dict',
          containerOrder: 0,
        },
        { id: 'relu', moduleType: 'ReLU', attributeName: 'relu', params: { inplace: true } },
      ],
      [{ id: 'edge-1', sourceId: 'dict', targetId: 'relu' }],
    );

    expect(validateGraphForCompilation(graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'non-callable-container', nodeId: 'dict' }),
      ]),
    );
  });

  it('accepts sequential children without manual graph edges', () => {
    const graph = createGraph(
      [
        { id: 'seq', moduleType: 'Sequential', attributeName: 'seq', params: {} },
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 64, out_features: 32 },
          containerId: 'seq',
          containerOrder: 0,
        },
      ],
      [],
      {
        seq: { argumentName: 'image', shape: '[B, 64]' },
      },
    );

    expect(validateGraphForCompilation(graph)).toEqual([]);
  });
});
