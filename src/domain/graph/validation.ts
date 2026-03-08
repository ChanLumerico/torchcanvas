import type { GraphModel, GraphNode } from './types';
import { buildGraphIndex, getContainerChildren } from './utils';
import { getNodeBehavior } from '../nodes';

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

function createResult(isValid: boolean, code: string | null = null): GraphConnectionValidationResult {
  return { isValid, code };
}

function describeNode(node: GraphNode): string {
  return `${node.moduleType} \`${node.attributeName}\``;
}

function isBlockedContainerChildEndpoint(
  index: ReturnType<typeof buildGraphIndex>,
  node: GraphNode,
): boolean {
  if (!node.containerId) {
    return false;
  }

  const parentNode = index.nodeMap.get(node.containerId);
  if (!parentNode) {
    return false;
  }

  return !getNodeBehavior(parentNode.moduleType).getConnectionPolicy().allowDirectChildConnections;
}

function getEndpointRejectionCode(node: GraphNode, direction: 'source' | 'target'): string | null {
  const policy = getNodeBehavior(node.moduleType).getConnectionPolicy();
  if (direction === 'source') {
    if (policy.canSourceConnections) {
      return null;
    }

    if (node.moduleType === 'Output') {
      return 'output-source';
    }

    return getNodeBehavior(node.moduleType).isContainer()
      ? 'non-callable-container'
      : 'invalid-source';
  }

  if (policy.canTargetConnections) {
    return null;
  }

  if (node.moduleType === 'Input') {
    return 'input-target';
  }

  return getNodeBehavior(node.moduleType).isContainer()
    ? 'non-callable-container'
    : 'invalid-target';
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

  const sourceCode = getEndpointRejectionCode(sourceNode, 'source');
  if (sourceCode) {
    return createResult(false, sourceCode);
  }

  const targetCode = getEndpointRejectionCode(targetNode, 'target');
  if (targetCode) {
    return createResult(false, targetCode);
  }

  if (isBlockedContainerChildEndpoint(index, sourceNode) || isBlockedContainerChildEndpoint(index, targetNode)) {
    return createResult(false, 'container-child-endpoint');
  }

  const duplicateEdge = graph.edges.some(
    (edge) => edge.sourceId === candidate.source && edge.targetId === candidate.target,
  );
  if (duplicateEdge) {
    return createResult(false, 'duplicate-edge');
  }

  const maxIncomingEdges = getNodeBehavior(targetNode.moduleType).getConnectionPolicy().maxIncomingEdges;
  const currentIncomingCount = (index.reverseList.get(candidate.target) ?? []).length;
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
  const containerChildren = getContainerChildren(graph);

  graph.edges.forEach((edge) => {
    const sourceNode = index.nodeMap.get(edge.sourceId);
    const targetNode = index.nodeMap.get(edge.targetId);

    if (!sourceNode || !targetNode) {
      issues.push({
        code: 'dangling-edge',
        edgeId: edge.id,
        message: `Edge \`${edge.id}\` references a missing source or target node.`,
      });
      return;
    }

    const sourceCode = getEndpointRejectionCode(sourceNode, 'source');
    if (sourceCode) {
      issues.push({
        code: sourceCode,
        edgeId: edge.id,
        message: `Edge \`${edge.id}\` starts from invalid source ${describeNode(sourceNode)}.`,
      });
    }

    const targetCode = getEndpointRejectionCode(targetNode, 'target');
    if (targetCode) {
      issues.push({
        code: targetCode,
        edgeId: edge.id,
        message: `Edge \`${edge.id}\` targets invalid node ${describeNode(targetNode)}.`,
      });
    }

    if (isBlockedContainerChildEndpoint(index, sourceNode) || isBlockedContainerChildEndpoint(index, targetNode)) {
      issues.push({
        code: 'container-child-edge',
        edgeId: edge.id,
        message: `Edge \`${edge.id}\` cannot connect directly to a protected container child module.`,
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
    const nodeBehavior = getNodeBehavior(node.moduleType);
    const parentNode = node.containerId ? index.nodeMap.get(node.containerId) : undefined;
    const parentBehavior = parentNode ? getNodeBehavior(parentNode.moduleType) : null;
    const incomingCount = (index.reverseList.get(node.id) ?? []).length;
    const outgoingCount = (index.adjacencyList.get(node.id) ?? []).length;
    const policy = nodeBehavior.getConnectionPolicy();

    if (node.containerId) {
      if (!parentNode) {
        issues.push({
          code: 'missing-container',
          nodeId: node.id,
          message: `${describeNode(node)} references a missing container.`,
        });
      } else if (!parentBehavior?.isContainer() || !nodeBehavior.canBeNestedIn(parentBehavior)) {
        issues.push({
          code: 'invalid-container',
          nodeId: node.id,
          message: `${describeNode(node)} is nested under an invalid container.`,
        });
      }
    }

    const nestedInImplicitContainer = Boolean(parentBehavior?.usesImplicitChildExecution());
    if (!nestedInImplicitContainer && incomingCount < policy.minIncomingEdges) {
      issues.push({
        code: 'missing-inputs',
        nodeId: node.id,
        message:
          policy.minIncomingEdges === 1
            ? `${describeNode(node)} requires an incoming connection.`
            : `${describeNode(node)} requires at least ${policy.minIncomingEdges} incoming connections.`,
      });
    }

    if (Number.isFinite(policy.maxIncomingEdges) && incomingCount > policy.maxIncomingEdges) {
      issues.push({
        code: 'too-many-inputs',
        nodeId: node.id,
        message: `${describeNode(node)} supports at most ${policy.maxIncomingEdges} incoming connection${policy.maxIncomingEdges === 1 ? '' : 's'}.`,
      });
    }

    if (!policy.canSourceConnections && outgoingCount > 0) {
      issues.push({
        code: getEndpointRejectionCode(node, 'source') ?? 'invalid-source',
        nodeId: node.id,
        message: `${describeNode(node)} cannot be used as a source node.`,
      });
    }

    if (nodeBehavior.isContainer() && (containerChildren.get(node.id)?.length ?? 0) === 0) {
      issues.push({
        code: 'empty-container',
        nodeId: node.id,
        message: `${describeNode(node)} does not contain any child modules.`,
      });
    }
  });

  return issues;
}
