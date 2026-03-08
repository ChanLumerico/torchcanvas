import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { ModuleType } from '../../store/workspaceStore';
import clsx from 'clsx';

const MODULES: { category: string; items: ModuleType[] }[] = [
  { category: 'Containers', items: ['Sequential', 'ModuleList', 'ModuleDict'] },
  { category: 'Data', items: ['Input', 'Output'] },
  { category: 'Convolutional', items: ['Conv2d'] },
  { category: 'Linear', items: ['Linear'] },
  { category: 'Activations', items: ['ReLU'] },
  { category: 'Pooling', items: ['MaxPool2d'] },
  { category: 'Normalization', items: ['BatchNorm2d'] },
  { category: 'Merge', items: ['Concat'] },
];

const ALL_MODULES = MODULES.flatMap(g => g.items.map(i => ({ ...g, item: i })));

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
      setQuery('');
      setSelectedIndex(0);
    }
  }, [position]);

  const filtered = ALL_MODULES.filter(m => m.item.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!position) return;
      
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(s => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(s => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex].item);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [position, filtered, selectedIndex, onClose, onSelect]);

  if (!position) return null;

  return (
    <div 
      className="absolute z-50 w-64 bg-panel/95 backdrop-blur-xl border border-border rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden"
      style={{ 
        left: position.x, 
        top: position.y,
        transform: 'translate(-50%, -50%)' // Center exactly where clicked
      }}
    >
      <div className="p-3 border-b border-white/5 flex items-center gap-2">
        <Search className="w-4 h-4 text-textMuted" />
        <input 
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          placeholder="Add layer..."
          className="bg-transparent border-none text-sm text-white font-mono focus:outline-none w-full placeholder:text-textMuted/50"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-textMuted text-center">No layers found</div>
        ) : (
          filtered.map((m, idx) => (
            <button
              key={m.item}
              onClick={() => onSelect(m.item)}
              className={clsx(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors font-mono text-sm",
                idx === selectedIndex ? "bg-primary/20 text-primary" : "text-white/80 hover:bg-white/5"
              )}
            >
              <span>{m.item}</span>
              <span className="text-[10px] uppercase font-sans tracking-widest opacity-40">{m.category}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
