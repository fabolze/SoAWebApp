import { generateSlug } from "./generateId";
import type { EntryRecord } from "../types/editorQol";

export function getIdentitySource(data: EntryRecord): string {
  for (const key of ["name", "title", "label", "slug", "id"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function collectUsedSlugs(entries: EntryRecord[], currentId?: string): Set<string> {
  const used = new Set<string>();
  for (const entry of entries) {
    const entryId = typeof entry.id === "string" ? entry.id : "";
    if (currentId && entryId === currentId) continue;
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    if (slug) used.add(slug);
  }
  return used;
}

export function makeUniqueSlug(base: string, used: Set<string>): string {
  const normalized = generateSlug(base);
  if (!normalized) return "";
  if (!used.has(normalized)) return normalized;
  let index = 2;
  let candidate = `${normalized}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${normalized}-${index}`;
  }
  return candidate;
}

export function findSlugCollision(entries: EntryRecord[], slug: string, currentId?: string): EntryRecord | null {
  const normalized = slug.trim();
  if (!normalized) return null;
  return entries.find((entry) => {
    const entryId = typeof entry.id === "string" ? entry.id : "";
    if (currentId && entryId === currentId) return false;
    return typeof entry.slug === "string" && entry.slug.trim() === normalized;
  }) || null;
}
