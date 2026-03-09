import { describe, expect, it } from 'vitest';

import type { GraphModel } from './types';
import {
  getContainerDimensionsByChildCount,
  getContainerChildRelativePosition,
  getContainerChildWidth,
  getSequentialDerivedEdgePairs,
  normalizeContainerOrders,
} from './utils';

function createGraph(nodes: GraphModel['nodes']): GraphModel {
  return {
    modelName: 'GraphUtilsModel',
    inputsByNodeId: {},
    nodes,
    edges: [],
  };
}

describe('graph utils', () => {
  it('normalizes containerOrder values by stable child order', () => {
    const graph = createGraph([
      { id: 'seq', moduleType: 'Sequential', attributeName: 'seq', params: {} },
      {
        id: 'relu',
        moduleType: 'ReLU',
        attributeName: 'relu',
        params: { inplace: true },
        containerId: 'seq',
      },
      {
        id: 'linear',
        moduleType: 'Linear',
        attributeName: 'linear',
        params: { in_features: 32, out_features: 16 },
        containerId: 'seq',
      },
    ]);

    const normalizedGraph = normalizeContainerOrders(graph);

    expect(
      normalizedGraph.nodes
        .filter((node) => node.containerId === 'seq')
        .map((node) => [node.id, node.containerOrder]),
    ).toEqual([
      ['relu', 0],
      ['linear', 1],
    ]);
  });

  it('derives one sequential edge per adjacent child pair', () => {
    const graph = createGraph([
      { id: 'seq', moduleType: 'Sequential', attributeName: 'seq', params: {} },
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
      {
        id: 'dropout',
        moduleType: 'Dropout',
        attributeName: 'dropout',
        params: { p: 0.2 },
        containerId: 'seq',
        containerOrder: 2,
      },
    ]);

    expect(getSequentialDerivedEdgePairs(graph)).toEqual([
      { containerId: 'seq', sourceId: 'linear', targetId: 'relu' },
      { containerId: 'seq', sourceId: 'relu', targetId: 'dropout' },
    ]);
  });

  it('centers sequential child nodes while leaving other container children full-width', () => {
    expect(getContainerChildWidth('Sequential')).toBeLessThan(getContainerChildWidth('ModuleList'));
    expect(getContainerChildRelativePosition(0, 'Sequential').x).toBeGreaterThan(16);
    expect(getContainerChildRelativePosition(0, 'ModuleList').x).toBe(16);
  });

  it('grows container height as child count increases', () => {
    expect(getContainerDimensionsByChildCount(0, 'Sequential').height).toBeLessThan(
      getContainerDimensionsByChildCount(4, 'Sequential').height,
    );
  });
});
