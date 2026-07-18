import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CombatArena from "./CombatArena";
import { DIALOGUES, INTRO_SLIDES, ITEMS, LOCATIONS, LORE, SHOP_STOCK, TALENTS, type LocationId } from "./content";
import { setMusicVolume, startMusic, stopMusic } from "./audio";
import { addItem, applyEncounterVictory, canTravelTo, createNewGame, formatTime, gainXp, loadGame, maxHealth, objectiveText, playerArmor, playerDamage, removeItem, saveGame, SAVE_KEY, type PlayState } from "./runtime";
import "./playtest.css";

type Screen = "title" | "intro" | "game" | "combat" | "ending";
type Panel = "journal" | "inventory" | "talents" | "lore" | "map" | null;
type DialogueKey = keyof typeof DIALOGUES;

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
    if (screen !== "game") return;
    const timer = window.setInterval(() => setState((current) => ({ ...current, playSeconds: current.playSeconds + 1 })), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => () => stopMusic(), []);

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2600);
  };

  const newGame = async () => {
    const fresh = createNewGame(name);
    setState(fresh);
    setIntroIndex(0);
    setScreen("intro");
    if (!musicOn) { await startMusic(); setMusicOn(true); }
  };

  const continueGame = async () => {
    const save = loadGame();
    if (!save) return;
    setState(save);
    setScreen(save.questStage === "complete" ? "ending" : "game");
    if (!musicOn) { await startMusic(); setMusicOn(true); }
  };

  const toggleMusic = async () => {
    if (musicOn) { stopMusic(); setMusicOn(false); }
    else { await startMusic(); setMusicVolume(.12); setMusicOn(true); }
  };

  const finishIntro = () => {
    if (introIndex < INTRO_SLIDES.length - 1) setIntroIndex((value) => value + 1);
    else setScreen("game");
  };

  const travel = (target: LocationId) => {
    const check = canTravelTo(state, target);
    if (!check.allowed) { toast(check.reason ?? "That route is unavailable."); return; }
    setPanel(null);
    setTraveling(target);
    window.setTimeout(() => {
      const destination = LOCATIONS[target];
      setState((current) => ({ ...current, location: target, dayMinutes: current.dayMinutes + destination.travelMinutes * 9, health: Math.min(maxHealth(current), current.health + 8) }));
      setTraveling(null);
      toast(`Arrived at ${destination.name}`);
    }, 1250);
  };

  const startEncounter = () => setScreen("combat");

  const winEncounter = (remainingHp: number) => {
    setState((current) => applyEncounterVictory({ ...current, health: remainingHp }, current.location));
    setScreen("game");
    toast(state.location === "ruins" ? "The Ashen Bell Clapper recovered" : "Encounter cleared · rewards collected");
  };

  const loseEncounter = () => {
    setState((current) => ({ ...current, location: "village", health: maxHealth(current), gold: Math.max(0, current.gold - 10), dayMinutes: current.dayMinutes + 90 }));
    setScreen("game");
    toast("Mara's ward carried you home · 10 gold lost");
  };

  const fleeEncounter = (remainingHp: number) => {
    setState((current) => ({ ...current, location: current.location === "forest" ? "village" : "forest", health: remainingHp, dayMinutes: current.dayMinutes + 20 }));
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
    if (!item.slot) return;
    setState((current) => {
      const next = { ...current, equipment: { ...current.equipment, [item.slot!]: itemId } };
      return { ...next, health: Math.min(maxHealth(next), next.health) };
    });
    toast(`${item.name} equipped`);
  };

  const consumeOutsideCombat = () => {
    if (!(state.inventory.tonic ?? 0) || state.health >= maxHealth(state)) return;
    setState((current) => {
      const next = removeItem(current, "tonic");
      return { ...next, health: Math.min(maxHealth(next), next.health + 35) };
    });
    toast("Restored 35 vigor");
  };

  const buy = (itemId: string) => {
    const item = ITEMS[itemId];
    if (state.gold < item.price) { toast("Not enough gold"); return; }
    setState((current) => addItem({ ...current, gold: current.gold - item.price }, itemId));
    toast(`${item.name} added to pack`);
  };

  const unlockTalent = (talentId: string) => {
    const talent = TALENTS.find((entry) => entry.id === talentId);
    if (!talent || state.talents.includes(talentId) || state.talentPoints < talent.cost) return;
    setState((current) => {
      const next = { ...current, talents: [...current.talents, talentId], talentPoints: current.talentPoints - talent.cost };
      return { ...next, health: Math.min(maxHealth(next), talentId === "resolve" ? next.health + 18 : next.health) };
    });
    toast(`${talent.name} learned`);
  };

  const chooseDialogue = (choice: { label: string; next: string | null; action?: string }) => {
    setState((current) => ({ ...current, choices: [...current.choices, choice.label] }));
    if (choice.action === "acceptQuest") setState((current) => ({ ...current, questStage: "reach-forest" }));
    if (choice.action === "completeQuest") {
      setState((current) => {
        let next = removeItem(current, "bellClapper");
        next = gainXp({ ...next, questStage: "complete", gold: next.gold + 75, talentPoints: next.talentPoints + 1 }, 100);
        return next;
      });
      setDialogue(null);
      window.setTimeout(() => setScreen("ending"), 500);
      return;
    }
    if (choice.action === "close" || !choice.next) setDialogue(null);
    else if (dialogue) setDialogue({ ...dialogue, node: choice.next });
  };

  const resetSave = () => {
    localStorage.removeItem(SAVE_KEY);
    setSaveExists(false);
    setScreen("title");
    setState(createNewGame());
  };

  if (screen === "title") return <TitleScreen name={name} setName={setName} saveExists={saveExists} onNew={newGame} onContinue={continueGame} onExit={() => navigate("/")} musicOn={musicOn} onMusic={toggleMusic} />;
  if (screen === "intro") return <IntroScreen index={introIndex} onNext={finishIntro} onSkip={() => setScreen("game")} />;
  if (screen === "combat") return <CombatArena location={state.location} playerName={state.playerName} maxHp={maxHealth(state)} currentHp={state.health} damage={playerDamage(state)} armor={playerArmor(state)} speedBonus={state.talents.includes("quickstep")} tonics={state.inventory.tonic ?? 0} onUseTonic={useTonic} onVictory={winEncounter} onDefeat={loseEncounter} onFlee={fleeEncounter} />;
  if (screen === "ending") return <Ending state={state} onContinue={() => setScreen("game")} onNew={resetSave} onExit={() => navigate("/")} />;

  const location = LOCATIONS[state.location];
  return (
    <main className={`pt-game pt-location-${state.location}`}>
      <header className="pt-hud">
        <button className="pt-brand" onClick={() => setScreen("title")}><span>SOA</span><i>The Ashen Bell</i></button>
        <div className="pt-location-heading"><small>{location.kicker}</small><strong>{location.name}</strong></div>
        <div className="pt-hud-status">
          <span><i className="pt-sun" />{formatTime(state.dayMinutes)}</span><span className="pt-gold">◆ {state.gold}</span>
          <button aria-label={musicOn ? "Mute music" : "Play music"} onClick={toggleMusic}>{musicOn ? "♫" : "♪̸"}</button>
          <button onClick={() => setPanel("map")}>Map <kbd>M</kbd></button>
        </div>
      </header>

      <section className="pt-world">
        <div className="pt-world-art" />
        <div className="pt-world-vignette" />
        <div className="pt-place-copy"><span className="pt-kicker">{location.danger}</span><h1>{location.name}</h1><p>{location.description}</p></div>
        <LocationActions state={state} onDialogue={(key) => setDialogue({ key, node: "start" })} onShop={() => setShopOpen(true)} onEncounter={startEncounter} onTravel={() => setPanel("map")} onLore={(id) => { setState((current) => ({ ...current, lore: [...new Set([...current.lore, id])] })); toast("Codex entry discovered"); }} />
      </section>

      <aside className="pt-quest-tracker">
        <span className="pt-kicker">Tracked quest</span><h3>{state.questStage === "not-started" ? "A Village Without a Voice" : "The Ashen Bell"}</h3><p><i />{objectiveText(state.questStage)}</p><button onClick={() => setPanel("journal")}>Open journal</button>
      </aside>

      <aside className="pt-player-card">
        <div className="pt-avatar">{state.playerName.slice(0, 1).toUpperCase()}<em>{state.level}</em></div>
        <div><span>Level {state.level} Wayfarer</span><strong>{state.playerName}</strong><div className="pt-mini-bar"><i style={{ width: `${state.health / maxHealth(state) * 100}%` }} /></div><small>{Math.ceil(state.health)} / {maxHealth(state)} vigor</small></div>
      </aside>

      <nav className="pt-dock" aria-label="Game menus">
        <DockButton icon="✧" label="Journal" badge={state.questStage === "complete" ? undefined : "1"} onClick={() => setPanel("journal")} />
        <DockButton icon="◲" label="Pack" badge={String(Object.values(state.inventory).reduce((sum, value) => sum + value, 0))} onClick={() => setPanel("inventory")} />
        <DockButton icon="✺" label="Talents" badge={state.talentPoints ? String(state.talentPoints) : undefined} onClick={() => setPanel("talents")} />
        <DockButton icon="≡" label="Codex" badge={`${state.lore.length}/${LORE.length}`} onClick={() => setPanel("lore")} />
      </nav>

      {panel && <GamePanel panel={panel} state={state} onClose={() => setPanel(null)} onEquip={equip} onUseTonic={consumeOutsideCombat} onTalent={unlockTalent} onTravel={travel} />}
      {dialogue && <DialogueModal dialogue={dialogue} onChoice={chooseDialogue} />}
      {shopOpen && <ShopModal state={state} onClose={() => setShopOpen(false)} onBuy={buy} />}
      {traveling && <TravelTransition target={traveling} />}
      {notice && <div className="pt-toast"><span>✦</span>{notice}</div>}
    </main>
  );
}

function TitleScreen({ name, setName, saveExists, onNew, onContinue, onExit, musicOn, onMusic }: { name: string; setName: (value: string) => void; saveExists: boolean; onNew: () => void; onContinue: () => void; onExit: () => void; musicOn: boolean; onMusic: () => void }) {
  const [naming, setNaming] = useState(false);
  return <main className="pt-title-screen"><div className="pt-title-art"/><div className="pt-title-shade"/><button className="pt-exit" onClick={onExit}>← Authoring studio</button><button className="pt-audio" onClick={onMusic}>{musicOn ? "♫ Music on" : "♪ Music off"}</button><section className="pt-title-copy"><span className="pt-overline">A browser playtest from the world of</span><div className="pt-title-mark"><small>STORIES OF</small><strong>ALTRAIL</strong></div><h1>The Ashen Bell</h1><p>A short playable chapter</p><div className="pt-title-menu">{saveExists && <button className="primary" onClick={onContinue}><span>Continue journey</span><small>Resume local save</small></button>}{!naming ? <button onClick={() => setNaming(true)}><span>Begin new journey</span><small>20–30 minute vertical slice</small></button> : <div className="pt-name-entry"><label htmlFor="hero-name">What do they call you?</label><div><input id="hero-name" value={name} maxLength={18} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onNew(); }}/><button onClick={onNew}>Begin</button></div></div>}<button className="quiet" onClick={onExit}><span>Return to editor</span></button></div></section><footer>Keyboard & mouse recommended <i/ > Progress saves automatically</footer></main>;
}

function IntroScreen({ index, onNext, onSkip }: { index: number; onNext: () => void; onSkip: () => void }) {
  const slide = INTRO_SLIDES[index];
  return <main className="pt-intro"><div className="pt-intro-art" style={{ transform: `scale(${1.04 + index * .025}) translateX(${-index * .5}%)` }}/><div className="pt-intro-shade"/><button className="pt-skip" onClick={onSkip}>Skip prologue</button><section key={index}><span>{slide.eyebrow}</span><h1>{slide.title}</h1><p>{slide.text}</p><button onClick={onNext}>{index === INTRO_SLIDES.length - 1 ? "Enter Brackenmere" : "Continue"} <b>→</b></button><div>{INTRO_SLIDES.map((_, dot) => <i key={dot} className={dot === index ? "active" : ""}/>)}</div></section></main>;
}

function LocationActions({ state, onDialogue, onShop, onEncounter, onTravel, onLore }: { state: PlayState; onDialogue: (key: DialogueKey) => void; onShop: () => void; onEncounter: () => void; onTravel: () => void; onLore: (id: string) => void }) {
  if (state.location === "village") return <div className="pt-scene-actions">
    <button className="pt-scene-card primary" onClick={() => onDialogue(state.questStage === "return" ? "maraReturn" : "maraIntro")}><span className="pt-card-icon">M</span><span><small>Bell Tower</small><strong>Mara Vey</strong><em>{state.questStage === "return" ? "The clapper hums in your pack" : state.questStage === "not-started" ? "She is waiting for you" : "Keeper of the village bell"}</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onShop}><span className="pt-card-icon smith">⚒</span><span><small>Village Forge</small><strong>Orrin's Goods</strong><em>Weapons, armor & tonics</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onTravel}><span className="pt-card-icon road">↠</span><span><small>Eastern Gate</small><strong>The Old Road</strong><em>{state.questStage === "not-started" ? "Sealed by Mara's ward" : "Open the travel map"}</em></span><b>›</b></button>
  </div>;
  const cleared = state.clearedEncounters.includes(state.location);
  const loreId = state.location === "forest" ? "oldRoad" : state.location === "swamp" ? "mire" : "gate";
  return <div className="pt-scene-actions wilderness">
    {!cleared ? <button className="pt-scene-card danger primary" onClick={onEncounter}><span className="pt-card-icon">!</span><span><small>{state.location === "ruins" ? "Boss encounter" : "Hostile encounter"}</small><strong>{state.location === "forest" ? "Boars block the road" : state.location === "swamp" ? "Shapes move in the fen" : "The Gatebound Warden"}</strong><em>Enter real-time combat</em></span><b>⚔</b></button> : <button className="pt-scene-card cleared"><span className="pt-card-icon">✓</span><span><small>Area secured</small><strong>The path is clear</strong><em>Threats will not respawn in this playtest</em></span></button>}
    <button className="pt-scene-card" onClick={() => onLore(loreId)}><span className="pt-card-icon lore">≡</span><span><small>Examine</small><strong>{state.location === "forest" ? "Half-buried milestone" : state.location === "swamp" ? "Fen keeper's cairn" : "Shanoir inscriptions"}</strong><em>{state.lore.includes(loreId) ? "Codex entry collected" : "Something can be learned here"}</em></span><b>›</b></button>
    <button className="pt-scene-card" onClick={onTravel}><span className="pt-card-icon road">↠</span><span><small>Travel</small><strong>Choose a route</strong><em>Open the map of Altrail</em></span><b>›</b></button>
  </div>;
}

function DockButton({ icon, label, badge, onClick }: { icon: string; label: string; badge?: string; onClick: () => void }) { return <button onClick={onClick}><i>{icon}</i><span>{label}</span>{badge && <b>{badge}</b>}</button>; }

function GamePanel({ panel, state, onClose, onEquip, onUseTonic, onTalent, onTravel }: { panel: Exclude<Panel, null>; state: PlayState; onClose: () => void; onEquip: (id: string) => void; onUseTonic: () => void; onTalent: (id: string) => void; onTravel: (id: LocationId) => void }) {
  return <div className="pt-panel-backdrop" onClick={onClose}><aside className={`pt-panel pt-panel-${panel}`} onClick={(event) => event.stopPropagation()}><header><div><span className="pt-kicker">Wayfarer's record</span><h2>{panel === "inventory" ? "Pack & Equipment" : panel === "journal" ? "Quest Journal" : panel === "talents" ? "Talents" : panel === "lore" ? "Altrail Codex" : "Travel Map"}</h2></div><button onClick={onClose} aria-label="Close">×</button></header>{panel === "journal" && <Journal state={state}/>} {panel === "inventory" && <Inventory state={state} onEquip={onEquip} onUseTonic={onUseTonic}/>} {panel === "talents" && <TalentPanel state={state} onTalent={onTalent}/>} {panel === "lore" && <LorePanel state={state}/>} {panel === "map" && <MapPanel state={state} onTravel={onTravel}/>}</aside></div>;
}

function Journal({ state }: { state: PlayState }) { return <div className="pt-journal"><div className="pt-chapter-number">I</div><span className="pt-kicker">Main quest · Level 1</span><h3>The Ashen Bell</h3><p>Recover Brackenmere's missing bell clapper from the ruins beyond Blackwater Fen.</p><div className="pt-objective-list">{["Speak with Mara Vey", "Clear the Elderwood road", "Cross Blackwater Fen", "Recover the clapper at Shanoir Gate", "Return to Mara"].map((label, index) => { const stageOrder = ["not-started", "reach-forest", "cross-fen", "reach-gate", "return", "complete"]; const current = stageOrder.indexOf(state.questStage); return <div key={label} className={current > index ? "done" : current === index ? "active" : ""}><i>{current > index ? "✓" : index + 1}</i><span>{label}</span></div>; })}</div><footer><span>Rewards</span><b>175 XP</b><b>◆ 75</b><b>Emberglass Charm</b></footer></div>; }

function Inventory({ state, onEquip, onUseTonic }: { state: PlayState; onEquip: (id: string) => void; onUseTonic: () => void }) {
  const entries = Object.entries(state.inventory).filter(([, amount]) => amount > 0);
  return <div className="pt-inventory"><section className="pt-equipment"><h3>Equipped</h3>{(["weapon", "armor", "charm"] as const).map((slot) => { const id = state.equipment[slot]; const item = id ? ITEMS[id] : null; return <div key={slot} className={!item ? "empty" : ""}><span>{slot}</span><i>{item?.icon ?? "+"}</i><strong>{item?.name ?? `Empty ${slot} slot`}</strong></div>; })}<div className="pt-stats"><span><b>{playerDamage(state)}</b> Damage</span><span><b>{playerArmor(state)}</b> Armor</span><span><b>{maxHealth(state)}</b> Vigor</span></div></section><section className="pt-pack"><h3>Pack <small>{entries.reduce((sum, [, value]) => sum + value, 0)} items</small></h3><div>{entries.map(([id, amount]) => { const item = ITEMS[id]; const equipped = item.slot && state.equipment[item.slot] === id; return <article key={id}><i>{item.icon}</i><div><strong>{item.name}</strong><span>{item.description}</span></div><em>×{amount}</em>{item.slot && <button disabled={equipped} onClick={() => onEquip(id)}>{equipped ? "Equipped" : "Equip"}</button>}{item.type === "consumable" && <button onClick={onUseTonic}>Use</button>}</article>; })}</div></section></div>;
}

function TalentPanel({ state, onTalent }: { state: PlayState; onTalent: (id: string) => void }) { return <div className="pt-talents"><div className="pt-talent-points"><b>{state.talentPoints}</b><span>talent {state.talentPoints === 1 ? "point" : "points"} available</span></div><div className="pt-talent-path"><i className="line"/>{TALENTS.map((talent, index) => { const learned = state.talents.includes(talent.id); return <article key={talent.id} className={learned ? "learned" : ""}><button disabled={learned || state.talentPoints < talent.cost} onClick={() => onTalent(talent.id)}><i>{learned ? "✓" : talent.icon}</i></button><div><span>Tier {index + 1}</span><strong>{talent.name}</strong><p>{talent.description}</p><small>{learned ? "Learned" : `${talent.cost} talent point`}</small></div></article>; })}</div></div>; }

function LorePanel({ state }: { state: PlayState }) { return <div className="pt-lore"><nav>{LORE.map((entry) => <button key={entry.id} className={state.lore.includes(entry.id) ? "found" : ""}><i>{state.lore.includes(entry.id) ? "✦" : "?"}</i><span>{state.lore.includes(entry.id) ? entry.title : "Undiscovered"}</span></button>)}</nav><section>{LORE.map((entry) => state.lore.includes(entry.id) && <article key={entry.id}><span>{entry.category}</span><h3>{entry.title}</h3><p>{entry.text}</p></article>)}</section></div>; }

function MapPanel({ state, onTravel }: { state: PlayState; onTravel: (id: LocationId) => void }) { return <div className="pt-map"><div className="pt-map-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M72 67C65 60 58 55 49 48S37 55 27 65M49 48C43 39 39 31 35 24"/><path className="glow" d="M72 67C65 60 58 55 49 48S37 55 27 65M49 48C43 39 39 31 35 24"/></svg>{Object.values(LOCATIONS).map((location) => { const check = canTravelTo(state, location.id); const clearedOrCurrent = state.location === location.id || location.id === "village" || (location.id === "forest" && state.questStage !== "not-started") || (location.id === "swamp" && state.clearedEncounters.includes("forest")) || (location.id === "ruins" && state.clearedEncounters.includes("swamp")); return <button key={location.id} className={`${state.location === location.id ? "current" : ""} ${!clearedOrCurrent ? "locked" : ""}`} style={{ left: `${location.x}%`, top: `${location.y}%`, "--node": location.accent } as React.CSSProperties} onClick={() => onTravel(location.id)}><i>{!clearedOrCurrent ? "×" : state.location === location.id ? "◆" : "●"}</i><span>{clearedOrCurrent ? location.name : "Unknown"}</span><small>{state.location === location.id ? "You are here" : check.allowed ? `${location.travelMinutes} min route` : check.reason}</small></button>; })}</div><footer><span><i className="current"/> Current</span><span><i/> Discovered</span><span><i className="locked"/> Locked</span></footer></div>; }

function DialogueModal({ dialogue, onChoice }: { dialogue: { key: DialogueKey; node: string }; onChoice: (choice: { label: string; next: string | null; action?: string }) => void }) {
  const script = DIALOGUES[dialogue.key] as unknown as { speaker: string; role: string; portrait: string; nodes: Record<string, { text: string; choices: { label: string; next: string | null; action?: string }[] }> };
  const node = script.nodes[dialogue.node];
  return <div className="pt-dialogue-backdrop"><section className="pt-dialogue"><div className="pt-dialogue-portrait"><span>{script.portrait}</span><i/></div><div className="pt-dialogue-content"><header><span>{script.role}</span><h2>{script.speaker}</h2></header><p>“{node.text}”</p><div>{node.choices.map((choice, index) => <button key={choice.label} onClick={() => onChoice(choice)}><kbd>{index + 1}</kbd><span>{choice.label}</span><b>›</b></button>)}</div></div></section></div>;
}

function ShopModal({ state, onClose, onBuy }: { state: PlayState; onClose: () => void; onBuy: (id: string) => void }) { return <div className="pt-panel-backdrop" onClick={onClose}><aside className="pt-shop" onClick={(event) => event.stopPropagation()}><header><div><span className="pt-kicker">Brackenmere forge</span><h2>Orrin's Goods</h2><p>“The road won't care how brave you are. Good steel might.”</p></div><button onClick={onClose}>×</button></header><div className="pt-shop-gold">Your purse <b>◆ {state.gold}</b></div><section>{SHOP_STOCK.map((id) => { const item = ITEMS[id]; return <article key={id}><i>{item.icon}</i><div><span>{item.type}</span><strong>{item.name}</strong><p>{item.description}</p><small>{item.damage ? `+${item.damage} weapon damage` : item.armor ? `+${item.armor} armor · +${item.health} vigor` : `Restores ${item.heal} vigor`}</small></div><button disabled={state.gold < item.price} onClick={() => onBuy(id)}>◆ {item.price}</button></article>; })}</section></aside></div>; }

function TravelTransition({ target }: { target: LocationId }) { return <div className="pt-travel"><div className="pt-travel-line"><i/><b>♦</b><i/></div><span>Following the old road</span><h2>{LOCATIONS[target].name}</h2><p>{LOCATIONS[target].travelMinutes} minutes travel</p></div>; }

function Ending({ state, onContinue, onNew, onExit }: { state: PlayState; onContinue: () => void; onNew: () => void; onExit: () => void }) { const minutes = Math.max(1, Math.round(state.playSeconds / 60)); return <main className="pt-ending"><div className="pt-ending-art"/><div className="pt-title-shade"/><section><span className="pt-kicker">Chapter I complete</span><h1>The bell rings again.</h1><p>Its voice rolls over Elderwood, across Blackwater, and through the broken Shanoir Gate. Somewhere impossibly far away, another bell answers.</p><div className="pt-ending-stats"><span><b>{minutes}m</b>Journey</span><span><b>{state.lore.length}/{LORE.length}</b>Lore</span><span><b>Lv. {state.level}</b>Wayfarer</span></div><div className="pt-ending-actions"><button className="primary" onClick={onContinue}>Keep exploring</button><button onClick={onNew}>Start over</button><button onClick={onExit}>Return to editor</button></div><small>Thank you for playtesting · Progress remains saved locally</small></section></main>; }
