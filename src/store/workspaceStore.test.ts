import { beforeEach, describe, expect, it } from 'vitest';
import type { NodeChange } from 'reactflow';

import { getDefaultParams, isContainerModule, type ModuleType } from '../domain/layers';
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
    store.addNode(createNode('seq', 'Sequential', 200, 200, 'seq_1'));
    store.addNode(createNode('relu', 'ReLU', 260, 240, 'relu_1'));
    store.onConnect({ source: 'input', target: 'relu', sourceHandle: null, targetHandle: null });
    store.reparentNode('relu', 'seq');

    let state = useWorkspaceStore.getState();
    expect(state.graph.edges).toHaveLength(1);
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerId).toBe('seq');
    expect(state.nodes.find((node) => node.id === 'relu')?.parentNode).toBe('seq');
    expect(state.nodes.find((node) => node.id === 'relu')?.position).toEqual({ x: 60, y: 40 });

    store.deleteNodeById('seq');
    state = useWorkspaceStore.getState();
    expect(state.graph.nodes.find((node) => node.id === 'relu')?.containerId).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'relu')?.parentNode).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'relu')?.position).toEqual({ x: 260, y: 240 });
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
});
