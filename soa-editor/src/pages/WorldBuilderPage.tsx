import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { buildProjectHealthSummary, type HealthIssue } from "../health/projectHealth";

type EntryRecord = Record<string, unknown>;

interface WorldBuilderPayload {
  locations: EntryRecord[];
  routes: EntryRecord[];
  pois: EntryRecord[];
  encounter_tables: EntryRecord[];
  route_event_bindings: EntryRecord[];
  travel_tuning: EntryRecord[];
  creative_briefs: EntryRecord[];
  warnings: EntryRecord[];
}

function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered || fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function label(entry: EntryRecord | undefined, fallback = "Untitled"): string {
  if (!entry) return fallback;
  return text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback))));
}

function entryId(entry: EntryRecord | undefined): string {
  return text(entry?.id);
}

function getTags(entry: EntryRecord | undefined): string[] {
  return Array.isArray(entry?.tags) ? entry.tags.map((tag) => text(tag)).filter(Boolean) : [];
}

function getEnvironmentTags(entry: EntryRecord | undefined): string[] {
  return Array.isArray(entry?.environment_tags) ? entry.environment_tags.map((tag) => text(tag)).filter(Boolean) : [];
}

function childrenOf(locations: EntryRecord[], parentId: string): EntryRecord[] {
  return locations
    .filter((location) => text(location.parent_location_id) === parentId)
    .sort((a, b) => numberValue(a.sort_order) - numberValue(b.sort_order) || label(a).localeCompare(label(b)));
}

function locationColor(type: string): string {
  switch (type) {
    case "World":
      return "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100";
    case "Continent":
    case "Region":
      return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
    case "Room":
    case "Interior":
      return "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
    default:
      return "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100";
  }
}

function routeMatchesLocation(route: EntryRecord, locationId: string): boolean {
  return text(route.from_location_id) === locationId || text(route.to_location_id) === locationId;
}

export default function WorldBuilderPage() {
  const [payload, setPayload] = useState<WorldBuilderPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [worldRes, health] = await Promise.all([
          apiFetch("/api/ui/world_builder"),
          buildProjectHealthSummary().catch(() => null),
        ]);
        const data = await worldRes.json();
        if (!worldRes.ok || !isRecord(data)) throw new Error("World builder data failed to load.");
        if (cancelled) return;
        const nextPayload: WorldBuilderPayload = {
          locations: Array.isArray(data.locations) ? data.locations.filter(isRecord) : [],
          routes: Array.isArray(data.routes) ? data.routes.filter(isRecord) : [],
          pois: Array.isArray(data.pois) ? data.pois.filter(isRecord) : [],
          encounter_tables: Array.isArray(data.encounter_tables) ? data.encounter_tables.filter(isRecord) : [],
          route_event_bindings: Array.isArray(data.route_event_bindings) ? data.route_event_bindings.filter(isRecord) : [],
          travel_tuning: Array.isArray(data.travel_tuning) ? data.travel_tuning.filter(isRecord) : [],
          creative_briefs: Array.isArray(data.creative_briefs) ? data.creative_briefs.filter(isRecord) : [],
          warnings: Array.isArray(data.warnings) ? data.warnings.filter(isRecord) : [],
        };
        setPayload(nextPayload);
        setHealthIssues(health?.issues.filter((issue) => issue.category === "world") ?? []);
        if (nextPayload.locations.length > 0) {
          setSelectedId((current) => current || entryId(nextPayload.locations[0]));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "World builder failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const locations = useMemo(() => payload?.locations ?? [], [payload]);
  const selected = useMemo(() => locations.find((location) => entryId(location) === selectedId), [locations, selectedId]);
  const selectedRoutes = useMemo(() => (payload?.routes ?? []).filter((route) => routeMatchesLocation(route, selectedId)), [payload, selectedId]);
  const selectedPois = useMemo(() => (payload?.pois ?? []).filter((poi) => text(poi.location_id) === selectedId), [payload, selectedId]);
  const selectedEncounterTables = useMemo(() => (payload?.encounter_tables ?? []).filter((table) => text(table.location_id) === selectedId), [payload, selectedId]);
  const selectedBriefs = useMemo(() => (payload?.creative_briefs ?? []).filter((brief) => text(brief.location_id) === selectedId), [payload, selectedId]);
  const selectedRouteIds = useMemo(() => new Set(selectedRoutes.map(entryId)), [selectedRoutes]);
  const selectedRouteEvents = useMemo(() => (payload?.route_event_bindings ?? []).filter((binding) => selectedRouteIds.has(text(binding.route_id))), [payload, selectedRouteIds]);
  const selectedTuning = useMemo(() => {
    const routeTypes = new Set(selectedRoutes.map((route) => text(route.route_type)).filter(Boolean));
    const placeKind = text(selected?.place_kind);
    const biome = text(selected?.effective_biome, text(selected?.biome));
    return (payload?.travel_tuning ?? []).filter((row) => {
      const rowRouteType = text(row.route_type);
      const rowPlaceKind = text(row.place_kind);
      const rowBiome = text(row.biome);
      return (!rowRouteType || routeTypes.has(rowRouteType)) && (!rowPlaceKind || rowPlaceKind === placeKind) && (!rowBiome || rowBiome === biome);
    });
  }, [payload, selected, selectedRoutes]);
  const selectedIssues = useMemo(() => healthIssues.filter((issue) => issue.entryId === selectedId || issue.path.includes(selectedId)), [healthIssues, selectedId]);

  if (loading) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading world builder...</div>;
  if (error) return <div className="p-6 text-sm text-red-700 dark:text-red-300">{error}</div>;

  return (
    <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">World Builder</div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">World-Building Workspace</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                <Badge>{locations.length} locations</Badge>
                <Badge>{payload?.pois.length ?? 0} POIs</Badge>
                <Badge>{payload?.encounter_tables.length ?? 0} encounter tables</Badge>
                <Badge>{healthIssues.length} world issues</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to="/author/locations/new">New Location</Link>
              <Link className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800" to="/locations">Open Generic Editors</Link>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Hierarchy</div>
            <div className="max-h-[720px] overflow-y-auto pr-1">
              {locations.filter((location) => !text(location.parent_location_id)).map((location) => (
                <HierarchyNode key={entryId(location)} location={location} locations={locations} selectedId={selectedId} onSelect={setSelectedId} depth={0} />
              ))}
              {locations.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No locations yet.</div>}
            </div>
          </section>

          <div className="space-y-4">
            <section className="relative h-[420px] overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,.16)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.16)_1px,transparent_1px)] bg-[size:40px_40px]" />
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {(payload?.routes ?? []).map((route) => {
                  const from = locations.find((location) => entryId(location) === text(route.from_location_id));
                  const to = locations.find((location) => entryId(location) === text(route.to_location_id));
                  if (!from || !to) return null;
                  const fromCoords = isRecord(from.coordinates) ? from.coordinates : {};
                  const toCoords = isRecord(to.coordinates) ? to.coordinates : {};
                  return (
                    <line
                      key={entryId(route)}
                      x1={Math.max(0, Math.min(100, numberValue(fromCoords.x, 50)))}
                      y1={Math.max(0, Math.min(100, numberValue(fromCoords.y, 50)))}
                      x2={Math.max(0, Math.min(100, numberValue(toCoords.x, 50)))}
                      y2={Math.max(0, Math.min(100, numberValue(toCoords.y, 50)))}
                      className="stroke-slate-500 dark:stroke-slate-500"
                      strokeWidth={selectedRouteIds.has(entryId(route)) ? 0.8 : 0.35}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>
              {locations.map((location) => {
                const coords = isRecord(location.coordinates) ? location.coordinates : {};
                const id = entryId(location);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`absolute max-w-[180px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border px-2 py-1 text-xs font-semibold shadow ${id === selectedId ? "border-blue-700 bg-blue-700 text-white" : locationColor(text(location.location_type, "Zone"))}`}
                    style={{ left: `${Math.max(0, Math.min(100, numberValue(coords.x, 50)))}%`, top: `${Math.max(0, Math.min(100, numberValue(coords.y, 50)))}%` }}
                    onClick={() => setSelectedId(id)}
                    title={label(location)}
                  >
                    {label(location)}
                  </button>
                );
              })}
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {selected ? (
                <LocationDetails
                  location={selected}
                  routes={selectedRoutes}
                  pois={selectedPois}
                  encounterTables={selectedEncounterTables}
                  routeEvents={selectedRouteEvents}
                  tuning={selectedTuning}
                  briefs={selectedBriefs}
                  issues={selectedIssues}
                />
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-300">Select a location to inspect its world-building packet.</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function HierarchyNode({ location, locations, selectedId, onSelect, depth }: { location: EntryRecord; locations: EntryRecord[]; selectedId: string; onSelect: (id: string) => void; depth: number }) {
  const id = entryId(location);
  const children = childrenOf(locations, id);
  return (
    <div>
      <button
        type="button"
        className={`mb-1 flex w-full items-center justify-between gap-2 rounded-md border px-2 py-2 text-left text-sm ${id === selectedId ? "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
        style={{ marginLeft: depth * 14 }}
        onClick={() => onSelect(id)}
      >
        <span className="min-w-0 truncate">{label(location)}</span>
        <span className="shrink-0 rounded bg-slate-900/10 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">{text(location.place_kind, text(location.location_type, "Zone"))}</span>
      </button>
      {children.map((child) => <HierarchyNode key={entryId(child)} location={child} locations={locations} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

function LocationDetails({ location, routes, pois, encounterTables, routeEvents, tuning, briefs, issues }: { location: EntryRecord; routes: EntryRecord[]; pois: EntryRecord[]; encounterTables: EntryRecord[]; routeEvents: EntryRecord[]; tuning: EntryRecord[]; briefs: EntryRecord[]; issues: HealthIssue[] }) {
  const id = entryId(location);
  const effectiveBiome = text(location.effective_biome, text(location.biome));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{text(location.location_type, "Location")} / {text(location.place_kind, "Unclassified")}</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">{label(location)}</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {[effectiveBiome, text(location.biome_inheritance, text(location.resolved_biome_inheritance)), text(location.region), ...getEnvironmentTags(location), ...getTags(location)].filter(Boolean).slice(0, 10).map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" to={`/author/locations/${encodeURIComponent(id)}`}>Edit Location</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Fact label="Routes" value={String(routes.length)} />
        <Fact label="POIs" value={String(pois.length)} />
        <Fact label="Effective Biome" value={effectiveBiome || "None"} />
        <Fact label="Issues" value={String(issues.length)} />
      </div>

      {text(location.description) && <Panel title="Overview"><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{text(location.description)}</p></Panel>}

      <Panel title="POIs / Interactables" link="/location-pois">
        <EntryList entries={pois} empty="No POIs for this location." detail={(entry) => text(entry.poi_type)} />
      </Panel>

      <Panel title="Encounter Placement" link="/location-encounter-tables">
        <EntryList entries={encounterTables} empty="No encounter tables for this location." detail={(entry) => `${Array.isArray(entry.encounter_entries) ? entry.encounter_entries.length : 0} weighted entries`} />
      </Panel>

      <Panel title="Routes And Route Events" link="/route-event-bindings">
        <EntryList entries={routes} empty="No connected routes." detail={(entry) => `${text(entry.route_type, "Route")} / ${numberValue(entry.travel_time)} time / ${numberValue(entry.travel_cost)} cost`} />
        {routeEvents.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800"><EntryList entries={routeEvents} empty="" detail={(entry) => `${text(entry.trigger_mode)} / ${numberValue(entry.chance, 100)}%`} /></div>}
      </Panel>

      <Panel title="Travel Tuning" link="/travel-tuning">
        <EntryList entries={tuning} empty="No matching travel tuning rows." detail={(entry) => `${text(entry.route_type, "Any route")} / ${text(entry.place_kind, "Any place")} / ${text(entry.biome, "Any biome")} / risk ${numberValue(entry.risk_score)}`} />
      </Panel>

      <Panel title="Creative Brief" link="/location-creative-briefs">
        {briefs.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No creative brief for this location.</div> : briefs.map((brief) => (
          <div key={entryId(brief)} className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            {text(brief.mood) && <p><span className="font-semibold">Mood:</span> {text(brief.mood)}</p>}
            {text(brief.visual_ideas) && <p><span className="font-semibold">Visual:</span> {text(brief.visual_ideas)}</p>}
            {text(brief.ambience_ideas) && <p><span className="font-semibold">Ambience:</span> {text(brief.ambience_ideas)}</p>}
            {text(brief.music_state) && <p><span className="font-semibold">Music:</span> {text(brief.music_state)}</p>}
          </div>
        ))}
      </Panel>

      <Panel title="Validation Issues">
        <EntryList entries={issues as unknown as EntryRecord[]} empty="No world validation issues for this location." detail={(entry) => text(entry.detail)} />
      </Panel>
    </div>
  );
}

function EntryList({ entries, empty, detail }: { entries: EntryRecord[]; empty: string; detail: (entry: EntryRecord) => string }) {
  if (entries.length === 0) return <div className="text-sm text-slate-500 dark:text-slate-400">{empty}</div>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {entries.map((entry, index) => (
        <div key={entryId(entry) || index} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label(entry, text(entry.title, "Entry"))}</div>
          <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">{detail(entry)}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, link, children }: { title: string; link?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {link && <Link className="text-xs font-medium text-blue-700 dark:text-blue-300" to={link}>Open editor</Link>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-100">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-slate-900/10 px-2 py-0.5 text-[11px] font-semibold text-current dark:bg-white/10">{children}</span>;
}
