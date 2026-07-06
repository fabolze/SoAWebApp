import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";

export type RequirementTargetGroup = { schema_name: string; entries: EntryRecord[] };
export type FlagUsage = { producers: EntryRecord[]; consumers: EntryRecord[] };
export type ScopedGatePacket = {
  requirements: EntryRecord[];
  requirement_usages_by_id: Record<string, EntryRecord[]>;
  flags: EntryRecord[];
  flag_usage_by_id: Record<string, FlagUsage>;
  requirement_targets: RequirementTargetGroup[];
  dependency_index: { nodes: EntryRecord[]; edges: EntryRecord[]; health?: EntryRecord };
};

export type ScopedGateBundle = {
  flags: EntryRecord[];
  requirement: EntryRecord | null;
  requirement_attachments: EntryRecord[];
};

export const emptyScopedGatePacket: ScopedGatePacket = {
  requirements: [],
  requirement_usages_by_id: {},
  flags: [],
  flag_usage_by_id: {},
  requirement_targets: [],
  dependency_index: { nodes: [], edges: [] },
};

export function gateText(value: unknown, fallback = ""): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export function gateRows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

export function gateStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function gateLabel(entry: EntryRecord | null | undefined, fallback = "Untitled"): string {
  if (!entry) return fallback;
  return gateText(entry.name, gateText(entry.title, gateText(entry.slug, gateText(entry.id, fallback))));
}

export function gateById(entries: EntryRecord[]): Map<string, EntryRecord> {
  const pairs: Array<[string, EntryRecord]> = [];
  entries.forEach((entry) => {
    const id = gateText(entry.id);
    if (id) pairs.push([id, entry]);
  });
  return new Map(pairs);
}

export function stableGateBundle(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function makeScopedGateFlag(baseName: string, suffix: string, tag = "scoped-gate"): EntryRecord {
  const slug = generateSlug(`${baseName} ${suffix}`) || `gate-${generateUlid().slice(-6).toLowerCase()}`;
  return {
    id: generateUlid(),
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `Tracks ${slug.replace(/-/g, " ")}.`,
    flag_type: "Story Progress",
    default_value: false,
    content_pack_id: "",
    tags: [tag],
  };
}

export function makeScopedGateRequirement(baseName: string, requiredFlags: string[], tag = "scoped-gate"): EntryRecord {
  const slug = generateSlug(`${baseName} gate`) || `gate-${generateUlid().slice(-6).toLowerCase()}`;
  return {
    id: generateUlid(),
    slug,
    required_flags: requiredFlags,
    forbidden_flags: [],
    min_faction_reputation: [],
    tags: [tag],
  };
}

export function normalizeScopedGateRequirement(requirement: EntryRecord): EntryRecord {
  return {
    ...requirement,
    required_flags: gateStrings(requirement.required_flags),
    forbidden_flags: gateStrings(requirement.forbidden_flags),
    min_faction_reputation: gateRows(requirement.min_faction_reputation),
    tags: gateStrings(requirement.tags),
  };
}

export function buildScopedGateBundle(flags: EntryRecord[], requirement: EntryRecord | null, attachment: EntryRecord | null): ScopedGateBundle {
  return {
    flags,
    requirement: requirement ? normalizeScopedGateRequirement(requirement) : null,
    requirement_attachments: attachment ? [attachment] : [],
  };
}

export function scopedGateIssues(packet: ScopedGatePacket, bundle: ScopedGateBundle, flagsById: Map<string, EntryRecord>): string[] {
  const issues: string[] = [];
  const slugs = new Map<string, string>();
  [...packet.flags, ...bundle.flags].forEach((flag) => {
    const slug = gateText(flag.slug);
    if (!slug) return;
    if (slugs.has(slug) && slugs.get(slug) !== gateText(flag.id)) issues.push(`Duplicate flag slug: ${slug}.`);
    slugs.set(slug, gateText(flag.id));
  });
  if (bundle.requirement) {
    const required = gateStrings(bundle.requirement.required_flags);
    const forbidden = gateStrings(bundle.requirement.forbidden_flags);
    required.filter((id) => !flagsById.has(id)).forEach((id) => issues.push(`Requirement references missing required flag ${id}.`));
    forbidden.filter((id) => !flagsById.has(id)).forEach((id) => issues.push(`Requirement references missing forbidden flag ${id}.`));
    required.filter((id) => forbidden.includes(id)).forEach((id) => issues.push(`Requirement both requires and forbids ${gateLabel(flagsById.get(id), id)}.`));
  }
  return issues;
}
