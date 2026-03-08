import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

import { getQuickAddLayerEntries, type ModuleType } from '../../domain/layers';

const quickAddEntries = getQuickAddLayerEntries();

interface OmnibarProps {
  position: { x: number; y: number } | null;
  onSelect: (type: ModuleType) => void;
  onClose: () => void;
}

export default function Omnibar({ position, onSelect, onClose }: OmnibarProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (position && inputRef.current) {
      inputRef.current.focus();
    }
  }, [position]);

  const filteredEntries = useMemo(
    () =>
      quickAddEntries.filter((entry) =>
        entry.type.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!position) {
        return;
      }

      if (event.key === 'Escape') {
        onClose();
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, filteredEntries.length - 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }

      if (event.key === 'Enter' && filteredEntries[selectedIndex]) {
        event.preventDefault();
        onSelect(filteredEntries[selectedIndex].type);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredEntries, onClose, onSelect, position, selectedIndex]);

  if (!position) {
    return null;
  }

  return (
    <div
      className="absolute z-50 w-64 bg-panel/95 backdrop-blur-xl border border-border rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <Search className="w-4 h-4 text-textMuted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Add layer..."
          className="bg-transparent border-none text-sm text-white font-mono focus:outline-none w-full placeholder:text-textMuted/50"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {filteredEntries.length === 0 ? (
          <div className="p-3 text-xs text-textMuted text-center">No layers found</div>
        ) : (
          filteredEntries.map((entry, index) => (
            <button
              key={entry.type}
              onClick={() => onSelect(entry.type)}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors font-mono text-sm',
                index === selectedIndex ? 'bg-primary/20 text-primary' : 'text-white/80 hover:bg-white/5',
              )}
            >
              <span>{entry.type}</span>
              <span className="text-[10px] uppercase font-sans tracking-widest opacity-40">
                {entry.definition.category}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
