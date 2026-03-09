import { memo, useState } from 'react';
import { Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { AlertTriangle, Layers, Settings2, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import { getLayerColor, type ModuleType } from '../../domain/layers';
import type { ModuleData } from '../../domain/graph/reactFlowAdapter';
import { CONTAINER_LAYOUT } from '../../domain/nodes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { VisibleNodeHandle } from './NodeHandle';

function getNodeColor(type: ModuleType, connected: boolean | undefined): string {
  if (!connected) {
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
  const {
    type,
    params,
    connected,
    shapeError,
    compact,
    hideHandles,
    pulseChild,
    previewShifted,
    previewGhost,
    dragSourceHidden,
  } = data;
  const [hovered, setHovered] = useState(false);
  const deleteNodeById = useWorkspaceStore((state) => state.deleteNodeById);
  const isSequentialCompact = compact && data.parentContainerType === 'Sequential';

  const accentColor = shapeError ? '#EF4444' : getNodeColor(type, connected);
  const borderColor = shapeError ? '#EF4444' : accentColor;
  const bgColor = hexToRgba(shapeError ? '#EF4444' : accentColor, 0.08);
  const textColor = accentColor;
  const showDelete = hovered || selected;
  const deleteAccent = '#EF4444';

  if (compact) {
    return (
      <div
        data-compact-node="true"
        data-parent-container={data.parentContainerType ?? 'none'}
        data-pulse-child={pulseChild ? 'true' : 'false'}
        data-preview-shifted={previewShifted ? 'true' : 'false'}
        data-preview-ghost={previewGhost ? 'true' : 'false'}
        data-drag-source-hidden={dragSourceHidden ? 'true' : 'false'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderColor,
          backgroundColor: selected
            ? hexToRgba(accentColor, isSequentialCompact ? 0.18 : 0.16)
            : hexToRgba(accentColor, isSequentialCompact ? 0.1 : 0.08),
          color: textColor,
          boxShadow: selected
            ? `0 0 18px -4px ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.55)}`
            : previewShifted
              ? `0 10px 22px ${hexToRgba(accentColor, 0.12)}, 0 6px 18px ${hexToRgba('#000000', 0.22)}`
              : `0 4px 16px ${hexToRgba('#000000', 0.25)}`,
          position: 'relative',
          width: '100%',
          minWidth: '100%',
          maxWidth: '100%',
          height: isSequentialCompact ? CONTAINER_LAYOUT.childHeight : 50,
          borderRadius: isSequentialCompact ? 10 : 14,
          opacity: dragSourceHidden ? 0.16 : previewGhost ? 0.62 : 1,
          transform: dragSourceHidden
            ? 'scale(0.96)'
            : previewGhost
              ? 'scale(0.982)'
              : previewShifted
                ? 'scale(1.012)'
                : 'scale(1)',
          transition:
            'transform 280ms cubic-bezier(0.22, 1.12, 0.36, 1), opacity 220ms ease, box-shadow 220ms ease, background-color 220ms ease',
        }}
        className={clsx(
          'w-full border backdrop-blur-md transition-all duration-200 px-4 flex items-center justify-between gap-3',
          pulseChild && 'container-chip-enter',
          previewShifted && 'container-chip-shifted',
          previewGhost && 'container-chip-ghost',
          dragSourceHidden && 'container-chip-drag-source-hidden',
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
            background: '#151515',
            border: `1px solid ${hexToRgba(deleteAccent, 0.45)}`,
            color: deleteAccent,
          }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center transition-opacity z-20"
        >
          <Trash2 style={{ width: 10, height: 10 }} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          {shapeError ? (
            <AlertTriangle className="w-4 h-4 opacity-90 flex-shrink-0" />
          ) : (
            <Layers className="w-4 h-4 opacity-80 flex-shrink-0" />
          )}
          <span className="text-[12px] font-bold tracking-wide truncate">{type}</span>
        </div>

        <span className="text-[11px] font-mono text-white/55 truncate">
          {data.attributeName}
        </span>

        {hideHandles ? null : (
          <>
            <VisibleNodeHandle type="target" position={Position.Left} color={accentColor} />
            <VisibleNodeHandle type="source" position={Position.Right} color={accentColor} />
          </>
        )}
      </div>
    );
  }

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
          border: `1.5px solid ${deleteAccent}`,
          color: deleteAccent,
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

      {!connected && (
        <div className="px-3 pb-2 text-[9px] text-white/25 text-center font-mono">
          unconnected
        </div>
      )}

      <VisibleNodeHandle type="target" position={Position.Left} color={accentColor} />
      <VisibleNodeHandle type="source" position={Position.Right} color={accentColor} />
    </div>
  );
}

export default memo(ModuleNode);
