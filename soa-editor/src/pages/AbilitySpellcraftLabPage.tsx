import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SchemaForm from "../components/SchemaForm";
import SimulationWorkbench from "../components/simulation/SimulationWorkbench";
import AbilityLabBench from "../components/abilityLab/AbilityLabBench";
import { useDirtyState } from "../components/useDirtyState";
import { EditableTagList, ReferenceManageLink, displayText, editableText, isRecord, rowLabel } from "../authoringViews/controls";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import type { SchemaDefinition } from "../components/schemaForm/types";
import { generateSlug, generateUlid } from "../utils/generateId";
import abilitySchema from "../../../backend/app/schemas/abilities.json";

type Lens = "sentence" | "mix" | "efficiency" | "usage" | "damage" | "issues";

export interface AbilityPacket {
  ability: EntryRecord;
  linked_effects: EntryRecord[];
  linked_statuses: EntryRecord[];
  requirement: EntryRecord | null;
  assigned_combat_profile_ids: string[];
  catalogs: {
    abilities: EntryRecord[];
    effects: EntryRecord[];
    statuses: EntryRecord[];
    stats: EntryRecord[];
    requirements: EntryRecord[];
    combat_profiles: EntryRecord[];
    characterclasses: EntryRecord[];
    talent_nodes: EntryRecord[];
    items: EntryRecord[];
    characters: EntryRecord[];
    encounters: EntryRecord[];
  };
  usage: {
    abilities: Record<string, Record<string, EntryRecord[]>>;
    effects: Record<string, Record<string, EntryRecord[]>>;
    statuses: Record<string, Record<string, EntryRecord[]>>;
  };
  analysis: { similar_abilities: EntryRecord[] };
  relations: EntryRecord[];
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const TYPES = ["Active", "Passive", "Toggle"];
const TRIGGERS = ["On Use", "Passive", "On Hit", "When Damaged", "On Kill"];
const TARGETS = ["Single", "Area", "Self", "Allies", "Enemies"];
const EFFECT_TYPES = ["Status", "Damage", "Heal", "Modifier", "Reflect", "Summon", "Shield", "Control"];
const EFFECT_TARGETS = ["Self", "Enemy", "Ally", "All", "Area"];
const DAMAGE_TYPES = ["Slashing", "Piercing", "Blunt", "Fire", "Water", "Air", "Earth", "Poison", "Psychic", "Light", "Shadow"];
const EFFECT_PHASES = ["Cast", "Impact", "Aftermath", "WhileActive", "Deactivate"];
const CALCULATION_BASES = ["Fixed Value", "Source Stat", "Weapon Damage", "Damage Dealt", "Source Max Health", "Target Max Health"];
const EFFECT_TRIGGERS = ["None", "On Hit", "When Damaged", "On Kill", "On Cast", "Passive"];

const EFFECT_RECIPES: Array<{ label: string; data: EntryRecord }> = [
  { label: "Direct Damage", data: { type: "Damage", target: "Enemy", value_type: "Flat", value: 20, calculation_basis: "Fixed Value", duration: 0, trigger_condition: "None", stackable: false, tags: ["damage", "direct"] } },
  { label: "Healing", data: { type: "Heal", target: "Ally", value_type: "Flat", value: 20, calculation_basis: "Fixed Value", duration: 0, trigger_condition: "None", stackable: false, tags: ["heal"] } },
  { label: "Control", data: { type: "Control", target: "Enemy", value_type: "None", value: 1, duration: 2, apply_chance: 100, trigger_condition: "On Cast", stackable: false, tags: ["control"] } },
  { label: "Status", data: { type: "Status", target: "Enemy", value_type: "None", duration: 3, apply_chance: 100, trigger_condition: "On Cast", stackable: false, tags: ["status"] } },
  { label: "Shield", data: { type: "Shield", target: "Self", value_type: "Flat", value: 20, calculation_basis: "Fixed Value", duration: 3, trigger_condition: "None", stackable: false, tags: ["shield"] } },
  { label: "Damage Over Time", data: { type: "Status", target: "Enemy", value_type: "Flat", value: 8, calculation_basis: "Source Stat", scaling_multiplier: 0.2, damage_type: "Fire", tick_interval: 1, duration: 5, apply_chance: 100, trigger_condition: "On Cast", stackable: false, tags: ["status", "dot"] } },
];

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function abilityEffectLinks(ability: EntryRecord): EntryRecord[] {
  const linked = rows(ability.effect_links);
  if (linked.length > 0) return linked;
  return strings(ability.effects).map((effect_id, sort_order) => ({ effect_id, phase: "Impact", turn_offset: 0, sort_order }));
}

function draftKey(id: string): string {
  return `soa.ability-spellcraft.${id || "new"}`;
}

function cleanPacket(packet: AbilityPacket): AbilityPacket {
  return {
    ...packet,
    ability: Object.fromEntries(Object.entries(packet.ability).filter(([key]) => !key.startsWith("__"))),
  };
}

function effectMap(packet: AbilityPacket): Map<string, EntryRecord> {
  const combined = [...packet.catalogs.effects, ...packet.linked_effects];
  return new Map(combined.map((effect) => [displayText(effect.id), effect]));
}

function statusMap(packet: AbilityPacket): Map<string, EntryRecord> {
  const combined = [...packet.catalogs.statuses, ...packet.linked_statuses];
  return new Map(combined.map((status) => [displayText(status.id), status]));
}

function combatSentence(packet: AbilityPacket): string {
  const effects = effectMap(packet);
  const payload = strings(packet.ability.effects)
    .map((id) => effects.get(id))
    .filter(Boolean)
    .map((effect) => `${displayText(effect?.type, "effect").toLowerCase()} ${rowLabel(effect || {}, "payload")}`)
    .join(", ");
  const scaling = rows(packet.ability.scaling)
    .map((row) => {
      const stat = packet.catalogs.stats.find((entry) => displayText(entry.id) === displayText(row.stat_id));
      return `${Number(row.multiplier || 0).toFixed(2)}x ${rowLabel(stat || {}, "stat")}`;
    })
    .join(" + ");
  const cadence = `${Number(packet.ability.resource_cost || 0)} cost / ${Number(packet.ability.cooldown || 0)} cooldown`;
  return `${displayText(packet.ability.type, "Ability")} ${displayText(packet.ability.trigger_condition, "trigger")} reaches ${displayText(packet.ability.targeting, "unset targets")} and applies ${payload || "no payload"}${scaling ? `, scaling from ${scaling}` : ""}, for ${cadence}.`;
}

function targetCompatible(abilityTarget: string, effectTarget: string): boolean {
  if (!abilityTarget || !effectTarget) return true;
  if (abilityTarget === "Self") return effectTarget === "Self";
  if (abilityTarget === "Single") return ["Enemy", "Ally"].includes(effectTarget);
  if (abilityTarget === "Area") return ["Area", "All"].includes(effectTarget);
  if (abilityTarget === "Allies") return ["Ally", "Self", "All", "Area"].includes(effectTarget);
  if (abilityTarget === "Enemies") return ["Enemy", "All", "Area"].includes(effectTarget);
  return true;
}

function health(packet: AbilityPacket): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const ability = packet.ability;
  const effects = effectMap(packet);
  const statuses = statusMap(packet);
  if (!displayText(ability.id)) blockers.push("Ability ID is required.");
  if (!displayText(ability.slug)) blockers.push("Slug is required.");
  if (!displayText(ability.name)) blockers.push("Name is required.");
  if (!TYPES.includes(displayText(ability.type))) blockers.push("Ability type is invalid.");
  strings(ability.effects).forEach((id) => {
    const effect = effects.get(id);
    if (!effect) {
      blockers.push(`Payload references missing effect ${id}.`);
      return;
    }
    if (!targetCompatible(displayText(ability.targeting), displayText(effect.target))) {
      warnings.push(`${rowLabel(effect, id)} targets ${displayText(effect.target)} but the ability reaches ${displayText(ability.targeting)}.`);
    }
    if (displayText(effect.type) === "Damage" && !displayText(effect.damage_type) && displayText(ability.damage_type_source, "None") === "None") {
      blockers.push(`${rowLabel(effect, id)} needs its own damage type or an ability damage source.`);
    }
    if (displayText(effect.type) === "Status" && displayText(effect.status_operation, "Apply") === "Apply" && (!displayText(effect.status_id) || !statuses.has(displayText(effect.status_id)))) {
      blockers.push(`${rowLabel(effect, id)} needs a valid linked status.`);
    }
  });
  rows(ability.scaling).forEach((row) => {
    if (!displayText(row.stat_id) || !packet.catalogs.stats.some((entry) => displayText(entry.id) === displayText(row.stat_id))) blockers.push("Every scaling card needs a valid stat.");
    if (!Number.isFinite(Number(row.multiplier))) blockers.push("Every scaling card needs a numeric multiplier.");
  });
  if (displayText(ability.damage_type_source) === "Fixed" && !displayText(ability.damage_type)) blockers.push("Fixed damage type source requires a damage type.");
  if (strings(ability.effects).length === 0) warnings.push("Ability has no payload effects.");
  if (rows(ability.scaling).length === 0) warnings.push("Ability has no ability-level scaling.");
  if (!displayText(ability.design_intent)) warnings.push("Ability has no authored design intent.");
  if (!displayText(ability.counterplay_notes)) warnings.push("Ability has no authored counterplay.");
  if (Number(ability.resource_cost || 0) > 50 && Number(ability.cooldown || 0) > 8) warnings.push("High cost and long cooldown may make the ability difficult to justify.");
  const usage = packet.usage.abilities[displayText(ability.id)] || {};
  if (Object.values(usage).flat().length === 0 && packet.assigned_combat_profile_ids.length === 0) warnings.push("Ability is unused by combat profiles, classes, and talent nodes.");
  const similar = localSimilarAbilities(packet);
  if (similar.length > 0) warnings.push(`${similar.length} structurally similar ability or abilities found.`);
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

function localSimilarAbilities(packet: AbilityPacket): EntryRecord[] {
  const effects = effectMap(packet);
  const types = strings(packet.ability.effects).map((id) => displayText(effects.get(id)?.type)).filter(Boolean).sort().join("|");
  return packet.catalogs.abilities.filter((candidate) => {
    if (displayText(candidate.id) === displayText(packet.ability.id)) return false;
    let score = 0;
    if (displayText(candidate.type) === displayText(packet.ability.type)) score += 1;
    if (displayText(candidate.targeting) === displayText(packet.ability.targeting)) score += 1;
    if (displayText(candidate.trigger_condition) === displayText(packet.ability.trigger_condition)) score += 1;
    const candidateTypes = strings(candidate.effects).map((id) => displayText(effects.get(id)?.type)).filter(Boolean).sort().join("|");
    if (types && candidateTypes === types) score += 2;
    return score >= 3;
  });
}

export default function AbilitySpellcraftLabPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = !id || id === "new" || location.pathname.endsWith("/new") || location.pathname === "/author/abilities";
  const [packet, setPacket] = useState<AbilityPacket | null>(null);
  const [original, setOriginal] = useState<AbilityPacket | null>(null);
  const [effectUpserts, setEffectUpserts] = useState<EntryRecord[]>([]);
  const [statusUpserts, setStatusUpserts] = useState<EntryRecord[]>([]);
  const [originalUpserts, setOriginalUpserts] = useState({ effects: [] as EntryRecord[], statuses: [] as EntryRecord[] });
  const [selectedEffectId, setSelectedEffectId] = useState("");
  const [lens, setLens] = useState<Lens>("sentence");
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const dirtySource = useRef(`ability-spellcraft-${id || "new"}`);
  const { setDirty } = useDirtyState();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const serialized = stable(packet ? { packet: cleanPacket(packet), effectUpserts, statusUpserts } : null);
  const originalSerialized = stable(original ? { packet: cleanPacket(original), effectUpserts: originalUpserts.effects, statusUpserts: originalUpserts.statuses } : null);
  const dirty = !!packet && !!original && serialized !== originalSerialized;
  const issues = useMemo(() => packet ? health(packet) : { blockers: [], warnings: [] }, [packet]);

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const endpoint = isNew ? "/api/ui/abilities" : `/api/ui/abilities/${encodeURIComponent(id)}`;
    apiFetch(endpoint).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Ability Spellcraft Lab failed to load."));
      const base = body as unknown as AbilityPacket;
      const stored = localStorage.getItem(draftKey(isNew ? "new" : id));
      let next = base;
      let effects: EntryRecord[] = [];
      let statuses: EntryRecord[] = [];
      if (stored) {
        try {
          const draft = JSON.parse(stored);
          if (draft.packet) {
            next = draft.packet;
            effects = rows(draft.effectUpserts);
            statuses = rows(draft.statusUpserts);
            setRestored(true);
          }
        } catch {
          localStorage.removeItem(draftKey(isNew ? "new" : id));
        }
      }
      if (!cancelled) {
        setPacket(next);
        setOriginal(base);
        setEffectUpserts(effects);
        setStatusUpserts(statuses);
        setOriginalUpserts({ effects: [], statuses: [] });
      }
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Ability Spellcraft Lab failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, isNew]);

  useEffect(() => {
    if (!dirty || !packet) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(draftKey(isNew ? "new" : id), JSON.stringify({ packet, effectUpserts, statusUpserts, ts: Date.now() }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [dirty, effectUpserts, id, isNew, packet, statusUpserts]);

  const updateAbility = (patch: EntryRecord) => setPacket((current) => current ? ({ ...current, ability: { ...current.ability, ...patch } }) : current);

  const save = async () => {
    if (!packet || issues.blockers.length > 0) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/ui/abilities/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ability: packet.ability,
          effect_upserts: effectUpserts,
          status_upserts: statusUpserts,
          requirement: packet.requirement,
          assigned_combat_profile_ids: packet.assigned_combat_profile_ids,
          relations: packet.relations || [],
          combat_profile_upserts: packet.catalogs.combat_profiles.filter((profile) => packet.assigned_combat_profile_ids.includes(displayText(profile.id))),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Ability bundle failed to save."));
      const saved = body as unknown as AbilityPacket;
      localStorage.removeItem(draftKey(isNew ? "new" : id));
      setPacket(saved);
      setOriginal(saved);
      setEffectUpserts([]);
      setStatusUpserts([]);
      setOriginalUpserts({ effects: [], statuses: [] });
      setRestored(false);
      setReviewOpen(false);
      setNotice("Ability spellcraft bundle saved.");
      if (isNew) navigate(`/author/abilities/${encodeURIComponent(displayText(saved.ability.id))}`, { replace: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ability bundle failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!original) return;
    localStorage.removeItem(draftKey(isNew ? "new" : id));
    setPacket(original);
    setEffectUpserts([]);
    setStatusUpserts([]);
    setSelectedEffectId("");
    setRestored(false);
    setNotice("Unsaved spellcraft changes reset.");
  };

  if (loading || !packet) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading Ability Spellcraft Lab...</div>;

  const allDraftEffects = mergeById(packet.catalogs.effects, effectUpserts);
  const allDraftStatuses = mergeById(packet.catalogs.statuses, statusUpserts);
  const selectedEffect = allDraftEffects.find((effect) => displayText(effect.id) === selectedEffectId) || null;
  const selectedIsEditable = !!selectedEffect && effectUpserts.some((effect) => displayText(effect.id) === selectedEffectId);
  const linkEffect = (effectId: string) => {
    if (strings(packet.ability.effects).includes(effectId)) return;
    updateAbility({
      effects: [...strings(packet.ability.effects), effectId],
      effect_links: [...abilityEffectLinks(packet.ability), { effect_id: effectId, phase: "Impact", turn_offset: 0, sort_order: abilityEffectLinks(packet.ability).length }],
    });
    setSelectedEffectId(effectId);
  };
  const removeEffectFromPayload = (effectId: string) => {
    const persisted = packet.catalogs.effects.some((effect) => displayText(effect.id) === effectId);
    const removedDraft = effectUpserts.find((effect) => displayText(effect.id) === effectId);
    const removedStatusId = displayText(removedDraft?.status_id);
    updateAbility({
      effects: strings(packet.ability.effects).filter((id) => id !== effectId),
      effect_links: abilityEffectLinks(packet.ability).filter((link) => displayText(link.effect_id) !== effectId),
    });
    if (!persisted) {
      const remainingEffects = effectUpserts.filter((effect) => displayText(effect.id) !== effectId);
      setEffectUpserts(remainingEffects);
      setPacket((current) => current ? ({
        ...current,
        linked_effects: current.linked_effects.filter((effect) => displayText(effect.id) !== effectId),
        linked_statuses: removedStatusId && !remainingEffects.some((effect) => displayText(effect.status_id) === removedStatusId)
          ? current.linked_statuses.filter((status) => displayText(status.id) !== removedStatusId)
          : current.linked_statuses,
      }) : current);
      if (removedStatusId && !remainingEffects.some((effect) => displayText(effect.status_id) === removedStatusId)) {
        setStatusUpserts((current) => current.filter((status) => displayText(status.id) !== removedStatusId));
      }
    }
    if (selectedEffectId === effectId) setSelectedEffectId("");
  };
  const linkStat = (statId: string) => {
    if (rows(packet.ability.scaling).some((row) => displayText(row.stat_id) === statId)) return;
    updateAbility({ scaling: [...rows(packet.ability.scaling), { stat_id: statId, multiplier: 1 }] });
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const active = String(event.active.id);
    if (event.over.id === "payload-drop" && active.startsWith("effect:")) linkEffect(active.slice(7));
    if (event.over.id === "scaling-drop" && active.startsWith("stat:")) linkStat(active.slice(5));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
        <div className="mx-auto max-w-[1800px] space-y-4">
          <Header packet={packet} dirty={dirty} saving={saving} blockers={issues.blockers} advanced={advanced} setAdvanced={setAdvanced} onSave={() => setReviewOpen(true)} onReset={reset} />
          {(notice || restored) && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{restored ? "Restored unsaved Ability Spellcraft draft. " : ""}{notice}</div>}
          <AbilitySelector packet={packet} />
          {advanced ? (
            <Panel title="Advanced Ability Form" subtitle="Schema-complete escape hatch for uncommon fields and debugging.">
              <SchemaForm schema={abilitySchema as SchemaDefinition} schemaName="abilities" data={packet.ability} onChange={(ability) => setPacket({ ...packet, ability })} />
            </Panel>
          ) : (
            <>
              <IdentityPanel packet={packet} updateAbility={updateAbility} />
              <CombatSentence sentence={combatSentence(packet)} />
              <div className="grid gap-4 2xl:grid-cols-[1fr_390px]">
                <div className="space-y-4">
                  <SpellcraftChain packet={packet} updateAbility={updateAbility} allEffects={allDraftEffects} onSelectEffect={setSelectedEffectId} onRemoveEffect={removeEffectFromPayload} />
                  <EffectLibrary effects={allDraftEffects} linkedIds={strings(packet.ability.effects)} onLink={linkEffect} onCreate={(recipe) => createEffect(recipe, packet, setPacket, setEffectUpserts, setSelectedEffectId)} />
                  <StatLibrary stats={packet.catalogs.stats} linkedRows={rows(packet.ability.scaling)} onLink={linkStat} />
                  <AbilityLabBench ability={packet.ability} effects={allDraftEffects} statuses={allDraftStatuses} profiles={packet.catalogs.combat_profiles || []} encounters={packet.catalogs.encounters || []} onSelectEffect={setSelectedEffectId} onUseVariant={(variant) => { setPacket((current) => current ? ({ ...current, ability: variant.ability, linked_effects: variant.effects, linked_statuses: variant.statuses }) : current); setEffectUpserts(variant.effects); setStatusUpserts(variant.statuses); }} />
                  <TestBench packet={packet} draftEffects={allDraftEffects} />
                </div>
                <div className="space-y-4">
                  <LensPanel packet={packet} lens={lens} setLens={setLens} issues={issues} />
                  <EffectInspector
                    packet={packet}
                    effect={selectedEffect}
                    editable={selectedIsEditable}
                    editableStatusIds={new Set(statusUpserts.map((status) => displayText(status.id)))}
                    statuses={allDraftStatuses}
                    onChange={(next) => {
                      setEffectUpserts((current) => mergeById(current, [next]));
                      setPacket((current) => current ? ({ ...current, linked_effects: mergeById(current.linked_effects, [next]) }) : current);
                    }}
                    onClone={() => selectedEffect && cloneEffect(selectedEffect, setPacket, setEffectUpserts, setSelectedEffectId)}
                    onEditShared={() => selectedEffect && setEffectUpserts((current) => mergeById(current, [selectedEffect]))}
                    onCreateStatus={() => selectedEffect && createStatusForEffect(selectedEffect, setPacket, setEffectUpserts, setStatusUpserts)}
                    onCloneStatus={(status) => selectedEffect && cloneStatusForEffect(selectedEffect, status, setPacket, setEffectUpserts, setStatusUpserts)}
                    onEditStatus={(status) => {
                      setStatusUpserts((current) => mergeById(current, [status]));
                      setPacket((current) => current ? ({ ...current, linked_statuses: mergeById(current.linked_statuses, [status]) }) : current);
                    }}
                  />
                  <AssignmentPanel packet={packet} setPacket={setPacket} />
                  <StatusDefensePanel packet={packet} setPacket={setPacket} />
                  <RelationshipPanel packet={packet} setPacket={setPacket} onCreateRelated={() => {
                    const newId = generateUlid();
                    const next: AbilityPacket = { ...packet, ability: { ...packet.ability, id: newId, slug: generateSlug(`${displayText(packet.ability.slug, displayText(packet.ability.name))}-related`), name: `${displayText(packet.ability.name)} Related`, effect_links: abilityEffectLinks(packet.ability).map((link) => ({ ...link, id: undefined })) }, assigned_combat_profile_ids: [], relations: [{ id: generateUlid(), from_ability_id: newId, to_ability_id: displayText(packet.ability.id), relation_type: "Variant" }] };
                    localStorage.setItem(draftKey("new"), JSON.stringify({ packet: next, effectUpserts: [], statusUpserts: [], ts: Date.now() }));
                    navigate("/author/abilities/new");
                  }} />
                  <RequirementPanel packet={packet} setPacket={setPacket} />
                </div>
              </div>
            </>
          )}
          <div className="sticky bottom-3 flex justify-end gap-2 rounded-md border border-slate-200 bg-white/95 p-3 shadow dark:border-slate-800 dark:bg-slate-900/95">
            <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} to={`/abilities?selected=${encodeURIComponent(displayText(packet.ability.id))}`}>Generic Editor</Link>
            <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={reset}>Reset</button>
            <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || issues.blockers.length > 0 || !dirty} onClick={() => setReviewOpen(true)}>{saving ? "Saving..." : "Review & Save"}</button>
          </div>
          {reviewOpen && <BundleReview packet={packet} effectUpserts={effectUpserts} statusUpserts={statusUpserts} blockers={issues.blockers} warnings={issues.warnings} onCancel={() => setReviewOpen(false)} onCommit={() => void save()} />}
        </div>
      </div>
    </DndContext>
  );
}

function Header({ packet, dirty, saving, blockers, advanced, setAdvanced, onSave, onReset }: { packet: AbilityPacket; dirty: boolean; saving: boolean; blockers: string[]; advanced: boolean; setAdvanced: (value: boolean) => void; onSave: () => void; onReset: () => void }) {
  return <Panel title={displayText(packet.ability.name, "Ability Spellcraft Lab")} subtitle={`${strings(packet.ability.effects).length} effects / ${rows(packet.ability.scaling).length} scaling stats / ${packet.assigned_combat_profile_ids.length} combat profiles`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-slate-500"><span>{dirty ? "Unsaved bundle changes" : "Bundle saved"}</span>{blockers.length > 0 && <span className="text-red-700">{blockers.length} save blocker(s)</span>}</div>
      <div className="flex gap-2"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={() => setAdvanced(!advanced)}>{advanced ? "Return To Forge" : "Advanced Form"}</button><button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!dirty || saving} onClick={onReset}>Reset</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || blockers.length > 0 || !dirty} onClick={onSave}>{saving ? "Saving..." : "Save All"}</button></div>
    </div>
  </Panel>;
}

function AbilitySelector({ packet }: { packet: AbilityPacket }) {
  const navigate = useNavigate();
  return <Panel title="Ability Selector" subtitle="Open an existing ability or begin a fresh spellcraft draft."><div className="flex gap-2"><select className={inputClass} value={displayText(packet.ability.id)} onChange={(event) => navigate(`/author/abilities/${encodeURIComponent(event.target.value)}`)}><option value={displayText(packet.ability.id)}>{rowLabel(packet.ability, "Current Ability")}</option>{packet.catalogs.abilities.filter((entry) => displayText(entry.id) !== displayText(packet.ability.id)).map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.id))}</option>)}</select><Link className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm} whitespace-nowrap`} to="/author/abilities/new">New Ability</Link></div></Panel>;
}

function IdentityPanel({ packet, updateAbility }: { packet: AbilityPacket; updateAbility: (patch: EntryRecord) => void }) {
  return <Panel title="Ability Identity" subtitle="Name the promise before assembling its mechanics."><div className="grid gap-3 md:grid-cols-2"><Field label="Name" value={packet.ability.name} onChange={(name) => updateAbility({ name, slug: displayText(packet.ability.slug) || generateSlug(name) })} /><Field label="Slug" value={packet.ability.slug} onChange={(slug) => updateAbility({ slug })} /><Field label="Icon Path" value={packet.ability.icon_path} onChange={(icon_path) => updateAbility({ icon_path })} /><TextArea label="Description" value={packet.ability.description} onChange={(description) => updateAbility({ description })} /><TextArea label="Design Intent" value={packet.ability.design_intent} onChange={(design_intent) => updateAbility({ design_intent })} /><TextArea label="Counterplay" value={packet.ability.counterplay_notes} onChange={(counterplay_notes) => updateAbility({ counterplay_notes })} /><TextArea label="Mastery" value={packet.ability.mastery_notes} onChange={(mastery_notes) => updateAbility({ mastery_notes })} /><TextArea label="Presentation" value={packet.ability.presentation_notes} onChange={(presentation_notes) => updateAbility({ presentation_notes })} /><div className="md:col-span-2"><EditableTagList tags={packet.ability.tags} onChange={(tags) => updateAbility({ tags })} /></div></div></Panel>;
}

function CombatSentence({ sentence }: { sentence: string }) {
  return <section className="rounded-lg border border-violet-300 bg-gradient-to-r from-violet-50 to-blue-50 p-5 dark:border-violet-800 dark:from-violet-950/50 dark:to-blue-950/50"><div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Live Combat Sentence</div><div className="mt-2 text-lg font-semibold leading-relaxed text-slate-950 dark:text-slate-100">{sentence}</div></section>;
}

function SpellcraftChain({ packet, updateAbility, allEffects, onSelectEffect, onRemoveEffect }: { packet: AbilityPacket; updateAbility: (patch: EntryRecord) => void; allEffects: EntryRecord[]; onSelectEffect: (id: string) => void; onRemoveEffect: (id: string) => void }) {
  const effects = new Map(allEffects.map((entry) => [displayText(entry.id), entry]));
  return <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-4"><h2 className="font-semibold">Spellcraft Chain</h2><p className="text-xs text-slate-500">Each gesture writes an existing canonical ability field. Payload cards are intentionally unordered.</p></div><div className="grid min-w-[1180px] grid-cols-[1fr_1fr_1.4fr_1fr_1fr] gap-3">
    <ChainStep title="1. Trigger" subtitle="How and when it begins"><ChoiceCards label="Ability Type" values={TYPES} current={displayText(packet.ability.type)} onChange={(type) => updateAbility({ type })} /><ChoiceCards label="Trigger Condition" values={TRIGGERS} current={displayText(packet.ability.trigger_condition)} onChange={(trigger_condition) => updateAbility({ trigger_condition })} /></ChainStep>
    <ChainStep title="2. Reach" subtitle="Who can be affected"><ChoiceCards label="Targeting Shape" values={TARGETS} current={displayText(packet.ability.targeting)} onChange={(targeting) => updateAbility({ targeting })} /><ChoiceCards label="Damage Source" values={["Weapon", "Fixed", "None"]} current={displayText(packet.ability.damage_type_source, "None")} onChange={(damage_type_source) => updateAbility({ damage_type_source, damage_type: damage_type_source === "Fixed" ? packet.ability.damage_type : "" })} />{displayText(packet.ability.damage_type_source) === "Fixed" && <SelectField label="Damage Type" value={packet.ability.damage_type} options={DAMAGE_TYPES} onChange={(damage_type) => updateAbility({ damage_type })} />}</ChainStep>
    <PayloadDrop>{strings(packet.ability.effects).length === 0 ? <Empty>Drag effects here or use Add.</Empty> : strings(packet.ability.effects).map((id) => { const effect = effects.get(id); const link = abilityEffectLinks(packet.ability).find((entry) => displayText(entry.effect_id) === id) || { effect_id: id, phase: "Impact", turn_offset: 0 }; const patchLink = (patch: EntryRecord) => updateAbility({ effect_links: abilityEffectLinks(packet.ability).map((entry) => displayText(entry.effect_id) === id ? { ...entry, ...patch } : entry) }); return <div key={id} role="button" tabIndex={0} className="group rounded-md border border-fuchsia-300 bg-fuchsia-50 p-2 text-left dark:border-fuchsia-800 dark:bg-fuchsia-950/40" onClick={() => onSelectEffect(id)}><div className="text-[10px] font-semibold uppercase text-fuchsia-700">{displayText(effect?.type, "Missing")}</div><div className="mt-1 text-sm font-semibold">{rowLabel(effect || {}, id)}</div><div className="mt-1 text-xs text-slate-500">{displayText(effect?.target)} / {displayText(effect?.value_type)} {displayText(effect?.value)}</div><div className="mt-2 grid grid-cols-2 gap-1" onClick={(event) => event.stopPropagation()}><select aria-label={`${rowLabel(effect || {}, id)} Phase`} className={`${inputClass} py-1 text-xs`} value={displayText(link.phase, "Impact")} onChange={(event) => patchLink({ phase: event.target.value })}>{EFFECT_PHASES.map((phase) => <option key={phase}>{phase}</option>)}</select><input aria-label={`${rowLabel(effect || {}, id)} Offset`} className={`${inputClass} py-1 text-xs`} type="number" min={0} step={0.5} value={Number(link.turn_offset || 0)} onChange={(event) => patchLink({ turn_offset: Number(event.target.value) })} /></div><button className="mt-2 inline-block text-[10px] text-red-700 opacity-0 group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); onRemoveEffect(id); }}>Remove</button></div>; })}</PayloadDrop>
    <ScalingDrop>{rows(packet.ability.scaling).length === 0 ? <Empty>Drag stats here.</Empty> : rows(packet.ability.scaling).map((row, index) => { const stat = packet.catalogs.stats.find((entry) => displayText(entry.id) === displayText(row.stat_id)); return <div key={`${displayText(row.stat_id)}-${index}`} className="rounded-md border border-cyan-300 bg-cyan-50 p-2 dark:border-cyan-800 dark:bg-cyan-950/40"><div className="text-sm font-semibold">{rowLabel(stat || {}, "Stat")}</div><label className="mt-2 block text-[10px] uppercase text-slate-500">Multiplier<input className={`${inputClass} mt-1 py-1`} type="number" step="0.1" value={Number(row.multiplier || 0)} onChange={(event) => updateAbility({ scaling: rows(packet.ability.scaling).map((entry, rowIndex) => rowIndex === index ? { ...entry, multiplier: Number(event.target.value) } : entry) })} /></label><button className="mt-1 text-[10px] text-red-700" onClick={() => updateAbility({ scaling: rows(packet.ability.scaling).filter((_entry, rowIndex) => rowIndex !== index) })}>Remove</button></div>; })}</ScalingDrop>
    <ChainStep title="5. Cost & Rhythm" subtitle="What using it asks"><Dial label="Resource Cost" value={Number(packet.ability.resource_cost || 0)} max={100} onChange={(resource_cost) => updateAbility({ resource_cost })} /><Dial label="Cooldown" value={Number(packet.ability.cooldown || 0)} max={20} onChange={(cooldown) => updateAbility({ cooldown })} /><NumberField label="Cast Time" value={packet.ability.cast_time} onChange={(cast_time) => updateAbility({ cast_time })} /><NumberField label="Recovery Time" value={packet.ability.recovery_time} onChange={(recovery_time) => updateAbility({ recovery_time })} />{displayText(packet.ability.type) === "Toggle" && <NumberField label="Upkeep / Turn" value={packet.ability.upkeep_cost} onChange={(upkeep_cost) => updateAbility({ upkeep_cost })} />}<NumberField label="Max Targets (0 = scenario)" value={packet.ability.max_targets} onChange={(max_targets) => updateAbility({ max_targets: max_targets || null })} /></ChainStep>
  </div></section>;
}

function EffectLibrary({ effects, linkedIds, onLink, onCreate }: { effects: EntryRecord[]; linkedIds: string[]; onLink: (id: string) => void; onCreate: (recipe: { label: string; data: EntryRecord }) => void }) {
  const [search, setSearch] = useState("");
  const filtered = effects.filter((entry) => `${rowLabel(entry, "")} ${displayText(entry.type)} ${strings(entry.tags).join(" ")}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30);
  return <Panel title="Effect Library & Workshop" subtitle="Drag reusable effects into the payload or forge a new record from a recipe."><div className="flex flex-wrap gap-2">{EFFECT_RECIPES.map((recipe) => <button key={recipe.label} className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onCreate(recipe)}>+ {recipe.label}</button>)}</div><input className={`${inputClass} mt-3`} placeholder="Search effects by name, type, or tag" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="mt-3 grid gap-2 md:grid-cols-3">{filtered.map((effect) => <DraggableCard key={displayText(effect.id)} id={`effect:${displayText(effect.id)}`}><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-semibold uppercase text-fuchsia-700">{displayText(effect.type)}</div><div className="text-sm font-semibold">{rowLabel(effect, displayText(effect.id))}</div><div className="text-xs text-slate-500">{displayText(effect.target)} / {displayText(effect.value_type)} {displayText(effect.value)}</div></div><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} disabled={linkedIds.includes(displayText(effect.id))} onClick={() => onLink(displayText(effect.id))}>{linkedIds.includes(displayText(effect.id)) ? "Linked" : "Add"}</button></div></DraggableCard>)}</div></Panel>;
}

function StatLibrary({ stats, linkedRows, onLink }: { stats: EntryRecord[]; linkedRows: EntryRecord[]; onLink: (id: string) => void }) {
  return <Panel title="Scaling Stat Tray" subtitle="Drag stats into Scaling, then tune their contribution."><ReferenceManageLink reference="stats" onCreated={onLink} /><div className="mt-2 flex flex-wrap gap-2">{stats.map((stat) => <DraggableCard key={displayText(stat.id)} id={`stat:${displayText(stat.id)}`} compact><button className="text-left" disabled={linkedRows.some((row) => displayText(row.stat_id) === displayText(stat.id))} onClick={() => onLink(displayText(stat.id))}><div className="text-sm font-semibold">{rowLabel(stat, displayText(stat.id))}</div><div className="text-[10px] text-slate-500">{linkedRows.some((row) => displayText(row.stat_id) === displayText(stat.id)) ? "Already scaling" : "Add scaling"}</div></button></DraggableCard>)}</div></Panel>;
}

function LensPanel({ packet, lens, setLens, issues }: { packet: AbilityPacket; lens: Lens; setLens: (lens: Lens) => void; issues: { blockers: string[]; warnings: string[] } }) {
  const effects = effectMap(packet);
  const effectRows = strings(packet.ability.effects).map((id) => effects.get(id)).filter((entry): entry is EntryRecord => !!entry);
  const counts = EFFECT_TYPES.map((type) => ({ type, count: effectRows.filter((entry) => displayText(entry.type) === type).length })).filter((entry) => entry.count > 0);
  const usage = packet.usage.abilities[displayText(packet.ability.id)] || {};
  const similar = localSimilarAbilities(packet);
  return <Panel title="Spellcraft Lenses" subtitle="Read the same ability through different design questions."><div className="mb-3 flex flex-wrap gap-1">{(["sentence", "mix", "efficiency", "usage", "damage", "issues"] as Lens[]).map((value) => <button key={value} className={value === lens ? `${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}` : `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setLens(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    {lens === "sentence" && <div className="text-sm leading-relaxed">{combatSentence(packet)}</div>}
    {lens === "mix" && <div className="space-y-2">{counts.length === 0 ? <Empty>No effect mix yet.</Empty> : counts.map((entry) => <Fact key={entry.type} label={entry.type} value={`${entry.count} payload card(s)`} />)}</div>}
    {lens === "efficiency" && <div className="grid grid-cols-2 gap-2"><Fact label="Cost" value={String(Number(packet.ability.resource_cost || 0))} /><Fact label="Cooldown" value={String(Number(packet.ability.cooldown || 0))} /><Fact label="Effects" value={String(effectRows.length)} /><Fact label="Scaling" value={String(rows(packet.ability.scaling).reduce((sum, row) => sum + Number(row.multiplier || 0), 0).toFixed(2))} /></div>}
    {lens === "usage" && <UsageGroups groups={usage} empty="No persisted usage yet." />}
    {lens === "damage" && <div className="space-y-2"><Fact label="Ability Damage Source" value={displayText(packet.ability.damage_type_source, "None")} /><Fact label="Fixed Damage Type" value={displayText(packet.ability.damage_type, "None")} />{effectRows.map((effect) => <Fact key={displayText(effect.id)} label={rowLabel(effect, "Effect")} value={displayText(effect.damage_type, "No own damage type")} />)}</div>}
    {lens === "issues" && <div>{issues.blockers.map((issue) => <Issue key={issue} tone="red">{issue}</Issue>)}{issues.warnings.map((issue) => <Issue key={issue} tone="amber">{issue}</Issue>)}{issues.blockers.length + issues.warnings.length === 0 && <div className="text-sm text-emerald-700">No current spellcraft issues.</div>}{similar.length > 0 && <div className="mt-3"><Caption>Similar Abilities</Caption>{similar.map((entry) => <div key={displayText(entry.id)} className="rounded border border-slate-200 p-2 text-xs dark:border-slate-800">{rowLabel(entry, displayText(entry.id))}</div>)}</div>}</div>}
  </Panel>;
}

function EffectInspector({ packet, effect, editable, editableStatusIds, statuses, onChange, onClone, onEditShared, onCreateStatus, onCloneStatus, onEditStatus }: { packet: AbilityPacket; effect: EntryRecord | null; editable: boolean; editableStatusIds: Set<string>; statuses: EntryRecord[]; onChange: (effect: EntryRecord) => void; onClone: () => void; onEditShared: () => void; onCreateStatus: () => void; onCloneStatus: (status: EntryRecord) => void; onEditStatus: (status: EntryRecord) => void }) {
  if (!effect) return <Panel title="Payload Inspector" subtitle="Select a payload effect to inspect its result and usage."><Empty>No selected effect.</Empty></Panel>;
  const usage = packet.usage.effects[displayText(effect.id)] || {};
  const status = statuses.find((entry) => displayText(entry.id) === displayText(effect.status_id));
  const set = (patch: EntryRecord) => onChange({ ...effect, ...patch });
  return <Panel title="Payload Inspector" subtitle={editable ? "Editing a draft or explicitly shared record." : "Existing shared records clone by default before editing."}><div className="mb-3 flex flex-wrap gap-2">{!editable && <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={onClone}>Duplicate Into This Ability</button>}{!editable && <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onEditShared}>Edit Shared Record</button>}</div><div className="grid gap-2 sm:grid-cols-2"><Field label="Name" value={effect.name} disabled={!editable} onChange={(name) => set({ name, slug: displayText(effect.slug) || generateSlug(name) })} /><Field label="Slug" value={effect.slug} disabled={!editable} onChange={(slug) => set({ slug })} /><SelectField label="Type" value={effect.type} options={EFFECT_TYPES} disabled={!editable} onChange={(type) => set({ type, status_id: type === "Status" ? effect.status_id : "", status_operation: type === "Status" ? displayText(effect.status_operation, "Apply") : "" })} /><SelectField label="Target" value={effect.target} options={EFFECT_TARGETS} disabled={!editable} onChange={(target) => set({ target })} /><SelectField label="Value Type" value={effect.value_type} options={["Flat", "Percentage", "None"]} disabled={!editable} onChange={(value_type) => set({ value_type })} /><NumberField label="Value" value={effect.value} disabled={!editable} onChange={(value) => set({ value })} /><SelectField label="Calculation Basis" value={effect.calculation_basis} options={CALCULATION_BASES} disabled={!editable} allowEmpty onChange={(calculation_basis) => set({ calculation_basis })} /><NumberField label="Scaling Multiplier" value={effect.scaling_multiplier} disabled={!editable} onChange={(scaling_multiplier) => set({ scaling_multiplier })} /><NumberField label="Duration" value={effect.duration} disabled={!editable} onChange={(duration) => set({ duration })} /><NumberField label="Tick Interval" value={effect.tick_interval} disabled={!editable} onChange={(tick_interval) => set({ tick_interval })} /><NumberField label="Apply Chance" value={effect.apply_chance ?? 100} disabled={!editable} onChange={(apply_chance) => set({ apply_chance })} /><SelectField label="Damage Type" value={effect.damage_type} options={DAMAGE_TYPES} disabled={!editable} allowEmpty onChange={(damage_type) => set({ damage_type })} /><SelectField label="Effect Trigger" value={effect.trigger_condition} options={EFFECT_TRIGGERS} disabled={!editable} allowEmpty onChange={(trigger_condition) => set({ trigger_condition })} /><Field label="Scaling Stat ID" value={effect.scaling_stat_id} disabled={!editable} onChange={(scaling_stat_id) => set({ scaling_stat_id })} /><Field label="Affected Attribute ID" value={effect.attribute_id} disabled={!editable} onChange={(attribute_id) => set({ attribute_id })} /><Field label="Set Bonus Group" value={effect.set_bonus_group} disabled={!editable} onChange={(set_bonus_group) => set({ set_bonus_group })} /><TextArea label="Description" value={effect.description} disabled={!editable} onChange={(description) => set({ description })} /><CheckboxField label="Stackable Effect" value={Boolean(effect.stackable)} disabled={!editable} onChange={(stackable) => set({ stackable })} /></div>
    {displayText(effect.type) === "Status" && <div className="mt-3 grid gap-2 sm:grid-cols-2"><SelectField label="Status Operation" value={effect.status_operation || "Apply"} options={["Apply", "Remove", "GrantImmunity"]} disabled={!editable} onChange={(status_operation) => set({ status_operation, status_id: status_operation === "Apply" ? effect.status_id : "" })} />{displayText(effect.status_operation, "Apply") !== "Apply" && <TextArea label="Status Filter JSON" value={JSON.stringify(effect.status_filter || {}, null, 2)} disabled={!editable} onChange={(value) => { try { set({ status_filter: JSON.parse(value) }); } catch { /* keep prior valid filter */ } }} />}</div>}
    {displayText(effect.type) === "Status" && <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/40"><Caption>Linked Status</Caption>{status ? <><div className="mb-2 flex gap-2">{!editableStatusIds.has(displayText(status.id)) && <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} disabled={!editable} onClick={() => onCloneStatus(status)}>Duplicate Status For This Effect</button>}{!editableStatusIds.has(displayText(status.id)) && <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onEditStatus(status)}>Edit Shared Status</button>}</div><StatusEditor status={status} editable={editableStatusIds.has(displayText(status.id))} onChange={onEditStatus} /><div className="mt-2"><UsageGroups groups={packet.usage.statuses[displayText(status.id)] || {}} empty="No persisted status consumers." /></div></> : <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} disabled={!editable} onClick={onCreateStatus}>Create Status For Effect</button>}</div>}
    <div className="mt-3"><Caption>Shared Usage</Caption><UsageGroups groups={usage} empty="No persisted consumers." /></div>
    <div className="mt-3"><SimulationWorkbench fixedSchemaName="effects" draftEntity={effect} compact title="Effect Contribution" datasetOverlays={{ effects: [effect] }} /></div>
  </Panel>;
}

function StatusEditor({ status, editable, onChange }: { status: EntryRecord; editable: boolean; onChange: (status: EntryRecord) => void }) {
  const [playStacks, setPlayStacks] = useState(0);
  const [playTurn, setPlayTurn] = useState(0);
  const set = (patch: EntryRecord) => onChange({ ...status, ...patch });
  const apply = () => {
    const policy = displayText(status.reapplication_policy, "RefreshDuration");
    if (playStacks === 0 || ["RefreshDuration", "Replace"].includes(policy)) setPlayStacks(1);
    else if (policy !== "Ignore") setPlayStacks(Math.min(Number(status.max_stacks || 1), playStacks + 1));
    setPlayTurn(0);
  };
  return <><div className="grid gap-2 sm:grid-cols-2"><Field label="Status Name" value={status.name} disabled={!editable} onChange={(name) => set({ name, slug: displayText(status.slug) || generateSlug(name) })} /><SelectField label="Category" value={status.category} options={["Buff", "Debuff", "Control", "DoT", "Other"]} disabled={!editable} onChange={(category) => set({ category })} /><SelectField label="Polarity" value={status.polarity || "Neutral"} options={["Beneficial", "Harmful", "Neutral"]} disabled={!editable} onChange={(polarity) => set({ polarity })} /><NumberField label="Default Duration" value={status.default_duration} disabled={!editable} onChange={(default_duration) => set({ default_duration })} /><NumberField label="Max Stacks" value={status.max_stacks ?? 1} disabled={!editable} onChange={(max_stacks) => set({ max_stacks, stackable: max_stacks > 1 })} /><SelectField label="Reapplication" value={status.reapplication_policy || "RefreshDuration"} options={["RefreshDuration", "Replace", "Ignore", "AddStackRefresh", "AddIndependentStack"]} disabled={!editable} onChange={(reapplication_policy) => set({ reapplication_policy })} /><SelectField label="Stack Decay" value={status.stack_decay_policy || "AllAtOnce"} options={["AllAtOnce", "OnePerDuration", "Independent"]} disabled={!editable} onChange={(stack_decay_policy) => set({ stack_decay_policy })} /><CheckboxField label="Can Cleanse" value={status.can_cleanse !== false} disabled={!editable} onChange={(can_cleanse) => set({ can_cleanse })} /><CheckboxField label="Can Dispel" value={status.can_dispel !== false} disabled={!editable} onChange={(can_dispel) => set({ can_dispel })} /><TextArea label="Status Description" value={status.description} disabled={!editable} onChange={(description) => set({ description })} /></div><div className="mt-3 rounded border border-violet-300 bg-white p-2 dark:border-violet-800 dark:bg-slate-900"><Caption>Local Status Lifecycle Playground</Caption><div className="mb-2 flex items-center gap-2 text-xs"><span className="rounded bg-violet-100 px-2 py-1 font-semibold dark:bg-violet-950">{displayText(status.name, "Status")} x{playStacks}</span><span>Turn {playTurn}</span><span>{playStacks > 0 ? "Active" : "Inactive"}</span></div><div className="flex flex-wrap gap-1"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={apply}>Apply / Reapply</button><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => { const next = playTurn + 1; setPlayTurn(next); if (next >= Number(status.default_duration || 1)) setPlayStacks(0); }}>Advance Turn</button><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => setPlayStacks(0)}>{status.can_cleanse === false ? "Cleanse Blocked" : "Cleanse / Dispel"}</button><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => { setPlayStacks(0); setPlayTurn(0); }}>Reset</button></div><div className="mt-2 text-[10px] text-slate-500">Temporary test actions do not save. Lifecycle settings above are canonical.</div></div></>;
}

function AssignmentPanel({ packet, setPacket }: { packet: AbilityPacket; setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>> }) {
  return <Panel title="Combat Profile Assignment" subtitle="Preview and save this ability inside selected creature move kits."><ReferenceManageLink reference="combat_profiles" onCreated={(id) => setPacket((current) => current ? ({ ...current, assigned_combat_profile_ids: current.assigned_combat_profile_ids.includes(id) ? current.assigned_combat_profile_ids : [...current.assigned_combat_profile_ids, id] }) : current)} /><div className="mt-2 space-y-2">{packet.catalogs.combat_profiles.length === 0 ? <Empty>No combat profiles.</Empty> : packet.catalogs.combat_profiles.map((profile) => { const id = displayText(profile.id); const character = isRecord(profile.character) ? profile.character : {}; const checked = packet.assigned_combat_profile_ids.includes(id); return <label key={id} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-2 text-sm dark:border-slate-800"><span><span className="font-semibold">{rowLabel(character, id)}</span><span className="ml-2 text-xs text-slate-500">{displayText(profile.enemy_type)} / {displayText(profile.aggression)}</span></span><input type="checkbox" checked={checked} onChange={(event) => setPacket((current) => current ? ({ ...current, assigned_combat_profile_ids: event.target.checked ? [...current.assigned_combat_profile_ids, id] : current.assigned_combat_profile_ids.filter((entry) => entry !== id) }) : current)} /></label>; })}</div></Panel>;
}

function StatusDefensePanel({ packet, setPacket }: { packet: AbilityPacket; setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>> }) {
  const assigned = packet.catalogs.combat_profiles.filter((profile) => packet.assigned_combat_profile_ids.includes(displayText(profile.id)));
  const updateRules = (profileId: string, rules: EntryRecord[]) => setPacket((current) => current ? ({ ...current, catalogs: { ...current.catalogs, combat_profiles: current.catalogs.combat_profiles.map((profile) => displayText(profile.id) === profileId ? { ...profile, status_rules: rules } : profile) } }) : current);
  return <Panel title="Context Status Defenses" subtitle="Canonical resistance and immunity rules owned by assigned combat profiles.">{assigned.length === 0 ? <Empty>Assign a combat profile to edit contextual defenses.</Empty> : assigned.map((profile) => { const character = isRecord(profile.character) ? profile.character : {}; return <div key={displayText(profile.id)} className="mb-3 rounded border border-slate-200 p-2 dark:border-slate-800"><div className="mb-2 flex items-center justify-between text-xs font-semibold"><span>{displayText(character.name, displayText(profile.character_id))}</span><button className="text-indigo-700" onClick={() => updateRules(displayText(profile.id), [...rows(profile.status_rules), { polarity: "Harmful", immune: false, chance_multiplier: 1, duration_multiplier: 1 }])}>Add Rule</button></div>{rows(profile.status_rules).map((rule, index) => <div key={index} className="mb-2 grid grid-cols-2 gap-1 rounded bg-slate-50 p-2 dark:bg-slate-950"><SelectField label="Polarity" value={rule.polarity} options={["Beneficial", "Harmful", "Neutral"]} onChange={(polarity) => updateRules(displayText(profile.id), rows(profile.status_rules).map((entry, i) => i === index ? { ...entry, status_id: "", category: "", polarity } : entry))} /><CheckboxField label="Immune" value={Boolean(rule.immune)} onChange={(immune) => updateRules(displayText(profile.id), rows(profile.status_rules).map((entry, i) => i === index ? { ...entry, immune } : entry))} /><NumberField label="Chance Multiplier" value={rule.chance_multiplier ?? 1} onChange={(chance_multiplier) => updateRules(displayText(profile.id), rows(profile.status_rules).map((entry, i) => i === index ? { ...entry, chance_multiplier } : entry))} /><NumberField label="Duration Multiplier" value={rule.duration_multiplier ?? 1} onChange={(duration_multiplier) => updateRules(displayText(profile.id), rows(profile.status_rules).map((entry, i) => i === index ? { ...entry, duration_multiplier } : entry))} /><button className="text-left text-[10px] text-red-700" onClick={() => updateRules(displayText(profile.id), rows(profile.status_rules).filter((_entry, i) => i !== index))}>Remove Rule</button></div>)}</div>; })}</Panel>;
}

function RelationshipPanel({ packet, setPacket, onCreateRelated }: { packet: AbilityPacket; setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>>; onCreateRelated: () => void }) {
  const relations = packet.relations || [];
  const add = () => {
    const target = packet.catalogs.abilities.find((entry) => displayText(entry.id) !== displayText(packet.ability.id));
    if (!target) return;
    setPacket((current) => current ? ({ ...current, relations: [...(current.relations || []), { id: generateUlid(), from_ability_id: displayText(current.ability.id), to_ability_id: displayText(target.id), relation_type: "Setup" }] }) : current);
  };
  const update = (id: string, patch: EntryRecord) => setPacket((current) => current ? ({ ...current, relations: (current.relations || []).map((relation) => displayText(relation.id) === id ? { ...relation, ...patch } : relation) }) : current);
  return <Panel title="Ability Family & Tactical Relationships" subtitle="Saved directed relationships support setup, payoff, recovery, upgrades, counters, and variants."><div className="mb-2 flex flex-wrap gap-2"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} disabled={packet.catalogs.abilities.length < 2} onClick={add}>Add Relationship</button><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={onCreateRelated}>Create Related Draft</button></div>{relations.length === 0 ? <Empty>No saved or pending relationships.</Empty> : relations.map((relation) => <div key={displayText(relation.id)} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1"><SelectField label="Relationship" value={relation.relation_type} options={["Setup", "Payoff", "Recovery", "Upgrade", "Counter", "Variant"]} onChange={(relation_type) => update(displayText(relation.id), { relation_type })} /><label><Caption>Related Ability</Caption><select className={inputClass} value={displayText(relation.to_ability_id) === displayText(packet.ability.id) ? displayText(relation.from_ability_id) : displayText(relation.to_ability_id)} onChange={(event) => update(displayText(relation.id), { from_ability_id: displayText(packet.ability.id), to_ability_id: event.target.value })}>{packet.catalogs.abilities.filter((entry) => displayText(entry.id) !== displayText(packet.ability.id)).map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.id))}</option>)}</select></label><button className="self-end px-2 py-2 text-xs text-red-700" onClick={() => setPacket((current) => current ? ({ ...current, relations: (current.relations || []).filter((entry) => displayText(entry.id) !== displayText(relation.id)) }) : current)}>Remove</button></div>)}</Panel>;
}

function RequirementPanel({ packet, setPacket }: { packet: AbilityPacket; setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>> }) {
  const select = (id: string) => setPacket((current) => current ? ({ ...current, ability: { ...current.ability, requirements_id: id }, requirement: current.catalogs.requirements.find((entry) => displayText(entry.id) === id) || null }) : current);
  const create = () => {
    const id = generateUlid();
    const requirement = { id, slug: generateSlug(`${displayText(packet.ability.name, "ability")}-gate`), required_flags: [], forbidden_flags: [], min_faction_reputation: [], tags: [] };
    setPacket((current) => current ? ({ ...current, ability: { ...current.ability, requirements_id: id }, requirement }) : current);
  };
  return <Panel title="Unlock Gate" subtitle="Link or create the reusable requirement that unlocks this ability."><select className={inputClass} value={displayText(packet.ability.requirements_id)} onChange={(event) => select(event.target.value)}><option value="">Unassigned</option>{packet.catalogs.requirements.map((entry) => <option key={displayText(entry.id)} value={displayText(entry.id)}>{rowLabel(entry, displayText(entry.slug, displayText(entry.id)))}</option>)}</select>{!packet.requirement && <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-2`} onClick={create}>Create Ability Requirement</button>}{packet.requirement && <div className="mt-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-800">Requirement: {displayText(packet.requirement.slug, displayText(packet.requirement.id))}<button className="ml-2 text-red-700" onClick={() => select("")}>Clear</button></div>}</Panel>;
}

function BundleReview({ packet, effectUpserts, statusUpserts, blockers, warnings, onCancel, onCommit }: { packet: AbilityPacket; effectUpserts: EntryRecord[]; statusUpserts: EntryRecord[]; blockers: string[]; warnings: string[]; onCancel: () => void; onCommit: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"><h2 className="text-lg font-semibold">Bundle Review</h2><p className="mt-1 text-xs text-slate-500">Commit the complete canonical change atomically.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><Fact label="Ability Changed" value={displayText(packet.ability.name)} /><Fact label="Effects Upserted" value={String(effectUpserts.length)} /><Fact label="Statuses Upserted" value={String(statusUpserts.length)} /><Fact label="Timed Payload Links" value={String(abilityEffectLinks(packet.ability).length)} /><Fact label="Assignments" value={String(packet.assigned_combat_profile_ids.length)} /><Fact label="Relationships" value={String((packet.relations || []).length)} /></div><div className="mt-4">{blockers.map((issue) => <Issue key={issue} tone="red">{issue}</Issue>)}{warnings.map((issue) => <Issue key={issue} tone="amber">{issue}</Issue>)}</div><div className="mt-4 flex justify-end gap-2"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} onClick={onCancel}>Continue Editing</button><button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={blockers.length > 0} onClick={onCommit}>Commit Bundle</button></div></section></div>;
}

function TestBench({ packet, draftEffects }: { packet: AbilityPacket; draftEffects: EntryRecord[] }) {
  const profiles = packet.catalogs.combat_profiles.filter((profile) => packet.assigned_combat_profile_ids.includes(displayText(profile.id))).map((profile) => ({ ...profile, custom_abilities: [...strings(profile.custom_abilities).filter((id) => id !== displayText(packet.ability.id)), displayText(packet.ability.id)] }));
  return <Panel title="Ability Test Bench" subtitle="Auto-simulate the current draft and its unsaved payload under selectable combat pressures."><SimulationWorkbench fixedSchemaName="abilities" draftEntity={packet.ability} title="Current Draft Simulation" datasetOverlays={{ abilities: [packet.ability], effects: draftEffects, combat_profiles: profiles }} />{profiles.length > 0 && <div className="mt-3 text-xs text-slate-500">Assignment preview overlays {profiles.length} selected combat profile(s) into the simulation datasets.</div>}</Panel>;
}

function createEffect(recipe: { label: string; data: EntryRecord }, packet: AbilityPacket, setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>>, setEffectUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>, setSelectedEffectId: (id: string) => void) {
  const id = generateUlid();
  const effect = { id, slug: generateSlug(`${displayText(packet.ability.name, "ability")}-${recipe.label}`), name: `${displayText(packet.ability.name, "Ability")} ${recipe.label}`, description: "", icon_path: "", related_items: [], ...recipe.data };
  setEffectUpserts((current) => mergeById(current, [effect]));
  setPacket((current) => current ? ({ ...current, linked_effects: mergeById(current.linked_effects, [effect]), ability: { ...current.ability, effects: [...strings(current.ability.effects), id], effect_links: [...abilityEffectLinks(current.ability), { effect_id: id, phase: "Impact", turn_offset: 0, sort_order: abilityEffectLinks(current.ability).length }] } }) : current);
  setSelectedEffectId(id);
}

function cloneEffect(effect: EntryRecord, setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>>, setEffectUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>, setSelectedEffectId: (id: string) => void) {
  const id = generateUlid();
  const clone = { ...effect, id, slug: generateSlug(`${displayText(effect.slug, displayText(effect.name, "effect"))}-variant`), name: `${displayText(effect.name, "Effect")} Variant` };
  setEffectUpserts((current) => mergeById(current, [clone]));
  setPacket((current) => current ? ({ ...current, linked_effects: mergeById(current.linked_effects, [clone]), ability: { ...current.ability, effects: strings(current.ability.effects).map((entry) => entry === displayText(effect.id) ? id : entry), effect_links: abilityEffectLinks(current.ability).map((link) => displayText(link.effect_id) === displayText(effect.id) ? { ...link, id: undefined, effect_id: id } : link) } }) : current);
  setSelectedEffectId(id);
}

function createStatusForEffect(effect: EntryRecord, setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>>, setEffectUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>, setStatusUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>) {
  const id = generateUlid();
  const status = { id, slug: generateSlug(`${displayText(effect.name, "effect")}-status`), name: `${displayText(effect.name, "Effect")} Status`, category: "Other", polarity: "Neutral", description: "", default_duration: Number(effect.duration || 0), stackable: Boolean(effect.stackable), max_stacks: effect.stackable ? 3 : 1, reapplication_policy: "RefreshDuration", stack_decay_policy: "AllAtOnce", can_cleanse: true, can_dispel: true, tags: ["status"] };
  const nextEffect = { ...effect, status_id: id, status_operation: "Apply" };
  setStatusUpserts((current) => mergeById(current, [status]));
  setEffectUpserts((current) => mergeById(current, [nextEffect]));
  setPacket((current) => current ? ({ ...current, linked_statuses: mergeById(current.linked_statuses, [status]), linked_effects: mergeById(current.linked_effects, [nextEffect]) }) : current);
}

function cloneStatusForEffect(effect: EntryRecord, status: EntryRecord, setPacket: React.Dispatch<React.SetStateAction<AbilityPacket | null>>, setEffectUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>, setStatusUpserts: React.Dispatch<React.SetStateAction<EntryRecord[]>>) {
  const id = generateUlid();
  const clone = { ...status, id, slug: generateSlug(`${displayText(status.slug, displayText(status.name, "status"))}-variant`), name: `${displayText(status.name, "Status")} Variant` };
  const nextEffect = { ...effect, status_id: id };
  setStatusUpserts((current) => mergeById(current, [clone]));
  setEffectUpserts((current) => mergeById(current, [nextEffect]));
  setPacket((current) => current ? ({ ...current, linked_statuses: mergeById(current.linked_statuses, [clone]), linked_effects: mergeById(current.linked_effects, [nextEffect]) }) : current);
}

function mergeById(base: EntryRecord[], updates: EntryRecord[]): EntryRecord[] {
  const map = new Map(base.map((entry) => [displayText(entry.id), entry]));
  updates.forEach((entry) => map.set(displayText(entry.id), entry));
  return Array.from(map.values());
}

function ChoiceCards({ label, values, current, onChange }: { label: string; values: string[]; current: string; onChange: (value: string) => void }) {
  return <div className="mb-3"><Caption>{label}</Caption><div className="grid gap-1">{values.map((value) => <button key={value} type="button" className={`rounded border px-2 py-1.5 text-left text-xs font-semibold ${current === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950"}`} onClick={() => onChange(value)}>{value}</button>)}</div></div>;
}

function ChainStep({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><div className="mb-3"><div className="text-sm font-semibold">{title}</div><div className="text-[10px] text-slate-500">{subtitle}</div></div>{children}</div>;
}

function PayloadDrop({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "payload-drop" });
  return <div ref={setNodeRef} className={`rounded-lg border-2 border-dashed p-3 ${isOver ? "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/40" : "border-fuchsia-200 bg-fuchsia-50/40 dark:border-fuchsia-900 dark:bg-fuchsia-950/20"}`}><div className="mb-3 text-sm font-semibold">3. Payload</div><div className="grid gap-2">{children}</div></div>;
}

function ScalingDrop({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "scaling-drop" });
  return <div ref={setNodeRef} className={`rounded-lg border-2 border-dashed p-3 ${isOver ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40" : "border-cyan-200 bg-cyan-50/40 dark:border-cyan-900 dark:bg-cyan-950/20"}`}><div className="mb-3 text-sm font-semibold">4. Scaling</div><div className="grid gap-2">{children}</div></div>;
}

function DraggableCard({ id, compact = false, children }: { id: string; compact?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return <div ref={setNodeRef} {...listeners} {...attributes} className={`cursor-grab rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950 ${compact ? "px-3 py-2" : "p-3"} ${isDragging ? "opacity-50" : ""}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}>{children}</div>;
}

function Dial({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <label className="mb-4 block"><div className="flex justify-between"><Caption>{label}</Caption><span className="text-xs font-semibold">{value}</span></div><input className="w-full accent-blue-600" type="range" min={0} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} /><input className={`${inputClass} mt-1`} type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Field({ label, value, onChange, disabled = false }: { label: string; value: unknown; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} value={editableText(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, disabled = false }: { label: string; value: unknown; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block sm:col-span-2"><Caption>{label}</Caption><textarea className={`${inputClass} min-h-20`} value={editableText(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CheckboxField({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function NumberField({ label, value, onChange, disabled = false }: { label: string; value: unknown; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} type="number" value={Number(value || 0)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, options, onChange, disabled = false, allowEmpty = false }: { label: string; value: unknown; options: string[]; onChange: (value: string) => void; disabled?: boolean; allowEmpty?: boolean }) {
  return <label className="block"><Caption>{label}</Caption><select className={inputClass} value={displayText(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{allowEmpty && <option value="">Unset</option>}{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3"><h2 className="font-semibold text-slate-950 dark:text-slate-100">{title}</h2>{subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}</div>{children}</section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">{children}</div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950"><div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>;
}

function Issue({ tone, children }: { tone: "red" | "amber"; children: ReactNode }) {
  return <div className={`mb-2 rounded border px-3 py-2 text-xs ${tone === "red" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950"}`}>{children}</div>;
}

function UsageGroups({ groups, empty }: { groups: Record<string, EntryRecord[]>; empty: string }) {
  const entries = Object.entries(groups).filter(([, values]) => values.length > 0);
  if (entries.length === 0) return <Empty>{empty}</Empty>;
  return <div className="space-y-2">{entries.map(([group, values]) => <div key={group}><Caption>{group.replace(/_/g, " ")}</Caption>{values.map((entry) => <div key={displayText(entry.id)} className="mb-1 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">{rowLabel(entry, displayText(entry.id))}</div>)}</div>)}</div>;
}
