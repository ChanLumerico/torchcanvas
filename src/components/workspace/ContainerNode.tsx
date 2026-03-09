import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { BoxSelect } from 'lucide-react';
import clsx from 'clsx';

import { getLayerColor } from '../../domain/layers';
import type { ModuleData } from '../../domain/graph/reactFlowAdapter';
import { CONTAINER_LAYOUT, getNodeBehavior } from '../../domain/nodes';

function ContainerNode({ data, selected }: NodeProps<ModuleData>) {
  const {
    type,
    attributeName,
    connected,
    hideHandles,
    containerChildCount = 0,
    isDropTarget,
    dropPreviewTop,
    dropPreviewHeight,
    dropPreviewWidth,
    dropPreviewLeft,
    pulseContainer,
    previewShifted,
    previewGhost,
    dragSourceHidden,
  } = data;
  const color = getLayerColor(type);
  const isActive = Boolean(connected || isDropTarget);
  const containerBehavior = getNodeBehavior(type);
  const insertionGuideTop = typeof dropPreviewTop === 'number' ? dropPreviewTop : null;
  const previewWidth =
    typeof dropPreviewWidth === 'number'
      ? dropPreviewWidth
      : containerBehavior.isContainer()
        ? containerBehavior.getChildWidth()
        : CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2;
  const previewLeft =
    typeof dropPreviewLeft === 'number'
      ? dropPreviewLeft
      : containerBehavior.isContainer()
        ? containerBehavior.getChildLeft()
        : CONTAINER_LAYOUT.paddingX;
  const previewHeight = typeof dropPreviewHeight === 'number' ? dropPreviewHeight : CONTAINER_LAYOUT.childHeight;
  const activeColor = isActive ? '#94A3B8' : color;

  return (
    <div
      data-container-node={type}
      data-drop-target={isDropTarget ? 'true' : 'false'}
      data-connected={isActive ? 'true' : 'false'}
      data-child-count={String(containerChildCount)}
      data-preview-shifted={previewShifted ? 'true' : 'false'}
      data-preview-ghost={previewGhost ? 'true' : 'false'}
      data-drag-source-hidden={dragSourceHidden ? 'true' : 'false'}
      className={clsx(
        'relative w-full h-full rounded-xl border-2 transition-all min-w-[320px] !bg-panel/10 backdrop-blur-sm overflow-visible',
        selected ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'shadow-lg',
        pulseContainer && 'container-shell-pulse',
        previewShifted && 'container-chip-shifted',
        previewGhost && 'container-chip-ghost',
        dragSourceHidden && 'container-chip-drag-source-hidden',
      )}
      style={{
        minHeight: CONTAINER_LAYOUT.minHeight,
        borderColor: isActive ? activeColor : selected ? color : `${color}60`,
        boxShadow: isActive
          ? `0 0 0 1px ${activeColor}55, 0 14px 38px rgba(0,0,0,0.28)`
          : undefined,
        opacity: dragSourceHidden ? 0.16 : previewGhost ? 0.62 : 1,
        transform: dragSourceHidden
          ? 'scale(0.975)'
          : previewGhost
            ? 'scale(0.99)'
            : previewShifted
              ? 'scale(1.008)'
              : 'scale(1)',
        transition:
          'transform 300ms cubic-bezier(0.22, 1.12, 0.36, 1), opacity 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
      }}
    >
      <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{
            background: `linear-gradient(180deg, ${color}14 0%, transparent 28%, transparent 100%)`,
            opacity: isDropTarget ? 0.9 : 0.35,
          }}
        />

        <div
          className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-3 border-b rounded-t-[10px]"
          style={{
            backgroundColor: isActive ? `${activeColor}24` : `${color}18`,
            borderColor: `${activeColor}30`,
          }}
        >
          <div className="flex items-center gap-2">
            <BoxSelect className="w-3.5 h-3.5" style={{ color: activeColor }} />
            <span className="text-xs font-bold tracking-wider" style={{ color: activeColor }}>
              {type}
            </span>
          </div>
          <div className="text-[10px] font-mono font-medium text-white/50 bg-black/40 px-2 py-0.5 rounded">
            {attributeName}
          </div>
        </div>

        {containerChildCount === 0 && (
          <div className="absolute inset-x-0 top-12 bottom-5 flex items-center justify-center text-[11px] font-mono text-white/28">
            Drop layers here
          </div>
        )}

        {typeof insertionGuideTop === 'number' && (
          <>
            <div
              className="absolute h-[3px] rounded-full transition-all duration-200 container-slot-line"
              style={{
                top: insertionGuideTop,
                left: previewLeft,
                width: previewWidth,
                background: `linear-gradient(90deg, transparent 0%, ${color}AA 18%, ${color} 50%, ${color}AA 82%, transparent 100%)`,
                boxShadow: `0 0 18px ${color}44`,
              }}
            />
            <div
              className="absolute rounded-[14px] transition-all duration-200 container-drop-slot"
              style={{
                top: insertionGuideTop,
                left: previewLeft,
                width: previewWidth,
                height: previewHeight,
                border: `1px solid ${color}32`,
                background: `linear-gradient(180deg, ${color}24 0%, ${color}12 55%, ${color}06 100%)`,
                boxShadow: `inset 0 0 0 1px ${color}18, 0 12px 28px -18px ${color}90`,
              }}
            />
          </>
        )}
      </div>

      {hideHandles ? (
        <>
          <Handle
            id="sequential-top"
            type="target"
            position={Position.Top}
            isConnectable={false}
            style={{ opacity: 0, pointerEvents: 'none' }}
            className="!w-2 !h-2"
          />
          <Handle
            id="sequential-bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={false}
            style={{ opacity: 0, pointerEvents: 'none' }}
            className="!w-2 !h-2"
          />
        </>
      ) : (
        <>
          <Handle
            type="target"
            position={Position.Top}
            className="!w-3.5 !h-3.5 !bg-panel !border-2 transition-colors z-20"
            style={{ borderColor: isActive ? activeColor : `${color}80`, top: 0 }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3.5 !h-3.5 !bg-panel !border-2 transition-colors z-20"
            style={{ borderColor: isActive ? activeColor : `${color}80`, bottom: 0 }}
          />
        </>
      )}
    </div>
  );
}

export default memo(ContainerNode);
