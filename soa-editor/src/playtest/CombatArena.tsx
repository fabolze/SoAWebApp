import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocationId } from "./content";
import { mechanicSequence, pointToSegmentDistance, type MechanicKind } from "./combatMath";

type AllyId = "player" | "companion";
type EnemyKind = "boar" | "mireling" | "warden";
type Ally = { id: AllyId; name: string; role: string; x: number; y: number; hp: number; maxHp: number; shield: number; alive: boolean };
type Enemy = { id: string; name: string; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; range: number; attackCd: number };
type Mechanic = { id: number; name: string; kind: MechanicKind; casterId: string; duration: number; remaining: number; x: number; y: number; endX: number; endY: number; radius: number; width: number; damage: number };
type Floater = { id: number; x: number; y: number; value: string; kind: "damage" | "heal" | "shield"; age: number };
type Engine = {
  player: Ally & { mana: number; maxMana: number };
  companion: Ally;
  enemies: Enemy[];
  cooldowns: Record<string, number>;
  time: number;
  ended: boolean;
  paused: boolean;
  companionAttackCd: number;
  nextMechanic: number;
  mechanicIndex: number;
  mechanic: Mechanic | null;
  floaters: Floater[];
  serial: number;
};
type Snapshot = Engine & { message: string; enemyTargetId: string | null; allyTargetId: AllyId };

const ARENA_W = 900;
const ARENA_H = 500;

function enemiesFor(location: LocationId): Enemy[] {
  if (location === "forest") return [
    { id: "boar-a", name: "Panicked Forest Boar", kind: "boar", x: 690, y: 185, hp: 96, maxHp: 96, speed: 38, damage: 10, range: 46, attackCd: .8 },
    { id: "boar-b", name: "Frightened Young Boar", kind: "boar", x: 750, y: 340, hp: 68, maxHp: 68, speed: 44, damage: 8, range: 42, attackCd: 1.5 },
  ];
  if (location === "swamp") return [
    { id: "mire-a", name: "Shadow-Touched Channeler", kind: "mireling", x: 700, y: 145, hp: 110, maxHp: 110, speed: 28, damage: 12, range: 58, attackCd: .7 },
    { id: "mire-b", name: "Marsh Shadow", kind: "mireling", x: 745, y: 350, hp: 135, maxHp: 135, speed: 31, damage: 14, range: 52, attackCd: 1.4 },
  ];
  return [{ id: "warden", name: "Shadow Creature at the Portal", kind: "warden", x: 710, y: 250, hp: 410, maxHp: 410, speed: 23, damage: 17, range: 64, attackCd: 1.1 }];
}

function initialEngine(location: LocationId, playerName: string, maxHp: number, currentHp: number): Engine {
  return {
    player: { id: "player", name: playerName, role: "Wayfarer · You", x: 190, y: 300, hp: Math.min(maxHp, currentHp), maxHp, shield: 0, alive: true, mana: 100, maxMana: 100 },
    companion: { id: "companion", name: "First Companion", role: "Vanguard · Identity open", x: 255, y: 235, hp: 126, maxHp: 126, shield: 0, alive: true },
    enemies: enemiesFor(location), cooldowns: { strike: 0, bolt: 0, mend: 0, aegis: 0, dodge: 0 }, time: 0, ended: false, paused: false,
    companionAttackCd: .6, nextMechanic: 3.2, mechanicIndex: 0, mechanic: null, floaters: [], serial: 1,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }

function encounterTitle(location: LocationId) {
  return location === "ruins" ? "The Forbidden Portal" : location === "swamp" ? "Whispers in the Marsh" : "Unrest in the Forest";
}

export default function CombatArena({ location, playerName, maxHp, currentHp, damage, armor, speedBonus, tonics, onUseTonic, onVictory, onDefeat, onFlee }: {
  location: LocationId; playerName: string; maxHp: number; currentHp: number; damage: number; armor: number; speedBonus: boolean; tonics: number;
  onUseTonic: () => boolean; onVictory: (remainingHp: number) => void; onDefeat: () => void; onFlee: (remainingHp: number) => void;
}) {
  const engineRef = useRef<Engine>(initialEngine(location, playerName, maxHp, currentHp));
  const keysRef = useRef(new Set<string>());
  const enemyTargetRef = useRef<string | null>(engineRef.current.enemies[0]?.id ?? null);
  const allyTargetRef = useRef<AllyId>("companion");
  const messageRef = useRef("Your provisional companion will hold their attention. Keep moving and keep your party alive.");
  const [snapshot, setSnapshot] = useState<Snapshot>({ ...engineRef.current, message: messageRef.current, enemyTargetId: enemyTargetRef.current, allyTargetId: allyTargetRef.current });
  const [showHelp, setShowHelp] = useState(true);

  const sync = useCallback(() => {
    const e = engineRef.current;
    setSnapshot({
      ...e, player: { ...e.player }, companion: { ...e.companion }, enemies: e.enemies.map((enemy) => ({ ...enemy })), cooldowns: { ...e.cooldowns },
      mechanic: e.mechanic ? { ...e.mechanic } : null, floaters: e.floaters.map((floater) => ({ ...floater })), message: messageRef.current,
      enemyTargetId: enemyTargetRef.current, allyTargetId: allyTargetRef.current,
    });
  }, []);

  const addFloater = useCallback((unit: { x: number; y: number }, value: string, kind: Floater["kind"]) => {
    const e = engineRef.current;
    e.floaters.push({ id: e.serial++, x: unit.x, y: unit.y - 30, value, kind, age: 0 });
  }, []);

  const damageAlly = useCallback((ally: Ally, rawDamage: number, source: string) => {
    if (!ally.alive) return;
    const e = engineRef.current;
    let amount = ally.id === "player" ? Math.max(3, rawDamage - armor) : rawDamage;
    if (ally.shield > 0) {
      const absorbed = Math.min(ally.shield, amount);
      ally.shield -= absorbed; amount -= absorbed;
      if (absorbed) addFloater(ally, `-${absorbed} ward`, "shield");
    }
    if (amount > 0) { ally.hp = Math.max(0, ally.hp - amount); addFloater(ally, `-${amount}`, "damage"); }
    if (ally.hp <= 0) {
      ally.alive = false;
      messageRef.current = ally.id === "player" ? "You fall before the missing villager can be rescued." : "Your companion is down. The enemy turns toward you.";
      if (ally.id === "player") { e.ended = true; window.setTimeout(onDefeat, 650); }
    } else messageRef.current = `${source} hits ${ally.name}.`;
  }, [addFloater, armor, onDefeat]);

  const healAlly = useCallback((ally: Ally, amount: number) => {
    if (!ally.alive) return false;
    const actual = Math.min(amount, ally.maxHp - ally.hp);
    ally.hp += actual;
    addFloater(ally, `+${actual}`, "heal");
    return actual > 0;
  }, [addFloater]);

  const livingEnemies = useCallback(() => engineRef.current.enemies.filter((enemy) => enemy.hp > 0), []);

  const targetEnemy = useCallback((id: string) => {
    if (!engineRef.current.enemies.some((enemy) => enemy.id === id && enemy.hp > 0)) return;
    enemyTargetRef.current = id; messageRef.current = `${engineRef.current.enemies.find((enemy) => enemy.id === id)?.name} targeted.`; sync();
  }, [sync]);

  const targetAlly = useCallback((id: AllyId) => {
    const ally = id === "player" ? engineRef.current.player : engineRef.current.companion;
    if (!ally.alive) return;
    allyTargetRef.current = id; messageRef.current = `${ally.name} selected for support spells.`; sync();
  }, [sync]);

  const cycleEnemy = useCallback(() => {
    const living = livingEnemies(); if (!living.length) return;
    const index = living.findIndex((enemy) => enemy.id === enemyTargetRef.current);
    targetEnemy(living[(index + 1) % living.length].id);
  }, [livingEnemies, targetEnemy]);

  const castAbility = useCallback((ability: "strike" | "bolt" | "mend" | "aegis") => {
    const e = engineRef.current;
    if (e.ended || e.paused || e.cooldowns[ability] > 0) return;
    if (ability === "mend" || ability === "aegis") {
      const ally = allyTargetRef.current === "player" ? e.player : e.companion;
      if (!ally.alive) { messageRef.current = "That ally can no longer be targeted."; sync(); return; }
      const cost = ability === "mend" ? 18 : 24;
      if (e.player.mana < cost) { messageRef.current = "Not enough focus."; sync(); return; }
      e.player.mana -= cost;
      if (ability === "mend") {
        const amount = Math.round(30 + damage * .6);
        healAlly(ally, amount); e.cooldowns.mend = .9; messageRef.current = `Mend restores ${ally.name}.`;
      } else {
        const amount = 30 + Math.round(damage * .35);
        ally.shield = Math.min(60, ally.shield + amount); addFloater(ally, `+${amount} ward`, "shield"); e.cooldowns.aegis = 5.5; messageRef.current = `Aegis wards ${ally.name}.`;
      }
      sync(); return;
    }
    let target = e.enemies.find((enemy) => enemy.id === enemyTargetRef.current && enemy.hp > 0);
    if (!target) target = livingEnemies()[0];
    if (!target) return;
    enemyTargetRef.current = target.id;
    const range = ability === "strike" ? 92 : 470;
    if (distance(e.player, target) > range) { messageRef.current = `${target.name} is out of range.`; sync(); return; }
    if (ability === "bolt" && e.player.mana < 12) { messageRef.current = "Not enough focus."; sync(); return; }
    if (ability === "bolt") e.player.mana -= 12;
    const dealt = ability === "strike" ? damage : Math.round(damage * 1.18 + 6);
    target.hp = Math.max(0, target.hp - dealt); addFloater(target, `-${dealt}`, "damage");
    e.cooldowns[ability] = ability === "strike" ? .72 : 1.45;
    messageRef.current = `${ability === "strike" ? "Wayfarer Strike" : "Focused Bolt"} hits ${target.name}.`;
    const living = livingEnemies();
    if (!living.length) { e.ended = true; messageRef.current = "Victory. Your party survives."; window.setTimeout(() => onVictory(e.player.hp), 750); }
    else if (target.hp <= 0) enemyTargetRef.current = living[0].id;
    sync();
  }, [addFloater, damage, healAlly, livingEnemies, onVictory, sync]);

  const dodge = useCallback(() => {
    const e = engineRef.current;
    if (e.ended || e.paused || e.cooldowns.dodge > 0) return;
    let dx = 0; let dy = 0;
    if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy -= 1;
    if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy += 1;
    if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx -= 1;
    if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx += 1;
    if (!dx && !dy) dx = -1;
    const length = Math.hypot(dx, dy);
    e.player.x = Math.max(28, Math.min(ARENA_W - 28, e.player.x + dx / length * 118));
    e.player.y = Math.max(28, Math.min(ARENA_H - 28, e.player.y + dy / length * 118));
    e.cooldowns.dodge = 3.1; messageRef.current = "Quickstep."; sync();
  }, [sync]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "1", "2", "3", "4", " ", "tab", "f1", "f2"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (key === "1") castAbility("strike"); if (key === "2") castAbility("bolt"); if (key === "3") castAbility("mend"); if (key === "4") castAbility("aegis");
      if (key === " ") dodge(); if (key === "tab") cycleEnemy(); if (key === "f1") targetAlly("player"); if (key === "f2") targetAlly("companion");
      if (key === "p") { engineRef.current.paused = !engineRef.current.paused; sync(); }
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [castAbility, cycleEnemy, dodge, sync, targetAlly]);

  const startMechanic = useCallback(() => {
    const e = engineRef.current; const caster = livingEnemies()[0]; if (!caster) return;
    const sequence = mechanicSequence(location); const spec = sequence[e.mechanicIndex % sequence.length]; e.mechanicIndex += 1;
    const target = e.mechanicIndex % 3 === 0 && e.companion.alive ? e.companion : e.player;
    e.mechanic = { id: e.serial++, name: spec.name, kind: spec.kind, casterId: caster.id, duration: spec.duration, remaining: spec.duration, x: spec.kind === "cleave" ? caster.x : target.x, y: spec.kind === "cleave" ? caster.y : target.y, endX: target.x, endY: target.y, radius: spec.radius, width: spec.width, damage: spec.damage };
    messageRef.current = `${caster.name} begins casting ${spec.name}.`;
  }, [livingEnemies, location]);

  const resolveMechanic = useCallback((mechanic: Mechanic) => {
    const e = engineRef.current; const caster = e.enemies.find((enemy) => enemy.id === mechanic.casterId) ?? { x: mechanic.x, y: mechanic.y };
    const hits = (ally: Ally) => {
      if (!ally.alive) return false;
      if (mechanic.kind === "raidwide") return true;
      if (mechanic.kind === "circle" || mechanic.kind === "cleave") return distance(ally, { x: mechanic.x, y: mechanic.y }) <= mechanic.radius;
      return pointToSegmentDistance(ally, caster, { x: mechanic.endX, y: mechanic.endY }) <= mechanic.width / 2;
    };
    let avoided = true;
    for (const ally of [e.player, e.companion]) if (hits(ally)) { avoided = false; damageAlly(ally, mechanic.damage, mechanic.name); }
    if (avoided) messageRef.current = `${mechanic.name} avoided.`;
    e.mechanic = null; e.nextMechanic = e.time + (location === "ruins" ? 3.8 : 4.7);
  }, [damageAlly, location]);

  useEffect(() => {
    let frame = 0; let last = performance.now(); let lastSync = last;
    const tick = (now: number) => {
      const e = engineRef.current; const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!e.ended && !e.paused) {
        e.time += dt; for (const key of Object.keys(e.cooldowns)) e.cooldowns[key] = Math.max(0, e.cooldowns[key] - dt);
        e.player.mana = Math.min(e.player.maxMana, e.player.mana + dt * 7); e.floaters.forEach((floater) => { floater.age += dt; floater.y -= dt * 18; }); e.floaters = e.floaters.filter((floater) => floater.age < 1.15);
        let dx = 0; let dy = 0;
        if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy -= 1; if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy += 1;
        if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx -= 1; if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx += 1;
        if (dx || dy) { const length = Math.hypot(dx, dy); const speed = speedBonus ? 176 : 148; e.player.x = Math.max(25, Math.min(ARENA_W - 25, e.player.x + dx / length * speed * dt)); e.player.y = Math.max(25, Math.min(ARENA_H - 25, e.player.y + dy / length * speed * dt)); }
        const living = livingEnemies();
        if (e.companion.alive && living.length) {
          const target = living.slice().sort((a, b) => distance(e.companion, a) - distance(e.companion, b))[0]; const dist = distance(e.companion, target);
          e.companionAttackCd -= dt;
          if (dist > 78) { e.companion.x += (target.x - e.companion.x) / dist * 55 * dt; e.companion.y += (target.y - e.companion.y) / dist * 55 * dt; }
          else if (e.companionAttackCd <= 0) { const dealt = 10; target.hp = Math.max(0, target.hp - dealt); addFloater(target, `-${dealt}`, "damage"); e.companionAttackCd = 1.05; if (target.hp <= 0) enemyTargetRef.current = livingEnemies()[0]?.id ?? null; }
        }
        for (const enemy of livingEnemies()) {
          enemy.attackCd -= dt; const target: Ally = e.companion.alive ? e.companion : e.player; const dist = distance(enemy, target);
          if (dist > enemy.range) { enemy.x += (target.x - enemy.x) / dist * enemy.speed * dt; enemy.y += (target.y - enemy.y) / dist * enemy.speed * dt; }
          else if (enemy.attackCd <= 0 && !e.mechanic) { damageAlly(target, enemy.damage, `${enemy.name}'s attack`); enemy.attackCd = enemy.kind === "warden" ? 1.55 : 1.8; }
        }
        if (!livingEnemies().length && !e.ended) { e.ended = true; messageRef.current = "Victory. Your party survives."; window.setTimeout(() => onVictory(e.player.hp), 750); }
        if (!e.mechanic && e.time >= e.nextMechanic && livingEnemies().length) startMechanic();
        if (e.mechanic) { e.mechanic.remaining -= dt; if (e.mechanic.remaining <= 0) resolveMechanic(e.mechanic); }
      }
      if (now - lastSync > 45) { lastSync = now; sync(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [addFloater, damageAlly, livingEnemies, onVictory, resolveMechanic, speedBonus, startMechanic, sync]);

  const consumeTonic = () => {
    const e = engineRef.current; if (!tonics || e.player.hp >= e.player.maxHp || !onUseTonic()) return;
    healAlly(e.player, 35); messageRef.current = "The village tonic restores your vigor."; sync();
  };

  const primaryEnemy = useMemo(() => snapshot.enemies.find((enemy) => enemy.hp > 0), [snapshot.enemies]);
  const selectedEnemy = snapshot.enemies.find((enemy) => enemy.id === snapshot.enemyTargetId);
  const selectedAlly = snapshot.allyTargetId === "player" ? snapshot.player : snapshot.companion;
  const locationClass = location === "ruins" ? "is-ruins" : location === "swamp" ? "is-swamp" : "is-forest";
  const castProgress = snapshot.mechanic ? (1 - snapshot.mechanic.remaining / snapshot.mechanic.duration) * 100 : 0;

  return <section className={`pt-combat ${locationClass}`} aria-label="Party combat arena">
    <div className="pt-combat-topbar"><div><span className="pt-kicker">Party encounter · Top-down prototype</span><h2>{encounterTitle(location)}</h2></div><div className="pt-combat-actions"><button onClick={() => { engineRef.current.paused = !engineRef.current.paused; sync(); }}>{snapshot.paused ? "Resume" : "Pause"}</button>{location !== "ruins" && <button onClick={() => onFlee(snapshot.player.hp)}>Flee</button>}</div></div>
    <div className="pt-raid-layout">
      <aside className="pt-party-frames"><span className="pt-kicker">Party</span><PartyFrame ally={snapshot.companion} selected={snapshot.allyTargetId === "companion"} hotkey="F2" onClick={() => targetAlly("companion")} /><PartyFrame ally={snapshot.player} selected={snapshot.allyTargetId === "player"} hotkey="F1" onClick={() => targetAlly("player")} mana={snapshot.player.mana} /><div className="pt-party-tip">Support spells target the highlighted party frame.</div></aside>
      <div className="pt-encounter-stage">
        <div className="pt-boss-frame"><div><span>{primaryEnemy?.kind === "warden" ? "Boss" : "Encounter leader"}</span><strong>{primaryEnemy?.name ?? "Enemies defeated"}</strong></div><i><b style={{ width: `${primaryEnemy ? primaryEnemy.hp / primaryEnemy.maxHp * 100 : 0}%` }}/></i><em>{primaryEnemy ? `${Math.ceil(primaryEnemy.hp)} / ${primaryEnemy.maxHp}` : "0"}</em></div>
        <div className={`pt-cast-frame ${snapshot.mechanic ? "active" : ""}`}><span>{snapshot.mechanic ? snapshot.mechanic.name : "Watching for enemy cast…"}</span><i><b style={{ width: `${castProgress}%` }}/></i><em>{snapshot.mechanic ? snapshot.mechanic.remaining.toFixed(1) : ""}</em></div>
        <div className="pt-arena-wrap">
          <svg className="pt-arena" viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} role="img" aria-label="Top-down party battlefield">
            <defs><pattern id="arenaGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M7 48l9-12m22-19 6-9m10 39 10-6" stroke="currentColor" opacity=".1" strokeWidth="2"/></pattern><radialGradient id="healerGlow"><stop offset="0" stopColor="#8be2b7" stopOpacity=".75"/><stop offset="1" stopColor="#4ba777" stopOpacity="0"/></radialGradient></defs>
            <rect width={ARENA_W} height={ARENA_H} className="pt-arena-ground" rx="16"/><rect width={ARENA_W} height={ARENA_H} fill="url(#arenaGrid)" rx="16"/>
            {location === "ruins" && <g className="pt-ruin-ring"><circle cx="700" cy="250" r="140"/><circle cx="700" cy="250" r="101"/><path d="M700 82v50m0 236v50M532 250h50m236 0h50M580 130l38 38m164 164 38 38m0-240-38 38m-164 164-38 38"/></g>}
            {snapshot.mechanic && <Telegraph mechanic={snapshot.mechanic} caster={snapshot.enemies.find((enemy) => enemy.id === snapshot.mechanic?.casterId)} />}
            {snapshot.enemies.map((enemy) => enemy.hp > 0 && <EnemyToken key={enemy.id} enemy={enemy} selected={snapshot.enemyTargetId === enemy.id} onClick={() => targetEnemy(enemy.id)} />)}
            {snapshot.companion.alive && <AllyToken ally={snapshot.companion} selected={snapshot.allyTargetId === "companion"} companion onClick={() => targetAlly("companion")} />}
            {snapshot.player.alive && <AllyToken ally={snapshot.player} selected={snapshot.allyTargetId === "player"} onClick={() => targetAlly("player")} />}
            {snapshot.floaters.map((floater) => <text key={floater.id} x={floater.x} y={floater.y} className={`pt-floater ${floater.kind}`} textAnchor="middle" opacity={Math.max(0, 1 - floater.age / 1.15)}>{floater.value}</text>)}
          </svg>
          {snapshot.paused && <div className="pt-pause-card"><span>Combat paused</span><button onClick={() => { engineRef.current.paused = false; sync(); }}>Return to battle</button></div>}
          {showHelp && <div className="pt-combat-help"><button aria-label="Close combat help" onClick={() => setShowHelp(false)}>×</button><strong>Raid controls</strong><span>Move: WASD / arrows · Dodge: Space</span><span>Enemy target: click or Tab · Ally target: frames or F1/F2</span><span>Watch the cast bar and leave red telegraphs before they resolve.</span></div>}
        </div>
      </div>
    </div>
    <div className="pt-combat-footer revised"><div className="pt-combat-message"><span className="pt-pulse-dot"/>{snapshot.message}</div><div className="pt-hotbar"><AbilityButton hotkey="1" name="Wayfarer Strike" detail={`${damage} damage · enemy`} cooldown={snapshot.cooldowns.strike} maxCooldown={.72} onClick={() => castAbility("strike")} tone="attack"/><AbilityButton hotkey="2" name="Focused Bolt" detail="12 focus · enemy" cooldown={snapshot.cooldowns.bolt} maxCooldown={1.45} onClick={() => castAbility("bolt")} tone="attack"/><AbilityButton hotkey="3" name="Mend" detail="18 focus · ally" cooldown={snapshot.cooldowns.mend} maxCooldown={.9} onClick={() => castAbility("mend")} tone="heal"/><AbilityButton hotkey="4" name="Aegis" detail="24 focus · ally" cooldown={snapshot.cooldowns.aegis} maxCooldown={5.5} onClick={() => castAbility("aegis")} tone="heal"/><AbilityButton hotkey="Space" name="Quickstep" detail="Dodge mechanic" cooldown={snapshot.cooldowns.dodge} maxCooldown={3.1} onClick={dodge}/><button className="pt-ability pt-tonic" disabled={!tonics} onClick={consumeTonic}><kbd>Q</kbd><strong>Village Tonic</strong><span>{tonics} left · self</span></button></div><div className="pt-dual-target"><div><span>Enemy target · Tab</span><strong>{selectedEnemy?.name ?? "None"}</strong></div><div><span>Support target · F1/F2</span><strong>{selectedAlly.name}</strong></div></div></div>
  </section>;
}

function PartyFrame({ ally, selected, hotkey, onClick, mana }: { ally: Ally; selected: boolean; hotkey: string; onClick: () => void; mana?: number }) {
  return <button className={`pt-party-frame ${selected ? "selected" : ""} ${!ally.alive ? "down" : ""}`} onClick={onClick} disabled={!ally.alive}><div className="pt-party-portrait">{ally.name.slice(0, 1)}<em>{hotkey}</em></div><div><span>{ally.role}</span><strong>{ally.name}</strong><i className="health"><b style={{ width: `${ally.hp / ally.maxHp * 100}%` }}/><em>{Math.ceil(ally.hp)} / {ally.maxHp}</em></i>{mana !== undefined && <i className="focus"><b style={{ width: `${mana}%` }}/></i>}{ally.shield > 0 && <small>◇ {Math.ceil(ally.shield)} ward</small>}</div></button>;
}

function EnemyToken({ enemy, selected, onClick }: { enemy: Enemy; selected: boolean; onClick: () => void }) {
  return <g className={`pt-enemy pt-enemy-${enemy.kind} ${selected ? "is-targeted" : ""}`} transform={`translate(${enemy.x} ${enemy.y})`} onClick={onClick} role="button" tabIndex={0}>{selected && <><circle className="pt-target-ring" r={enemy.kind === "warden" ? 43 : 32}/><path className="pt-target-arrows" d="M-45 0l9-6v12zm90 0-9-6v12z"/></>}<circle className="pt-enemy-body" r={enemy.kind === "warden" ? 34 : 24}/>{enemy.kind === "boar" && <path d="M-18-9l-15-10 7 19m44-9 15-10-7 19M-9 6l9 6 9-6"/>}{enemy.kind === "mireling" && <path d="M-17-8Q0-37 17-8M-13 14Q0 27 13 14M-9-3h3m12 0h3"/>}{enemy.kind === "warden" && <path d="M-20-14L0-35l20 21-7 31L0 30l-13-13zm20-4v32M-8-4h16"/>}<g className="pt-enemy-hp"><rect x={enemy.kind === "warden" ? -45 : -34} y={enemy.kind === "warden" ? -54 : -43} width={enemy.kind === "warden" ? 90 : 68} height="7" rx="3"/><rect className="fill" x={enemy.kind === "warden" ? -45 : -34} y={enemy.kind === "warden" ? -54 : -43} width={(enemy.kind === "warden" ? 90 : 68) * enemy.hp / enemy.maxHp} height="7" rx="3"/></g></g>;
}

function AllyToken({ ally, selected, companion, onClick }: { ally: Ally; selected: boolean; companion?: boolean; onClick: () => void }) {
  return <g className={`pt-ally-token ${companion ? "companion" : "player"} ${selected ? "support-target" : ""}`} transform={`translate(${ally.x} ${ally.y})`} onClick={onClick} role="button" tabIndex={0}>{selected && <circle className="pt-support-ring" r="33"/>}{ally.shield > 0 && <circle className="pt-shield-ring" r="28"/>}{!companion && <circle r="43" fill="url(#healerGlow)"/>}<circle className="body" r={companion ? 23 : 21}/>{companion ? <path d="M0-16l13 8-4 19-9 7-9-7-4-19zM-7-3h14"/> : <path d="M0-16l8 14-8 17-8-17zM0-9v18"/>}<text x="0" y="43" textAnchor="middle">{companion ? "ALLY" : "YOU"}</text></g>;
}

function Telegraph({ mechanic, caster }: { mechanic: Mechanic; caster?: Enemy }) {
  const pulse = mechanic.remaining / mechanic.duration;
  if (mechanic.kind === "raidwide") return <g className="pt-telegraph raidwide"><rect x="6" y="6" width={ARENA_W - 12} height={ARENA_H - 12} rx="14" style={{ opacity: .18 + (1 - pulse) * .3 }}/><text x={ARENA_W / 2} y="55" textAnchor="middle">PARTY-WIDE DAMAGE</text></g>;
  if (mechanic.kind === "circle" || mechanic.kind === "cleave") return <g className="pt-telegraph circle"><circle cx={mechanic.x} cy={mechanic.y} r={mechanic.radius}/><circle className="countdown" cx={mechanic.x} cy={mechanic.y} r={mechanic.radius * pulse}/><path d={`M${mechanic.x - 10} ${mechanic.y}h20M${mechanic.x} ${mechanic.y - 10}v20`}/></g>;
  const start = caster ?? { x: mechanic.x, y: mechanic.y }; const dx = mechanic.endX - start.x; const dy = mechanic.endY - start.y; const length = Math.hypot(dx, dy); const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return <g className="pt-telegraph line" transform={`translate(${start.x} ${start.y}) rotate(${angle})`}><rect x="0" y={-mechanic.width / 2} width={length + 180} height={mechanic.width}/><rect className="countdown" x="0" y={-mechanic.width / 2 * pulse} width={length + 180} height={mechanic.width * pulse}/><path d={`M${length + 145}-12l24 12-24 12`}/></g>;
}

function AbilityButton({ hotkey, name, detail, cooldown, maxCooldown, onClick, tone }: { hotkey: string; name: string; detail: string; cooldown: number; maxCooldown: number; onClick: () => void; tone?: "attack" | "heal" }) {
  return <button className={`pt-ability ${tone ? `pt-ability-${tone}` : ""}`} disabled={cooldown > 0} onClick={onClick}><kbd>{hotkey}</kbd><strong>{name}</strong><span>{cooldown > 0 ? `${cooldown.toFixed(1)}s` : detail}</span>{cooldown > 0 && <i style={{ height: `${Math.min(100, cooldown / maxCooldown * 100)}%` }}/>}</button>;
}
