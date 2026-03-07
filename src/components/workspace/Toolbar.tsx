import { useState, useRef, useEffect } from 'react';
import { Download, Save, Undo2, Redo2, PencilLine } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function Toolbar({ onExitWorkspace }: { onExitWorkspace: () => void }) {
  const modelName = useWorkspaceStore((state) => state.modelName);
  const setModelName = useWorkspaceStore((state) => state.setModelName);
  
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (!modelName.trim()) setModelName('GeneratedModel');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') {
      setIsEditing(false);
      if (!modelName.trim()) setModelName('GeneratedModel'); // basic fallback
    }
  };

  return (
    <header className="h-14 border-b border-border/80 flex items-center justify-between px-4 shrink-0 bg-panel/80 z-20 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button 
          onClick={onExitWorkspace} 
          className="text-xs font-semibold text-textMuted hover:text-white transition-colors flex items-center gap-1"
        >
          <span className="text-[10px]">←</span> Home
        </button>
        <div className="h-4 w-px bg-border flex-shrink-0" />
        
        {isEditing ? (
          <input 
            ref={inputRef}
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="text-sm font-semibold text-white tracking-wide bg-black/40 border border-primary/50 rounded px-2 py-0.5 focus:outline-none w-48"
          />
        ) : (
          <button 
            onClick={() => setIsEditing(true)}
            className="group flex items-center gap-2 px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
          >
            <span className="text-sm font-semibold text-white tracking-wide">{modelName}</span>
            <PencilLine className="w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        
        <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/20 text-[10px] font-bold uppercase ml-2">Beta</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Mock Undo/Redo Buttons (Visually active but dummy logic for now) */}
        <div className="flex items-center bg-black/20 rounded-lg p-1 border border-border/50 mr-4">
          <button className="p-1.5 text-textMuted hover:text-white hover:bg-white/10 rounded transition-colors group relative" title="Undo (Cmd+Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-textMuted/30 cursor-not-allowed rounded transition-colors group relative" title="Redo (Cmd+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-textMuted hover:text-white transition-colors rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10">
          <Download className="w-3.5 h-3.5" />
          Export Model
        </button>
        <button className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primaryHover text-white transition-colors rounded-lg shadow-sm">
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
      </div>
    </header>
  );
}
