import { readFile } from 'node:fs/promises';
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
  await canvas.dispatchEvent('dragover', {
    dataTransfer,
    clientX,
    clientY,
  });
  await canvas.dispatchEvent('drop', {
    dataTransfer,
    clientX,
    clientY,
  });
}

async function fitView(page: Page): Promise<void> {
  const fitButton = page.locator('.react-flow__controls-button').nth(2);
  await expect(fitButton).toBeVisible();
  await fitButton.click();
}

async function getNode(page: Page, label: string, index = 0): Promise<Locator> {
  const node = page.locator('.react-flow__node').filter({ hasText: label }).nth(index);
  await expect(node).toBeVisible();
  return node;
}

async function dragBetween(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Could not resolve handle positions.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 8,
    sourceBox.y + sourceBox.height / 2 + 8,
  );
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
}

async function connectNodes(
  page: Page,
  sourceLabel: string,
  targetLabel: string,
  sourceIndex = 0,
  targetIndex = 0,
  targetHandleSelector = '.react-flow__handle-left',
): Promise<void> {
  const sourceNode = await getNode(page, sourceLabel, sourceIndex);
  const targetNode = await getNode(page, targetLabel, targetIndex);
  const sourceHandle = sourceNode.locator('.react-flow__handle-right');
  const targetHandle = targetNode.locator(targetHandleSelector);

  await dragBetween(page, sourceHandle, targetHandle);
}

async function buildSimpleConvPipeline(page: Page): Promise<void> {
  await dragLayerToCanvas(page, 'Input', { xRatio: 0.18, yRatio: 0.32 });
  await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.50, yRatio: 0.32 });
  await dragLayerToCanvas(page, 'Output', { xRatio: 0.82, yRatio: 0.32 });

  await fitView(page);
  await connectNodes(page, 'Input', 'Conv2d');
  await connectNodes(page, 'Conv2d', 'Output');
}

async function importProjectFile(
  page: Page,
  file: Parameters<Locator['setInputFiles']>[0],
): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

test.describe('TorchCanvas E2E', () => {
  test('dragging a layer creates a visible canvas node and selects it', async ({ page }) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.45, yRatio: 0.32 });

    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Conv2d' }).first()).toBeVisible();
    await expect(page.locator('aside').last()).toContainText('Conv2d');
  });

  test('connecting input, conv2d, and output generates valid model code', async ({ page }) => {
    await openWorkspace(page);
    await buildSimpleConvPipeline(page);

    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
    await expect(page.locator('footer')).toContainText('self.conv2d_1 = nn.Conv2d');
    await expect(page.locator('footer')).toContainText('x1 = self.conv2d_1(x)');
    await expect(page.locator('footer')).toContainText('return x1');
  });

  test('multi-input concat graphs update model.py and train.py', async ({ page }) => {
    await openWorkspace(page);
    const multiInputProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'input-1',
            moduleType: 'Input',
            attributeName: 'input_1',
            params: { shape: '[B, 3, 224, 224]' },
          },
          {
            id: 'input-2',
            moduleType: 'Input',
            attributeName: 'input_2',
            params: { shape: '[B, 3, 224, 224]' },
          },
          {
            id: 'concat',
            moduleType: 'Concat',
            attributeName: 'concat_1',
            params: { dim: 1 },
          },
          {
            id: 'output',
            moduleType: 'Output',
            attributeName: 'output',
            params: {},
          },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'input-1', targetId: 'concat' },
          { id: 'edge-2', sourceId: 'input-2', targetId: 'concat' },
          { id: 'edge-3', sourceId: 'concat', targetId: 'output' },
        ],
      },
      layout: {
        positionsById: {
          'input-1': { x: 120, y: 120 },
          'input-2': { x: 120, y: 320 },
          concat: { x: 420, y: 220 },
          output: { x: 720, y: 220 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'multi-input.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(multiInputProject), 'utf8'),
    });

    await expect(page.locator('.react-flow__node')).toHaveCount(4);
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);

    const footer = page.locator('footer');
    await expect(footer).toContainText('def forward(self, input_1, input_2):');
    await expect(footer).toContainText('torch.cat((input_1, input_2), dim=1)');

    await page.getByRole('button', { name: 'train.py' }).click();
    await expect(footer).toContainText('input_1 = torch.randn(32, 3, 224, 224).to(device)');
    await expect(footer).toContainText('input_2 = torch.randn(32, 3, 224, 224).to(device)');
    await expect(footer).toContainText('outputs = model(input_1, input_2)');
  });

  test('invalid direct connections to non-callable containers are blocked', async ({ page }) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Input', { xRatio: 0.20, yRatio: 0.32 });
    await dragLayerToCanvas(page, 'ModuleDict', { xRatio: 0.55, yRatio: 0.32 });

    await fitView(page);
    await connectNodes(page, 'Input', 'ModuleDict', 0, 0, '.react-flow__handle-top');

    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await expect(page.locator('footer')).toContainText('TorchCanvas graph validation failed.');
  });

  test('save project downloads versioned JSON and import restores the saved workspace', async ({ page }, testInfo) => {
    await openWorkspace(page);
    await buildSimpleConvPipeline(page);

    const downloadPath = testInfo.outputPath('saved-project.torchcanvas.json');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.torchcanvas\.json$/);
    await download.saveAs(downloadPath);

    const savedProject = JSON.parse(await readFile(downloadPath, 'utf8')) as {
      app: string;
      schemaVersion: number;
    };
    expect(savedProject.app).toBe('torchcanvas');
    expect(savedProject.schemaVersion).toBe(1);

    await dragLayerToCanvas(page, 'ReLU', { xRatio: 0.52, yRatio: 0.56 });
    await expect(page.locator('.react-flow__node')).toHaveCount(4);

    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Replace the current workspace');
      void dialog.accept();
    });
    await importProjectFile(page, downloadPath);

    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'ReLU' })).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
    await expect(page.locator('footer')).toContainText('self.conv2d_1 = nn.Conv2d');
  });

  test('cancelling a dirty import preserves the current workspace', async ({ page }) => {
    await openWorkspace(page);
    await buildSimpleConvPipeline(page);

    const replacementProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'ReplacementModel',
        nodes: [
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: {
              in_features: 512,
              out_features: 10,
            },
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          linear: { x: 240, y: 180 },
        },
      },
    };

    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      void dialog.dismiss();
    });
    await importProjectFile(page, {
      name: 'replacement.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(replacementProject), 'utf8'),
    });

    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Linear' })).toHaveCount(0);
    await expect(page.locator('footer')).toContainText('self.conv2d_1 = nn.Conv2d');
  });

  test('invalid project imports alert and keep the existing canvas intact', async ({ page }, testInfo) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Input', { xRatio: 0.20, yRatio: 0.32 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project' }).click();
    const download = await downloadPromise;
    await download.saveAs(testInfo.outputPath('baseline-project.torchcanvas.json'));

    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('alert');
      expect(dialog.message()).toContain('Project file is not valid JSON.');
      void dialog.accept();
    });
    await importProjectFile(page, {
      name: 'broken.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ invalid json', 'utf8'),
    });

    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Input' }).first()).toBeVisible();
  });

  test('autosave restore prompt rebuilds the last workspace after reload', async ({ page }) => {
    await openWorkspace(page);
    await buildSimpleConvPipeline(page);

    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem('torchcanvas:autosave:v1')),
      )
      .not.toBeNull();

    await page.reload();
    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Restore your last workspace');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Launch App' }).click();

    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await expect(page.locator('footer')).toContainText('self.conv2d_1 = nn.Conv2d');
  });

  test('incomplete graphs can be saved and imported without normalization', async ({ page }, testInfo) => {
    await openWorkspace(page);
    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.48, yRatio: 0.36 });
    await expect(page.locator('footer')).toContainText('TorchCanvas graph validation failed.');

    const downloadPath = testInfo.outputPath('draft-project.torchcanvas.json');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project' }).click();
    const download = await downloadPromise;
    await download.saveAs(downloadPath);

    await page.evaluate(() => {
      window.localStorage.removeItem('torchcanvas:autosave:v1');
    });
    await page.reload();
    await openWorkspace(page);

    await importProjectFile(page, downloadPath);

    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Conv2d' }).first()).toBeVisible();
    await expect(page.locator('footer')).toContainText('TorchCanvas graph validation failed.');
  });
});
