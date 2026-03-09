# 🔥 TorchCanvas

<div align="center">
  <img src="https://github.com/user-attachments/assets/97f9a2b4-05c1-41e2-8aba-4e7f3f3794c1" width="80%">
</div>

TorchCanvas is a browser-based visual model builder for PyTorch.
Users drag `torch.nn` modules onto a canvas, connect them as a graph, organize them into container nodes such as `Sequential`, and get generated PyTorch code in real time.

This README is written as a handoff document for future agents and contributors.
The goal is that a fresh session can read this file and continue work without rediscovering the architecture from scratch.

## Product Intent

TorchCanvas is trying to feel like a Figma-style model editor for PyTorch:

- The canvas is the source of truth for model structure.
- Only real PyTorch modules should appear in the user-facing layer library.
- The generated `model.py` and `train.py` should reflect the current graph immediately.
- Container nodes such as `Sequential` are special, but they must still behave like normal top-level nodes from the user's point of view.
- Frontend interaction stability matters as much as compiler correctness. A graph editor that silently reparents or rewires nodes is unacceptable.

## Current Product Rules

These rules are now foundational. Do not casually reintroduce older behavior.

### 1. No `Input` / `Output` nodes in the canvas

`Input` and `Output` were removed as user-visible nodes.

The canvas now contains only actual PyTorch modules.

Model boundaries are inferred:

- A **root** is an executable node with zero incoming explicit edges.
- A **sink** is an executable node with zero outgoing explicit edges.
- Children inside implicit-execution containers like `Sequential` are not treated as standalone roots/sinks. The parent callable container is the boundary candidate instead.

### 2. Model input metadata lives at the model level

Because there are no `Input` nodes anymore, root input information is stored on the graph itself:

- `graph.inputsByNodeId[nodeId] = { argumentName, shape }`

This metadata is edited from the Inspector when no node is selected.

Current behavior:

- New roots get auto-created bindings.
- Removed roots lose bindings.
- Default `argumentName` is derived from the root node attribute name.
- `shape` is optional for `model.py` generation.
- Missing `shape` degrades shape inference and causes `train.py` export to return a warning stub instead of fake data generation.

### 3. `Sequential` is a callable container node

`Sequential` is not a weird special mode of the canvas.
It is a real graph node with container behavior:

- It can receive explicit external edges.
- It can emit explicit external edges.
- Its child execution order is driven only by `containerOrder`.
- Internal execution edges are **derived for display only** and are not stored in `graph.edges`.

`ModuleList` and `ModuleDict` share the same container infrastructure but are non-callable containers.

### 4. Mutation logic must go through the domain layer

The frontend should not mutate graph/layout state ad hoc.

The intended mutation entrypoint is:

- `src/domain/graph/GraphDocument.ts`

This class centralizes graph/layout mutations and normalizes:

- node insertion
- container insertion
- reparenting
- extraction from containers
- edge creation/deletion
- node deletion
- node param edits
- attribute name edits
- root input binding sync

If a future change bypasses `GraphDocument` and mutates store state directly, that is a regression risk.

## Architecture Overview

The codebase is split into a few important layers.

### UI layer

- `src/pages/Workspace.tsx`
  Orchestrates autosave, import/export, and the main workspace layout.
- `src/components/workspace/Canvas.tsx`
  React Flow integration, drag/drop, node drag behavior, container drop targeting, omnibar, drag overlay.
- `src/components/workspace/Inspector.tsx`
  Node inspector and model-level root input editor.
- `src/components/workspace/CodePreview.tsx`
  Renders generated `model.py` and `train.py`.
- `src/components/workspace/Sidebar.tsx`
  Layer library.
- `src/components/workspace/Toolbar.tsx`
  Save/import/export/undo/redo controls.

### Store layer

- `src/store/workspaceStore.ts`

Zustand store that exposes the UI-friendly API.

Important design choice:

- The store's canonical state is `graph + layout + history`.
- React Flow nodes/edges are projections, not the source of truth.

### Graph/domain layer

- `src/domain/graph/types.ts`
  Canonical domain types.
- `src/domain/graph/utils.ts`
  Graph indexing, container layout calculations, container order normalization, derived sequential edges.
- `src/domain/graph/BoundaryResolver.ts`
  Computes executable roots/sinks and synchronizes `inputsByNodeId`.
- `src/domain/graph/GraphDocument.ts`
  Stateful domain mutation wrapper over graph + layout.
- `src/domain/graph/reactFlowAdapter.ts`
  Converts domain graph/layout into React Flow nodes and edges.
- `src/domain/graph/validation.ts`
  Connection validation and compilation validation.

### Node behavior layer

- `src/domain/nodes/behaviors.ts`

This is the OOP-style behavior layer.
Persisted graph state stays plain JSON-like data, but node behavior is encoded in class hierarchy.

Current class structure:

- `AbstractNodeBehavior`
- `StandardLayerNodeBehavior`
- `AbstractContainerNodeBehavior`
- `SequentialContainerBehavior`
- `ModuleListContainerBehavior`
- `ModuleDictContainerBehavior`

This is intentional.
The project uses a hybrid model:

- persisted/store state is plain data
- behavioral semantics are class-based

That keeps serialization stable while still giving maintainable polymorphism.

### Layer registry

- `src/domain/layers/registry.ts`

Single source of truth for layer metadata:

- categories
- colors
- default params
- docs links
- param specs
- internal state descriptors

Sidebar, Omnibar, compiler param serialization, and visual metadata should all flow from this registry.

### Compiler layer

- `src/compiler/pytorchCompiler.ts`
- `src/compiler/shapeInference.ts`
- `src/compiler/pythonSerializer.ts`

Responsibilities:

- compile canvas graph to `model.py`
- compile a dummy `train.py`
- infer display shapes
- serialize Python values correctly

### Project persistence

- `src/domain/project/projectFile.ts`

Current persisted project format is v2.

Important decisions:

- `schemaVersion: 2`
- autosave key: `torchcanvas:autosave:v2`
- legacy `Input`/`Output` projects are explicitly rejected
- legacy autosave snapshots are explicitly rejected

## Core Domain Types

The canonical graph type is:

```ts
interface GraphModel {
  modelName: string
  inputsByNodeId: Record<string, { argumentName: string; shape: string }>
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

`GraphNode` includes:

- `id`
- `moduleType`
- `attributeName`
- `params`
- optional `containerId`
- optional `containerOrder`

`GraphLayoutState` includes:

- `positionsById`
- `dimensionsById`
- `selection`
- optional `viewport`

## Execution Semantics

### Standard modules

Normal modules behave like ordinary callable PyTorch layers.

Examples:

- `Conv2d`
- `Linear`
- `ReLU`
- `Flatten`

### `Sequential`

`Sequential` compiles to `nn.Sequential(...)`.

Rules:

- children are executed in `containerOrder`
- child execution edges are derived visually, not stored
- direct child external wiring is blocked
- parent container receives the explicit external connections

### `ModuleList`

`ModuleList` is non-callable.

Rules:

- container exists in the graph
- child modules can still be explicitly connected
- compiler uses child access syntax from the container

### `ModuleDict`

`ModuleDict` is also non-callable.

Rules:

- child modules remain executable
- compiler uses key-based access
- the container itself cannot be used as a source or target endpoint

## Boundary / Codegen Rules

### `model.py`

`model.py` generation is driven by roots and sinks:

- roots become `forward(...)` arguments
- sinks become `return` values
- multiple roots create multiple args
- multiple sinks produce tuple returns

Example:

- two disconnected executable roots -> `forward(self, image, meta)`
- two sinks -> `return (x1, x2)`

### `train.py`

`train.py` uses `inputsByNodeId.shape` for root dummy inputs.

If a root is missing shape metadata:

- `model.py` still generates
- `train.py` becomes an explicit warning stub

This is deliberate.

## Container Interaction Rules

The container UX is built around explicit drop zones.

Supported interactions:

- add top-level nodes
- insert into container body
- reorder within container
- extract child back to top-level
- move top-level nodes independently

Not acceptable:

- implicit reparenting because a drop happened near a container shell
- unrelated sequentials changing because a new node was added elsewhere
- hidden automatic explicit edges between top-level nodes

If one of these shows up again, start debugging from:

- `src/domain/graph/GraphDocument.ts`
- `src/domain/graph/utils.ts`
- `src/components/workspace/Canvas.tsx`

## Important Constraints

### Removed features

These are intentionally gone:

- `Input` node
- `Output` node
- `Merge` / `Concat`

Do not reintroduce them casually.
If a future feature needs tensor ops beyond actual `torch.nn` modules, design that explicitly instead of sneaking them back in as pseudo-layers.

### Legacy compatibility policy

Legacy projects containing removed boundary nodes are rejected.
There is currently no migration path from old `Input`/`Output` projects.

That is a product decision, not an accidental omission.

## Development Workflow

### Install

```bash
npm install
```

### Run dev server

```bash
npm run dev
```

Usually this opens on `http://localhost:5173`.

### Production preview

```bash
npm run build
npm run preview
```

### Validation commands

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

The project should be considered unstable if any of these fail.

## Testing Strategy

### Unit tests

Unit coverage currently exists for:

- layer registry
- graph utils
- graph validation
- project persistence
- compiler
- shape inference
- store mutation behavior
- node behavior classes
- React Flow derived sequential edges

### E2E tests

Playwright coverage currently checks:

- `Input` / `Output` are absent from the UI
- root input metadata appears in Inspector automatically
- sequential containers remain stable when adding siblings/top-level nodes
- explicit connections to sequential containers work
- save/import work with v2 projects
- legacy project import is rejected
- legacy autosave restore is rejected

If a frontend interaction bug slips through, add an E2E for it.
This project has already had bugs that unit tests could not catch because the state logic was correct but the rendered interaction was not.

## Recommended Debugging Order

When behavior is wrong, debug in this order:

1. `src/domain/graph/types.ts`
   Is the canonical state capable of representing the feature?
2. `src/domain/graph/GraphDocument.ts`
   Is the mutation correct?
3. `src/domain/graph/utils.ts`
   Are container ordering/layout helpers correct?
4. `src/domain/graph/validation.ts`
   Is the graph being rejected/accepted correctly?
5. `src/domain/graph/reactFlowAdapter.ts`
   Is the projection to React Flow wrong?
6. `src/components/workspace/Canvas.tsx`
   Is the UI interaction/hit-testing wrong?
7. `src/compiler/pytorchCompiler.ts`
   Is the graph valid but codegen wrong?

This order matters.
The project used to have bugs caused by fixing symptoms in the canvas layer while the real issue was inconsistent domain mutation.

## Known Rough Edges / Likely Future Work

Areas that are good candidates for future extension:

- better model input editing UX
- more explicit reorder affordances for container children
- richer container interaction animation
- additional supported `torch.nn` modules
- more informative compiler/export warnings
- optional project migration tooling if legacy compatibility becomes important

## Files New Sessions Should Read First

If a new agent needs to continue work, start here:

1. `src/domain/layers/registry.ts`
2. `src/domain/nodes/behaviors.ts`
3. `src/domain/graph/types.ts`
4. `src/domain/graph/BoundaryResolver.ts`
5. `src/domain/graph/GraphDocument.ts`
6. `src/domain/graph/utils.ts`
7. `src/store/workspaceStore.ts`
8. `src/components/workspace/Canvas.tsx`
9. `src/compiler/pytorchCompiler.ts`
10. `src/domain/project/projectFile.ts`

That path gives the fastest mental model of how the app actually works.

## Short Summary

TorchCanvas is no longer a template project.
It is a graph editor with:

- a domain-first graph model
- class-based node behavior semantics
- React Flow as a projection layer
- root/sink boundary inference instead of `Input`/`Output` nodes
- versioned v2 project persistence
- compiler + shape inference + E2E coverage built around those rules

If future work preserves those invariants, the codebase stays maintainable.
If future work bypasses them for quick fixes, the graph editor will become unstable again.
