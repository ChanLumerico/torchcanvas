import { useMemo, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { Layers, Search, Star } from 'lucide-react';
import clsx from 'clsx';

import { getLayerCategories, type ModuleType } from '../../domain/layers';

const layerCategories = getLayerCategories();

export default function Sidebar() {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<ModuleType>>(new Set(['Conv2d', 'Linear', 'ReLU']));

  const onDragStart = (event: DragEvent, nodeType: ModuleType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleFavorite = (item: ModuleType, event: MouseEvent) => {
    event.stopPropagation();
    setFavorites((currentFavorites) => {
      const nextFavorites = new Set(currentFavorites);
      if (nextFavorites.has(item)) {
        nextFavorites.delete(item);
      } else {
        nextFavorites.add(item);
      }
      return nextFavorites;
    });
  };

  const filteredModules = useMemo(() => {
    if (!query) {
      return layerCategories;
    }

    return layerCategories
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(query.toLowerCase())),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  const favoriteItems = useMemo(
    () => Array.from(favorites).filter((item) => item.toLowerCase().includes(query.toLowerCase())),
    [favorites, query],
  );

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
            onChange={(event) => setQuery(event.target.value)}
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
                  key={`favorite-${item}`}
                  draggable
                  onDragStart={(event) => onDragStart(event, item)}
                  className="px-3 py-2 rounded-lg border-2 border-border/80 bg-panel text-sm font-mono cursor-grab hover:border-primary/50 transition-colors shadow-sm flex items-center justify-between group"
                >
                  <span className="text-white/90">{item}</span>
                  <button
                    onClick={(event) => toggleFavorite(item, event)}
                    className="text-primary hover:text-primaryHover focus:outline-none"
                  >
                    <Star className="w-3 h-3 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredModules.map((group) => (
          <div key={group.category}>
            <div className="text-[10px] font-bold uppercase text-textMuted/60 mb-2 tracking-widest">
              {group.category}
            </div>
            <div className="space-y-2">
              {group.items.map((item) => {
                const isFavorite = favorites.has(item);
                return (
                  <div
                    key={item}
                    draggable
                    onDragStart={(event) => onDragStart(event, item)}
                    className="px-3 py-2 rounded-lg border-2 border-border/80 bg-panel text-sm font-mono cursor-grab hover:border-primary/50 transition-colors shadow-sm flex items-center justify-between group"
                  >
                    <span className="text-white/90">{item}</span>
                    <button
                      onClick={(event) => toggleFavorite(item, event)}
                      className={clsx(
                        'focus:outline-none transition-colors',
                        isFavorite
                          ? 'text-primary hover:text-primaryHover'
                          : 'text-textMuted/30 hover:text-textMuted group-hover:text-textMuted/50',
                      )}
                    >
                      <Star className={clsx('w-3 h-3', isFavorite && 'fill-current')} />
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
