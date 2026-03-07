import { useWorkspaceStore } from '../../store/workspaceStore';
import { Settings } from 'lucide-react';

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

  const handleParamChange = (key: string, value: string) => {
    // Attempt parse to number or boolean if applicable
    let parsedValue: string | number | boolean = value;
    if (!isNaN(Number(value)) && value.trim() !== '') {
      parsedValue = Number(value);
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    }
    
    updateNodeParams(selectedNode.id, { [key]: parsedValue });
  };

  return (
    <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10">
      <div className="p-4 border-b border-border/50 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Inspector</h2>
        </div>
        <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded">
          {selectedNode.id}
        </span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-6">
          <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-2 block">Layer Type</label>
          <div className="px-3 py-2 bg-black/20 border border-border/50 rounded-lg text-sm font-semibold text-white/90">
            {type}
          </div>
        </div>
        
        {Object.keys(params).length > 0 ? (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">Properties</label>
            <div className="space-y-3">
              {Object.entries(params).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-textMuted">{key}</label>
                  <input
                    type="text"
                    value={String(value)}
                    onChange={(e) => handleParamChange(key, e.target.value)}
                    className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
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
