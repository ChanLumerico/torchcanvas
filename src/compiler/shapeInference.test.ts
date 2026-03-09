import { describe, expect, it } from 'vitest';

import type { GraphModel } from '../domain/graph/types';
import { inferGraphNodeMeta } from './shapeInference';

function createGraph(
  nodes: GraphModel['nodes'],
  edges: GraphModel['edges'],
  inputsByNodeId: GraphModel['inputsByNodeId'],
): GraphModel {
  return {
    modelName: 'ShapeInferenceModel',
    inputsByNodeId,
    nodes,
    edges,
  };
}

describe('inferGraphNodeMeta', () => {
  it('uses root input bindings as the starting shapes', () => {
    const graph = createGraph(
      [
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
        },
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu',
          params: { inplace: true },
        },
      ],
      [{ id: 'edge-1', sourceId: 'linear', targetId: 'relu' }],
      {
        linear: { argumentName: 'image', shape: '[B, 32]' },
      },
    );

    const metaByNodeId = inferGraphNodeMeta(graph);

    expect(metaByNodeId.linear.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.relu.outputShape).toBe('[B, 16]');
  });

  it('marks sequential containers and their children as connected from external edges', () => {
    const graph = createGraph(
      [
        {
          id: 'stem',
          moduleType: 'Linear',
          attributeName: 'stem',
          params: { in_features: 32, out_features: 32 },
        },
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
      ],
      [{ id: 'edge-1', sourceId: 'stem', targetId: 'seq' }],
      {
        stem: { argumentName: 'image', shape: '[B, 32]' },
      },
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
      ],
      [],
      {
        outer: { argumentName: 'image', shape: '[B, 32]' },
      },
    );

    const metaByNodeId = inferGraphNodeMeta(graph);

    expect(metaByNodeId.outer.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.inner.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.linear.outputShape).toBe('[B, 16]');
    expect(metaByNodeId.relu.outputShape).toBe('[B, 16]');
  });

  it('leaves downstream shapes unknown when a root shape is missing', () => {
    const graph = createGraph(
      [
        {
          id: 'linear',
          moduleType: 'Linear',
          attributeName: 'linear',
          params: { in_features: 32, out_features: 16 },
        },
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu',
          params: { inplace: true },
        },
      ],
      [{ id: 'edge-1', sourceId: 'linear', targetId: 'relu' }],
      {
        linear: { argumentName: 'image', shape: '' },
      },
    );

    const metaByNodeId = inferGraphNodeMeta(graph);

    expect(metaByNodeId.linear.outputShape).toBeUndefined();
    expect(metaByNodeId.relu.outputShape).toBeUndefined();
  });
});
