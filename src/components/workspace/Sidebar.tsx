import { useState, useMemo } from 'react';
import type { DragEvent } from 'react';
import type { ModuleType } from '../../store/workspaceStore';
import { Search, Star, Layers } from 'lucide-react';
import clsx from 'clsx';

const MODULES_CATEGORIES = [
  { category: 'Data', items: ['Input', 'Output'] },
  { 
    category: 'Convolutional', 
    items: [
      'Conv1d', 'Conv2d', 'Conv3d', 
      'ConvTranspose1d', 'ConvTranspose2d', 'ConvTranspose3d'
    ] 
  },
  { category: 'Linear', items: ['Linear', 'Bilinear'] },
  { 
    category: 'Activations', 
    items: [
      'ReLU', 'ReLU6', 'LeakyReLU', 'PReLU', 'ELU', 'SELU', 'GELU', 
      'Sigmoid', 'Tanh', 'LogSoftmax', 'Softmax'
    ] 
  },
  { 
    category: 'Pooling', 
    items: [
      'MaxPool1d', 'MaxPool2d', 'MaxPool3d', 
      'AvgPool1d', 'AvgPool2d', 'AvgPool3d', 
      'AdaptiveAvgPool1d', 'AdaptiveAvgPool2d', 'AdaptiveAvgPool3d'
    ] 
  },
  { 
    category: 'Normalization', 
    items: [
      'BatchNorm1d', 'BatchNorm2d', 'BatchNorm3d', 
      'LayerNorm', 'GroupNorm', 
      'InstanceNorm1d', 'InstanceNorm2d', 'InstanceNorm3d'
    ] 
  },
  { 
    category: 'Utility', 
    items: [
      'Dropout', 'Dropout2d', 'Dropout3d', 'AlphaDropout', 
      'Flatten', 'Unflatten', 'Upsample'
    ] 
  },
  { category: 'Merge', items: ['Concat'] },
  { category: 'Containers', items: ['Sequential', 'ModuleList', 'ModuleDict'] },
] as const;

export default function Sidebar() {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<ModuleType>>(new Set(['Conv2d', 'Linear', 'ReLU']));

  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleFavorite = (item: ModuleType, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavs = new Set(favorites);
    if (newFavs.has(item)) newFavs.delete(item);
    else newFavs.add(item);
    setFavorites(newFavs);
  };

  const filteredModules = useMemo(() => {
    if (!query) return MODULES_CATEGORIES;
    return MODULES_CATEGORIES.map(g => ({
      ...g,
      items: g.items.filter(i => i.toLowerCase().includes(query.toLowerCase()))
    })).filter(g => g.items.length > 0);
  }, [query]);

  const favoriteItems = useMemo(() => {
    return Array.from(favorites).filter(i => i.toLowerCase().includes(query.toLowerCase()));
  }, [favorites, query]);

  return (
    <aside className="w-64 border-r border-border/80 bg-panel/40 flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-border/50 shadow-sm bg-panel/80">
        <h2 className="text-xs font-bold uppercase tracking-wider text-textMuted flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4" /> Layer Library
        </h2>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layers..."
            className="w-full bg-black/40 border border-border/80 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-primary/50 transition-colors placeholder:text-textMuted/50"
          />
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
        {favoriteItems.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase text-primary/80 mb-2 tracking-widest flex items-center gap-1">
              <Star className="w-3 h-3 fill-primary/80" /> Favorites
            </div>
            <div className="space-y-2">
              {favoriteItems.map((item) => (
                <div
                  key={`fav-${item}`}
                  onDragStart={(e) => onDragStart(e, item)}
                  draggable
                  className="px-3 py-2 rounded-lg border-2 border-border/80 bg-panel text-sm font-mono cursor-grab hover:border-primary/50 transition-colors shadow-sm flex items-center justify-between group"
                >
                  <span className="text-white/90">{item}</span>
                  <button onClick={(e) => toggleFavorite(item as ModuleType, e)} className="text-primary hover:text-primaryHover focus:outline-none">
                    <Star className="w-3 h-3 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredModules.map((group) => (
          <div key={group.category}>
            <div className="text-[10px] font-bold uppercase text-textMuted/60 mb-2 tracking-widest">{group.category}</div>
            <div className="space-y-2">
              {group.items.map((item) => {
                const isFav = favorites.has(item as ModuleType);
                return (
                  <div
                    key={item}
                    onDragStart={(e) => onDragStart(e, item)}
                    draggable
                    className="px-3 py-2 rounded-lg border-2 border-border/80 bg-panel text-sm font-mono cursor-grab hover:border-primary/50 transition-colors shadow-sm flex items-center justify-between group"
                  >
                    <span className="text-white/90">{item}</span>
                    <button 
                      onClick={(e) => toggleFavorite(item as ModuleType, e)} 
                      className={clsx(
                        "focus:outline-none transition-colors",
                        isFav ? "text-primary hover:text-primaryHover" : "text-textMuted/30 hover:text-textMuted group-hover:text-textMuted/50"
                      )}
                    >
                      <Star className={clsx("w-3 h-3", isFav && "fill-current")} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filteredModules.length === 0 && favoriteItems.length === 0 && (
          <div className="text-center text-xs text-textMuted italic pt-4">No layers match your search.</div>
        )}
      </div>
    </aside>
  );
}
