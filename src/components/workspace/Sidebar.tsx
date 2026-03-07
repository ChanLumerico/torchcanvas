import type { DragEvent } from 'react';
import type { ModuleType } from '../../store/workspaceStore';

const MODULES: { category: string; items: ModuleType[] }[] = [
  { category: 'Data', items: ['Input', 'Output'] },
  { category: 'Convolutional', items: ['Conv2d'] },
  { category: 'Linear', items: ['Linear'] },
  { category: 'Activations', items: ['ReLU'] },
  { category: 'Pooling', items: ['MaxPool2d'] },
  { category: 'Normalization', items: ['BatchNorm2d'] },
  { category: 'Merge', items: ['Concat'] },
];

export default function Sidebar() {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 border-r border-border/80 bg-panel/40 flex flex-col z-10">
      <div className="p-4 border-b border-border/50 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-textMuted">Layer Library</h2>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        {MODULES.map((group) => (
          <div key={group.category}>
            <div className="text-[10px] font-bold uppercase text-textMuted/60 mb-2 tracking-widest">{group.category}</div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div
                  key={item}
                  onDragStart={(e) => onDragStart(e, item)}
                  draggable
                  className="px-3 py-2 rounded-lg border-2 border-border/80 bg-panel text-sm font-mono cursor-grab hover:border-primary/50 transition-colors shadow-sm flex items-center justify-between group"
                >
                  <span className="text-white/90">{item}</span>
                  <span className="text-[10px] text-textMuted/40 group-hover:text-primary/50">drag</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
