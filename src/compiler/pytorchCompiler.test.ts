import { describe, expect, it } from 'vitest';

import type { GraphModel } from '../domain/graph/types';
import { generatePytorchCode, generateTrainTemplate } from './pytorchCompiler';

function createGraph(
  modelName: string,
  nodes: GraphModel['nodes'],
  edges: GraphModel['edges'] = [],
  inputsByNodeId: GraphModel['inputsByNodeId'] = {},
): GraphModel {
  return {
    modelName,
    inputsByNodeId,
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
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu head',
            params: { inplace: true },
          },
        ],
        [],
        {
          relu: { argumentName: 'image', shape: '[B, 3, 224, 224]' },
        },
      ),
    );

    expect(code).toContain('class My_Model(nn.Module):');
    expect(code).toContain('self.relu_head = nn.ReLU(inplace=True)');
    expect(code).toContain('def forward(self, image):');
    expect(code).toContain('x1 = self.relu_head(image)');
  });

  it('keeps literal params raw and quoted params quoted', () => {
    const code = generatePytorchCode(
      createGraph(
        'UpsampleModel',
        [
          {
            id: 'upsample',
            moduleType: 'Upsample',
            attributeName: 'upsample',
            params: { size: '[224, 224]', mode: 'bilinear', align_corners: true },
          },
        ],
        [],
        {
          upsample: { argumentName: 'image', shape: '[B, 3, 64, 64]' },
        },
      ),
    );

    expect(code).toContain('size=[224, 224]');
    expect(code).toContain("mode='bilinear'");
    expect(code).toContain('align_corners=True');
  });

  it('creates multiple forward args from root modules and calls bilinear with two tensors', () => {
    const code = generatePytorchCode(
      createGraph(
        'FusionNet',
        [
          {
            id: 'image_proj',
            moduleType: 'Linear',
            attributeName: 'image proj',
            params: { in_features: 128, out_features: 64 },
          },
          {
            id: 'meta_proj',
            moduleType: 'Linear',
            attributeName: 'meta proj',
            params: { in_features: 128, out_features: 64 },
          },
          {
            id: 'fusion',
            moduleType: 'Bilinear',
            attributeName: 'fusion head',
            params: { in1_features: 64, in2_features: 64, out_features: 10 },
          },
        ],
        [
          { id: 'edge-1', sourceId: 'image_proj', targetId: 'fusion' },
          { id: 'edge-2', sourceId: 'meta_proj', targetId: 'fusion' },
        ],
        {
          image_proj: { argumentName: 'image', shape: '[B, 128]' },
          meta_proj: { argumentName: 'meta', shape: '[B, 128]' },
        },
      ),
    );

    expect(code).toContain('def forward(self, image, meta):');
    expect(code).toContain('self.image_proj = nn.Linear(in_features=128, out_features=64)');
    expect(code).toContain('self.meta_proj = nn.Linear(in_features=128, out_features=64)');
    expect(code).toContain(
      'self.fusion_head = nn.Bilinear(in1_features=64, in2_features=64, out_features=10)',
    );
    expect(code).toContain('x1 = self.image_proj(image)');
    expect(code).toContain('x2 = self.meta_proj(meta)');
    expect(code).toContain('x3 = self.fusion_head(x1, x2)');
  });

  it('builds top-level sequential containers from child nodes', () => {
    const code = generatePytorchCode(
      createGraph(
        'SequentialNet',
        [
          { id: 'seq', moduleType: 'Sequential', attributeName: 'encoder', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'linear',
            params: { in_features: 128, out_features: 64 },
            containerId: 'seq',
            containerOrder: 0,
          },
          {
            id: 'relu',
            moduleType: 'ReLU',
            attributeName: 'relu',
            params: { inplace: true },
            containerId: 'seq',
            containerOrder: 1,
          },
        ],
        [],
        {
          seq: { argumentName: 'x', shape: '[B, 128]' },
        },
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
          { id: 'dict', moduleType: 'ModuleDict', attributeName: 'blocks', params: {} },
          {
            id: 'linear',
            moduleType: 'Linear',
            attributeName: 'proj block',
            params: { in_features: 64, out_features: 32 },
            containerId: 'dict',
            containerOrder: 0,
          },
        ],
        [],
        {
          linear: { argumentName: 'image', shape: '[B, 64]' },
        },
      ),
    );

    expect(code).toContain('self.blocks = nn.ModuleDict({');
    expect(code).toContain("'proj_block': nn.Linear(in_features=64, out_features=32)");
    expect(code).toContain("self.blocks['proj_block'](image)");
  });

  it('returns tuples for multiple executable sinks', () => {
    const code = generatePytorchCode(
      createGraph(
        'MultiHead',
        [
          {
            id: 'head_a',
            moduleType: 'Linear',
            attributeName: 'head_a',
            params: { in_features: 32, out_features: 16 },
          },
          {
            id: 'head_b',
            moduleType: 'Linear',
            attributeName: 'head_b',
            params: { in_features: 32, out_features: 8 },
          },
        ],
        [],
        {
          head_a: { argumentName: 'image', shape: '[B, 32]' },
          head_b: { argumentName: 'meta', shape: '[B, 32]' },
        },
      ),
    );

    expect(code).toContain('def forward(self, image, meta):');
    expect(code).toContain('return (x1, x2)');
  });
});

describe('generateTrainTemplate', () => {
  it('generates multi-input train templates from root bindings', () => {
    const graph = createGraph(
      'FusionNet',
      [
        {
          id: 'image_proj',
          moduleType: 'Linear',
          attributeName: 'image_proj',
          params: { in_features: 128, out_features: 64 },
        },
        {
          id: 'meta_proj',
          moduleType: 'Linear',
          attributeName: 'meta_proj',
          params: { in_features: 128, out_features: 64 },
        },
      ],
      [],
      {
        image_proj: { argumentName: 'image', shape: '[B, 128]' },
        meta_proj: { argumentName: 'meta', shape: '[B, 128]' },
      },
    );

    const trainCode = generateTrainTemplate(graph);

    expect(trainCode).toContain('image = torch.randn(32, 128).to(device)');
    expect(trainCode).toContain('meta = torch.randn(32, 128).to(device)');
    expect(trainCode).toContain('outputs = model(image, meta)');
  });

  it('returns a warning stub when a root input shape is missing', () => {
    const graph = createGraph(
      'ShapeMissing',
      [
        {
          id: 'relu',
          moduleType: 'ReLU',
          attributeName: 'relu_1',
          params: { inplace: true },
        },
      ],
      [],
      {
        relu: { argumentName: 'image', shape: '' },
      },
    );

    const trainCode = generateTrainTemplate(graph);

    expect(trainCode).toContain('missing an input shape');
    expect(trainCode).toContain('Configure root input shapes in the Inspector');
  });
});
