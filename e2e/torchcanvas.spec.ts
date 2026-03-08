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

async function dragLayerIntoNode(
  page: Page,
  layerName: string,
  targetNode: Locator,
  yRatioWithinTarget = 0.55,
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

async function dragNodeTo(
  page: Page,
  node: Locator,
  targetX: number,
  targetY: number,
): Promise<void> {
  await node.scrollIntoViewIfNeeded();

  const box = await node.boundingBox();
  if (!box) {
    throw new Error('Could not resolve node position.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();
}

async function connectNodes(
  page: Page,
  sourceLabel: string,
  targetLabel: string,
  sourceIndex = 0,
  targetIndex = 0,
  sourceHandleSelector = '.react-flow__handle-right',
  targetHandleSelector = '.react-flow__handle-left',
): Promise<void> {
  const sourceNode = await getNode(page, sourceLabel, sourceIndex);
  const targetNode = await getNode(page, targetLabel, targetIndex);
  const sourceHandle = sourceNode.locator(sourceHandleSelector);
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

  test('multi-input bilinear graphs update model.py and train.py', async ({ page }) => {
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
            id: 'fusion',
            moduleType: 'Bilinear',
            attributeName: 'fusion_1',
            params: { in1_features: 150528, in2_features: 150528, out_features: 10 },
          },
          {
            id: 'output',
            moduleType: 'Output',
            attributeName: 'output',
            params: {},
          },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'input-1', targetId: 'fusion' },
          { id: 'edge-2', sourceId: 'input-2', targetId: 'fusion' },
          { id: 'edge-3', sourceId: 'fusion', targetId: 'output' },
        ],
      },
      layout: {
        positionsById: {
          'input-1': { x: 120, y: 120 },
          'input-2': { x: 120, y: 320 },
          fusion: { x: 420, y: 220 },
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
    await expect(footer).toContainText('self.fusion_1 = nn.Bilinear');
    await expect(footer).toContainText('x1 = self.fusion_1(input_1, input_2)');

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
    await connectNodes(
      page,
      'Input',
      'ModuleDict',
      0,
      0,
      '.react-flow__handle-right',
      '.react-flow__handle-top',
    );

    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await expect(page.locator('footer')).toContainText('TorchCanvas graph validation failed.');
  });

  test('sequential containers stack compact child chips, show drop feedback, and derive internal edges', async ({ page }) => {
    await openWorkspace(page);
    const sequentialProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'input_1',
            params: { shape: '[B, 3, 224, 224]' },
          },
          {
            id: 'seq',
            moduleType: 'Sequential',
            attributeName: 'encoder',
            params: {},
          },
          {
            id: 'output',
            moduleType: 'Output',
            attributeName: 'output_1',
            params: {},
          },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'input', targetId: 'seq' },
          { id: 'edge-2', sourceId: 'seq', targetId: 'output' },
        ],
      },
      layout: {
        positionsById: {
          input: { x: 120, y: 180 },
          seq: { x: 420, y: 120 },
          output: { x: 820, y: 180 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'sequential-base.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sequentialProject), 'utf8'),
    });

    const sequentialNode = await getNode(page, 'Sequential');
    const canvasBox = await (await getCanvas(page)).boundingBox();
    const linearSource = page.locator('[draggable="true"]').filter({ hasText: 'Linear' }).first();
    const sequentialBox = await sequentialNode.boundingBox();
    if (!sequentialBox || !canvasBox) {
      throw new Error('Sequential node bounding box was not available.');
    }

    expect(sequentialBox.width).toBeGreaterThan(280);
    expect(sequentialBox.width).toBeLessThan(canvasBox.width * 0.7);

    const previewTransfer = await page.evaluateHandle(() => new DataTransfer());
    const canvas = await getCanvas(page);
    await linearSource.dispatchEvent('dragstart', { dataTransfer: previewTransfer });
    await canvas.dispatchEvent('dragover', {
      dataTransfer: previewTransfer,
      clientX: sequentialBox.x + sequentialBox.width / 2,
      clientY: sequentialBox.y + sequentialBox.height * 0.58,
    });

    await expect(page.locator('[data-container-node="Sequential"][data-drop-target="true"]')).toBeVisible();

    await dragLayerIntoNode(page, 'Linear', sequentialNode, 0.56);
    await dragLayerIntoNode(page, 'ReLU', sequentialNode, 0.68);
    await dragLayerIntoNode(page, 'Dropout', sequentialNode, 0.8);

    await expect(page.locator('[data-container-node="Sequential"][data-child-count="3"]')).toBeVisible();
    await expect(
      page.locator('[data-compact-node="true"][data-parent-container="Sequential"]'),
    ).toHaveCount(3);
    await expect(page.locator('[data-container-node="Sequential"][data-connected="true"]')).toBeVisible();
    await expect(page.locator('.react-flow__edge.sequential-derived-edge')).toHaveCount(2);
    await expect(page.locator('[data-container-node="Sequential"]')).not.toContainText('AUTO-CHAIN');
    await expect(page.locator('.react-flow__edge')).toHaveCount(4);
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
    await expect(page.locator('footer')).toContainText('self.encoder = nn.Sequential(');
    await expect(page.locator('footer')).toContainText('x1 = self.encoder(x)');

    const linearChip = await getNode(page, 'Linear');
    const reluChip = await getNode(page, 'ReLU');
    const dropoutChip = await getNode(page, 'Dropout');
    const updatedSequentialNode = await getNode(page, 'Sequential');
    const updatedSequentialBox = await updatedSequentialNode.boundingBox();
    const linearBox = await linearChip.boundingBox();
    const reluBox = await reluChip.boundingBox();
    const dropoutBox = await dropoutChip.boundingBox();
    if (!updatedSequentialBox || !linearBox || !reluBox || !dropoutBox) {
      throw new Error('Sequential child chip bounding box was not available.');
    }

    expect(linearBox.x).toBeGreaterThan(updatedSequentialBox.x - 8);
    expect(linearBox.x + linearBox.width).toBeLessThan(updatedSequentialBox.x + updatedSequentialBox.width + 8);
    expect(reluBox.x).toBeGreaterThan(updatedSequentialBox.x - 8);
    expect(reluBox.x + reluBox.width).toBeLessThan(updatedSequentialBox.x + updatedSequentialBox.width + 8);
    expect(dropoutBox.x).toBeGreaterThan(updatedSequentialBox.x - 8);
    expect(dropoutBox.x + dropoutBox.width).toBeLessThan(updatedSequentialBox.x + updatedSequentialBox.width + 8);
    expect(reluBox.y).toBeGreaterThan(linearBox.y);
    expect(dropoutBox.y).toBeGreaterThan(reluBox.y);
    expect(dropoutBox.y + dropoutBox.height).toBeLessThan(updatedSequentialBox.y + updatedSequentialBox.height - 8);
    expect(linearBox.height).toBeGreaterThan(30);
    expect(reluBox.height).toBeGreaterThan(30);
    expect(dropoutBox.height).toBeGreaterThan(30);
  });

  test('module dict children stay compact but preserve child-level manual connections', async ({ page }) => {
    await openWorkspace(page);
    const moduleDictProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'input_1',
            params: { shape: '[B, 3, 224, 224]' },
          },
          {
            id: 'dict',
            moduleType: 'ModuleDict',
            attributeName: 'blocks',
            params: {},
          },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: { in_features: 512, out_features: 10 },
            containerId: 'dict',
            containerOrder: 0,
          },
          {
            id: 'output',
            moduleType: 'Output',
            attributeName: 'output_1',
            params: {},
          },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'input', targetId: 'linear' },
          { id: 'edge-2', sourceId: 'linear', targetId: 'output' },
        ],
      },
      layout: {
        positionsById: {
          input: { x: 120, y: 180 },
          dict: { x: 420, y: 120 },
          linear: { x: 0, y: 0 },
          output: { x: 820, y: 180 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'moduledict-child.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(moduleDictProject), 'utf8'),
    });

    await expect(page.locator('[data-container-node="ModuleDict"][data-child-count="1"]')).toBeVisible();
    await expect(
      page.locator('[data-compact-node="true"][data-parent-container="ModuleDict"]'),
    ).toHaveCount(1);

    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
    await expect(page.locator('footer')).toContainText('self.blocks = nn.ModuleDict({');
    await expect(page.locator('footer')).toContainText("self.blocks['linear_1'](x)");
  });

  test('container drop zones only capture layers dropped inside the body area', async ({ page }) => {
    await openWorkspace(page);
    const sequentialProject = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: { in_features: 512, out_features: 256 },
            containerId: 'seq',
            containerOrder: 0,
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: { inplace: true },
            containerId: 'seq',
            containerOrder: 1,
          },
          {
            id: 'dropout',
            moduleType: 'Dropout',
            attributeName: 'dropout_1',
            params: { p: 0.2 },
            containerId: 'seq',
            containerOrder: 2,
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          seq: { x: 320, y: 120 },
          linear: { x: 0, y: 0 },
          relu: { x: 0, y: 0 },
          dropout: { x: 0, y: 0 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'sequential-drop-zones.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sequentialProject), 'utf8'),
    });

    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.82, yRatio: 0.32 });

    await expect(page.locator('[data-container-node="Sequential"][data-child-count="3"]')).toBeVisible();
    await expect(
      page.locator('[data-compact-node="true"][data-parent-container="Sequential"]'),
    ).toHaveCount(3);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Conv2d' })).toHaveCount(1);
  });

  test('multiple sequential containers stay stable when new top-level nodes are added', async ({ page }) => {
    await openWorkspace(page);
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          {
            id: 'input',
            moduleType: 'Input',
            attributeName: 'input_1',
            params: { shape: '[B, 3, 224, 224]' },
          },
          { id: 'seq-a', moduleType: 'Sequential', attributeName: 'encoder_a', params: {} },
          { id: 'seq-b', moduleType: 'Sequential', attributeName: 'encoder_b', params: {} },
          {
            id: 'relu-a',
            moduleType: 'ReLU',
            attributeName: 'relu_a',
            params: { inplace: true },
            containerId: 'seq-a',
            containerOrder: 0,
          },
          {
            id: 'relu-b',
            moduleType: 'ReLU',
            attributeName: 'relu_b',
            params: { inplace: true },
            containerId: 'seq-b',
            containerOrder: 0,
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          input: { x: 80, y: 220 },
          'seq-a': { x: 320, y: 120 },
          'seq-b': { x: 680, y: 120 },
          'relu-a': { x: 0, y: 0 },
          'relu-b': { x: 0, y: 0 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'two-sequentials.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project), 'utf8'),
    });

    await dragLayerToCanvas(page, 'Conv2d', { xRatio: 0.86, yRatio: 0.72 });

    await expect(page.locator('.react-flow__node').filter({ hasText: 'Input' })).toHaveCount(1);
    await expect(page.locator('[data-container-node="Sequential"]')).toHaveCount(2);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Conv2d' })).toHaveCount(1);
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  });

  test('adding another top-level sequential does not corrupt an existing sequential subtree', async ({ page }) => {
    await openWorkspace(page);
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: { in_features: 512, out_features: 256 },
            containerId: 'seq',
            containerOrder: 0,
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu_1',
            params: { inplace: true },
            containerId: 'seq',
            containerOrder: 1,
          },
          {
            id: 'dropout',
            moduleType: 'Dropout',
            attributeName: 'dropout_1',
            params: { p: 0.2 },
            containerId: 'seq',
            containerOrder: 2,
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          seq: { x: 220, y: 120 },
          linear: { x: 0, y: 0 },
          relu: { x: 0, y: 0 },
          dropout: { x: 0, y: 0 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'single-sequential.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project), 'utf8'),
    });

    await dragLayerToCanvas(page, 'Sequential', { xRatio: 0.84, yRatio: 0.3 });

    await expect(page.locator('[data-container-node="Sequential"]')).toHaveCount(2);
    await expect(page.locator('[data-container-node="Sequential"][data-child-count="3"]')).toHaveCount(1);
    await expect(
      page.locator('[data-compact-node="true"][data-parent-container="Sequential"]'),
    ).toHaveCount(3);
  });

  test('nested sequential containers can be added and compiled without breaking the canvas', async ({ page }) => {
    await openWorkspace(page);
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          { id: 'input', moduleType: 'Input', attributeName: 'input_1', params: { shape: '[B, 32]' } },
          { id: 'outer', moduleType: 'Sequential', attributeName: 'outer_encoder', params: {} },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'input', targetId: 'outer' },
          { id: 'edge-2', sourceId: 'outer', targetId: 'output' },
        ],
      },
      layout: {
        positionsById: {
          input: { x: 100, y: 200 },
          outer: { x: 380, y: 120 },
          output: { x: 820, y: 200 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'outer-sequential.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project), 'utf8'),
    });

    const outerSequential = await getNode(page, 'Sequential');
    await dragLayerIntoNode(page, 'Sequential', outerSequential, 0.58);

    await expect(page.locator('[data-container-node="Sequential"]')).toHaveCount(2);

    const innerSequential = page.locator('[data-container-node="Sequential"]').nth(1);
    await dragLayerIntoNode(page, 'Linear', innerSequential, 0.6);
    await dragLayerIntoNode(page, 'ReLU', innerSequential, 0.75);

    await expect(page.locator('[data-container-node="Sequential"][data-child-count="1"]')).toHaveCount(1);
    await expect(page.locator('[data-container-node="Sequential"][data-child-count="2"]')).toHaveCount(1);
    await expect(page.locator('footer')).toContainText('self.outer_encoder = nn.Sequential(');
    await expect(page.locator('footer')).toContainText('nn.Sequential(');
    await expect(page.locator('footer')).not.toContainText('TorchCanvas graph validation failed.');
  });

  test('sequential children can be dragged back out to the top-level canvas', async ({ page }) => {
    await openWorkspace(page);
    const project = {
      app: 'torchcanvas',
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      graph: {
        modelName: 'GeneratedModel',
        nodes: [
          { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear_1',
            params: { in_features: 512, out_features: 256 },
            containerId: 'seq',
            containerOrder: 0,
          },
        ],
        edges: [],
      },
      layout: {
        positionsById: {
          seq: { x: 260, y: 120 },
          linear: { x: 0, y: 0 },
        },
      },
    };

    await importProjectFile(page, {
      name: 'drag-out-sequential-child.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project), 'utf8'),
    });

    const linearNode = await getNode(page, 'Linear');
    const canvasBox = await (await getCanvas(page)).boundingBox();
    if (!canvasBox) {
      throw new Error('Canvas bounding box was not available.');
    }

    await dragNodeTo(
      page,
      linearNode,
      canvasBox.x + canvasBox.width * 0.86,
      canvasBox.y + canvasBox.height * 0.72,
    );

    await expect(page.locator('[data-container-node="Sequential"][data-child-count="0"]')).toBeVisible();
    await expect(
      page.locator('[data-compact-node="true"][data-parent-container="Sequential"]'),
    ).toHaveCount(0);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Linear' })).toHaveCount(1);
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

  test('removed concat layers are absent from the UI and rejected on import', async ({ page }) => {
    await openWorkspace(page);

    await expect(page.locator('[draggable="true"]').filter({ hasText: 'Concat' })).toHaveCount(0);

    const canvas = await getCanvas(page);
    await canvas.click({ button: 'right', position: { x: 120, y: 120 } });
    const omnibarInput = page.getByPlaceholder('Add layer...');
    await expect(omnibarInput).toBeVisible();
    await omnibarInput.fill('concat');
    await expect(page.locator('text=No layers found')).toBeVisible();

    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('alert');
      expect(dialog.message()).toContain('graph.nodes[0].moduleType is not a supported TorchCanvas layer.');
      void dialog.accept();
    });
    await importProjectFile(page, {
      name: 'concat-project.torchcanvas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          app: 'torchcanvas',
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          graph: {
            modelName: 'OldConcatProject',
            nodes: [
              {
                id: 'concat',
                moduleType: 'Concat',
                attributeName: 'concat_1',
                params: { dim: 1 },
              },
            ],
            edges: [],
          },
          layout: {
            positionsById: {
              concat: { x: 240, y: 180 },
            },
          },
        }),
        'utf8',
      ),
    });

    await expect(page.locator('.react-flow__node')).toHaveCount(0);
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
