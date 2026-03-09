import type { GraphModel, GraphNode, ModelInputBinding } from '../domain/graph/types';
import { BoundaryResolver } from '../domain/graph/BoundaryResolver';
import { buildGraphIndex, getContainerChildren } from '../domain/graph/utils';
import { validateGraphForCompilation, type GraphValidationIssue } from '../domain/graph/validation';
import { getLayerDefinition } from '../domain/layers';
import { getNodeBehavior } from '../domain/nodes';
import { getParamSpec, sanitizePythonIdentifier, serializePythonValue } from './pythonSerializer';

interface RootBinding {
  signature: string;
  fallbackExpression: string;
  variableByNodeId: Map<string, string>;
  orderedRootNodes: GraphNode[];
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

  const uniqueIdentifier = `${base}_${suffix}`;
  usedIdentifiers.add(uniqueIdentifier);
  return uniqueIdentifier;
}

function createRootBinding(graph: GraphModel): RootBinding {
  const rootNodes = new BoundaryResolver(graph).getExecutableBoundaries().roots;
  const variableByNodeId = new Map<string, string>();

  if (rootNodes.length === 0) {
    return {
      signature: 'x',
      fallbackExpression: 'x',
      variableByNodeId,
      orderedRootNodes: [],
    };
  }

  if (rootNodes.length === 1) {
    const rootNode = rootNodes[0];
    const binding = graph.inputsByNodeId[rootNode.id];
    const argumentName = sanitizePythonIdentifier(
      binding?.argumentName || rootNode.attributeName,
      'x',
    );
    variableByNodeId.set(rootNode.id, argumentName);
    return {
      signature: argumentName,
      fallbackExpression: argumentName,
      variableByNodeId,
      orderedRootNodes: rootNodes,
    };
  }

  const usedIdentifiers = new Set<string>();
  const args = rootNodes.map((node, index) => {
    const binding = graph.inputsByNodeId[node.id];
    const baseName = sanitizePythonIdentifier(
      binding?.argumentName || node.attributeName,
      `input_${index + 1}`,
    );
    const argumentName = ensureUniqueIdentifier(baseName, usedIdentifiers);
    variableByNodeId.set(node.id, argumentName);
    return argumentName;
  });

  return {
      signature: args.join(', '),
      fallbackExpression: args[0],
      variableByNodeId,
      orderedRootNodes: rootNodes,
    };
}

function createLayerInitExpression(node: GraphNode): string {
  const definition = getLayerDefinition(node.moduleType);
  const args = Object.entries(node.params)
    .map(([paramKey, paramValue]) => {
      const spec = getParamSpec(node.moduleType, paramKey);
      return `${paramKey}=${serializePythonValue(paramValue, spec ?? definition.paramSpecs[paramKey])}`;
    })
    .join(', ');

  return args.length > 0 ? `nn.${node.moduleType}(${args})` : `nn.${node.moduleType}()`;
}

function createContainerInitExpression(
  graph: GraphModel,
  nodeId: string,
  index: ReturnType<typeof buildGraphIndex>,
  containerChildren: ReturnType<typeof getContainerChildren>,
  expressionCache: Map<string, string>,
): string | null {
  const cachedExpression = expressionCache.get(nodeId);
  if (cachedExpression) {
    return cachedExpression;
  }

  const node = index.nodeMap.get(nodeId);
  if (!node) {
    return null;
  }

  const nodeBehavior = getNodeBehavior(node.moduleType);
  if (!nodeBehavior.isContainer()) {
    const layerExpression = createLayerInitExpression(node);
    expressionCache.set(nodeId, layerExpression);
    return layerExpression;
  }

  const childIds = containerChildren.get(nodeId) ?? [];
  const childExpressions = childIds
    .map((childId) => createContainerInitExpression(graph, childId, index, containerChildren, expressionCache))
    .filter((expression): expression is string => typeof expression === 'string');

  let expression: string;
  if (nodeBehavior.getCompilerKind() === 'sequential') {
    expression = childExpressions.length
      ? `nn.Sequential(\n            ${childExpressions.join(',\n            ')}\n        )`
      : 'nn.Sequential()';
  } else if (nodeBehavior.getCompilerKind() === 'module-list') {
    expression = childExpressions.length
      ? `nn.ModuleList([\n            ${childExpressions.join(',\n            ')}\n        ])`
      : 'nn.ModuleList([])';
  } else {
    const dictEntries = childIds
      .map((childId, indexWithinParent) => {
        const childNode = index.nodeMap.get(childId);
        const childExpression = createContainerInitExpression(
          graph,
          childId,
          index,
          containerChildren,
          expressionCache,
        );
        if (!childNode || !childExpression) {
          return null;
        }

        const key = sanitizePythonIdentifier(
          childNode.attributeName,
          `${childNode.moduleType.toLowerCase()}_${indexWithinParent + 1}`,
        );
        return `'${key}': ${childExpression}`;
      })
      .filter((entry): entry is string => typeof entry === 'string');

    expression = dictEntries.length
      ? `nn.ModuleDict({\n            ${dictEntries.join(',\n            ')}\n        })`
      : 'nn.ModuleDict({})';
  }

  expressionCache.set(nodeId, expression);
  return expression;
}

function createModuleAttributeName(
  node: GraphNode,
  fallbackBase: string,
  usedIdentifiers: Set<string>,
): string {
  const sanitized = sanitizePythonIdentifier(node.attributeName, fallbackBase);
  return `self.${ensureUniqueIdentifier(sanitized, usedIdentifiers)}`;
}

function createOutputReturn(outputVariables: string[], fallbackVariable: string): string {
  if (outputVariables.length === 0) {
    return fallbackVariable;
  }

  if (outputVariables.length === 1) {
    return outputVariables[0];
  }

  return `(${outputVariables.join(', ')})`;
}

function createNodeForwardExpression(
  node: GraphNode,
  layerExpression: string,
  sourceVars: string[],
  fallbackExpression: string,
): string {
  if (node.moduleType === 'Bilinear') {
    const leftInput = sourceVars[0] ?? fallbackExpression;
    const rightInput = sourceVars[1] ?? fallbackExpression;
    return `${layerExpression}(${leftInput}, ${rightInput})`;
  }

  const primaryInput = sourceVars[0] ?? fallbackExpression;
  return `${layerExpression}(${primaryInput})`;
}

function parseShapeTokens(shape: string): string[] {
  return shape
    .replace(/[[\]()]/g, '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function createDummyInputExpression(binding: ModelInputBinding): string {
  const shape = binding.shape.length > 0 ? binding.shape : '[B, 3, 224, 224]';

  const dimensions = parseShapeTokens(shape).map((token, index) => {
    const normalized = token.toLowerCase();
    if (/^\d+$/.test(token)) {
      return token;
    }

    if (index === 0 || normalized === 'b' || normalized === 'n' || normalized === 'batch') {
      return '32';
    }

    return '1';
  });

  const resolvedDimensions = dimensions.length > 0 ? dimensions.join(', ') : '32, 3, 224, 224';
  return `torch.randn(${resolvedDimensions}).to(device)`;
}

function createModelCallExpression(rootBinding: RootBinding): string {
  if (rootBinding.orderedRootNodes.length === 0) {
    return 'model(x)';
  }

  const args = rootBinding.orderedRootNodes
    .map((node) => rootBinding.variableByNodeId.get(node.id))
    .filter((value): value is string => typeof value === 'string');

  return `model(${args.join(', ')})`;
}

function createValidationSummary(issues: GraphValidationIssue[]): string {
  return issues.map((issue) => `# - ${issue.message}`).join('\n');
}

function createInvalidGraphModelCode(modelName: string, issues: GraphValidationIssue[]): string {
  const summary = createValidationSummary(issues);

  return `import torch
import torch.nn as nn

# TorchCanvas graph validation failed.
${summary}
#
# Fix the graph in TorchCanvas before exporting this model.

class ${modelName}(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, *args):
        raise RuntimeError("TorchCanvas graph validation failed. Fix the graph before exporting code.")`;
}

function createInvalidGraphTrainCode(modelName: string, issues: GraphValidationIssue[]): string {
  const summary = createValidationSummary(issues);

  return `import torch
import torch.nn as nn
import torch.optim as optim
from generated_model import ${modelName}

# TorchCanvas graph validation failed.
${summary}
#
# Fix the graph in TorchCanvas before exporting this training template.

raise RuntimeError("TorchCanvas graph validation failed. Fix the graph before exporting code.")`;
}

function createMissingInputShapeTrainCode(
  modelName: string,
  missingBindings: Array<{ node: GraphNode; binding: ModelInputBinding | undefined }>,
): string {
  const summary = missingBindings
    .map(({ node }) => `# - ${node.moduleType} \`${node.attributeName}\` is missing an input shape.`)
    .join('\n');

  return `import torch
import torch.nn as nn
import torch.optim as optim
from generated_model import ${modelName}

# TorchCanvas could not generate a training template because one or more root modules
# do not have input shapes configured in the Model Properties panel.
${summary}

raise RuntimeError("Configure root input shapes in the Inspector before exporting train.py.")`;
}

export function generatePytorchCode(graph: GraphModel): string {
  const safeModelName = sanitizePythonIdentifier(graph.modelName, 'GeneratedModel');

  if (graph.nodes.length === 0) {
    return `import torch
import torch.nn as nn

class ${safeModelName}(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return x`;
  }

  const validationIssues = validateGraphForCompilation(graph);
  if (validationIssues.length > 0) {
    return createInvalidGraphModelCode(safeModelName, validationIssues);
  }

  const index = buildGraphIndex(graph);
  const containerChildren = getContainerChildren(graph);
  const boundaryResolver = new BoundaryResolver(graph);
  const boundaries = boundaryResolver.getExecutableBoundaries();
  const rootBinding = createRootBinding(graph);

  let initCode = '';
  let forwardCode = '';
  let layerCounter = 1;
  let variableCounter = 1;

  const nodeToLayerName = new Map<string, string>();
  const nodeToVarName = new Map(rootBinding.variableByNodeId);
  const nodeInitExpression = new Map<string, string>();
  const usedLayerIdentifiers = new Set<string>();
  const processedImplicitContainers = new Set<string>();
  const outputVariables: string[] = [];

  index.topologicalOrder.forEach((nodeId) => {
    const node = index.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const parentNode = node.containerId ? index.nodeMap.get(node.containerId) : undefined;
    const parentBehavior = parentNode ? getNodeBehavior(parentNode.moduleType) : null;
    if (parentBehavior && (parentBehavior.usesImplicitChildExecution() || parentBehavior.getCompilerKind() === 'module-list' || parentBehavior.getCompilerKind() === 'module-dict')) {
      return;
    }

    const layerExpression = createContainerInitExpression(
      graph,
      node.id,
      index,
      containerChildren,
      nodeInitExpression,
    );
    if (!layerExpression) {
      return;
    }

    const layerName = createModuleAttributeName(
      node,
      `${node.moduleType.toLowerCase()}_${layerCounter++}`,
      usedLayerIdentifiers,
    );
    nodeToLayerName.set(node.id, layerName);
    initCode += `        ${layerName} = ${layerExpression}\n`;
  });

  let fallbackReturnVariable = rootBinding.fallbackExpression;

  index.topologicalOrder.forEach((nodeId) => {
    const node = index.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const sources = index.reverseList.get(node.id) ?? [];
    const sourceVars = sources
      .map((sourceId) => nodeToVarName.get(sourceId))
      .filter((value): value is string => typeof value === 'string');
    const fallbackExpression =
      rootBinding.variableByNodeId.get(node.id) ?? rootBinding.fallbackExpression;

    if (node.containerId) {
      const parentNode = index.nodeMap.get(node.containerId);
      if (!parentNode) {
        return;
      }
      const parentBehavior = getNodeBehavior(parentNode.moduleType);

      if (parentBehavior.usesImplicitChildExecution()) {
        return;
      }

      if (parentBehavior.getCompilerKind() === 'module-list') {
        const childIds = containerChildren.get(parentNode.id) ?? [];
        const childIndex = childIds.indexOf(node.id);
        const layerName = `${nodeToLayerName.get(parentNode.id)}[${childIndex}]`;
        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;

        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
        return;
      }

      if (parentBehavior.getCompilerKind() === 'module-dict') {
        const key = sanitizePythonIdentifier(node.attributeName, node.moduleType.toLowerCase());
        const layerName = `${nodeToLayerName.get(parentNode.id)}['${key}']`;
        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;

        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
        return;
      }
    }

    const nodeBehavior = getNodeBehavior(node.moduleType);
    if (nodeBehavior.isContainer()) {
      if (nodeBehavior.isCallable() && nodeBehavior.usesImplicitChildExecution() && !processedImplicitContainers.has(node.id)) {
        processedImplicitContainers.add(node.id);
        const layerName = nodeToLayerName.get(node.id);
        if (!layerName) {
          return;
        }

        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;
        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
        (containerChildren.get(node.id) ?? []).forEach((childId) => {
          nodeToVarName.set(childId, outputVar);
        });
      }

      return;
    }

    const layerName = nodeToLayerName.get(node.id);
    if (!layerName) {
      return;
    }

    const outputVar = `x${variableCounter++}`;
    const expression = createNodeForwardExpression(
      node,
      layerName,
      sourceVars,
      fallbackExpression,
    );
    forwardCode += `        ${outputVar} = ${expression}\n`;
    nodeToVarName.set(node.id, outputVar);
    fallbackReturnVariable = outputVar;
  });

  boundaries.sinks.forEach((node) => {
    const outputVariable = nodeToVarName.get(node.id);
    if (outputVariable) {
      outputVariables.push(outputVariable);
    }
  });

  if (!initCode) {
    initCode = '        pass\n';
  }

  const returnExpression = createOutputReturn(outputVariables, fallbackReturnVariable);
  if (!forwardCode) {
    forwardCode = `        return ${returnExpression}\n`;
  } else {
    forwardCode += `        return ${returnExpression}\n`;
  }

  return `import torch
import torch.nn as nn

class ${safeModelName}(nn.Module):
    def __init__(self):
        super().__init__()
${initCode}
    def forward(self, ${rootBinding.signature}):
${forwardCode}`;
}

export function generateTrainTemplate(model: GraphModel | string = 'GeneratedModel'): string {
  const graph = typeof model === 'string' ? null : model;
  const modelName = typeof model === 'string' ? model : model.modelName;
  const safeModelName = sanitizePythonIdentifier(modelName, 'GeneratedModel');
  const validationIssues = graph ? validateGraphForCompilation(graph) : [];
  if (validationIssues.length > 0) {
    return createInvalidGraphTrainCode(safeModelName, validationIssues);
  }

  const rootBinding = graph ? createRootBinding(graph) : null;
  const missingRootShapes =
    graph && rootBinding
      ? rootBinding.orderedRootNodes
          .map((node) => ({
            node,
            binding: graph.inputsByNodeId[node.id],
          }))
          .filter(({ binding }) => !binding || binding.shape.trim().length === 0)
      : [];
  if (missingRootShapes.length > 0) {
    return createMissingInputShapeTrainCode(safeModelName, missingRootShapes);
  }
  const dummyInputLines =
    graph && rootBinding && rootBinding.orderedRootNodes.length > 0
      ? rootBinding.orderedRootNodes
          .map((node) => {
            const variableName = rootBinding.variableByNodeId.get(node.id);
            if (!variableName) {
              return null;
            }

            return `${variableName} = ${createDummyInputExpression(
              graph.inputsByNodeId[node.id] ?? {
                argumentName: variableName,
                shape: '',
              },
            )}`;
          })
          .filter((line): line is string => typeof line === 'string')
      : ['x = torch.randn(32, 3, 224, 224).to(device)'];
  const modelCall = rootBinding ? createModelCallExpression(rootBinding) : 'model(x)';

  return `import torch
import torch.nn as nn
import torch.optim as optim
from generated_model import ${safeModelName}

# 1. Initialize Model, Loss, and Optimizer
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = ${safeModelName}().to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# 2. Dummy Training Loop
def train():
    model.train()
    
    # Dummy data
    ${dummyInputLines.join('\n    ')}
    targets = torch.randint(0, 10, (32,)).to(device)
    
    optimizer.zero_grad()
    outputs = ${modelCall}
    outputs_for_loss = outputs[0] if isinstance(outputs, tuple) else outputs
    loss = criterion(outputs_for_loss, targets)
    
    loss.backward()
    optimizer.step()
    
    print(f"Training Loss: {loss.item():.4f}")

if __name__ == "__main__":
    train()`;
}
