import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getSimulationScenarioById,
  SIMULATION_SCENARIOS,
  simulateAbilityTrace,
  type AbilityTrace,
  type SimulationDatasets,
} from "../../simulation";
import { buildAbilityRhythmSegments } from "../../authoring/abilityUsage";
import { displayText, isRecord, rowLabel } from "../../authoringViews/controls";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import type { EntryRecord } from "../../types/editorQol";

interface Variant {
  id: string;
  name: string;
  ability: EntryRecord;
  effects: EntryRecord[];
  statuses: EntryRecord[];
}

interface Props {
  ability: EntryRecord;
  effects: EntryRecord[];
  statuses: EntryRecord[];
  profiles: EntryRecord[];
  encounters: EntryRecord[];
  onSelectEffect: (id: string) => void;
  onUseVariant: (variant: Variant) => void;
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function variantKey(id: string): string {
  return `soa.ability-variants.${id || "new"}`;
}

function profileLabel(profile: EntryRecord): string {
  const character = isRecord(profile.character) ? profile.character : {};
  return displayText(character.name, displayText(profile.character_id, displayText(profile.id)));
}

function makeDatasets(ability: EntryRecord, effects: EntryRecord[], statuses: EntryRecord[], profiles: EntryRecord[]): SimulationDatasets {
  return {
    abilities: [ability],
    effects,
    statuses,
    combat_profiles: profiles,
    encounters: [],
    characters: [],
    items: [],
    ability_relations: [],
  };
}

function traceFor(
  ability: EntryRecord,
  effects: EntryRecord[],
  statuses: EntryRecord[],
  profiles: EntryRecord[],
  scenarioId: string,
  targetCount: number,
  targetProfile: EntryRecord | null,
  casterProfile: EntryRecord | null,
): AbilityTrace {
  const scenario = { ...getSimulationScenarioById(scenarioId), targetCount };
  return simulateAbilityTrace({
    ability,
    datasets: makeDatasets(ability, effects, statuses, profiles),
    scenario,
    seed: 42,
    targetProfile,
    casterProfile,
  });
}

export default function AbilityLabBench({ ability, effects, statuses, profiles, encounters, onSelectEffect, onUseVariant }: Props) {
  const [scenarioId, setScenarioId] = useState("duel_baseline");
  const [targets, setTargets] = useState(1);
  const [turn, setTurn] = useState(0);
  const [targetProfileId, setTargetProfileId] = useState("");
  const [casterProfileId, setCasterProfileId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const encounter = encounters.find((entry) => displayText(entry.id) === encounterId);
  const participants = rows(encounter?.participants);
  const inferredTargetCharacter = displayText(participants.find((entry) => displayText(entry.combat_side) === "Hostile")?.character_id);
  const inferredCasterCharacter = displayText(participants.find((entry) => displayText(entry.combat_side) === "Friendly")?.character_id);
  const targetProfile = profiles.find((entry) => displayText(entry.id) === targetProfileId) || profiles.find((entry) => displayText(entry.character_id) === inferredTargetCharacter) || null;
  const casterProfile = profiles.find((entry) => displayText(entry.id) === casterProfileId) || profiles.find((entry) => displayText(entry.character_id) === inferredCasterCharacter) || null;
  const trace = useMemo(
    () => traceFor(ability, effects, statuses, profiles, scenarioId, targets, targetProfile, casterProfile),
    [ability, casterProfile, effects, profiles, scenarioId, statuses, targetProfile, targets],
  );
  const rhythmSegments = useMemo(() => buildAbilityRhythmSegments(ability, effects, statuses), [ability, effects, statuses]);
  const undefended = useMemo(
    () => traceFor(ability, effects, statuses, profiles, scenarioId, targets, null, casterProfile),
    [ability, casterProfile, effects, profiles, scenarioId, statuses, targets],
  );

  useEffect(() => {
    const raw = localStorage.getItem(variantKey(displayText(ability.id)));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setVariants(parsed.slice(0, 3));
    } catch {
      localStorage.removeItem(variantKey(displayText(ability.id)));
    }
  }, [ability.id]);

  useEffect(() => {
    localStorage.setItem(variantKey(displayText(ability.id)), JSON.stringify(variants));
  }, [ability.id, variants]);

  useEffect(() => {
    setTurn((current) => Math.min(current, Math.max(0, trace.turns - 1)));
  }, [trace.turns]);

  const saveVariant = () => {
    const next: Variant = {
      id: `${Date.now()}`,
      name: `Variant ${variants.length + 1}`,
      ability: structuredClone(ability),
      effects: structuredClone(effects),
      statuses: structuredClone(statuses),
    };
    setVariants((current) => [...current, next].slice(-3));
  };
  const visibleEvents = trace.events.filter((event) => event.turn <= turn);
  const activeTargetIds = new Set(visibleEvents.flatMap((event) => event.targetIds || []));
  const defendedApplications = trace.events.filter((event) => event.kind === "status_apply").length;
  const undefendedApplications = undefended.events.filter((event) => event.kind === "status_apply").length;
  const moveKit = strings(casterProfile?.custom_abilities);
  const rhythmEnd = Math.max(1, ...rhythmSegments.map((segment) => segment.end));

  return <section className="rounded-lg border border-indigo-300 bg-white p-4 dark:border-indigo-800 dark:bg-slate-900" data-testid="ability-lab-bench">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Ability Lab Bench</h2><p className="text-xs text-slate-500">Play through an explainable abstract-turn estimate. Every approximation is visible.</p></div>
      <div className="flex gap-2"><button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={saveVariant} disabled={variants.length >= 3}>Snapshot Variant</button></div>
    </div>
    <div className="mt-3 grid gap-2 md:grid-cols-5">
      <Select label="Scenario" value={scenarioId} onChange={setScenarioId} options={SIMULATION_SCENARIOS.map((entry) => ({ id: entry.id, label: entry.label }))} />
      <label className="text-xs text-slate-500">Targets<input aria-label="Target Count" type="number" min={1} max={8} value={targets} onChange={(event) => setTargets(Math.max(1, Number(event.target.value)))} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
      <Select label="Caster Profile" value={casterProfileId} onChange={setCasterProfileId} allowEmpty options={profiles.map((entry) => ({ id: displayText(entry.id), label: profileLabel(entry) }))} />
      <Select label="Target Profile" value={targetProfileId} onChange={setTargetProfileId} allowEmpty options={profiles.map((entry) => ({ id: displayText(entry.id), label: profileLabel(entry) }))} />
      <Select label="Encounter" value={encounterId} onChange={setEncounterId} allowEmpty options={encounters.map((entry) => ({ id: displayText(entry.id), label: rowLabel(entry, displayText(entry.id)) }))} />
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between"><div className="text-xs font-semibold uppercase text-slate-500">Impact Field · Turn {turn}</div><div className="text-xs">{trace.casts} casts · {trace.finalResource}/{trace.initialResource} resource</div></div>
        <div className="flex min-h-44 items-center justify-between gap-5 overflow-x-auto">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-indigo-400 bg-indigo-100 text-center text-xs font-semibold dark:bg-indigo-950">Caster<br />{casterProfile ? profileLabel(casterProfile) : "Scenario Stats"}</div>
          <div className="h-1 min-w-20 flex-1 bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-rose-400" />
          <div className="flex flex-wrap justify-end gap-2">{trace.targetIds.map((id) => <div key={id} data-testid={`impact-${id}`} className={`grid h-20 w-20 place-items-center rounded-full border-4 text-center text-xs font-semibold transition ${activeTargetIds.has(id) ? "border-rose-500 bg-rose-100 dark:bg-rose-950" : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>{id}<span className="text-[9px] font-normal">{visibleEvents.filter((event) => event.targetIds?.includes(id) && event.kind.startsWith("status_")).slice(-1)[0]?.label || "Ready"}</span></div>)}</div>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold uppercase text-slate-500">Rhythm Timeline</div><div className="text-xs">Scrub to inspect</div></div>
        <div className="mb-3 space-y-1">
          {rhythmSegments.map((segment) => <button
            key={segment.id}
            type="button"
            className="grid w-full grid-cols-[84px_1fr_44px] items-center gap-2 rounded bg-slate-50 px-2 py-1 text-left text-xs dark:bg-slate-950"
            onClick={() => setTurn(Math.min(Math.max(0, Math.floor(segment.start)), Math.max(0, trace.turns - 1)))}
          >
            <span className="font-semibold capitalize">{segment.kind}</span>
            <span className="relative h-2 rounded bg-slate-200 dark:bg-slate-800">
              <span className={`absolute top-0 h-2 rounded ${rhythmColor(segment.kind)}`} style={{ left: `${Math.min(100, (segment.start / rhythmEnd) * 100)}%`, width: `${Math.max(segment.end === segment.start ? 2 : 4, ((segment.end - segment.start) / rhythmEnd) * 100)}%` }} />
            </span>
            <span className="text-right">T{segment.start}{segment.end !== segment.start ? `-${segment.end}` : ""}</span>
            <span className="col-span-3 truncate text-[10px] text-slate-500">{segment.label}{segment.phase ? ` / ${segment.phase}` : ""}</span>
          </button>)}
        </div>
        <input aria-label="Trace Turn" className="w-full accent-indigo-600" type="range" min={0} max={Math.max(0, trace.turns - 1)} value={turn} onChange={(event) => setTurn(Number(event.target.value))} />
        <div className="mt-3 max-h-64 space-y-1 overflow-auto">{trace.events.map((event, index) => <button key={`${event.turn}-${event.kind}-${index}`} type="button" className={`grid w-full grid-cols-[48px_110px_1fr] gap-2 rounded px-2 py-1 text-left text-xs ${event.turn === turn ? "bg-indigo-100 dark:bg-indigo-950" : "bg-slate-50 dark:bg-slate-950"}`} onClick={() => { setTurn(Math.floor(event.turn)); if (event.effectId) onSelectEffect(event.effectId); }}><span>T{event.turn}</span><span className="font-semibold">{event.kind.replace(/_/g, " ")}</span><span>{event.label}{event.detail ? ` · ${event.detail}` : ""}</span></button>)}</div>
      </div>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card title="Effect Contributions">{trace.contributions.length === 0 ? <Muted>No resolved payload contributions.</Muted> : trace.contributions.map((item) => <button key={item.effectId} className="mb-2 block w-full rounded border border-slate-200 p-2 text-left text-xs dark:border-slate-800" onClick={() => onSelectEffect(item.effectId)}><b>{item.label}</b><div>{item.damage} damage · {item.control} control · {item.sustain} sustain</div><div>{item.applications} applications across {item.affectedTargets} targets</div></button>)}</Card>
      <Card title="Context Contribution"><div className="space-y-2 text-xs"><div>Defended status applications: <b>{defendedApplications}</b></div><div>Undefended status applications: <b>{undefendedApplications}</b></div><div>Caster move-kit overlap: <b>{moveKit.length} other ability slots</b></div><div>Encounter: <b>{encounter ? rowLabel(encounter, displayText(encounter.id)) : "No encounter selected"}</b></div><div>Context source: <b>{targetProfileId || casterProfileId ? "Explicit profile selection" : encounter ? "Inferred from encounter sides" : "Scenario fallback"}</b></div><Muted>This estimates contribution and cadence, not health, AI, death, or victory.</Muted></div></Card>
      <Card title="Comparison Variants"><div className="space-y-2">{variants.length === 0 ? <Muted>Snapshot up to three local comparison variants.</Muted> : variants.map((variant) => { const result = traceFor(variant.ability, variant.effects, variant.statuses, profiles, scenarioId, targets, targetProfile, casterProfile); return <div key={variant.id} className="rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><div className="flex items-center justify-between"><b>{variant.name}</b><button className="text-indigo-700" onClick={() => onUseVariant(variant)}>Use As Draft</button></div><div>{result.casts} casts · {result.finalResource} resource · {result.contributions.reduce((sum, item) => sum + item.damage, 0)} damage</div></div>; })}</div></Card>
    </div>
    <details className="mt-4 rounded border border-slate-200 p-3 text-xs dark:border-slate-800"><summary className="cursor-pointer font-semibold">Estimator Assumptions</summary><ul className="mt-2 list-inside list-disc">{trace.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
  </section>;
}

function Select({ label, value, onChange, options, allowEmpty = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; label: string }>; allowEmpty?: boolean }) {
  return <label className="text-xs text-slate-500">{label}<select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" value={value} onChange={(event) => onChange(event.target.value)}>{allowEmpty && <option value="">None / Scenario Default</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</div>{children}</div>;
}

function Muted({ children }: { children: ReactNode }) {
  return <div className="text-xs text-slate-500">{children}</div>;
}

function rhythmColor(kind: string): string {
  if (kind === "cast") return "bg-blue-500";
  if (kind === "impact") return "bg-rose-500";
  if (kind === "status" || kind === "tick") return "bg-violet-500";
  if (kind === "upkeep") return "bg-amber-500";
  if (kind === "recovery") return "bg-emerald-500";
  if (kind === "cooldown") return "bg-slate-500";
  if (kind === "deactivate") return "bg-orange-500";
  return "bg-fuchsia-500";
}
