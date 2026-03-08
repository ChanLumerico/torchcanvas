import { getLayerDefinition, type ModuleType, type ParamSpec, type LayerParamValue } from '../domain/layers';

function escapePythonString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export function sanitizePythonIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_');

  const prefixed = /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
  const sanitized = prefixed.replace(/^_+$/, '');

  return sanitized || fallback;
}

export function getParamSpec(moduleType: ModuleType, paramKey: string): ParamSpec | undefined {
  return getLayerDefinition(moduleType).paramSpecs[paramKey];
}

export function serializePythonValue(value: LayerParamValue, spec?: ParamSpec): string {
  if (spec?.kind === 'boolean' || typeof value === 'boolean' || value === 'true' || value === 'false') {
    return value === true || value === 'true' ? 'True' : 'False';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (spec?.kind === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : '0';
  }

  if (spec?.kind === 'literal') {
    return String(value);
  }

  return `'${escapePythonString(String(value))}'`;
}
