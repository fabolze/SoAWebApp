import { useCallback, useEffect, useRef, useState } from "react";
import { playSfx } from "./audio";
import { COMBAT_PATHS, type CombatRole, type CombatSpec, type LocationId } from "./content";
import type { AutoAttackProfile, EquipmentEffects } from "./runtime";
import { mechanicSequence, pointInSector, pointToSegmentDistance, rayToArenaEdge, type MechanicKind } from "./combatMath";

type AllyId = "player" | "companion";
type EnemyKind = "boar" | "mireling" | "warden";
type EventTone = "neutral" | "player" | "ally" | "enemy" | "success" | "danger";
type EffectKind = "slash" | "bolt" | "heal" | "shield" | "impact" | "danger-impact" | "dodge" | "companion-shot";

type Ally = {
  id: AllyId;
  name: string;
  role: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  armor: number;
  alive: boolean;
  hitFlash: number;
};

type Enemy = {
  id: string;
  name: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  attackCd: number;
  windup: number;
  windupDuration: number;
  attackTargetId: AllyId | null;
  engageX: number;
  engageY: number;
  hitFlash: number;
};

type Mechanic = {
  id: number;
  name: string;
  kind: MechanicKind;
  casterId: string;
  targetId: AllyId;
  targetName: string;
  instruction: string;
  duration: number;
  remaining: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  endX: number;
  endY: number;
  angle: number;
  radius: number;
  width: number;
  damage: number;
};

type Floater = { id: number; x: number; y: number; value: string; kind: "damage" | "heal" | "shield" | "status"; age: number };
type CombatEffect = { id: number; kind: EffectKind; x: number; y: number; endX: number; endY: number; age: number; duration: number };
type CombatEvent = { id: number; time: number; tone: EventTone; text: string };
type CombatFeedback = { id: number; tone: EventTone; title: string; detail: string; age: number; duration: number };

type Engine = {
  player: Ally & { mana: number; maxMana: number };
  companion: Ally & { attackDamage: number; attackRange: number; attackInterval: number; support: boolean };
  enemies: Enemy[];
  cooldowns: Record<string, number>;
  time: number;
  started: boolean;
  ended: boolean;
  paused: boolean;
  result: "victory" | "defeat" | null;
  companionAttackCd: number;
  companionSupportCd: number;
  playerAttackCd: number;
  passiveHealCd: number;
  nextMechanic: number;
  mechanicIndex: number;
  mechanic: Mechanic | null;
  floaters: Floater[];
  effects: CombatEffect[];
  events: CombatEvent[];
  feedback: CombatFeedback | null;
  serial: number;
};

type Snapshot = Engine & { message: string; enemyTargetId: string | null; allyTargetId: AllyId };

const ARENA_W = 900;
const ARENA_H = 500;
const CLEAVE_HALF_ANGLE = Math.PI / 3;
const ENCOUNTER_HEALTH_SCALE = 2.35;
const ENEMY_DAMAGE_SCALE = .82;

function enemiesFor(location: LocationId): Enemy[] {
  const enemies: Enemy[] = location === "forest" ? [
    { id: "boar-a", name: "Panicked Forest Boar", kind: "boar", x: 690, y: 175, hp: 96, maxHp: 96, speed: 38, damage: 10, range: 54, attackCd: 1.1, windup: 0, windupDuration: .62, attackTargetId: null, engageX: 40, engageY: -18, hitFlash: 0 },
    { id: "boar-b", name: "Frightened Young Boar", kind: "boar", x: 750, y: 335, hp: 68, maxHp: 68, speed: 44, damage: 8, range: 50, attackCd: 1.8, windup: 0, windupDuration: .55, attackTargetId: null, engageX: 38, engageY: 24, hitFlash: 0 },
  ] : location === "swamp" ? [
    { id: "mire-a", name: "Shadow-Touched Channeler", kind: "mireling", x: 700, y: 145, hp: 110, maxHp: 110, speed: 28, damage: 12, range: 62, attackCd: 1.0, windup: 0, windupDuration: .85, attackTargetId: null, engageX: 46, engageY: -24, hitFlash: 0 },
    { id: "mire-b", name: "Marsh Shadow", kind: "mireling", x: 745, y: 350, hp: 135, maxHp: 135, speed: 31, damage: 14, range: 58, attackCd: 1.7, windup: 0, windupDuration: .78, attackTargetId: null, engageX: 42, engageY: 27, hitFlash: 0 },
  ] : [{ id: "warden", name: "Riftwatch Warden", kind: "warden", x: 710, y: 250, hp: 410, maxHp: 410, speed: 23, damage: 17, range: 70, attackCd: 1.25, windup: 0, windupDuration: .95, attackTargetId: null, engageX: 58, engageY: 0, hitFlash: 0 }];
  return enemies.map((enemy) => {
    const scaledHealth = Math.round(enemy.maxHp * ENCOUNTER_HEALTH_SCALE);
    return { ...enemy, hp: scaledHealth, maxHp: scaledHealth };
  });
}

function initialEngine(location: LocationId, playerName: string, maxHp: number, currentHp: number, armor: number, combatRole: CombatRole, combatSpec: CombatSpec, startingWard: number): Engine {
  const supportCompanion = combatRole === "tank";
  const path = COMBAT_PATHS.find((entry) => entry.id === combatSpec);
  return {
    player: { id: "player", name: playerName, role: `${path?.name ?? "Wayfarer"} · You`, x: 190, y: 300, hp: Math.min(maxHp, currentHp), maxHp, shield: startingWard, armor, alive: true, mana: 100, maxMana: 100, hitFlash: 0 },
    companion: { id: "companion", name: "Nessa Reed", role: supportCompanion ? "Scout · Lifebinder" : "Scout · Vanguard", x: 255, y: 235, hp: supportCompanion ? 145 : 190, maxHp: supportCompanion ? 145 : 190, shield: combatRole === "healer" ? startingWard : 0, armor: supportCompanion ? 2 : 5, alive: true, hitFlash: 0, attackDamage: supportCompanion ? 7 : 10, attackRange: supportCompanion ? 420 : 95, attackInterval: supportCompanion ? 1.9 : 1.35, support: supportCompanion },
    enemies: enemiesFor(location),
    cooldowns: { strike: 0, bolt: 0, mend: 0, aegis: 0, dodge: 0 },
    time: 0,
    started: false,
    ended: false,
    paused: true,
    result: null,
    companionAttackCd: .8,
    companionSupportCd: 3.8,
    playerAttackCd: .35,
    passiveHealCd: 5,
    nextMechanic: 6.2,
    mechanicIndex: 0,
    mechanic: null,
    floaters: [],
    effects: [],
    events: [{ id: 0, time: 0, tone: "neutral", text: "Encounter ready. Review the plan before engaging." }],
    feedback: null,
    serial: 2,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function encounterTitle(location: LocationId) {
  return location === "ruins" ? "The Forbidden Portal" : location === "swamp" ? "Whispers in Morrowfen" : "Unrest in Gloamwood";
}

function targetInstruction(kind: MechanicKind) {
  if (kind === "raidwide") return "PREPARE";
  if (kind === "cleave") return "GET BEHIND";
  return "MOVE";
}

function mechanicHits(mechanic: Mechanic, ally: Ally) {
  if (!ally.alive) return false;
  if (mechanic.kind === "raidwide") return true;
  if (mechanic.kind === "circle") return distance(ally, { x: mechanic.targetX, y: mechanic.targetY }) <= mechanic.radius;
  if (mechanic.kind === "cleave") return pointInSector(ally, { x: mechanic.originX, y: mechanic.originY }, mechanic.angle, mechanic.radius, CLEAVE_HALF_ANGLE);
  return pointToSegmentDistance(ally, { x: mechanic.originX, y: mechanic.originY }, { x: mechanic.endX, y: mechanic.endY }) <= mechanic.width / 2;
}

export default function CombatArena({ location, playerName, maxHp, currentHp, damage, armor, speedBonus, autoAttack, combatRole, combatSpec, healingMultiplier, wardMultiplier, startingWard, mechanicDamageMultiplier, passiveHealing, itemEffects, tonicHeal, tonics, onUseTonic, onVictory, onDefeat, onFlee }: {
  location: LocationId;
  playerName: string;
  maxHp: number;
  currentHp: number;
  damage: number;
  armor: number;
  speedBonus: boolean;
  autoAttack: AutoAttackProfile;
  combatRole: CombatRole;
  combatSpec: CombatSpec;
  healingMultiplier: number;
  wardMultiplier: number;
  startingWard: number;
  mechanicDamageMultiplier: number;
  passiveHealing: number;
  itemEffects: EquipmentEffects;
  tonicHeal: number;
  tonics: number;
  onUseTonic: () => boolean;
  onVictory: (remainingHp: number) => void;
  onDefeat: () => void;
  onFlee: (remainingHp: number) => void;
}) {
  const engineRef = useRef<Engine>(initialEngine(location, playerName, maxHp, currentHp, armor, combatRole, combatSpec, startingWard));
  const keysRef = useRef(new Set<string>());
  const enemyTargetRef = useRef<string | null>(engineRef.current.enemies[0]?.id ?? null);
  const allyTargetRef = useRef<AllyId>("companion");
  const messageRef = useRef(combatRole === "tank" ? "You have the vanguard. Nessa will attack and restore you from range." : `Nessa has the vanguard. Your ${autoAttack.label.toLowerCase()} begins as soon as its target is in range.`);
  const [snapshot, setSnapshot] = useState<Snapshot>({ ...engineRef.current, message: messageRef.current, enemyTargetId: enemyTargetRef.current, allyTargetId: allyTargetRef.current });
  const [showHelp, setShowHelp] = useState(false);

  const sync = useCallback(() => {
    const e = engineRef.current;
    setSnapshot({
      ...e,
      player: { ...e.player },
      companion: { ...e.companion },
      enemies: e.enemies.map((enemy) => ({ ...enemy })),
      cooldowns: { ...e.cooldowns },
      mechanic: e.mechanic ? { ...e.mechanic } : null,
      floaters: e.floaters.map((floater) => ({ ...floater })),
      effects: e.effects.map((effect) => ({ ...effect })),
      events: e.events.map((event) => ({ ...event })),
      feedback: e.feedback ? { ...e.feedback } : null,
      message: messageRef.current,
      enemyTargetId: enemyTargetRef.current,
      allyTargetId: allyTargetRef.current,
    });
  }, []);

  const pushEvent = useCallback((tone: EventTone, text: string) => {
    const e = engineRef.current;
    e.events = [{ id: e.serial++, time: e.time, tone, text }, ...e.events].slice(0, 7);
  }, []);

  const showFeedback = useCallback((tone: EventTone, title: string, detail: string, duration = 1.65) => {
    const e = engineRef.current;
    e.feedback = { id: e.serial++, tone, title, detail, age: 0, duration };
    messageRef.current = `${title} · ${detail}`;
  }, []);

  const addEffect = useCallback((kind: EffectKind, start: { x: number; y: number }, end = start, duration = .45) => {
    const e = engineRef.current;
    e.effects.push({ id: e.serial++, kind, x: start.x, y: start.y, endX: end.x, endY: end.y, age: 0, duration });
  }, []);

  const addFloater = useCallback((unit: { x: number; y: number }, value: string, kind: Floater["kind"]) => {
    const e = engineRef.current;
    e.floaters.push({ id: e.serial++, x: unit.x, y: unit.y - 42, value, kind, age: 0 });
  }, []);

  const livingEnemies = useCallback(() => engineRef.current.enemies.filter((enemy) => enemy.hp > 0), []);

  const startBattle = useCallback(() => {
    const e = engineRef.current;
    if (e.started || e.ended) return;
    e.started = true;
    e.paused = false;
    e.nextMechanic = e.time + 6.5;
    messageRef.current = `Battle started. ${autoAttack.label} is active; manual abilities remain under your control.`;
    pushEvent("neutral", `Battle started. ${autoAttack.label} will repeat every ${autoAttack.interval.toFixed(1)}s in range.`);
    if (itemEffects.labels.length) pushEvent("player", `Equipment powers active: ${itemEffects.labels.join(" · ")}.`);
    showFeedback("player", "ENGAGE", `${autoAttack.style === "ranged" ? "Keep your distance" : "Close to melee"} · use abilities between auto-attacks`, 2.1);
    playSfx("confirm");
    sync();
  }, [autoAttack, itemEffects.labels, pushEvent, showFeedback, sync]);

  const finishVictory = useCallback(() => {
    const e = engineRef.current;
    if (e.result || e.enemies.some((enemy) => enemy.hp > 0)) return;
    e.ended = true;
    e.result = "victory";
    pushEvent("success", "All hostiles defeated. The path is clear.");
    showFeedback("success", "VICTORY", "Your party survives the encounter", 3);
    playSfx("victory");
    window.setTimeout(() => onVictory(e.player.hp), 1500);
  }, [onVictory, pushEvent, showFeedback]);

  const damageAlly = useCallback((ally: Ally, rawDamage: number, source: string, announce = true, isMechanic = false) => {
    if (!ally.alive) return 0;
    const e = engineRef.current;
    const roleScale = isMechanic && ally.id === "player" ? mechanicDamageMultiplier : 1;
    let amount = Math.max(2, Math.round(rawDamage * ENEMY_DAMAGE_SCALE * roleScale) - ally.armor);
    let absorbed = 0;
    if (ally.shield > 0) {
      absorbed = Math.min(ally.shield, amount);
      ally.shield -= absorbed;
      amount -= absorbed;
      if (absorbed) addFloater(ally, `${absorbed} blocked`, "shield");
    }
    if (amount > 0) {
      ally.hp = Math.max(0, ally.hp - amount);
      ally.hitFlash = .28;
      addFloater(ally, `−${amount}`, "damage");
      addEffect("danger-impact", ally, ally, .38);
      playSfx("attack");
    }
    const result = absorbed ? `${amount} damage (${absorbed} warded)` : `${amount} damage`;
    pushEvent("danger", `${source} → ${ally.name}: ${result}.`);
    if (announce) showFeedback("danger", amount ? `−${amount} VIGOR` : "WARDED", `${source} hit ${ally.name}`);
    if (ally.hp <= 0) {
      ally.alive = false;
      if (ally.id === "player") {
        e.ended = true;
        e.result = "defeat";
        pushEvent("danger", "The Wayfarer fell. Nessa calls the retreat.");
        showFeedback("danger", "DEFEAT", "The search party carries you back to Hearthmere", 3);
        playSfx("defeat");
        window.setTimeout(onDefeat, 1500);
      } else {
        pushEvent("danger", "Nessa is down. Every hostile turns toward you.");
        showFeedback("danger", "NESSA IS DOWN", "You are now the vanguard", 2.4);
      }
    }
    return amount;
  }, [addEffect, addFloater, mechanicDamageMultiplier, onDefeat, pushEvent, showFeedback]);

  const healAlly = useCallback((ally: Ally, amount: number) => {
    if (!ally.alive) return 0;
    const actual = Math.min(amount, ally.maxHp - ally.hp);
    ally.hp += actual;
    if (actual) {
      addFloater(ally, `+${actual}`, "heal");
      addEffect("heal", ally, ally, .65);
    }
    return actual;
  }, [addEffect, addFloater]);

  const damageEnemy = useCallback((enemy: Enemy, amount: number, source: string, effect: EffectKind, prominent = true) => {
    if (enemy.hp <= 0) return;
    const e = engineRef.current;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.hitFlash = .24;
    addFloater(enemy, `−${amount}`, "damage");
    addEffect(effect, source === "Nessa" ? e.companion : e.player, enemy, effect === "bolt" ? .38 : .25);
    window.setTimeout(() => {
      if (engineRef.current.ended) return;
      addEffect("impact", enemy, enemy, .32);
    }, effect === "bolt" || effect === "companion-shot" ? 180 : 30);
    pushEvent(source === "Nessa" ? "ally" : "player", `${source} → ${enemy.name}: ${amount} damage.`);
    if (prominent) showFeedback("player", `−${amount} DAMAGE`, `${source} hit ${enemy.name}`);
    if (enemy.hp <= 0) {
      pushEvent("success", `${enemy.name} defeated.`);
      addFloater(enemy, "DEFEATED", "status");
      const remaining = e.enemies.filter((entry) => entry.hp > 0);
      if (enemyTargetRef.current === enemy.id) enemyTargetRef.current = remaining[0]?.id ?? null;
      finishVictory();
    }
  }, [addEffect, addFloater, finishVictory, pushEvent, showFeedback]);

  const targetEnemy = useCallback((id: string) => {
    const target = engineRef.current.enemies.find((enemy) => enemy.id === id && enemy.hp > 0);
    if (!target) return;
    enemyTargetRef.current = id;
    messageRef.current = `${target.name} selected as enemy target.`;
    playSfx("select");
    sync();
  }, [sync]);

  const targetAlly = useCallback((id: AllyId) => {
    const ally = id === "player" ? engineRef.current.player : engineRef.current.companion;
    if (!ally.alive) return;
    allyTargetRef.current = id;
    messageRef.current = `${ally.name} selected for support abilities.`;
    playSfx("select");
    sync();
  }, [sync]);

  const cycleEnemy = useCallback(() => {
    const living = livingEnemies();
    if (!living.length) return;
    const index = living.findIndex((enemy) => enemy.id === enemyTargetRef.current);
    targetEnemy(living[(index + 1) % living.length].id);
  }, [livingEnemies, targetEnemy]);

  const rejectAction = useCallback((title: string, detail: string) => {
    showFeedback("neutral", title, detail, 1.25);
    playSfx("select");
    sync();
  }, [showFeedback, sync]);

  const castAbility = useCallback((ability: "strike" | "bolt" | "mend" | "aegis") => {
    const e = engineRef.current;
    if (e.ended || e.paused || e.cooldowns[ability] > 0) return;
    if (ability === "mend" || ability === "aegis") {
      const ally = allyTargetRef.current === "player" ? e.player : e.companion;
      if (!ally.alive) {
        rejectAction("INVALID TARGET", "Select a living party member with F1 or F2");
        return;
      }
      const cost = ability === "mend" ? 18 : 24;
      if (e.player.mana < cost) {
        rejectAction("NOT ENOUGH FOCUS", `${cost} focus required`);
        return;
      }
      e.player.mana -= cost;
      if (ability === "mend") {
        const amount = Math.round((30 + damage * .6) * healingMultiplier);
        const restored = healAlly(ally, amount);
        if (!restored) {
          e.player.mana += cost;
          rejectAction("ALREADY AT FULL VIGOR", `${ally.name} does not need Mend`);
          return;
        }
        e.cooldowns.mend = .9;
        if (itemEffects.mendWard > 0) {
          const warded = Math.min(60 - ally.shield, itemEffects.mendWard);
          ally.shield += warded;
          if (warded > 0) addFloater(ally, `+${warded} ward`, "shield");
        }
        if (itemEffects.mendDamage > 0) {
          const enemy = e.enemies.find((entry) => entry.id === enemyTargetRef.current && entry.hp > 0) ?? livingEnemies()[0];
          if (enemy) damageEnemy(enemy, Math.max(1, Math.round(restored * itemEffects.mendDamage)), "Resonant Mend", "bolt", false);
        }
        pushEvent("player", `Mend → ${ally.name}: restored ${restored} vigor.`);
        showFeedback("success", `+${restored} VIGOR`, `Mend restored ${ally.name}`);
      } else {
        const amount = Math.round((30 + damage * .35) * wardMultiplier);
        const applied = Math.min(60 - ally.shield, amount);
        if (applied <= 0) {
          e.player.mana += cost;
          rejectAction("WARD AT CAPACITY", `${ally.name} already has maximum ward`);
          return;
        }
        ally.shield += applied;
        addFloater(ally, `+${applied} ward`, "shield");
        addEffect("shield", ally, ally, .75);
        e.cooldowns.aegis = 5.5;
        pushEvent("player", `Aegis → ${ally.name}: ${applied} ward.`);
        showFeedback("success", `+${applied} WARD`, `Aegis protected ${ally.name}`);
        if (itemEffects.aegisEcho > 0) {
          const other = ally.id === "player" ? e.companion : e.player;
          if (other.alive) {
            const echoed = Math.min(60 - other.shield, Math.round(applied * itemEffects.aegisEcho));
            other.shield += echoed;
            if (echoed > 0) addFloater(other, `+${echoed} echo`, "shield");
          }
        }
      }
      playSfx("heal");
      sync();
      return;
    }

    let target = e.enemies.find((enemy) => enemy.id === enemyTargetRef.current && enemy.hp > 0);
    if (!target) target = livingEnemies()[0];
    if (!target) return;
    enemyTargetRef.current = target.id;
    const range = ability === "strike" ? autoAttack.range : 470;
    const currentDistance = Math.round(distance(e.player, target));
    if (currentDistance > range) {
      rejectAction("OUT OF RANGE", `${target.name} is ${currentDistance} away · ${range} required`);
      return;
    }
    if (ability === "bolt" && e.player.mana < 12) {
      rejectAction("NOT ENOUGH FOCUS", "Focused Bolt requires 12 focus");
      return;
    }
    if (ability === "bolt") e.player.mana -= 12;
    const dealt = ability === "strike" ? damage : Math.round(damage * 1.18 + 6);
    e.cooldowns[ability] = ability === "strike" ? .72 : 1.45;
    damageEnemy(target, dealt, ability === "strike" ? (autoAttack.style === "ranged" ? "Weapon Shot" : "Wayfarer Strike") : "Focused Bolt", ability === "strike" && autoAttack.style === "melee" ? "slash" : "bolt");
    if (ability === "strike" && itemEffects.strikeCleave > 0) {
      for (const enemy of livingEnemies().filter((entry) => entry.id !== target.id)) {
        damageEnemy(enemy, Math.max(1, Math.round(dealt * itemEffects.strikeCleave)), "Oathsplitter", "slash", false);
      }
    }
    playSfx("attack");
    sync();
  }, [addEffect, addFloater, autoAttack, damage, damageEnemy, healAlly, healingMultiplier, itemEffects, livingEnemies, pushEvent, rejectAction, showFeedback, sync, wardMultiplier]);

  const dodge = useCallback(() => {
    const e = engineRef.current;
    if (e.ended || e.paused || e.cooldowns.dodge > 0) return;
    const start = { x: e.player.x, y: e.player.y };
    let dx = 0;
    let dy = 0;
    if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy -= 1;
    if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy += 1;
    if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx -= 1;
    if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx += 1;
    if (!dx && !dy) dx = -1;
    const length = Math.hypot(dx, dy);
    e.player.x = Math.max(28, Math.min(ARENA_W - 28, e.player.x + dx / length * 118));
    e.player.y = Math.max(28, Math.min(ARENA_H - 28, e.player.y + dy / length * 118));
    e.cooldowns.dodge = 3.1;
    if (itemEffects.dodgeWard > 0) {
      const warded = Math.min(60 - e.player.shield, itemEffects.dodgeWard);
      e.player.shield += warded;
      if (warded > 0) addFloater(e.player, `+${warded} roadward`, "shield");
    }
    addEffect("dodge", start, e.player, .42);
    showFeedback("player", "QUICKSTEP", "Repositioned 118 units", .9);
    pushEvent("player", "Quickstep repositioned the Wayfarer.");
    sync();
  }, [addEffect, addFloater, itemEffects.dodgeWard, pushEvent, showFeedback, sync]);

  const consumeTonic = useCallback(() => {
    const e = engineRef.current;
    if (!tonics) {
      rejectAction("NO TONICS", "Your pack is empty");
      return;
    }
    if (e.player.hp >= e.player.maxHp) {
      rejectAction("ALREADY AT FULL VIGOR", "Save the tonic for later");
      return;
    }
    if (!onUseTonic()) return;
    const restored = healAlly(e.player, tonicHeal);
    pushEvent("player", `Hearthmere Tonic restored ${restored} vigor.`);
    showFeedback("success", `+${restored} VIGOR`, "Hearthmere Tonic consumed");
    playSfx("heal");
    sync();
  }, [healAlly, onUseTonic, pushEvent, rejectAction, showFeedback, sync, tonicHeal, tonics]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "1", "2", "3", "4", "q", " ", "tab", "f1", "f2", "enter"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (key === "1") castAbility("strike");
      if (key === "2") castAbility("bolt");
      if (key === "3") castAbility("mend");
      if (key === "4") castAbility("aegis");
      if (key === "q") consumeTonic();
      if (key === " ") dodge();
      if (key === "tab") cycleEnemy();
      if (key === "f1") targetAlly("player");
      if (key === "f2") targetAlly("companion");
      if (key === "p") {
        if (engineRef.current.started) {
          engineRef.current.paused = !engineRef.current.paused;
          sync();
        }
      }
      if (key === "enter") startBattle();
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [castAbility, consumeTonic, cycleEnemy, dodge, startBattle, sync, targetAlly]);

  const startMechanic = useCallback(() => {
    const e = engineRef.current;
    const caster = livingEnemies()[0];
    if (!caster) return;
    const sequence = mechanicSequence(location);
    const spec = sequence[e.mechanicIndex % sequence.length];
    const target = e.mechanicIndex % 3 === 2 && e.companion.alive ? e.companion : e.player;
    e.mechanicIndex += 1;
    const lineEnd = spec.kind === "line" ? rayToArenaEdge(caster, target, ARENA_W, ARENA_H, 8) : target;
    e.mechanic = {
      id: e.serial++,
      name: spec.name,
      kind: spec.kind,
      casterId: caster.id,
      targetId: target.id,
      targetName: target.name,
      instruction: spec.instruction,
      duration: spec.duration * 1.3,
      remaining: spec.duration * 1.3,
      originX: caster.x,
      originY: caster.y,
      targetX: target.x,
      targetY: target.y,
      endX: lineEnd.x,
      endY: lineEnd.y,
      angle: Math.atan2(target.y - caster.y, target.x - caster.x),
      radius: spec.radius,
      width: spec.width,
      damage: spec.damage,
    };
    for (const enemy of e.enemies) {
      enemy.windup = 0;
      enemy.attackTargetId = null;
      enemy.attackCd = Math.max(enemy.attackCd, .8);
    }
    pushEvent("enemy", `${caster.name} casts ${spec.name} on ${target.name}.`);
    showFeedback("enemy", "INCOMING", `${spec.name} · ${spec.instruction}`, spec.duration * 1.3);
    playSfx("warning");
  }, [livingEnemies, location, pushEvent, showFeedback]);

  const resolveMechanic = useCallback((mechanic: Mechanic) => {
    const e = engineRef.current;
    const struck = [e.player, e.companion].filter((ally) => mechanicHits(mechanic, ally));
    if (mechanic.kind === "circle") addEffect("danger-impact", { x: mechanic.targetX, y: mechanic.targetY }, { x: mechanic.targetX, y: mechanic.targetY }, .55);
    const damageResults = struck.map((ally) => ({ ally, amount: damageAlly(ally, mechanic.damage, mechanic.name, false, true) }));
    if (!struck.length) {
      addFloater(e.player, "AVOIDED", "status");
      pushEvent("success", `${mechanic.name} avoided by the whole party.`);
      showFeedback("success", "AVOIDED", `${mechanic.name} hit nobody`, 1.8);
      playSfx("confirm");
    } else {
      pushEvent("enemy", `${mechanic.name} resolved on ${struck.map((ally) => ally.name).join(" and ")}.`);
      const total = damageResults.reduce((sum, result) => sum + result.amount, 0);
      const title = struck.length > 1 ? "PARTY HIT" : `${struck[0].id === "player" ? "YOU" : "NESSA"} HIT`;
      showFeedback("danger", title, `${mechanic.name} dealt ${total} total vigor`, 2.15);
    }
    e.mechanic = null;
    e.nextMechanic = e.time + (location === "ruins" ? 6.2 : 7.2);
  }, [addEffect, addFloater, damageAlly, location, pushEvent, showFeedback]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastSync = last;
    const tick = (now: number) => {
      const e = engineRef.current;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      if (!e.ended && !e.paused) {
        e.time += dt;
        for (const key of Object.keys(e.cooldowns)) e.cooldowns[key] = Math.max(0, e.cooldowns[key] - dt);
        e.player.mana = Math.min(e.player.maxMana, e.player.mana + dt * 7);
        e.player.hitFlash = Math.max(0, e.player.hitFlash - dt);
        e.companion.hitFlash = Math.max(0, e.companion.hitFlash - dt);
        for (const enemy of e.enemies) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        e.floaters.forEach((floater) => { floater.age += dt; floater.y -= dt * 19; });
        e.floaters = e.floaters.filter((floater) => floater.age < 1.35);
        e.effects.forEach((effect) => { effect.age += dt; });
        e.effects = e.effects.filter((effect) => effect.age < effect.duration);
        if (e.feedback) {
          e.feedback.age += dt;
          if (e.feedback.age >= e.feedback.duration) e.feedback = null;
        }

        let dx = 0;
        let dy = 0;
        if (keysRef.current.has("w") || keysRef.current.has("arrowup")) dy -= 1;
        if (keysRef.current.has("s") || keysRef.current.has("arrowdown")) dy += 1;
        if (keysRef.current.has("a") || keysRef.current.has("arrowleft")) dx -= 1;
        if (keysRef.current.has("d") || keysRef.current.has("arrowright")) dx += 1;
        if (dx || dy) {
          const length = Math.hypot(dx, dy);
          const speed = speedBonus ? 176 : 148;
          e.player.x = Math.max(25, Math.min(ARENA_W - 25, e.player.x + dx / length * speed * dt));
          e.player.y = Math.max(25, Math.min(ARENA_H - 25, e.player.y + dy / length * speed * dt));
        }

        const living = livingEnemies();
        const autoTarget = e.enemies.find((enemy) => enemy.id === enemyTargetRef.current && enemy.hp > 0) ?? living[0];
        if (autoTarget) {
          e.playerAttackCd -= dt;
          if (distance(e.player, autoTarget) <= autoAttack.range && e.playerAttackCd <= 0) {
            damageEnemy(autoTarget, autoAttack.damage, `${playerName}'s ${autoAttack.label}`, autoAttack.style === "ranged" ? "bolt" : "slash", false);
            e.playerAttackCd = autoAttack.interval;
          }
        }

        if (e.companion.alive && living.length) {
          const target = living[0];
          const targetDistance = distance(e.companion, target);
          e.companionAttackCd -= dt;
          if (targetDistance > e.companion.attackRange) {
            e.companion.x += (target.x - e.companion.x) / targetDistance * 48 * dt;
            e.companion.y += (target.y - e.companion.y) / targetDistance * 48 * dt;
          } else if (e.companionAttackCd <= 0) {
            damageEnemy(target, e.companion.attackDamage, "Nessa", "companion-shot", false);
            e.companionAttackCd = e.companion.attackInterval;
          }
          if (e.companion.support) {
            e.companionSupportCd -= dt;
            const supportTarget = [e.player, e.companion].filter((ally) => ally.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
            if (supportTarget && supportTarget.hp / supportTarget.maxHp < .8 && e.companionSupportCd <= 0) {
              const restored = healAlly(supportTarget, 15);
              pushEvent("ally", `Nessa's Field Mend restored ${restored} vigor to ${supportTarget.name}.`);
              e.companionSupportCd = 5.6;
            }
          }
        }

        if (passiveHealing > 0) {
          e.passiveHealCd -= dt;
          if (e.passiveHealCd <= 0) {
            const restored = [healAlly(e.player, passiveHealing), healAlly(e.companion, passiveHealing)].reduce((sum, value) => sum + value, 0);
            if (restored) pushEvent("player", `Living Current restored ${restored} total party vigor.`);
            e.passiveHealCd = 6;
          }
        }

        for (const enemy of livingEnemies()) {
          enemy.attackCd -= dt;
          if (e.mechanic) continue;
          if (enemy.windup > 0) {
            enemy.windup -= dt;
            if (enemy.windup <= 0) {
              const target = enemy.attackTargetId === "player" ? e.player : e.companion;
              const stillInRange = target.alive && distance(enemy, target) <= enemy.range + 24;
              if (stillInRange) {
                damageAlly(target, enemy.damage, enemy.kind === "boar" ? `${enemy.name}'s Gore` : enemy.kind === "warden" ? "Warden Claw" : "Shadow Lash");
              } else {
                addFloater(target, "EVADED", "status");
                pushEvent("success", `${target.name} evaded ${enemy.name}'s basic attack.`);
              }
              enemy.attackTargetId = null;
              enemy.attackCd = enemy.kind === "warden" ? 2.4 : 2.05;
            }
            continue;
          }
          const target: Ally = combatRole === "tank" ? e.player : e.companion.alive ? e.companion : e.player;
          const desired = { x: target.x + enemy.engageX, y: target.y + enemy.engageY };
          const desiredDistance = distance(enemy, desired);
          const targetDistance = distance(enemy, target);
          if (desiredDistance > 10 || targetDistance > enemy.range + 12) {
            const moveDistance = Math.max(1, desiredDistance);
            enemy.x += (desired.x - enemy.x) / moveDistance * enemy.speed * dt;
            enemy.y += (desired.y - enemy.y) / moveDistance * enemy.speed * dt;
          } else if (enemy.attackCd <= 0) {
            enemy.attackTargetId = target.id;
            enemy.windup = enemy.windupDuration;
            messageRef.current = `${enemy.name} prepares an attack on ${target.name}.`;
          }
        }

        if (!e.mechanic && e.time >= e.nextMechanic && livingEnemies().length) startMechanic();
        if (e.mechanic) {
          e.mechanic.remaining -= dt;
          if (e.mechanic.remaining <= 0) resolveMechanic(e.mechanic);
        }
      }
      if (now - lastSync > 40) {
        lastSync = now;
        sync();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [addFloater, autoAttack, combatRole, damageAlly, damageEnemy, healAlly, livingEnemies, passiveHealing, playerName, pushEvent, resolveMechanic, speedBonus, startMechanic, sync]);

  const selectedEnemy = snapshot.enemies.find((enemy) => enemy.id === snapshot.enemyTargetId) ?? snapshot.enemies.find((enemy) => enemy.hp > 0);
  const selectedAlly = snapshot.allyTargetId === "player" ? snapshot.player : snapshot.companion;
  const locationClass = location === "ruins" ? "is-ruins" : location === "swamp" ? "is-swamp" : "is-forest";
  const castProgress = snapshot.mechanic ? (1 - snapshot.mechanic.remaining / snapshot.mechanic.duration) * 100 : 0;
  const targetDistance = selectedEnemy ? Math.round(distance(snapshot.player, selectedEnemy)) : 0;
  const weaponReady = Boolean(selectedEnemy && targetDistance <= autoAttack.range);
  const playerInDanger = Boolean(snapshot.mechanic && mechanicHits(snapshot.mechanic, snapshot.player));
  const companionInDanger = Boolean(snapshot.mechanic && mechanicHits(snapshot.mechanic, snapshot.companion));
  const remainingEnemies = snapshot.enemies.filter((enemy) => enemy.hp > 0).length;
  const strikeReason = !selectedEnemy ? "No enemy target" : weaponReady ? `${damage} damage · ${autoAttack.range} range` : `Move ${Math.max(0, targetDistance - autoAttack.range)} closer`;
  const boltReason = !selectedEnemy ? "No enemy target" : targetDistance > 470 ? `Move ${targetDistance - 470} closer` : snapshot.player.mana < 12 ? "Need 12 focus" : "12 focus · 470 range";
  const mendReason = !selectedAlly.alive ? "Target is down" : selectedAlly.hp >= selectedAlly.maxHp ? `${selectedAlly.name} is at full vigor` : snapshot.player.mana < 18 ? "Need 18 focus" : "18 focus · support";
  const aegisReason = !selectedAlly.alive ? "Target is down" : selectedAlly.shield >= 60 ? "Ward is at capacity" : snapshot.player.mana < 24 ? "Need 24 focus" : "24 focus · support";

  return <section className={`pt-combat ${locationClass}`} aria-label="Party combat arena">
    <div className="pt-combat-topbar">
      <div><span className="pt-kicker">Party encounter · Real-time tactics</span><h2>{encounterTitle(location)}</h2></div>
      <div className="pt-combat-build"><span><b>{COMBAT_PATHS.find((path) => path.id === combatSpec)?.name}</b> path</span><span><b>{autoAttack.damage} / {autoAttack.interval}s</b> auto</span><span><b>{armor}</b> armor</span><span title={itemEffects.labels.join(" · ")}><b>{itemEffects.labels.length}</b> gear powers</span><span><b>{Math.ceil(snapshot.time)}s</b> elapsed</span></div>
      <div className="pt-combat-actions"><button onClick={() => setShowHelp((value) => !value)}>Guide</button><button disabled={!snapshot.started} onClick={() => { engineRef.current.paused = !engineRef.current.paused; sync(); }}>{snapshot.paused && snapshot.started ? "Resume" : "Pause"}</button>{location !== "ruins" && <button onClick={() => onFlee(snapshot.player.hp)}>Flee</button>}</div>
    </div>

    <div className="pt-raid-layout">
      <aside className="pt-party-frames">
        <span className="pt-kicker">Party · support target</span>
        <PartyFrame ally={snapshot.companion} selected={snapshot.allyTargetId === "companion"} hotkey="F2" onClick={() => targetAlly("companion")} />
        <PartyFrame ally={snapshot.player} selected={snapshot.allyTargetId === "player"} hotkey="F1" onClick={() => targetAlly("player")} mana={snapshot.player.mana} />
        <EnemyIntent enemies={snapshot.enemies} player={snapshot.player} companion={snapshot.companion} focusPlayer={combatRole === "tank"}/>
        <div className="pt-combat-log"><header><span>What happened</span><i>Newest first</i></header>{snapshot.events.map((event) => <div key={event.id} className={`tone-${event.tone}`}><time>{event.time.toFixed(1)}</time><p>{event.text}</p></div>)}</div>
        <div className="pt-party-tip"><b>WASD</b> Move · <b>Space</b> Quickstep<br/><b>Tab</b> Enemy · <b>F1/F2</b> Support</div>
      </aside>

      <div className="pt-encounter-stage">
        <div className="pt-target-frame">
          <div><span>{selectedEnemy?.kind === "warden" ? "Boss target" : "Enemy target · Tab"}</span><strong>{selectedEnemy?.name ?? "Enemies defeated"}</strong></div>
          <i><b style={{ width: `${selectedEnemy ? selectedEnemy.hp / selectedEnemy.maxHp * 100 : 0}%` }}/></i>
          <em>{selectedEnemy ? `${Math.ceil(selectedEnemy.hp)} / ${selectedEnemy.maxHp}` : "0"}</em>
          <small className={weaponReady ? "ready" : "far"}>{selectedEnemy ? weaponReady ? `${autoAttack.label} active · ${targetDistance}` : `${autoAttack.label} waiting · move ${Math.max(0, targetDistance - autoAttack.range)} closer` : "Clear"}</small>
        </div>
        <div className={`pt-cast-frame ${snapshot.mechanic ? "active" : ""}`}>
          <span>{snapshot.mechanic ? `${snapshot.mechanic.name} → ${snapshot.mechanic.targetName}` : "No major enemy cast"}</span>
          <i><b style={{ width: `${castProgress}%` }}/></i>
          <strong>{snapshot.mechanic?.instruction ?? "Watch enemy windup bars for basic attacks"}</strong>
          <em>{snapshot.mechanic ? `${snapshot.mechanic.remaining.toFixed(1)}s` : ""}</em>
        </div>

        <div className="pt-combat-objective"><span><b>{remainingEnemies}</b> {remainingEnemies === 1 ? "hostile" : "hostiles"} remaining</span><span className={`pt-auto-readout ${weaponReady ? "safe" : "danger"}`}>AUTO · {!selectedEnemy ? "NO TARGET" : weaponReady ? snapshot.playerAttackCd <= 0 ? "READY" : `${snapshot.playerAttackCd.toFixed(1)}s` : "OUT OF RANGE"}</span><i/><span className={playerInDanger ? "danger" : "safe"}>YOU · {snapshot.mechanic ? playerInDanger ? "IN DANGER" : "SAFE" : combatRole === "tank" ? "VANGUARD" : "READY"}</span><span className={!snapshot.companion.alive || companionInDanger ? "danger" : "safe"}>NESSA · {!snapshot.companion.alive ? "DOWN" : snapshot.mechanic ? companionInDanger ? "IN DANGER" : "SAFE" : snapshot.companion.support ? "SUPPORT" : "VANGUARD"}</span></div>

        <div className={`pt-arena-wrap ${playerInDanger ? "player-in-danger" : ""} ${snapshot.player.hitFlash > 0 || snapshot.companion.hitFlash > 0 ? "is-impacting" : ""}`}>
          <svg className="pt-arena" viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} role="img" aria-label="Top-down party battlefield">
            <defs>
              <pattern id="arenaGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M7 48l9-12m22-19 6-9m10 39 10-6" stroke="currentColor" opacity=".08" strokeWidth="2"/></pattern>
              <radialGradient id="playerGlow"><stop offset="0" stopColor="#8be2b7" stopOpacity=".7"/><stop offset="1" stopColor="#4ba777" stopOpacity="0"/></radialGradient>
              <filter id="combatGlow"><feGaussianBlur stdDeviation="4"/></filter>
            </defs>
            <rect width={ARENA_W} height={ARENA_H} className="pt-arena-ground" rx="16"/><rect width={ARENA_W} height={ARENA_H} fill="url(#arenaGrid)" rx="16"/>
            {location === "ruins" && <g className="pt-ruin-ring"><circle cx="700" cy="250" r="140"/><circle cx="700" cy="250" r="101"/><path d="M700 82v50m0 236v50M532 250h50m236 0h50M580 130l38 38m164 164 38 38m0-240-38 38m-164 164-38 38"/></g>}
            {snapshot.mechanic && <Telegraph mechanic={snapshot.mechanic}/>}
            {snapshot.effects.map((effect) => <CombatEffectView key={effect.id} effect={effect}/>)}
            {snapshot.enemies.map((enemy) => enemy.hp > 0 && <EnemyToken key={enemy.id} enemy={enemy} selected={snapshot.enemyTargetId === enemy.id} onClick={() => targetEnemy(enemy.id)}/>) }
            {snapshot.companion.alive && (
              <AllyToken ally={snapshot.companion} selected={snapshot.allyTargetId === "companion"} companion onClick={() => targetAlly("companion")}/>
            )}
            {snapshot.player.alive && (
              <AllyToken ally={snapshot.player} selected={snapshot.allyTargetId === "player"} onClick={() => targetAlly("player")}/>
            )}
            {snapshot.floaters.map((floater) => <text key={floater.id} x={floater.x} y={floater.y} className={`pt-floater ${floater.kind}`} textAnchor="middle" opacity={Math.max(0, 1 - floater.age / 1.35)}>{floater.value}</text>)}
          </svg>

          {snapshot.mechanic && <div className={`pt-danger-callout kind-${snapshot.mechanic.kind}`}><span>{targetInstruction(snapshot.mechanic.kind)}</span><div><strong>{snapshot.mechanic.name}</strong><small>{snapshot.mechanic.instruction}</small></div><b>{snapshot.mechanic.remaining.toFixed(1)}</b></div>}
          {snapshot.feedback && <div key={snapshot.feedback.id} className={`pt-action-feedback tone-${snapshot.feedback.tone}`} style={{ "--feedback-life": `${snapshot.feedback.duration}s` } as React.CSSProperties}><strong>{snapshot.feedback.title}</strong><span>{snapshot.feedback.detail}</span></div>}
          {!snapshot.started && <div className="pt-combat-briefing"><span className="pt-kicker">Encounter plan · {COMBAT_PATHS.find((path) => path.id === combatSpec)?.name}</span><h3>Auto-attacks set the rhythm. You make the decisions.</h3><div><b>1</b><p><strong>{combatRole === "tank" ? "You hold the vanguard; Nessa supports." : "Nessa holds the vanguard."}</strong> {combatRole === "tank" ? "Enemies focus you while she attacks and automatically heals the most wounded ally." : "Enemies focus her while your active abilities shape the fight."}</p></div><div><b>2</b><p><strong>{autoAttack.label}: {autoAttack.damage} damage every {autoAttack.interval.toFixed(1)}s.</strong> It fires automatically whenever the selected target is within {autoAttack.range} range.</p></div><div><b>3</b><p><strong>Major attacks now give longer answers.</strong> Read the red ground, move or protect the target, then use abilities between weapon hits.</p></div><button onClick={startBattle}>Begin encounter <kbd>Enter</kbd></button></div>}
          {snapshot.paused && snapshot.started && <div className="pt-pause-card"><span>Combat paused</span><button onClick={() => { engineRef.current.paused = false; sync(); }}>Return to battle</button></div>}
          {snapshot.result && <div className={`pt-combat-result ${snapshot.result}`}><span>{snapshot.result === "victory" ? "Encounter cleared" : "Party defeated"}</span><strong>{snapshot.result === "victory" ? "VICTORY" : "DEFEAT"}</strong><p>{snapshot.result === "victory" ? "Rewards and progress are being recorded." : "Nessa calls the retreat to Hearthmere."}</p></div>}
          {showHelp && <div className="pt-combat-guide"><button aria-label="Close combat guide" onClick={() => setShowHelp(false)}>×</button><span className="pt-kicker">How to read the fight</span><h3>Every danger tells you its answer.</h3><div><b>Orange windup bar</b><p>A basic attack is about to hit its named target. Move away or protect them.</p></div><div><b>Red ground + MOVE</b><p>The exact highlighted geometry will deal damage when the timer reaches zero.</p></div><div><b>PREPARE</b><p>Party-wide damage cannot be dodged. Use Aegis before it lands and Mend afterward.</p></div><small>Actions and results are recorded in the combat log on the left.</small></div>}
        </div>
      </div>
    </div>

    <div className="pt-combat-footer revised">
      <div className="pt-combat-message"><span className="pt-pulse-dot"/>{snapshot.message}</div>
      <div className="pt-hotbar">
        <AbilityButton hotkey="1" name={autoAttack.style === "ranged" ? "Weapon Shot" : "Wayfarer Strike"} detail={strikeReason} cooldown={snapshot.cooldowns.strike} maxCooldown={.72} onClick={() => castAbility("strike")} tone="attack" ready={weaponReady}/>
        <AbilityButton hotkey="2" name="Focused Bolt" detail={boltReason} cooldown={snapshot.cooldowns.bolt} maxCooldown={1.45} onClick={() => castAbility("bolt")} tone="attack" ready={Boolean(selectedEnemy && targetDistance <= 470 && snapshot.player.mana >= 12)}/>
        <AbilityButton hotkey="3" name="Mend" detail={mendReason} cooldown={snapshot.cooldowns.mend} maxCooldown={.9} onClick={() => castAbility("mend")} tone="heal" ready={selectedAlly.alive && selectedAlly.hp < selectedAlly.maxHp && snapshot.player.mana >= 18}/>
        <AbilityButton hotkey="4" name="Aegis" detail={aegisReason} cooldown={snapshot.cooldowns.aegis} maxCooldown={5.5} onClick={() => castAbility("aegis")} tone="heal" ready={selectedAlly.alive && selectedAlly.shield < 60 && snapshot.player.mana >= 24}/>
        <AbilityButton hotkey="Space" name="Quickstep" detail="118 unit reposition" cooldown={snapshot.cooldowns.dodge} maxCooldown={3.1} onClick={dodge} ready={snapshot.cooldowns.dodge <= 0}/>
        <button className="pt-ability pt-tonic" disabled={!tonics} onClick={consumeTonic}><kbd>Q</kbd><strong>Hearthmere Tonic</strong><span>{tonics} left · +{tonicHeal}</span></button>
      </div>
      <div className="pt-dual-target"><div><span>Enemy · Tab</span><strong>{selectedEnemy?.name ?? "None"}</strong><small>{selectedEnemy ? `${targetDistance} units away` : "Encounter clear"}</small></div><div><span>Support · F1/F2</span><strong>{selectedAlly.name}</strong><small>{Math.ceil(selectedAlly.hp)} vigor · {Math.ceil(selectedAlly.shield)} ward</small></div></div>
    </div>
  </section>;
}

function EnemyIntent({ enemies, player, companion, focusPlayer }: { enemies: Enemy[]; player: Ally; companion: Ally; focusPlayer: boolean }) {
  const living = enemies.filter((enemy) => enemy.hp > 0);
  return <section className="pt-enemy-intent" aria-label="Enemy intent">
    <header><span>Enemy intent</span><i>{living.some((enemy) => enemy.windup > 0) ? "Incoming" : "Tracking"}</i></header>
    {living.map((enemy) => {
      const target = enemy.attackTargetId === "player" || (!enemy.attackTargetId && focusPlayer) || !companion.alive ? player : companion;
      const winding = enemy.windup > 0;
      const closing = !winding && distance(enemy, target) > enemy.range + 24;
      return <div key={enemy.id} className={winding ? "is-casting" : ""}><b>{enemy.kind === "boar" ? "♞" : enemy.kind === "warden" ? "◆" : "◈"}</b><p><strong>{enemy.name}</strong><span>{winding ? `ATTACK → ${target.id === "player" ? "YOU" : "NESSA"}` : closing ? `Closing on ${target.id === "player" ? "you" : "Nessa"}` : "Recovering"}</span></p>{winding ? <em>{enemy.windup.toFixed(1)}s</em> : <em className="quiet">{Math.max(0, enemy.attackCd).toFixed(1)}</em>}</div>;
    })}
  </section>;
}

function ActorSprite({ kind }: { kind: "player" | "companion" | EnemyKind }) {
  const source = kind === "player" ? "/playtest/combat-player.png" : kind === "companion" ? "/playtest/combat-nessa.png" : kind === "boar" ? "/playtest/combat-boar.png" : "/playtest/combat-warden.png";
  const size = kind === "warden" ? 118 : kind === "boar" ? 96 : 104;
  return <image className={`pt-actor-sprite sprite-${kind}`} href={source} x={-size / 2} y={-size * .68} width={size} height={size} preserveAspectRatio="xMidYMid meet" aria-hidden="true"/>;
}

function PartyFrame({ ally, selected, hotkey, onClick, mana }: { ally: Ally; selected: boolean; hotkey: string; onClick: () => void; mana?: number }) {
  return <button className={`pt-party-frame ${selected ? "selected" : ""} ${!ally.alive ? "down" : ""} ${ally.hitFlash > 0 ? "is-hit" : ""}`} onClick={onClick} disabled={!ally.alive}><div className={`pt-party-portrait ${ally.id === "companion" ? "portrait-nessa" : ""}`}>{ally.id === "player" ? ally.name.slice(0, 1) : ""}<em>{hotkey}</em></div><div><span>{ally.role}</span><strong>{ally.name}</strong><i className="health"><b style={{ width: `${ally.hp / ally.maxHp * 100}%` }}/><em>{Math.ceil(ally.hp)} / {ally.maxHp}</em></i>{mana !== undefined && <i className="focus"><b style={{ width: `${mana}%` }}/></i>}{ally.shield > 0 && <small>◇ {Math.ceil(ally.shield)} ward</small>}</div></button>;
}

function EnemyToken({ enemy, selected, onClick }: { enemy: Enemy; selected: boolean; onClick: () => void }) {
  const barWidth = enemy.kind === "warden" ? 104 : 82;
  return <g className={`pt-enemy pt-enemy-${enemy.kind} ${selected ? "is-targeted" : ""} ${enemy.hitFlash > 0 ? "is-hit" : ""}`} transform={`translate(${enemy.x} ${enemy.y})`} onClick={onClick} role="button" tabIndex={0}>
    <ellipse className="pt-actor-shadow" cx="0" cy="22" rx={enemy.kind === "warden" ? 34 : 27} ry="9"/>
    {selected && <><ellipse className="pt-target-marker" cx="0" cy="24" rx={enemy.kind === "warden" ? 45 : 36} ry={enemy.kind === "warden" ? 18 : 14}/><path className="pt-target-arrows" d="M-48 6l10-6v12zm96 0-10-6v12z"/></>}
    <ActorSprite kind={enemy.kind}/>
    <g className="pt-enemy-nameplate" transform={`translate(${-barWidth / 2} ${enemy.kind === "warden" ? -72 : -60})`}><text x={barWidth / 2} y="0" textAnchor="middle">{enemy.name}</text><rect y="7" width={barWidth} height="8" rx="2"/><rect className="fill" y="7" width={barWidth * enemy.hp / enemy.maxHp} height="8" rx="2"/>{enemy.windup > 0 && <><rect className="windup-track" y="19" width={barWidth} height="5" rx="1"/><rect className="windup-fill" y="19" width={barWidth * (1 - enemy.windup / enemy.windupDuration)} height="5" rx="1"/><text className="windup-label" x={barWidth / 2} y="34" textAnchor="middle">ATTACK → {enemy.attackTargetId === "player" ? "YOU" : "NESSA"}</text></>}</g>
  </g>;
}

function AllyToken({ ally, selected, companion, onClick }: { ally: Ally; selected: boolean; companion?: boolean; onClick: () => void }) {
  return <g className={`pt-ally-token ${companion ? "companion" : "player"} ${selected ? "support-target" : ""} ${ally.hitFlash > 0 ? "is-hit" : ""}`} transform={`translate(${ally.x} ${ally.y})`} onClick={onClick} role="button" tabIndex={0}>
    <ellipse className="pt-actor-shadow" cx="0" cy="23" rx="25" ry="8"/>
    {selected && <ellipse className="pt-support-marker" cx="0" cy="23" rx="34" ry="14"/>}
    {ally.shield > 0 && <path className="pt-shield-marker" d="M0-35 28-21 24 18 0 37-24 18-28-21Z"/>}
    {!companion && <ellipse rx="48" ry="42" fill="url(#playerGlow)"/>}
    <ActorSprite kind={companion ? "companion" : "player"}/>
    <g className="pt-ally-nameplate" transform="translate(-34 45)"><rect width="68" height="14" rx="3"/><text x="34" y="10" textAnchor="middle">{companion ? "NESSA" : "YOU"}</text></g>
  </g>;
}

function Telegraph({ mechanic }: { mechanic: Mechanic }) {
  const remainingRatio = mechanic.remaining / mechanic.duration;
  if (mechanic.kind === "raidwide") return <g className="pt-telegraph raidwide"><rect x="7" y="7" width={ARENA_W - 14} height={ARENA_H - 14} rx="14" style={{ opacity: .16 + (1 - remainingRatio) * .28 }}/><text x={ARENA_W / 2} y="72" textAnchor="middle">UNAVOIDABLE PARTY DAMAGE</text></g>;
  if (mechanic.kind === "circle") return <g className="pt-telegraph circle"><circle cx={mechanic.targetX} cy={mechanic.targetY} r={mechanic.radius}/><circle className="countdown" cx={mechanic.targetX} cy={mechanic.targetY} r={mechanic.radius * remainingRatio}/><path d={`M${mechanic.targetX - 11} ${mechanic.targetY}h22M${mechanic.targetX} ${mechanic.targetY - 11}v22`}/><text x={mechanic.targetX} y={mechanic.targetY - mechanic.radius - 12} textAnchor="middle">MOVE OUT · {mechanic.remaining.toFixed(1)}s</text></g>;
  if (mechanic.kind === "cleave") {
    const startAngle = mechanic.angle - CLEAVE_HALF_ANGLE;
    const endAngle = mechanic.angle + CLEAVE_HALF_ANGLE;
    const x1 = mechanic.originX + Math.cos(startAngle) * mechanic.radius;
    const y1 = mechanic.originY + Math.sin(startAngle) * mechanic.radius;
    const x2 = mechanic.originX + Math.cos(endAngle) * mechanic.radius;
    const y2 = mechanic.originY + Math.sin(endAngle) * mechanic.radius;
    const wedge = `M${mechanic.originX} ${mechanic.originY} L${x1} ${y1} A${mechanic.radius} ${mechanic.radius} 0 0 1 ${x2} ${y2} Z`;
    return <g className="pt-telegraph cleave"><path d={wedge}/><path className="countdown" d={wedge} style={{ transform: `scale(${.35 + .65 * remainingRatio})`, transformOrigin: `${mechanic.originX}px ${mechanic.originY}px` }}/><text x={mechanic.originX} y={mechanic.originY - mechanic.radius - 12} textAnchor="middle">GET BEHIND · {mechanic.remaining.toFixed(1)}s</text></g>;
  }
  const dx = mechanic.endX - mechanic.originX;
  const dy = mechanic.endY - mechanic.originY;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return <g className="pt-telegraph line" transform={`translate(${mechanic.originX} ${mechanic.originY}) rotate(${angle})`}><rect x="0" y={-mechanic.width / 2} width={length} height={mechanic.width}/><rect className="countdown" x="0" y={-mechanic.width / 2 * remainingRatio} width={length} height={mechanic.width * remainingRatio}/><path d={`M${Math.max(35, length - 30)}-11l22 11-22 11`}/><text x={Math.max(80, length / 2)} y={-mechanic.width / 2 - 11} textAnchor="middle" transform={`rotate(${-angle} ${Math.max(80, length / 2)} ${-mechanic.width / 2 - 11})`}>LEAVE LANE · {mechanic.remaining.toFixed(1)}s</text></g>;
}

function CombatEffectView({ effect }: { effect: CombatEffect }) {
  const progress = Math.min(1, effect.age / effect.duration);
  const opacity = Math.max(0, 1 - progress);
  if (effect.kind === "bolt" || effect.kind === "companion-shot") {
    const x = effect.x + (effect.endX - effect.x) * progress;
    const y = effect.y + (effect.endY - effect.y) * progress;
    return <g className={`pt-combat-fx ${effect.kind}`} opacity={opacity}><line x1={effect.x} y1={effect.y} x2={x} y2={y}/><circle cx={x} cy={y} r={effect.kind === "bolt" ? 8 : 5}/></g>;
  }
  if (effect.kind === "slash") {
    const angle = Math.atan2(effect.endY - effect.y, effect.endX - effect.x);
    const x = effect.endX - Math.cos(angle) * 25;
    const y = effect.endY - Math.sin(angle) * 25;
    return <g className="pt-combat-fx slash" opacity={opacity}><path d={`M${x - 18} ${y - 18}Q${x + 4} ${y - 4} ${x + 22} ${y + 20}`}/><path d={`M${x - 13} ${y - 23}Q${x + 9} ${y - 9} ${x + 27} ${y + 15}`}/></g>;
  }
  if (effect.kind === "dodge") return <g className="pt-combat-fx dodge" opacity={opacity}><line x1={effect.x} y1={effect.y} x2={effect.endX} y2={effect.endY}/><circle cx={effect.endX} cy={effect.endY} r={18 + progress * 18}/></g>;
  if (effect.kind === "shield") return <path className="pt-combat-fx shield" opacity={opacity} d={`M${effect.x} ${effect.y - 44 - progress * 8}l35 18-5 42-30 22-30-22-5-42Z`}/>;
  if (effect.kind === "heal") return <g className="pt-combat-fx heal" opacity={opacity}><circle cx={effect.x} cy={effect.y} r={18 + progress * 42}/><path d={`M${effect.x - 11} ${effect.y}h22M${effect.x} ${effect.y - 11}v22`}/></g>;
  return <g className={`pt-combat-fx ${effect.kind}`} opacity={opacity}><circle cx={effect.x} cy={effect.y} r={10 + progress * 31}/><path d={`M${effect.x - 30} ${effect.y}h60M${effect.x} ${effect.y - 30}v60M${effect.x - 21} ${effect.y - 21}l42 42m0-42-42 42`}/></g>;
}

function AbilityButton({ hotkey, name, detail, cooldown, maxCooldown, onClick, tone, ready }: { hotkey: string; name: string; detail: string; cooldown: number; maxCooldown: number; onClick: () => void; tone?: "attack" | "heal"; ready: boolean }) {
  return <button className={`pt-ability ${tone ? `pt-ability-${tone}` : ""} ${ready && cooldown <= 0 ? "is-ready" : ""}`} disabled={cooldown > 0} onClick={onClick}><kbd>{hotkey}</kbd><strong>{name}</strong><span>{cooldown > 0 ? `${cooldown.toFixed(1)}s cooldown` : ready ? detail : `Unavailable · ${detail}`}</span>{cooldown > 0 && <i style={{ height: `${Math.min(100, cooldown / maxCooldown * 100)}%` }}/>}</button>;
}
