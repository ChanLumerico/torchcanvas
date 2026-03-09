import { useMemo, useState } from 'react';
import { ArrowRight, GitBranch, Info, Settings, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import {
  getInternalStates,
  getLayerColor,
  getLayerDefinition,
  getLayerDocUrl,
  type InternalStateDescriptor,
  type LayerParamValue,
  type ParamSpec,
} from '../../domain/layers';
import { sanitizePythonIdentifier } from '../../compiler/pythonSerializer';
import { BoundaryResolver } from '../../domain/graph/BoundaryResolver';
import { useWorkspaceStore } from '../../store/workspaceStore';

function EdgePanel({ edgeId }: { edgeId: string }) {
  const edges = useWorkspaceStore((state) => state.edges);
  const nodes = useWorkspaceStore((state) => state.nodes);
  const deleteEdgeById = useWorkspaceStore((state) => state.deleteEdgeById);

  const edge = edges.find((entry) => entry.id === edgeId);
  if (!edge) {
    return null;
  }

  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);
  const sourceType = sourceNode?.data.type;
  const targetType = targetNode?.data.type;
  const sourceColor = sourceType ? getLayerColor(sourceType) : '#6b7280';
  const targetColor = targetType ? getLayerColor(targetType) : '#6b7280';
  const edgeColor = typeof edge.style?.stroke === 'string' ? edge.style.stroke : sourceColor;

  return (
    <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-border/50 shadow-sm flex items-center justify-between bg-panel/80">
        <div className="flex items-center gap-2 text-textMuted">
          <GitBranch className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Edge</h2>
        </div>
        <span className="text-[10px] font-mono bg-white/5 text-textMuted/60 px-2 py-0.5 rounded truncate max-w-[130px]">
          {edgeId}
        </span>
      </div>

      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-6">
        <div
          className="flex items-center gap-2 p-3 rounded-xl border"
          style={{ borderColor: `${edgeColor}30`, background: `${edgeColor}08` }}
        >
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: sourceColor }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: sourceColor }}>
              {sourceType ?? 'Unknown'}
            </span>
            <span className="text-[9px] text-textMuted/50 truncate w-full text-center">
              {sourceNode?.data.attributeName}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: edgeColor }} />
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: targetColor }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: targetColor }}>
              {targetType ?? 'Unknown'}
            </span>
            <span className="text-[9px] text-textMuted/50 truncate w-full text-center">
              {targetNode?.data.attributeName}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 block mb-2">
            Properties
          </label>
          {[
            ['Type', edge.type ?? 'smoothstep'],
            ['Animated', String(edge.animated ?? false)],
            ['Source Shape', sourceNode?.data.outputShape ?? '—'],
            ['Target Shape', targetNode?.data.outputShape ?? '—'],
          ].map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-border/20"
            >
              <span className="text-textMuted/60">{key}</span>
              <span className="text-white/80 font-semibold">{value}</span>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border/30">
          <p className="text-[9px] text-textMuted/40 mb-3">
            You can also select the edge and press{' '}
            <kbd className="px-1 py-0.5 bg-white/5 border border-border/40 rounded text-[8px] font-mono">
              Delete
            </kbd>{' '}
            to remove it.
          </p>
          <button
            onClick={() => deleteEdgeById(edgeId)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-semibold hover:bg-red-500/15 hover:border-red-500/50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Connection
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function Inspector() {
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId);
  const selectedEdgeId = useWorkspaceStore((state) => state.selectedEdgeId);
  const graph = useWorkspaceStore((state) => state.graph);
  const updateNodeParams = useWorkspaceStore((state) => state.updateNodeParams);
  const updateNodeAttributeName = useWorkspaceStore((state) => state.updateNodeAttributeName);
  const updateModelInput = useWorkspaceStore((state) => state.updateModelInput);
  const modelName = useWorkspaceStore((state) => state.modelName);
  const setModelName = useWorkspaceStore((state) => state.setModelName);
  const deleteNodeById = useWorkspaceStore((state) => state.deleteNodeById);
  const rootNodes = useMemo(
    () => new BoundaryResolver(graph).getExecutableBoundaries().roots,
    [graph],
  );

  if (selectedEdgeId) {
    return <EdgePanel edgeId={selectedEdgeId} />;
  }

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return (
      <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10">
        <div className="p-4 border-b border-border/50 shadow-sm flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Model Properties</h2>
        </div>
        <div className="p-4 flex-1 flex flex-col text-xs">
          <div className="flex flex-col gap-1.5 mb-6">
            <label className="text-xs font-mono text-textMuted font-bold">Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="e.g. MyResNet"
            />
            <p className="text-[10px] text-textMuted/60 mt-1">
              This will be used as the Python class name.
            </p>
          </div>
          <div className="mb-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">
              Model Inputs
            </label>
            {rootNodes.length === 0 ? (
              <div className="rounded-xl border border-border/40 bg-black/20 px-3 py-3 text-[10px] text-textMuted/60 leading-relaxed">
                Add a top-level module to define the model entrypoint. Roots with no incoming
                connections become `forward(...)` arguments automatically.
              </div>
            ) : (
              <div className="space-y-3">
                {rootNodes.map((node, index) => {
                  const binding = graph.inputsByNodeId[node.id] ?? {
                    argumentName: sanitizePythonIdentifier(node.attributeName, `input_${index + 1}`),
                    shape: '',
                  };

                  return (
                    <div
                      key={node.id}
                      className="rounded-xl border border-border/40 bg-black/20 px-3 py-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-white/90 truncate">
                            {node.moduleType}
                          </div>
                          <div className="text-[10px] font-mono text-textMuted/55 truncate">
                            {node.attributeName}
                          </div>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider text-textMuted/40">
                          Root {index + 1}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider text-textMuted/50">
                            Argument Name
                          </label>
                          <input
                            type="text"
                            value={binding.argumentName}
                            onChange={(event) =>
                              updateModelInput(node.id, { argumentName: event.target.value })
                            }
                            className="bg-black/40 border border-border/80 rounded block w-full px-2.5 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
                            placeholder={`input_${index + 1}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-wider text-textMuted/50">
                            Input Shape
                          </label>
                          <input
                            type="text"
                            value={binding.shape}
                            onChange={(event) =>
                              updateModelInput(node.id, { shape: event.target.value })
                            }
                            className="bg-black/40 border border-border/80 rounded block w-full px-2.5 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-primary/50 transition-colors"
                            placeholder="[B, 3, 224, 224]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-textMuted/50 text-[10px] text-center px-4">
            <div className="w-12 h-12 rounded-full border border-dashed border-border/50 mb-3 flex items-center justify-center">
              <Settings className="w-5 h-5 opacity-50" />
            </div>
            Select a layer or connection to inspect its properties
          </div>
        </div>
      </aside>
    );
  }

  const { moduleType, params } = selectedNode;
  const layerDefinition = getLayerDefinition(moduleType);
  const docUrl = getLayerDocUrl(moduleType);

  return (
    <aside className="w-72 border-l border-border/80 bg-panel/40 flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-border/50 shadow-sm flex items-center justify-between bg-panel/80">
        <div className="flex items-center gap-2 text-textMuted">
          <Settings className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Inspector</h2>
        </div>
        <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded">
          {selectedNode.id}
        </span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60">
              Layer Type
            </label>
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] flex items-center gap-1 text-primary hover:text-primaryHover transition-colors"
                title="View PyTorch Docs"
              >
                <Info className="w-3 h-3" /> docs
              </a>
            )}
          </div>
          <div className="px-3 py-2 bg-black/20 border border-border/50 rounded-lg text-sm font-semibold text-white/90 mb-4">
            {moduleType}
          </div>

          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60">
              Attribute Name
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <AttributeNameInput
              key={selectedNode.id}
              nodeId={selectedNode.id}
              initialName={selectedNode.attributeName}
              nodes={graph.nodes}
              updateNodeAttributeName={updateNodeAttributeName}
            />
            <span className="text-[10px] text-textMuted/50 leading-tight border-t border-border/50 pt-2 mt-2">
              This represents the Python variable name (`self.{selectedNode.attributeName}`)
            </span>
          </div>
        </div>

        {Object.keys(params).length > 0 ? (
          <div className="mb-8">
            <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">
              Properties
            </label>
            <div className="space-y-4">
              {Object.entries(params).map(([paramKey, value]) => (
                <ParamControl
                  key={paramKey}
                  paramKey={paramKey}
                  value={value}
                  spec={layerDefinition.paramSpecs[paramKey]}
                  onChange={(nextValue) => updateNodeParams(selectedNode.id, { [paramKey]: nextValue })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-textMuted/60 italic mb-8">No configurable properties</div>
        )}

        <InternalStatesSection states={getInternalStates(moduleType, params)} />

        <div className="mt-8 pt-4 border-t border-border/30">
          <p className="text-[9px] text-textMuted/40 mb-3 leading-relaxed">
            Select an edge and press{' '}
            <kbd className="px-1 py-0.5 bg-white/5 border border-border/40 rounded text-[8px] font-mono">
              Delete
            </kbd>{' '}
            or{' '}
            <kbd className="px-1 py-0.5 bg-white/5 border border-border/40 rounded text-[8px] font-mono">
              Backspace
            </kbd>{' '}
            to remove it.
          </p>
          <button
            onClick={() => deleteNodeById(selectedNode.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-semibold hover:bg-red-500/15 hover:border-red-500/50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Node
          </button>
        </div>
      </div>
    </aside>
  );
}

function InternalStatesSection({ states }: { states: InternalStateDescriptor[] }) {
  if (states.length === 0) {
    return null;
  }

  return (
    <div className="pt-6 border-t border-border/40">
      <label className="text-[10px] font-bold uppercase tracking-wider text-textMuted/60 mb-3 block">
        Internal States
      </label>
      <div className="space-y-2">
        {states.map((state) => (
          <div
            key={state.name}
            className="flex flex-col gap-1 p-2 rounded bg-white/5 border border-white/5 group hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-white/80">{state.name}</span>
              <span
                className={clsx(
                  'text-[8px] uppercase tracking-tighter px-1 rounded-sm',
                  state.category === 'parameter'
                    ? 'bg-amber-500/10 text-amber-500/80'
                    : 'bg-blue-500/10 text-blue-500/80',
                )}
              >
                {state.category}
              </span>
            </div>
            <div className="text-[10px] font-mono text-textMuted/60 flex items-center gap-1.5 capitalize">
              <span className="opacity-40">Shape:</span> {state.shape}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-textMuted/40 mt-3 leading-relaxed">
        These are generated automatically by PyTorch based on your configured properties.
      </p>
    </div>
  );
}

function ParamControl({
  paramKey,
  value,
  spec,
  onChange,
}: {
  paramKey: string;
  value: LayerParamValue;
  spec: ParamSpec | undefined;
  onChange: (value: LayerParamValue) => void;
}) {
  if (spec?.kind === 'boolean' || typeof value === 'boolean' || value === 'true' || value === 'false') {
    const checked = value === true || value === 'true';
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono text-textMuted">{paramKey}</label>
        <button
          onClick={() => onChange(!checked)}
          className={clsx(
            'w-8 h-4 rounded-full relative transition-colors border',
            checked ? 'bg-primary border-primary' : 'bg-black/40 border-border/80',
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform',
              checked ? 'translate-x-4' : 'translate-x-1 opacity-50',
            )}
          />
        </button>
      </div>
    );
  }

  const inputType = spec?.kind === 'number' ? 'number' : 'text';

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-mono text-textMuted">{paramKey}</label>
      <input
        type={inputType}
        value={String(value)}
        onChange={(event) => {
          if (spec?.kind === 'number') {
            onChange(event.target.value);
            return;
          }

          onChange(event.target.value);
        }}
        className="bg-black/40 border border-border/80 rounded block w-full px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-primary/50 transition-colors placeholder:text-textMuted/30"
      />
    </div>
  );
}

function AttributeNameInput({
  nodeId,
  initialName,
  nodes,
  updateNodeAttributeName,
}: {
  nodeId: string;
  initialName: string;
  nodes: Array<{ id: string; attributeName: string }>;
  updateNodeAttributeName: (id: string, name: string) => void;
}) {
  const [localName, setLocalName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (value: string) => {
    const safeName = sanitizePythonIdentifier(value, '');
    setLocalName(value);

    if (!safeName) {
      setError('Name cannot be empty');
      return;
    }

    const exists = nodes.some((node) => node.id !== nodeId && node.attributeName === safeName);
    if (exists) {
      setError(`'${safeName}' is already in use.`);
      return;
    }

    setError(null);
    updateNodeAttributeName(nodeId, safeName);
  };

  return (
    <>
      <input
        type="text"
        value={localName}
        onChange={(event) => handleChange(event.target.value)}
        className={clsx(
          'bg-black/40 border rounded block w-full px-3 py-1.5 text-sm font-mono focus:outline-none transition-colors',
          error
            ? 'border-red-500/50 text-red-200 focus:border-red-500'
            : 'border-border/80 text-white focus:border-primary/50',
        )}
      />
      {error && <span className="text-[10px] text-red-400 font-medium">{error}</span>}
    </>
  );
}
