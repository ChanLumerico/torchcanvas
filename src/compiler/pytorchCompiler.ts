import type { GraphModel, GraphNode } from '../domain/graph/types';
import { buildGraphIndex, getContainerChildren } from '../domain/graph/utils';
import { validateGraphForCompilation, type GraphValidationIssue } from '../domain/graph/validation';
import { getLayerDefinition } from '../domain/layers';
import { getParamSpec, sanitizePythonIdentifier, serializePythonValue } from './pythonSerializer';

interface InputBinding {
  signature: string;
  fallbackExpression: string;
  variableByNodeId: Map<string, string>;
  orderedInputNodes: GraphNode[];
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

function getOrderedInputNodes(graph: GraphModel, topologicalOrder?: string[]): GraphNode[] {
  if (!topologicalOrder) {
    return graph.nodes.filter((node) => node.moduleType === 'Input');
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  return topologicalOrder
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is GraphNode => node?.moduleType === 'Input');
}

function createInputBinding(graph: GraphModel, topologicalOrder?: string[]): InputBinding {
  const inputNodes = getOrderedInputNodes(graph, topologicalOrder);
  const variableByNodeId = new Map<string, string>();

  if (inputNodes.length === 0) {
    return {
      signature: '*args',
      fallbackExpression: 'args[0]',
      variableByNodeId,
      orderedInputNodes: [],
    };
  }

  if (inputNodes.length === 1) {
    variableByNodeId.set(inputNodes[0].id, 'x');
    return {
      signature: 'x',
      fallbackExpression: 'x',
      variableByNodeId,
      orderedInputNodes: inputNodes,
    };
  }

  const usedIdentifiers = new Set<string>();
  const args = inputNodes.map((node, index) => {
    const baseName = sanitizePythonIdentifier(node.attributeName, `input_${index + 1}`);
    const argumentName = ensureUniqueIdentifier(baseName, usedIdentifiers);
    variableByNodeId.set(node.id, argumentName);
    return argumentName;
  });

  return {
    signature: args.join(', '),
    fallbackExpression: args[0],
    variableByNodeId,
    orderedInputNodes: inputNodes,
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
  if (node.moduleType === 'Concat') {
    const concatInputs = sourceVars.length > 0 ? sourceVars : [fallbackExpression];
    const concatDim = node.params.dim ?? 1;
    return `torch.cat((${concatInputs.join(', ')}), dim=${concatDim})`;
  }

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

function createDummyInputExpression(node: GraphNode): string {
  const shape =
    typeof node.params.shape === 'string' && node.params.shape.length > 0
      ? node.params.shape
      : '[B, 3, 224, 224]';

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

function createModelCallExpression(inputBinding: InputBinding): string {
  if (inputBinding.orderedInputNodes.length === 0) {
    return 'model(inputs)';
  }

  const args = inputBinding.orderedInputNodes
    .map((node) => inputBinding.variableByNodeId.get(node.id))
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
  const containerChildren = getContainerChildren(graph, index.topologicalOrder);
  const inputBinding = createInputBinding(graph, index.topologicalOrder);

  let initCode = '';
  let forwardCode = '';
  let layerCounter = 1;
  let variableCounter = 1;

  const nodeToLayerName = new Map<string, string>();
  const nodeToVarName = new Map(inputBinding.variableByNodeId);
  const nodeInitExpression = new Map<string, string>();
  const usedLayerIdentifiers = new Set<string>();
  const processedSequentials = new Set<string>();
  const outputVariables: string[] = [];

  graph.nodes.forEach((node) => {
    if (
      node.moduleType === 'Input' ||
      node.moduleType === 'Output' ||
      node.moduleType === 'Concat' ||
      getLayerDefinition(node.moduleType).kind === 'container'
    ) {
      return;
    }

    nodeInitExpression.set(node.id, createLayerInitExpression(node));
  });

  index.topologicalOrder.forEach((nodeId) => {
    const node = index.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    if (node.moduleType === 'Input' || node.moduleType === 'Output' || node.moduleType === 'Concat') {
      return;
    }

    if (getLayerDefinition(node.moduleType).kind === 'container') {
      const childrenIds = containerChildren.get(node.id) ?? [];
      const childrenExpressions = childrenIds
        .map((childId) => nodeInitExpression.get(childId))
        .filter((expression): expression is string => typeof expression === 'string');

      const layerName = createModuleAttributeName(
        node,
        `${node.moduleType.toLowerCase()}_${layerCounter++}`,
        usedLayerIdentifiers,
      );
      nodeToLayerName.set(node.id, layerName);

      if (node.moduleType === 'Sequential') {
        initCode += childrenExpressions.length
          ? `        ${layerName} = nn.Sequential(\n            ${childrenExpressions.join(',\n            ')}\n        )\n`
          : `        ${layerName} = nn.Sequential()\n`;
        return;
      }

      if (node.moduleType === 'ModuleList') {
        initCode += childrenExpressions.length
          ? `        ${layerName} = nn.ModuleList([\n            ${childrenExpressions.join(',\n            ')}\n        ])\n`
          : `        ${layerName} = nn.ModuleList([])\n`;
        return;
      }

      const dictEntries = childrenIds
        .map((childId, indexWithinParent) => {
          const child = index.nodeMap.get(childId);
          const expression = nodeInitExpression.get(childId);
          if (!child || !expression) {
            return null;
          }

          const key = sanitizePythonIdentifier(
            child.attributeName,
            `${child.moduleType.toLowerCase()}_${indexWithinParent + 1}`,
          );
          return `'${key}': ${expression}`;
        })
        .filter((entry): entry is string => typeof entry === 'string');

      initCode += dictEntries.length
        ? `        ${layerName} = nn.ModuleDict({\n            ${dictEntries.join(',\n            ')}\n        })\n`
        : `        ${layerName} = nn.ModuleDict({})\n`;
      return;
    }

    if (!node.containerId) {
      const layerName = createModuleAttributeName(
        node,
        `${node.moduleType.toLowerCase()}_${layerCounter++}`,
        usedLayerIdentifiers,
      );
      nodeToLayerName.set(node.id, layerName);
      initCode += `        ${layerName} = ${nodeInitExpression.get(node.id)}\n`;
    }
  });

  let fallbackReturnVariable = inputBinding.fallbackExpression;

  index.topologicalOrder.forEach((nodeId) => {
    const node = index.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    if (node.moduleType === 'Input') {
      return;
    }

    if (node.moduleType === 'Output') {
      const sources = index.reverseList.get(node.id) ?? [];
      const resolvedSourceVars = sources
        .map((sourceId) => nodeToVarName.get(sourceId))
        .filter((value): value is string => typeof value === 'string');

      if (resolvedSourceVars.length === 1) {
        outputVariables.push(resolvedSourceVars[0]);
      } else if (resolvedSourceVars.length > 1) {
        outputVariables.push(`(${resolvedSourceVars.join(', ')})`);
      }

      return;
    }

    const sources = index.reverseList.get(node.id) ?? [];
    const sourceVars = sources
      .map((sourceId) => nodeToVarName.get(sourceId))
      .filter((value): value is string => typeof value === 'string');

    if (node.containerId) {
      const parentNode = index.nodeMap.get(node.containerId);
      if (!parentNode) {
        return;
      }

      if (parentNode.moduleType === 'Sequential') {
        if (!processedSequentials.has(parentNode.id)) {
          processedSequentials.add(parentNode.id);
          const layerName = nodeToLayerName.get(parentNode.id);
          if (!layerName) {
            return;
          }

          const outputVar = `x${variableCounter++}`;
          const expression = createNodeForwardExpression(
            parentNode,
            layerName,
            sourceVars,
            inputBinding.fallbackExpression,
          );
          forwardCode += `        ${outputVar} = ${expression}\n`;
          nodeToVarName.set(parentNode.id, outputVar);
          fallbackReturnVariable = outputVar;

          (containerChildren.get(parentNode.id) ?? []).forEach((childId) => {
            nodeToVarName.set(childId, outputVar);
          });
        }

        return;
      }

      if (parentNode.moduleType === 'ModuleList') {
        const childIds = (containerChildren.get(parentNode.id) ?? []).filter((childId) => {
          const child = index.nodeMap.get(childId);
          return child?.moduleType !== 'Concat';
        });
        const childIndex = childIds.indexOf(node.id);
        const layerName = `${nodeToLayerName.get(parentNode.id)}[${childIndex}]`;
        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          inputBinding.fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;

        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
        return;
      }

      if (parentNode.moduleType === 'ModuleDict') {
        const key = sanitizePythonIdentifier(node.attributeName, node.moduleType.toLowerCase());
        const layerName = `${nodeToLayerName.get(parentNode.id)}['${key}']`;
        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          inputBinding.fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;

        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
        return;
      }
    }

    if (getLayerDefinition(node.moduleType).kind === 'container') {
      if (node.moduleType === 'Sequential' && !processedSequentials.has(node.id)) {
        processedSequentials.add(node.id);
        const layerName = nodeToLayerName.get(node.id);
        if (!layerName) {
          return;
        }

        const outputVar = `x${variableCounter++}`;
        const expression = createNodeForwardExpression(
          node,
          layerName,
          sourceVars,
          inputBinding.fallbackExpression,
        );
        forwardCode += `        ${outputVar} = ${expression}\n`;
        nodeToVarName.set(node.id, outputVar);
        fallbackReturnVariable = outputVar;
      }

      return;
    }

    if (node.moduleType === 'Concat') {
      const outputVar = `x${variableCounter++}`;
      const expression = createNodeForwardExpression(
        node,
        'torch.cat',
        sourceVars,
        inputBinding.fallbackExpression,
      );
      forwardCode += `        ${outputVar} = ${expression}\n`;
      nodeToVarName.set(node.id, outputVar);
      fallbackReturnVariable = outputVar;
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
      inputBinding.fallbackExpression,
    );
    forwardCode += `        ${outputVar} = ${expression}\n`;
    nodeToVarName.set(node.id, outputVar);
    fallbackReturnVariable = outputVar;
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
    def forward(self, ${inputBinding.signature}):
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

  const inputBinding = graph ? createInputBinding(graph, buildGraphIndex(graph).topologicalOrder) : null;
  const dummyInputLines =
    graph && inputBinding && inputBinding.orderedInputNodes.length > 0
      ? inputBinding.orderedInputNodes
          .map((node) => {
            const variableName = inputBinding.variableByNodeId.get(node.id);
            if (!variableName) {
              return null;
            }

            return `${variableName} = ${createDummyInputExpression(node)}`;
          })
          .filter((line): line is string => typeof line === 'string')
      : ['inputs = torch.randn(32, 3, 224, 224).to(device)'];
  const modelCall = inputBinding ? createModelCallExpression(inputBinding) : 'model(inputs)';

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
