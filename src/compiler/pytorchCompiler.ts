import type { NetworkNode, Edge } from '../store/workspaceStore';

export function generatePytorchCode(nodes: NetworkNode[], edges: Edge[], modelName: string = 'GeneratedModel'): string {
  const safeModelName = modelName.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedModel';

  if (nodes.length === 0) {
    return `import torch\nimport torch.nn as nn\n\nclass ${safeModelName}(nn.Module):\n    def __init__(self):\n        super().__init__()\n\n    def forward(self, x):\n        return x`;
  }

  const inputNodes = nodes.filter(n => n.data.type === 'Input');
  const inputName = inputNodes.length > 0 ? 'x' : '*args';

  // Build graphs
  const adjacencyList = new Map<string, string[]>(); // node -> targets
  const reverseList = new Map<string, string[]>(); // node -> sources
  const inDegree = new Map<string, number>();

  nodes.forEach(n => {
    adjacencyList.set(n.id, []);
    reverseList.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach(e => {
    if (adjacencyList.has(e.source) && inDegree.has(e.target)) {
      adjacencyList.get(e.source)!.push(e.target);
      reverseList.get(e.target)!.push(e.source);
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
    }
  });

  // Topological Sort via Kahn's Algorithm
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedNodeIds: string[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    sortedNodeIds.push(currId);

    adjacencyList.get(currId)?.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // Code Generation State
  let initCode = ``;
  let forwardCode = ``;
  
  // Maps a node ID to its initialized layer variable name (e.g. self.layer_1)
  const nodeToLayerName = new Map<string, string>();
  // Maps a node ID to the variable holding its output tensor (e.g. x2)
  const nodeToVarName = new Map<string, string>();

  let layerCounter = 1;
  let varCounter = 1;
  let finalOutputVar = inputName;

  inputNodes.forEach(n => {
    nodeToVarName.set(n.id, inputName);
  });

  sortedNodeIds.forEach(nodeId => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const { type, params } = node.data;

    // Inputs are predefined in the mapping above
    if (type === 'Input') return; 
    
    // Output nodes just mark the end of the line
    if (type === 'Output') {
      const sources = reverseList.get(nodeId) || [];
      if (sources.length > 0) {
        finalOutputVar = nodeToVarName.get(sources[0]) || inputName;
      }
      return;
    }

    // Determine incoming tensor variable(s)
    const sources = reverseList.get(nodeId) || [];
    const sourceVars = sources.map(src => nodeToVarName.get(src)).filter(Boolean) as string[];

    // Special handling for combinatorial nodes
    if (type === 'Concat') {
      const outVar = `x${varCounter++}`;
      const dim = params.dim !== undefined ? params.dim : 1;
      forwardCode += `        ${outVar} = torch.cat((${sourceVars.join(', ')}), dim=${dim})\n`;
      nodeToVarName.set(nodeId, outVar);
      return;
    }

    // Regular layer instantiations
    const args = Object.entries(params)
      .map(([k, v]) => {
        if (typeof v === 'string') {
          // If it looks like a list/tuple literal [1, 2] or (1, 2), don't quote it
          if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('(') && v.endsWith(')'))) {
            return `${k}=${v}`;
          }
          return `${k}='${v}'`;
        }
        return `${k}=${v}`;
      })
      .join(', ');

    const layerName = `self.${node.data.attributeName || `${type.toLowerCase()}_${layerCounter++}`}`;
    nodeToLayerName.set(nodeId, layerName);

    initCode += `        ${layerName} = nn.${type}(${args})\n`;

    // Forward pass generation
    const outVar = `x${varCounter++}`;
    const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName; // Fallback to x if disconnected
    forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;

    nodeToVarName.set(nodeId, outVar);
    finalOutputVar = outVar; // keep tracking the last generated variable
  });

  if (!initCode) initCode = `        pass\n`;
  if (!forwardCode) forwardCode = `        return ${inputName}\n`;
  else forwardCode += `        return ${finalOutputVar}\n`;

  return `import torch
import torch.nn as nn

class ${safeModelName}(nn.Module):
    def __init__(self):
        super().__init__()
${initCode}
    def forward(self, ${inputName}):
${forwardCode}`;
}

export function generateTrainTemplate(modelName: string = 'GeneratedModel'): string {
  const safeModelName = modelName.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedModel';

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
    inputs = torch.randn(32, 3, 224, 224).to(device)
    targets = torch.randint(0, 10, (32,)).to(device)
    
    optimizer.zero_grad()
    outputs = model(inputs)
    loss = criterion(outputs, targets)
    
    loss.backward()
    optimizer.step()
    
    print(f"Training Loss: {loss.item():.4f}")

if __name__ == "__main__":
    train()`;
}
