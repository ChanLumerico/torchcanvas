import { useCallback, useEffect, useMemo, useRef } from 'react';

import { generatePytorchCode } from '../compiler/pytorchCompiler';
import { sanitizePythonIdentifier } from '../compiler/pythonSerializer';
import Sidebar from '../components/workspace/Sidebar';
import CodePreview from '../components/workspace/CodePreview';
import Canvas from '../components/workspace/Canvas';
import Inspector from '../components/workspace/Inspector';
import Toolbar from '../components/workspace/Toolbar';
import { TORCHCANVAS_FIT_VIEW_EVENT } from '../components/workspace/workspaceEvents';
import {
  TORCHCANVAS_AUTOSAVE_KEY,
  createProjectFileName,
  isProjectContentEmpty,
  parseProjectFile,
  projectToGraphLayoutState,
  serializeProject,
} from '../domain/project/projectFile';
import { useWorkspaceStore } from '../store/workspaceStore';

export default function Workspace({ onExitWorkspace }: { onExitWorkspace: () => void }) {
  const graph = useWorkspaceStore((state) => state.graph);
  const positionsById = useWorkspaceStore((state) => state.layout.positionsById);
  const dimensionsById = useWorkspaceStore((state) => state.layout.dimensionsById);
  const isDirty = useWorkspaceStore((state) => state.isDirty);
  const replaceWorkspace = useWorkspaceStore((state) => state.replaceWorkspace);
  const markPersistedBaseline = useWorkspaceStore((state) => state.markPersistedBaseline);
  const restoreHandledRef = useRef(false);
  const preserveAutosaveRef = useRef(false);

  const persistedLayout = useMemo(
    () => ({
      positionsById,
      dimensionsById,
    }),
    [dimensionsById, positionsById],
  );

  const dispatchFitView = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event(TORCHCANVAS_FIT_VIEW_EVENT));
    });
  }, []);

  const downloadTextFile = useCallback((filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportModel = useCallback(() => {
    const safeModelName = sanitizePythonIdentifier(graph.modelName, 'generated_model');
    downloadTextFile(
      `${safeModelName}.py`,
      generatePytorchCode(graph),
      'text/x-python',
    );
  }, [downloadTextFile, graph]);

  const handleSaveProject = useCallback(() => {
    const project = serializeProject(graph, persistedLayout);
    downloadTextFile(
      createProjectFileName(graph.modelName),
      `${JSON.stringify(project, null, 2)}\n`,
      'application/json',
    );
    markPersistedBaseline();
  }, [downloadTextFile, graph, markPersistedBaseline, persistedLayout]);

  const handleImportProjectFile = useCallback(
    async (file: File) => {
      if (isDirty) {
        const shouldReplace = window.confirm(
          'Replace the current workspace with the imported project? Unsaved changes will be lost.',
        );
        if (!shouldReplace) {
          return;
        }
      }

      try {
        const text = await file.text();
        const project = parseProjectFile(text);
        replaceWorkspace(project.graph, projectToGraphLayoutState(project));
        dispatchFitView();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to import the selected TorchCanvas project.';
        window.alert(message);
      }
    },
    [dispatchFitView, isDirty, replaceWorkspace],
  );

  useEffect(() => {
    if (restoreHandledRef.current) {
      return;
    }

    restoreHandledRef.current = true;

    if (!isProjectContentEmpty(graph, persistedLayout)) {
      return;
    }

    const rawAutosave = window.localStorage.getItem(TORCHCANVAS_AUTOSAVE_KEY);
    if (!rawAutosave) {
      return;
    }

    try {
      const project = parseProjectFile(rawAutosave);
      if (isProjectContentEmpty(project.graph, project.layout)) {
        window.localStorage.removeItem(TORCHCANVAS_AUTOSAVE_KEY);
        return;
      }

      const shouldRestore = window.confirm(
        'A saved TorchCanvas session was found. Restore your last workspace?',
      );
      if (!shouldRestore) {
        preserveAutosaveRef.current = true;
        return;
      }

      preserveAutosaveRef.current = false;
      replaceWorkspace(project.graph, projectToGraphLayoutState(project));
      dispatchFitView();
    } catch {
      window.localStorage.removeItem(TORCHCANVAS_AUTOSAVE_KEY);
    }
  }, [dispatchFitView, graph, persistedLayout, replaceWorkspace]);

  useEffect(() => {
    if (isProjectContentEmpty(graph, persistedLayout)) {
      if (!preserveAutosaveRef.current) {
        window.localStorage.removeItem(TORCHCANVAS_AUTOSAVE_KEY);
      }
      return;
    }

    preserveAutosaveRef.current = false;
    const timeoutId = window.setTimeout(() => {
      const project = serializeProject(graph, persistedLayout);
      window.localStorage.setItem(TORCHCANVAS_AUTOSAVE_KEY, JSON.stringify(project));
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [graph, persistedLayout]);

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <Toolbar
        onExitWorkspace={onExitWorkspace}
        onExportModel={handleExportModel}
        onSaveProject={handleSaveProject}
        onImportProjectFile={handleImportProjectFile}
        isDirty={isDirty}
      />
      
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        <Canvas />
        <Inspector />
      </div>
      
      <CodePreview />
    </div>
  );
}
