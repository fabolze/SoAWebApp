import { entityRoute, schemaListRoute } from "./workspaceActions";

export interface DraftInventoryItem {
  key: string;
  title: string;
  subtitle: string;
  route: string;
  ts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered || fallback;
}

function labelFromEntry(entry: Record<string, unknown> | undefined, fallback: string): string {
  if (!entry) return fallback;
  return text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback))));
}

function parseStored(key: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null") as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function schemaDraft(key: string, schemaName: string, id: string): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const data = isRecord(parsed?.data) ? parsed.data : undefined;
  return {
    key,
    title: labelFromEntry(data, id || "New draft"),
    subtitle: `${schemaName.replace(/_/g, " ")} schema draft`,
    route: `${schemaListRoute(schemaName)}?selected=${encodeURIComponent(id || text(data?.id, "new"))}`,
    ts: Number(parsed?.ts) || 0,
  };
}

function packetDraft(key: string, kind: string, route: string, packetKey: string, idKey = "id"): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const packet = isRecord(parsed?.packet) ? parsed.packet : isRecord(parsed) ? parsed : {};
  const primary = isRecord(packet[packetKey]) ? packet[packetKey] as Record<string, unknown> : undefined;
  const id = text(primary?.[idKey], "new");
  return {
    key,
    title: labelFromEntry(primary, `${kind} draft`),
    subtitle: `${kind} local draft`,
    route: id === "new" ? route : `${route.replace(/\/new$/, "")}/${encodeURIComponent(id)}`,
    ts: Number(parsed?.ts) || 0,
  };
}

function itemEcosystemDraft(key: string): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const item = isRecord(parsed?.item) ? parsed.item : undefined;
  const id = text(item?.id, key.replace("soa.item-ecosystem.", "") || "new");
  return {
    key,
    title: labelFromEntry(item, "Item ecosystem draft"),
    subtitle: "item ecosystem local draft",
    route: id === "new" ? "/author/items/new/ecosystem" : `/author/items/${encodeURIComponent(id)}/ecosystem`,
    ts: Number(parsed?.ts) || 0,
  };
}

function dialogueFlowDraft(key: string): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const dialogue = isRecord(parsed?.dialogue) ? parsed.dialogue : undefined;
  const id = text(dialogue?.id, key.replace("soa.draft.dialogue_flow.", "") || "new");
  return {
    key,
    title: labelFromEntry(dialogue, "Dialogue flow draft"),
    subtitle: "dialogue flow local draft",
    route: id === "new" ? "/author/dialogues/new" : `/author/dialogues/${encodeURIComponent(id)}`,
    ts: Number(parsed?.ts) || 0,
  };
}

function storyTimelinePlan(key: string): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const beats = Array.isArray(parsed?.beats) ? parsed.beats.length : 0;
  return {
    key,
    title: "Story Timeline local plan",
    subtitle: `${beats} planning beat${beats === 1 ? "" : "s"}`,
    route: "/author/story-timeline",
    ts: Number(parsed?.ts) || 0,
  };
}

function creationFlowDraft(key: string): DraftInventoryItem | null {
  const parsed = parseStored(key);
  const returnStack = Array.isArray(parsed?.returnStack) ? parsed.returnStack : [];
  const firstFrame = returnStack.find(isRecord);
  const steps = Array.isArray(parsed?.steps) ? parsed.steps.length : 0;
  const placeholders = Array.isArray(parsed?.placeholders) ? parsed.placeholders.length : 0;
  return {
    key,
    title: text(parsed?.title, "Creation Flow draft"),
    subtitle: `creation flow · ${steps} steps · ${placeholders} placeholders · local only`,
    route: text(firstFrame?.workspace, "/author/world"),
    ts: Number(parsed?.updatedAt) || Number(parsed?.createdAt) || 0,
  };
}

export function readDraftInventory(): DraftInventoryItem[] {
  if (typeof localStorage === "undefined") return [];
  const items: DraftInventoryItem[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    let item: DraftInventoryItem | null = null;

    const schemaMatch = key.match(/^soa\.draft\.([^.]+)\.(.+)$/);
    if (key.startsWith("soa.creation-flow.draft.")) {
      item = creationFlowDraft(key);
    } else if (key.startsWith("soa.draft.dialogue_flow.") && key !== "soa.draft.dialogue_flow.new") {
      item = dialogueFlowDraft(key);
    } else if (schemaMatch && schemaMatch[2] !== "last") {
      item = schemaDraft(key, schemaMatch[1], schemaMatch[2]);
    } else if (key.startsWith("soa.encounter-stage.")) {
      item = packetDraft(key, "encounter", "/author/encounters/new", "encounter");
    } else if (key.startsWith("soa.creature-workshop.")) {
      item = packetDraft(key, "creature", "/author/creatures/new", "creature");
    } else if (key.startsWith("soa.ability-spellcraft.")) {
      item = packetDraft(key, "ability", "/author/abilities/new", "ability");
    } else if (key.startsWith("soa.item-ecosystem.")) {
      item = itemEcosystemDraft(key);
    } else if (key === "soa.story-timeline.local-plan.v1") {
      item = storyTimelinePlan(key);
    }

    if (item) items.push(item);
  }
  return items.sort((left, right) => right.ts - left.ts || left.title.localeCompare(right.title));
}

export function removeDraftInventoryItem(item: DraftInventoryItem) {
  localStorage.removeItem(item.key);
  if (item.key.startsWith("soa.creation-flow.draft.")) {
    const id = item.key.slice("soa.creation-flow.draft.".length);
    localStorage.removeItem(`soa.creation-flow.snapshots.${id}`);
  }
  const schemaMatch = item.key.match(/^soa\.draft\.([^.]+)\.(.+)$/);
  if (schemaMatch) {
    const lastKey = `soa.draft.last.${schemaMatch[1]}`;
    if (localStorage.getItem(lastKey) === item.key) localStorage.removeItem(lastKey);
  }
}

export function recommendedNextActions(schemaName: string, id: string): Array<{ label: string; route: string }> {
  if (!id) return [];
  const actions: Array<{ label: string; route: string }> = [];
  if (["items", "characters", "quests", "encounters", "dialogues", "locations"].includes(schemaName)) {
    actions.push({ label: "Open Author View", route: entityRoute(schemaName, id, true) });
  }
  if (schemaName === "items") actions.push({ label: "Open Ecosystem", route: `/author/items/${encodeURIComponent(id)}/ecosystem` });
  if (["items", "characters", "quests", "encounters", "dialogues", "locations", "factions", "events", "story_arcs"].includes(schemaName)) {
    const track = schemaName === "story_arcs" ? "story_arc" : schemaName.replace(/s$/, "");
    actions.push({ label: "Open Timeline", route: `/author/story-timeline?track=${encodeURIComponent(track)}&entity=${encodeURIComponent(id)}` });
  }
  actions.push({ label: "Open Dependency Map", route: "/author/dependencies" });
  return actions;
}
