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
  options: Partial<Pick<GraphNode, 'containerId' | 'containerOrder' | 'params'>> = {},
): GraphNode {
  return {
    id,
    moduleType,
    attributeName,
    params: options.params ?? getDefaultParams(moduleType),
    ...(options.containerId ? { containerId: options.containerId } : {}),
    ...(typeof options.containerOrder === 'number'
      ? { containerOrder: options.containerOrder }
      : {}),
  };
}

function createGraph(
  nodes: GraphModel['nodes'],
  edges: GraphModel['edges'],
  inputsByNodeId: GraphModel['inputsByNodeId'] = {},
): GraphModel {
  return {
    modelName: 'VisionModel',
    inputsByNodeId,
    nodes,
    edges,
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
  it('round-trips a valid v2 project file through serialize and parse', () => {
    const graph = createGraph(
      [
        createNode('conv', 'Conv2d', 'conv_1'),
        createNode('relu', 'ReLU', 'relu_1'),
      ],
      [{ id: 'edge-1', sourceId: 'conv', targetId: 'relu' }],
      {
        conv: { argumentName: 'image', shape: '[B, 3, 224, 224]' },
      },
    );
    const layout = createLayout(
      {
        conv: { x: 80, y: 160 },
        relu: { x: 360, y: 160 },
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
        inputsByNodeId: {},
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

  it('rejects projects that still use removed Input/Output nodes', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'LegacyModel',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'image',
            params: { shape: '[B, 3, 224, 224]' },
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          input: { x: 0, y: 0 },
        },
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      'This project uses removed Input/Output nodes and is not supported in TorchCanvas v2.',
    );
  });

  it('rejects unknown module types and duplicate node ids', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        inputsByNodeId: {},
        nodes: [
          {
            id: 'node-1',
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
        },
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Duplicate node id: node-1.');
    expect(result.errors).toContain(
      'graph.nodes[0].moduleType is not a supported TorchCanvas layer.',
    );
  });

  it('rejects dangling edges and invalid container references', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        inputsByNodeId: {},
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
    const graph = createGraph(
      [createNode('dict', 'ModuleDict', 'blocks')],
      [],
      {},
    );
    const layout = createLayout({
      dict: { x: 240, y: 180 },
    });

    const result = validateProjectFile(serializeProject(graph, layout));

    expect(result.isValid).toBe(true);
    expect(result.project?.graph).toEqual(graph);
  });

  it('normalizes missing containerOrder values on import', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'SequentialProject',
        inputsByNodeId: {
          seq: { argumentName: 'image', shape: '[B, 32]' },
        },
        nodes: [
          {
            id: 'seq',
            moduleType: 'Sequential',
            attributeName: 'encoder',
            params: {},
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: getDefaultParams('ReLU'),
            containerId: 'seq',
          },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: getDefaultParams('Linear'),
            containerId: 'seq',
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          seq: { x: 200, y: 120 },
          relu: { x: 216, y: 180 },
          linear: { x: 216, y: 240 },
        },
      },
    };

    const parsed = parseProjectFile(JSON.stringify(project));
    const childOrders = parsed.graph.nodes
      .filter((node) => node.containerId === 'seq')
      .map((node) => [node.id, node.containerOrder]);

    expect(childOrders).toEqual([
      ['relu', 0],
      ['linear', 1],
    ]);
  });

  it('rejects input bindings that reference unknown nodes', () => {
    const project = {
      app: 'torchcanvas',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'BrokenBindings',
        inputsByNodeId: {
          missing: { argumentName: 'image', shape: '[B, 3, 224, 224]' },
        },
        nodes: [],
        edges: [],
      },
      layout: {
        positionsById: {},
      },
    };

    const result = validateProjectFile(project);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('graph.inputsByNodeId.missing references an unknown node.');
  });
});
