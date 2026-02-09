import { generateSlug, generateUlid } from "../utils/generateId";

export interface CloneMutateOptions {
  numericMultiplier: number;
  numericOffset: number;
  nameSuffix: string;
  slugSuffix: string;
  addVariantTag: boolean;
}

export interface CloneMutateResult {
  nextData: Record<string, any>;
  changedCount: number;
}

export const defaultCloneMutateOptions: CloneMutateOptions = {
  numericMultiplier: 1,
  numericOffset: 0,
  nameSuffix: "Variant",
  slugSuffix: "variant",
  addVariantTag: true,
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function mutateNumericValue(value: number, isInteger: boolean, options: CloneMutateOptions): number {
  const scaled = value * options.numericMultiplier + options.numericOffset;
  return isInteger ? Math.round(scaled) : parseFloat(scaled.toFixed(4));
}

function mutateBySchemaNode(
  schemaNode: any,
  value: any,
  options: CloneMutateOptions,
  changedRef: { count: number }
): any {
  if (value === null || value === undefined) return value;

  const type = schemaNode?.type;
  if ((type === "number" || type === "integer") && typeof value === "number") {
    const nextNumeric = mutateNumericValue(value, type === "integer", options);
    if (nextNumeric !== value) changedRef.count += 1;
    return nextNumeric;
  }

  if ((type === "object" || schemaNode?.properties) && isPlainObject(value)) {
    const out = { ...value };
    const properties = schemaNode?.properties || {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (out[key] === undefined) continue;
      out[key] = mutateBySchemaNode(childSchema, out[key], options, changedRef);
    }
    return out;
  }

  if (type === "array" && Array.isArray(value)) {
    const childSchema = schemaNode?.items || {};
    return value.map((item) => mutateBySchemaNode(childSchema, item, options, changedRef));
  }

  return value;
}

function estimateBySchemaNode(
  schemaNode: any,
  value: any,
  options: CloneMutateOptions,
  changedRef: { count: number }
): void {
  if (value === null || value === undefined) return;

  const type = schemaNode?.type;
  if ((type === "number" || type === "integer") && typeof value === "number") {
    const nextNumeric = mutateNumericValue(value, type === "integer", options);
    if (nextNumeric !== value) changedRef.count += 1;
    return;
  }

  if ((type === "object" || schemaNode?.properties) && isPlainObject(value)) {
    const properties = schemaNode?.properties || {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (value[key] === undefined) continue;
      estimateBySchemaNode(childSchema, value[key], options, changedRef);
    }
    return;
  }

  if (type === "array" && Array.isArray(value)) {
    const childSchema = schemaNode?.items || {};
    value.forEach((item) => estimateBySchemaNode(childSchema, item, options, changedRef));
  }
}

export function buildMutatedClone(
  schema: any,
  data: Record<string, any>,
  options: CloneMutateOptions
): CloneMutateResult {
  const safeData = isPlainObject(data) ? data : {};
  const changedRef = { count: 0 };
  const rootSchema = { type: "object", properties: schema?.properties || {} };
  const mutated = mutateBySchemaNode(rootSchema, deepClone(safeData), options, changedRef);
  const next = isPlainObject(mutated) ? mutated : deepClone(safeData);

  if (typeof next.id === "string" && next.id.trim() !== "") {
    next.id = generateUlid();
    changedRef.count += 1;
  }

  if (typeof next.name === "string" && options.nameSuffix.trim() !== "") {
    const suffix = options.nameSuffix.trim();
    if (!next.name.endsWith(` ${suffix}`)) {
      next.name = `${next.name} ${suffix}`.trim();
      changedRef.count += 1;
    }
  }

  if (typeof next.slug === "string") {
    const suffix = options.slugSuffix.trim();
    if (suffix) {
      const baseSlug = next.slug.trim() || generateSlug(String(next.name || ""));
      next.slug = generateSlug(`${baseSlug}-${suffix}`);
      changedRef.count += 1;
    } else if (!next.slug.trim() && typeof next.name === "string") {
      next.slug = generateSlug(next.name);
      changedRef.count += 1;
    }
  }

  if (options.addVariantTag && Array.isArray(next.tags)) {
    const normalized = next.tags.map((t: any) => String(t));
    if (!normalized.includes("variant")) {
      next.tags = [...normalized, "variant"];
      changedRef.count += 1;
    }
  }

  return { nextData: next, changedCount: changedRef.count };
}

export function estimateMutatedCloneChangeCount(
  schema: any,
  data: Record<string, any>,
  options: CloneMutateOptions
): number {
  const safeData = isPlainObject(data) ? data : {};
  const changedRef = { count: 0 };
  const rootSchema = { type: "object", properties: schema?.properties || {} };
  estimateBySchemaNode(rootSchema, safeData, options, changedRef);

  if (typeof safeData.id === "string" && safeData.id.trim() !== "") {
    changedRef.count += 1;
  }

  if (typeof safeData.name === "string" && options.nameSuffix.trim() !== "") {
    const suffix = options.nameSuffix.trim();
    if (!safeData.name.endsWith(` ${suffix}`)) {
      changedRef.count += 1;
    }
  }

  if (typeof safeData.slug === "string") {
    const suffix = options.slugSuffix.trim();
    if (suffix) {
      const baseSlug = safeData.slug.trim() || generateSlug(String(safeData.name || ""));
      const nextSlug = generateSlug(`${baseSlug}-${suffix}`);
      if (nextSlug !== safeData.slug) {
        changedRef.count += 1;
      }
    } else if (!safeData.slug.trim() && typeof safeData.name === "string" && generateSlug(safeData.name)) {
      changedRef.count += 1;
    }
  }

  if (options.addVariantTag && Array.isArray(safeData.tags)) {
    const normalized = safeData.tags.map((t: any) => String(t));
    if (!normalized.includes("variant")) {
      changedRef.count += 1;
    }
  }

  return changedRef.count;
}
