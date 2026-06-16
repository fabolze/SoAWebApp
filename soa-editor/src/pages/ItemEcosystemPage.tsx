import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDirtyState } from "../components/useDirtyState";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { getSimulationScenarioById, loadSimulationDatasets, SIMULATION_SCENARIOS, simulateEntity, type SimulationDatasets, type SimulationResult } from "../simulation";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import { CommaSeparatedInput, ReferenceManageLink, useReferenceOptions } from "../authoringViews/controls";
import {
  AUTHORING_INPUT_CLASS,
  AUTHORING_PANEL_CLASS,
  EmptyState,
  FieldCaption,
  NumberField,
  TextField,
} from "../components/authoringUi";

type NestedSourceKey = "combat_loot" | "quest_rewards" | "encounter_rewards" | "event_rewards";
interface SourceEntry { owner_id: string; entry: EntryRecord }
interface ItemPacket {
  item: EntryRecord;
  requirement: EntryRecord | null;
  sources: Record<string, unknown>;
  catalogs: Record<string, EntryRecord[]>;
  analysis: EntryRecord;
}

const sourceDefinitions: Array<{ key: NestedSourceKey; label: string; catalog: string; chance: boolean }> = [
  { key: "combat_loot", label: "Combat Loot", catalog: "combat_profiles", chance: true },
  { key: "quest_rewards", label: "Quest Rewards", catalog: "quests", chance: false },
  { key: "encounter_rewards", label: "Encounter Rewards", catalog: "encounters", chance: false },
  { key: "event_rewards", label: "Event Rewards", catalog: "events", chance: false },
];
function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rows(value: unknown): EntryRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function sourceRows(value: unknown): SourceEntry[] {
  return Array.isArray(value) ? value.filter((row): row is SourceEntry => isRecord(row) && typeof row.owner_id === "string" && isRecord(row.entry)) : [];
}
function text(value: unknown, fallback = ""): string { return value === null || value === undefined ? fallback : String(value) || fallback; }
function numberValue(value: unknown, fallback = 0): number { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function stable(value: unknown): string { return JSON.stringify(value ?? null); }
function label(row: EntryRecord | undefined, fallback = "Unknown"): string {
  if (!row) return fallback;
  const nested = isRecord(row.label) ? row.label : undefined;
  return text(row.name, text(row.title, text(nested?.name, text(row.slug, text(row.id, fallback)))));
}
function draftKey(id: string): string { return `soa.item-ecosystem.${id}`; }
function emptyPacket(): ItemPacket {
  return {
    item: {}, requirement: null,
    sources: { shop_inventory: [], combat_loot: [], quest_rewards: [], encounter_rewards: [], event_rewards: [], poi_ids: [] },
    catalogs: {}, analysis: {},
  };
}

export default function ItemEcosystemPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.includes("/items/new/ecosystem");
  const [packet, setPacket] = useState<ItemPacket>(emptyPacket);
  const [original, setOriginal] = useState<ItemPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [scenarioId, setScenarioId] = useState("loot_economy");
  const [datasets, setDatasets] = useState<SimulationDatasets | null>(null);
  const [activePanel, setActivePanel] = useState(isNew ? "Identity" : "Acquisition");
  const dirty = original !== null && stable(packet) !== stable(original);
  const { setDirty } = useDirtyState();
  const dirtySource = useRef(`item-ecosystem-${id}`);

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await apiFetch(isNew ? "/api/ui/items/ecosystem-new" : `/api/ui/items/ecosystem/${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(formatApiError(data, "Item ecosystem load failed."));
        const draft = localStorage.getItem(draftKey(isNew ? "new" : id));
        const next = draft ? JSON.parse(draft) as ItemPacket : data as ItemPacket;
        if (!cancelled) { setPacket(next); setOriginal(data as ItemPacket); }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Item ecosystem load failed.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    void loadSimulationDatasets().then(setDatasets);
    return () => { cancelled = true; };
  }, [id, isNew]);

  useEffect(() => {
    if (original && dirty) localStorage.setItem(draftKey(isNew ? "new" : id), JSON.stringify(packet));
  }, [dirty, id, isNew, original, packet]);

  const scenario = getSimulationScenarioById(scenarioId);
  const simulation = useMemo(() => datasets && packet.item.id ? simulateEntity({ schemaName: "items", entity: packet.item, datasets, scenario, runs: 80, seed: 17 }) : null, [datasets, packet.item, scenario]);
  const peerResults = useMemo(() => {
    if (!datasets) return [];
    return rows(packet.analysis.peers).map((peer) => ({
      peer,
      result: simulateEntity({ schemaName: "items", entity: peer, datasets, scenario, runs: 40, seed: 17 }),
    })).sort((a, b) => Math.abs((simulation?.metrics.power || 0) - a.result.metrics.power) - Math.abs((simulation?.metrics.power || 0) - b.result.metrics.power)).slice(0, 5);
  }, [datasets, packet.analysis.peers, scenario, simulation?.metrics.power]);

  const clientWarnings = useMemo(() => {
    const warnings = Array.isArray(packet.analysis.warnings) ? packet.analysis.warnings.map(String) : [];
    if (simulation?.warnings) warnings.push(...simulation.warnings);
    if (peerResults.length) {
      const medianPower = [...peerResults.map((peer) => peer.result.metrics.power)].sort((a, b) => a - b)[Math.floor(peerResults.length / 2)];
      const medianPeerPrice = numberValue(packet.analysis.median_peer_price);
      if (medianPeerPrice > 0 && (simulation?.metrics.power || 0) > 0 && numberValue(packet.item.base_price) / (simulation?.metrics.power || 1) > medianPeerPrice / Math.max(1, medianPower) * 1.5) {
        warnings.push("Price-to-power value is weak compared with peers.");
      }
    }
    return [...new Set(warnings.filter(Boolean))];
  }, [packet.analysis, packet.item.base_price, peerResults, simulation]);

  const blockers = useMemo(() => validatePacket(packet), [packet]);
  const updateItem = (patch: EntryRecord) => setPacket((current) => ({ ...current, item: { ...current.item, ...patch } }));
  const setSources = (key: string, value: unknown) => setPacket((current) => ({ ...current, sources: { ...current.sources, [key]: value } }));
  const save = async () => {
    if (blockers.length) {
      setActivePanel("Issues");
      setNotice("Resolve save blockers before saving the item ecosystem.");
      return;
    }
    setSaving(true); setNotice("");
    try {
      const response = await apiFetch("/api/ui/items/ecosystem/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: packet.item, requirement: packet.requirement, sources: packet.sources }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(formatApiError(data, "Atomic item ecosystem save failed."));
      setPacket(data as ItemPacket); setOriginal(data as ItemPacket); localStorage.removeItem(draftKey(isNew ? "new" : id)); setNotice("Item ecosystem saved atomically.");
      if (isNew) navigate(`/author/items/${encodeURIComponent(text((data as ItemPacket).item.id))}/ecosystem`, { replace: true });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Save failed."); }
    finally { setSaving(false); }
  };
  const reset = () => { if (original) { setPacket(original); localStorage.removeItem(draftKey(isNew ? "new" : id)); setNotice("Draft reset."); } };

  if (loading) return <div className="p-6 text-sm">Loading Item Ecosystem...</div>;
  return <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
    <div className="mx-auto max-w-7xl space-y-4">
      <header className={AUTHORING_PANEL_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">Item Ecosystem</div><h1 className="mt-1 text-3xl font-semibold">{text(packet.item.name, "Unnamed Item")}</h1><p className="mt-1 text-sm text-slate-500">Place, compare, validate, and save every acquisition reference for this item.</p></div>
          <div className="flex flex-wrap gap-2">
            {!isNew && <Link className="rounded-md border px-3 py-2 text-sm" to={`/author/items/${encodeURIComponent(id)}`}>Edit Mechanics</Link>}
            {!isNew && <Link className="rounded-md border px-3 py-2 text-sm" to={`/inspect/items/${encodeURIComponent(id)}`}>Inspect Item</Link>}
            {!isNew && <Link className="rounded-md border px-3 py-2 text-sm" to="/author/items/new/ecosystem">New Item</Link>}
            <button className="rounded-md border px-3 py-2 text-sm" onClick={reset}>Reset</button>
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!dirty || saving || blockers.length > 0} onClick={save}>{saving ? "Saving..." : "Save All"}</button>
          </div>
        </div>
        {notice && <div className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">{notice}</div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Fact label="Sources" value={text(packet.analysis.total_sources, "0")} />
          <Fact label="Base Price" value={text(packet.item.base_price, "0")} />
          <Fact label="Power" value={simulation ? simulation.metrics.power.toFixed(1) : "..."} />
          <Fact label="Peer Median Price" value={text(packet.analysis.median_peer_price, "0")} />
        </div>
      </header>

      <section className={AUTHORING_PANEL_CLASS}><label className="block"><FieldCaption>Open Existing Item</FieldCaption><select className={`${AUTHORING_INPUT_CLASS} normal-case`} value={isNew ? "" : id} onChange={(event) => { if (event.target.value) navigate(`/author/items/${encodeURIComponent(event.target.value)}/ecosystem`); }}><option value="">Select an existing item</option>{(packet.catalogs.items || []).map((item) => <option key={text(item.id)} value={text(item.id)}>{label(item)}</option>)}</select></label></section>

      <nav className="flex flex-wrap gap-2">{["Identity", "Acquisition", "Power", "Economy", "Progression", "Issues"].map((panel) => <button key={panel} className={`rounded-full border px-4 py-2 text-sm font-semibold ${activePanel === panel ? "border-primary bg-primary text-white" : "bg-white dark:bg-slate-900"}`} onClick={() => setActivePanel(panel)}>{panel}</button>)}</nav>

      {activePanel === "Identity" && <IdentityPanel packet={packet} updateItem={updateItem} />}
      {activePanel === "Acquisition" && <AcquisitionPanel packet={packet} setSources={setSources} />}
      {activePanel === "Power" && <PowerPanel simulation={simulation} peerResults={peerResults} scenarioId={scenarioId} setScenarioId={setScenarioId} />}
      {activePanel === "Economy" && <EconomyPanel packet={packet} updateItem={updateItem} setSources={setSources} simulation={simulation} />}
      {activePanel === "Progression" && <ProgressionPanel packet={packet} setSources={setSources} />}
      {activePanel === "Issues" && <IssuesPanel blockers={blockers} warnings={clientWarnings} packet={packet} />}
      {!isNew && text(packet.item.id) && <StoryPlacementPanel entityKind="item" entityId={text(packet.item.id)} entityLabel={text(packet.item.name, text(packet.item.id))} entity={packet.item} />}
    </div>
  </div>;
}

function IdentityPanel({ packet, updateItem }: { packet: ItemPacket; updateItem: (patch: EntryRecord) => void }) {
  return <div className="grid gap-4 lg:grid-cols-2"><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Identity</h2><div className="mt-3 space-y-3"><TextField label="Name" value={packet.item.name} onChange={(name) => updateItem({ name })} /><TextField label="Slug" value={packet.item.slug} onChange={(slug) => updateItem({ slug })} /><TextField label="Description" value={packet.item.description} onChange={(description) => updateItem({ description })} /></div></section><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Classification & Access</h2><div className="mt-3 space-y-3"><Select label="Type" value={text(packet.item.type)} options={["Weapon", "Armor", "Accessory", "Consumable", "Tool", "Material", "Upgrade", "Quest", "SetPiece", "Misc"].map((value) => ({ id: value, name: value }))} onChange={(type) => updateItem({ type })} /><Select label="Rarity" value={text(packet.item.rarity)} options={["Common", "Uncommon", "Rare", "Epic", "Legendary"].map((value) => ({ id: value, name: value }))} onChange={(rarity) => updateItem({ rarity })} /><Select label="Requirement" value={text(packet.item.requirements_id)} options={packet.catalogs.requirements || []} reference="requirements" allowEmpty onChange={(requirements_id) => updateItem({ requirements_id })} /><label className="block"><FieldCaption>Tags (comma separated)</FieldCaption><CommaSeparatedInput className={`${AUTHORING_INPUT_CLASS} normal-case`} values={packet.item.tags} onChange={(tags) => updateItem({ tags })} /></label></div></section></div>;
}

function AcquisitionPanel({ packet, setSources }: { packet: ItemPacket; setSources: (key: string, value: unknown) => void }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    <ShopSources rows={rows(packet.sources.shop_inventory)} shops={packet.catalogs.shops || []} itemId={text(packet.item.id)} onChange={(value) => setSources("shop_inventory", value)} />
    {sourceDefinitions.map((definition) => <NestedSources key={definition.key} definition={definition} rows={sourceRows(packet.sources[definition.key])} catalog={packet.catalogs[definition.catalog] || []} itemId={text(packet.item.id)} onChange={(value) => setSources(definition.key, value)} />)}
  </div>;
}

function ShopSources({ rows: values, shops, itemId, onChange }: { rows: EntryRecord[]; shops: EntryRecord[]; itemId: string; onChange: (rows: EntryRecord[]) => void }) {
  return <section className={AUTHORING_PANEL_CLASS}><PanelTitle title="Shop Inventory" count={values.length} onAdd={() => onChange([...values, { id: generateUlid(), slug: generateSlug(`item-shop-${Date.now()}`), shop_id: shops[0]?.id || "", item_id: itemId, price_modifier: 0, price_multiplier: 1, stock: null, tags: [] }])} />
    <div className="mt-3 space-y-3">{values.map((row, index) => <SourceCard key={text(row.id, String(index))} title={label(shops.find((shop) => shop.id === row.shop_id), text(row.shop_id))} onRemove={() => onChange(values.filter((_, rowIndex) => rowIndex !== index))}>
      <Select label="Shop" value={text(row.shop_id)} options={shops} reference="shops" onChange={(shop_id) => onChange(patchRow(values, index, { shop_id }))} />
      <div className="grid gap-2 sm:grid-cols-3"><NumberField label="Stock (blank = infinite)" value={row.stock} emptyValue="null" onChange={(stock) => onChange(patchRow(values, index, { stock }))} /><NumberField label="Multiplier" value={row.price_multiplier} emptyValue="null" onChange={(price_multiplier) => onChange(patchRow(values, index, { price_multiplier }))} /><NumberField label="Modifier" value={row.price_modifier} emptyValue="null" onChange={(price_modifier) => onChange(patchRow(values, index, { price_modifier }))} /></div>
      {isRecord(row.pricing) && <div className="text-xs text-slate-500">Current computed buy price: {text(row.pricing.buy_price)}</div>}
    </SourceCard>)}{values.length === 0 && <EmptyState>Not sold by any shop.</EmptyState>}</div>
  </section>;
}

function NestedSources({ definition, rows: values, catalog, itemId, onChange }: { definition: typeof sourceDefinitions[number]; rows: SourceEntry[]; catalog: EntryRecord[]; itemId: string; onChange: (rows: SourceEntry[]) => void }) {
  return <section className={AUTHORING_PANEL_CLASS}><PanelTitle title={definition.label} count={values.length} onAdd={() => onChange([...values, { owner_id: text(catalog[0]?.id), entry: { item_id: itemId, quantity: 1, ...(definition.chance ? { drop_chance: 100 } : {}) } }])} />
    <div className="mt-3 space-y-3">{values.map((row, index) => <SourceCard key={`${row.owner_id}-${index}`} title={label(catalog.find((owner) => owner.id === row.owner_id), row.owner_id)} onRemove={() => onChange(values.filter((_, rowIndex) => rowIndex !== index))}>
      <Select label="Source" value={row.owner_id} options={catalog} reference={definition.catalog} onChange={(owner_id) => onChange(patchSource(values, index, { owner_id }))} />
      <div className="grid gap-2 sm:grid-cols-2"><NumberField label="Quantity" value={row.entry.quantity} emptyValue="null" onChange={(quantity) => onChange(patchSourceEntry(values, index, { quantity }))} />{definition.chance && <NumberField label="Drop Chance %" value={row.entry.drop_chance} emptyValue="null" onChange={(drop_chance) => onChange(patchSourceEntry(values, index, { drop_chance }))} />}</div>
    </SourceCard>)}{values.length === 0 && <EmptyState>{`No ${definition.label.toLowerCase()} placements.`}</EmptyState>}</div>
  </section>;
}

function EconomyPanel({ packet, updateItem, setSources, simulation }: { packet: ItemPacket; updateItem: (patch: EntryRecord) => void; setSources: (key: string, value: unknown) => void; simulation: SimulationResult | null }) {
  const shopRows = rows(packet.sources.shop_inventory);
  return <div className="grid gap-4 lg:grid-cols-2"><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Canonical Economy</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><NumberField label="Base Price" value={packet.item.base_price} emptyValue="null" onChange={(base_price) => updateItem({ base_price })} /><Select label="Base Currency" value={text(packet.item.base_currency_id)} options={packet.catalogs.currencies || []} reference="currencies" allowEmpty onChange={(base_currency_id) => updateItem({ base_currency_id })} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Fact label="Simulation Value" value={simulation?.metrics.value.toFixed(1) || "..."} /><Fact label="Economy Score" value={simulation?.metrics.economy.toFixed(1) || "..."} /></div></section>
    <section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Shop Price Overrides</h2><div className="mt-3 space-y-2">{shopRows.map((row, index) => <div key={text(row.id)} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"><div className="text-sm font-semibold">{label((packet.catalogs.shops || []).find((shop) => shop.id === row.shop_id), text(row.shop_id))}</div><NumberField label="Final Override" value={row.price_override} emptyValue="null" onChange={(price_override) => setSources("shop_inventory", patchRow(shopRows, index, { price_override }))} /></div>)}{shopRows.length === 0 && <EmptyState>Add a shop source to tune final prices.</EmptyState>}</div></section></div>;
}

function ProgressionPanel({ packet, setSources }: { packet: ItemPacket; setSources: (key: string, value: unknown) => void }) {
  const selected = new Set(Array.isArray(packet.sources.poi_ids) ? packet.sources.poi_ids.map(String) : []);
  return <div className="grid gap-4 lg:grid-cols-2"><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">World Placements</h2><p className="mt-1 text-xs text-slate-500">Occupied POIs must be cleared from their current item before assignment.</p><div className="mt-3 space-y-2">{(packet.catalogs.pois || []).map((poi) => {
    const occupiedByOther = Boolean(poi.item_id && poi.item_id !== packet.item.id);
    return <label key={text(poi.id)} className={`flex items-center justify-between gap-3 rounded-md border p-3 ${occupiedByOther ? "opacity-50" : ""}`}><span><span className="block text-sm font-semibold">{label(poi)}</span><span className="text-xs text-slate-500">{isRecord(poi.location) ? label(poi.location) : text(poi.location_id)}</span></span><input type="checkbox" disabled={occupiedByOther} checked={selected.has(text(poi.id))} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(text(poi.id)); else next.delete(text(poi.id)); setSources("poi_ids", [...next]); }} /></label>;
  })}</div></section><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Progression Shape</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(packet.analysis.source_counts || {}).map(([key, value]) => <Fact key={key} label={key.replace(/_/g, " ")} value={text(value)} />)}</div><p className="mt-3 text-sm text-slate-500">Rarity: {text(packet.item.rarity, "Unset")} · Requirement: {text(packet.item.requirements_id, "None")}</p></section></div>;
}

function PowerPanel({ simulation, peerResults, scenarioId, setScenarioId }: { simulation: SimulationResult | null; peerResults: Array<{ peer: EntryRecord; result: SimulationResult }>; scenarioId: string; setScenarioId: (id: string) => void }) {
  return <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Simulation Scenario</h2><select className={`${AUTHORING_INPUT_CLASS} mt-3`} value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{SIMULATION_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select><div className="mt-3 grid gap-2 sm:grid-cols-2">{simulation && Object.entries(simulation.metrics).map(([key, value]) => <Fact key={key} label={key} value={value.toFixed(1)} />)}</div></section><section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Closest Type / Rarity Peers</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-slate-500"><th className="p-2">Item</th><th className="p-2">Price</th><th className="p-2">Power</th><th className="p-2">Value</th><th className="p-2">Economy</th></tr></thead><tbody>{peerResults.map(({ peer, result }) => <tr key={text(peer.id)} className="border-t"><td className="p-2 font-semibold">{label(peer)}</td><td className="p-2">{text(peer.base_price)}</td><td className="p-2">{result.metrics.power.toFixed(1)}</td><td className="p-2">{result.metrics.value.toFixed(1)}</td><td className="p-2">{result.metrics.economy.toFixed(1)}</td></tr>)}</tbody></table>{peerResults.length === 0 && <EmptyState>No same-type or same-rarity peers.</EmptyState>}</div></section></div>;
}

function IssuesPanel({ blockers, warnings, packet }: { blockers: string[]; warnings: string[]; packet: ItemPacket }) {
  return <section className={AUTHORING_PANEL_CLASS}><h2 className="font-semibold">Issues & Validation</h2><div className="mt-3 space-y-2">{blockers.map((blocker) => <div key={blocker} className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">Save blocker: {blocker}</div>)}{warnings.map((warning) => <div key={warning} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{warning}</div>)}{blockers.length === 0 && warnings.length === 0 && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950">No ecosystem warnings detected.</div>}</div><div className="mt-4 text-xs text-slate-500">Atomic save owns only references to {text(packet.item.name)} and preserves unrelated source content.</div></section>;
}

function validatePacket(packet: ItemPacket): string[] {
  const blockers: string[] = [];
  if (!text(packet.item.id)) blockers.push("Item ID is required.");
  if (!text(packet.item.name).trim()) blockers.push("Item name is required.");
  if (!text(packet.item.slug).trim()) blockers.push("Item slug is required.");
  if (!text(packet.item.type)) blockers.push("Item type is required.");
  if (numberValue(packet.item.base_price, -1) < 0) blockers.push("Base price must be zero or greater.");
  const knownIds = (key: string) => new Set((packet.catalogs[key] || []).map((row) => text(row.id)));
  const itemId = text(packet.item.id);
  rows(packet.sources.shop_inventory).forEach((row, index) => {
    if (!knownIds("shops").has(text(row.shop_id))) blockers.push(`Shop source ${index + 1} references a missing shop.`);
    if (text(row.item_id) !== itemId) blockers.push(`Shop source ${index + 1} references another item.`);
    if (row.stock !== null && row.stock !== undefined && numberValue(row.stock, -1) < 0) blockers.push(`Shop source ${index + 1} has invalid stock.`);
    if (numberValue(row.price_multiplier, -1) < 0) blockers.push(`Shop source ${index + 1} has invalid price multiplier.`);
  });
  sourceDefinitions.forEach((definition) => {
    const owners = knownIds(definition.catalog);
    sourceRows(packet.sources[definition.key]).forEach((source, index) => {
      if (!owners.has(source.owner_id)) blockers.push(`${definition.label} source ${index + 1} references a missing source.`);
      if (text(source.entry.item_id) !== itemId) blockers.push(`${definition.label} source ${index + 1} references another item.`);
      if (numberValue(source.entry.quantity, 0) <= 0) blockers.push(`${definition.label} source ${index + 1} needs a positive quantity.`);
      if (definition.chance && (numberValue(source.entry.drop_chance, -1) < 0 || numberValue(source.entry.drop_chance, 101) > 100)) blockers.push(`${definition.label} source ${index + 1} has an invalid drop chance.`);
    });
  });
  const pois = knownIds("pois");
  const poiIds = Array.isArray(packet.sources.poi_ids) ? packet.sources.poi_ids.map(String) : [];
  if (poiIds.some((id) => !pois.has(id))) blockers.push("World placements reference a missing POI.");
  if (new Set(poiIds).size !== poiIds.length) blockers.push("World placements contain duplicate POIs.");
  return [...new Set(blockers)];
}

function PanelTitle({ title, count, onAdd }: { title: string; count: number; onAdd: () => void }) { return <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title} ({count})</h2><button className="rounded-md border px-3 py-1.5 text-xs font-semibold" onClick={onAdd}>Add Source</button></div>; }
function SourceCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) { return <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700"><div className="flex justify-between gap-2"><div className="text-sm font-semibold">{title}</div><button className="text-xs text-red-600" onClick={onRemove}>Remove</button></div>{children}</div>; }
function Select({ label: fieldLabel, value, options, reference, onChange, allowEmpty = false }: { label: string; value: string; options: EntryRecord[]; reference?: string; onChange: (value: string) => void; allowEmpty?: boolean }) { const refreshed = useReferenceOptions(reference || ""); const resolved = refreshed.length ? refreshed : options; return <label className="block"><FieldCaption>{fieldLabel}</FieldCaption><select className={`${AUTHORING_INPUT_CLASS} normal-case`} value={value} onChange={(event) => onChange(event.target.value)}>{allowEmpty && <option value="">Unassigned</option>}{resolved.map((option) => <option key={text(option.id)} value={text(option.id)}>{label(option)}</option>)}</select>{reference && <ReferenceManageLink reference={reference} onCreated={onChange} />}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950"><div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>; }
function patchRow(values: EntryRecord[], index: number, patch: EntryRecord): EntryRecord[] { return values.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row); }
function patchSource(values: SourceEntry[], index: number, patch: Partial<SourceEntry>): SourceEntry[] { return values.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row); }
function patchSourceEntry(values: SourceEntry[], index: number, patch: EntryRecord): SourceEntry[] { return values.map((row, rowIndex) => rowIndex === index ? { ...row, entry: { ...row.entry, ...patch } } : row); }
