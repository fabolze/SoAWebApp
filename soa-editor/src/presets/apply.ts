import type { PresetApplyMode } from './types';

function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function applyNode(current: any, patch: any, mode: PresetApplyMode): any {
  if (patch === undefined) return current;

  if (Array.isArray(patch)) {
    if (mode === 'fill_empty') {
      return isEmptyValue(current) ? deepClone(patch) : current;
    }
    return deepClone(patch);
  }

  if (!isPlainObject(patch)) {
    if (mode === 'fill_empty') {
      return isEmptyValue(current) ? patch : current;
    }
    return patch;
  }

  const base = isPlainObject(current) ? deepClone(current) : {};
  const out: Record<string, any> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const curValue = out[key];
    if (mode === 'fill_empty') {
      if (isPlainObject(patchValue) && isPlainObject(curValue)) {
        out[key] = applyNode(curValue, patchValue, mode);
      } else if (isEmptyValue(curValue)) {
        out[key] = applyNode(curValue, patchValue, mode);
      }
      continue;
    }
    if (isPlainObject(patchValue) && isPlainObject(curValue)) {
      out[key] = applyNode(curValue, patchValue, mode);
    } else {
      out[key] = applyNode(curValue, patchValue, mode);
    }
  }
  return out;
}

export function applyPresetData(
  currentData: Record<string, any>,
  presetData: Record<string, any>,
  mode: PresetApplyMode
): Record<string, any> {
  const base = isPlainObject(currentData) ? currentData : {};
  const patch = isPlainObject(presetData) ? presetData : {};
  return applyNode(base, patch, mode);
}
