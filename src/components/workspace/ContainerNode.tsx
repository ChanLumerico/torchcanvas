import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { BoxSelect } from 'lucide-react';
import clsx from 'clsx';

import { getLayerColor } from '../../domain/layers';
import type { ModuleData } from '../../domain/graph/reactFlowAdapter';

function ContainerNode({ data, selected }: NodeProps<ModuleData>) {
  const { type, attributeName } = data;
  const color = getLayerColor(type);

  return (
    <div
      className={clsx(
        'relative rounded-xl border-2 transition-colors min-w-[320px] min-h-[320px] !bg-panel/10 backdrop-blur-sm',
        selected ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'shadow-lg',
      )}
      style={{
        borderColor: selected ? color : `${color}60`,
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-3 border-b rounded-t-[10px]"
        style={{
          backgroundColor: `${color}20`,
          borderColor: `${color}30`,
        }}
      >
        <div className="flex items-center gap-2">
          <BoxSelect className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-xs font-bold tracking-wider" style={{ color }}>
            {type}
          </span>
        </div>
        <div className="text-[10px] font-mono font-medium text-white/50 bg-black/40 px-2 py-0.5 rounded">
          {attributeName}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-panel !border-2 transition-colors z-20"
        style={{ borderColor: color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-panel !border-2 transition-colors z-20"
        style={{ borderColor: color }}
      />
    </div>
  );
}

export default memo(ContainerNode);
