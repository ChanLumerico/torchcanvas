export type LayerParamValue = boolean | number | string;
export type LayerParams = Record<string, LayerParamValue>;

export type LayerCategory =
  | 'Data'
  | 'Convolutional'
  | 'Linear'
  | 'Activations'
  | 'Pooling'
  | 'Normalization'
  | 'Utility'
  | 'Merge'
  | 'Containers';

export type LayerKind = 'data' | 'module' | 'merge' | 'container';
export type ParamKind = 'boolean' | 'number' | 'string' | 'literal';
export type InternalStateCategory = 'parameter' | 'buffer';

export interface ParamSpec {
  kind: ParamKind;
}

export interface InternalStateDescriptor {
  name: string;
  shape: string;
  category: InternalStateCategory;
}

export interface LayerDefinition {
  category: LayerCategory;
  kind: LayerKind;
  color: string;
  defaultParams: LayerParams;
  docsPath: string | null;
  paramSpecs: Record<string, ParamSpec>;
  internalStateResolver: (params: LayerParams) => InternalStateDescriptor[];
  quickAdd?: boolean;
}

const numberParam: ParamSpec = { kind: 'number' };
const booleanParam: ParamSpec = { kind: 'boolean' };
const stringParam: ParamSpec = { kind: 'string' };
const literalParam: ParamSpec = { kind: 'literal' };

const emptyStates = () => [] as InternalStateDescriptor[];

const nnDocs = (name: string) => `https://pytorch.org/docs/stable/generated/torch.nn.${name}.html`;
const torchDocs = (name: string) => `https://pytorch.org/docs/stable/generated/${name}.html`;

function toNumber(value: LayerParamValue | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toShapeLiteral(value: LayerParamValue | undefined, fallback: string): string {
  if (typeof value === 'number') return `[${value}]`;
  if (typeof value === 'string') {
    if (value.startsWith('[') || value.startsWith('(')) return value;
    return `[${value}]`;
  }
  return fallback;
}

function getKernelValues(params: LayerParams, dim: number): number[] {
  const kernel = params.kernel_size ?? 3;

  if (typeof kernel === 'string' && kernel.startsWith('[')) {
    return kernel
      .replace(/[[\]]/g, '')
      .split(',')
      .map((value) => toNumber(value.trim(), 3))
      .slice(0, dim);
  }

  return Array(dim).fill(toNumber(kernel, 3));
}

function resolveConvInternalStates(type: string, params: LayerParams): InternalStateDescriptor[] {
  const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
  const inChannels = toNumber(params.in_channels, dim === 2 ? 3 : 64);
  const outChannels = toNumber(params.out_channels, 64);
  const kernel = getKernelValues(params, dim);
  const states: InternalStateDescriptor[] = [
    {
      name: 'weight',
      shape: `[${outChannels}, ${inChannels}, ${kernel.join(', ')}]`,
      category: 'parameter',
    },
  ];

  const bias = params.bias;
  if (bias !== false && bias !== 'false') {
    states.push({ name: 'bias', shape: `[${outChannels}]`, category: 'parameter' });
  }

  return states;
}

function createLayer(
  definition: Omit<LayerDefinition, 'internalStateResolver'> &
    Partial<Pick<LayerDefinition, 'internalStateResolver'>>,
): LayerDefinition {
  return {
    ...definition,
    quickAdd: definition.quickAdd ?? true,
    internalStateResolver: definition.internalStateResolver ?? emptyStates,
  };
}

const registry = {
  Input: createLayer({
    category: 'Data',
    kind: 'data',
    color: '#10B981',
    defaultParams: { shape: '[B, 3, 224, 224]' },
    docsPath: null,
    paramSpecs: { shape: literalParam },
    quickAdd: true,
  }),
  Output: createLayer({
    category: 'Data',
    kind: 'data',
    color: '#F43F5E',
    defaultParams: {},
    docsPath: null,
    paramSpecs: {},
    quickAdd: true,
  }),
  Concat: createLayer({
    category: 'Merge',
    kind: 'merge',
    color: '#D946EF',
    defaultParams: { dim: 1 },
    docsPath: torchDocs('torch.cat'),
    paramSpecs: { dim: numberParam },
    quickAdd: true,
  }),
  Conv1d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#FB923C',
    defaultParams: { in_channels: 64, out_channels: 128, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('Conv1d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('Conv1d', params),
    quickAdd: false,
  }),
  Conv2d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#F97316',
    defaultParams: { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('Conv2d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('Conv2d', params),
    quickAdd: true,
  }),
  Conv3d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#EA580C',
    defaultParams: { in_channels: 16, out_channels: 32, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('Conv3d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('Conv3d', params),
    quickAdd: false,
  }),
  ConvTranspose1d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#FDBA74',
    defaultParams: { in_channels: 128, out_channels: 64, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('ConvTranspose1d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('ConvTranspose1d', params),
    quickAdd: false,
  }),
  ConvTranspose2d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#FB923C',
    defaultParams: { in_channels: 64, out_channels: 3, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('ConvTranspose2d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('ConvTranspose2d', params),
    quickAdd: false,
  }),
  ConvTranspose3d: createLayer({
    category: 'Convolutional',
    kind: 'module',
    color: '#F97316',
    defaultParams: { in_channels: 32, out_channels: 16, kernel_size: 3, stride: 1, padding: 1 },
    docsPath: nnDocs('ConvTranspose3d'),
    paramSpecs: {
      in_channels: numberParam,
      out_channels: numberParam,
      kernel_size: numberParam,
      stride: numberParam,
      padding: numberParam,
    },
    internalStateResolver: (params) => resolveConvInternalStates('ConvTranspose3d', params),
    quickAdd: false,
  }),
  Linear: createLayer({
    category: 'Linear',
    kind: 'module',
    color: '#EF4444',
    defaultParams: { in_features: 512, out_features: 10 },
    docsPath: nnDocs('Linear'),
    paramSpecs: {
      in_features: numberParam,
      out_features: numberParam,
    },
    internalStateResolver: (params) => {
      const inFeatures = toNumber(params.in_features, 512);
      const outFeatures = toNumber(params.out_features, 10);
      const states: InternalStateDescriptor[] = [
        { name: 'weight', shape: `[${outFeatures}, ${inFeatures}]`, category: 'parameter' },
      ];
      if (params.bias !== false && params.bias !== 'false') {
        states.push({ name: 'bias', shape: `[${outFeatures}]`, category: 'parameter' });
      }
      return states;
    },
    quickAdd: true,
  }),
  Bilinear: createLayer({
    category: 'Linear',
    kind: 'module',
    color: '#DC2626',
    defaultParams: { in1_features: 128, in2_features: 128, out_features: 64 },
    docsPath: nnDocs('Bilinear'),
    paramSpecs: {
      in1_features: numberParam,
      in2_features: numberParam,
      out_features: numberParam,
    },
    internalStateResolver: (params) => {
      const in1Features = toNumber(params.in1_features, 128);
      const in2Features = toNumber(params.in2_features, 128);
      const outFeatures = toNumber(params.out_features, 64);
      const states: InternalStateDescriptor[] = [
        { name: 'weight', shape: `[${outFeatures}, ${in1Features}, ${in2Features}]`, category: 'parameter' },
      ];
      if (params.bias !== false && params.bias !== 'false') {
        states.push({ name: 'bias', shape: `[${outFeatures}]`, category: 'parameter' });
      }
      return states;
    },
    quickAdd: false,
  }),
  ReLU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#F59E0B',
    defaultParams: { inplace: true },
    docsPath: nnDocs('ReLU'),
    paramSpecs: { inplace: booleanParam },
    quickAdd: true,
  }),
  ReLU6: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#F59E0B',
    defaultParams: { inplace: true },
    docsPath: nnDocs('ReLU6'),
    paramSpecs: { inplace: booleanParam },
    quickAdd: false,
  }),
  LeakyReLU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#D97706',
    defaultParams: { negative_slope: 0.01, inplace: true },
    docsPath: nnDocs('LeakyReLU'),
    paramSpecs: { negative_slope: numberParam, inplace: booleanParam },
    quickAdd: false,
  }),
  PReLU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#B45309',
    defaultParams: { num_parameters: 1 },
    docsPath: nnDocs('PReLU'),
    paramSpecs: { num_parameters: numberParam },
    internalStateResolver: (params) => [
      { name: 'weight', shape: `[${toNumber(params.num_parameters, 1)}]`, category: 'parameter' },
    ],
    quickAdd: false,
  }),
  ELU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#FBBF24',
    defaultParams: { alpha: 1.0, inplace: true },
    docsPath: nnDocs('ELU'),
    paramSpecs: { alpha: numberParam, inplace: booleanParam },
    quickAdd: false,
  }),
  SELU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#F59E0B',
    defaultParams: { inplace: true },
    docsPath: nnDocs('SELU'),
    paramSpecs: { inplace: booleanParam },
    quickAdd: false,
  }),
  GELU: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#D97706',
    defaultParams: { approximate: 'none' },
    docsPath: nnDocs('GELU'),
    paramSpecs: { approximate: stringParam },
    quickAdd: false,
  }),
  Sigmoid: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#FCD34D',
    defaultParams: {},
    docsPath: nnDocs('Sigmoid'),
    paramSpecs: {},
    quickAdd: false,
  }),
  Tanh: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#FBBF24',
    defaultParams: {},
    docsPath: nnDocs('Tanh'),
    paramSpecs: {},
    quickAdd: false,
  }),
  LogSoftmax: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#F59E0B',
    defaultParams: { dim: 1 },
    docsPath: nnDocs('LogSoftmax'),
    paramSpecs: { dim: numberParam },
    quickAdd: false,
  }),
  Softmax: createLayer({
    category: 'Activations',
    kind: 'module',
    color: '#F59E0B',
    defaultParams: { dim: 1 },
    docsPath: nnDocs('Softmax'),
    paramSpecs: { dim: numberParam },
    quickAdd: false,
  }),
  MaxPool1d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#22D3EE',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('MaxPool1d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: false,
  }),
  MaxPool2d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#06B6D4',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('MaxPool2d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: true,
  }),
  MaxPool3d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#0891B2',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('MaxPool3d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: false,
  }),
  AvgPool1d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#38BDF8',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('AvgPool1d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: false,
  }),
  AvgPool2d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#0EA5E9',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('AvgPool2d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: false,
  }),
  AvgPool3d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#0284C7',
    defaultParams: { kernel_size: 2, stride: 2, padding: 0 },
    docsPath: nnDocs('AvgPool3d'),
    paramSpecs: { kernel_size: numberParam, stride: numberParam, padding: numberParam },
    quickAdd: false,
  }),
  AdaptiveAvgPool1d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#60A5FA',
    defaultParams: { output_size: 1 },
    docsPath: nnDocs('AdaptiveAvgPool1d'),
    paramSpecs: { output_size: literalParam },
    quickAdd: false,
  }),
  AdaptiveAvgPool2d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#3B82F6',
    defaultParams: { output_size: '[7, 7]' },
    docsPath: nnDocs('AdaptiveAvgPool2d'),
    paramSpecs: { output_size: literalParam },
    quickAdd: false,
  }),
  AdaptiveAvgPool3d: createLayer({
    category: 'Pooling',
    kind: 'module',
    color: '#2563EB',
    defaultParams: { output_size: '[7, 7, 7]' },
    docsPath: nnDocs('AdaptiveAvgPool3d'),
    paramSpecs: { output_size: literalParam },
    quickAdd: false,
  }),
  BatchNorm1d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#C084FC',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('BatchNorm1d'),
    paramSpecs: { num_features: numberParam },
    internalStateResolver: (params) => {
      const count = toNumber(params.num_features, 64);
      return [
        { name: 'weight', shape: `[${count}]`, category: 'parameter' },
        { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        { name: 'running_mean', shape: `[${count}]`, category: 'buffer' },
        { name: 'running_var', shape: `[${count}]`, category: 'buffer' },
      ];
    },
    quickAdd: false,
  }),
  BatchNorm2d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#A855F7',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('BatchNorm2d'),
    paramSpecs: { num_features: numberParam },
    internalStateResolver: (params) => {
      const count = toNumber(params.num_features, 64);
      return [
        { name: 'weight', shape: `[${count}]`, category: 'parameter' },
        { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        { name: 'running_mean', shape: `[${count}]`, category: 'buffer' },
        { name: 'running_var', shape: `[${count}]`, category: 'buffer' },
      ];
    },
    quickAdd: true,
  }),
  BatchNorm3d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#9333EA',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('BatchNorm3d'),
    paramSpecs: { num_features: numberParam },
    internalStateResolver: (params) => {
      const count = toNumber(params.num_features, 64);
      return [
        { name: 'weight', shape: `[${count}]`, category: 'parameter' },
        { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        { name: 'running_mean', shape: `[${count}]`, category: 'buffer' },
        { name: 'running_var', shape: `[${count}]`, category: 'buffer' },
      ];
    },
    quickAdd: false,
  }),
  LayerNorm: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#E879F9',
    defaultParams: { normalized_shape: 64 },
    docsPath: nnDocs('LayerNorm'),
    paramSpecs: { normalized_shape: literalParam },
    internalStateResolver: (params) => {
      const shape = toShapeLiteral(params.normalized_shape, '[64]');
      return [
        { name: 'weight', shape, category: 'parameter' },
        { name: 'bias', shape, category: 'parameter' },
      ];
    },
    quickAdd: false,
  }),
  GroupNorm: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#D946EF',
    defaultParams: { num_groups: 32, num_channels: 64 },
    docsPath: nnDocs('GroupNorm'),
    paramSpecs: { num_groups: numberParam, num_channels: numberParam },
    quickAdd: false,
  }),
  InstanceNorm1d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#A78BFA',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('InstanceNorm1d'),
    paramSpecs: { num_features: numberParam, affine: booleanParam },
    internalStateResolver: (params) => {
      if (params.affine === true || params.affine === 'true') {
        const count = toNumber(params.num_features, 64);
        return [
          { name: 'weight', shape: `[${count}]`, category: 'parameter' },
          { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        ];
      }
      return [];
    },
    quickAdd: false,
  }),
  InstanceNorm2d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#8B5CF6',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('InstanceNorm2d'),
    paramSpecs: { num_features: numberParam, affine: booleanParam },
    internalStateResolver: (params) => {
      if (params.affine === true || params.affine === 'true') {
        const count = toNumber(params.num_features, 64);
        return [
          { name: 'weight', shape: `[${count}]`, category: 'parameter' },
          { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        ];
      }
      return [];
    },
    quickAdd: false,
  }),
  InstanceNorm3d: createLayer({
    category: 'Normalization',
    kind: 'module',
    color: '#7C3AED',
    defaultParams: { num_features: 64 },
    docsPath: nnDocs('InstanceNorm3d'),
    paramSpecs: { num_features: numberParam, affine: booleanParam },
    internalStateResolver: (params) => {
      if (params.affine === true || params.affine === 'true') {
        const count = toNumber(params.num_features, 64);
        return [
          { name: 'weight', shape: `[${count}]`, category: 'parameter' },
          { name: 'bias', shape: `[${count}]`, category: 'parameter' },
        ];
      }
      return [];
    },
    quickAdd: false,
  }),
  Dropout: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#94A3B8',
    defaultParams: { p: 0.5 },
    docsPath: nnDocs('Dropout'),
    paramSpecs: { p: numberParam },
    quickAdd: false,
  }),
  Dropout2d: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#64748B',
    defaultParams: { p: 0.5 },
    docsPath: nnDocs('Dropout2d'),
    paramSpecs: { p: numberParam },
    quickAdd: false,
  }),
  Dropout3d: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#475569',
    defaultParams: { p: 0.5 },
    docsPath: nnDocs('Dropout3d'),
    paramSpecs: { p: numberParam },
    quickAdd: false,
  }),
  AlphaDropout: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#334155',
    defaultParams: { p: 0.5 },
    docsPath: nnDocs('AlphaDropout'),
    paramSpecs: { p: numberParam },
    quickAdd: false,
  }),
  Flatten: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#8B5CF6',
    defaultParams: { start_dim: 1, end_dim: -1 },
    docsPath: nnDocs('Flatten'),
    paramSpecs: { start_dim: numberParam, end_dim: numberParam },
    quickAdd: false,
  }),
  Unflatten: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#7C3AED',
    defaultParams: { dim: 1, unflattened_size: '[64, 7, 7]' },
    docsPath: nnDocs('Unflatten'),
    paramSpecs: { dim: numberParam, unflattened_size: literalParam },
    quickAdd: false,
  }),
  Upsample: createLayer({
    category: 'Utility',
    kind: 'module',
    color: '#6366F1',
    defaultParams: { size: '[224, 224]', mode: 'bilinear', align_corners: true },
    docsPath: nnDocs('Upsample'),
    paramSpecs: {
      size: literalParam,
      mode: stringParam,
      align_corners: booleanParam,
      scale_factor: numberParam,
    },
    quickAdd: false,
  }),
  Sequential: createLayer({
    category: 'Containers',
    kind: 'container',
    color: '#334155',
    defaultParams: {},
    docsPath: nnDocs('Sequential'),
    paramSpecs: {},
    quickAdd: true,
  }),
  ModuleList: createLayer({
    category: 'Containers',
    kind: 'container',
    color: '#334155',
    defaultParams: {},
    docsPath: nnDocs('ModuleList'),
    paramSpecs: {},
    quickAdd: true,
  }),
  ModuleDict: createLayer({
    category: 'Containers',
    kind: 'container',
    color: '#334155',
    defaultParams: {},
    docsPath: nnDocs('ModuleDict'),
    paramSpecs: {},
    quickAdd: true,
  }),
} as const satisfies Record<string, LayerDefinition>;

export const layerRegistry = registry;

export type ModuleType = keyof typeof layerRegistry;

export interface LayerEntry {
  type: ModuleType;
  definition: LayerDefinition;
}

const categoryOrder: LayerCategory[] = [
  'Data',
  'Convolutional',
  'Linear',
  'Activations',
  'Pooling',
  'Normalization',
  'Utility',
  'Merge',
  'Containers',
];

const layerEntries = Object.entries(layerRegistry).map(([type, definition]) => ({
  type: type as ModuleType,
  definition,
}));

export function getLayerDefinition(type: ModuleType): LayerDefinition {
  return layerRegistry[type];
}

export function getLayerColor(type: ModuleType): string {
  return getLayerDefinition(type).color;
}

export function getLayerCategories(): Array<{ category: LayerCategory; items: ModuleType[] }> {
  return categoryOrder.map((category) => ({
    category,
    items: layerEntries
      .filter((entry) => entry.definition.category === category)
      .map((entry) => entry.type),
  }));
}

export function getQuickAddLayerEntries(): LayerEntry[] {
  return layerEntries.filter((entry) => entry.definition.quickAdd !== false);
}

export function getAllLayerEntries(): LayerEntry[] {
  return layerEntries;
}

export function getDefaultParams(type: ModuleType): LayerParams {
  return structuredClone(getLayerDefinition(type).defaultParams);
}

export function getLayerDocUrl(type: ModuleType): string | null {
  return getLayerDefinition(type).docsPath;
}

export function getInternalStates(type: ModuleType, params: LayerParams): InternalStateDescriptor[] {
  return getLayerDefinition(type).internalStateResolver(params);
}

export function isContainerModule(type: ModuleType): boolean {
  return getLayerDefinition(type).kind === 'container';
}

export function createDefaultAttributeName(
  type: ModuleType,
  existingNodes: Array<{ moduleType: ModuleType }>,
): string {
  const count = existingNodes.filter((node) => node.moduleType === type).length;
  return `${type.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}_${count + 1}`;
}
