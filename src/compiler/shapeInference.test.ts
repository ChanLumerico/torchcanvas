import { describe, expect, it } from 'vitest';

import type { GraphModel } from '../domain/graph/types';
import { inferGraphNodeMeta } from './shapeInference';

function createGraph(nodes: GraphModel['nodes'], edges: GraphModel['edges']): GraphModel {
  return {
    modelName: 'ShapeInferenceModel',
    nodes,
    edges,
  };
}

describe('inferGraphNodeMeta', () => {
  it('marks sequential containers and their children as connected from external container edges', () => {
    const graph = createGraph(
      [
        { id: 'input', moduleType: 'Input', attributeName: 'input', params: { shape: '[B, 32]' } },
        { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
          containerId: 'seq',
          containerOrder: 0,
        },
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu',
          params: { inplace: true },
          containerId: 'seq',
          containerOrder: 1,
        },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [
        { id: 'edge-1', sourceId: 'input', targetId: 'seq' },
        { id: 'edge-2', sourceId: 'seq', targetId: 'output' },
      ],
    );

    const metaByNodeId = inferGraphNodeMeta(graph);

    expect(metaByNodeId.seq.connected).toBe(true);
    expect(metaByNodeId.linear.connected).toBe(true);
    expect(metaByNodeId.relu.connected).toBe(true);
    expect(metaByNodeId.seq.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.relu.outputShape).toBe('[B, 16]');
  });

  it('propagates shapes through nested sequential containers', () => {
    const graph = createGraph(
      [
        { id: 'input', moduleType: 'Input', attributeName: 'input', params: { shape: '[B, 32]' } },
        { id: 'outer', moduleType: 'Sequential', attributeName: 'outer', params: {} },
        {
          id: 'inner',
          moduleType: 'Sequential',
          attributeName: 'inner',
          params: {},
          containerId: 'outer',
          containerOrder: 0,
        },
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
          containerId: 'inner',
          containerOrder: 0,
        },
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu',
          params: { inplace: true },
          containerId: 'outer',
          containerOrder: 1,
        },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [
        { id: 'edge-1', sourceId: 'input', targetId: 'outer' },
        { id: 'edge-2', sourceId: 'outer', targetId: 'output' },
      ],
    );

    const metaByNodeId = inferGraphNodeMeta(graph);

    expect(metaByNodeId.inner.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.linear.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.relu.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.inner.connected).toBe(true);
  });
});
