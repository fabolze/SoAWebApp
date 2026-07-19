import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CombatArena from "./CombatArena";
import BossLab from "./BossLab";
import { COMBAT_PATHS, COMBAT_ROLES, DIALOGUES, INTRO_SLIDES, ITEMS, LOCATIONS, LORE, SHOP_STOCK, TALENTS, type CombatRole, type CombatSpec, type ItemDefinition, type LocationId } from "./content";
import { playSfx, setMusicScene, setMusicVolume, startMusic, stopMusic } from "./audio";
import {
  applyEncounterVictory,
  canTravelTo,
  canUnlockTalent,
  chooseCombatPath as selectCombatPath,
  createNewGame,
  equipItem,
  formatTime,
  gainXp,
  LEGACY_SAVE_KEY,
  loadGame,
  maxHealth,
  objectiveText,
  playerArmor,
  playerAutoAttack,
  playerDamage,
  playerHealingMultiplier,
  playerMechanicDamageMultiplier,
  playerStartingWard,
  playerWardMultiplier,
  passivePartyHealing,
  purchaseItem,
  removeItem,
  saveGame,
  SAVE_KEY,
  sellItem,
  tonicHealing,
  unequipItem,
  unlockTalent as learnTalent,
  type PlayState,
} from "./runtime";
import "./playtest.css";

type Screen = "title" | "intro" | "game" | "combat" | "boss-lab" | "ending";
type Panel = "journal" | "inventory" | "talents" | "lore" | "map" | null;
type DialogueKey = keyof typeof DIALOGUES;
type DialogueChoice = { label: string; next: string | null; action?: string };

function musicScene(screen: Screen, location: LocationId) {
  if (screen === "title") return "title" as const;
  if (screen === "intro") return "intro" as const;
  if (screen === "combat" || screen === "boss-lab") return "combat" as const;
  if (screen === "ending") return "ending" as const;
  return location === "village" ? "village" as const : "wilderness" as const;
}

export default function PlaytestPage() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("title");
  const [state, setState] = useState<PlayState>(() => createNewGame());
  const [introIndex, setIntroIndex] = useState(0);
  const [name, setName] = useState("Wayfarer");
  const [panel, setPanel] = useState<Panel>(null);
  const [dialogue, setDialogue] = useState<{ key: DialogueKey; node: string } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const [traveling, setTraveling] = useState<LocationId | null>(null);
  const [saveExists, setSaveExists] = useState(() => Boolean(loadGame()));

  useEffect(() => {
    if (screen === "game" || screen === "combat" || screen === "ending") {
      saveGame(state);
      setSaveExists(true);
    }
  }, [screen, state]);

  useEffect(() => {
    if (screen !== "game" && screen !== "combat") return;
    const timer = window.setInterval(() => setState((current) => ({ ...current, playSeconds: current.playSeconds + 1 })), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (musicOn) setMusicScene(musicScene(screen, state.location));
  }, [musicOn, screen, state.location]);

  useEffect(() => () => stopMusic(), []);

  useEffect(() => {
    if (screen !== "game" || traveling) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialogue(null);
        setShopOpen(false);
        setPanel(null);
        return;
      }
      if (dialogue || shopOpen) return;
      const shortcuts: Record<string, Exclude<Panel, null>> = { m: "map", j: "journal", i: "inventory", t: "talents", l: "lore" };
      const target = shortcuts[event.key.toLowerCase()];
      if (target) {
        event.preventDefault();
        playSfx("select");
        setPanel((current) => current === target ? null : target);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogue, screen, shopOpen, traveling]);

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2800);
  };

  const openPanel = (next: Exclude<Panel, null>) => {
    playSfx("select");
    setPanel(next);
  };

  const openDialogue = (key: DialogueKey) => {
    playSfx("select");
    setDialogue({ key, node: "start" });
  };

  const newGame = async () => {
    const fresh = createNewGame(name);
    setState(fresh);
    setIntroIndex(0);
    setScreen("intro");
    if (!musicOn) {
      await startMusic("intro");
      setMusicVolume(.12);
      setMusicOn(true);
    }
    playSfx("confirm");
  };

  const continueGame = async () => {
    const save = loadGame();
    if (!save) return;
    setState(save);
    setScreen(save.questStage === "complete" ? "ending" : "game");
    if (!musicOn) {
      await startMusic(save.questStage === "complete" ? "ending" : save.location === "village" ? "village" : "wilderness");
      setMusicVolume(.12);
      setMusicOn(true);
    }
    playSfx("confirm");
  };

  const toggleMusic = async () => {
    if (musicOn) {
      stopMusic();
      setMusicOn(false);
    } else {
      await startMusic(musicScene(screen, state.location));
      setMusicVolume(.12);
      setMusicOn(true);
      playSfx("confirm");
    }
  };

  const finishIntro = () => {
    playSfx("confirm");
    if (introIndex < INTRO_SLIDES.length - 1) setIntroIndex((value) => value + 1);
    else setScreen("game");
  };

  const travel = (target: LocationId) => {
    const check = canTravelTo(state, target);
    if (!check.allowed) {
      toast(check.reason ?? "That route is unavailable.");
      return;
    }
    setPanel(null);
    setTraveling(target);
    playSfx("travel");
    window.setTimeout(() => {
      const destination = LOCATIONS[target];
      setState((current) => ({
        ...current,
        location: target,
        dayMinutes: current.dayMinutes + destination.travelMinutes,
        health: Math.min(maxHealth(current), current.health + 8),
      }));
      setTraveling(null);
      toast(`Arrived at ${destination.name}`);
    }, 1250);
  };

  const winEncounter = (remainingHp: number) => {
    playSfx("victory");
    setState((current) => applyEncounterVictory({ ...current, health: remainingHp }, current.location));
    setScreen("game");
    toast(state.location === "ruins" ? "Iven found · portal fragment recovered" : "Encounter cleared · the trail continues");
  };

  const loseEncounter = () => {
    playSfx("defeat");
    setState((current) => ({ ...current, location: "village", health: maxHealth(current), gold: Math.max(0, current.gold - 10), dayMinutes: current.dayMinutes + 90 }));
    setScreen("game");
    toast("Nessa carried you home · 10 gold lost");
  };

  const fleeEncounter = (remainingHp: number) => {
    setState((current) => ({ ...current, location: current.location === "forest" ? "village" : "forest", health: Math.max(1, remainingHp), dayMinutes: current.dayMinutes + 20 }));
    setScreen("game");
    toast("You escaped the encounter");
  };

  const useTonic = (): boolean => {
    if (!(state.inventory.tonic ?? 0)) return false;
    setState((current) => removeItem(current, "tonic"));
    return true;
  };

  const equip = (itemId: string) => {
    const item = ITEMS[itemId];
    if (!item?.slot) return;
    setState((current) => equipItem(current, itemId));
    playSfx("equip");
    toast(`${item.name} equipped`);
  };

  const unequip = (slot: "weapon" | "armor" | "charm") => {
    setState((current) => unequipItem(current, slot));
    playSfx("equip");
    toast(`${slot[0].toUpperCase()}${slot.slice(1)} unequipped`);
  };

  const consumeOutsideCombat = () => {
    if (!(state.inventory.tonic ?? 0) || state.health >= maxHealth(state)) return;
    const healing = tonicHealing(state);
    setState((current) => {
      const next = removeItem(current, "tonic");
      return { ...next, health: Math.min(maxHealth(next), next.health + tonicHealing(next)) };
    });
    playSfx("heal");
    toast(`Restored ${healing} vigor`);
  };

  const buy = (itemId: string) => {
    const result = purchaseItem(state, itemId);
    if (result.reason) {
      toast(result.reason);
      return;
    }
    setState(result.state);
    playSfx("purchase");
    toast(`${ITEMS[itemId].name} added to your pack`);
  };

  const sell = (itemId: string) => {
    const result = sellItem(state, itemId);
    if (result.reason) {
      toast(result.reason);
      return;
    }
    setState(result.state);
    playSfx("purchase");
    toast(`Sold ${ITEMS[itemId].name} for ◆ ${result.value}`);
  };

  const unlockTalent = (talentId: string) => {
    const check = canUnlockTalent(state, talentId);
    if (!check.allowed) {
      toast(check.reason ?? "That talent is locked.");
      return;
    }
    const talent = TALENTS.find((entry) => entry.id === talentId)!;
    setState((current) => learnTalent(current, talentId));
    playSfx("quest");
    toast(`${talent.name} learned`);
  };

  const chooseCombatPath = (role: CombatRole, spec: CombatSpec) => {
    const path = COMBAT_PATHS.find((entry) => entry.id === spec && entry.role === role);
    if (!path) return;
    setState((current) => selectCombatPath(current, role, spec));
    playSfx("quest");
    toast(`${path.name} selected · talent points refunded`);
  };

  const chooseDialogue = (choice: DialogueChoice) => {
    playSfx(choice.action ? "confirm" : "select");
    setState((current) => {
      let next: PlayState = { ...current, choices: [...current.choices, choice.label] };
      if (choice.action === "acceptQuest") {
        next = { ...next, questStage: "reach-forest", companionJoined: true, lore: [...new Set([...next.lore, "nessa"])] };
      }
      if (choice.action === "discoverRaznah") next = { ...next, lore: [...new Set([...next.lore, "raznah"])] };
      if (choice.action === "meetNessa") next = { ...next, companionJoined: true, lore: [...new Set([...next.lore, "nessa"])] };
      if (choice.action === "completeQuest") {
        next = removeItem(next, "portalFragment");
        next = gainXp({ ...next, questStage: "complete", gold: next.gold + 75, talentPoints: next.talentPoints + 1 }, 100);
      }
      return next;
    });
    if (choice.action === "acceptQuest" || choice.action === "completeQuest") playSfx("quest");
    if (choice.action === "completeQuest") {
      setDialogue(null);
      window.setTimeout(() => setScreen("ending"), 500);
      return;
    }
    if (choice.action === "close" || choice.action === "discoverRaznah" || choice.action === "meetNessa" || !choice.next) setDialogue(null);
    else if (dialogue) setDialogue({ ...dialogue, node: choice.next });
  };

  const resetSave = () => {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
    setSaveExists(false);
    setScreen("title");
    setState(createNewGame());
  };

  if (screen === "title") return <TitleScreen name={name} setName={setName} saveExists={saveExists} onNew={newGame} onContinue={continueGame} onBoss={() => { setScreen("boss-lab"); playSfx("confirm"); }} onExit={() => navigate("/")} musicOn={musicOn} onMusic={toggleMusic} />;
  if (screen === "intro") return <IntroScreen index={introIndex} onNext={finishIntro} onSkip={() => setScreen("game")} />;
  if (screen === "combat") return <CombatArena location={state.location} playerName={state.playerName} maxHp={maxHealth(state)} currentHp={state.health} damage={playerDamage(state)} armor={playerArmor(state)} speedBonus={state.combatSpec === "ranger"} autoAttack={playerAutoAttack(state)} combatRole={state.combatRole} combatSpec={state.combatSpec} healingMultiplier={playerHealingMultiplier(state)} wardMultiplier={playerWardMultiplier(state)} startingWard={playerStartingWard(state)} mechanicDamageMultiplier={playerMechanicDamageMultiplier(state)} passiveHealing={passivePartyHealing(state)} tonicHeal={tonicHealing(state)} tonics={state.inventory.tonic ?? 0} onUseTonic={useTonic} onVictory={winEncounter} onDefeat={loseEncounter} onFlee={fleeEncounter} />;
  if (screen === "boss-lab") return <BossLab onExit={() => setScreen("title")}/>;
  if (screen === "ending") return <Ending state={state} onContinue={() => setScreen("game")} onNew={resetSave} onExit={() => navigate("/")} />;

  const location = LOCATIONS[state.location];
  return (
    <main className={`pt-game pt-location-${state.location}`}>
      <header className="pt-hud">
        <button className="pt-brand" onClick={() => setScreen("title")}><span>SOA</span><i>Shadows of Shanoir</i></button>
        <div className="pt-location-heading"><small>{location.kicker}</small><strong>{location.name}</strong></div>
        <div className="pt-hud-status">
          <span><i className="pt-sun" />{formatTime(state.dayMinutes)}</span><span className="pt-gold">◆ {state.gold}</span>
          <button aria-label={musicOn ? "Mute music" : "Play music"} onClick={toggleMusic}>{musicOn ? "♫" : "♪̸"}</button>
          <button onClick={() => openPanel("map")}>Map <kbd>M</kbd></button>
        </div>
      </header>

      <section className="pt-world">
        <div className="pt-world-art" />
        <div className="pt-world-vignette" />
        <div className="pt-place-copy"><span className="pt-kicker">{location.danger}</span><h1>{location.name}</h1><p>{location.description}</p></div>
        <LocationActions state={state} onDialogue={openDialogue} onShop={() => { playSfx("select"); setShopOpen(true); }} onEncounter={() => { playSfx("confirm"); setScreen("combat"); }} onTravel={() => openPanel("map")} onLore={(id) => { setState((current) => ({ ...current, lore: [...new Set([...current.lore, id])] })); playSfx("quest"); toast("Codex entry discovered"); }} />
      </section>

      <aside className="pt-quest-tracker">
        <span className="pt-kicker">Tracked quest</span><h3>{state.questStage === "not-started" ? "Someone Is Missing" : "The Forbidden Path"}</h3><p><i />{objectiveText(state.questStage)}</p><button onClick={() => openPanel("journal")}>Open journal</button>
      </aside>

      <aside className="pt-player-card">
        <div className="pt-avatar">{state.playerName.slice(0, 1).toUpperCase()}<em>{state.level}</em></div>
        <div><span>Level {state.level} Wayfarer</span><strong>{state.playerName}</strong><div className="pt-mini-bar"><i style={{ width: `${state.health / maxHealth(state) * 100}%` }} /></div><small>{Math.ceil(state.health)} / {maxHealth(state)} vigor · {state.xp}/{state.level * 100} XP</small></div>
      </aside>

      <nav className="pt-dock" aria-label="Game menus">
        <DockButton icon="✧" label="Journal" hotkey="J" badge={state.questStage === "complete" ? undefined : "1"} onClick={() => openPanel("journal")} />
        <DockButton icon="◲" label="Pack" hotkey="I" badge={String(Object.values(state.inventory).reduce((sum, value) => sum + value, 0))} onClick={() => openPanel("inventory")} />
        <DockButton icon="✺" label="Talents" hotkey="T" badge={state.talentPoints ? String(state.talentPoints) : undefined} onClick={() => openPanel("talents")} />
        <DockButton icon="≡" label="Codex" hotkey="L" badge={`${state.lore.length}/${LORE.length}`} onClick={() => openPanel("lore")} />
      </nav>

      {panel && <GamePanel panel={panel} state={state} onClose={() => setPanel(null)} onEquip={equip} onUnequip={unequip} onUseTonic={consumeOutsideCombat} onTalent={unlockTalent} onPath={chooseCombatPath} onTravel={travel} />}
      {dialogue && <DialogueModal dialogue={dialogue} onChoice={chooseDialogue} />}
      {shopOpen && <ShopModal state={state} onClose={() => setShopOpen(false)} onBuy={buy} onSell={sell} />}
      {traveling && <TravelTransition target={traveling} />}
      {notice && <div className="pt-toast" role="status" aria-live="polite"><span>✦</span>{notice}</div>}
    </main>
  );
}

function TitleScreen({ name, setName, saveExists, onNew, onContinue, onBoss, onExit, musicOn, onMusic }: { name: string; setName: (value: string) => void; saveExists: boolean; onNew: () => void; onContinue: () => void; onBoss: () => void; onExit: () => void; musicOn: boolean; onMusic: () => void }) {
  const [naming, setNaming] = useState(false);
  return <main className="pt-title-screen"><div className="pt-title-art"/><div className="pt-title-shade"/><button className="pt-exit" onClick={onExit}>← Authoring studio</button><button className="pt-audio" onClick={onMusic}>{musicOn ? "♫ Music on" : "♪ Music off"}</button><section className="pt-title-copy"><span className="pt-overline">A browser playtest from the world of</span><div className="pt-title-mark"><small>STORIES OF</small><strong>ALTRAIL</strong></div><h1>Shadows of Shanoir</h1><p>Chapter I · The Forbidden Path</p><div className="pt-title-menu">{saveExists && <button className="primary" onClick={onContinue}><span>Continue journey</span><small>Resume local save</small></button>}{!naming ? <button onClick={() => setNaming(true)}><span>Begin new journey</span><small>20–30 minute vertical slice</small></button> : <div className="pt-name-entry"><label htmlFor="hero-name">What do they call you?</label><div><input id="hero-name" value={name} maxLength={18} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onNew(); }}/><button onClick={onNew}>Begin</button></div></div>}<button className="pt-boss-lab-entry" onClick={onBoss}><span>Veteran Boss Lab</span><small>Level 20 · full party · 2–4 minute encounter</small></button><button className="quiet" onClick={onExit}><span>Return to editor</span></button></div></section><footer>Keyboard & mouse recommended <i /> Progress saves automatically</footer></main>;
}

function IntroScreen({ index, onNext, onSkip }: { index: number; onNext: () => void; onSkip: () => void }) {
  const slide = INTRO_SLIDES[index];
  return <main className="pt-intro"><div className="pt-intro-art" style={{ transform: `scale(${1.04 + index * .025}) translateX(${-index * .5}%)` }}/><div className="pt-intro-shade"/><button className="pt-skip" onClick={onSkip}>Skip prologue</button><section key={index}><span>{slide.eyebrow}</span><h1>{slide.title}</h1><p>{slide.text}</p><button onClick={onNext}>{index === INTRO_SLIDES.length - 1 ? "Enter Hearthmere" : "Continue"} <b>→</b></button><div>{INTRO_SLIDES.map((_, dot) => <i key={dot} className={dot === index ? "active" : ""}/>)}</div></section></main>;
}

function elderDialogue(state: PlayState): DialogueKey {
  if (state.questStage === "return") return "questReturn";
  if (state.questStage === "complete") return "afterQuest";
  if (state.questStage !== "not-started") return "questActive";
  return "questIntro";
}

function LocationActions({ state, onDialogue, onShop, onEncounter, onTravel, onLore }: { state: PlayState; onDialogue: (key: DialogueKey) => void; onShop: () => void; onEncounter: () => void; onTravel: () => void; onLore: (id: string) => void }) {
  if (state.location === "village") return <div className="pt-scene-actions">
    <button className="pt-scene-card primary" onClick={() => onDialogue(elderDialogue(state))}><span className="pt-card-portrait portrait-maelin"/><span><small>Hearthmere Hall</small><strong>Elder Maelin</strong><em>{state.questStage === "return" ? "Iven is safe · Maelin needs your report" : state.questStage === "complete" ? "The village is safe—for tonight" : state.questStage === "not-started" ? "A search party has returned empty-handed" : "Ask about the road or Raznah"}</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onShop}><span className="pt-card-portrait portrait-torren"/><span><small>Vale Forge</small><strong>Torren Vale</strong><em>Finite stock · buy and sell gear</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onTravel}><span className="pt-card-icon road">↠</span><span><small>South Gate</small><strong>The Forbidden Path</strong><em>{state.questStage === "not-started" ? "Closed until the search begins" : "Open the travel map"}</em></span><b>›</b></button>
  </div>;
  const cleared = state.clearedEncounters.includes(state.location);
  const loreId = state.location === "forest" ? "wrongShadows" : state.location === "swamp" ? "missingTrail" : "shanoirRift";
  return <div className="pt-scene-actions wilderness">
    {!cleared ? <button className="pt-scene-card danger primary" onClick={onEncounter}><span className="pt-card-icon">!</span><span><small>{state.location === "ruins" ? "Major encounter" : "Hostile encounter"}</small><strong>{state.location === "forest" ? "Panicked animals block the trail" : state.location === "swamp" ? "Shadow-touched shapes gather" : "A Shadow creature guards Iven"}</strong><em>Enter real-time party combat</em></span><b>⚔</b></button> : <button className="pt-scene-card cleared"><span className="pt-card-icon">✓</span><span><small>Area secured</small><strong>{state.location === "ruins" ? "Iven is safe" : "The trail is clear"}</strong><em>Threats will not respawn in this chapter</em></span></button>}
    {state.location === "ruins" && cleared ? <button className="pt-scene-card" onClick={() => onDialogue("rescue")}><span className="pt-card-portrait portrait-iven"/><span><small>Rescued villager</small><strong>Iven Marr</strong><em>Ask what the portal showed him</em></span><b>›</b></button> : <button className="pt-scene-card" onClick={() => onDialogue("companion")}><span className="pt-card-portrait portrait-nessa"/><span><small>Traveling companion</small><strong>Nessa Reed</strong><em>Review the trail and combat plan</em></span><b>›</b></button>}
    <button className="pt-scene-card" onClick={() => onLore(loreId)}><span className="pt-card-icon lore">≡</span><span><small>Examine</small><strong>{state.location === "forest" ? "Shadows beneath the trees" : state.location === "swamp" ? "The torn trail" : "The reacting portal stones"}</strong><em>{state.lore.includes(loreId) ? "Codex entry collected" : "Something can be learned here"}</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onTravel}><span className="pt-card-icon road">↠</span><span><small>Travel</small><strong>Choose a route</strong><em>Open the map of western Altrail</em></span><b>›</b></button>
  </div>;
}

function DockButton({ icon, label, hotkey, badge, onClick }: { icon: string; label: string; hotkey: string; badge?: string; onClick: () => void }) { return <button onClick={onClick}><i>{icon}</i><span>{label}</span><kbd>{hotkey}</kbd>{badge && <b>{badge}</b>}</button>; }

function GamePanel({ panel, state, onClose, onEquip, onUnequip, onUseTonic, onTalent, onPath, onTravel }: { panel: Exclude<Panel, null>; state: PlayState; onClose: () => void; onEquip: (id: string) => void; onUnequip: (slot: "weapon" | "armor" | "charm") => void; onUseTonic: () => void; onTalent: (id: string) => void; onPath: (role: CombatRole, spec: CombatSpec) => void; onTravel: (id: LocationId) => void }) {
  return <div className="pt-panel-backdrop" onClick={onClose}><aside className={`pt-panel pt-panel-${panel}`} onClick={(event) => event.stopPropagation()}><header><div><span className="pt-kicker">Wayfarer's record</span><h2>{panel === "inventory" ? "Pack & Equipment" : panel === "journal" ? "Quest Journal" : panel === "talents" ? "Combat Paths" : panel === "lore" ? "Altrail Codex" : "Travel Map"}</h2></div><button onClick={onClose} aria-label="Close">×</button></header>{panel === "journal" && <Journal state={state}/>} {panel === "inventory" && <Inventory state={state} onEquip={onEquip} onUnequip={onUnequip} onUseTonic={onUseTonic}/>} {panel === "talents" && <TalentPanel state={state} onTalent={onTalent} onPath={onPath}/>} {panel === "lore" && <LorePanel state={state}/>} {panel === "map" && <MapPanel state={state} onTravel={onTravel}/>}</aside></div>;
}

function Journal({ state }: { state: PlayState }) {
  const labels = ["Speak with Elder Maelin", "Follow Iven's trail into Gloamwood", "Cross Morrowfen", "Rescue Iven at Riftwatch", "Return to Hearthmere"];
  const stageOrder = ["not-started", "reach-forest", "cross-fen", "reach-gate", "return", "complete"];
  const current = stageOrder.indexOf(state.questStage);
  return <div className="pt-journal"><div className="pt-chapter-number">I</div><span className="pt-kicker">Main quest · Level 1</span><h3>The Forbidden Path</h3><p>Find Iven Marr and discover why Riftwatch has begun disturbing the land around Hearthmere.</p><div className="pt-objective-list">{labels.map((label, index) => <div key={label} className={current > index ? "done" : current === index ? "active" : ""}><i>{current > index ? "✓" : index + 1}</i><span>{label}</span></div>)}</div><aside className="pt-quest-party"><span className="pt-card-portrait portrait-nessa"/><div><small>Quest companion</small><strong>Nessa Reed</strong><p>Scout · support · vanguard</p></div></aside><footer><span>Chapter rewards</span><b>350 XP</b><b>◆ 155</b><b>Resonant Portal Shard</b></footer></div>;
}

function Inventory({ state, onEquip, onUnequip, onUseTonic }: { state: PlayState; onEquip: (id: string) => void; onUnequip: (slot: "weapon" | "armor" | "charm") => void; onUseTonic: () => void }) {
  const entries = Object.entries(state.inventory).filter(([, amount]) => amount > 0);
  return <div className="pt-inventory"><section className="pt-equipment"><h3>Equipped</h3>{(["weapon", "armor", "charm"] as const).map((slot) => { const id = state.equipment[slot]; const item = id ? ITEMS[id] : null; return <button key={slot} className={!item ? "empty" : ""} disabled={!item} onClick={() => onUnequip(slot)}><span>{slot}</span><i>{item?.icon ?? "+"}</i><strong>{item?.name ?? `Empty ${slot} slot`}</strong>{item && <em>Unequip</em>}</button>; })}<div className="pt-stats"><span><b>{playerDamage(state)}</b> Damage</span><span><b>{playerArmor(state)}</b> Armor</span><span><b>{maxHealth(state)}</b> Vigor</span></div></section><section className="pt-pack"><h3>Pack <small>{entries.reduce((sum, [, value]) => sum + value, 0)} items</small></h3><div>{entries.map(([id, amount]) => { const item = ITEMS[id]; if (!item) return null; const equipped = item.slot && state.equipment[item.slot] === id; return <article key={id}><i>{item.icon}</i><div><strong>{item.name}</strong><span>{item.description}</span><small>{itemEffect(item)}</small></div><em>×{amount}</em>{item.slot && <button disabled={equipped} onClick={() => onEquip(id)}>{equipped ? "Equipped" : "Equip"}</button>}{item.type === "consumable" && <button disabled={state.health >= maxHealth(state)} onClick={onUseTonic}>Use +{tonicHealing(state)}</button>}</article>; })}</div></section></div>;
}

function TalentPanel({ state, onTalent, onPath }: { state: PlayState; onTalent: (id: string) => void; onPath: (role: CombatRole, spec: CombatSpec) => void }) {
  const [viewedRole, setViewedRole] = useState<CombatRole>(state.combatRole);
  const activePath = COMBAT_PATHS.find((path) => path.id === state.combatSpec)!;
  const attack = playerAutoAttack(state);
  const talents = TALENTS.filter((talent) => talent.spec === state.combatSpec);
  return <div className="pt-talents pt-combat-paths">
    <div className="pt-talent-summary"><div className="pt-talent-points"><b>{state.talentPoints}</b><span>talent {state.talentPoints === 1 ? "point" : "points"} available</span></div><div><span>Active path</span><strong>{COMBAT_ROLES[state.combatRole].name} · {activePath.name}</strong><small>{activePath.companionPlan}</small></div></div>
    <nav className="pt-role-tabs" aria-label="Combat roles">{(Object.keys(COMBAT_ROLES) as CombatRole[]).map((role) => <button key={role} className={`${viewedRole === role ? "viewed" : ""} ${state.combatRole === role ? "active" : ""}`} onClick={() => setViewedRole(role)}><i>{COMBAT_ROLES[role].icon}</i><strong>{COMBAT_ROLES[role].name}</strong><span>{COMBAT_ROLES[role].summary}</span></button>)}</nav>
    <div className="pt-spec-picker">{COMBAT_PATHS.filter((path) => path.role === viewedRole).map((path) => { const active = path.id === state.combatSpec; return <button key={path.id} className={active ? "active" : ""} onClick={() => onPath(path.role, path.id)}><i>{path.icon}</i><span><strong>{path.name}</strong><small>{path.fantasy}</small><em>{active ? "Active path" : "Choose · free respec"}</em></span></button>; })}</div>
    <div className="pt-path-loadout"><header><div><span>{COMBAT_ROLES[state.combatRole].name} specialization</span><h3>{activePath.name}</h3><p>{activePath.fantasy}</p></div><aside><span><b>{attack.damage}</b> {attack.label}</span><span><b>{attack.interval}s</b> cadence</span><span><b>{attack.range}</b> range</span></aside></header><div className="pt-path-nodes">{talents.map((talent) => { const learned = state.talents.includes(talent.id); const check = canUnlockTalent(state, talent.id); return <article key={talent.id} className={`${learned ? "learned" : ""} ${!check.allowed && !learned ? "locked" : ""}`}><button disabled={learned || !check.allowed} onClick={() => onTalent(talent.id)}><i>{learned ? "✓" : talent.icon}</i></button><div><span>Tier {talent.tier}</span><strong>{talent.name}</strong><p>{talent.description}</p><small>{learned ? "Learned" : check.allowed ? `${talent.cost} talent point` : check.reason}</small></div></article>; })}</div></div>
    <footer className="pt-path-note">Changing path refunds every spent point. Nessa automatically fills the missing frontline or support role when combat begins.</footer>
  </div>;
}

function LorePanel({ state }: { state: PlayState }) { return <div className="pt-lore"><nav>{LORE.map((entry) => <button key={entry.id} className={state.lore.includes(entry.id) ? "found" : ""}><i>{state.lore.includes(entry.id) ? "✦" : "?"}</i><span>{state.lore.includes(entry.id) ? entry.title : "Undiscovered"}</span></button>)}</nav><section>{LORE.map((entry) => state.lore.includes(entry.id) && <article key={entry.id}><span>{entry.category}</span><h3>{entry.title}</h3><p>{entry.text}</p></article>)}</section></div>; }

function MapPanel({ state, onTravel }: { state: PlayState; onTravel: (id: LocationId) => void }) { return <div className="pt-map"><div className="pt-map-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M72 67C65 60 58 55 49 48S37 55 27 65M49 48C43 39 39 31 35 24"/><path className="glow" d="M72 67C65 60 58 55 49 48S37 55 27 65M49 48C43 39 39 31 35 24"/></svg>{Object.values(LOCATIONS).map((location) => { const check = canTravelTo(state, location.id); const discovered = state.location === location.id || location.id === "village" || (location.id === "forest" && state.questStage !== "not-started") || (location.id === "swamp" && state.clearedEncounters.includes("forest")) || (location.id === "ruins" && state.clearedEncounters.includes("swamp")); return <button key={location.id} className={`${state.location === location.id ? "current" : ""} ${!discovered ? "locked" : ""}`} style={{ left: `${location.x}%`, top: `${location.y}%`, "--node": location.accent } as React.CSSProperties} onClick={() => onTravel(location.id)}><i>{!discovered ? "×" : state.location === location.id ? "◆" : "●"}</i><span>{discovered ? location.name : "Unknown"}</span><small>{state.location === location.id ? "You are here" : check.allowed ? `${location.travelMinutes} min route` : check.reason}</small></button>; })}</div><footer><span><i className="current"/> Current</span><span><i/> Discovered</span><span><i className="locked"/> Locked</span></footer></div>; }

function DialogueModal({ dialogue, onChoice }: { dialogue: { key: DialogueKey; node: string }; onChoice: (choice: DialogueChoice) => void }) {
  const script = DIALOGUES[dialogue.key] as unknown as { speaker: string; role: string; portrait: string; nodes: Record<string, { text: string; choices: DialogueChoice[] }> };
  const node = script.nodes[dialogue.node];
  return <div className="pt-dialogue-backdrop"><section className="pt-dialogue"><div className="pt-dialogue-portrait"><span className={`portrait-${script.portrait}`}/><i/></div><div className="pt-dialogue-content"><header><span>{script.role}</span><h2>{script.speaker}</h2></header><p>“{node.text}”</p><div>{node.choices.map((choice, index) => <button key={choice.label} onClick={() => onChoice(choice)}><kbd>{index + 1}</kbd><span>{choice.label}</span><b>›</b></button>)}</div></div></section></div>;
}

function itemEffect(item: ItemDefinition) {
  const effects = [];
  if (item.damage) effects.push(`+${item.damage} damage`);
  if (item.armor) effects.push(`+${item.armor} armor`);
  if (item.health) effects.push(`+${item.health} vigor`);
  if (item.heal) effects.push(`Restores ${item.heal} vigor`);
  if (item.attackStyle) effects.push(`${item.attackStyle === "ranged" ? "Ranged" : "Melee"} auto · ${item.autoInterval}s`);
  if (item.healingPower) effects.push(`+${Math.round(item.healingPower * 100)}% healing`);
  return effects.join(" · ") || (item.type === "quest" ? "Quest item" : item.type);
}

function ShopModal({ state, onClose, onBuy, onSell }: { state: PlayState; onClose: () => void; onBuy: (id: string) => void; onSell: (id: string) => void }) {
  const sellable = Object.keys(state.inventory).filter((id) => { const item = ITEMS[id]; return item && item.price > 0 && item.type !== "quest"; });
  return <div className="pt-panel-backdrop" onClick={onClose}><aside className="pt-shop" onClick={(event) => event.stopPropagation()}><header><span className="pt-shopkeeper portrait-torren"/><div><span className="pt-kicker">Vale Forge · Hearthmere</span><h2>Torren Vale</h2><p>“Take what keeps you alive. We can settle the rest when Iven is home.”</p></div><button onClick={onClose}>×</button></header><div className="pt-shop-gold">Your purse <b>◆ {state.gold}</b></div><h3>Forge stock</h3><section>{SHOP_STOCK.map((id) => { const item = ITEMS[id]; const stock = state.shopStock[id] ?? 0; return <article key={id} className={!stock ? "sold-out" : ""}><i>{item.icon}</i><div><span>{item.type} · {stock ? `${stock} in stock` : "sold out"}</span><strong>{item.name}</strong><p>{item.description}</p><small>{itemEffect(item)}</small></div><button disabled={!stock || state.gold < item.price} onClick={() => onBuy(id)}>◆ {item.price}</button></article>; })}</section><h3>Sell from pack</h3><section className="pt-sell-list">{sellable.length ? sellable.map((id) => { const item = ITEMS[id]; const equipped = item.slot && state.equipment[item.slot] === id; return <article key={id}><i>{item.icon}</i><div><strong>{item.name}</strong><small>Owned ×{state.inventory[id]}{equipped ? " · currently equipped" : ""}</small></div><button disabled={Boolean(equipped)} onClick={() => onSell(id)}>Sell ◆ {Math.max(1, Math.floor(item.price * .5))}</button></article>; }) : <p className="pt-shop-empty">Nothing in your pack can be sold.</p>}</section></aside></div>;
}

function TravelTransition({ target }: { target: LocationId }) { return <div className="pt-travel"><div className="pt-travel-line"><i/><b>♢</b><i/></div><span>Following Iven's trail with Nessa</span><h2>{LOCATIONS[target].name}</h2><p>{LOCATIONS[target].travelMinutes} minutes travel</p></div>; }

function Ending({ state, onContinue, onNew, onExit }: { state: PlayState; onContinue: () => void; onNew: () => void; onExit: () => void }) { const minutes = Math.max(1, Math.round(state.playSeconds / 60)); return <main className="pt-ending"><div className="pt-ending-art"/><div className="pt-title-shade"/><section><span className="pt-kicker">Chapter I complete</span><h1>The portal remembers you.</h1><p>Iven is home, but the Shadow creature and the resonant fragment have reopened questions buried with your grandfather. Somewhere beyond Hearthmere, Raznah, Roznoh, and the hidden truth of that earlier incursion still wait.</p><div className="pt-ending-stats"><span><b>{minutes}m</b>Journey</span><span><b>{state.lore.length}/{LORE.length}</b>Lore</span><span><b>Lv. {state.level}</b>Wayfarer</span></div><div className="pt-ending-actions"><button className="primary" onClick={onContinue}>Keep exploring</button><button onClick={onNew}>Start over</button><button onClick={onExit}>Return to editor</button></div><small>Thank you for playtesting · Progress remains saved locally</small></section></main>; }
