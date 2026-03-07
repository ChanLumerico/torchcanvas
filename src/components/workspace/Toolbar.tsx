export default function Toolbar({ onExitWorkspace }: { onExitWorkspace: () => void }) {
  return (
    <header className="h-14 border-b border-border/80 flex items-center justify-between px-4 shrink-0 glass-panel z-20">
      <div className="flex items-center gap-4">
        <button 
          onClick={onExitWorkspace} 
          className="text-xs font-semibold text-textMuted hover:text-white transition-colors flex items-center gap-1"
        >
          <span className="text-[10px]">←</span> Home
        </button>
        <div className="h-4 w-px bg-border flex-shrink-0" />
        <span className="text-sm font-semibold text-white tracking-wide">Untitled Model</span>
        <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase ml-2">Beta</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="px-4 py-1.5 text-xs font-medium text-textMuted hover:text-white transition-colors rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10">
          Export Model
        </button>
        <button className="px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primaryHover text-white transition-colors rounded-lg shadow-sm">
          Save
        </button>
      </div>
    </header>
  );
}
