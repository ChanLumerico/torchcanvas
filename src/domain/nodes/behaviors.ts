import { getLayerDefinition, type ModuleType } from '../layers';
import type { GraphNode, GraphNodeDimensions, GraphPosition } from '../graph/types';
import { CONTAINER_LAYOUT } from './layout';

export interface ContainerDropZone extends GraphPosition, GraphNodeDimensions {}

export interface ConnectionPolicy {
  minIncomingEdges: number;
  maxIncomingEdges: number;
  canSourceConnections: boolean;
  canTargetConnections: boolean;
  allowDirectChildConnections: boolean;
}

export interface NodePresentationSpec {
  compact: boolean;
  hideHandles: boolean;
}

export interface ContainerChildLayout {
  position: GraphPosition;
  dimensions: GraphNodeDimensions;
  presentation: NodePresentationSpec;
}

export interface ConnectedStateContext {
  explicitConnected: boolean;
  hasConnectedChild: boolean;
}

export type ContainerCompilerKind = 'standard' | 'sequential' | 'module-list' | 'module-dict';

const UNBOUNDED_INPUTS = Number.POSITIVE_INFINITY;

export abstract class AbstractNodeBehavior {
  readonly type: ModuleType;

  constructor(type: ModuleType) {
    this.type = type;
  }

  get definition() {
    return getLayerDefinition(this.type);
  }

  isContainer(): boolean {
    return this.definition.kind === 'container';
  }

  isNestableLayer(): boolean {
    return this.definition.kind === 'module';
  }

  isNestableContainer(): boolean {
    return this.isContainer() && this.isCallable();
  }

  isCallable(): boolean {
    return this.isNestableLayer();
  }

  usesImplicitChildExecution(): boolean {
    return false;
  }

  getCompilerKind(): ContainerCompilerKind {
    return 'standard';
  }

  getConnectionPolicy(): ConnectionPolicy {
    return {
      minIncomingEdges: 1,
      maxIncomingEdges: 1,
      canSourceConnections: true,
      canTargetConnections: true,
      allowDirectChildConnections: true,
    };
  }

  canAcceptChild(childBehavior: AbstractNodeBehavior): boolean {
    void childBehavior;
    return false;
  }

  canBeNestedIn(parentBehavior: AbstractNodeBehavior): boolean {
    return this.isNestableLayer() && parentBehavior.canAcceptChild(this);
  }

  getConnectedState(context: ConnectedStateContext): boolean {
    return context.explicitConnected;
  }

  getChildPresentationSpec(): NodePresentationSpec {
    return {
      compact: false,
      hideHandles: false,
    };
  }

  getChildWidth(): number {
    return CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2;
  }

  getChildLeft(): number {
    return CONTAINER_LAYOUT.paddingX;
  }

  getContainerDimensions(childCount: number): GraphNodeDimensions {
    void childCount;
    return {
      width: CONTAINER_LAYOUT.width,
      height: CONTAINER_LAYOUT.minHeight,
    };
  }

  getChildLayout(order: number, childCount: number): ContainerChildLayout {
    void order;
    void childCount;
    return {
      position: { x: 0, y: 0 },
      dimensions: { width: 0, height: 0 },
      presentation: this.getChildPresentationSpec(),
    };
  }

  getDropZone(childCount: number): ContainerDropZone | null {
    void childCount;
    return null;
  }

  resolveInsertIndex(_relativeY: number, childCount: number): number {
    return childCount;
  }
}

export class StandardLayerNodeBehavior extends AbstractNodeBehavior {
  override getConnectionPolicy(): ConnectionPolicy {
    if (this.type === 'Bilinear') {
      return {
        minIncomingEdges: 2,
        maxIncomingEdges: 2,
        canSourceConnections: true,
        canTargetConnections: true,
        allowDirectChildConnections: true,
      };
    }

    return super.getConnectionPolicy();
  }
}

export class InputNodeBehavior extends AbstractNodeBehavior {
  override isCallable(): boolean {
    return false;
  }

  override canBeNestedIn(): boolean {
    return false;
  }

  override getConnectionPolicy(): ConnectionPolicy {
    return {
      minIncomingEdges: 0,
      maxIncomingEdges: 0,
      canSourceConnections: true,
      canTargetConnections: false,
      allowDirectChildConnections: true,
    };
  }
}

export class OutputNodeBehavior extends AbstractNodeBehavior {
  override isCallable(): boolean {
    return false;
  }

  override canBeNestedIn(): boolean {
    return false;
  }

  override getConnectionPolicy(): ConnectionPolicy {
    return {
      minIncomingEdges: 1,
      maxIncomingEdges: UNBOUNDED_INPUTS,
      canSourceConnections: false,
      canTargetConnections: true,
      allowDirectChildConnections: true,
    };
  }
}

export abstract class AbstractContainerNodeBehavior extends AbstractNodeBehavior {
  override canAcceptChild(childBehavior: AbstractNodeBehavior): boolean {
    return childBehavior.isNestableLayer() || childBehavior.isNestableContainer();
  }

  override canBeNestedIn(parentBehavior: AbstractNodeBehavior): boolean {
    return this.isNestableContainer() && parentBehavior.canAcceptChild(this);
  }

  override getConnectionPolicy(): ConnectionPolicy {
    return {
      minIncomingEdges: 0,
      maxIncomingEdges: this.isCallable() ? 1 : 0,
      canSourceConnections: this.isCallable(),
      canTargetConnections: this.isCallable(),
      allowDirectChildConnections: true,
    };
  }

  override getConnectedState(context: ConnectedStateContext): boolean {
    return context.explicitConnected || context.hasConnectedChild;
  }

  getChildWidth(): number {
    return CONTAINER_LAYOUT.width - CONTAINER_LAYOUT.paddingX * 2;
  }

  override getChildLeft(): number {
    return CONTAINER_LAYOUT.paddingX;
  }

  override getChildPresentationSpec(): NodePresentationSpec {
    return {
      compact: true,
      hideHandles: !this.getConnectionPolicy().allowDirectChildConnections,
    };
  }

  override getContainerDimensions(childCount: number): GraphNodeDimensions {
    const usedHeight =
      CONTAINER_LAYOUT.stackTop +
      childCount * CONTAINER_LAYOUT.childHeight +
      Math.max(childCount - 1, 0) * CONTAINER_LAYOUT.childGap +
      CONTAINER_LAYOUT.bottomPadding;

    return {
      width: CONTAINER_LAYOUT.width,
      height: Math.max(CONTAINER_LAYOUT.minHeight, usedHeight),
    };
  }

  override getChildLayout(order: number): ContainerChildLayout {
    return {
      position: {
        x: this.getChildLeft(),
        y:
          CONTAINER_LAYOUT.stackTop +
          order * (CONTAINER_LAYOUT.childHeight + CONTAINER_LAYOUT.childGap),
      },
      dimensions: {
        width: this.getChildWidth(),
        height: CONTAINER_LAYOUT.childHeight,
      },
      presentation: this.getChildPresentationSpec(),
    };
  }

  override getDropZone(childCount: number): ContainerDropZone {
    const dimensions = this.getContainerDimensions(childCount);
    const startY = CONTAINER_LAYOUT.stackTop - Math.floor(CONTAINER_LAYOUT.childGap / 2);

    return {
      x: this.getChildLeft(),
      y: startY,
      width: this.getChildWidth(),
      height: Math.max(
        CONTAINER_LAYOUT.childHeight,
        dimensions.height - startY - Math.floor(CONTAINER_LAYOUT.bottomPadding / 2),
      ),
    };
  }

  override resolveInsertIndex(relativeY: number, childCount: number): number {
    if (relativeY <= CONTAINER_LAYOUT.stackTop) {
      return 0;
    }

    const step = CONTAINER_LAYOUT.childHeight + CONTAINER_LAYOUT.childGap;
    const rawIndex =
      (relativeY - CONTAINER_LAYOUT.stackTop + CONTAINER_LAYOUT.childGap / 2) / step;

    return Math.max(0, Math.min(childCount, Math.floor(rawIndex) + 1));
  }
}

export class SequentialContainerBehavior extends AbstractContainerNodeBehavior {
  override isCallable(): boolean {
    return true;
  }

  override usesImplicitChildExecution(): boolean {
    return true;
  }

  override getCompilerKind(): ContainerCompilerKind {
    return 'sequential';
  }

  override getConnectionPolicy(): ConnectionPolicy {
    return {
      minIncomingEdges: 0,
      maxIncomingEdges: 1,
      canSourceConnections: true,
      canTargetConnections: true,
      allowDirectChildConnections: false,
    };
  }

  override getChildWidth(): number {
    return CONTAINER_LAYOUT.centeredSequentialChildWidth;
  }

  override getChildLeft(): number {
    return Math.round((CONTAINER_LAYOUT.width - this.getChildWidth()) / 2);
  }
}

export class ModuleListContainerBehavior extends AbstractContainerNodeBehavior {
  override getCompilerKind(): ContainerCompilerKind {
    return 'module-list';
  }
}

export class ModuleDictContainerBehavior extends AbstractContainerNodeBehavior {
  override getCompilerKind(): ContainerCompilerKind {
    return 'module-dict';
  }
}

export class NodeBehaviorFactory {
  private readonly behaviors = new Map<ModuleType, AbstractNodeBehavior>();

  getBehavior(type: ModuleType): AbstractNodeBehavior {
    const existing = this.behaviors.get(type);
    if (existing) {
      return existing;
    }

    const behavior = this.createBehavior(type);
    this.behaviors.set(type, behavior);
    return behavior;
  }

  private createBehavior(type: ModuleType): AbstractNodeBehavior {
    switch (type) {
      case 'Input':
        return new InputNodeBehavior(type);
      case 'Output':
        return new OutputNodeBehavior(type);
      case 'Sequential':
        return new SequentialContainerBehavior(type);
      case 'ModuleList':
        return new ModuleListContainerBehavior(type);
      case 'ModuleDict':
        return new ModuleDictContainerBehavior(type);
      default:
        return new StandardLayerNodeBehavior(type);
    }
  }
}

export const nodeBehaviorFactory = new NodeBehaviorFactory();

export function getNodeBehavior(type: ModuleType): AbstractNodeBehavior {
  return nodeBehaviorFactory.getBehavior(type);
}

export function getNodeBehaviorForNode(node: Pick<GraphNode, 'moduleType'>): AbstractNodeBehavior {
  return getNodeBehavior(node.moduleType);
}
