import { describe, expect, it } from 'vitest';

import { getAllLayerEntries, getLayerCategories, getQuickAddLayerEntries, layerRegistry } from './registry';

describe('layerRegistry', () => {
  it('provides metadata for every registered layer', () => {
    Object.entries(layerRegistry).forEach(([type, definition]) => {
      expect(type.length).toBeGreaterThan(0);
      expect(definition.category.length).toBeGreaterThan(0);
      expect(definition.color).toMatch(/^#/);
      expect(definition.paramSpecs).toBeTypeOf('object');
      expect(definition.defaultParams).toBeTypeOf('object');
      expect(typeof definition.internalStateResolver).toBe('function');
    });
  });

  it('derives sidebar and omnibar data from the same registry', () => {
    const registryTypes = getAllLayerEntries().map((entry) => entry.type).sort();
    const sidebarTypes = getLayerCategories()
      .flatMap((group) => group.items)
      .sort();
    const quickAddTypes = getQuickAddLayerEntries().map((entry) => entry.type);

    expect(sidebarTypes).toEqual(registryTypes);
    quickAddTypes.forEach((type) => {
      expect(registryTypes).toContain(type);
    });
  });

  it('does not expose removed merge layers', () => {
    const categories = getLayerCategories().map((group) => group.category);
    const registryTypes = getAllLayerEntries().map((entry) => entry.type);

    expect(categories).not.toContain('Merge');
    expect(registryTypes).not.toContain('Concat');
  });
});
