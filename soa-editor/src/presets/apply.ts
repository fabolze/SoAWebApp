import type { PresetApplyMode } from './types';
import { asRecord, isRecord, type UnknownRecord } from '../types/common';

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
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function applyNode(current: unknown, patch: unknown, mode: PresetApplyMode): unknown {
  if (patch === undefined) return current;

  if (Array.isArray(patch)) {
    if (mode === 'fill_empty') {
      return isEmptyValue(current) ? deepClone(patch) : current;
    }
    return deepClone(patch);
  }

  if (!isRecord(patch)) {
    if (mode === 'fill_empty') {
      return isEmptyValue(current) ? patch : current;
    }
    return patch;
  }

  const base = isRecord(current) ? deepClone(current) : {};
  const out: UnknownRecord = { ...base };
  for (const [key, patchValue] of Object.entries(asRecord(patch))) {
    const curValue = out[key];
    if (mode === 'fill_empty') {
      if (isRecord(patchValue) && isRecord(curValue)) {
        out[key] = applyNode(curValue, patchValue, mode);
      } else if (isEmptyValue(curValue)) {
        out[key] = applyNode(curValue, patchValue, mode);
      }
      continue;
    }
    if (isRecord(patchValue) && isRecord(curValue)) {
      out[key] = applyNode(curValue, patchValue, mode);
    } else {
      out[key] = applyNode(curValue, patchValue, mode);
    }
  }
  return out;
}

export function applyPresetData(
  currentData: UnknownRecord,
  presetData: UnknownRecord,
  mode: PresetApplyMode
): UnknownRecord {
  const base = isRecord(currentData) ? currentData : {};
  const patch = isRecord(presetData) ? presetData : {};
  return asRecord(applyNode(base, patch, mode));
}
