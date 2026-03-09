import type { GraphLayoutState, GraphModel, GraphPosition } from './types';
import type { ContainerDropTarget, ContainerLayoutIndex } from './utils';
import { buildContainerLayoutIndex, getContainerDropTargetAtPosition } from './utils';
import type { ModuleType } from '../layers';

export class ContainerLayoutEngine {
  private readonly graph: Pick<GraphModel, 'nodes' | 'edges'>;

  constructor(graph: Pick<GraphModel, 'nodes' | 'edges'>) {
    this.graph = graph;
  }

  buildLayoutIndex(): ContainerLayoutIndex {
    return buildContainerLayoutIndex(this.graph);
  }

  resolveDropTarget(
    layout: Pick<GraphLayoutState, 'positionsById'>,
    position: GraphPosition,
    candidateType?: ModuleType,
    excludeNodeId?: string,
  ): ContainerDropTarget | null {
    return getContainerDropTargetAtPosition(
      this.graph,
      layout,
      position,
      candidateType,
      excludeNodeId,
    );
  }
}
