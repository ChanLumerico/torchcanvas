import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { Download, Save, Undo2, Redo2, PencilLine, Upload } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface ToolbarProps {
  onExitWorkspace: () => void;
  onExportModel: () => void;
  onSaveProject: () => void;
  onImportProjectFile: (file: File) => Promise<void> | void;
  isDirty: boolean;
}

export default function Toolbar({
  onExitWorkspace,
  onExportModel,
  onSaveProject,
  onImportProjectFile,
  isDirty,
}: ToolbarProps) {
  const modelName = useWorkspaceStore((state) => state.modelName);
  const setModelName = useWorkspaceStore((state) => state.setModelName);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const canUndo = useWorkspaceStore((state) => state.canUndo);
  const canRedo = useWorkspaceStore((state) => state.canRedo);

  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (!modelName.trim()) setModelName('GeneratedModel');
    }
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await onImportProjectFile(file);
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            void handleImportChange(event);
          }}
        />

        {/* Undo / Redo */}
        <div className="flex items-center bg-black/20 rounded-lg p-1 border border-border/50 mr-4">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
            className="p-1.5 text-textMuted hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
            className="p-1.5 text-textMuted hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleImportButtonClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-textMuted hover:text-white transition-colors rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
        >
          <Upload className="w-3.5 h-3.5" />
          Import Project
        </button>
        <button
          onClick={onExportModel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-textMuted hover:text-white transition-colors rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
        >
          <Download className="w-3.5 h-3.5" />
          Export Model
        </button>
        <button
          onClick={onSaveProject}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primaryHover text-white transition-colors rounded-lg shadow-sm"
          title={isDirty ? 'Project has unsaved changes' : 'Project saved'}
        >
          <Save className="w-3.5 h-3.5" />
          Save Project
        </button>
      </div>
    </header>
  );
}
