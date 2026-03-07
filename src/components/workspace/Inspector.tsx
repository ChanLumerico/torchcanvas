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

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10">
        <div className="p-4 border-b border-border/50 shadow-sm flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Inspector</h2>
        </div>
        <div className="p-4 flex-1 flex flex-col items-center justify-center text-textMuted/50 text-xs">
          <div className="w-12 h-12 rounded-full border border-dashed border-border/50 mb-3 flex items-center justify-center">
            <Settings className="w-5 h-5 opacity-50" />
          </div>
          Select a layer to edit properties
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
          <div className="px-3 py-2 bg-black/20 border border-border/50 rounded-lg text-sm font-semibold text-white/90">
            {type}
          </div>
        </div>
        
        {Object.keys(params).length > 0 ? (
          <div>
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
          <div className="text-xs text-textMuted/60 italic">No configurable properties</div>
        )}
      </div>
    </aside>
  );
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

  // Number / Text Input
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-mono text-textMuted flex items-center justify-between">
        {paramKey}
      </label>
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        value={String(value)}
        onChange={(e) => {
          const val = e.target.value;
          if (typeof value === 'number' && !isNaN(Number(val)) && val !== '') {
            onChange(Number(val));
          } else {
            onChange(val);
          }
        }}
        className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors placeholder:text-textMuted/30"
      />
    </div>
  );
}
