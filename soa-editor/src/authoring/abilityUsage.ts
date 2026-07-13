import type { EntryRecord } from "../types/editorQol";

export interface AbilityUsageEncounterContext {
  encounterId: string;
  encounterLabel: string;
  combatSide: string;
  contexts: string[];
}

export interface AbilityUsageProfileRow {
  profileId: string;
  characterId: string;
  label: string;
  enemyType: string;
  aggression: string;
  persisted: boolean;
  assigned: boolean;
  changed: boolean;
  encounterContexts: AbilityUsageEncounterContext[];
}

export interface AbilityUsageEncounterRoleRow {
  id: string;
  encounterId: string;
  encounterLabel: string;
  characterId: string;
  characterLabel: string;
  combatSide: string;
  contexts: string[];
  profileId: string;
  profileLabel: string;
  enemyType: string;
  aggression: string;
  persisted: boolean;
  assigned: boolean;
  changed: boolean;
  missingProfile: boolean;
  bossLike: boolean;
  signatureAbility: boolean;
  tacticalWarnings: string[];
}

export interface AbilityUsageModel {
  profileRows: AbilityUsageProfileRow[];
  encounterRoleRows: AbilityUsageEncounterRoleRow[];
  classRows: EntryRecord[];
  talentRows: EntryRecord[];
  persistedUsageCount: number;
  draftAssignmentCount: number;
  warnings: string[];
}

export type AbilityRhythmSegmentKind =
  | "cast"
  | "impact"
  | "effect"
  | "status"
  | "tick"
  | "upkeep"
  | "recovery"
  | "cooldown"
  | "deactivate";

export interface AbilityRhythmSegment {
  id: string;
  kind: AbilityRhythmSegmentKind;
  label: string;
  start: number;
  end: number;
  effectId?: string;
  phase?: string;
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rowLabel(row: EntryRecord | undefined, fallback: string): string {
  return text(row?.name, text(row?.title, text(row?.slug, text(row?.id, fallback))));
}

function profileCharacter(profile: EntryRecord): EntryRecord {
  return typeof profile.character === "object" && profile.character !== null && !Array.isArray(profile.character)
    ? profile.character as EntryRecord
    : {};
}

function containsId(rows: EntryRecord[], id: string): boolean {
  return rows.some((row) => text(row.id) === id);
}

function abilityEffectLinks(ability: EntryRecord): EntryRecord[] {
  const links = rows(ability.effect_links);
  if (links.length > 0) return links;
  return strings(ability.effects).map((effect_id, sort_order) => ({ effect_id, phase: "Impact", turn_offset: 0, sort_order }));
}

function sideGroup(side: string): "friendly" | "hostile" | "neutral" {
  const value = side.toLowerCase();
  if (["friendly", "ally", "allied", "player"].includes(value)) return "friendly";
  if (["hostile", "enemy", "boss"].includes(value)) return "hostile";
  return "neutral";
}

export function buildAbilityUsageModel({
  ability,
  usage,
  profiles,
  encounters,
  assignedProfileIds,
}: {
  ability: EntryRecord;
  usage: Record<string, EntryRecord[]>;
  profiles: EntryRecord[];
  encounters: EntryRecord[];
  assignedProfileIds: string[];
}): AbilityUsageModel {
  const abilityId = text(ability.id);
  const assigned = new Set(assignedProfileIds);
  const signatureAbility = strings(ability.tags).map((tag) => tag.toLowerCase()).includes("signature");
  const persistedProfileIds = new Set([
    ...rows(usage.combat_profiles).map((profile) => text(profile.id)),
    ...profiles.filter((profile) => strings(profile.custom_abilities).includes(abilityId)).map((profile) => text(profile.id)),
  ].filter(Boolean));
  const profilesByCharacterId = new Map(
    profiles
      .map((profile) => [text(profile.character_id), profile] as const)
      .filter(([characterId]) => Boolean(characterId)),
  );
  const profileRows = profiles.map((profile) => {
    const profileId = text(profile.id);
    const character = profileCharacter(profile);
    const characterId = text(profile.character_id);
    const encounterContexts = encounters.flatMap((encounter) => rows(encounter.participants)
      .filter((participant) => text(participant.character_id) === characterId)
      .map((participant) => ({
        encounterId: text(encounter.id),
        encounterLabel: rowLabel(encounter, text(encounter.id, "Encounter")),
        combatSide: text(participant.combat_side, "Neutral"),
        contexts: strings(participant.contexts),
      })));
    const persisted = persistedProfileIds.has(profileId);
    const isAssigned = assigned.has(profileId);
    return {
      profileId,
      characterId,
      label: rowLabel(character, characterId || profileId),
      enemyType: text(profile.enemy_type, "other"),
      aggression: text(profile.aggression, "Neutral"),
      persisted,
      assigned: isAssigned,
      changed: persisted !== isAssigned,
      encounterContexts,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const encounterRoleRows = encounters.flatMap((encounter) => {
    const encounterId = text(encounter.id);
    const encounterLabel = rowLabel(encounter, encounterId || "Encounter");
    return rows(encounter.participants).map((participant, index) => {
      const characterId = text(participant.character_id);
      const profile = profilesByCharacterId.get(characterId);
      const profileId = text(profile?.id);
      const character = profile ? profileCharacter(profile) : {};
      const persisted = profileId ? persistedProfileIds.has(profileId) : false;
      const isAssigned = profileId ? assigned.has(profileId) : false;
      const enemyType = text(profile?.enemy_type, "other");
      const combatSide = text(participant.combat_side, "Neutral");
      const participantRows = rows(encounter.participants);
      const group = sideGroup(combatSide);
      const allies = participantRows.filter((candidate) => sideGroup(text(candidate.combat_side, "Neutral")) === group).length;
      const opponents = participantRows.filter((candidate) => {
        const candidateGroup = sideGroup(text(candidate.combat_side, "Neutral"));
        return group !== "neutral" && candidateGroup !== "neutral" && candidateGroup !== group;
      }).length;
      const tacticalWarnings: string[] = [];
      const targeting = text(ability.targeting);
      if (isAssigned && targeting === "Enemies" && opponents === 0) tacticalWarnings.push("No modeled opposing-side participant for this enemy-targeted ability.");
      if (isAssigned && targeting === "Allies" && allies <= 1) tacticalWarnings.push("No second same-side participant for this ally-targeted ability.");
      if (isAssigned && targeting === "Area" && participantRows.length < 2) tacticalWarnings.push("Area targeting has no multi-participant encounter pressure here.");
      return {
        id: `${encounterId || "encounter"}:${characterId || "participant"}:${index}`,
        encounterId,
        encounterLabel,
        characterId,
        characterLabel: rowLabel(character, characterId || "Unknown participant"),
        combatSide,
        contexts: strings(participant.contexts),
        profileId,
        profileLabel: profile ? rowLabel(character, characterId || profileId) : "",
        enemyType,
        aggression: text(profile?.aggression, "Neutral"),
        persisted,
        assigned: isAssigned,
        changed: Boolean(profileId) && persisted !== isAssigned,
        missingProfile: !profileId,
        bossLike: enemyType === "boss" || strings(encounter.tags).map((tag) => tag.toLowerCase()).includes("boss") || combatSide.toLowerCase() === "boss",
        signatureAbility,
        tacticalWarnings,
      };
    });
  }).sort((a, b) => a.encounterLabel.localeCompare(b.encounterLabel) || a.characterLabel.localeCompare(b.characterLabel));
  const classRows = rows(usage.characterclasses);
  const talentRows = rows(usage.talent_nodes);
  const persistedUsageCount = persistedProfileIds.size + classRows.length + talentRows.length;
  const draftAssignmentCount = assigned.size;
  const warnings: string[] = [];
  if (persistedUsageCount === 0 && draftAssignmentCount === 0) warnings.push("Ability is unused by combat profiles, classes, and talent nodes.");
  if (signatureAbility && draftAssignmentCount === 0) warnings.push("Signature ability is not assigned to any combat profile.");
  if (encounterRoleRows.some((row) => row.missingProfile)) warnings.push("Some encounter participants cannot receive this ability because they have no combat profile.");
  encounterRoleRows.flatMap((row) => row.tacticalWarnings.map((warning) => `${row.encounterLabel} / ${row.characterLabel}: ${warning}`)).forEach((warning) => warnings.push(warning));
  if (signatureAbility && encounterRoleRows.some((row) => row.bossLike) && !encounterRoleRows.some((row) => row.bossLike && row.assigned)) {
    warnings.push("A boss-like encounter role exists, but this signature ability is not assigned to that role.");
  }
  return { profileRows, encounterRoleRows, classRows, talentRows, persistedUsageCount, draftAssignmentCount, warnings };
}

export function buildAbilityRhythmSegments(ability: EntryRecord, effects: EntryRecord[], statuses: EntryRecord[]): AbilityRhythmSegment[] {
  const effectMap = new Map(effects.map((effect) => [text(effect.id), effect]));
  const statusMap = new Map(statuses.map((status) => [text(status.id), status]));
  const castTime = Math.max(0, number(ability.cast_time));
  const recovery = Math.max(0, number(ability.recovery_time));
  const cooldown = Math.max(0, number(ability.cooldown));
  const upkeep = Math.max(0, number(ability.upkeep_cost));
  const type = text(ability.type, "Active");
  const segments: AbilityRhythmSegment[] = [];

  if (castTime > 0) segments.push({ id: "cast", kind: "cast", label: "Cast", start: 0, end: castTime });
  segments.push({ id: "impact", kind: "impact", label: "Impact", start: castTime, end: castTime });

  abilityEffectLinks(ability).forEach((link, index) => {
    const phase = text(link.phase, "Impact");
    const effect = effectMap.get(text(link.effect_id));
    const base = phase === "Cast" ? 0 : phase === "Aftermath" ? castTime + recovery : phase === "Deactivate" ? castTime + recovery + cooldown : castTime;
    const start = Math.max(0, base + number(link.turn_offset));
    const effectId = text(link.effect_id);
    const label = rowLabel(effect, effectId || `Effect ${index + 1}`);
    segments.push({ id: `effect-${effectId || index}`, kind: phase === "Deactivate" ? "deactivate" : "effect", label, start, end: start, effectId, phase });
    if (!effect) return;
    const duration = Math.max(0, number(effect.duration, number(statusMap.get(text(effect.status_id))?.default_duration)));
    if (duration > 0) {
      segments.push({ id: `status-${effectId || index}`, kind: "status", label: `${label} duration`, start, end: start + duration, effectId, phase });
      const interval = Math.max(0, number(effect.tick_interval));
      if (interval > 0) {
        for (let tick = start + interval; tick <= start + duration; tick += interval) {
          segments.push({ id: `tick-${effectId || index}-${tick}`, kind: "tick", label: `${label} tick`, start: tick, end: tick, effectId, phase });
        }
      }
    }
  });

  if (type === "Toggle" && upkeep > 0) segments.push({ id: "upkeep", kind: "upkeep", label: `Upkeep ${upkeep} / turn`, start: castTime + 1, end: castTime + 1 });
  if (recovery > 0) segments.push({ id: "recovery", kind: "recovery", label: "Recovery", start: castTime, end: castTime + recovery });
  if (cooldown > 0) segments.push({ id: "cooldown", kind: "cooldown", label: "Cooldown", start: castTime + recovery, end: castTime + recovery + cooldown });

  return segments.sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label));
}

export function abilityHasPersistedUsage(usage: Record<string, EntryRecord[]>, profileId: string): boolean {
  return containsId(rows(usage.combat_profiles), profileId);
}
