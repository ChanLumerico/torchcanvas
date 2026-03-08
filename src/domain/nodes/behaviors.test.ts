import { describe, expect, it } from 'vitest';

import {
  ModuleDictContainerBehavior,
  SequentialContainerBehavior,
  StandardLayerNodeBehavior,
  getNodeBehavior,
} from './behaviors';

describe('node behaviors', () => {
  it('returns specialized behavior classes for container nodes', () => {
    expect(getNodeBehavior('Sequential')).toBeInstanceOf(SequentialContainerBehavior);
    expect(getNodeBehavior('ModuleDict')).toBeInstanceOf(ModuleDictContainerBehavior);
    expect(getNodeBehavior('Conv2d')).toBeInstanceOf(StandardLayerNodeBehavior);
  });

  it('treats sequential as a callable container with protected child endpoints', () => {
    const sequential = getNodeBehavior('Sequential');
    const linear = getNodeBehavior('Linear');

    expect(sequential.isCallable()).toBe(true);
    expect(sequential.getConnectionPolicy().allowDirectChildConnections).toBe(false);
    expect(linear.canBeNestedIn(sequential)).toBe(true);
  });

  it('treats moduledict as a non-callable container', () => {
    const moduleDict = getNodeBehavior('ModuleDict');

    expect(moduleDict.isCallable()).toBe(false);
    expect(moduleDict.getConnectionPolicy().canTargetConnections).toBe(false);
    expect(moduleDict.getConnectionPolicy().canSourceConnections).toBe(false);
  });

  it('does not allow special endpoint nodes to be nested inside containers', () => {
    const sequential = getNodeBehavior('Sequential');
    const input = getNodeBehavior('Input');
    const output = getNodeBehavior('Output');

    expect(input.canBeNestedIn(sequential)).toBe(false);
    expect(output.canBeNestedIn(sequential)).toBe(false);
  });
});
