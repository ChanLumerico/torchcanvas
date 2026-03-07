import { useState, useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { NetworkNode, Edge } from '../../store/workspaceStore';
import { Copy, Download, FileCode2, Play, Maximize2, Minimize2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import clsx from 'clsx';

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

    const args = Object.entries(params).map(([k, v]) => `${k}=${typeof v === 'string' ? "'" + v + "'" : v}`).join(', ');
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

function generateTrainTemplate() {
  return `import torch
import torch.nn as nn
import torch.optim as optim
from generated_model import GeneratedModel

# 1. Initialize Model, Loss, and Optimizer
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = GeneratedModel().to(device)

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

type TabType = 'model' | 'train';

export default function CodePreview() {
  const nodes = useWorkspaceStore((state) => state.nodes);
  const edges = useWorkspaceStore((state) => state.edges);
  const [activeTab, setActiveTab] = useState<TabType>('model');
  const [isExpanded, setIsExpanded] = useState(false);

  const modelCode = useMemo(() => generatePytorchCode(nodes, edges), [nodes, edges]);
  const trainCode = useMemo(() => generateTrainTemplate(), []);

  const activeCode = activeTab === 'model' ? modelCode : trainCode;
  const activeFileName = activeTab === 'model' ? 'generated_model.py' : 'train.py';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
  };

  const handleDownload = () => {
    const blob = new Blob([activeCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <footer 
      className={clsx(
        "border-t border-border/80 bg-[#1E1E1E] font-mono text-xs z-20 shadow-[0_-15px_40px_rgba(0,0,0,0.3)] flex flex-col transition-all duration-300 ease-in-out",
        isExpanded ? "h-[60vh]" : "h-64"
      )}
    >
      <div className="flex items-end justify-between px-2 pt-2 border-b border-border/40 bg-panel/40 shrink-0">
        <div className="flex gap-1 items-end">
          <button 
            onClick={() => setActiveTab('model')}
            className={clsx(
              "px-4 py-2 flex items-center gap-2 rounded-t-lg transition-colors border-b-2",
              activeTab === 'model' 
                ? "bg-[#1E1E1E] text-white border-primary" 
                : "text-textMuted hover:bg-white/5 border-transparent hover:text-white/80"
            )}
          >
            <FileCode2 className={clsx("w-3.5 h-3.5", activeTab === 'model' ? "text-primary" : "text-textMuted/60")} />
            model.py
          </button>
          <button 
            onClick={() => setActiveTab('train')}
            className={clsx(
              "px-4 py-2 flex items-center gap-2 rounded-t-lg transition-colors border-b-2",
              activeTab === 'train' 
                ? "bg-[#1E1E1E] text-white border-primary" 
                : "text-textMuted hover:bg-white/5 border-transparent hover:text-white/80"
            )}
          >
            <Play className={clsx("w-3.5 h-3.5", activeTab === 'train' ? "text-green-400" : "text-textMuted/60")} />
            train.py
          </button>
        </div>
        
        <div className="flex items-center gap-1 pb-1.5 pr-2">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-textMuted hover:text-white transition-colors hover:bg-white/10 px-2.5 py-1.5 rounded-md"
            title="Copy Code"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-textMuted hover:text-white transition-colors hover:bg-white/10 px-2.5 py-1.5 rounded-md"
            title={`Download ${activeFileName}`}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-textMuted hover:text-white transition-colors hover:bg-white/10 px-2.5 py-1.5 rounded-md"
            title={isExpanded ? "Collapse Code" : "Expand Code"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden relative">
        <SyntaxHighlighter
          language="python"
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1.25rem',
            background: 'transparent',
            height: '100%',
            overflowY: 'auto',
            fontSize: '13px',
            lineHeight: '1.6'
          }}
          codeTagProps={{
            style: { fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace" }
          }}
        >
          {activeCode}
        </SyntaxHighlighter>
      </div>
    </footer>
  );
}
