import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { AlertTriangle, Layers, Settings2, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import { getLayerColor, type ModuleType } from '../../domain/layers';
import type { ModuleData } from '../../domain/graph/reactFlowAdapter';
import { useWorkspaceStore } from '../../store/workspaceStore';

function getNodeColor(type: ModuleType, connected: boolean | undefined): string {
  const alwaysColored = type === 'Input' || type === 'Output';
  if (!connected && !alwaysColored) {
    return '#4B5563';
  }
  return getLayerColor(type);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ModuleNode({ data, selected, id }: NodeProps<ModuleData>) {
  const { type, params, connected, shapeError } = data;
  const [hovered, setHovered] = useState(false);
  const deleteNodeById = useWorkspaceStore((state) => state.deleteNodeById);

  const accentColor = shapeError ? '#EF4444' : getNodeColor(type, connected);
  const borderColor = shapeError ? '#EF4444' : accentColor;
  const bgColor = hexToRgba(shapeError ? '#EF4444' : accentColor, 0.08);
  const textColor = accentColor;
  const showDelete = hovered || selected;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderColor,
        backgroundColor: bgColor,
        color: textColor,
        boxShadow: selected
          ? `0 0 20px -3px ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.6)}`
          : '0 4px 20px rgba(0,0,0,0.3)',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
        position: 'relative',
      }}
      className={clsx(
        'min-w-[160px] rounded-xl border-2 backdrop-blur-md transition-all duration-200',
        shapeError && 'shape-error-pulse',
      )}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          deleteNodeById(id);
        }}
        title="Delete node"
        style={{
          opacity: showDelete ? 1 : 0,
          pointerEvents: showDelete ? 'auto' : 'none',
          position: 'absolute',
          top: -10,
          right: -10,
          background: '#1a1a1a',
          border: '1.5px solid #EF4444',
          color: '#EF4444',
          borderRadius: '50%',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'opacity 0.15s ease',
          zIndex: 100,
        }}
      >
        <Trash2 style={{ width: 10, height: 10 }} />
      </button>

      <div
        style={{ borderBottomColor: hexToRgba(accentColor, 0.2) }}
        className="flex items-center justify-between p-3 border-b bg-black/20 rounded-t-[10px]"
      >
        <div className="flex items-center gap-2">
          {shapeError ? (
            <AlertTriangle className="w-4 h-4 opacity-90" />
          ) : (
            <Layers className="w-4 h-4 opacity-80" />
          )}
          <span className="text-sm font-bold tracking-wide">{type}</span>
        </div>
        <Settings2 className="w-3 h-3 opacity-40" />
      </div>

      {Object.keys(params).length > 0 && (
        <div className="p-3 bg-black/40 space-y-1">
          {Object.entries(params).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center text-[10px] font-mono opacity-80">
              <span>{key}:</span>
              <span className="font-semibold">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {!connected && type !== 'Input' && type !== 'Output' && (
        <div className="px-3 pb-2 text-[9px] text-white/25 text-center font-mono">
          unconnected
        </div>
      )}

      {type !== 'Input' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#0f0f0f', borderColor: accentColor }}
          className="w-3 h-3 !border-2"
        />
      )}

      {type !== 'Output' && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#0f0f0f', borderColor: accentColor }}
          className="w-3 h-3 !border-2"
        />
      )}
    </div>
  );
}

export default memo(ModuleNode);
