import type { EntryRecord } from "../types/editorQol";
import { label, parseEntityTrackOccurrences, record, rows, text, type StoryOccurrence } from "./storyPlacement";

export interface EncounterAftermathRow {
  id: string;
  group: "payoff" | "participants" | "story";
  label: string;
  detail: string;
  route?: string;
}

interface DeriveEncounterAftermathOptions {
  encounter: EntryRecord;
  characters: EntryRecord[];
  items: EntryRecord[];
  currencies: EntryRecord[];
  factions: EntryRecord[];
  flags: EntryRecord[];
  timelinePacket?: EntryRecord | null;
}

function catalog(entries: EntryRecord[]): Map<string, EntryRecord> {
  return new Map(entries.map((entry) => [text(entry.id), entry]));
}

function routeFor(kind: string, id: string): string {
  if (!id) return "";
  const encoded = encodeURIComponent(id);
  if (kind === "item") return `/author/items/${encoded}/ecosystem`;
  if (kind === "character") return `/author/characters/${encoded}`;
  if (kind === "faction") return `/factions?selected=${encoded}`;
  if (kind === "location") return `/author/locations/${encoded}`;
  return "";
}

function consequenceDetail(occurrence: StoryOccurrence): string {
  return [
    text(occurrence.source_label, "Story beat"),
    text(occurrence.state_label, text(occurrence.change_type, text(occurrence.occurrence_kind))),
    text(occurrence.importance),
  ].filter(Boolean).join(" / ");
}

export function deriveEncounterAftermathRows({
  encounter,
  characters,
  items,
  currencies,
  factions,
  flags,
  timelinePacket,
}: DeriveEncounterAftermathOptions): EncounterAftermathRow[] {
  const result: EncounterAftermathRow[] = [];
  const rewards = record(encounter.rewards);
  const encounterId = text(encounter.id);
  const itemById = catalog(items);
  const currencyById = catalog(currencies);
  const factionById = catalog(factions);
  const flagById = catalog(flags);
  const characterById = catalog(characters);

  const xp = Number(rewards.xp || 0);
  if (xp) {
    result.push({ id: "payoff:xp", group: "payoff", label: "XP", detail: String(xp) });
  }
  rows(rewards.items).forEach((reward, index) => {
    const itemId = text(reward.item_id);
    if (!itemId) return;
    result.push({
      id: `payoff:item:${itemId}:${index}`,
      group: "payoff",
      label: label(itemById.get(itemId), itemId),
      detail: `Item reward x ${text(reward.quantity, "1")}`,
      route: routeFor("item", itemId),
    });
  });
  rows(rewards.currencies).forEach((reward, index) => {
    const currencyId = text(reward.currency_id);
    if (!currencyId) return;
    result.push({
      id: `payoff:currency:${currencyId}:${index}`,
      group: "payoff",
      label: label(currencyById.get(currencyId), currencyId),
      detail: `Currency reward x ${text(reward.amount, "0")}`,
    });
  });
  rows(rewards.reputation).forEach((reward, index) => {
    const factionId = text(reward.faction_id);
    if (!factionId) return;
    result.push({
      id: `payoff:reputation:${factionId}:${index}`,
      group: "payoff",
      label: label(factionById.get(factionId), factionId),
      detail: `Reputation ${text(reward.amount, "0")}`,
      route: routeFor("faction", factionId),
    });
  });
  (Array.isArray(rewards.flags_set) ? rewards.flags_set : []).map(String).filter(Boolean).forEach((flagId, index) => {
    result.push({
      id: `payoff:flag:${flagId}:${index}`,
      group: "payoff",
      label: label(flagById.get(flagId), flagId),
      detail: "Flag set",
    });
  });

  rows(encounter.participants).forEach((participant, index) => {
    const characterId = text(participant.character_id);
    if (!characterId) return;
    const contexts = Array.isArray(participant.contexts) ? participant.contexts.map(String).filter(Boolean).join(", ") : "No context";
    result.push({
      id: `participant:${characterId}:${index}`,
      group: "participants",
      label: label(characterById.get(characterId), characterId),
      detail: `${text(participant.combat_side, "Unassigned")} / ${contexts || "No context"}`,
      route: routeFor("character", characterId),
    });
  });

  const occurrences = parseEntityTrackOccurrences(timelinePacket);
  const encounterBeatIds = new Set(
    occurrences
      .filter((occurrence) =>
        occurrence.entity_kind === "encounter"
        && occurrence.entity_id === encounterId
        && occurrence.source_kind === "adventure_beat"
      )
      .map((occurrence) => occurrence.source_id)
      .filter(Boolean),
  );
  const consequenceKinds = new Set(["character", "faction", "item", "location"]);
  occurrences
    .filter((occurrence) =>
      consequenceKinds.has(occurrence.entity_kind)
      && occurrence.source_kind === "adventure_beat"
      && encounterBeatIds.has(occurrence.source_id)
      && (occurrence.occurrence_kind === "consequence" || occurrence.role === "state" || occurrence.role === "reward")
    )
    .forEach((occurrence) => {
      result.push({
        id: `story:${occurrence.id}`,
        group: "story",
        label: occurrence.label,
        detail: consequenceDetail(occurrence),
        route: routeFor(occurrence.entity_kind, occurrence.entity_id),
      });
    });

  return result;
}
