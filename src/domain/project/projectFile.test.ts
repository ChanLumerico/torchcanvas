import { describe, expect, it } from 'vitest';

import { getDefaultParams } from '../layers';
import type {
  GraphLayoutState,
  GraphModel,
  GraphNode,
  GraphPosition,
} from '../graph/types';
import {
  parseProjectFile,
  projectToGraphLayoutState,
  serializeProject,
  validateProjectFile,
} from './projectFile';

function createNode(
  id: string,
  moduleType: GraphNode['moduleType'],
  attributeName: string,
  options: Partial<Pick<GraphNode, 'containerId' | 'params'>> = {},
): GraphNode {
  return {
    id,
    moduleType,
    attributeName,
    params: options.params ?? getDefaultParams(moduleType),
    ...(options.containerId ? { containerId: options.containerId } : {}),
  };
}

function createLayout(
  positionsById: Record<string, GraphPosition>,
  dimensionsById: GraphLayoutState['dimensionsById'] = {},
): Pick<GraphLayoutState, 'positionsById' | 'dimensionsById'> {
  return {
    positionsById,
    dimensionsById,
  };
}

describe('projectFile', () => {
  it('round-trips a valid project file through serialize and parse', () => {
    const graph: GraphModel = {
      modelName: 'VisionModel',
      nodes: [
        createNode('input', 'Input', 'image'),
        createNode('conv', 'Conv2d', 'conv_1'),
        createNode('output', 'Output', 'output'),
      ],
      edges: [
        { id: 'edge-1', sourceId: 'input', targetId: 'conv' },
        { id: 'edge-2', sourceId: 'conv', targetId: 'output' },
      ],
    };
    const layout = createLayout(
      {
        input: { x: 80, y: 160 },
        conv: { x: 360, y: 160 },
        output: { x: 640, y: 160 },
      },
      {
        conv: { width: 144, height: 180 },
      },
    );

    const serialized = serializeProject(graph, layout);
    const parsed = parseProjectFile(JSON.stringify(serialized));
    const restoredLayout = projectToGraphLayoutState(parsed);

    expect(parsed.graph).toEqual(graph);
    expect(restoredLayout.positionsById).toEqual(layout.positionsById);
    expect(restoredLayout.dimensionsById).toEqual(layout.dimensionsById);
  });

  it('rejects unsupported schema versions', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 999,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [],
        edges: [],
      },
      layout: {
        positionsById: {},
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Unsupported project schema version: 999.');
  });

  it('rejects unknown module types and duplicate node ids', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'node-1',
            moduleType: 'Input',
            attributeName: 'input_1',
            params: getDefaultParams('Input'),
          },
          {
            id: 'node-2',
            moduleType: 'UnknownLayer',
            attributeName: 'unknown_1',
            params: {},
          },
          {
            id: 'node-1',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: getDefaultParams('ReLU'),
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          'node-1': { x: 0, y: 0 },
          'node-2': { x: 200, y: 0 },
        },
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Duplicate node id: node-1.');
    expect(result.errors).toContain(
      'graph.nodes[1].moduleType is not a supported TorchCanvas layer.',
    );
  });

  it('rejects dangling edges and invalid container references', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: getDefaultParams('ReLU'),
          },
          {
            id: 'child',
            moduleType: 'Conv2d',
            attributeName: 'conv_1',
            params: getDefaultParams('Conv2d'),
            containerId: 'relu',
          },
        ],
        edges: [{ id: 'edge-1', sourceId: 'child', targetId: 'missing' }],
      },
      layout: {
        positionsById: {
          relu: { x: 40, y: 40 },
          child: { x: 180, y: 40 },
        },
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('child references invalid container relu.');
    expect(result.errors).toContain('Edge edge-1 references a missing source or target node.');
  });

  it('accepts structurally valid projects even when the graph is compilation-invalid', () => {
    const graph: GraphModel = {
      modelName: 'DraftModel',
      nodes: [createNode('conv', 'Conv2d', 'conv_1')],
      edges: [],
    };
    const layout = createLayout({
      conv: { x: 240, y: 180 },
    });

    const result = validateProjectFile(serializeProject(graph, layout));

    expect(result.isValid).toBe(true);
    expect(result.project?.graph).toEqual(graph);
  });
});
