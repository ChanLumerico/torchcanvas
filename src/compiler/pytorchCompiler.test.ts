import { describe, expect, it } from 'vitest';

import type { GraphModel } from '../domain/graph/types';
import { generatePytorchCode, generateTrainTemplate } from './pytorchCompiler';

function createGraph(modelName: string, nodes: GraphModel['nodes'], edges: GraphModel['edges']): GraphModel {
  return {
    modelName,
    nodes,
    edges,
  };
}

describe('generatePytorchCode', () => {
  it('serializes booleans and sanitizes model and attribute names', () => {
    const code = generatePytorchCode(
      createGraph(
        'My Model',
        [
          { id: 'input', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 3, 224, 224]' } },
          { id: 'relu', moduleType: 'ReLU', attributeName: 'relu head', params: { inplace: true } },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'input', targetId: 'relu' },
          { id: 'edge-2', sourceId: 'relu', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain('class My_Model(nn.Module):');
    expect(code).toContain('self.relu_head = nn.ReLU(inplace=True)');
  });

  it('keeps literal params raw and quoted params quoted', () => {
    const code = generatePytorchCode(
      createGraph(
        'UpsampleModel',
        [
          { id: 'input', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 3, 64, 64]' } },
          {
            id: 'upsample',
            moduleType: 'Upsample',
            attributeName: 'upsample',
            params: { size: '[224, 224]', mode: 'bilinear', align_corners: true },
          },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'input', targetId: 'upsample' },
          { id: 'edge-2', sourceId: 'upsample', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain('size=[224, 224]');
    expect(code).toContain("mode='bilinear'");
    expect(code).toContain('align_corners=True');
  });

  it('supports concat branches with multiple inputs', () => {
    const code = generatePytorchCode(
      createGraph(
        'ConcatNet',
        [
          { id: 'image', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 32]' } },
          { id: 'skip', moduleType: 'Input', attributeName: 'skip', params: { shape: '[B, 32]' } },
          { id: 'concat', moduleType: 'Concat', attributeName: 'concat', params: { dim: 1 } },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'image', targetId: 'concat' },
          { id: 'edge-2', sourceId: 'skip', targetId: 'concat' },
          { id: 'edge-3', sourceId: 'concat', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain('def forward(self, image, skip):');
    expect(code).toContain('torch.cat((image, skip), dim=1)');
  });

  it('calls bilinear layers with two input tensors', () => {
    const code = generatePytorchCode(
      createGraph(
        'FusionNet',
        [
          { id: 'image', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 128]' } },
          { id: 'meta', moduleType: 'Input', attributeName: 'meta', params: { shape: '[B, 128]' } },
          {
            id: 'fusion',
            moduleType: 'Bilinear',
            attributeName: 'fusion head',
            params: { in1_features: 128, in2_features: 128, out_features: 64 },
          },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'image', targetId: 'fusion' },
          { id: 'edge-2', sourceId: 'meta', targetId: 'fusion' },
          { id: 'edge-3', sourceId: 'fusion', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain('def forward(self, image, meta):');
    expect(code).toContain('self.fusion_head = nn.Bilinear(in1_features=128, in2_features=128, out_features=64)');
    expect(code).toContain('x1 = self.fusion_head(image, meta)');
  });

  it('builds top-level sequential containers from child nodes', () => {
    const code = generatePytorchCode(
      createGraph(
        'SequentialNet',
        [
          { id: 'input', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 128]' } },
          { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear',
            params: { in_features: 128, out_features: 64 },
            containerId: 'seq',
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu',
            params: { inplace: true },
            containerId: 'seq',
          },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'input', targetId: 'linear' },
          { id: 'edge-2', sourceId: 'linear', targetId: 'relu' },
          { id: 'edge-3', sourceId: 'seq', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain('self.encoder = nn.Sequential(');
    expect(code).toContain('nn.Linear(in_features=128, out_features=64)');
    expect(code).toContain('nn.ReLU(inplace=True)');
    expect(code).toContain('x1 = self.encoder(x)');
  });

  it('builds container child access for module dict containers', () => {
    const code = generatePytorchCode(
      createGraph(
        'ModuleDictNet',
        [
          { id: 'input', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 64]' } },
          { id: 'dict', moduleType: 'ModuleDict', attributeName: 'blocks', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'proj block',
            params: { in_features: 64, out_features: 32 },
            containerId: 'dict',
          },
          { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
        ],
        [
          { id: 'edge-1', sourceId: 'input', targetId: 'linear' },
          { id: 'edge-2', sourceId: 'linear', targetId: 'output' },
        ],
      ),
    );

    expect(code).toContain("self.blocks = nn.ModuleDict({");
    expect(code).toContain("'proj_block': nn.Linear(in_features=64, out_features=32)");
    expect(code).toContain("self.blocks['proj_block'](x)");
  });

  it('generates multi-input train templates from graph inputs', () => {
    const graph = createGraph(
      'FusionNet',
      [
        { id: 'image', moduleType: 'Input', attributeName: 'image', params: { shape: '[B, 3, 224, 224]' } },
        { id: 'meta', moduleType: 'Input', attributeName: 'meta', params: { shape: '[B, 128]' } },
        {
          id: 'fusion',
          moduleType: 'Bilinear',
          attributeName: 'fusion',
          params: { in1_features: 150528, in2_features: 128, out_features: 10 },
        },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [
        { id: 'edge-1', sourceId: 'image', targetId: 'fusion' },
        { id: 'edge-2', sourceId: 'meta', targetId: 'fusion' },
        { id: 'edge-3', sourceId: 'fusion', targetId: 'output' },
      ],
    );

    const code = generateTrainTemplate(graph);

    expect(code).toContain('image = torch.randn(32, 3, 224, 224).to(device)');
    expect(code).toContain('meta = torch.randn(32, 128).to(device)');
    expect(code).toContain('outputs = model(image, meta)');
    expect(code).toContain('outputs_for_loss = outputs[0] if isinstance(outputs, tuple) else outputs');
  });

  it('emits explicit validation stubs for invalid model graphs', () => {
    const graph = createGraph(
      'BrokenNet',
      [
        { id: 'conv', moduleType: 'Conv2d', attributeName: 'conv', params: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 } },
        { id: 'output', moduleType: 'Output', attributeName: 'output', params: {} },
      ],
      [{ id: 'edge-1', sourceId: 'conv', targetId: 'output' }],
    );

    const modelCode = generatePytorchCode(graph);
    const trainCode = generateTrainTemplate(graph);

    expect(modelCode).toContain('# TorchCanvas graph validation failed.');
    expect(modelCode).toContain('Conv2d `conv` requires an incoming connection.');
    expect(modelCode).toContain('raise RuntimeError("TorchCanvas graph validation failed. Fix the graph before exporting code.")');

    expect(trainCode).toContain('# TorchCanvas graph validation failed.');
    expect(trainCode).toContain('Conv2d `conv` requires an incoming connection.');
    expect(trainCode).toContain('raise RuntimeError("TorchCanvas graph validation failed. Fix the graph before exporting code.")');
  });
});
