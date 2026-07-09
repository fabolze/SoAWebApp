import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, buildApiUrl } from "../lib/api";
import { buildRelationshipIndex, summarizeEntryRelationships, type EntryRelationshipSummary, type InboundReference, type OutboundReference, type RelationshipGroup as RelationshipDataGroup } from "../relationships";
import type { ItemInspectorViewModel, ItemModifierView, ItemShopSource } from "../inspect/types";
import { AuthoringPageShell, AuthoringPanel, EmptyState, StatusNotice } from "../components/authoringUi";

function formatNumber(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPrice(value: number, symbol?: string | null, code?: string | null): string {
  const amount = formatNumber(value);
  if (symbol) return `${symbol}${amount}`;
  if (code) return `${amount} ${code}`;
  return amount;
}

function rarityClass(rarity?: string | null): string {
  switch ((rarity || "").toLowerCase()) {
    case "legendary":
      return "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
    case "epic":
      return "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-100";
    case "rare":
      return "border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100";
    case "uncommon":
      return "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100";
    default:
      return "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  }
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export default function ItemInspectorPage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<ItemInspectorViewModel | null>(null);
  const [relationships, setRelationships] = useState<EntryRelationshipSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`/api/ui/items/${encodeURIComponent(id)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "Item inspector load failed.");
        if (cancelled) return;
        setItem(payload as ItemInspectorViewModel);

        const index = await buildRelationshipIndex();
        const entry = index.entriesBySchemaAndId.get("items")?.get(id)?.entry;
        if (!cancelled && entry) {
          setRelationships(summarizeEntryRelationships(index, "items", entry));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Item inspector load failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const mechanicsFacts = useMemo(() => {
    if (!item) return [];
    return [
      { label: "Equipment Slot", value: item.equipment_slot },
      { label: "Weapon Type", value: item.weapon_type },
      { label: "Damage Type", value: item.damage_type },
      { label: "Range", value: item.weapon_range_type ? `${item.weapon_range_type} ${item.weapon_range ?? ""}`.trim() : "" },
    ].filter((fact) => isPresent(fact.value)).map((fact) => ({ label: fact.label, value: String(fact.value) }));
  }, [item]);

  if (loading) {
    return <AuthoringPageShell contentClassName="mx-auto w-full max-w-7xl space-y-4"><StatusNotice>Loading item inspector...</StatusNotice></AuthoringPageShell>;
  }

  if (error || !item) {
    return (
      <AuthoringPageShell contentClassName="mx-auto w-full max-w-7xl space-y-4">
        <StatusNotice tone="error">{error || "Item not found."}</StatusNotice>
        <Link className="mt-4 inline-flex text-sm font-medium text-blue-700 dark:text-blue-300" to="/items">Back to Items</Link>
      </AuthoringPageShell>
    );
  }

  return (
    <AuthoringPageShell contentClassName="mx-auto w-full max-w-7xl space-y-4">
        <div className={`rounded-md border p-4 shadow-sm ${rarityClass(item.rarity)}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-current/20 bg-white/60 dark:bg-black/20">
                {item.icon_path ? (
                  <img className="h-16 w-16 object-contain" src={buildApiUrl(`/${item.icon_path}`)} alt="" loading="lazy" />
                ) : (
                  <span className="text-2xl font-semibold">{item.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase opacity-80">
                  <span>{item.type}</span>
                  {item.rarity && <span>{item.rarity}</span>}
                  <span className="font-mono normal-case">{item.slug}</span>
                </div>
                <h1 className="mt-1 truncate text-3xl font-semibold" title={item.name}>{item.name}</h1>
                {item.description && <p className="mt-2 max-w-3xl text-sm leading-6 opacity-85">{item.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-current/20 bg-white/60 px-2 py-1 font-semibold dark:bg-black/20">
                    Base {formatPrice(item.base_price, item.base_currency?.symbol, item.base_currency?.code)}
                  </span>
                  <span className="rounded border border-current/20 bg-white/60 px-2 py-1 dark:bg-black/20">
                    Currency {item.base_currency?.name || item.base_currency?.code || "Default"}
                  </span>
                  {item.requirements && (
                    <span className="rounded border border-current/20 bg-white/60 px-2 py-1 dark:bg-black/20">
                      Locked by {item.requirements.slug}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(item.tags || []).map((tag) => <Badge key={tag} label={tag} />)}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link className="rounded-md border border-current/25 bg-white/70 px-3 py-2 text-sm font-medium hover:bg-white dark:bg-black/20 dark:hover:bg-black/30" to={`/author/items/${encodeURIComponent(item.id)}`}>
                Author Item
              </Link>
              <Link className="rounded-md border border-current/25 bg-white/70 px-3 py-2 text-sm font-medium hover:bg-white dark:bg-black/20 dark:hover:bg-black/30" to={`/items?selected=${encodeURIComponent(item.id)}`}>
                Inspect In Generic Editor
              </Link>
              <Link className="rounded-md border border-current/25 bg-white/70 px-3 py-2 text-sm font-medium hover:bg-white dark:bg-black/20 dark:hover:bg-black/30" to="/items">
                Item List
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Mechanics">
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact label="Base Price" value={formatPrice(item.base_price, item.base_currency?.symbol, item.base_currency?.code)} />
              <Fact label="Currency" value={item.base_currency?.name || item.base_currency?.code || "Default"} />
              {mechanicsFacts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}
            </div>
            {item.requirements && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <span className="font-semibold">Requirements:</span> {summarizeRequirement(item.requirements)}
              </div>
            )}
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Effects</h3>
              {item.effects.length === 0 ? <EmptyText title="No linked effects" text="Attach effects in item authoring when this item should change stats, attributes, or combat behavior." /> : (
                <div className="mt-2 grid gap-2">
                  {item.effects.map((effect) => (
                    <div key={effect.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{effect.name}</span>
                        <Badge label={effect.type || "effect"} />
                        {effect.target && <Badge label={effect.target} muted />}
                      </div>
                      {effect.description && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{effect.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Modifiers">
            <ModifierGroup title="Stats" modifiers={item.stat_modifiers} emptyTitle="No stat modifiers" empty="Add stat modifiers when this item should affect derived combat or economy values." />
            <div className="mt-3">
              <ModifierGroup title="Attributes" modifiers={item.attribute_modifiers} emptyTitle="No attribute modifiers" empty="Add attribute modifiers when this item should alter character attributes directly." />
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <Panel title="Sources">
            {item.shop_sources.length === 0 ? <EmptyText title="No shop sources" text="Add shop inventory entries in Item Ecosystem when this item should be available for purchase." /> : (
              <div className="grid gap-2">
                {item.shop_sources.map((source) => <ShopSourceRow key={source.inventory_id} source={source} />)}
              </div>
            )}
          </Panel>
          <Panel title="References">
            {!relationships ? <EmptyText title="No relationship scan" text="The relationship index did not return context for this item, so inbound and outbound links cannot be listed here." /> : (
              <div className="space-y-3">
                <RelationshipGroup title="Referenced by" groups={relationships.inbound} />
                <RelationshipGroup title="This item references" groups={relationships.outbound} />
                <RelatedGroup groups={relationships.related} />
              </div>
            )}
          </Panel>
        </div>
    </AuthoringPageShell>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuthoringPanel title={title}>
      {children}
    </AuthoringPanel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={value}>{value}</div>
    </div>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${muted ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-slate-900/10 text-current dark:bg-white/10"}`}>{label}</span>;
}

function EmptyText({ title, text }: { title: string; text: string }) {
  return <EmptyState title={title}>{text}</EmptyState>;
}

function ModifierGroup({ title, modifiers, emptyTitle, empty }: { title: string; modifiers: ItemModifierView[]; emptyTitle: string; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{title}</h3>
      {modifiers.length === 0 ? <EmptyState className="mt-2" variant="compact" title={emptyTitle}>{empty}</EmptyState> : (
        <div className="mt-2 space-y-2">
          {modifiers.map((modifier) => <ModifierRow key={`${modifier.kind}-${modifier.id}`} modifier={modifier} />)}
        </div>
      )}
    </div>
  );
}

function ModifierRow({ modifier }: { modifier: ItemModifierView }) {
  const sign = modifier.value > 0 ? "+" : "";
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{modifier.target_name || modifier.target_id}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge label={modifier.kind} muted />
            {modifier.value_type && <Badge label={modifier.value_type} />}
            {modifier.scaling && <Badge label={modifier.scaling} muted />}
          </div>
        </div>
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{sign}{formatNumber(modifier.value)}</div>
      </div>
      {modifier.notes && <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">{modifier.notes}</div>}
    </div>
  );
}

function ShopSourceRow({ source }: { source: ItemShopSource }) {
  const currency = source.currency;
  const base = source.pricing.breakdown.base_price ?? source.pricing.breakdown.shop?.starting_price ?? 0;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link className="truncate text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200" to={`/shops?selected=${encodeURIComponent(source.shop_id)}`}>
            {source.shop_name}
          </Link>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Stock: {source.stock ?? "Infinite"}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatPrice(source.pricing.buy_price, currency?.symbol, currency?.code)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Sell {formatPrice(source.pricing.sell_price, currency?.symbol, currency?.code)}</div>
        </div>
      </div>
      {source.requirements && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Requires {source.requirements.slug}
        </div>
      )}
      <div className="mt-2 grid gap-2 text-[11px] text-slate-600 dark:text-slate-400 sm:grid-cols-4">
        <PriceFact label="Base" value={formatPrice(base, currency?.symbol, currency?.code)} />
        <PriceFact label="Shop" value={formatLayer(source.pricing.breakdown.shop)} />
        <PriceFact label="Entry" value={formatLayer(source.pricing.breakdown.entry)} />
        <PriceFact label="Final" value={formatPrice(source.pricing.buy_price, currency?.symbol, currency?.code)} strong />
      </div>
    </div>
  );
}

function PriceFact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
      <div className="uppercase text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate ${strong ? "font-semibold text-slate-900 dark:text-slate-100" : ""}`} title={value}>{value}</div>
    </div>
  );
}

function formatLayer(layer: { multiplier?: number; modifier?: number; override?: number | null; applied_override?: boolean } | null | undefined): string {
  if (!layer) return "None";
  if (layer.applied_override && layer.override !== null && layer.override !== undefined) return `Override ${formatNumber(layer.override)}`;
  const multiplier = layer.multiplier ?? 1;
  const modifier = layer.modifier ?? 0;
  return `x${formatNumber(multiplier)} / ${modifier >= 0 ? "+" : ""}${formatNumber(modifier)}`;
}

function summarizeRequirement(requirement: { slug: string; required_flags: unknown[]; forbidden_flags: unknown[]; min_faction_reputation: unknown[] }): string {
  const parts = [
    requirement.required_flags.length ? `${requirement.required_flags.length} required flag${requirement.required_flags.length === 1 ? "" : "s"}` : "",
    requirement.forbidden_flags.length ? `${requirement.forbidden_flags.length} forbidden flag${requirement.forbidden_flags.length === 1 ? "" : "s"}` : "",
    requirement.min_faction_reputation.length ? `${requirement.min_faction_reputation.length} reputation gate${requirement.min_faction_reputation.length === 1 ? "" : "s"}` : "",
  ].filter(hasText);
  return parts.length ? `${requirement.slug} (${parts.join(", ")})` : requirement.slug;
}

type InspectorReference = InboundReference | OutboundReference;

function isOutboundReference(value: InspectorReference): value is OutboundReference {
  return "targetId" in value;
}

function RelationshipGroup({ title, groups }: { title: string; groups: Array<RelationshipDataGroup<InspectorReference>> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{title}</h3>
      {groups.length === 0 ? <EmptyState className="mt-2" variant="compact" title="No links found">No records in this relationship direction currently reference this item.</EmptyState> : (
        <div className="mt-2 space-y-2">
          {groups.slice(0, 5).map((group) => (
            <div key={`${title}-${group.schemaLabel}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{group.schemaLabel} ({group.count})</div>
              <div className="mt-1 space-y-1">
                {group.items.slice(0, 4).map((raw, index) => {
                  const targetEntry = isOutboundReference(raw) ? raw.targetEntry : undefined;
                  const sourceId = isOutboundReference(raw) ? raw.targetId : raw.sourceId;
                  const label = isOutboundReference(raw) ? targetEntry?.label || raw.targetId : raw.sourceEntryLabel;
                  const routePath = isOutboundReference(raw) ? targetEntry?.dataset.routePath || group.routePath : raw.routePath;
                  const broken = isOutboundReference(raw) && raw.broken;
                  return sourceId && routePath ? (
                    <Link key={`${sourceId}-${index}`} className={`block truncate text-xs ${broken ? "text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200" : "text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"}`} to={`/${routePath}?selected=${encodeURIComponent(sourceId)}`}>
                      {label}{broken ? " · broken" : ""}
                    </Link>
                  ) : <div key={index} className={`truncate text-xs ${broken ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400"}`}>{label}{broken ? " · broken" : ""}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelatedGroup({ groups }: { groups: EntryRelationshipSummary["related"] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Related quick links</h3>
      {groups.length === 0 ? <EmptyState className="mt-2" variant="compact" title="No related quick links">Related records appear after the relationship index finds nearby inbound or outbound links.</EmptyState> : (
        <div className="mt-2 flex flex-wrap gap-1">
          {groups.flatMap((group) => group.items.slice(0, 8)).slice(0, 16).map((entry) => (
            <Link
              key={`${entry.dataset.schemaName}-${entry.id}`}
              className="max-w-full truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-blue-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-slate-800"
              to={`/${entry.dataset.routePath}?selected=${encodeURIComponent(entry.id)}`}
            >
              {entry.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
