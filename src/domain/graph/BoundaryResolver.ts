import { sanitizePythonIdentifier } from '../../compiler/pythonSerializer';
import { getNodeBehavior } from '../nodes';
import type { GraphModel, GraphNode, ModelInputBinding } from './types';
import { buildGraphIndex } from './utils';

export interface ExecutableBoundarySet {
  roots: GraphNode[];
  sinks: GraphNode[];
}

function ensureUniqueIdentifier(base: string, usedIdentifiers: Set<string>): string {
  if (!usedIdentifiers.has(base)) {
    usedIdentifiers.add(base);
    return base;
  }

  let suffix = 2;
  while (usedIdentifiers.has(`${base}_${suffix}`)) {
    suffix += 1;
  }

  const nextIdentifier = `${base}_${suffix}`;
  usedIdentifiers.add(nextIdentifier);
  return nextIdentifier;
}

export class BoundaryResolver {
  private readonly graph: GraphModel;

  constructor(graph: GraphModel) {
    this.graph = graph;
  }

  private isExecutableNode(node: GraphNode, nodeMap: Map<string, GraphNode>): boolean {
    const nodeBehavior = getNodeBehavior(node.moduleType);
    if (!nodeBehavior.isCallable()) {
      return false;
    }

    if (!node.containerId) {
      return true;
    }

    const parentNode = nodeMap.get(node.containerId);
    if (!parentNode) {
      return true;
    }

    return !getNodeBehavior(parentNode.moduleType).usesImplicitChildExecution();
  }

  getExecutableNodesInTopologicalOrder(): GraphNode[] {
    const index = buildGraphIndex(this.graph);
    return index.topologicalOrder
      .map((nodeId) => index.nodeMap.get(nodeId))
      .filter((node): node is GraphNode => {
        if (!node) {
          return false;
        }

        return this.isExecutableNode(node, index.nodeMap);
      });
  }

  getExecutableBoundaries(): ExecutableBoundarySet {
    const index = buildGraphIndex(this.graph);
    const executableNodes = this.getExecutableNodesInTopologicalOrder();
    const roots = executableNodes.filter((node) => (index.reverseList.get(node.id) ?? []).length === 0);
    const sinks = executableNodes.filter((node) => (index.adjacencyList.get(node.id) ?? []).length === 0);

    return { roots, sinks };
  }

  syncInputsByNodeId(currentInputsByNodeId: Record<string, ModelInputBinding>): Record<string, ModelInputBinding> {
    const usedIdentifiers = new Set<string>();
    const nextInputsByNodeId: Record<string, ModelInputBinding> = {};

    this.getExecutableBoundaries().roots.forEach((node, index) => {
      const existing = currentInputsByNodeId[node.id];
      const fallback = sanitizePythonIdentifier(node.attributeName, `input_${index + 1}`);
      const baseIdentifier = sanitizePythonIdentifier(existing?.argumentName ?? fallback, fallback);
      const argumentName = ensureUniqueIdentifier(baseIdentifier, usedIdentifiers);

      nextInputsByNodeId[node.id] = {
        argumentName,
        shape: existing?.shape ?? '',
      };
    });

    return nextInputsByNodeId;
  }
}

export function resolveExecutableBoundaries(graph: GraphModel): ExecutableBoundarySet {
  return new BoundaryResolver(graph).getExecutableBoundaries();
}
