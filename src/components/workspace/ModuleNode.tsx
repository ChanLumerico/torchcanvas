import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { ModuleData } from '../../store/workspaceStore';
import { Layers, Settings2 } from 'lucide-react';
import clsx from 'clsx';

const typeColors: Record<string, string> = {
  Input: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  Output: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  Conv2d: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  Linear: 'border-red-500/50 bg-red-500/10 text-red-400',
  ReLU: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  BatchNorm2d: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  MaxPool2d: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400',
  Concat: 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-400',
};

function ModuleNode({ data, selected }: NodeProps<ModuleData>) {
  const colorClass = typeColors[data.type] || 'border-border/80 bg-panel text-textMuted';

  return (
    <div 
      className={clsx(
        'min-w-[160px] rounded-xl border-2 shadow-lg backdrop-blur-md transition-all',
        data.shapeError ? 'border-red-500 bg-red-500/10 text-red-400 shape-error-pulse' : colorClass,
        selected ? 'shadow-[0_0_20px_-3px_rgba(255,255,255,0.2)] scale-[1.02] border-opacity-100 z-50' : 'shadow-black/20'
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-Current/20 border-white/10 bg-black/20 rounded-t-[10px]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 opacity-80" />
          <span className="text-sm font-bold tracking-wide">{data.type}</span>
        </div>
        <Settings2 className="w-3 h-3 opacity-50" />
      </div>
      
      {Object.keys(data.params).length > 0 && (
        <div className="p-3 bg-black/40 space-y-1">
          {Object.entries(data.params).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center text-[10px] font-mono opacity-80">
              <span>{key}:</span>
              <span className="font-semibold">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Inputs (Target handles) */}
      {data.type !== 'Input' && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 !bg-background !border-2 !border-current"
        />
      )}

      {/* Outputs (Source handles) */}
      {data.type !== 'Output' && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 !bg-background !border-2 !border-current"
        />
      )}
    </div>
  );
}

export default memo(ModuleNode);
