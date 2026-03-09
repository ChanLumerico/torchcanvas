import { Handle, Position } from 'reactflow';
import type { CSSProperties } from 'react';
import clsx from 'clsx';

const NODE_HANDLE_SURFACE = '#020817';
const NODE_HANDLE_SIZE = 10;
const NODE_HANDLE_BORDER_WIDTH = 2;
const NODE_BORDER_WIDTH = 2;
const VISIBLE_HANDLE_CLASSNAME =
  '!rounded-full !bg-[#020817] z-20 transition-[box-shadow,border-color,background-color] duration-200';
const HIDDEN_HANDLE_CLASSNAME = '!w-2 !h-2 !rounded-full';

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const solidHex = normalized.length >= 6 ? normalized.slice(0, 6) : normalized.padEnd(6, '0');
  const r = parseInt(solidHex.slice(0, 2), 16);
  const g = parseInt(solidHex.slice(2, 4), 16);
  const b = parseInt(solidHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type VisibleNodeHandleProps = {
  type: 'source' | 'target';
  position: Position;
  color: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
};

export function VisibleNodeHandle({
  type,
  position,
  color,
  id,
  className,
  style,
}: VisibleNodeHandleProps) {
  const edgeOffset = -NODE_BORDER_WIDTH / 2;
  const positionOffsetStyle =
    position === Position.Left
      ? { left: edgeOffset, transform: 'translate(-50%, -50%)' }
      : position === Position.Right
        ? { right: edgeOffset, transform: 'translate(50%, -50%)' }
        : position === Position.Top
          ? { top: edgeOffset, transform: 'translate(-50%, -50%)' }
          : position === Position.Bottom
            ? { bottom: edgeOffset, transform: 'translate(-50%, 50%)' }
            : {};

  return (
    <Handle
      id={id}
      type={type}
      position={position}
      isConnectable
      isConnectableStart={type === 'source'}
      isConnectableEnd={type === 'target'}
      className={clsx(VISIBLE_HANDLE_CLASSNAME, className)}
      style={{
        width: NODE_HANDLE_SIZE,
        height: NODE_HANDLE_SIZE,
        backgroundColor: NODE_HANDLE_SURFACE,
        borderStyle: 'solid',
        borderColor: color,
        borderWidth: NODE_HANDLE_BORDER_WIDTH,
        boxShadow: `0 0 0 1px ${hexToRgba(color, 0.18)}, 0 0 14px ${hexToRgba(color, 0.2)}`,
        ...positionOffsetStyle,
        ...style,
      }}
    />
  );
}

type HiddenSequentialHandleProps = {
  id: string;
  type: 'source' | 'target';
  position: Position;
};

export function HiddenSequentialHandle({
  id,
  type,
  position,
}: HiddenSequentialHandleProps) {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      isConnectable={false}
      style={{ opacity: 0, pointerEvents: 'none' }}
      className={HIDDEN_HANDLE_CLASSNAME}
    />
  );
}
