import type { GraphModel, GraphNode } from './types';
import { buildGraphIndex, getContainerChildren } from './utils';
import { getLayerDefinition } from '../layers';

export interface GraphConnectionCandidate {
  source?: string | null;
  target?: string | null;
}

export interface GraphConnectionValidationResult {
  isValid: boolean;
  code: string | null;
}

export interface GraphValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

const UNBOUNDED_INPUTS = Number.POSITIVE_INFINITY;

function createResult(isValid: boolean, code: string | null = null): GraphConnectionValidationResult {
  return { isValid, code };
}

function getMaxIncomingEdges(node: GraphNode): number {
  switch (node.moduleType) {
    case 'Input':
      return 0;
    case 'Output':
    case 'Concat':
      return UNBOUNDED_INPUTS;
    case 'Bilinear':
      return 2;
    default:
      return 1;
  }
}

function getMinIncomingEdges(node: GraphNode): number {
  if (getLayerDefinition(node.moduleType).kind === 'container') {
    return 0;
  }

  switch (node.moduleType) {
    case 'Input':
      return 0;
    case 'Output':
      return 1;
    case 'Concat':
      return 2;
    case 'Bilinear':
      return 2;
    default:
      return 1;
  }
}

function describeNode(node: GraphNode): string {
  return `${node.moduleType} \`${node.attributeName}\``;
}

function wouldCreateCycle(graph: GraphModel, sourceId: string, targetId: string): boolean {
  const index = buildGraphIndex(graph);
  const stack = [targetId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    if (currentId === sourceId) {
      return true;
    }

    visited.add(currentId);
    const neighbors = index.adjacencyList.get(currentId) ?? [];
    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        stack.push(neighborId);
      }
    });
  }

  return false;
}

export function validateGraphConnection(
  graph: GraphModel,
  candidate: GraphConnectionCandidate,
): GraphConnectionValidationResult {
  if (!candidate.source || !candidate.target) {
    return createResult(false, 'missing-endpoint');
  }

  if (candidate.source === candidate.target) {
    return createResult(false, 'self-loop');
  }

  const index = buildGraphIndex(graph);
  const sourceNode = index.nodeMap.get(candidate.source);
  const targetNode = index.nodeMap.get(candidate.target);

  if (!sourceNode || !targetNode) {
    return createResult(false, 'missing-node');
  }

  if (sourceNode.moduleType === 'Output') {
    return createResult(false, 'output-source');
  }

  if (sourceNode.moduleType === 'ModuleList' || sourceNode.moduleType === 'ModuleDict') {
    return createResult(false, 'non-callable-container');
  }

  if (targetNode.moduleType === 'Input') {
    return createResult(false, 'input-target');
  }

  if (targetNode.moduleType === 'ModuleList' || targetNode.moduleType === 'ModuleDict') {
    return createResult(false, 'non-callable-container');
  }

  const duplicateEdge = graph.edges.some(
    (edge) => edge.sourceId === candidate.source && edge.targetId === candidate.target,
  );
  if (duplicateEdge) {
    return createResult(false, 'duplicate-edge');
  }

  const currentIncomingCount = (index.reverseList.get(candidate.target) ?? []).length;
  const maxIncomingEdges = getMaxIncomingEdges(targetNode);
  if (Number.isFinite(maxIncomingEdges) && currentIncomingCount >= maxIncomingEdges) {
    return createResult(false, 'max-inputs');
  }

  if (wouldCreateCycle(graph, candidate.source, candidate.target)) {
    return createResult(false, 'cycle');
  }

  return createResult(true);
}

export function canConnectGraphNodes(
  graph: GraphModel,
  candidate: GraphConnectionCandidate,
): boolean {
  return validateGraphConnection(graph, candidate).isValid;
}

export function validateGraphForCompilation(graph: GraphModel): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const index = buildGraphIndex(graph);
  const containerChildren = getContainerChildren(graph, index.topologicalOrder);

  graph.edges.forEach((edge) => {
    if (!index.nodeMap.has(edge.sourceId) || !index.nodeMap.has(edge.targetId)) {
      issues.push({
        code: 'dangling-edge',
        edgeId: edge.id,
        message: `Edge \`${edge.id}\` references a missing source or target node.`,
      });
    }
  });

  if (index.hasCycle) {
    issues.push({
      code: 'cycle',
      message: 'The graph contains at least one cycle. TorchCanvas only supports acyclic graphs.',
    });
  }

  graph.nodes.forEach((node) => {
    const incomingCount = (index.reverseList.get(node.id) ?? []).length;
    const minIncomingEdges = getMinIncomingEdges(node);
    const maxIncomingEdges = getMaxIncomingEdges(node);

    if (node.containerId) {
      const parentNode = index.nodeMap.get(node.containerId);
      if (!parentNode) {
        issues.push({
          code: 'missing-container',
          nodeId: node.id,
          message: `${describeNode(node)} references a missing container.`,
        });
      } else if (parentNode.id === node.id || getLayerDefinition(parentNode.moduleType).kind !== 'container') {
        issues.push({
          code: 'invalid-container',
          nodeId: node.id,
          message: `${describeNode(node)} is nested under an invalid container.`,
        });
      }
    }

    if (incomingCount < minIncomingEdges) {
      issues.push({
        code: 'missing-inputs',
        nodeId: node.id,
        message:
          minIncomingEdges === 1
            ? `${describeNode(node)} requires an incoming connection.`
            : `${describeNode(node)} requires at least ${minIncomingEdges} incoming connections.`,
      });
    }

    if (Number.isFinite(maxIncomingEdges) && incomingCount > maxIncomingEdges) {
      issues.push({
        code: 'too-many-inputs',
        nodeId: node.id,
        message: `${describeNode(node)} supports at most ${maxIncomingEdges} incoming connection${maxIncomingEdges === 1 ? '' : 's'}.`,
      });
    }

    if ((node.moduleType === 'ModuleList' || node.moduleType === 'ModuleDict') && (index.adjacencyList.get(node.id)?.length ?? 0) > 0) {
      issues.push({
        code: 'non-callable-container',
        nodeId: node.id,
        message: `${describeNode(node)} cannot be used as a callable layer. Connect one of its child modules instead.`,
      });
    }

    if ((node.moduleType === 'ModuleList' || node.moduleType === 'ModuleDict' || node.moduleType === 'Sequential') && (containerChildren.get(node.id)?.length ?? 0) === 0) {
      issues.push({
        code: 'empty-container',
        nodeId: node.id,
        message: `${describeNode(node)} does not contain any child modules.`,
      });
    }
  });

  return issues;
}
