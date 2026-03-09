import type { GraphLayoutState, GraphModel, GraphPosition } from '../graph/types';
import { ContainerLayoutEngine } from '../graph/ContainerLayoutEngine';
import type { ContainerDropTarget } from '../graph/utils';
import type { ModuleType } from '../layers';

export class InteractionController {
  private readonly layout: Pick<GraphLayoutState, 'positionsById'>;
  private readonly layoutEngine: ContainerLayoutEngine;

  constructor(
    graph: Pick<GraphModel, 'nodes' | 'edges'>,
    layout: Pick<GraphLayoutState, 'positionsById'>,
  ) {
    this.layout = layout;
    this.layoutEngine = new ContainerLayoutEngine(graph);
  }

  resolveContainerDropTarget(
    position: GraphPosition,
    candidateType?: ModuleType,
    excludeNodeId?: string,
  ): ContainerDropTarget | null {
    return this.layoutEngine.resolveDropTarget(
      this.layout,
      position,
      candidateType,
      excludeNodeId,
    );
  }

  toAbsoluteTopLevelPosition(
    canvasPosition: GraphPosition,
    offset: Pick<GraphPosition, 'x' | 'y'>,
  ): GraphPosition {
    return {
      x: canvasPosition.x - offset.x,
      y: canvasPosition.y - offset.y,
    };
  }
}
