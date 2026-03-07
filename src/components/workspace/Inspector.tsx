import { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Settings, Info } from 'lucide-react';
import clsx from 'clsx';

function getDocLink(type: string) {
  return `https://pytorch.org/docs/stable/generated/torch.nn.${type}.html`;
}

export default function Inspector() {
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const updateNodeParams = useWorkspaceStore((state) => state.updateNodeParams);
  const updateNodeAttributeName = useWorkspaceStore((state) => state.updateNodeAttributeName);
  const modelName = useWorkspaceStore((state) => state.modelName);
  const setModelName = useWorkspaceStore((state) => state.setModelName);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10">
        <div className="p-4 border-b border-border/50 shadow-sm flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Model Properties</h2>
        </div>
        <div className="p-4 flex-1 flex flex-col text-xs">
          <div className="flex flex-col gap-1.5 mb-6">
            <label className="text-xs font-mono text-textMuted font-bold">Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="e.g. MyResNet"
            />
            <p className="text-[10px] text-textMuted/60 mt-1">This will be used as the Python class name.</p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center text-textMuted/50 text-[10px] text-center px-4">
            <div className="w-12 h-12 rounded-full border border-dashed border-border/50 mb-3 flex items-center justify-center">
              <Settings className="w-5 h-5 opacity-50" />
            </div>
            Select a layer on the canvas to edit its specific properties
          </div>
        </div>
      </aside>
    );
  }

  const { type, params } = selectedNode.data;

  const handleParamChange = (key: string, value: string | boolean | number) => {
    updateNodeParams(selectedNode.id, { [key]: value });
  };

  return (
    <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-border/50 shadow-sm flex items-center justify-between bg-panel/80">
        <div className="flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Inspector</h2>
        </div>
        <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded">
          {selectedNode.id}
        </span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60">Layer Type</label>
            <a 
              href={getDocLink(type)} 
              target="_blank" 
              rel="noreferrer"
              className="text-[10px] flex items-center gap-1 text-primary hover:text-primaryHover transition-colors"
              title="View PyTorch Docs"
            >
              <Info className="w-3 h-3" /> docs
            </a>
          </div>
          <div className="px-3 py-2 bg-black/20 border border-border/50 rounded-lg text-sm font-semibold text-white/90 mb-4">
            {type}
          </div>

          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60">Attribute Name</label>
          </div>
          <div className="flex flex-col gap-1">
            <AttributeNameInput 
               nodeId={selectedNode.id}
               initialName={selectedNode.data.attributeName || ''}
               nodes={nodes}
               updateNodeAttributeName={updateNodeAttributeName}
            />
            <span className="text-[10px] text-textMuted/50 leading-tight border-t border-border/50 pt-2 mt-2">
              This represents the Python variable name (`self.{selectedNode.data.attributeName}`)
            </span>
          </div>
        </div>
        
        {Object.keys(params).length > 0 ? (
          <div className="mb-8">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">Properties</label>
            <div className="space-y-4">
              {Object.entries(params).map(([key, value]) => (
                <ParamControl 
                  key={key} 
                  paramKey={key} 
                  value={value} 
                  onChange={(v) => handleParamChange(key, v)} 
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-textMuted/60 italic mb-8">No configurable properties</div>
        )}

        <InternalStatesSection type={type} params={params} />
      </div>
    </aside>
  );
}

function InternalStatesSection({ type, params }: { type: string, params: any }) {
  const states = getInternalStates(type, params);
  
  if (states.length === 0) return null;

  return (
    <div className="pt-6 border-t border-border/40">
      <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">Internal States</label>
      <div className="space-y-2">
        {states.map(state => (
          <div key={state.name} className="flex flex-col gap-1 p-2 rounded bg-white/5 border border-white/5 group hover:border-primary/20 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-white/80">{state.name}</span>
              <span className={clsx(
                "text-[8px] uppercase tracking-tighter px-1 rounded-sm",
                state.category === 'parameter' ? "bg-amber-500/10 text-amber-500/80" : "bg-blue-500/10 text-blue-500/80"
              )}>
                {state.category}
              </span>
            </div>
            <div className="text-[10px] font-mono text-textMuted/60 flex items-center gap-1.5 capitalize">
              <span className="opacity-40">Shape:</span> {state.shape}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-textMuted/40 mt-3 leading-relaxed">
        These are generated automatically by PyTorch based on your configured properties.
      </p>
    </div>
  );
}

function getInternalStates(type: string, params: any) {
  const getK = (dim: number) => {
    const k = params.kernel_size ?? 3;
    return Array.isArray(k) ? k : Array(dim).fill(k);
  };

  switch (true) {
    case type.startsWith('ConvTranspose'):
    case type.startsWith('Conv'): {
      const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      const in_c = params.in_channels || (dim === 2 ? 3 : 64);
      const out_c = params.out_channels || 64;
      const k = getK(dim);
      const states = [
        { name: 'weight', shape: `[${out_c}, ${in_c}, ${k.join(', ')}]`, category: 'parameter' }
      ];
      if (params.bias !== false && params.bias !== 'false') {
        states.push({ name: 'bias', shape: `[${out_c}]`, category: 'parameter' });
      }
      return states;
    }
    case type === 'Linear': {
      const in_f = params.in_features || 512;
      const out_f = params.out_features || 10;
      const states = [
        { name: 'weight', shape: `[${out_f}, ${in_f}]`, category: 'parameter' }
      ];
      if (params.bias !== false && params.bias !== 'false') {
        states.push({ name: 'bias', shape: `[${out_f}]`, category: 'parameter' });
      }
      return states;
    }
    case type === 'Bilinear': {
       const in1 = params.in1_features || 128;
       const in2 = params.in2_features || 128;
       const out = params.out_features || 64;
       const states = [
         { name: 'weight', shape: `[${out}, ${in1}, ${in2}]`, category: 'parameter' }
       ];
       if (params.bias !== false && params.bias !== 'false') {
         states.push({ name: 'bias', shape: `[${out}]`, category: 'parameter' });
       }
       return states;
    }
    case type.startsWith('BatchNorm'): {
      const n = params.num_features || 64;
      return [
        { name: 'weight', shape: `[${n}]`, category: 'parameter' },
        { name: 'bias', shape: `[${n}]`, category: 'parameter' },
        { name: 'running_mean', shape: `[${n}]`, category: 'buffer' },
        { name: 'running_var', shape: `[${n}]`, category: 'buffer' }
      ];
    }
    case type === 'LayerNorm': {
       const s = params.normalized_shape || 64;
       const shape = Array.isArray(s) ? `[${s.join(', ')}]` : `[${s}]`;
       return [
         { name: 'weight', shape, category: 'parameter' },
         { name: 'bias', shape, category: 'parameter' }
       ];
    }
    case type.startsWith('InstanceNorm'): {
       if (params.affine === true || params.affine === 'true') {
          const n = params.num_features || 64;
          return [
            { name: 'weight', shape: `[${n}]`, category: 'parameter' },
            { name: 'bias', shape: `[${n}]`, category: 'parameter' }
          ];
       }
       return [];
    }
    case type === 'PReLU': {
       const n = params.num_parameters || 1;
       return [{ name: 'weight', shape: `[${n}]`, category: 'parameter' }];
    }
    default: return [];
  }
}

function ParamControl({ paramKey, value, onChange }: { paramKey: string, value: any, onChange: (val: any) => void }) {
  // Boolean Toggle
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const isChecked = value === true || value === 'true';
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono text-textMuted">{paramKey}</label>
        <button 
          onClick={() => onChange(!isChecked)}
          className={clsx(
            "w-8 h-4 rounded-full relative transition-colors border",
            isChecked ? "bg-primary border-primary" : "bg-black/40 border-border/80"
          )}
        >
          <div className={clsx(
            "absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform",
            isChecked ? "translate-x-4" : "translate-x-1 opacity-50"
          )} />
        </button>
      </div>
    );
  }

  // Determine if this parameter should strictly be a number
  // Since PyTorch code generation breaks if out_channels='64', we must enforce numbers
  const isNumeric = typeof value === 'number' || !isNaN(Number(value));

  // Number / Text Input
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-mono text-textMuted flex items-center justify-between">
        {paramKey}
      </label>
      <input
        type={isNumeric ? 'number' : 'text'}
        value={value}
        onChange={(e) => {
          const valStr = e.target.value;
          
          if (isNumeric) {
             const parsed = Number(valStr);
             // allow temporary empty string while typing, but generally enforce number
             onChange(valStr === '' ? '' : (isNaN(parsed) ? value : parsed));
          } else {
             onChange(valStr);
          }
        }}
        onBlur={(e) => {
          // Fallback safeguard if they leave it empty but it needs a number
          const valStr = e.target.value;
          if (isNumeric && valStr === '') {
             onChange(0);
          }
        }}
        className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors placeholder:text-textMuted/30"
      />
    </div>
  );
}

// Extracted to avoid weird typing/focus issues in React
function AttributeNameInput({ 
  nodeId, 
  initialName, 
  nodes, 
  updateNodeAttributeName 
}: { 
  nodeId: string, 
  initialName: string, 
  nodes: any[], 
  updateNodeAttributeName: (id: string, name: string) => void 
}) {
  const [localName, setLocalName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  // Sync state if an external change occurs (e.g. clicking a different node)
  if (initialName !== localName && !error) {
     setLocalName(initialName);
  }

  const handleChange = (val: string) => {
    setLocalName(val);
    
    // Basic validation
    const safeName = val.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeName) {
      setError("Name cannot be empty");
      return;
    }

    // Overlap Guard
    const exists = nodes.some(n => n.id !== nodeId && n.data.attributeName === safeName);
    if (exists) {
      setError(`'${safeName}' is already fully used.`);
      return;
    }

    setError(null);
    updateNodeAttributeName(nodeId, safeName);
  };

  return (
    <>
      <input
        type="text"
        value={localName}
        onChange={(e) => handleChange(e.target.value)}
        className={clsx(
          "bg-black/40 border rounded block w-full px-3 py-1.5 text-sm font-mono focus:outline-none transition-colors",
          error ? "border-red-500/50 text-red-200 focus:border-red-500" : "border-border/80 text-white focus:border-primary/50"
        )}
      />
      {error && <span className="text-[10px] text-red-400 font-medium">{error}</span>}
    </>
  );
}
