import { describe, expect, it } from 'vitest';

import type { GraphModel } from './types';
import { validateGraphConnection, validateGraphForCompilation } from './validation';

function createGraph(
  nodes: GraphModel['nodes'],
  edges: GraphModel['edges'] = [],
): GraphModel {
  return {
    modelName: 'ValidationGraph',
    nodes,
    edges,
  };
}

describe('validateGraphConnection', () => {
  it('rejects duplicate edges and self loops', () => {
    const graph = createGraph(
      [
        { id: 'input', moduleType: 'Input', attributeName: 'input', params: { shape: '[B, 3, 224, 224]' } },
        { id: 'conv', moduleType: 'Conv2d', attributeName: 'conv', params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 } },
      ],
      [{ id: 'edge-1', sourceId: 'input', targetId: 'conv' }],
    );

    expect(validateGraphConnection(graph, { source: 'input', target: 'conv' })).toEqual({
      isValid: false,
      code: 'duplicate-edge',
    });
    expect(validateGraphConnection(graph, { source: 'conv', target: 'conv' })).toEqual({
      isValid: false,
      code: 'self-loop',
    });
  });

  it('rejects connections that exceed target input arity', () => {
    const graph = createGraph(
      [
        { id: 'image', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 128]' } },
        { id: 'meta', moduleType: 'Input', attributeName: 'meta', params: { shape: '[B, 128]' } },
        { id: 'extra', moduleType: 'Input', attributeName: 'extra', params: { shape: '[B, 128]' } },
        {
          id: 'fusion',
          moduleType: 'Bilinear',
          attributeName: 'fusion',
          params: { in1_features: 128, in2_features: 128, out_features: 64 },
        },
        {
          id: 'conv',
          moduleType: 'Conv2d',
          attributeName: 'conv',
          params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
        },
      ],
      [
        { id: 'edge-1', sourceId: 'image', targetId: 'fusion' },
        { id: 'edge-2', sourceId: 'meta', targetId: 'fusion' },
        { id: 'edge-3', sourceId: 'image', targetId: 'conv' },
      ],
    );

    expect(validateGraphConnection(graph, { source: 'extra', target: 'fusion' })).toEqual({
      isValid: false,
      code: 'max-inputs',
    });
    expect(validateGraphConnection(graph, { source: 'meta', target: 'conv' })).toEqual({
      isValid: false,
      code: 'max-inputs',
    });
  });

  it('rejects cycles and invalid input/output directions', () => {
    const graph = createGraph(
      [
        { id: 'input', moduleType: 'Input', attributeName: 'input', params: { shape: '[B, 64]' } },
        { id: 'concat', moduleType: 'Concat', attributeName: 'concat', params: { dim: 1 } },
        { id: 'relu', moduleType: 'ReLU', attributeName: 'relu', params: { inplace: true } },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [
        { id: 'edge-1', sourceId: 'input', targetId: 'concat' },
        { id: 'edge-2', sourceId: 'concat', targetId: 'relu' },
        { id: 'edge-3', sourceId: 'relu', targetId: 'output' },
      ],
    );

    expect(validateGraphConnection(graph, { source: 'relu', target: 'concat' })).toEqual({
      isValid: false,
      code: 'cycle',
    });
    expect(validateGraphConnection(graph, { source: 'output', target: 'relu' })).toEqual({
      isValid: false,
      code: 'output-source',
    });
    expect(validateGraphConnection(graph, { source: 'relu', target: 'input' })).toEqual({
      isValid: false,
      code: 'input-target',
    });
  });

  it('rejects direct connections to non-callable containers', () => {
    const graph = createGraph([
      { id: 'input', moduleType: 'Input', attributeName: 'input', params: { shape: '[B, 64]' } },
      { id: 'dict', moduleType: 'ModuleDict', attributeName: 'dict', params: {} },
      { id: 'linear', moduleType: 'Linear', attributeName: 'linear', params: { in_features: 64, out_features: 32 } },
    ]);

    expect(validateGraphConnection(graph, { source: 'input', target: 'dict' })).toEqual({
      isValid: false,
      code: 'non-callable-container',
    });
    expect(validateGraphConnection(graph, { source: 'dict', target: 'linear' })).toEqual({
      isValid: false,
      code: 'non-callable-container',
    });
  });
});

describe('validateGraphForCompilation', () => {
  it('reports missing inputs and non-callable containers', () => {
    const graph = createGraph(
      [
        { id: 'dict', moduleType: 'ModuleDict', attributeName: 'blocks', params: {} },
        { id: 'linear', moduleType: 'Linear', attributeName: 'linear', params: { in_features: 64, out_features: 32 }, containerId: 'dict' },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [{ id: 'edge-1', sourceId: 'dict', targetId: 'output' }],
    );

    expect(validateGraphForCompilation(graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'non-callable-container', nodeId: 'dict' }),
        expect.objectContaining({ code: 'missing-inputs', nodeId: 'linear' }),
      ]),
    );
  });
});
