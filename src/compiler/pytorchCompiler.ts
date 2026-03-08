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
  
  const nodeToLayerName = new Map<string, string>();
  const nodeToVarName = new Map<string, string>();
  const nodeInitExpr = new Map<string, string>();

  let layerCounter = 1;
  let varCounter = 1;
  let finalOutputVar = inputName;

  inputNodes.forEach(n => {
    nodeToVarName.set(n.id, inputName);
  });

  // 1. Precompute container children in topological order
  const containerChildren = new Map<string, string[]>();
  sortedNodeIds.forEach(id => {
    const node = nodes.find(n => n.id === id)!;
    if (node.parentNode) {
      if (!containerChildren.has(node.parentNode)) containerChildren.set(node.parentNode, []);
      containerChildren.get(node.parentNode)!.push(id);
    }
  });

  // 2. Precompute basic initialization expressions for all base layers
  nodes.forEach(node => {
    if (node.data.type === 'Input' || node.data.type === 'Output') return;
    if (['Sequential', 'ModuleList', 'ModuleDict'].includes(node.data.type)) return;
    
    if (node.data.type === 'Concat') {
      nodeInitExpr.set(node.id, 'CONCAT'); // Special placeholder
      return;
    }

    const args = Object.entries(node.data.params).map(([k, v]) => {
      if (typeof v === 'string') {
        if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('(') && v.endsWith(')'))) return `${k}=${v}`;
        return `${k}='${v}'`;
      }
      return `${k}=${v}`;
    }).join(', ');
    
    nodeInitExpr.set(node.id, `nn.${node.data.type}(${args})`);
  });

  // 3. Generate __init__ block
  sortedNodeIds.forEach(id => {
    const node = nodes.find(n => n.id === id)!;
    if (node.data.type === 'Input' || node.data.type === 'Output' || node.data.type === 'Concat') return;

    if (['Sequential', 'ModuleList', 'ModuleDict'].includes(node.data.type)) {
      const childrenIds = containerChildren.get(id) || [];
      const childrenExprs = childrenIds.map(cid => nodeInitExpr.get(cid) || 'pass').filter(expr => expr !== 'CONCAT');
      
      const layerName = `self.${node.data.attributeName || `${node.data.type.toLowerCase()}_${layerCounter++}`}`;
      nodeToLayerName.set(id, layerName);

      if (node.data.type === 'Sequential') {
        initCode += `        ${layerName} = nn.Sequential(\n            ${childrenExprs.join(',\n            ')}\n        )\n`;
      } else if (node.data.type === 'ModuleList') {
        initCode += `        ${layerName} = nn.ModuleList([\n            ${childrenExprs.join(',\n            ')}\n        ])\n`;
      } else if (node.data.type === 'ModuleDict') {
        const dictEntries = childrenIds.map(cid => {
            const cNode = nodes.find(n => n.id === cid)!;
            return `'${cNode.data.attributeName}': ${nodeInitExpr.get(cid)}`;
        }).filter(expr => !expr.endsWith('CONCAT'));
        initCode += `        ${layerName} = nn.ModuleDict({\n            ${dictEntries.join(',\n            ')}\n        })\n`;
      }
    } else if (!node.parentNode) {
      const layerName = `self.${node.data.attributeName || `${node.data.type.toLowerCase()}_${layerCounter++}`}`;
      nodeToLayerName.set(id, layerName);
      initCode += `        ${layerName} = ${nodeInitExpr.get(id)}\n`;
    }
  });

  // 4. Generate forward pass block
  const processedSequentials = new Set<string>();

  sortedNodeIds.forEach(nodeId => {
    const node = nodes.find(n => n.id === nodeId)!;
    
    if (node.data.type === 'Input') return;
    
    if (node.data.type === 'Output') {
      const srcs = reverseList.get(nodeId) || [];
      if (srcs.length > 0) finalOutputVar = nodeToVarName.get(srcs[0]) || inputName;
      return;
    }

    const sources = reverseList.get(nodeId) || [];
    const sourceVars = sources.map(src => nodeToVarName.get(src)).filter(Boolean) as string[];

    // If node is a child of a Container
    if (node.parentNode) {
      const parent = nodes.find(n => n.id === node.parentNode)!;
      
      if (parent.data.type === 'Sequential') {
        if (!processedSequentials.has(parent.id)) {
          processedSequentials.add(parent.id);
          const layerName = nodeToLayerName.get(parent.id);
          const outVar = `x${varCounter++}`;
          const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName;
          forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;
          
          nodeToVarName.set(parent.id, outVar);
          const childrenIds = containerChildren.get(parent.id) || [];
          childrenIds.forEach(cid => nodeToVarName.set(cid, outVar));
          finalOutputVar = outVar;
        }
        return; // Skip individual forward for Sequential children
      } else if (parent.data.type === 'ModuleList') {
        const idx = (containerChildren.get(parent.id) || []).filter(cid => nodes.find(n=>n.id===cid)?.data.type !== 'Concat').indexOf(nodeId);
        const layerName = nodeToLayerName.get(parent.id) + `[${idx}]`;
        const outVar = `x${varCounter++}`;
        const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName;
        // Concat inside ModuleList is edge case, handle safely
        if (node.data.type === 'Concat') {
           const dim = node.data.params.dim !== undefined ? node.data.params.dim : 1;
           forwardCode += `        ${outVar} = torch.cat((${sourceVars.join(', ')}), dim=${dim})\n`;
        } else {
           forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;
        }
        nodeToVarName.set(nodeId, outVar);
        finalOutputVar = outVar;
        return;
      } else if (parent.data.type === 'ModuleDict') {
        const layerName = nodeToLayerName.get(parent.id) + `['${node.data.attributeName}']`;
        const outVar = `x${varCounter++}`;
        const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName;
        if (node.data.type === 'Concat') {
           const dim = node.data.params.dim !== undefined ? node.data.params.dim : 1;
           forwardCode += `        ${outVar} = torch.cat((${sourceVars.join(', ')}), dim=${dim})\n`;
        } else {
           forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;
        }
        nodeToVarName.set(nodeId, outVar);
        finalOutputVar = outVar;
        return;
      }
    }

    // Top-level containers (with no children connected locally, or fully encapsulated)
    if (['Sequential', 'ModuleList', 'ModuleDict'].includes(node.data.type)) {
      if (node.data.type === 'Sequential' && !processedSequentials.has(node.id)) {
        processedSequentials.add(node.id);
        const layerName = nodeToLayerName.get(node.id);
        const outVar = `x${varCounter++}`;
        const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName;
        forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;
        nodeToVarName.set(node.id, outVar);
        finalOutputVar = outVar;
      }
      return; 
    }

    // Top-level Combinatorial
    if (node.data.type === 'Concat') {
      const outVar = `x${varCounter++}`;
      const dim = node.data.params.dim !== undefined ? node.data.params.dim : 1;
      forwardCode += `        ${outVar} = torch.cat((${sourceVars.join(', ')}), dim=${dim})\n`;
      nodeToVarName.set(nodeId, outVar);
      return;
    }

    // Top-level Layer
    const layerName = nodeToLayerName.get(nodeId);
    const outVar = `x${varCounter++}`;
    const inVar = sourceVars.length > 0 ? sourceVars[0] : inputName;
    forwardCode += `        ${outVar} = ${layerName}(${inVar})\n`;

    nodeToVarName.set(nodeId, outVar);
    finalOutputVar = outVar;
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
