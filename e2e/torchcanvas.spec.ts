import { expect, test, type Locator, type Page } from '@playwright/test';

type DropPosition = {
  xRatio: number;
  yRatio: number;
};

async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Launch App' }).click();
  await expect(page.locator('.react-flow').first()).toBeVisible();
}

async function getCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('.react-flow').first();
  await expect(canvas).toBeVisible();
  return canvas;
}

async function clickCanvas(page: Page, position: DropPosition): Promise<void> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box was not available.');
  }

  await page.mouse.click(box.x + box.width * position.xRatio, box.y + box.height * position.yRatio);
}

async function dragLayerToCanvas(
  page: Page,
  layerName: string,
  position: DropPosition,
): Promise<void> {
  const source = page.locator('[draggable="true"]').filter({ hasText: layerName }).first();
  await expect(source).toBeVisible();

  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box was not available.');
  }

  const clientX = box.x + box.width * position.xRatio;
  const clientY = box.y + box.height * position.yRatio;
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await source.dispatchEvent('dragstart', { dataTransfer });
  await canvas.dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  await canvas.dispatchEvent('drop', { dataTransfer, clientX, clientY });
}

async function dragLayerIntoNode(
  page: Page,
  layerName: string,
  targetNode: Locator,
  yRatioWithinTarget = 0.58,
): Promise<void> {
  const source = page.locator('[draggable="true"]').filter({ hasText: layerName }).first();
  await expect(source).toBeVisible();

  const targetBox = await targetNode.boundingBox();
  if (!targetBox) {
    throw new Error('Target node bounding box was not available.');
  }

  const clientX = targetBox.x + targetBox.width / 2;
  const clientY = targetBox.y + targetBox.height * yRatioWithinTarget;
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const canvas = await getCanvas(page);

  await source.dispatchEvent('dragstart', { dataTransfer });
  await canvas.dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  await canvas.dispatchEvent('drop', { dataTransfer, clientX, clientY });
}

async function previewLayerOverNodeThenCancel(
  page: Page,
  layerName: string,
  targetNode: Locator,
  yRatioWithinTarget = 0.58,
): Promise<void> {
  const { source, dataTransfer } = await previewLayerOverNode(page, layerName, targetNode, yRatioWithinTarget);
  await source.dispatchEvent('dragend', { dataTransfer });
}

async function previewLayerOverNode(
  page: Page,
  layerName: string,
  targetNode: Locator,
  yRatioWithinTarget = 0.58,
) {
  const source = page.locator('[draggable="true"]').filter({ hasText: layerName }).first();
  await expect(source).toBeVisible();

  const targetBox = await targetNode.boundingBox();
  if (!targetBox) {
    throw new Error('Target node bounding box was not available.');
  }

  const clientX = targetBox.x + targetBox.width / 2;
  const clientY = targetBox.y + targetBox.height * yRatioWithinTarget;
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const canvas = await getCanvas(page);

  await source.dispatchEvent('dragstart', { dataTransfer });
  await canvas.dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  return { source, dataTransfer };
}

async function previewNodeReorderWithinContainer(
  page: Page,
  sourceNode: Locator,
  targetContainer: Locator,
  yRatioWithinTarget = 0.88,
): Promise<void> {
  const sourceBox = await sourceNode.boundingBox();
  const targetBox = await targetContainer.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Could not resolve node drag preview bounds.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 16, sourceBox.y + sourceBox.height / 2 + 12, {
    steps: 8,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * yRatioWithinTarget, {
    steps: 18,
  });
}

async function getElementHeight(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Expected an HTMLElement.');
    }

    return element.offsetHeight;
  });
}

async function getStrokeColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => window.getComputedStyle(element).stroke);
}

async function openOmnibar(page: Page, position: DropPosition): Promise<Locator> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box was not available.');
  }

  await page.mouse.click(box.x + box.width * position.xRatio, box.y + box.height * position.yRatio, {
    button: 'right',
  });

  const omnibar = page.locator('input[placeholder="Add layer..."]');
  await expect(omnibar).toBeVisible();
  return omnibar;
}

async function getNode(page: Page, label: string, index = 0): Promise<Locator> {
  const node = page.locator('.react-flow__node').filter({ hasText: label }).nth(index);
  await expect(node).toBeVisible();
  return node;
}

async function dragBetween(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Could not resolve handle positions.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 16, sourceBox.y + sourceBox.height / 2 + 12, {
    steps: 8,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 24,
  });
  await page.mouse.up();
}

async function connectNodes(
  page: Page,
  sourceLabel: string,
  targetLabel: string,
  sourceHandleSelector = '.react-flow__handle-right',
  targetHandleSelector = '.react-flow__handle-left',
): Promise<void> {
  const sourceNode = await getNode(page, sourceLabel);
  const targetNode = await getNode(page, targetLabel);
  const sourceHandle = sourceNode.locator(sourceHandleSelector);
  const targetHandle = targetNode.locator(targetHandleSelector);
  const initialEdgeCount = await page.locator('.react-flow__edge').count();

  await sourceHandle.dispatchEvent('click');
  await targetHandle.dispatchEvent('click');
  await page.waitForTimeout(120);

  if ((await page.locator('.react-flow__edge').count()) > initialEdgeCount) {
    return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await dragBetween(page, sourceHandle, targetHandle);
    await page.waitForTimeout(120);

    if ((await page.locator('.react-flow__edge').count()) > initialEdgeCount) {
      return;
    }
  }

  throw new Error(`Failed to connect ${sourceLabel} -> ${targetLabel}.`);
}

async function importProjectFile(
  page: Page,
  file: Parameters<Locator['setInputFiles']>[0],
): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

test.describe('TorchCanvas E2E', () => {
  test('sidebar and omnibar no longer expose Input/Output nodes', async ({ page }) => {
    await openWorkspace(page);

    await expect(page.locator('[draggable="true"]').filter({ hasText: /^Input$/ })).toHaveCount(0);
    await expect(page.locator('[draggable="true"]').filter({ hasText: /^Output$/ })).toHaveCount(0);

    const omnibar = await openOmnibar(page, { xRatio: 0.5, yRatio: 0.45 });
    await omnibar.fill('Input');
    await expect(page.locator('text=No layers found')).toBeVisible();
  });

  test('root modules appear in the Model Inputs panel automatically', async ({ page }) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.32, yRatio: 0.32 });
    await clickCanvas(page, { xRatio: 0.85, yRatio: 0.18 });

    const inspector = page.locator('aside').last();
    await expect(inspector).toContainText('Model Inputs');
    await expect(inspector).toContainText('Conv2d');
    await expect(inspector.locator('input').nth(1)).toHaveValue('conv2d_1');
  });

  test('sequential containers stay stable when adding siblings and top-level layers', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.35, yRatio: 0.35 });
    const firstSequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'Linear', firstSequential, 0.58);
    await dragLayerIntoNode(page, 'ReLU', firstSequential, 0.72);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.64, yRatio: 0.35 });
    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.82, yRatio: 0.56 });

    await expect(page.locator('[data-container-node="Sequential"]')).toHaveCount(2);
    await expect(page.locator('[data-container-node="Sequential"][data-child-count="2"]')).toHaveCount(1);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Conv2d' })).toHaveCount(1);
    await expect(page.locator('.react-flow__edge:not(.sequential-derived-edge)')).toHaveCount(0);
  });

  test('explicit connections to sequential containers stay valid and update generated code', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.22, yRatio: 0.32 });
    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.58);
    await dragLayerIntoNode(page, 'Dropout', sequential, 0.74);

    await connectNodes(
      page,
      'Conv2d',
      'Sequential',
      '.react-flow__handle-right',
      '.react-flow__handle-left',
    );

    await expect(page.locator('[data-container-node="Sequential"][data-connected="true"]')).toBeVisible();
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
    await expect(page.locator('footer')).toContainText('self.sequential_1 = nn.Sequential(');
    await expect(page.locator('.react-flow__edge.sequential-derived-edge')).toHaveCount(1);
  });

  test('connected sequential source edges use the active sequential accent', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.42, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.58);
    await dragLayerIntoNode(page, 'Dropout', sequential, 0.74);
    await dragLayerToCanvas(page, 'Linear', { xRatio: 0.74, yRatio: 0.32 });

    await connectNodes(
      page,
      'Sequential',
      'Linear',
      '.react-flow__handle-right',
      '.react-flow__handle-left',
    );

    const explicitEdgePath = page.locator('.react-flow__edge:not(.sequential-derived-edge) .react-flow__edge-path').first();
    const derivedEdgePath = page.locator('.react-flow__edge.sequential-derived-edge .react-flow__edge-path').first();
    await expect(explicitEdgePath).toBeVisible();
    await expect(derivedEdgePath).toBeVisible();
    expect(await getStrokeColor(explicitEdgePath)).toBe('rgb(148, 163, 184)');
    expect(await getStrokeColor(derivedEdgePath)).toBe('rgb(148, 163, 184)');
  });

  test('sequential preview state clears when a sidebar drag is cancelled', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.58);

    await previewLayerOverNodeThenCancel(page, 'Conv2d', sequential, 0.74);

    await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0);
    await expect(page.locator('[data-preview-ghost="true"]')).toHaveCount(0);
    await expect(page.locator('[data-preview-shifted="true"]')).toHaveCount(0);
  });

  test('empty sequential preview is centered within the container body', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    const { source, dataTransfer } = await previewLayerOverNode(page, 'Conv2d', sequential, 0.58);

    await expect(sequential).toHaveAttribute('data-drop-preview-mode', 'empty-centered');
    const previewSlot = sequential.locator('[data-container-drop-slot="empty-centered"]');
    await expect(previewSlot).toBeVisible();

    const layoutMetrics = await previewSlot.evaluate((slot) => {
      const root = slot.closest('[data-container-node]');
      if (!(slot instanceof HTMLElement) || !(root instanceof HTMLElement)) {
        return null;
      }

      const containerWidth = root.offsetWidth;
      const containerHeight = root.offsetHeight;
      const bodyTop = 32;
      const bodyHeight = containerHeight - bodyTop;
      const slotLeft = slot.offsetLeft;
      const slotTop = slot.offsetTop;
      const slotWidth = slot.offsetWidth;
      const slotHeight = slot.offsetHeight;

      return {
        slotLeft,
        slotTop,
        slotWidth,
        slotHeight,
        leftInset: slotLeft,
        rightInset: containerWidth - slotLeft - slotWidth,
        topInset: slotTop - bodyTop,
        bottomInset: containerHeight - slotTop - slotHeight,
        bodyCenterY: bodyTop + bodyHeight / 2,
        slotCenterY: slotTop + slotHeight / 2,
      };
    });

    if (!layoutMetrics) {
      throw new Error('Could not resolve the empty sequential preview layout metrics.');
    }

    expect(Math.abs(layoutMetrics.leftInset - layoutMetrics.rightInset)).toBeLessThanOrEqual(2);
    expect(Math.abs(layoutMetrics.slotCenterY - layoutMetrics.bodyCenterY)).toBeLessThanOrEqual(2);
    expect(layoutMetrics.topInset).toBeGreaterThan(0);
    expect(layoutMetrics.bottomInset).toBeGreaterThan(0);

    await source.dispatchEvent('dragend', { dataTransfer });
  });

  test('sidebar drag preview expands a dense sequential and resets after cancel', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'Conv2d', sequential, 0.58);
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.7);
    await dragLayerIntoNode(page, 'Dropout', sequential, 0.82);
    await page.waitForTimeout(400);

    const baseHeight = await getElementHeight(sequential);
    const { source, dataTransfer } = await previewLayerOverNode(page, 'Linear', sequential, 0.72);

    await expect(sequential).toHaveAttribute('data-preview-expanded', 'true');
    await expect(page.locator('[data-preview-shifted="true"]')).toHaveCount(1);
    await page.waitForTimeout(200);
    expect(await getElementHeight(sequential)).toBeGreaterThan(baseHeight);

    await source.dispatchEvent('dragend', { dataTransfer });
    await page.waitForTimeout(350);

    await expect(sequential).toHaveAttribute('data-preview-expanded', 'false');
    expect(await getElementHeight(sequential)).toBe(baseHeight);
  });

  test('sidebar drag preview keeps sequential height fixed when bottom padding is sufficient', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.58);

    const baseHeight = await getElementHeight(sequential);
    const { source, dataTransfer } = await previewLayerOverNode(page, 'Conv2d', sequential, 0.35);

    await expect(page.locator('[data-preview-shifted="true"]')).toHaveCount(1);
    await expect(sequential).toHaveAttribute('data-preview-expanded', 'false');
    expect(await getElementHeight(sequential)).toBe(baseHeight);

    await source.dispatchEvent('dragend', { dataTransfer });
  });

  test('same-container reorder preview expands a dense sequential and settles after drop', async ({ page }) => {
    await openWorkspace(page);

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.56, yRatio: 0.32 });
    const sequential = page.locator('[data-container-node="Sequential"]').first();
    await dragLayerIntoNode(page, 'Conv2d', sequential, 0.58);
    await dragLayerIntoNode(page, 'ReLU', sequential, 0.7);
    await dragLayerIntoNode(page, 'Dropout', sequential, 0.82);
    await page.waitForTimeout(400);

    const reluNode = await getNode(page, 'ReLU');
    const baseHeight = await getElementHeight(sequential);

    await previewNodeReorderWithinContainer(page, reluNode, sequential, 0.9);
    await page.waitForTimeout(150);

    await expect(sequential).toHaveAttribute('data-preview-expanded', 'true');
    expect(await getElementHeight(sequential)).toBeGreaterThan(baseHeight);

    await page.mouse.up();
    await page.waitForTimeout(350);

    await expect(sequential).toHaveAttribute('data-preview-expanded', 'false');
    expect(await getElementHeight(sequential)).toBe(baseHeight);
  });

  test('save project downloads a v2 TorchCanvas project file', async ({ page }) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.35, yRatio: 0.32 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('GeneratedModel.torchcanvas.json');
  });

  test('importing a v2 project restores nodes and generated code', async ({ page }) => {
    await openWorkspace(page);

    const project = {
      app: 'torchcanvas',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'VisionModel',
        inputsByNodeId: {
          conv: { argumentName: 'image', shape: '[B, 3, 224, 224]' },
        },
        nodes: [
          {
            id: 'conv',
            moduleType: 'Conv2d',
            attributeName: 'conv_1',
            params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: { inplace: true },
          },
        ],
        edges: [{ id: 'edge-1', sourceId: 'conv', targetId: 'relu' }],
      },
      layout: {
        positionsById: {
          conv: { x: 120, y: 160 },
          relu: { x: 420, y: 160 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'vision-model.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project), 'utf8'),
    });

    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('footer')).toContainText('def forward(self, image):');
    await expect(page.locator('footer')).toContainText('self.conv_1 = nn.Conv2d');
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
  });

  test('legacy projects with Input/Output nodes are rejected on import', async ({ page }) => {
    await openWorkspace(page);

    const legacyProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'LegacyModel',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'image',
            params: { shape: '[B, 3, 224, 224]' },
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          input: { x: 120, y: 160 },
        },
      },
    };

    const dialogPromise = page.waitForEvent('dialog');
    await importProjectFile(page, {
      name: 'legacy-project.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacyProject), 'utf8'),
    });
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('removed Input/Output nodes');
    await dialog.accept();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });

  test('legacy autosave snapshots are rejected during restore', async ({ page }) => {
    const legacyAutosave = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'LegacyAutosave',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'image',
            params: { shape: '[B, 3, 224, 224]' },
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          input: { x: 120, y: 160 },
        },
      },
    };

    await page.addInitScript((payload) => {
      window.localStorage.setItem('torchcanvas:autosave:v1', payload);
    }, JSON.stringify(legacyAutosave));

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await openWorkspace(page);

    expect(dialogMessage).toContain('legacy TorchCanvas autosave');
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });
});
