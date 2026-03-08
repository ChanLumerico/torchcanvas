import { beforeEach, describe, expect, it } from 'vitest';
import type { NodeChange } from 'reactflow';

import { getDefaultParams, isContainerModule, type ModuleType } from '../domain/layers';
import { createEmptyGraphLayout, createEmptyGraphModel } from '../domain/graph/utils';
import { useWorkspaceStore, type NetworkNode } from './workspaceStore';

function createNode(
  id: string,
  moduleType: ModuleType,
  x: number,
  y: number,
  attributeName = `${moduleType.toLowerCase()}_1`,
): NetworkNode {
  return {
    id,
    type: isContainerModule(moduleType) ? 'containerNode' : 'moduleNode',
    position: { x, y },
    data: {
      type: moduleType,
      attributeName,
      params: getDefaultParams(moduleType),
    },
  };
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  it('keeps graph and React Flow projection in sync for add/connect/reparent/delete', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('input', 'Input', 40, 80, 'input_1'));
    store.addNode(createNode('dict', 'ModuleDict', 200, 200, 'dict_1'));
    store.addNode(createNode('relu', 'ReLU', 260, 240, 'relu_1'));
    store.onConnect({ source: 'input', target: 'relu', sourceHandle: null, targetHandle: null });
    store.reparentNode('relu', 'dict');

    let state = useWorkspaceStore.getState();
    expect(state.graph.edges).toHaveLength(1);
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerId).toBe('dict');
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerOrder).toBe(0);
    expect(state.nodes.find((node) => node.id === 'relu')?.parentNode).toBe('dict');
    expect(state.nodes.find((node) => node.id === 'relu')?.position).toEqual({ x: 16, y: 60 });

    store.deleteNodeById('dict');
    state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerId).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'relu')?.parentNode).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'relu')?.position).toEqual({ x: 216, y: 260 });
  });

  it('tracks param and attribute edits in undo/redo history', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('relu', 'ReLU', 80, 120, 'relu_1'));
    store.updateNodeParams('relu', { inplace: false });
    store.updateNodeAttributeName('relu', 'relu_block');

    let state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.params.inplace).toBe(false);
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.attributeName).toBe('relu_block');

    store.undo();
    state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.attributeName).toBe('relu_1');
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.params.inplace).toBe(false);

    store.undo();
    state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.params.inplace).toBe(true);

    store.redo();
    store.redo();
    state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.params.inplace).toBe(false);
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.attributeName).toBe('relu_block');
  });

  it('persists measured node dimensions for controlled React Flow rendering', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('conv', 'Conv2d', 120, 160, 'conv_1'));

    store.onNodesChange([
      {
        id: 'conv',
        type: 'dimensions',
        dimensions: { width: 160, height: 185.5 },
        setAttributes: true,
      } as NodeChange,
    ]);

    const state = useWorkspaceStore.getState();
    expect(state.layout.dimensionsById.conv).toEqual({ width: 160, height: 185.5 });
    expect(state.nodes.find((node) => node.id === 'conv')?.width).toBe(160);
    expect(state.nodes.find((node) => node.id === 'conv')?.height).toBe(185.5);
  });

  it('rejects invalid connections in the store command layer', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('image', 'Input', 20, 20, 'image'));
    store.addNode(createNode('meta', 'Input', 20, 120, 'meta'));
    store.addNode(createNode('fusion', 'Bilinear', 220, 80, 'fusion'));
    store.addNode(createNode('output', 'Output', 420, 80, 'output'));

    store.onConnect({ source: 'image', target: 'fusion', sourceHandle: null, targetHandle: null });
    store.onConnect({ source: 'meta', target: 'fusion', sourceHandle: null, targetHandle: null });
    store.onConnect({ source: 'output', target: 'fusion', sourceHandle: null, targetHandle: null });
    store.onConnect({ source: 'fusion', target: 'image', sourceHandle: null, targetHandle: null });

    const state = useWorkspaceStore.getState();
    expect(state.graph.edges).toHaveLength(2);
    expect(state.graph.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
      ['image', 'fusion'],
      ['meta', 'fusion'],
    ]);
  });

  it('assigns stable containerOrder values and stacked positions for multiple children', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('seq', 'Sequential', 200, 120, 'encoder'));
    store.addNode(createNode('linear', 'Linear', 40, 40, 'linear_1'), { parentId: 'seq' });
    store.addNode(createNode('relu', 'ReLU', 40, 40, 'relu_1'), { parentId: 'seq' });
    store.addNode(createNode('dropout', 'Dropout', 40, 40, 'dropout_1'), { parentId: 'seq' });

    let state = useWorkspaceStore.getState();
    expect(
      state.graph.nodes
        .filter((node) => node.containerId === 'seq')
        .map((node) => [node.id, node.containerOrder]),
    ).toEqual([
      ['linear', 0],
      ['relu', 1],
      ['dropout', 2],
    ]);
    expect(state.nodes.find((node) => node.id === 'linear')?.position).toEqual({ x: 34, y: 60 });
    expect(state.nodes.find((node) => node.id === 'relu')?.position).toEqual({ x: 34, y: 115 });
    expect(state.nodes.find((node) => node.id === 'dropout')?.position).toEqual({ x: 34, y: 170 });

    store.deleteNodeById('relu');
    state = useWorkspaceStore.getState();
    expect(
      state.graph.nodes
        .filter((node) => node.containerId === 'seq')
        .map((node) => [node.id, node.containerOrder]),
    ).toEqual([
      ['linear', 0],
      ['dropout', 1],
    ]);
    expect(state.nodes.find((node) => node.id === 'dropout')?.position).toEqual({ x: 34, y: 115 });
  });

  it('supports nested sequential containers without corrupting parent-child boundaries', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('outer', 'Sequential', 200, 120, 'outer_encoder'));
    store.addNode(createNode('inner', 'Sequential', 40, 40, 'inner_encoder'), { parentId: 'outer' });
    store.addNode(createNode('linear', 'Linear', 40, 40, 'linear_1'), { parentId: 'inner' });
    store.addNode(createNode('relu', 'ReLU', 40, 40, 'relu_1'), { parentId: 'outer' });

    const state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'inner')?.containerId).toBe('outer');
    expect(state.graph.nodes.find((node) => node.id === 'linear')?.containerId).toBe('inner');
    expect(state.nodes.find((node) => node.id === 'inner')?.parentNode).toBe('outer');
    expect(state.nodes.find((node) => node.id === 'linear')?.parentNode).toBe('inner');
    expect(state.nodes.find((node) => node.id === 'relu')?.parentNode).toBe('outer');
  });

  it('lets container children move back out to the top-level canvas without losing their absolute position', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('seq', 'Sequential', 200, 120, 'encoder'));
    store.addNode(createNode('linear', 'Linear', 40, 40, 'linear_1'), { parentId: 'seq' });

    const nestedPosition = useWorkspaceStore.getState().layout.positionsById.linear;
    store.reparentNode('linear', undefined);

    const state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'linear')?.containerId).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'linear')?.parentNode).toBeUndefined();
    expect(state.layout.positionsById.linear).toEqual(nestedPosition);
  });

  it('reorders children within the same container using insertAt semantics', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('seq', 'Sequential', 200, 120, 'encoder'));
    store.addNode(createNode('linear', 'Linear', 40, 40, 'linear_1'), { parentId: 'seq' });
    store.addNode(createNode('relu', 'ReLU', 40, 40, 'relu_1'), { parentId: 'seq' });
    store.addNode(createNode('dropout', 'Dropout', 40, 40, 'dropout_1'), { parentId: 'seq' });

    store.reparentNode('dropout', 'seq', { insertAt: 0 });

    const state = useWorkspaceStore.getState();
    expect(
      state.graph.nodes
        .filter((node) => node.containerId === 'seq')
        .sort((leftNode, rightNode) => (leftNode.containerOrder ?? 0) - (rightNode.containerOrder ?? 0))
        .map((node) => [node.id, node.containerOrder]),
    ).toEqual([
      ['dropout', 0],
      ['linear', 1],
      ['relu', 2],
    ]);
    expect(state.nodes.find((node) => node.id === 'dropout')?.position).toEqual({ x: 34, y: 60 });
  });

  it('does not reparent unrelated nodes when adding a top-level layer beside a sequential container', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('seq', 'Sequential', 200, 120, 'encoder'));
    store.addNode(createNode('linear', 'Linear', 40, 40, 'linear_1'), { parentId: 'seq' });
    store.addNode(createNode('relu', 'ReLU', 40, 40, 'relu_1'), { parentId: 'seq' });

    store.addNode(createNode('conv', 'Conv2d', 560, 120, 'conv_1'));

    const state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'linear')?.containerId).toBe('seq');
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerId).toBe('seq');
    expect(state.graph.nodes.find((node) => node.id === 'conv')?.containerId).toBeUndefined();
    expect(state.graph.edges).toHaveLength(0);
  });

  it('keeps multiple sequentials and inputs stable when adding new top-level nodes', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('input', 'Input', 40, 120, 'image'));
    store.addNode(createNode('seq-a', 'Sequential', 240, 80, 'encoder_a'));
    store.addNode(createNode('seq-b', 'Sequential', 520, 80, 'encoder_b'));
    store.addNode(createNode('relu-a', 'ReLU', 40, 40, 'relu_a'), { parentId: 'seq-a' });
    store.addNode(createNode('relu-b', 'ReLU', 40, 40, 'relu_b'), { parentId: 'seq-b' });

    store.addNode(createNode('conv', 'Conv2d', 760, 140, 'conv_1'));

    const state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'input')).toBeDefined();
    expect(state.graph.nodes.find((node) => node.id === 'seq-a')).toBeDefined();
    expect(state.graph.nodes.find((node) => node.id === 'seq-b')).toBeDefined();
    expect(state.graph.nodes.find((node) => node.id === 'conv')?.containerId).toBeUndefined();
    expect(state.graph.edges).toHaveLength(0);
  });

  it('resets history and dirty state when replacing the workspace', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('conv', 'Conv2d', 120, 160, 'conv_1'));
    store.updateNodeAttributeName('conv', 'stem');

    let state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.canUndo).toBe(true);

    const importedGraph = {
      modelName: 'ImportedModel',
      nodes: [
        {
          id: 'input',
          moduleType: 'Input' as const,
          attributeName: 'image',
          params: getDefaultParams('Input'),
        },
      ],
      edges: [],
    };
    const importedLayout = {
      ...createEmptyGraphLayout(),
      positionsById: {
        input: { x: 80, y: 120 },
      },
    };

    store.replaceWorkspace(importedGraph, importedLayout);
    state = useWorkspaceStore.getState();

    expect(state.graph).toEqual(importedGraph);
    expect(state.layout.selection).toEqual({ nodeId: null, edgeId: null });
    expect(state.history).toHaveLength(1);
    expect(state.historyIndex).toBe(0);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.isDirty).toBe(false);
  });

  it('tracks persisted baselines independently from autosave state', () => {
    const store = useWorkspaceStore.getState();
    store.addNode(createNode('input', 'Input', 40, 80, 'image'));

    let state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(true);

    store.markPersistedBaseline();
    state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(false);

    store.setModelName('RenamedModel');
    state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(true);

    store.resetWorkspace();
    state = useWorkspaceStore.getState();
    expect(state.graph).toEqual(createEmptyGraphModel());
    expect(state.isDirty).toBe(false);
  });
});
