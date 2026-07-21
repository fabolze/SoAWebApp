import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMBAT_PATHS, COMBAT_ROLES, ITEMS, ITEM_SETS, TALENTS, type CombatRole, type CombatSpec } from "./content";
import { playSfx } from "./audio";
import { pointInSector } from "./combatMath";
import { bossPhase, combatRate, projectedVeteranDuration, riftFracture, TALENT_SKILLS, veteranItemEffects, veteranParty, veteranProfile, VETERAN_BOSS_HP, VETERAN_ENRAGE_SECONDS, VETERAN_TALENT_POINTS, type BossLoadout, type VeteranCompanion, type VeteranProfile } from "./bossLabMath";

type LabMode = "setup" | "combat" | "result";
type PartyId = "player" | "nessa" | "ilyra" | "torren";
type EventTone = "neutral" | "player" | "ally" | "enemy" | "danger" | "success";

type PartyUnit = {
  id: PartyId;
  name: string;
  role: string;
  combatRole: "tank" | "healer" | "damage";
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  hp: number;
  maxHp: number;
  shield: number;
  armor: number;
  alive: boolean;
  hitFlash: number;
  attackDamage: number;
  attackInterval: number;
  attackRange: number;
  attackCd: number;
};

type RiftEcho = { id: string; name: string; x: number; y: number; hp: number; maxHp: number; pulseCd: number; hitFlash: number };
type CircleZone = { type: "circle"; x: number; y: number; radius: number };
type LineZone = { type: "line"; x: number; y: number; width: number; height: number };
type ConeZone = { type: "cone"; x: number; y: number; angle: number; radius: number; halfAngle: number };
type Zone = CircleZone | LineZone | ConeZone;
type MechanicKind = "cleave" | "brands" | "raidwide" | "cross" | "chain" | "soak" | "collapse" | "cataclysm";
type BossMechanic = {
  id: number;
  kind: MechanicKind;
  name: string;
  instruction: string;
  duration: number;
  remaining: number;
  damage: number;
  targetIds: PartyId[];
  zones: Zone[];
};

type LabEvent = { id: number; time: number; tone: EventTone; text: string };
type Floater = { id: number; x: number; y: number; text: string; tone: "damage" | "heal" | "ward" | "status"; age: number };
type Feedback = { id: number; tone: EventTone; title: string; detail: string; age: number; duration: number };
type ActorMetrics = { damage: number; healing: number; damageTaken: number; absorbed: number };
type Metrics = {
  damage: number;
  healing: number;
  damageTaken: number;
  mechanicsAvoided: number;
  mechanicHits: number;
  abilities: number;
  actors: Record<PartyId, ActorMetrics>;
};

type BossEngine = {
  time: number;
  started: boolean;
  paused: boolean;
  ended: boolean;
  result: "victory" | "defeat" | null;
  bossHp: number;
  phase: 1 | 2 | 3;
  phaseTransition: number;
  party: PartyUnit[];
  echoes: RiftEcho[];
  selectedTarget: string;
  focus: number;
  cooldowns: Record<string, number>;
  damageBuff: number;
  hasteBuff: number;
  targetVulnerability: number;
  partyDamageBuff: number;
  partyMitigation: number;
  failureStacks: number;
  nextMechanic: number;
  mechanicIndex: number;
  mechanics: BossMechanic[];
  bossAttackCd: number;
  healerCd: number;
  defensiveCd: number;
  regenCd: number;
  events: LabEvent[];
  floaters: Floater[];
  feedback: Feedback | null;
  metrics: Metrics;
  serial: number;
};

type Snapshot = BossEngine;
type ResultPayload = { result: "victory" | "defeat"; duration: number; metrics: Metrics; phase: number; bossHp: number };

const ARENA_W = 1000;
const ARENA_H = 560;
const BOSS_X = 770;
const BOSS_Y = 280;
const BOSS_WEAPONS = ["forgeBlade", "hunterBow", "focusStaff", "oathsplitter", "riftwatchSpear"];
const BOSS_ARMORS = ["travelCoat", "vowkeepersWrap", "fenwatchMantle"];
const BOSS_CHARMS = ["marshWard", "pathfinderSeal", "resonanceCharm"];
type AbilityKey = "one" | "two" | "three" | "four" | "five" | "six";
const ABILITY_KEYS: AbilityKey[] = ["one", "two", "three", "four", "five", "six"];

function emptyActorMetrics(): ActorMetrics {
  return { damage: 0, healing: 0, damageTaken: 0, absorbed: 0 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function partyHomes(companions: VeteranCompanion[], playerProfile: VeteranProfile) {
  const roleHomes: Record<string, { x: number; y: number }> = {
    tank: { x: 665, y: 280 },
    healer: { x: 350, y: 145 },
    damage: { x: 610, y: 410 },
  };
  const used: Record<string, number> = {};
  const party: PartyUnit[] = companions.map((companion) => {
    const count = used[companion.role] ?? 0;
    used[companion.role] = count + 1;
    const base = roleHomes[companion.role];
    const home = { x: base.x - count * 80, y: base.y + count * (companion.role === "damage" ? -260 : 70) };
    return {
      id: companion.id,
      name: companion.name,
      role: `${companion.specialization} · ${companion.role}`,
      combatRole: companion.role,
      x: home.x,
      y: home.y,
      homeX: home.x,
      homeY: home.y,
      hp: companion.maxHp,
      maxHp: companion.maxHp,
      shield: 0,
      armor: companion.armor,
      alive: true,
      hitFlash: 0,
      attackDamage: companion.attackDamage,
      attackInterval: companion.attackInterval,
      attackRange: companion.attackRange,
      attackCd: .8 + count * .25,
    };
  });
  party.push({
    id: "player",
    name: "Wayfarer",
    role: "Level 20 · You",
    combatRole: "damage",
    x: 290,
    y: 300,
    homeX: 290,
    homeY: 300,
    hp: playerProfile.maxHp,
    maxHp: playerProfile.maxHp,
    shield: 0,
    armor: playerProfile.armor,
    alive: true,
    hitFlash: 0,
    attackDamage: playerProfile.autoDamage,
    attackInterval: playerProfile.autoInterval,
    attackRange: playerProfile.autoRange,
    attackCd: .4,
  });
  return party;
}

function createEngine(loadout: BossLoadout, profile: VeteranProfile): BossEngine {
  const party = partyHomes(veteranParty(loadout.role), profile);
  const player = party.find((unit) => unit.id === "player")!;
  player.combatRole = loadout.role;
  player.role = `Level 20 ${COMBAT_PATHS.find((path) => path.id === loadout.spec)?.name ?? "Wayfarer"} · You`;
  if (loadout.talents.includes("riftBulwark")) player.shield = 70;
  if (loadout.talents.includes("sharedShelter")) party.forEach((unit) => { unit.shield = 35; });
  return {
    time: 0,
    started: false,
    paused: true,
    ended: false,
    result: null,
    bossHp: VETERAN_BOSS_HP,
    phase: 1,
    phaseTransition: 0,
    party,
    echoes: [],
    selectedTarget: "boss",
    focus: 100,
    cooldowns: { one: 0, two: 0, three: 0, four: 0, five: 0, six: 0, dodge: 0 },
    damageBuff: 0,
    hasteBuff: 0,
    targetVulnerability: 0,
    partyDamageBuff: 0,
    partyMitigation: 0,
    failureStacks: 0,
    nextMechanic: 7,
    mechanicIndex: 0,
    mechanics: [],
    bossAttackCd: 2.5,
    healerCd: 2.8,
    defensiveCd: 8,
    regenCd: 4,
    events: [{ id: 1, time: 0, tone: "neutral", text: "Veteran simulation ready. The enrage timer begins when you engage." }],
    floaters: [],
    feedback: null,
    metrics: {
      damage: 0,
      healing: 0,
      damageTaken: 0,
      mechanicsAvoided: 0,
      mechanicHits: 0,
      abilities: 0,
      actors: { player: emptyActorMetrics(), nessa: emptyActorMetrics(), ilyra: emptyActorMetrics(), torren: emptyActorMetrics() },
    },
    serial: 2,
  };
}

function zoneHits(zone: Zone, unit: PartyUnit) {
  if (zone.type === "circle") return distance(zone, unit) <= zone.radius;
  if (zone.type === "line") return unit.x >= zone.x && unit.x <= zone.x + zone.width && unit.y >= zone.y && unit.y <= zone.y + zone.height;
  return pointInSector(unit, { x: zone.x, y: zone.y }, zone.angle, zone.radius, zone.halfAngle);
}

function phaseName(phase: number) {
  return phase === 1 ? "The Waking Echo" : phase === 2 ? "Worlds Intersect" : "Unbound Resonance";
}

function baseAbilitySet(role: CombatRole) {
  if (role === "healer") return [
    { key: "one", hotkey: "1", name: "Resonant Smite", detail: "55 damage · 1.3s", cooldown: 1.3 },
    { key: "two", hotkey: "2", name: "Greater Mend", detail: "Lowest ally · 18 focus", cooldown: 3 },
    { key: "three", hotkey: "3", name: "Party Aegis", detail: "Ward all · 30 focus", cooldown: 12 },
    { key: "four", hotkey: "4", name: "Verdant Refrain", detail: "Heal all · 20s", cooldown: 20 },
  ] as const;
  if (role === "tank") return [
    { key: "one", hotkey: "1", name: "Shield Strike", detail: "60 damage · 1.25s", cooldown: 1.25 },
    { key: "two", hotkey: "2", name: "Guard", detail: "80 self ward · 10s", cooldown: 10 },
    { key: "three", hotkey: "3", name: "Commanding Ward", detail: "Ward party · 14s", cooldown: 14 },
    { key: "four", hotkey: "4", name: "Last Stand", detail: "Emergency restore · 22s", cooldown: 22 },
  ] as const;
  return [
    { key: "one", hotkey: "1", name: "Weapon Art", detail: "72 damage · 1.15s", cooldown: 1.15 },
    { key: "two", hotkey: "2", name: "Rift Burst", detail: "165 damage · 24 focus", cooldown: 7 },
    { key: "three", hotkey: "3", name: "Battle Focus", detail: "+30% damage · 8s", cooldown: 20 },
    { key: "four", hotkey: "4", name: "Execution", detail: "240 damage · 18s", cooldown: 18 },
  ] as const;
}

function abilitySet(loadout: BossLoadout) {
  const base = baseAbilitySet(loadout.role).map((ability) => ({ ...ability, talentId: undefined as string | undefined }));
  const selectedTalentSkills = (loadout.activeSkillIds ?? loadout.talents.slice(0, 2))
    .filter((id) => loadout.talents.includes(id) && TALENT_SKILLS[id])
    .slice(0, 2)
    .map((id, index) => {
      const skill = TALENT_SKILLS[id];
      const key = ABILITY_KEYS[4 + index];
      return { key, hotkey: String(5 + index), name: skill.name, detail: skill.detail, cooldown: skill.cooldown, talentId: id };
    });
  return [...base, ...selectedTalentSkills];
}

export default function BossLab({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<LabMode>("setup");
  const [role, setRole] = useState<CombatRole>("damage");
  const [spec, setSpec] = useState<CombatSpec>("ranger");
  const [weaponId, setWeaponId] = useState("hunterBow");
  const [armorId, setArmorId] = useState("travelCoat");
  const [charmId, setCharmId] = useState("marshWard");
  const [talents, setTalents] = useState<string[]>(["steadyAim", "rapidNocking", "huntersMark"]);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>(["steadyAim", "rapidNocking"]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const loadout = useMemo(() => ({ role, spec, weaponId, armorId, charmId, talents, activeSkillIds }), [role, spec, weaponId, armorId, charmId, talents, activeSkillIds]);

  const choosePath = (nextRole: CombatRole, nextSpec: CombatSpec) => {
    setRole(nextRole);
    setSpec(nextSpec);
    const nextTalents = TALENTS.filter((talent) => talent.spec === nextSpec).slice(0, VETERAN_TALENT_POINTS).map((talent) => talent.id);
    setTalents(nextTalents);
    setActiveSkillIds(nextTalents.slice(0, 2));
    playSfx("select");
  };

  const toggleTalent = (id: string) => {
    setTalents((current) => {
      const next = current.includes(id) ? current.filter((talent) => talent !== id) : current.length < VETERAN_TALENT_POINTS ? [...current, id] : current;
      setActiveSkillIds((selected) => {
        const valid = selected.filter((skillId) => next.includes(skillId));
        return [...valid, ...next.filter((skillId) => !valid.includes(skillId))].slice(0, 2);
      });
      return next;
    });
    playSfx("select");
  };

  const toggleActiveSkill = (id: string) => {
    setActiveSkillIds((current) => current.includes(id) ? current.filter((skillId) => skillId !== id) : current.length < 2 ? [...current, id] : current);
    playSfx("select");
  };

  if (mode === "combat") return <VeteranEncounter loadout={loadout} onExit={() => setMode("setup")} onComplete={(payload) => { setResult(payload); setMode("result"); }} />;
  if (mode === "result" && result) return <BossResult result={result} loadout={loadout} onRetry={() => setMode("combat")} onBuild={() => setMode("setup")} onExit={onExit}/>;

  const profile = veteranProfile(loadout);
  const companions = veteranParty(role);
  const availableTalents = TALENTS.filter((talent) => talent.spec === spec);
  const projected = projectedVeteranDuration(loadout);
  const itemEffects = veteranItemEffects(loadout);
  const setCount = [weaponId, armorId, charmId].filter((id) => ITEMS[id]?.setId === "lost-path").length;
  return <main className="pt-boss-lab">
    <header className="pt-lab-header"><button onClick={onExit}>← Chapter playtest</button><div><span>Level 20 systems test</span><h1>Veteran Boss Lab</h1></div><aside><b>{Math.floor(projected / 60)}:{String(projected % 60).padStart(2, "0")}</b><small>projected clear</small></aside></header>
    <div className="pt-lab-grid">
      <section className="pt-lab-build"><div className="pt-lab-intro"><span className="pt-kicker">Build the Wayfarer</span><h2>Choose what the player contributes.</h2><p>This sandbox grants three talent points and a veteran weapon. Companions automatically cover missing party roles, but they will not solve your personal mechanics.</p></div>
        <h3>1 · Combat role</h3><nav className="pt-lab-roles">{(Object.keys(COMBAT_ROLES) as CombatRole[]).map((entry) => <button key={entry} className={role === entry ? "active" : ""} onClick={() => { const first = COMBAT_PATHS.find((path) => path.role === entry)!; choosePath(entry, first.id); }}><i>{COMBAT_ROLES[entry].icon}</i><strong>{COMBAT_ROLES[entry].name}</strong><small>{COMBAT_ROLES[entry].summary}</small></button>)}</nav>
        <h3>2 · Specialization</h3><div className="pt-lab-specs">{COMBAT_PATHS.filter((path) => path.role === role).map((path) => <button key={path.id} className={spec === path.id ? "active" : ""} onClick={() => choosePath(role, path.id)}><i>{path.icon}</i><span><strong>{path.name}</strong><small>{path.fantasy}</small></span></button>)}</div>
        <h3>3 · Talents <em>{talents.length}/{VETERAN_TALENT_POINTS} selected</em></h3><div className="pt-lab-talents">{availableTalents.map((talent) => { const skill = TALENT_SKILLS[talent.id]; return <button key={talent.id} className={talents.includes(talent.id) ? "active" : ""} disabled={!talents.includes(talent.id) && talents.length >= VETERAN_TALENT_POINTS} onClick={() => toggleTalent(talent.id)}><i>{talents.includes(talent.id) ? "✓" : talent.icon}</i><span><small>Tier {talent.tier} · unlocks {skill.name}</small><strong>{talent.name}</strong><em>{talent.description} Active: {skill.detail}.</em></span></button>; })}</div>
        <h3>4 · Active skill loadout <em>{4 + activeSkillIds.length}/6 equipped</em></h3><div className="pt-lab-skill-loadout"><section>{baseAbilitySet(role).map((skill, index) => <span key={skill.name}><kbd>{index + 1}</kbd><strong>{skill.name}</strong><small>Core skill</small></span>)}</section><div>{talents.map((id) => { const skill = TALENT_SKILLS[id]; const active = activeSkillIds.includes(id); return <button key={id} className={active ? "active" : ""} disabled={!active && activeSkillIds.length >= 2} onClick={() => toggleActiveSkill(id)}><i>{active ? activeSkillIds.indexOf(id) + 5 : "+"}</i><span><strong>{skill.name}</strong><small>{skill.detail} · {skill.cooldown}s</small></span></button>; })}</div><p>Four core skills are fixed for this prototype. Choose up to two talent skills for slots 5–6.</p></div>
        <h3>5 · Veteran equipment <em>Sets and uniques are combat-active</em></h3>
        <EquipmentPicker label="Weapon" ids={BOSS_WEAPONS} selectedId={weaponId} onSelect={setWeaponId}/>
        <EquipmentPicker label="Armor" ids={BOSS_ARMORS} selectedId={armorId} onSelect={setArmorId}/>
        <EquipmentPicker label="Charm" ids={BOSS_CHARMS} selectedId={charmId} onSelect={setCharmId}/>
        <section className="pt-lab-set-tracker"><header><span>SET · {ITEM_SETS["lost-path"].name}</span><strong>{setCount}/3 equipped</strong></header><p className={setCount >= 2 ? "active" : ""}><b>2 pieces</b> Quickstep grants 45 ward.</p><p className={setCount >= 3 ? "active" : ""}><b>3 pieces</b> +15% damage and +50% party ward strength.</p></section>
      </section>
      <aside className="pt-lab-preview"><div className="pt-lab-boss-card"><span>Veteran encounter</span><h2>Vaelith, Echo of the Rift</h2><p>A three-phase fight testing movement, mitigation, healing recovery, target swaps, and sustained damage before a hard enrage.</p><div><span><b>{VETERAN_BOSS_HP.toLocaleString()}</b> Boss vigor</span><span><b>3</b> Phases</span><span><b>3:00</b> Enrage</span></div></div>
        <section className="pt-lab-profile"><header><span>Your build</span><strong>{COMBAT_PATHS.find((path) => path.id === spec)?.name}</strong></header><div><span><b>{profile.maxHp}</b> vigor</span><span><b>{profile.armor}</b> armor</span><span><b>{profile.autoDamage}</b> auto</span><span><b>{profile.autoInterval}s</b> cadence</span><span><b>{profile.autoRange}</b> range</span><span><b>{Math.round(profile.healingPower * 100)}%</b> healing</span></div>{itemEffects.labels.length > 0 && <footer><span>Active item powers</span>{itemEffects.labels.map((label) => <b key={label}>✦ {label}</b>)}</footer>}</section>
        <section className="pt-lab-party"><header><span>Adaptive party</span><small>Three companions join</small></header>{companions.map((companion) => <article key={companion.id}><i className={`portrait-${companion.id}`}>{companion.name[0]}</i><div><span>{companion.role}</span><strong>{companion.name}</strong><small>{companion.specialization} · {companion.note}</small></div></article>)}</section>
        <section className="pt-lab-mechanics"><span>Mechanics tested</span><div><b>Tank cleaves</b><b>Spread brands</b><b>Raidwide pulses</b><b>Crossing lanes</b><b>Break chains</b><b>Shared soaks</b><b>Rift Echo adds</b><b>Overlapping finale</b></div></section>
        <button className="pt-lab-launch" disabled={talents.length !== VETERAN_TALENT_POINTS} onClick={() => { setResult(null); setMode("combat"); playSfx("confirm"); }}>Challenge Vaelith <span>Expected {Math.floor(projected / 60)}:{String(projected % 60).padStart(2, "0")}</span></button>
      </aside>
    </div>
  </main>;
}

function EquipmentPicker({ label, ids, selectedId, onSelect }: { label: string; ids: string[]; selectedId: string; onSelect: (id: string) => void }) {
  return <section className="pt-lab-equipment"><header><span>{label}</span><small>{ITEMS[selectedId]?.rarity ?? "common"}</small></header><div className="pt-lab-weapons">{ids.map((id) => {
    const item = ITEMS[id];
    const veteranPower = id === "oathsplitter" ? "+30% Weapon Art damage · 55% Echo cleave" : id === "vowkeepersWrap" ? "Greater Mend also grants 45 ward" : id === "resonanceCharm" ? "Every active skill fires a 32-damage Rift Bolt" : "";
    const detail = veteranPower || [item.attackStyle, item.armor ? `${item.armor} armor` : "", item.health ? `${item.health} vigor` : "", item.damage ? `${item.damage} damage` : ""].filter(Boolean).join(" · ");
    return <button key={id} className={`${selectedId === id ? "active" : ""} rarity-${item.rarity ?? "common"}`} onClick={() => onSelect(id)} title={item.description}><i>{item.icon}</i><span><em>{item.rarity === "set" ? `SET · ${ITEM_SETS[item.setId!].name}` : (item.rarity ?? "common").toUpperCase()}</em><strong>{item.name}</strong><small>{detail}</small></span></button>;
  })}</div></section>;
}

function VeteranEncounter({ loadout, onExit, onComplete }: { loadout: BossLoadout; onExit: () => void; onComplete: (result: ResultPayload) => void }) {
  const profile = useMemo(() => veteranProfile(loadout), [loadout]);
  const itemEffects = useMemo(() => veteranItemEffects(loadout), [loadout]);
  const engineRef = useRef<BossEngine>(createEngine(loadout, profile));
  const keysRef = useRef(new Set<string>());
  const [snapshot, setSnapshot] = useState<Snapshot>({ ...engineRef.current });
  const abilities = abilitySet(loadout);

  const sync = useCallback(() => {
    const e = engineRef.current;
    setSnapshot({ ...e, party: e.party.map((unit) => ({ ...unit })), echoes: e.echoes.map((echo) => ({ ...echo })), cooldowns: { ...e.cooldowns }, mechanics: e.mechanics.map((mechanic) => ({ ...mechanic, zones: mechanic.zones.map((zone) => ({ ...zone })) })), events: e.events.map((event) => ({ ...event })), floaters: e.floaters.map((floater) => ({ ...floater })), feedback: e.feedback ? { ...e.feedback } : null, metrics: { ...e.metrics, actors: Object.fromEntries(Object.entries(e.metrics.actors).map(([id, metrics]) => [id, { ...metrics }])) as Record<PartyId, ActorMetrics> } });
  }, []);

  const pushEvent = useCallback((tone: EventTone, text: string) => {
    const e = engineRef.current;
    e.events = [{ id: e.serial++, time: e.time, tone, text }, ...e.events].slice(0, 10);
  }, []);

  const feedback = useCallback((tone: EventTone, title: string, detail: string, duration = 1.8) => {
    const e = engineRef.current;
    e.feedback = { id: e.serial++, tone, title, detail, age: 0, duration };
  }, []);

  const floater = useCallback((unit: { x: number; y: number }, text: string, tone: Floater["tone"]) => {
    const e = engineRef.current;
    e.floaters.push({ id: e.serial++, x: unit.x, y: unit.y - 42, text, tone, age: 0 });
  }, []);

  const player = useCallback(() => engineRef.current.party.find((unit) => unit.id === "player")!, []);
  const livingParty = useCallback(() => engineRef.current.party.filter((unit) => unit.alive), []);

  const healUnit = useCallback((unit: PartyUnit, raw: number, source: string, sourceId: PartyId = source.includes("Ilyra") ? "ilyra" : "player") => {
    if (!unit.alive) return 0;
    const fracturePenalty = unit.id === "player" ? riftFracture(engineRef.current.failureStacks).healingMultiplier : 1;
    const amount = Math.min(unit.maxHp - unit.hp, Math.round(raw * fracturePenalty));
    unit.hp += amount;
    if (amount) {
      engineRef.current.metrics.healing += amount;
      engineRef.current.metrics.actors[sourceId].healing += amount;
      floater(unit, `+${amount}`, "heal");
      pushEvent(sourceId === "player" ? "player" : "ally", `${source} restored ${amount} vigor to ${unit.name}.`);
    }
    return amount;
  }, [floater, pushEvent]);

  const finish = useCallback((result: "victory" | "defeat") => {
    const e = engineRef.current;
    if (e.ended) return;
    e.ended = true;
    e.paused = true;
    e.result = result;
    feedback(result === "victory" ? "success" : "danger", result === "victory" ? "VAELITH DEFEATED" : "PARTY DEFEATED", result === "victory" ? `Clear time ${Math.floor(e.time / 60)}:${String(Math.floor(e.time % 60)).padStart(2, "0")}` : e.time >= VETERAN_ENRAGE_SECONDS ? "The rift consumed the arena at enrage." : "The party could not recover.", 4);
    playSfx(result === "victory" ? "victory" : "defeat");
    window.setTimeout(() => onComplete({ result, duration: e.time, metrics: { ...e.metrics, actors: Object.fromEntries(Object.entries(e.metrics.actors).map(([id, metrics]) => [id, { ...metrics }])) as Record<PartyId, ActorMetrics> }, phase: e.phase, bossHp: e.bossHp }), 1800);
  }, [feedback, onComplete]);

  const damageUnit = useCallback((unit: PartyUnit, raw: number, source: string, mechanic = false) => {
    if (!unit.alive) return 0;
    const partyReduction = (loadout.talents.includes("commandingGuard") || loadout.talents.includes("nullField") ? .88 : 1) * (engineRef.current.partyMitigation > 0 ? .7 : 1);
    const personalReduction = mechanic && unit.id === "player" ? profile.mechanicTaken : 1;
    const fractureAmplification = unit.id === "player" ? riftFracture(engineRef.current.failureStacks).damageMultiplier : 1;
    let amount = Math.max(3, Math.round(raw * partyReduction * personalReduction * fractureAmplification - unit.armor * .55));
    const absorbed = Math.min(unit.shield, amount);
    unit.shield -= absorbed;
    amount -= absorbed;
    if (absorbed) {
      engineRef.current.metrics.actors[unit.id].absorbed += absorbed;
      floater(unit, `${absorbed} warded`, "ward");
    }
    if (amount) {
      unit.hp = Math.max(0, unit.hp - amount);
      unit.hitFlash = .3;
      floater(unit, `−${amount}`, "damage");
      engineRef.current.metrics.actors[unit.id].damageTaken += amount;
      if (unit.id === "player") engineRef.current.metrics.damageTaken += amount;
    }
    pushEvent("danger", `${source} → ${unit.name}: ${amount} damage${absorbed ? `, ${absorbed} warded` : ""}.`);
    if (unit.hp <= 0) {
      unit.alive = false;
      pushEvent("danger", `${unit.name} is down.`);
      if (unit.id === "player" || !livingParty().some((ally) => ally.combatRole === "tank")) finish("defeat");
    }
    return amount;
  }, [finish, floater, livingParty, loadout.talents, profile.mechanicTaken, pushEvent]);

  const transitionPhase = useCallback((phase: 2 | 3) => {
    const e = engineRef.current;
    e.phase = phase;
    e.phaseTransition = 3;
    e.mechanics = [];
    e.nextMechanic = e.time + 5;
    e.echoes = phase === 2
      ? [{ id: "echo-a", name: "Echo of Memory", x: 700, y: 120, hp: 750, maxHp: 750, pulseCd: 5, hitFlash: 0 }, { id: "echo-b", name: "Echo of Regret", x: 700, y: 440, hp: 750, maxHp: 750, pulseCd: 7, hitFlash: 0 }]
      : [{ id: "echo-doom", name: "Echo of the Ending", x: 665, y: 280, hp: 1200, maxHp: 1200, pulseCd: 4, hitFlash: 0 }];
    e.selectedTarget = e.echoes[0].id;
    pushEvent("enemy", `Phase ${phase}: ${phaseName(phase)}. Rift Echoes make Vaelith invulnerable.`);
    feedback("enemy", `PHASE ${phase}`, phase === 2 ? "Destroy both Rift Echoes · crossing mechanics begin" : "Break the final Echo · overlapping mechanics begin", 3);
    playSfx("warning");
  }, [feedback, pushEvent]);

  const dealDamage = useCallback((amount: number, source: string, prominent = false, sourceId: PartyId = "player") => {
    const e = engineRef.current;
    const targetEcho = e.echoes.find((echo) => echo.id === e.selectedTarget && echo.hp > 0) ?? e.echoes.find((echo) => echo.hp > 0);
    const attempted = Math.round(amount
      * (e.damageBuff > 0 && sourceId === "player" ? 1.3 : 1)
      * (e.targetVulnerability > 0 && sourceId === "player" ? 1.2 : 1)
      * (e.partyDamageBuff > 0 ? 1.25 : 1)
      * (prominent && sourceId === "player" ? itemEffects.damageMultiplier : 1));
    if (targetEcho) {
      const dealt = Math.min(targetEcho.hp, attempted);
      targetEcho.hp = Math.max(0, targetEcho.hp - dealt);
      targetEcho.hitFlash = .25;
      e.metrics.damage += dealt;
      e.metrics.actors[sourceId].damage += dealt;
      floater(targetEcho, `−${dealt}`, "damage");
      pushEvent(sourceId === "player" ? "player" : "ally", `${source} → ${targetEcho.name}: ${dealt} damage.`);
      if (targetEcho.hp <= 0) {
        floater(targetEcho, "SHATTERED", "status");
        pushEvent("success", `${targetEcho.name} shattered.`);
        const next = e.echoes.find((echo) => echo.hp > 0);
        e.selectedTarget = next?.id ?? "boss";
        if (!next) feedback("success", "BARRIER BROKEN", "Vaelith is vulnerable again", 2.2);
      }
    } else {
      const dealt = Math.min(e.bossHp, attempted);
      e.bossHp = Math.max(0, e.bossHp - dealt);
      e.metrics.damage += dealt;
      e.metrics.actors[sourceId].damage += dealt;
      floater({ x: BOSS_X, y: BOSS_Y }, `−${dealt}`, "damage");
      pushEvent(sourceId === "player" ? "player" : "ally", `${source} → Vaelith: ${dealt} damage.`);
      if (prominent) feedback("player", `−${dealt} DAMAGE`, `${source} struck Vaelith`, 1.1);
      const nextPhase = bossPhase(e.bossHp);
      if (nextPhase > e.phase) transitionPhase(nextPhase as 2 | 3);
      if (e.bossHp <= 0) finish("victory");
    }
  }, [feedback, finish, floater, itemEffects.damageMultiplier, pushEvent, transitionPhase]);

  const cleaveEchoes = useCallback((amount: number, source: string) => {
    const e = engineRef.current;
    const selected = e.echoes.find((echo) => echo.id === e.selectedTarget && echo.hp > 0);
    if (!selected) return;
    for (const echo of e.echoes.filter((entry) => entry.id !== selected.id && entry.hp > 0)) {
      const dealt = Math.min(echo.hp, Math.round(amount));
      echo.hp -= dealt;
      echo.hitFlash = .25;
      e.metrics.damage += dealt;
      e.metrics.actors.player.damage += dealt;
      floater(echo, `−${dealt}`, "damage");
      pushEvent("player", `${source} cleaved ${echo.name} for ${dealt} damage.`);
    }
  }, [floater, pushEvent]);

  const selectTarget = useCallback((id: string) => {
    const e = engineRef.current;
    if (id !== "boss" && !e.echoes.some((echo) => echo.id === id && echo.hp > 0)) return;
    if (id === "boss" && e.echoes.some((echo) => echo.hp > 0)) {
      feedback("neutral", "RIFT BARRIER", "Destroy the Echoes before targeting Vaelith", 1.4);
      return;
    }
    e.selectedTarget = id;
    playSfx("select");
    sync();
  }, [feedback, sync]);

  const activeTargetPosition = useCallback(() => {
    const e = engineRef.current;
    return e.echoes.find((echo) => echo.id === e.selectedTarget && echo.hp > 0) ?? { x: BOSS_X, y: BOSS_Y };
  }, []);

  const cast = useCallback((key: AbilityKey) => {
    const e = engineRef.current;
    if (!e.started || e.paused || e.ended || e.cooldowns[key] > 0) return;
    const unit = player();
    const target = activeTargetPosition();
    const data = abilities.find((ability) => ability.key === key);
    if (!data) return;
    const range = key === "one" ? Math.max(profile.autoRange, 150) : 650;
    if ((key === "one" || (loadout.role === "damage" && key !== "three")) && distance(unit, target) > range) {
      feedback("neutral", "OUT OF RANGE", `Move ${Math.ceil(distance(unit, target) - range)} closer`, 1.2);
      return;
    }
    if (data.talentId) {
      const lowest = () => livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const wardParty = (raw: number) => livingParty().forEach((ally) => { const amount = Math.round(raw * itemEffects.partyWardMultiplier); ally.shield = Math.min(220, ally.shield + amount); floater(ally, `+${amount} ward`, "ward"); });
      switch (data.talentId) {
        case "relentlessEdge": dealDamage(135, data.name, true); cleaveEchoes(75, data.name); break;
        case "finishingRhythm": dealDamage(95, data.name, true); e.cooldowns.one = 0; feedback("player", "TEMPO BREAK", "Weapon Art is ready again", 1.3); break;
        case "battleTempo": e.hasteBuff = 10; unit.attackCd = Math.min(unit.attackCd, .2); feedback("player", "OVERDRIVE", "Auto-attacks are 45% faster for 10 seconds", 1.6); break;
        case "sweepingSteel": dealDamage(175, data.name, true); cleaveEchoes(175, data.name); break;
        case "steadyAim": dealDamage(210, data.name, true); break;
        case "rapidNocking": dealDamage(62, data.name, true); dealDamage(62, data.name, true); dealDamage(62, data.name, true); break;
        case "huntersMark": e.targetVulnerability = 12; feedback("player", "RIFT EXPOSED", "+20% personal damage for 12 seconds", 1.6); break;
        case "twinShot": dealDamage(115, data.name, true); dealDamage(115, data.name, true); break;
        case "renewingTouch": { const targetAlly = lowest(); healUnit(targetAlly, 125 * profile.healingPower, data.name); break; }
        case "livingCurrent": { const restored = livingParty().reduce((sum, ally) => sum + healUnit(ally, 48 * profile.healingPower, data.name), 0); e.focus = Math.min(100, e.focus + 20); feedback("success", "LIVING CURRENT", `${restored} healed · 20 focus restored`, 1.6); break; }
        case "verdantPulse": { const restored = livingParty().reduce((sum, ally) => sum + healUnit(ally, 32 * profile.healingPower, data.name), 0); if (restored) dealDamage(restored * .65, data.name, true); break; }
        case "mercifulHands": { const targetAlly = lowest(); healUnit(targetAlly, 190 * profile.healingPower, data.name); targetAlly.shield = Math.min(220, targetAlly.shield + 60); floater(targetAlly, "+60 rescue ward", "ward"); break; }
        case "resonantWard": { const consumed = unit.shield; unit.shield = 0; dealDamage(Math.max(75, consumed * 2.2), data.name, true); feedback("player", "WARDBURST", `${Math.round(consumed)} ward converted into damage`, 1.5); break; }
        case "sharedShelter": wardParty(62); feedback("success", "SHARED SHELTER", "The party is heavily warded", 1.5); break;
        case "echoingAegis": wardParty(44); livingParty().forEach((ally) => healUnit(ally, 28 * profile.healingPower, data.name)); break;
        case "unbrokenCircle": e.partyMitigation = 10; feedback("success", "UNBROKEN CIRCLE", "Party damage taken reduced by 30% for 10 seconds", 1.8); break;
        case "ironConstitution": dealDamage(90 + (1 - unit.hp / unit.maxHp) * 180, data.name, true); break;
        case "holdTheLine": e.partyMitigation = 8; feedback("success", "HOLD THE LINE", "Party damage taken reduced by 30% for 8 seconds", 1.6); break;
        case "unyielding": healUnit(unit, 130, data.name); unit.shield = Math.min(220, unit.shield + 45); floater(unit, "+45 ward", "ward"); break;
        case "commandingGuard": e.partyDamageBuff = 10; feedback("player", "WAR CRY", "+25% party damage for 10 seconds", 1.7); break;
        case "riftBulwark": unit.shield = Math.min(240, unit.shield + Math.round(135 * profile.wardPower)); floater(unit, "+RIFT BULWARK", "ward"); break;
        case "dampenRift": { const interrupted = e.mechanics[0]; if (!interrupted) { feedback("neutral", "NOTHING TO SPELLBREAK", "Use this while Vaelith is casting a mechanic", 1.3); return; } e.mechanics = e.mechanics.filter((mechanic) => mechanic.id !== interrupted.id); e.metrics.mechanicsAvoided += 1; feedback("success", "SPELLBREAK", `${interrupted.name} cancelled`, 2); pushEvent("success", `${data.name} cancelled ${interrupted.name}.`); break; }
        case "arcaneReturn": dealDamage(120, data.name, true); e.focus = Math.min(100, e.focus + 45); e.cooldowns.one = 0; e.cooldowns.two = 0; feedback("player", "ARCANE RETURN", "45 focus restored · core cooldowns reset", 1.7); break;
        case "nullField": e.partyMitigation = 12; feedback("success", "NULL FIELD", "Party damage taken reduced by 30% for 12 seconds", 1.8); break;
      }
    } else if (loadout.role === "damage") {
      if (key === "two" && e.focus < 24) { feedback("neutral", "NOT ENOUGH FOCUS", "Rift Burst requires 24 focus"); return; }
      if (key === "two") e.focus -= 24;
      if (key === "one") { if (itemEffects.strikeCleave) cleaveEchoes(72 * itemEffects.strikeCleave, "Oathsplitter"); dealDamage(72 * itemEffects.primaryDamageMultiplier, data.name, true); }
      if (key === "two") dealDamage(165, data.name, true);
      if (key === "three") { e.damageBuff = 8; feedback("player", "BATTLE FOCUS", "+30% damage for 8 seconds", 1.6); }
      if (key === "four") dealDamage(e.bossHp / VETERAN_BOSS_HP <= .35 ? 340 : 240, data.name, true);
    } else if (loadout.role === "healer") {
      if ((key === "two" && e.focus < 18) || (key === "three" && e.focus < 30)) { feedback("neutral", "NOT ENOUGH FOCUS", "Wait for focus to recover"); return; }
      if (key === "one") { if (itemEffects.strikeCleave) cleaveEchoes(55 * itemEffects.strikeCleave, "Oathsplitter"); dealDamage(55 * itemEffects.primaryDamageMultiplier, data.name, true); }
      if (key === "two") {
        e.focus -= 18;
        const targetAlly = livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        const lowBonus = loadout.talents.includes("mercifulHands") && targetAlly.hp / targetAlly.maxHp < .4 ? 1.25 : 1;
        const restored = healUnit(targetAlly, 72 * profile.healingPower * lowBonus, data.name);
        if (loadout.talents.includes("verdantPulse")) healUnit(targetAlly, 18 * profile.healingPower, "Verdant Pulse");
        if (itemEffects.mendWard) { targetAlly.shield = Math.min(160, targetAlly.shield + itemEffects.mendWard); floater(targetAlly, `+${itemEffects.mendWard} item ward`, "ward"); }
        if (itemEffects.mendDamage && restored > 0) dealDamage(restored * itemEffects.mendDamage, "Resonant Portal Shard");
        feedback("success", "GREATER MEND", `${targetAlly.name} restored`, 1.2);
      }
      if (key === "three") {
        e.focus -= 30;
        const amount = Math.round(42 * profile.wardPower * itemEffects.partyWardMultiplier);
        livingParty().forEach((ally) => { ally.shield = Math.min(120, ally.shield + amount); floater(ally, `+${amount} ward`, "ward"); });
        feedback("success", "PARTY AEGIS", `${amount} ward granted to every ally`, 1.6);
      }
      if (key === "four") {
        const restored = livingParty().reduce((sum, ally) => sum + healUnit(ally, 45 * profile.healingPower, data.name), 0);
        feedback("success", "VERDANT REFRAIN", `${restored} total vigor restored`, 1.8);
      }
    } else {
      if (key === "one") { if (itemEffects.strikeCleave) cleaveEchoes(60 * itemEffects.strikeCleave, "Oathsplitter"); dealDamage(60 * itemEffects.primaryDamageMultiplier, data.name, true); }
      if (key === "two") { unit.shield = Math.min(160, unit.shield + Math.round(80 * profile.wardPower)); floater(unit, "+80 ward", "ward"); feedback("success", "GUARD", "Next attacks will consume your ward"); }
      if (key === "three") { const amount = Math.round(32 * itemEffects.partyWardMultiplier); livingParty().forEach((ally) => { ally.shield = Math.min(160, ally.shield + amount); floater(ally, `+${amount} ward`, "ward"); }); feedback("success", "COMMANDING WARD", "The party is protected", 1.5); }
      if (key === "four") { const restored = healUnit(unit, 115, data.name); feedback("success", "LAST STAND", `${restored} vigor restored`, 1.6); }
    }
    if (itemEffects.riftBoltDamage && !e.ended) dealDamage(itemEffects.riftBoltDamage, "Resonant Portal Shard");
    e.cooldowns[key] = data.cooldown;
    e.metrics.abilities += 1;
    playSfx(key === "two" && loadout.role === "healer" ? "heal" : "attack");
    sync();
  }, [abilities, activeTargetPosition, cleaveEchoes, dealDamage, feedback, floater, healUnit, itemEffects, livingParty, loadout.role, loadout.talents, player, profile, pushEvent, sync]);

  const dodge = useCallback(() => {
    const e = engineRef.current;
    if (!e.started || e.paused || e.cooldowns.dodge > 0) return;
    const unit = player();
    let dx = 0; let dy = 0;
    if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy--;
    if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy++;
    if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx--;
    if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx++;
    if (!dx && !dy) dx = -1;
    const length = Math.hypot(dx, dy);
    unit.x = Math.max(28, Math.min(ARENA_W - 28, unit.x + dx / length * 135));
    unit.y = Math.max(28, Math.min(ARENA_H - 28, unit.y + dy / length * 135));
    if (itemEffects.dodgeWard) { unit.shield = Math.min(160, unit.shield + itemEffects.dodgeWard); floater(unit, `+${itemEffects.dodgeWard} set ward`, "ward"); }
    e.cooldowns.dodge = 3.2;
    feedback("player", "QUICKSTEP", "Repositioned 135 units", .9);
    sync();
  }, [feedback, floater, itemEffects.dodgeWard, player, sync]);

  const cycleTarget = useCallback(() => {
    const e = engineRef.current;
    const targets = [...e.echoes.filter((echo) => echo.hp > 0).map((echo) => echo.id), ...(e.echoes.some((echo) => echo.hp > 0) ? [] : ["boss"] )];
    if (!targets.length) return;
    const index = targets.indexOf(e.selectedTarget);
    selectTarget(targets[(index + 1) % targets.length]);
  }, [selectTarget]);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (e.started) return;
    e.started = true;
    e.paused = false;
    e.nextMechanic = 6;
    feedback("player", "VETERAN PULL", "Three phases · destroy Echoes · beat the 3:00 enrage", 2.4);
    pushEvent("neutral", "Encounter started. Vaelith will enrage after 3:00.");
    playSfx("confirm");
    sync();
  }, [feedback, pushEvent, sync]);

  const createMechanic = useCallback(() => {
    const e = engineRef.current;
    const living = livingParty();
    const unit = (id: PartyId) => e.party.find((ally) => ally.id === id)!;
    const tank = living.find((ally) => ally.combatRole === "tank") ?? unit("player");
    const playerUnit = unit("player");
    const phaseSequences: Record<number, MechanicKind[]> = { 1: ["cleave", "brands", "raidwide"], 2: ["cross", "chain", "soak", "raidwide"], 3: ["collapse", "cataclysm", "raidwide"] };
    const sequence = phaseSequences[e.phase];
    const kind = sequence[e.mechanicIndex++ % sequence.length];
    let mechanic: BossMechanic;
    const base = { id: e.serial++, kind, duration: 4, remaining: 4, damage: 42, targetIds: [] as PartyId[], zones: [] as Zone[] };
    if (kind === "cleave") {
      const angle = Math.atan2(tank.y - BOSS_Y, tank.x - BOSS_X);
      mechanic = { ...base, name: "Sundering Arc", instruction: "Tank faces Vaelith away · everyone else get behind", duration: 3.5, remaining: 3.5, damage: 46, targetIds: [tank.id], zones: [{ type: "cone", x: BOSS_X, y: BOSS_Y, angle, radius: 245, halfAngle: Math.PI / 3 }] };
    } else if (kind === "brands") {
      const other = living.find((ally) => ally.id !== "player" && ally.combatRole === "damage") ?? living[0];
      mechanic = { ...base, name: "Echo Brands", instruction: "Spread · leave both marked circles", duration: 4.5, remaining: 4.5, damage: 48, targetIds: ["player", other.id], zones: [{ type: "circle", x: playerUnit.x, y: playerUnit.y, radius: 82 }, { type: "circle", x: other.x, y: other.y, radius: 82 }] };
    } else if (kind === "raidwide") {
      mechanic = { ...base, name: e.phase === 3 ? "Final Refrain" : "Resonant Pulse", instruction: "Unavoidable party damage · ward before, heal after", duration: e.phase === 3 ? 5 : 4.5, remaining: e.phase === 3 ? 5 : 4.5, damage: e.phase === 3 ? 58 : 36 + e.phase * 4, targetIds: living.map((ally) => ally.id), zones: [] };
    } else if (kind === "cross") {
      mechanic = { ...base, name: "Crossing Realities", instruction: "Leave both glowing lanes", duration: 4.2, remaining: 4.2, damage: 52, zones: [{ type: "line", x: playerUnit.x - 52, y: 0, width: 104, height: ARENA_H }, { type: "line", x: 0, y: playerUnit.y - 45, width: ARENA_W, height: 90 }] };
    } else if (kind === "chain") {
      const partner = living.find((ally) => ally.id !== "player" && ally.combatRole === "healer") ?? living.find((ally) => ally.id !== "player")!;
      mechanic = { ...base, name: "Severing Link", instruction: `Move 190 units away from ${partner.name}`, duration: 5.2, remaining: 5.2, damage: 62, targetIds: ["player", partner.id], zones: [] };
    } else if (kind === "soak") {
      const soakTarget = unit("ilyra").alive ? unit("ilyra") : living.find((ally) => ally.id !== "player")!;
      mechanic = { ...base, name: "Shared Fate", instruction: `Stand with ${soakTarget.name} to split the impact`, duration: 5.3, remaining: 5.3, damage: 78, targetIds: [soakTarget.id], zones: [{ type: "circle", x: soakTarget.x, y: soakTarget.y, radius: 62 }] };
    } else if (kind === "collapse") {
      mechanic = { ...base, name: "Dimensional Collapse", instruction: "Move diagonally · circle and lane resolve together", duration: 4.3, remaining: 4.3, damage: 58, targetIds: ["player"], zones: [{ type: "circle", x: playerUnit.x, y: playerUnit.y, radius: 92 }, { type: "line", x: 0, y: playerUnit.y - 48, width: ARENA_W, height: 96 }] };
    } else {
      const angle = Math.atan2(tank.y - BOSS_Y, tank.x - BOSS_X);
      mechanic = { ...base, name: "Unbound Cataclysm", instruction: "Tank cleave + spread brand · solve both", duration: 4.6, remaining: 4.6, damage: 64, targetIds: [tank.id, "player"], zones: [{ type: "cone", x: BOSS_X, y: BOSS_Y, angle, radius: 250, halfAngle: Math.PI / 3 }, { type: "circle", x: playerUnit.x, y: playerUnit.y, radius: 88 }] };
    }
    e.mechanics.push(mechanic);
    if (mechanic.kind === "raidwide") {
      const companionHealer = e.party.find((ally) => ally.alive && ally.id !== "player" && ally.combatRole === "healer");
      if (companionHealer) {
        e.party.filter((ally) => ally.alive).forEach((ally) => { ally.shield = Math.min(110, ally.shield + 24); });
        pushEvent("ally", `${companionHealer.name} prepares Party Aegis: 24 ward to every ally.`);
      }
    }
    pushEvent("enemy", `Vaelith casts ${mechanic.name}: ${mechanic.instruction}.`);
    feedback("enemy", mechanic.name.toUpperCase(), mechanic.instruction, mechanic.duration);
    playSfx("warning");
  }, [feedback, livingParty, pushEvent]);

  const resolveMechanic = useCallback((mechanic: BossMechanic) => {
    const e = engineRef.current;
    const living = livingParty();
    const playerUnit = player();
    let playerFailed = false;
    if (mechanic.kind === "chain") {
      const partner = e.party.find((unit) => unit.id === mechanic.targetIds[1])!;
      if (distance(playerUnit, partner) < 190) {
        damageUnit(playerUnit, mechanic.damage, mechanic.name, true);
        damageUnit(partner, mechanic.damage, mechanic.name, true);
        playerFailed = true;
      } else {
        pushEvent("success", `Severing Link broken at ${Math.round(distance(playerUnit, partner))} units.`);
        floater(playerUnit, "CHAIN BROKEN", "status");
      }
    } else if (mechanic.kind === "soak") {
      const zone = mechanic.zones[0] as CircleZone;
      const soakers = living.filter((unit) => zoneHits(zone, unit));
      if (soakers.length >= 2) {
        const split = Math.ceil(mechanic.damage / soakers.length);
        soakers.forEach((unit) => damageUnit(unit, split, mechanic.name, true));
        playerFailed = !soakers.some((unit) => unit.id === "player");
        pushEvent("success", `${mechanic.name} shared by ${soakers.length} allies.`);
      } else {
        const target = e.party.find((unit) => unit.id === mechanic.targetIds[0])!;
        damageUnit(target, mechanic.damage, `${mechanic.name} (unshared)`, true);
        playerFailed = true;
        pushEvent("danger", `${mechanic.name} was not shared.`);
      }
    } else if (mechanic.kind === "raidwide") {
      living.forEach((unit) => damageUnit(unit, mechanic.damage, mechanic.name, true));
    } else {
      for (const unit of living) {
        if (mechanic.zones.some((zone) => zoneHits(zone, unit))) {
          damageUnit(unit, mechanic.damage, mechanic.name, true);
          if (unit.id === "player") playerFailed = true;
        }
      }
    }
    if (mechanic.kind !== "raidwide") {
      if (playerFailed) {
        e.metrics.mechanicHits += 1;
        e.failureStacks += 1;
        feedback("danger", `RIFT FRACTURE ×${e.failureStacks}`, `Future damage +${e.failureStacks * 22}% · healing received −${Math.min(75, e.failureStacks * 18)}%`, 2.4);
        pushEvent("danger", `Mechanic failure applied Rift Fracture ×${e.failureStacks}. The penalty persists for the encounter.`);
      } else { e.metrics.mechanicsAvoided += 1; floater(playerUnit, "SOLVED", "status"); }
    }
    if (!playerFailed && mechanic.kind !== "raidwide") feedback("success", "MECHANIC SOLVED", `${mechanic.name} resolved`, 1.5);
  }, [damageUnit, feedback, floater, livingParty, player, pushEvent]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "1", "2", "3", "4", "5", "6", " ", "tab", "enter"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (key === "1") cast("one");
      if (key === "2") cast("two");
      if (key === "3") cast("three");
      if (key === "4") cast("four");
      if (key === "5") cast("five");
      if (key === "6") cast("six");
      if (key === " ") dodge();
      if (key === "tab") cycleTarget();
      if (key === "enter") start();
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [cast, cycleTarget, dodge, start]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastSync = last;
    const tick = (now: number) => {
      const e = engineRef.current;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      if (!e.paused && !e.ended) {
        e.time += dt;
        if (e.time >= VETERAN_ENRAGE_SECONDS) {
          feedback("danger", "RIFT ENRAGE", "Vaelith unravels the entire arena", 3);
          livingParty().forEach((unit) => damageUnit(unit, 9999, "Unmaking", true));
        }
        Object.keys(e.cooldowns).forEach((key) => { e.cooldowns[key] = Math.max(0, e.cooldowns[key] - dt); });
        e.focus = Math.min(100, e.focus + dt * 6.5);
        e.damageBuff = Math.max(0, e.damageBuff - dt);
        e.hasteBuff = Math.max(0, e.hasteBuff - dt);
        e.targetVulnerability = Math.max(0, e.targetVulnerability - dt);
        e.partyDamageBuff = Math.max(0, e.partyDamageBuff - dt);
        e.partyMitigation = Math.max(0, e.partyMitigation - dt);
        e.phaseTransition = Math.max(0, e.phaseTransition - dt);
        e.party.forEach((unit) => { unit.hitFlash = Math.max(0, unit.hitFlash - dt); });
        e.echoes.forEach((echo) => { echo.hitFlash = Math.max(0, echo.hitFlash - dt); });
        e.floaters.forEach((entry) => { entry.age += dt; entry.y -= dt * 18; });
        e.floaters = e.floaters.filter((entry) => entry.age < 1.4);
        if (e.feedback) { e.feedback.age += dt; if (e.feedback.age >= e.feedback.duration) e.feedback = null; }

        const playerUnit = player();
        let dx = 0; let dy = 0;
        if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy--;
        if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy++;
        if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx--;
        if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx++;
        if (dx || dy) {
          const length = Math.hypot(dx, dy);
          playerUnit.x = Math.max(24, Math.min(ARENA_W - 24, playerUnit.x + dx / length * 178 * dt));
          playerUnit.y = Math.max(24, Math.min(ARENA_H - 24, playerUnit.y + dy / length * 178 * dt));
        }

        for (const unit of e.party.filter((ally) => ally.id !== "player" && ally.alive)) {
          let tx = unit.homeX; let ty = unit.homeY;
          for (const mechanic of e.mechanics) {
            if (mechanic.kind === "brands" || mechanic.kind === "collapse" || mechanic.kind === "cross" || mechanic.kind === "cataclysm") {
              if (mechanic.zones.some((zone) => zoneHits(zone, unit))) {
                tx = Math.max(70, Math.min(930, unit.x + (unit.y < ARENA_H / 2 ? 130 : -130)));
                ty = Math.max(60, Math.min(500, unit.y + (unit.x < ARENA_W / 2 ? 125 : -125)));
              }
            }
          }
          const move = distance(unit, { x: tx, y: ty });
          if (move > 4) { unit.x += (tx - unit.x) / move * 115 * dt; unit.y += (ty - unit.y) / move * 115 * dt; }
        }

        const target = activeTargetPosition();
        for (const unit of e.party.filter((ally) => ally.alive)) {
          unit.attackCd -= dt;
          const range = unit.attackRange;
          if (unit.attackCd <= 0 && distance(unit, target) <= range) {
            dealDamage(unit.attackDamage, unit.id === "player" ? (profile.attackStyle === "ranged" ? "Auto Shot" : "Auto Swing") : unit.name, false, unit.id);
            unit.attackCd = unit.attackInterval * (unit.id === "player" && e.hasteBuff > 0 ? .55 : 1);
          }
        }

        for (const echo of e.echoes.filter((entry) => entry.hp > 0)) {
          echo.pulseCd -= dt;
          if (echo.pulseCd <= 0) {
            livingParty().forEach((unit) => damageUnit(unit, e.phase === 3 ? 18 : 12, `${echo.name}'s Pulse`));
            echo.pulseCd = e.phase === 3 ? 5 : 7;
          }
        }

        const healer = e.party.find((unit) => unit.alive && unit.combatRole === "healer");
        if (healer && healer.id !== "player") {
          e.healerCd -= dt;
          if (e.healerCd <= 0) {
            const lowest = livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
            if (lowest.hp < lowest.maxHp) healUnit(lowest, 38, healer.name);
            e.healerCd = 3.8;
          }
        }
        e.defensiveCd -= dt;
        if (e.defensiveCd <= 0) {
          const companionTank = e.party.find((unit) => unit.alive && unit.combatRole === "tank" && unit.id !== "player");
          if (companionTank && companionTank.hp / companionTank.maxHp < .65) { companionTank.shield = Math.min(110, companionTank.shield + 55); floater(companionTank, "+55 guard", "ward"); }
          e.defensiveCd = 12;
        }
        if (loadout.talents.includes("unyielding")) {
          e.regenCd -= dt;
          if (e.regenCd <= 0) { healUnit(playerUnit, 12, "Unyielding"); e.regenCd = 4; }
        }

        if (e.phaseTransition <= 0) {
          e.bossAttackCd -= dt;
          if (e.bossAttackCd <= 0) {
            const tank = livingParty().find((unit) => unit.combatRole === "tank") ?? playerUnit;
            damageUnit(tank, 29 + e.phase * 5, "Vaelith's Rift Claw");
            e.bossAttackCd = Math.max(1.65, 2.45 - e.phase * .18);
          }
          if (e.time >= e.nextMechanic) {
            createMechanic();
            e.nextMechanic = e.time + (e.phase === 1 ? 9 : e.phase === 2 ? 7.5 : 6.2);
          }
        }
        for (const mechanic of [...e.mechanics]) {
          mechanic.remaining -= dt;
          if (mechanic.remaining <= 0) { resolveMechanic(mechanic); e.mechanics = e.mechanics.filter((entry) => entry.id !== mechanic.id); }
        }
      }
      if (now - lastSync > 50) { lastSync = now; sync(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeTargetPosition, createMechanic, damageUnit, dealDamage, feedback, floater, healUnit, livingParty, loadout.talents, player, profile, resolveMechanic, sync]);

  const selectedEcho = snapshot.echoes.find((echo) => echo.id === snapshot.selectedTarget && echo.hp > 0);
  const targetName = selectedEcho?.name ?? "Vaelith, Echo of the Rift";
  const targetHp = selectedEcho?.hp ?? snapshot.bossHp;
  const targetMaxHp = selectedEcho?.maxHp ?? VETERAN_BOSS_HP;
  const playerUnit = snapshot.party.find((unit) => unit.id === "player")!;
  const targetPosition = selectedEcho ?? { x: BOSS_X, y: BOSS_Y };
  const targetDistance = Math.round(distance(playerUnit, targetPosition));
  const remaining = Math.max(0, VETERAN_ENRAGE_SECONDS - snapshot.time);
  const mechanic = snapshot.mechanics[0];
  const partyDps = combatRate(snapshot.metrics.damage, snapshot.time);
  const partyHps = combatRate(snapshot.metrics.healing, snapshot.time);
  const meterRows = snapshot.party.map((unit) => ({ unit, metrics: snapshot.metrics.actors[unit.id], dps: combatRate(snapshot.metrics.actors[unit.id].damage, snapshot.time), hps: combatRate(snapshot.metrics.actors[unit.id].healing, snapshot.time) }));
  const maxActorDps = Math.max(1, ...meterRows.map((row) => row.dps));
  return <main className={`pt-veteran-combat phase-${snapshot.phase}`}>
    <header className="pt-veteran-top"><div><span>Veteran boss · Phase {snapshot.phase} of 3</span><h1>Vaelith, Echo of the Rift</h1><small>{phaseName(snapshot.phase)}</small></div><section><span><b>{Math.floor(snapshot.time / 60)}:{String(Math.floor(snapshot.time % 60)).padStart(2, "0")}</b> elapsed</span><span className={remaining < 45 ? "danger" : ""}><b>{Math.floor(remaining / 60)}:{String(Math.floor(remaining % 60)).padStart(2, "0")}</b> enrage</span><span><b>{partyDps}</b> party DPS</span><span><b>{partyHps}</b> party HPS</span><span className={snapshot.failureStacks > 0 ? "danger" : ""}><b>×{snapshot.failureStacks}</b> fracture</span></section><nav><button onClick={() => { engineRef.current.paused = !engineRef.current.paused; sync(); }}>{snapshot.paused && snapshot.started ? "Resume" : "Pause"}</button><button onClick={onExit}>Leave lab</button></nav></header>
    <div className="pt-veteran-grid">
      <aside className="pt-veteran-party"><header><span>Full party</span><small>Role coverage active</small></header>{snapshot.party.filter((unit) => unit.id !== "player").concat(playerUnit).map((unit) => <article key={unit.id} className={`${unit.id === "player" ? "player" : ""} ${!unit.alive ? "down" : ""} role-${unit.combatRole}`}><i>{unit.name[0]}</i><div><span>{unit.role}</span><strong>{unit.name}</strong><em>{Math.ceil(unit.hp)} / {unit.maxHp}</em><b><span style={{ width: `${unit.hp / unit.maxHp * 100}%` }}/></b>{unit.shield > 0 && <small>◈ {Math.ceil(unit.shield)} ward</small>}</div></article>)}
        <section className="pt-veteran-meter"><header><span>Live combat meter</span><small>{partyDps} DPS · {partyHps} HPS</small></header>{meterRows.sort((a, b) => b.dps - a.dps).map(({ unit, metrics, dps, hps }) => <div key={unit.id} className={unit.id === "player" ? "player" : ""}><strong>{unit.id === "player" ? "You" : unit.name.split(" ")[0]}</strong><i><b style={{ width: `${dps / maxActorDps * 100}%` }}/></i><span><b>{dps}</b> DPS</span><span><b>{hps}</b> HPS</span><small title="Damage taken and ward absorbed">{metrics.damageTaken} taken · {metrics.absorbed} warded</small></div>)}</section>
        <section className="pt-veteran-log"><header><span>Combat record</span><small>Newest first</small></header>{snapshot.events.map((event) => <div key={event.id} className={`tone-${event.tone}`}><time>{event.time.toFixed(1)}</time><p>{event.text}</p></div>)}</section>
      </aside>
      <section className="pt-veteran-stage">
        <div className="pt-veteran-bossbar"><div><span>{snapshot.echoes.some((echo) => echo.hp > 0) ? "Rift barrier active · Tab" : `Phase ${snapshot.phase} · ${phaseName(snapshot.phase)}`}</span><strong>{targetName}</strong></div><i><b style={{ width: `${targetHp / targetMaxHp * 100}%` }}/></i><em>{Math.ceil(targetHp).toLocaleString()} / {targetMaxHp.toLocaleString()}</em><small>{targetDistance} range</small></div>
        <div className={`pt-veteran-cast ${mechanic ? "active" : ""}`}><span>{mechanic?.name ?? "Vaelith is tracking the party"}</span><i><b style={{ width: `${mechanic ? (1 - mechanic.remaining / mechanic.duration) * 100 : 0}%` }}/></i><strong>{mechanic?.instruction ?? "Prepare for the next mechanic"}</strong><em>{mechanic ? mechanic.remaining.toFixed(1) : ""}</em></div>
        <div className="pt-veteran-arena-wrap"><svg className="pt-veteran-arena" viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} role="img" aria-label="Veteran boss battlefield"><defs><radialGradient id="veteranGround"><stop stopColor="#26362e"/><stop offset="1" stopColor="#070c0a"/></radialGradient><filter id="riftGlow"><feGaussianBlur stdDeviation="5"/></filter></defs><rect width={ARENA_W} height={ARENA_H} rx="18" fill="url(#veteranGround)"/><g className="pt-veteran-runes"><circle cx={BOSS_X} cy={BOSS_Y} r="205"/><circle cx={BOSS_X} cy={BOSS_Y} r="150"/><path d="M770 55v90m0 270v90M545 280h90m270 0h70M610 120l65 65m190 190 65 65m0-320-65 65m-190 190-65 65"/></g>{snapshot.mechanics.flatMap((entry) => entry.zones.map((zone, index) => <VeteranZone key={`${entry.id}-${index}`} zone={zone} remaining={entry.remaining} duration={entry.duration}/>))}{snapshot.mechanics.filter((entry) => entry.kind === "chain").map((entry) => { const a = snapshot.party.find((unit) => unit.id === entry.targetIds[0])!; const b = snapshot.party.find((unit) => unit.id === entry.targetIds[1])!; return <line key={entry.id} className="pt-chain-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>; })}<g className={`pt-veteran-boss ${snapshot.phaseTransition > 0 ? "transition" : ""}`} transform={`translate(${BOSS_X} ${BOSS_Y})`} onClick={() => selectTarget("boss")}><circle r="61"/><circle className="core" r="36"/><path d="M-30-42L0-78l30 36 42 12-20 42 8 48-60-12-60 12 8-48-20-42z"/><text y="92" textAnchor="middle">VAELITH</text></g>{snapshot.echoes.filter((echo) => echo.hp > 0).map((echo) => <g key={echo.id} className={`pt-rift-echo ${snapshot.selectedTarget === echo.id ? "selected" : ""} ${echo.hitFlash > 0 ? "hit" : ""}`} transform={`translate(${echo.x} ${echo.y})`} onClick={() => selectTarget(echo.id)}><circle r="32"/><path d="M0-25l22 25L0 25-22 0z"/><text y="49" textAnchor="middle">{echo.name}</text><rect x="-38" y="56" width="76" height="5"/><rect className="hp" x="-38" y="56" width={76 * echo.hp / echo.maxHp} height="5"/></g>)}{snapshot.party.filter((unit) => unit.alive).map((unit) => <g key={unit.id} className={`pt-veteran-unit role-${unit.combatRole} ${unit.id === "player" ? "player" : ""} ${unit.hitFlash > 0 ? "hit" : ""}`} transform={`translate(${unit.x} ${unit.y})`}><circle className="range" r="28"/><circle r="18"/><text y="4" textAnchor="middle">{unit.name[0]}</text><text className="label" y="42" textAnchor="middle">{unit.id === "player" ? "YOU" : unit.name.split(" ")[0].toUpperCase()}</text>{unit.shield > 0 && <circle className="shield" r="24"/>}</g>)}{snapshot.floaters.map((entry) => <text key={entry.id} x={entry.x} y={entry.y} textAnchor="middle" className={`pt-veteran-floater ${entry.tone}`} opacity={Math.max(0,1-entry.age/1.4)}>{entry.text}</text>)}</svg>
          {mechanic && <div className={`pt-veteran-warning kind-${mechanic.kind}`}><span>{mechanic.kind === "raidwide" ? "PREPARE" : mechanic.kind === "soak" ? "STACK" : mechanic.kind === "chain" ? "BREAK" : "MOVE"}</span><div><strong>{mechanic.name}</strong><small>{mechanic.instruction}</small></div><b>{mechanic.remaining.toFixed(1)}</b></div>}{snapshot.feedback && <div key={snapshot.feedback.id} className={`pt-veteran-feedback tone-${snapshot.feedback.tone}`}><strong>{snapshot.feedback.title}</strong><span>{snapshot.feedback.detail}</span></div>}{!snapshot.started && <div className="pt-veteran-brief"><span>Veteran encounter plan</span><h2>A tighter rotation and execution check.</h2><div><b>1</b><p><strong>Use the six-skill loadout you built.</strong> Talent actives and item procs are required for a fast clear.</p></div><div><b>2</b><p><strong>Phase transitions summon Rift Echoes.</strong> Vaelith is immune until every Echo is destroyed. Tab changes targets.</p></div><div><b>3</b><p><strong>Failed mechanics apply permanent Rift Fracture.</strong> Each stack increases damage taken and reduces healing received.</p></div><button onClick={start}>Begin veteran encounter <kbd>Enter</kbd></button></div>}{snapshot.paused && snapshot.started && !snapshot.ended && <div className="pt-veteran-paused"><span>Simulation paused</span><button onClick={() => { engineRef.current.paused = false; sync(); }}>Resume</button></div>}</div>
      </section>
    </div>
    <footer className="pt-veteran-footer"><div><span><b>WASD</b> Move</span><span><b>Space</b> Quickstep</span><span><b>Tab</b> Target Echo</span><span className={snapshot.damageBuff > 0 ? "active" : ""}>Battle focus {snapshot.damageBuff > 0 ? `${snapshot.damageBuff.toFixed(1)}s` : "inactive"}</span></div><section>{abilities.map((ability) => <button key={ability.key} disabled={!snapshot.started || snapshot.cooldowns[ability.key] > 0} onClick={() => cast(ability.key)}><kbd>{ability.hotkey}</kbd><strong>{ability.name}</strong><small>{ability.detail}</small>{snapshot.cooldowns[ability.key] > 0 && <i style={{ height: `${snapshot.cooldowns[ability.key] / ability.cooldown * 100}%` }}/>}<em>{snapshot.cooldowns[ability.key] > 0 ? snapshot.cooldowns[ability.key].toFixed(1) : "READY"}</em></button>)}<button disabled={!snapshot.started || snapshot.cooldowns.dodge > 0} onClick={dodge}><kbd>Space</kbd><strong>Quickstep</strong><small>Personal movement</small><em>{snapshot.cooldowns.dodge > 0 ? snapshot.cooldowns.dodge.toFixed(1) : "READY"}</em></button></section><aside><span>Focus</span><b><i style={{ width: `${snapshot.focus}%` }}/></b><strong>{Math.floor(snapshot.focus)}</strong></aside></footer>
  </main>;
}

function VeteranZone({ zone, remaining, duration }: { zone: Zone; remaining: number; duration: number }) {
  const ratio = remaining / duration;
  if (zone.type === "circle") return <g className="pt-veteran-zone"><circle cx={zone.x} cy={zone.y} r={zone.radius}/><circle className="countdown" cx={zone.x} cy={zone.y} r={zone.radius * ratio}/></g>;
  if (zone.type === "line") return <g className="pt-veteran-zone"><rect x={zone.x} y={zone.y} width={zone.width} height={zone.height}/><rect className="countdown" x={zone.x + zone.width * (1-ratio)/2} y={zone.y + zone.height * (1-ratio)/2} width={zone.width * ratio} height={zone.height * ratio}/></g>;
  const start = zone.angle - zone.halfAngle; const end = zone.angle + zone.halfAngle;
  const x1 = zone.x + Math.cos(start) * zone.radius; const y1 = zone.y + Math.sin(start) * zone.radius;
  const x2 = zone.x + Math.cos(end) * zone.radius; const y2 = zone.y + Math.sin(end) * zone.radius;
  const path = `M${zone.x} ${zone.y}L${x1} ${y1}A${zone.radius} ${zone.radius} 0 0 1 ${x2} ${y2}Z`;
  return <g className="pt-veteran-zone"><path d={path}/><path className="countdown" d={path} style={{ transform: `scale(${.35+.65*ratio})`, transformOrigin: `${zone.x}px ${zone.y}px` }}/></g>;
}

function BossResult({ result, loadout, onRetry, onBuild, onExit }: { result: ResultPayload; loadout: BossLoadout; onRetry: () => void; onBuild: () => void; onExit: () => void }) {
  const grade = result.result === "victory" ? result.metrics.mechanicHits === 0 ? "S" : result.duration < 190 ? "A" : "B" : "D";
  const names: Record<PartyId, string> = { player: "You", ...Object.fromEntries(veteranParty(loadout.role).map((unit) => [unit.id, unit.name])) } as Record<PartyId, string>;
  const rows = (Object.entries(result.metrics.actors) as [PartyId, ActorMetrics][]).sort(([, a], [, b]) => b.damage - a.damage);
  const equipment = [loadout.weaponId, loadout.armorId, loadout.charmId].filter(Boolean).map((id) => ITEMS[id!].name).join(" · ");
  return <main className={`pt-boss-result ${result.result}`}><section>
    <span>Veteran boss laboratory</span>
    <h1>{result.result === "victory" ? "Vaelith is silenced." : "The simulation ended."}</h1>
    <p>{result.result === "victory" ? "The high-level party loop held through three phases. Review the record below before trying another role." : "The build reached its limit. Change talents, tighten the rotation, or improve mechanic execution and try again."}</p>
    <div className="pt-result-grade"><b>{grade}</b><span>{result.result === "victory" ? "Clear grade" : `Reached phase ${result.phase}`}</span></div>
    <div className="pt-result-metrics"><span><b>{Math.floor(result.duration/60)}:{String(Math.floor(result.duration%60)).padStart(2,"0")}</b>Duration</span><span><b>{combatRate(result.metrics.damage, result.duration)}</b>Party DPS</span><span><b>{combatRate(result.metrics.healing, result.duration)}</b>Party HPS</span><span><b>{result.metrics.mechanicsAvoided}</b>Solved</span><span><b>{result.metrics.mechanicHits}</b>Failed</span><span><b>{result.metrics.abilities}</b>Abilities</span></div>
    <section className="pt-result-meter"><header><span>Party member</span><span>DPS</span><span>HPS</span><span>Damage</span><span>Healing</span><span>Taken / warded</span></header>{rows.map(([id, metrics]) => <div key={id} className={id === "player" ? "player" : ""}><strong>{names[id]}</strong><span>{combatRate(metrics.damage, result.duration)}</span><span>{combatRate(metrics.healing, result.duration)}</span><span>{metrics.damage.toLocaleString()}</span><span>{metrics.healing.toLocaleString()}</span><span>{metrics.damageTaken.toLocaleString()} / {metrics.absorbed.toLocaleString()}</span></div>)}</section>
    <aside><span>Build tested</span><strong>{COMBAT_PATHS.find((path) => path.id === loadout.spec)?.name} · {equipment}</strong><small>{loadout.talents.map((id) => TALENTS.find((talent) => talent.id === id)?.name).join(" · ")}</small></aside>
    <nav><button className="primary" onClick={onRetry}>Retry same build</button><button onClick={onBuild}>Change build</button><button onClick={onExit}>Chapter playtest</button></nav>
  </section></main>;
}
