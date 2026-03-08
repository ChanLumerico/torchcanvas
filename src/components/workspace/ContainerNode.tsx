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
    dropPreviewIndex,
    pulseContainer,
  } = data;
  const color = getLayerColor(type);
  const isActive = Boolean(connected || isDropTarget);
  const containerBehavior = getNodeBehavior(type);
  const insertionGuideTop =
    typeof dropPreviewIndex === 'number'
      ? CONTAINER_LAYOUT.stackTop +
        dropPreviewIndex * (CONTAINER_LAYOUT.childHeight + CONTAINER_LAYOUT.childGap) -
        CONTAINER_LAYOUT.childGap / 2
      : null;
  const previewWidth = containerBehavior.isContainer()
    ? containerBehavior.getChildWidth()
    : CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2;
  const previewLeft = containerBehavior.isContainer()
    ? containerBehavior.getChildLeft()
    : CONTAINER_LAYOUT.paddingX;
  const activeColor = isActive ? '#94A3B8' : color;

  return (
    <div
      data-container-node={type}
      data-drop-target={isDropTarget ? 'true' : 'false'}
      data-connected={isActive ? 'true' : 'false'}
      data-child-count={String(containerChildCount)}
      className={clsx(
        'relative w-full h-full rounded-xl border-2 transition-all min-w-[320px] !bg-panel/10 backdrop-blur-sm overflow-hidden',
        selected ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'shadow-lg',
        pulseContainer && 'container-shell-pulse',
      )}
      style={{
        minHeight: CONTAINER_LAYOUT.minHeight,
        borderColor: isActive ? activeColor : selected ? color : `${color}60`,
        boxShadow: isActive
          ? `0 0 0 1px ${activeColor}55, 0 14px 38px rgba(0,0,0,0.28)`
          : undefined,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-150"
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
        <div className="absolute inset-x-0 top-12 bottom-5 pointer-events-none flex items-center justify-center text-[11px] font-mono text-white/28">
          Drop layers here
        </div>
      )}

      {typeof insertionGuideTop === 'number' && (
        <>
          <div
            className="absolute h-[2px] rounded-full transition-all duration-150 pointer-events-none"
            style={{
              top: insertionGuideTop,
              left: previewLeft,
              width: previewWidth,
              background: color,
              boxShadow: `0 0 14px ${color}66`,
            }}
          />
          <div
            className="absolute h-14 rounded-[12px] transition-all duration-150 pointer-events-none"
            style={{
              top: insertionGuideTop - CONTAINER_LAYOUT.childHeight / 2,
              left: previewLeft,
              width: previewWidth,
              border: `1px dashed ${color}45`,
              background: `${color}0D`,
            }}
          />
        </>
      )}

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
            className="!w-3 !h-3 !bg-panel !border-2 transition-colors z-20"
            style={{ borderColor: isActive ? activeColor : `${color}80` }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !bg-panel !border-2 transition-colors z-20"
            style={{ borderColor: isActive ? activeColor : `${color}80` }}
          />
        </>
      )}
    </div>
  );
}

export default memo(ContainerNode);
