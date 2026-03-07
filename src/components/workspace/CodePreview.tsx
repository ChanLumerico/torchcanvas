import { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { NetworkNode, Edge } from '../../store/workspaceStore';
import { Copy, Terminal } from 'lucide-react';

// Very basic topological sort for dummy code generation
function generatePytorchCode(nodes: NetworkNode[], edges: Edge[]) {
  if (nodes.length === 0) {
    return `import torch
import torch.nn as nn

class GeneratedModel(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, x):
        return x`;
  }

  // Find Input nodes
  const inputNodes = nodes.filter(n => n.data.type === 'Input');
  const inputName = inputNodes.length > 0 ? 'x' : '*args';

  let initCode = ``;
  let forwardCode = ``;

  // Sort nodes topologically (very naive for linear chains)
  const adjacencyList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach(n => {
    adjacencyList.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach(e => {
    if (adjacencyList.has(e.source) && inDegree.has(e.target)) {
      adjacencyList.get(e.source)!.push(e.target);
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedNodes: NetworkNode[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    const node = nodes.find(n => n.id === currId);
    if (node) sortedNodes.push(node);

    adjacencyList.get(currId)?.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // Now generate PyTorch syntax based on the sorted layers
  const definedLayers: string[] = [];
  let layerIdx = 1;

  sortedNodes.forEach(node => {
    const { type, params } = node.data;

    if (type === 'Input' || type === 'Output' || type === 'Concat') return; // Ignore pure routing/shapes for now

    const args = Object.entries(params).map(([k, v]) => `${k}=${typeof v === 'string' ? v : v}`).join(', ');
    const layerName = `self.layer${layerIdx}`;
    
    initCode += `        ${layerName} = nn.${type}(${args})\n`;
    forwardCode += `        x = ${layerName}(x)\n`;
    
    definedLayers.push(layerName);
    layerIdx++;
  });

  if (!initCode) initCode = `        pass\n`;
  if (!forwardCode) forwardCode = `        return ${inputName}\n`;
  else forwardCode += `        return x\n`;

  return `import torch
import torch.nn as nn

class GeneratedModel(nn.Module):
    def __init__(self):
        super().__init__()
${initCode}
    def forward(self, ${inputName}):
${forwardCode}`;
}

export default function CodePreview() {
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);

  const generatedCode = useMemo(() => generatePytorchCode(nodes, edges), [nodes, edges]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
  };

  return (
    <footer className="h-48 border-t border-border/80 bg-panel/95 font-mono text-xs overflow-hidden z-20 shadow-[0_-15px_40px_rgba(0,0,0,0.3)] flex flex-col">
      <div className="flex items-center justify-between px-5 py-2 border-b border-border/40 bg-black/20 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-textMuted font-semibold">generated_model.py</span>
        </div>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-textMuted hover:text-white transition-colors hover:bg-white/10 px-2.5 py-1.5 rounded-md"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy code
        </button>
      </div>
      <div className="p-5 overflow-y-auto flex-1 bg-[#090D14]">
        <pre className="text-orange-300/90 leading-[1.6] font-mono whitespace-pre-wrap">
          <code dangerouslySetInnerHTML={{ __html: highlightSyntax(generatedCode) }} />
        </pre>
      </div>
    </footer>
  );
}

// Ultra basic syntax highlighter for visualization
function highlightSyntax(code: string) {
  let hl = code
    .replace(/(import|class|def|super|return)/g, '<span class="text-fuchsia-400 font-bold">$1</span>')
    .replace(/(nn|torch|torch\.nn)/g, '<span class="text-teal-400">$1</span>')
    .replace(/(self\.[\w]+)/g, '<span class="text-orange-300">$1</span>')
    .replace(/(Conv2d|Linear|ReLU|BatchNorm2d|MaxPool2d)/g, '<span class="text-amber-300">$1</span>')
    .replace(/(__init__|forward)/g, '<span class="text-orange-400">$1</span>');
  return hl;
}
