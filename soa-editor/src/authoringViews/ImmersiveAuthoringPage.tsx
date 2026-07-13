import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import SchemaForm from "../components/SchemaForm";
import ScopedGateSection from "../components/authoring/ScopedGateSection";
import { AuthoringPageShell, AuthoringPanel, AuthoringStatusChip, EmptyState } from "../components/authoringUi";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch, buildApiUrl } from "../lib/api";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import type { SchemaDefinition } from "../components/schemaForm/types";
import { generateSlug, generateUlid } from "../utils/generateId";
import {
  EditableRequirementBlock,
  EditableTagList,
  InlineField,
  InlineFieldGrid,
  ReferenceChipPicker,
  ReferenceManageLink,
  SelectBadgeGroup,
  getOptions,
  isRecord as controlIsRecord,
  parseNumberInput,
  rowLabel,
  toNumberInput,
  useReferenceMap,
  useReferenceOptions,
} from "./controls";
import { readDraft, removeDraft } from "./worldAuthoringDrafts";
import CharacterCreatorPage from "./CharacterCreatorPage";

type AuthoringMode = "author" | "advanced";
type AuthoringKind = "item" | "shop" | "character" | "location" | "location-map";

interface AuthoringConfig {
  kind: AuthoringKind;
  schemaName: string;
  apiPath: string;
  listPath: string;
  title: string;
  accent: string;
  identityFields: string[];
  primaryFields: string[];
  secondaryFields: string[];
  detailFields: string[];
}

const AUTHORING_CONFIGS: Record<Exclude<AuthoringKind, "location-map">, AuthoringConfig> = {
  item: {
    kind: "item",
    schemaName: "items",
    apiPath: "items",
    listPath: "/items",
    title: "Item Authoring",
    accent: "amber",
    identityFields: ["name", "slug", "type", "rarity", "icon_path", "description", "tags"],
    primaryFields: ["base_price", "base_currency_id", "requirements_id"],
    secondaryFields: ["equipment_slot", "weapon_type", "damage_type", "weapon_range_type", "weapon_range", "effects"],
    detailFields: ["stat_modifiers", "attribute_modifiers"],
  },
  shop: {
    kind: "shop",
    schemaName: "shops",
    apiPath: "shops",
    listPath: "/shops",
    title: "Merchant Authoring",
    accent: "emerald",
    identityFields: ["name", "slug", "description", "tags"],
    primaryFields: ["currency_id", "location_id", "character_id", "requirements_id"],
    secondaryFields: ["price_modifier", "price_multiplier", "price_override", "price_modifiers"],
    detailFields: ["inventory"],
  },
  character: {
    kind: "character",
    schemaName: "characters",
    apiPath: "characters",
    listPath: "/characters",
    title: "Character Dossier",
    accent: "violet",
    identityFields: ["name", "slug", "title", "image_path", "description", "tags"],
    primaryFields: ["level", "class_id", "faction_id", "home_location_id"],
    secondaryFields: [],
    detailFields: [],
  },
  location: {
    kind: "location",
    schemaName: "locations",
    apiPath: "locations",
    listPath: "/locations",
    title: "Location Authoring",
    accent: "sky",
    identityFields: ["name", "slug", "description", "image_path", "tags"],
    primaryFields: ["location_type", "parent_location_id", "place_kind", "biome", "biome_inheritance", "biome_modifier", "region", "environment_tags", "level_range"],
    secondaryFields: ["coordinates", "sort_order", "is_playable_space", "is_world_map_node", "is_safe_zone", "is_fast_travel_point", "has_respawn_point"],
    detailFields: ["encounters"],
  },
};

function isRecord(value: unknown): value is EntryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyStable(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function displayText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function defaultPlaceKindForLocationType(locationType: string): string {
  if (["World", "Continent", "Region"].includes(locationType)) return "AbstractRegion";
  if (["Room", "Interior"].includes(locationType)) return "Interior";
  return "Wilderness";
}

function formatNumber(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function numericOr(value: unknown, fallback: number): number {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getRequiredFields(schema: SchemaDefinition | null): string[] {
  return Array.isArray(schema?.required) ? schema.required.filter((field): field is string => typeof field === "string") : [];
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function changedKeys(current: EntryRecord, original: EntryRecord): string[] {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(original || {})]);
  return Array.from(keys).filter((key) => stringifyStable(current[key]) !== stringifyStable(original[key]));
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function asErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const message = value.message ?? value.error;
  return typeof message === "string" && message.trim() ? message : null;
}

function makeNewEntryDefaults(config: AuthoringConfig): EntryRecord {
  const id = generateUlid();
  if (config.kind === "item") {
    return {
      id,
      slug: "",
      name: "",
      type: "Weapon",
      rarity: "Common",
      description: "",
      base_price: 0,
      effects: [],
      stat_modifiers: [],
      attribute_modifiers: [],
      tags: [],
    };
  }
  if (config.kind === "shop") {
    return {
      id,
      slug: "",
      name: "",
      description: "",
      price_modifier: 0,
      price_multiplier: 1,
      inventory: [],
      price_modifiers: [],
      tags: [],
    };
  }
  if (config.kind === "character") {
    return {
      id,
      slug: "",
      name: "",
      title: "",
      description: "",
      level: 1,
      tags: [],
    };
  }
  if (config.kind === "location") {
    return {
      id,
      slug: "",
      name: "",
      description: "",
      biome: "",
      location_type: "Zone",
      place_kind: defaultPlaceKindForLocationType("Zone"),
      environment_tags: [],
      biome_inheritance: "",
      region: "",
      sort_order: 0,
      is_playable_space: true,
      is_world_map_node: true,
      level_range: { min: 1, max: 5 },
      coordinates: { x: 50, y: 50 },
      encounters: [],
      is_safe_zone: false,
      is_fast_travel_point: false,
      has_respawn_point: false,
      tags: [],
    };
  }
  return { id };
}

function getAuthoringPath(kind: AuthoringKind, id: string): string {
  const encoded = encodeURIComponent(id);
  if (kind === "item") return `/author/items/${encoded}`;
  if (kind === "shop") return `/author/shops/${encoded}`;
  if (kind === "character") return `/author/characters/${encoded}`;
  if (kind === "location") return `/author/locations/${encoded}`;
  return "/";
}

function focusedFieldClass(fieldKey: string, focusField: string): string {
  return fieldKey === focusField
    ? "rounded-md border border-amber-300 bg-amber-50 p-2 ring-2 ring-amber-200 dark:border-amber-700 dark:bg-amber-950/30 dark:ring-amber-900"
    : "";
}

function focusFieldFromSearch(search: string): string {
  const field = new URLSearchParams(search).get("field") || "";
  const matches = field.match(/[A-Za-z0-9_]+/g);
  return matches?.[matches.length - 1] || "";
}

export function ItemAuthoringPage() {
  return <ImmersiveAuthoringPage config={AUTHORING_CONFIGS.item} />;
}

export function ShopAuthoringPage() {
  return <ImmersiveAuthoringPage config={AUTHORING_CONFIGS.shop} />;
}

export function CharacterAuthoringPage() {
  return <CharacterCreatorPage />;
}

export function LocationAuthoringPage() {
  return <ImmersiveAuthoringPage config={AUTHORING_CONFIGS.location} />;
}

export function LocationMapAuthoringPage() {
  return <LocationAtlasPage />;
}

function ImmersiveAuthoringPage({ config }: { config: AuthoringConfig }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNewDraft = id === "new" || location.pathname.endsWith("/new");
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [data, setData] = useState<EntryRecord>({});
  const [original, setOriginal] = useState<EntryRecord>({});
  const [mode, setMode] = useState<AuthoringMode>("author");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const dirtySource = useRef(`immersive-author-${config.schemaName}-${id}`);
  const { setDirty } = useDirtyState();

  const serializedOriginal = useMemo(() => stringifyStable(original), [original]);
  const serializedData = useMemo(() => stringifyStable(data), [data]);
  const isDirty = serializedData !== serializedOriginal;
  const changedFieldKeys = useMemo(() => changedKeys(data, original), [data, original]);
  const requiredFields = useMemo(() => getRequiredFields(schema), [schema]);
  const missingRequiredFields = useMemo(() => requiredFields.filter((field) => isEmpty(data[field])), [data, requiredFields]);
  const formValid = missingRequiredFields.length === 0;
  const label = displayText(data.name, displayText(data.title, displayText(data.slug, id || "Untitled")));
  const focusField = useMemo(() => focusFieldFromSearch(location.search), [location.search]);
  const returnTo = useMemo(() => {
    const value = new URLSearchParams(location.search).get("returnTo");
    return value?.startsWith("/") ? value : "";
  }, [location.search]);

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, isDirty);
    return () => setDirty(source, false);
  }, [isDirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const localDraft = !isNewDraft && id ? readDraft(config.schemaName, id) : null;
        const [schemaModule, response] = await Promise.all([
          import(`../../../backend/app/schemas/${config.schemaName}.json`),
          isNewDraft || localDraft ? Promise.resolve(null) : apiFetch(`/api/${config.apiPath}/${encodeURIComponent(id)}`),
        ]);
        if (cancelled) return;
        const moduleWithDefault = schemaModule as { default?: SchemaDefinition };
        setSchema(moduleWithDefault.default ?? (schemaModule as SchemaDefinition));
        if (isNewDraft) {
          const draft = makeNewEntryDefaults(config);
          setData(draft);
          setOriginal(draft);
          return;
        }
        if (localDraft) {
          setData(localDraft);
          setOriginal(localDraft);
          return;
        }
        if (!response) throw new Error(`${config.title} entry not found.`);
        const payload = await readJsonSafe(response);
        if (!response.ok || !isRecord(payload)) {
          throw new Error(asErrorMessage(payload) || `${config.title} entry not found.`);
        }
        setData(payload);
        setOriginal(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Authoring view failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [config, config.apiPath, config.schemaName, config.title, id, isNewDraft]);

  useEffect(() => {
    if (loading || mode !== "author" || !focusField) return;
    const selector = `[data-authoring-field="${focusField}"]`;
    const target = document.querySelector(selector);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusField, loading, mode]);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/${config.apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        throw new Error(asErrorMessage(payload) || "Save failed.");
      }
      const savedId = displayText(data.id, id);
      const refresh = await apiFetch(`/api/${config.apiPath}/${encodeURIComponent(savedId)}`);
      const refreshedPayload = await readJsonSafe(refresh);
      const saved = refresh.ok && isRecord(refreshedPayload) ? refreshedPayload : data;
      setData(saved);
      setOriginal(saved);
      if (savedId) removeDraft(config.schemaName, savedId);
      setNotice({ type: "success", message: "Saved successfully." });
      if (returnTo) {
        navigate(returnTo);
        return;
      }
      if (isNewDraft && savedId) {
        navigate(getAuthoringPath(config.kind, savedId), { replace: true });
      }
    } catch (err) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }, [config.apiPath, config.kind, config.schemaName, data, id, isNewDraft, navigate, returnTo]);

  const reset = useCallback(() => {
    setData(original);
    setNotice({ type: "success", message: "Draft reset to last saved state." });
  }, [original]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading {config.title.toLowerCase()}...</div>;
  }

  if (error || !schema) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error || "Authoring view unavailable."}
        </div>
        <Link className="mt-4 inline-flex text-sm font-medium text-blue-700 dark:text-blue-300" to={config.listPath}>
          Back to editor
        </Link>
      </div>
    );
  }

  return (
    <AuthoringPageShell>
        <AuthoringHeader
          config={config}
          data={data}
          label={label}
          mode={mode}
          setMode={setMode}
          isDirty={isDirty}
          missingRequiredFields={missingRequiredFields}
          saving={saving}
          formValid={formValid}
          onSave={save}
          onReset={reset}
        />

        {notice && (
          <div className={`rounded-md border px-4 py-2 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}>
            {notice.message}
          </div>
        )}

        {mode === "advanced" ? (
          <AuthoringPanel
            title="Advanced Details"
            subtitle="Complete technical fallback for fields that do not yet have a focused authoring control."
            help="Use this when a field is missing from the main authoring workflow. Changes here save to the same record as the focused authoring view."
            status={<AuthoringStatusChip tone={changedFieldKeys.length > 0 ? "warning" : "success"}>{changedFieldKeys.length} changed</AuthoringStatusChip>}
          >
            <SchemaForm
              schema={schema}
              schemaName={config.schemaName}
          data={data}
          onChange={(next) => setData(next)}
              changedFieldKeys={changedFieldKeys}
            />
          </AuthoringPanel>
        ) : (
          <div className="space-y-4">
            <EntityAuthoringSurface
              config={config}
              schema={schema}
              data={data}
              onChange={(next) => setData(next)}
              changedFieldKeys={changedFieldKeys}
              persisted={!isNewDraft}
              isDirty={isDirty}
              focusField={focusField}
            />
            {config.kind === "shop" && !isNewDraft && displayText(data.id) && <ScopedGateSection
              targetSchema="shops"
              targetId={displayText(data.id)}
              targetLabel={displayText(data.name, displayText(data.id))}
              requirementId={displayText(data.requirements_id)}
              title="Shop Access Gate"
              subtitle="Create or reuse the player-state requirement that unlocks this merchant."
              tag="shop-gate"
              onRequirementCommitted={(requirements_id) => {
                setData((current) => ({ ...current, requirements_id }));
                setOriginal((current) => ({ ...current, requirements_id }));
              }}
            />}
          </div>
        )}

        <AuthoringSaveBar
          isDirty={isDirty}
          saving={saving}
          formValid={formValid}
          missingRequiredFields={missingRequiredFields}
          onSave={save}
          onReset={reset}
          listPath={`${config.listPath}?selected=${encodeURIComponent(displayText(data.id, id))}`}
        />
    </AuthoringPageShell>
  );
}

function AuthoringHeader({
  config,
  data,
  label,
  mode,
  setMode,
  isDirty,
  missingRequiredFields,
  saving,
  formValid,
  onSave,
  onReset,
}: {
  config: AuthoringConfig;
  data: EntryRecord;
  label: string;
  mode: AuthoringMode;
  setMode: (mode: AuthoringMode) => void;
  isDirty: boolean;
  missingRequiredFields: string[];
  saving: boolean;
  formValid: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const imagePath = displayText(data.icon_path || data.image_path);
  const subtitle = [data.type, data.rarity, data.role, data.place_kind, data.biome, data.region].map((value) => displayText(value)).filter(Boolean).slice(0, 3);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-slate-50 text-2xl font-semibold text-slate-800 dark:bg-slate-950 dark:text-slate-100 ${accentBorder(config.accent)}`}>
            {imagePath ? <img className="h-16 w-16 object-contain" src={buildApiUrl(`/${imagePath}`)} alt="" /> : label.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              <span>{config.title}</span>
              <span className={statusBadgeClass(isDirty, missingRequiredFields.length > 0)}>
                {missingRequiredFields.length > 0 ? "Needs fields" : isDirty ? "Unsaved" : "Saved"}
              </span>
              {displayText(data.slug) && <span className="font-mono normal-case">{displayText(data.slug)}</span>}
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950 dark:text-slate-100" title={label}>{label}</h1>
            {subtitle.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {subtitle.map((part) => <Badge key={part} label={part} />)}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
            {(["author", "advanced"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium ${mode === nextMode ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
                onClick={() => setMode(nextMode)}
              >
                {nextMode === "author" ? "Author Mode" : "Advanced Details"}
              </button>
            ))}
          </div>
          <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!isDirty || saving} onClick={onReset}>
            Reset
          </button>
          <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!formValid || saving} onClick={onSave}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

function EntityAuthoringSurface({
  config,
  schema,
  data,
  onChange,
  changedFieldKeys,
  persisted,
  isDirty,
  focusField = "",
}: {
  config: AuthoringConfig;
  schema: SchemaDefinition;
  data: EntryRecord;
  onChange: (next: EntryRecord) => void;
  changedFieldKeys: string[];
  persisted: boolean;
  isDirty: boolean;
  focusField?: string;
}) {
  if (config.kind === "shop") {
    return <ShopAuthoringSurface config={config} schema={schema} data={data} onChange={onChange} changedFieldKeys={changedFieldKeys} persisted={persisted} />;
  }
  if (config.kind === "character") {
    return <CharacterAuthoringSurface config={config} schema={schema} data={data} onChange={onChange} changedFieldKeys={changedFieldKeys} persisted={persisted} />;
  }
  if (config.kind === "location") {
    return <LocationAuthoringSurface config={config} schema={schema} data={data} onChange={onChange} changedFieldKeys={changedFieldKeys} persisted={persisted} isDirty={isDirty} focusField={focusField} />;
  }
  return <ItemAuthoringSurface config={config} schema={schema} data={data} onChange={onChange} changedFieldKeys={changedFieldKeys} persisted={persisted} />;
}

function setRow(rows: EntryRecord[], index: number, patch: EntryRecord): EntryRecord[] {
  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
}

function removeRow(rows: EntryRecord[], index: number): EntryRecord[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function getRows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(controlIsRecord) : [];
}

function countValues(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function itemCurrencyLabel(data: EntryRecord): string {
  return displayText(data.base_currency_id, "default currency");
}

function shopInventoryCurrencyLabel(item: EntryRecord | undefined, shop: EntryRecord, row: EntryRecord): string {
  return displayText(row.currency_id, displayText(shop.currency_id, displayText(item?.base_currency_id, "default currency")));
}

function modifierValueLabel(row: EntryRecord): string {
  const value = Number(row.value ?? 0);
  const sign = value > 0 ? "+" : "";
  const mode = displayText(row.value_type || row.scaling, "Flat");
  if (mode === "Percentage") return `${sign}${formatNumber(value)}%`;
  if (mode === "Multiplier") return `x${formatNumber(value)}`;
  return `${sign}${formatNumber(value)}`;
}

function ItemAuthoringSurface(props: AuthoringSurfaceProps) {
  const { schema, data, onChange, persisted } = props;
  const typeOptions = getOptions(schema.properties?.type);
  const rarityOptions = getOptions(schema.properties?.rarity);
  const weaponTypeOptions = getOptions(schema.properties?.weapon_type);
  const damageTypeOptions = getOptions(schema.properties?.damage_type);
  const rangeTypeOptions = getOptions(schema.properties?.weapon_range_type);
  const slotOptions = getOptions(schema.properties?.equipment_slot);
  const showEquipment = ["Weapon", "Armor", "Accessory", "SetPiece", "Tool"].includes(displayText(data.type));
  const showWeapon = displayText(data.type) === "Weapon";
  const effectCount = countValues(data.effects);
  const statCount = countValues(data.stat_modifiers);
  const attributeCount = countValues(data.attribute_modifiers);
  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="lg:col-span-2">
        {persisted && <Link
          className={`${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.sm}`}
          to={`/author/items/${encodeURIComponent(displayText(data.id))}/ecosystem`}
        >
          Review Acquisition Ecosystem
        </Link>}
        {!persisted && (
          <Link className={`ml-2 ${BUTTON_CLASSES.neutral} ${BUTTON_SIZES.sm}`} to="/author/items/new/ecosystem">
            Create With Ecosystem
          </Link>
        )}
      </div>
      <AuthoringPanel id="item-card" title="Item Card" subtitle="Edit the player-facing identity exactly where it is previewed." help="Use this panel for the item name, type, rarity, icon, tags, and description authors see in previews. It saves the item record, not shop inventory or reward placement." status={<AuthoringStatusChip tone={displayText(data.name) ? "success" : "warning"}>{displayText(data.name) ? "named" : "needs name"}</AuthoringStatusChip>}>
        <RpgItemPreview data={data} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Value" value={`${formatNumber(data.base_price)} ${itemCurrencyLabel(data)}`} />
          <Fact label="Effects" value={String(effectCount)} />
          <Fact label="Modifiers" value={`${statCount + attributeCount} total`} />
        </div>
        <div className="mt-4 space-y-4">
          <InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="name" label="Item Name" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="slug" label="Slug" onChange={onChange} />
          </InlineFieldGrid>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <SelectBadgeGroup label="Item Type" value={data.type} options={typeOptions} onChange={(value) => onChange({ ...data, type: value })} />
            <div className="mt-3">
              <SelectBadgeGroup label="Rarity" value={data.rarity} options={rarityOptions} onChange={(value) => onChange({ ...data, rarity: value })} />
            </div>
          </div>
          <InlineField schema={schema} data={data} fieldKey="icon_path" label="Icon Path" onChange={onChange} />
          <InlineField schema={schema} data={data} fieldKey="description" label="Description" kind="textarea" onChange={onChange} />
          <EditableTagList tags={data.tags} onChange={(tags) => onChange({ ...data, tags })} />
        </div>
      </AuthoringPanel>
      <div className="space-y-4">
        <AuthoringPanel id="economy-access" title="Economy And Access" subtitle="Baseline value, currency and unlock requirement." help="Use this when the item needs a default value or player-facing unlock condition. Shops and rewards can still override how the item is granted." status={<AuthoringStatusChip tone={displayText(data.requirements_id) ? "info" : "neutral"}>{displayText(data.requirements_id) ? "locked" : "open"}</AuthoringStatusChip>} collapsible collapsedSummary={`${formatNumber(data.base_price)} ${itemCurrencyLabel(data)}${displayText(data.requirements_id) ? ", unlock required" : ""}`} storageKey={`authoring:${displayText(data.id, "new")}:economy-access`}>
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="font-semibold">{formatNumber(data.base_price)} {itemCurrencyLabel(data)}</div>
            <div className="mt-1 text-xs opacity-80">This is the default value shops and rewards build from.</div>
          </div>
          <InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="base_price" label="Base Price" kind="number" onChange={onChange} />
            <ReferenceChipPicker label="Base Currency" value={data.base_currency_id} reference="currencies" onChange={(value) => onChange({ ...data, base_currency_id: value })} />
          </InlineFieldGrid>
          <div className="mt-3">
            <EditableRequirementBlock value={data.requirements_id} onChange={(value) => onChange({ ...data, requirements_id: value })} />
          </div>
        </AuthoringPanel>
        <AuthoringPanel id="mechanics" title="Mechanics" subtitle="Weapon, equipment and effect behavior." help="Use this panel for gameplay behavior attached directly to the item. It does not place the item in shops, quests, or encounters." status={<AuthoringStatusChip tone={effectCount > 0 ? "info" : "neutral"}>{effectCount} effects</AuthoringStatusChip>} collapsible collapsedSummary={`${displayText(data.type, "Item")} with ${effectCount} effect${effectCount === 1 ? "" : "s"}`} storageKey={`authoring:${displayText(data.id, "new")}:mechanics`}>
          {showEquipment ? (
            <div className="space-y-4">
              <SelectBadgeGroup label="Equipment Slot" value={data.equipment_slot} options={slotOptions} onChange={(value) => onChange({ ...data, equipment_slot: value })} />
              {showWeapon && (
                <>
                  <SelectBadgeGroup label="Weapon Type" value={data.weapon_type} options={weaponTypeOptions} onChange={(value) => onChange({ ...data, weapon_type: value })} />
                  <SelectBadgeGroup label="Damage Type" value={data.damage_type} options={damageTypeOptions} onChange={(value) => onChange({ ...data, damage_type: value })} />
                  <InlineFieldGrid>
                    <InlineField schema={schema} data={data} fieldKey="weapon_range" label="Range" kind="number" onChange={onChange} />
                    <SelectBadgeGroup label="Range Type" value={data.weapon_range_type} options={rangeTypeOptions} onChange={(value) => onChange({ ...data, weapon_range_type: value })} />
                  </InlineFieldGrid>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {displayText(data.type, "This item type")} does not use equipment or weapon fields. Use effects, requirements, tags, and description for its gameplay behavior.
            </div>
          )}
          <div className="mt-4">
            <ReferenceArrayPicker label="Effects" reference="effects" values={data.effects} onChange={(effects) => onChange({ ...data, effects })} />
          </div>
        </AuthoringPanel>
        <AuthoringPanel id="modifiers" title="Modifiers" subtitle="Build equipment-style stat and attribute bonuses without opening Advanced Details." help="Use this for bonuses that apply through equipped or carried item behavior. Add effects instead when the item should trigger an action or status." status={<AuthoringStatusChip tone={statCount + attributeCount > 0 ? "info" : "neutral"}>{statCount + attributeCount} modifiers</AuthoringStatusChip>} collapsible defaultCollapsed={statCount + attributeCount === 0} collapsedSummary={`${statCount} stat and ${attributeCount} attribute modifiers`} storageKey={`authoring:${displayText(data.id, "new")}:modifiers`}>
          <ModifierEditor
            title="Stat Modifiers"
            rows={getRows(data.stat_modifiers)}
            reference="stats"
            targetField="stat_id"
            scalingField="scaling_behavior"
            onChange={(rows) => onChange({ ...data, stat_modifiers: rows })}
          />
          <div className="mt-4">
            <ModifierEditor
              title="Attribute Modifiers"
              rows={getRows(data.attribute_modifiers)}
              reference="attributes"
              targetField="attribute_id"
              scalingField="scaling"
              onChange={(rows) => onChange({ ...data, attribute_modifiers: rows })}
            />
          </div>
        </AuthoringPanel>
      </div>
    </div>
  );
}

function ShopAuthoringSurface(props: AuthoringSurfaceProps) {
  const { schema, data, onChange } = props;
  const [items, setItems] = useState<EntryRecord[]>([]);
  const inventoryRows = getRows(data.inventory);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/items")
      .then((res) => res.json())
      .then((payload) => {
        if (!cancelled && Array.isArray(payload)) setItems(payload.filter(isRecord));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <AuthoringPanel id="merchant-front" title="Merchant Front" subtitle="Edit the shop identity and world context." help="Use this for the shop's name, description, shopkeeper, location, default currency, and unlock requirement. Inventory stock is edited separately." status={<AuthoringStatusChip tone={displayText(data.name) ? "success" : "warning"}>{displayText(data.name) ? "named" : "needs name"}</AuthoringStatusChip>}>
          <MerchantPreview data={data} />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Fact label="Inventory" value={`${inventoryRows.length} row${inventoryRows.length === 1 ? "" : "s"}`} />
            <Fact label="Currency" value={displayText(data.currency_id, "default currency")} />
            <Fact label="Shop Layer" value={shopPricingSummary(data)} />
          </div>
          <div className="mt-4 space-y-4">
            <InlineFieldGrid>
              <InlineField schema={schema} data={data} fieldKey="name" label="Shop Name" onChange={onChange} />
              <InlineField schema={schema} data={data} fieldKey="slug" label="Slug" onChange={onChange} />
            </InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="description" label="Description" kind="textarea" onChange={onChange} />
            <EditableTagList tags={data.tags} onChange={(tags) => onChange({ ...data, tags })} />
            <InlineFieldGrid>
              <ReferenceChipPicker label="Shopkeeper" value={data.character_id} reference="characters" onChange={(value) => onChange({ ...data, character_id: value })} />
              <ReferenceChipPicker label="Location" value={data.location_id} reference="locations" onChange={(value) => onChange({ ...data, location_id: value })} />
              <ReferenceChipPicker label="Default Currency" value={data.currency_id} reference="currencies" onChange={(value) => onChange({ ...data, currency_id: value })} />
            </InlineFieldGrid>
            <EditableRequirementBlock value={data.requirements_id} onChange={(value) => onChange({ ...data, requirements_id: value })} />
          </div>
        </AuthoringPanel>
        <AuthoringPanel id="pricing-rules" title="Pricing Rules" subtitle="Shop-level rules apply before inventory item overrides." help="Use this panel to set broad markup, discount, or override behavior for the whole shop. Individual inventory rows can still set their own price." collapsible collapsedSummary={shopPricingSummary(data)} storageKey={`authoring:${displayText(data.id, "new")}:pricing-rules`}>
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="font-semibold">{shopPricingSummary(data)}</div>
            <div className="mt-1 text-xs opacity-80">Every inventory row starts with item base value, then applies this shop layer, then its own row layer.</div>
          </div>
          <InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="price_multiplier" label="Shop Multiplier" kind="number" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="price_modifier" label="Shop Modifier" kind="number" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="price_override" label="Global Override" kind="number" onChange={onChange} />
          </InlineFieldGrid>
          <div className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Dynamic price rules are still available in Advanced Details until they receive a dedicated rule builder.
          </div>
        </AuthoringPanel>
      </div>
      <AuthoringPanel id="inventory-counter" title="Inventory Counter" subtitle="Add, remove and tune stock directly in the shop surface." help="Use this for what the merchant sells and any stock-specific price or quantity rules. It saves inventory entries inside the shop record." status={<AuthoringStatusChip tone={inventoryRows.length > 0 ? "info" : "warning"}>{inventoryRows.length} items</AuthoringStatusChip>}>
        <ShopInventoryEditor
          rows={inventoryRows}
          items={items}
          shop={data}
          onChange={(inventory) => onChange({ ...data, inventory })}
        />
      </AuthoringPanel>
    </div>
  );
}

function CharacterAuthoringSurface(props: AuthoringSurfaceProps) {
  const { schema, data, onChange, persisted } = props;
  const [context, setContext] = useState<{ character?: EntryRecord | null; combat_profile?: EntryRecord | null; interaction_profile?: EntryRecord | null } | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const characterId = displayText(data.id);

  const reloadContext = useCallback(async () => {
    if (!characterId) return;
    try {
      const response = await apiFetch(`/api/ui/characters/${encodeURIComponent(characterId)}`);
      const payload = await readJsonSafe(response);
      if (response.ok && controlIsRecord(payload)) {
        setContext({
          character: controlIsRecord(payload.character) ? payload.character : null,
          combat_profile: controlIsRecord(payload.combat_profile) ? payload.combat_profile : null,
          interaction_profile: controlIsRecord(payload.interaction_profile) ? payload.interaction_profile : null,
        });
      }
    } catch {
      setContext(null);
    }
  }, [characterId]);

  useEffect(() => {
    void reloadContext();
  }, [reloadContext]);

  const saveProfile = useCallback(async (apiPath: string, payload: EntryRecord, success: string) => {
    const response = await apiFetch(`/api/${apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await readJsonSafe(response);
    if (!response.ok) {
      setProfileNotice(asErrorMessage(body) || "Profile save failed.");
      return;
    }
    setProfileNotice(success);
    await reloadContext();
  }, [reloadContext]);

  const combat = context?.combat_profile || null;
  const interaction = context?.interaction_profile || null;
  const characterContext = context?.character || null;
  const classTemplate = controlIsRecord(characterContext?.class_template) ? characterContext.class_template : null;
  const faction = controlIsRecord(characterContext?.faction) ? characterContext.faction : null;
  const homeLocation = controlIsRecord(characterContext?.home_location) ? characterContext.home_location : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <AuthoringPanel id="character-sheet" title="Character Sheet" subtitle="Core identity, portrait and table-facing notes." help="Use this for the character identity authors and players recognize. Combat profiles, dialogue, and story beats are managed from their own workspaces." status={<AuthoringStatusChip tone={displayText(data.name) ? "success" : "warning"}>{displayText(data.name) ? "named" : "needs name"}</AuthoringStatusChip>}>
        <CharacterPreview data={data} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Level" value={formatNumber(data.level || 1)} />
          <Fact label="Class" value={classTemplate ? rowLabel(classTemplate, displayText(data.class_id, "Unassigned")) : displayText(data.class_id, "Unassigned")} />
          <Fact label="Faction" value={faction ? rowLabel(faction, displayText(data.faction_id, "Unassigned")) : displayText(data.faction_id, "Unassigned")} />
        </div>
        <div className="mt-4 space-y-4">
          <InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="name" label="Name" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="title" label="Title" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="slug" label="Slug" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="level" label="Level" kind="number" onChange={onChange} />
          </InlineFieldGrid>
          <InlineField schema={schema} data={data} fieldKey="image_path" label="Portrait Path" onChange={onChange} />
          <InlineField schema={schema} data={data} fieldKey="description" label="Bio / Notes" kind="textarea" onChange={onChange} />
          <EditableTagList tags={data.tags} onChange={(tags) => onChange({ ...data, tags })} />
        </div>
      </AuthoringPanel>
      <AuthoringPanel id="role-world-links" title="Role And World Links" subtitle="Class, faction and home location drive later combat and interaction views." help="Use this panel to connect the character to the systems that reference them. These links do not create dialogue, quests, or combat behavior by themselves." collapsible collapsedSummary={[data.class_id, data.faction_id, data.home_location_id].map((value) => displayText(value)).filter(Boolean).join(", ") || "No role links yet"} storageKey={`authoring:${displayText(data.id, "new")}:role-world-links`}>
        <CharacterStatStrip data={data} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Resolved Class" value={classTemplate ? rowLabel(classTemplate, displayText(data.class_id)) : "No class linked"} />
          <Fact label="Resolved Faction" value={faction ? rowLabel(faction, displayText(data.faction_id)) : "No faction linked"} />
          <Fact label="Home" value={homeLocation ? rowLabel(homeLocation, displayText(data.home_location_id)) : "No home location"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ReferenceChipPicker label="Combat Class" value={data.class_id} reference="characterclasses" onChange={(value) => onChange({ ...data, class_id: value })} />
          <ReferenceChipPicker label="Faction" value={data.faction_id} reference="factions" onChange={(value) => onChange({ ...data, faction_id: value })} />
          <ReferenceChipPicker label="Home Location" value={data.home_location_id} reference="locations" onChange={(value) => onChange({ ...data, home_location_id: value })} />
        </div>
        {profileNotice && <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{profileNotice}</div>}
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <ProfileCard
            title="Combat Profile"
            profile={combat}
            empty={persisted ? "No combat profile yet." : "Save the character before creating linked profiles."}
            createLabel="Create Combat Profile"
            onCreate={persisted ? () => void saveProfile("combat_profiles", {
              id: generateUlid(),
              character_id: characterId,
              enemy_type: "humanoid",
              aggression: "Neutral",
              custom_stats: [],
              custom_abilities: [],
              loot_table: [],
              currency_rewards: [],
              reputation_rewards: [],
              related_quests: [],
              tags: [],
            }, "Combat profile created.") : undefined}
            editorPath={combat ? `/combat-profiles?selected=${encodeURIComponent(displayText(combat.id))}` : undefined}
          />
          <ProfileCard
            title="Interaction Profile"
            profile={interaction}
            empty={persisted ? "No interaction profile yet." : "Save the character before creating linked profiles."}
            createLabel="Create Interaction Profile"
            onCreate={persisted ? () => void saveProfile("interaction_profiles", {
              id: generateUlid(),
              character_id: characterId,
              role: "Story",
              available_quests: [],
              inventory: [],
              flags_set_on_interaction: [],
              tags: [],
            }, "Interaction profile created.") : undefined}
            editorPath={interaction ? `/interaction-profiles?selected=${encodeURIComponent(displayText(interaction.id))}` : undefined}
          />
        </div>
      </AuthoringPanel>
    </div>
  );
}

function LocationAuthoringSurface(props: AuthoringSurfaceProps) {
  const { schema, data, onChange, persisted, isDirty = false, focusField = "" } = props;
  const biomeOptions = getOptions(schema.properties?.biome);
  const modifierOptions = getOptions(schema.properties?.biome_modifier);
  const locationTypeOptions = getOptions(schema.properties?.location_type);
  const placeKindOptions = getOptions(schema.properties?.place_kind);
  const biomeInheritanceOptions = getOptions(schema.properties?.biome_inheritance);
  const setLocationType = (value: string) => {
    const currentTypeDefault = defaultPlaceKindForLocationType(displayText(data.location_type, "Zone"));
    const currentPlaceKind = displayText(data.place_kind);
    const next: EntryRecord = { ...data, location_type: value, biome_inheritance: "" };
    if (!currentPlaceKind || currentPlaceKind === currentTypeDefault) {
      next.place_kind = defaultPlaceKindForLocationType(value);
    }
    onChange(next);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <AuthoringPanel id="location-card" title="Location Card" subtitle="Edit the place description and visual identity." help="Use this for what the place is called and how authors recognize it. Map position, travel routes, and encounter placement are edited in the other panels." status={<AuthoringStatusChip tone={displayText(data.name) ? "success" : "warning"}>{displayText(data.name) ? "named" : "needs name"}</AuthoringStatusChip>}>
        <LocationPreview data={data} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Region" value={displayText(data.region, "No region")} />
          <Fact label="Place Kind" value={displayText(data.place_kind, "Unclassified")} />
          <Fact label="Level Range" value={levelRangeLabel(data.level_range)} />
        </div>
        <div className="mt-4 space-y-4">
          <InlineFieldGrid>
            <InlineField schema={schema} data={data} fieldKey="name" label="Location Name" onChange={onChange} />
            <InlineField schema={schema} data={data} fieldKey="slug" label="Slug" onChange={onChange} />
          </InlineFieldGrid>
          <InlineField schema={schema} data={data} fieldKey="description" label="Description" kind="textarea" onChange={onChange} />
          <InlineField schema={schema} data={data} fieldKey="image_path" label="Image Path" onChange={onChange} />
          <EditableTagList tags={data.tags} onChange={(tags) => onChange({ ...data, tags })} />
          <EditableTagList label="Environment Tags" tags={data.environment_tags} onChange={(environment_tags) => onChange({ ...data, environment_tags })} />
        </div>
      </AuthoringPanel>
      <div className="space-y-4">
        <AuthoringPanel id="atlas-placement" title="Atlas Placement" subtitle="Click the map to update coordinates." help="Use this to position the location on the atlas view. It changes map coordinates only; it does not create travel routes." collapsible collapsedSummary={`x ${formatNumber((controlIsRecord(data.coordinates) ? data.coordinates : {}).x ?? 50)} / y ${formatNumber((controlIsRecord(data.coordinates) ? data.coordinates : {}).y ?? 50)}`} storageKey={`authoring:${displayText(data.id, "new")}:atlas-placement`}>
          <LocationCoordinateEditor data={data} onChange={onChange} />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <TogglePill label="Safe Zone" active={Boolean(data.is_safe_zone)} onChange={(value) => onChange({ ...data, is_safe_zone: value })} />
            <TogglePill label="Fast Travel" active={Boolean(data.is_fast_travel_point)} onChange={(value) => onChange({ ...data, is_fast_travel_point: value })} />
            <TogglePill label="Respawn" active={Boolean(data.has_respawn_point)} onChange={(value) => onChange({ ...data, has_respawn_point: value })} />
          </div>
        </AuthoringPanel>
        <AuthoringPanel id="place-ecology" title="Place And Ecology" subtitle="Classify the place separately from biome, inheritance and encounter ecology." help="Use this to describe what kind of place it is, what biome rules it follows, and which gameplay flags apply. Encounter tables and routes remain separate records." collapsible collapsedSummary={`${displayText(data.place_kind, "Unclassified")} / ${displayText(data.biome, "no biome")}`} storageKey={`authoring:${displayText(data.id, "new")}:place-ecology`}>
          <div className="space-y-4">
            <div data-authoring-field="location_type" className={focusedFieldClass("location_type", focusField)}>
              <SelectBadgeGroup label="Location Type" value={data.location_type} options={locationTypeOptions} onChange={setLocationType} />
            </div>
            <div data-authoring-field="parent_location_id" className={focusedFieldClass("parent_location_id", focusField)}>
              <ReferenceChipPicker label="Parent Location" value={data.parent_location_id} reference="locations" onChange={(value) => onChange({ ...data, parent_location_id: value })} />
            </div>
            <div data-authoring-field="sort_order" className={focusedFieldClass("sort_order", focusField)}>
              <InlineField schema={schema} data={data} fieldKey="sort_order" label="Sort Order" kind="number" onChange={onChange} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div data-authoring-field="is_playable_space" className={focusedFieldClass("is_playable_space", focusField)}>
                <TogglePill label="Playable Space" active={data.is_playable_space !== false} onChange={(value) => onChange({ ...data, is_playable_space: value })} />
              </div>
              <div data-authoring-field="is_world_map_node" className={focusedFieldClass("is_world_map_node", focusField)}>
                <TogglePill label="World Map Node" active={data.is_world_map_node !== false} onChange={(value) => onChange({ ...data, is_world_map_node: value })} />
              </div>
            </div>
            <div data-authoring-field="place_kind" className={focusedFieldClass("place_kind", focusField)}>
              <SelectBadgeGroup label="Place Kind" value={data.place_kind} options={placeKindOptions} allowUnset unsetLabel="Unclassified" onChange={(value) => onChange({ ...data, place_kind: value })} />
            </div>
            <div data-authoring-field="biome_inheritance" className={focusedFieldClass("biome_inheritance", focusField)}>
              <SelectBadgeGroup label="Biome Inheritance" value={data.biome_inheritance} options={biomeInheritanceOptions} allowUnset unsetLabel="Auto" onChange={(value) => onChange({ ...data, biome_inheritance: value })} />
            </div>
            <div data-authoring-field="biome" className={focusedFieldClass("biome", focusField)}>
              <SelectBadgeGroup label="Biome" value={data.biome} options={biomeOptions} allowUnset unsetLabel="No biome" onChange={(value) => onChange({ ...data, biome: value })} />
            </div>
            <div data-authoring-field="biome_modifier" className={focusedFieldClass("biome_modifier", focusField)}>
              <SelectBadgeGroup label="Biome Modifier" value={data.biome_modifier} options={modifierOptions} allowUnset unsetLabel="No modifier" onChange={(value) => onChange({ ...data, biome_modifier: value })} />
            </div>
            <div data-authoring-field="region" className={focusedFieldClass("region", focusField)}>
              <InlineField schema={schema} data={data} fieldKey="region" label="Region" onChange={onChange} />
            </div>
            <div data-authoring-field="level_range" className={focusedFieldClass("level_range", focusField)}>
              <LevelRangeEditor data={data} onChange={onChange} />
            </div>
            <div data-authoring-field="encounters" className={focusedFieldClass("encounters", focusField)}>
              <ReferenceArrayPicker label="Encounters" reference="encounters" values={data.encounters} onChange={(encounters) => onChange({ ...data, encounters })} />
            </div>
          </div>
        </AuthoringPanel>
        <AuthoringPanel id="routes" title="Routes" subtitle="Movement links connected to this location. Routes are separate records, not embedded location fields." help="Use this to inspect or create travel connections. Opening a route leaves this draft, so save first when you have unsaved location changes." status={<AuthoringStatusChip tone={isDirty ? "warning" : "neutral"}>{isDirty ? "save before route edits" : "ready"}</AuthoringStatusChip>}>
          <LocationRoutesPanel location={data} persisted={persisted} isDirty={isDirty} />
        </AuthoringPanel>
      </div>
    </div>
  );
}

interface AuthoringSurfaceProps {
  config: AuthoringConfig;
  schema: SchemaDefinition;
  data: EntryRecord;
  onChange: (next: EntryRecord) => void;
  changedFieldKeys: string[];
  persisted: boolean;
  isDirty?: boolean;
  focusField?: string;
}

function ReferenceArrayPicker({
  label,
  reference,
  values,
  onChange,
}: {
  label: string;
  reference: string;
  values: unknown;
  onChange: (values: string[]) => void;
}) {
  const options = useReferenceOptions(reference);
  const selected = Array.isArray(values) ? values.map((value) => displayText(value)).filter(Boolean) : [];
  const available = options.filter((option) => !selected.includes(displayText(option.id)));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="flex flex-wrap gap-1">
        {selected.map((id) => {
          const match = options.find((option) => displayText(option.id) === id);
          return (
            <button
              key={id}
              type="button"
              className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
              onClick={() => onChange(selected.filter((value) => value !== id))}
              title="Remove"
            >
              {match ? rowLabel(match, id) : id} x
            </button>
          );
        })}
        {selected.length === 0 && <span className="text-xs text-slate-500 dark:text-slate-400">None selected.</span>}
      </div>
      <select
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        value=""
        onChange={(event) => {
          if (event.target.value) onChange([...selected, event.target.value]);
        }}
      >
        <option value="">Add {label.toLowerCase()}</option>
        {available.map((option) => {
          const id = displayText(option.id);
          return <option key={id} value={id}>{rowLabel(option, id)}</option>;
        })}
      </select>
      <ReferenceManageLink reference={reference} onCreated={(id) => onChange(selected.includes(id) ? selected : [...selected, id])} />
    </div>
  );
}

function LocationRoutesPanel({ location, persisted, isDirty }: { location: EntryRecord; persisted: boolean; isDirty: boolean }) {
  const [routes, setRoutes] = useState<EntryRecord[]>([]);
  const [locations, setLocations] = useState<EntryRecord[]>([]);
  const navigate = useNavigate();
  const { confirmNavigate } = useDirtyState();
  const locationId = displayText(location.id);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/api/location_routes").then((res) => res.json()),
      apiFetch("/api/locations").then((res) => res.json()),
    ])
      .then(([routePayload, locationPayload]) => {
        if (cancelled) return;
        setRoutes(Array.isArray(routePayload) ? routePayload.filter(isRecord) : []);
        setLocations(Array.isArray(locationPayload) ? locationPayload.filter(isRecord) : []);
      })
      .catch(() => {
        if (!cancelled) {
          setRoutes([]);
          setLocations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locationsById = useMemo(() => new Map(locations.map((item) => [displayText(item.id), item])), [locations]);
  const connected = routes.filter((route) => displayText(route.from_location_id) === locationId || displayText(route.to_location_id) === locationId);
  const createRouteDisabled = !persisted || !locationId || isDirty;

  const createRouteDraft = () => {
    if (createRouteDisabled) return;
    const id = generateUlid();
    const label = `${displayText(location.name, "Location")} Route`;
    const draft = {
      id,
      slug: generateSlug(label),
      from_location_id: locationId,
      to_location_id: "",
      bidirectional: true,
      route_type: "Road",
      travel_cost: 0,
      travel_time: 0,
      is_hidden: false,
      is_fast_travel_enabled: false,
      description: "",
      tags: [],
    };
    localStorage.setItem(`soa.draft.location_routes.${id}`, JSON.stringify({ data: draft, ts: Date.now() }));
    localStorage.setItem("soa.draft.last.location_routes", `soa.draft.location_routes.${id}`);
    localStorage.setItem("soa.workspace.location_routes", JSON.stringify({ search: "", searchField: "__all__", showEditor: true, selectedEntryId: id }));
    navigate("/location-routes");
  };

  const guardNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!confirmNavigate()) event.preventDefault();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {connected.length} connected route{connected.length === 1 ? "" : "s"}
        </div>
        <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={createRouteDisabled} onClick={createRouteDraft}>
          Create Route From Here
        </button>
      </div>
      {!persisted ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Save this location before creating route edges.</div>
      ) : isDirty ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Save current location changes before creating a route edge.</div>
      ) : connected.length === 0 ? (
        <EmptyState
          title="No route edges connect to this location yet."
          variant="compact"
        >
          That is fine for an isolated draft. Add routes when this place should appear in travel, fast travel, or encounter-table movement.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {connected.map((route) => {
            const fromId = displayText(route.from_location_id);
            const toId = displayText(route.to_location_id);
            const otherId = fromId === locationId ? toId : fromId;
            const other = locationsById.get(otherId);
            return (
              <div key={displayText(route.id)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{displayText(route.slug, displayText(route.id))}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge label={displayText(route.route_type, "Route")} />
                      <Badge label={route.bidirectional ? "two-way" : "one-way"} />
                      {Boolean(route.requirements_id) && <Badge label="locked" />}
                      {Boolean(route.is_hidden) && <Badge label="hidden" />}
                      {Boolean(route.is_fast_travel_enabled) && <Badge label="fast travel" />}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {otherId && <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={`/author/locations/${encodeURIComponent(otherId)}`} onClick={guardNavigation}>{other ? `Edit ${rowLabel(other, otherId)}` : "Edit Connected Location"}</Link>}
                    <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={`/location-routes?selected=${encodeURIComponent(displayText(route.id))}`} onClick={guardNavigation}>Inspect Route Record</Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Fact label="From" value={rowLabel(locationsById.get(fromId) || {}, fromId)} />
                  <Fact label="To" value={rowLabel(locationsById.get(toId) || {}, toId)} />
                  <Fact label="Cost / Time" value={`${formatNumber(route.travel_cost)} / ${formatNumber(route.travel_time)}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModifierEditor({
  title,
  rows,
  reference,
  targetField,
  scalingField,
  onChange,
}: {
  title: string;
  rows: EntryRecord[];
  reference: string;
  targetField: string;
  scalingField: string;
  onChange: (rows: EntryRecord[]) => void;
}) {
  const targets = useReferenceMap(reference);
  const addRow = (preset: "Flat" | "Percentage" | "Multiplier") => {
    const nextValue = preset === "Multiplier" ? 1.1 : 1;
    onChange([...rows, { id: generateUlid(), [targetField]: "", value: nextValue, value_type: preset, [scalingField]: "None" }]);
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{title}</h3>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{rows.length} active row{rows.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => addRow("Flat")}>
            Add Flat
          </button>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => addRow("Percentage")}>
            Add %
          </button>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => addRow("Multiplier")}>
            Add x
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
          <EmptyState title="No modifiers yet." variant="compact">
            Add a flat bonus for direct stats, a percentage bonus for scaling gear, or a multiplier for rare build-defining items.
          </EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const target = targets.get(displayText(row[targetField]));
            const scalingValue = displayText(row[scalingField], "None");
            return (
              <div key={displayText(row.id, `${targetField}-${index}`)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {target ? rowLabel(target, displayText(row[targetField])) : "Unassigned modifier"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge label={modifierValueLabel(row)} />
                      <Badge label={displayText(row.value_type, "Flat")} />
                      <Badge label={`Scaling: ${scalingValue}`} />
                    </div>
                  </div>
                  <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={() => onChange(removeRow(rows, index))}>
                    Delete
                  </button>
                </div>
                <div className="grid gap-2 lg:grid-cols-[1.3fr_0.55fr_0.75fr_0.85fr]">
                  <ReferenceChipPicker label="Target" value={row[targetField]} reference={reference} allowEmpty={false} onChange={(value) => onChange(setRow(rows, index, { [targetField]: value }))} />
                  <label>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Value</div>
                    <input
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      type="number"
                      value={toNumberInput(row.value)}
                      onChange={(event) => onChange(setRow(rows, index, { value: parseNumberInput(event.target.value) }))}
                    />
                  </label>
                  <label>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Mode</div>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={displayText(row.value_type, "Flat")}
                      onChange={(event) => onChange(setRow(rows, index, { value_type: event.target.value }))}
                    >
                      {["Flat", "Percentage", "Multiplier"].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Scaling</div>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={scalingValue}
                      onChange={(event) => onChange(setRow(rows, index, { [scalingField]: event.target.value }))}
                    >
                      {["None", "Linear", "Exponential", "Logarithmic", "Custom"].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {target ? "This row will be applied while the item is equipped or active." : "Choose a target to make this modifier meaningful."}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuthoringSaveBar({
  isDirty,
  saving,
  formValid,
  missingRequiredFields,
  onSave,
  onReset,
  listPath,
}: {
  isDirty: boolean;
  saving: boolean;
  formValid: boolean;
  missingRequiredFields: string[];
  onSave: () => void;
  onReset: () => void;
  listPath: string;
}) {
  return (
    <div className="sticky bottom-4 z-20 rounded-md border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {formValid ? <CheckIcon className="h-5 w-5 text-emerald-600" /> : <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />}
          <span className="text-slate-700 dark:text-slate-300">
            {formValid ? (isDirty ? "Unsaved authoring changes" : "No unsaved changes") : `Missing required: ${missingRequiredFields.join(", ")}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`} to={listPath}>
            Inspect In Generic Editor
          </Link>
          <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={!isDirty || saving} onClick={onReset}>
            Reset
          </button>
          <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!formValid || saving} onClick={onSave}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RpgItemPreview({ data }: { data: EntryRecord }) {
  const modifierCount = countValues(data.stat_modifiers) + countValues(data.attribute_modifiers);
  return (
    <div className={`rounded-md border p-4 ${rarityClass(displayText(data.rarity))}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-current/20 bg-white/60 text-xl font-semibold dark:bg-black/20">
          {displayText(data.icon_path) ? <img className="h-12 w-12 object-contain" src={buildApiUrl(`/${displayText(data.icon_path)}`)} alt="" /> : displayText(data.name, "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase opacity-80">{displayText(data.type, "Item")} / {displayText(data.rarity, "Unranked")}</div>
          <div className="mt-1 truncate text-lg font-semibold" title={displayText(data.name, "Unnamed Item")}>{displayText(data.name, "Unnamed Item")}</div>
          <div className="mt-2 text-sm opacity-80">{displayText(data.description, "No description yet.")}</div>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-semibold">
            <Badge label={`${formatNumber(data.base_price)} ${itemCurrencyLabel(data)}`} />
            <Badge label={`${countValues(data.effects)} effect${countValues(data.effects) === 1 ? "" : "s"}`} />
            <Badge label={`${modifierCount} modifier${modifierCount === 1 ? "" : "s"}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MerchantPreview({ data }: { data: EntryRecord }) {
  const inventory = Array.isArray(data.inventory) ? data.inventory.length : 0;
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase opacity-75">Merchant Ledger</div>
          <div className="mt-1 text-xl font-semibold">{displayText(data.name, "Unnamed Shop")}</div>
          <div className="mt-1 text-sm opacity-80">{displayText(data.description, "No shop description yet.")}</div>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-semibold">
            <Badge label={displayText(data.currency_id, "default currency")} />
            <Badge label={shopPricingSummary(data)} />
            {displayText(data.requirements_id) && <Badge label="locked shop" />}
          </div>
        </div>
        <div className="rounded-md border border-current/20 bg-white/60 px-3 py-2 text-center dark:bg-black/20">
          <div className="text-lg font-semibold">{inventory}</div>
          <div className="text-[11px] uppercase opacity-75">Rows</div>
        </div>
      </div>
    </div>
  );
}

function shopPricingSummary(shop: EntryRecord): string {
  const override = shop.price_override === "" || shop.price_override === null || shop.price_override === undefined ? "" : displayText(shop.price_override);
  if (override) return `override ${override}`;
  const multiplier = numericOr(shop.price_multiplier, 1);
  const modifier = numericOr(shop.price_modifier, 0);
  const parts = [`x${formatNumber(multiplier)}`];
  if (modifier !== 0) parts.push(`${modifier > 0 ? "+" : ""}${formatNumber(modifier)}`);
  return parts.join(" ");
}

function CharacterPreview({ data }: { data: EntryRecord }) {
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 p-4 text-violet-950 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100">
      <div className="flex gap-3">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-current/20 bg-white/60 text-2xl font-semibold dark:bg-black/20">
          {displayText(data.image_path) ? <img className="h-full w-full object-cover" src={buildApiUrl(`/${displayText(data.image_path)}`)} alt="" /> : displayText(data.name, "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase opacity-75">Level {formatNumber(data.level || 1)}</div>
          <div className="mt-1 truncate text-xl font-semibold">{displayText(data.name, "Unnamed Character")}</div>
          {displayText(data.title) && <div className="text-sm opacity-80">{displayText(data.title)}</div>}
          <p className="mt-2 text-sm opacity-80">{displayText(data.description, "No character notes yet.")}</p>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-semibold">
            <Badge label={displayText(data.class_id, "no class")} />
            <Badge label={displayText(data.faction_id, "no faction")} />
            <Badge label={displayText(data.home_location_id, "no home")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CharacterStatStrip({ data }: { data: EntryRecord }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Fact label="Level" value={formatNumber(data.level || 1)} />
      <Fact label="Class" value={displayText(data.class_id, "Unassigned")} />
      <Fact label="Faction" value={displayText(data.faction_id, "Unassigned")} />
    </div>
  );
}

function ProfileCard({
  title,
  profile,
  empty,
  createLabel,
  onCreate,
  editorPath,
}: {
  title: string;
  profile: EntryRecord | null;
  empty: string;
  createLabel: string;
  onCreate?: () => void;
  editorPath?: string;
}) {
  const isCombat = title.toLowerCase().includes("combat");
  const primary = isCombat
    ? displayText(profile?.enemy_type, "No enemy type")
    : displayText(profile?.role, "No role");
  const secondary = isCombat
    ? displayText(profile?.aggression, "No aggression")
    : displayText(profile?.dialogue_tree_id, "No dialogue linked");
  const abilityCount = Array.isArray(profile?.custom_abilities) ? profile.custom_abilities.length : 0;
  const statCount = Array.isArray(profile?.custom_stats) ? profile.custom_stats.length : 0;
  const lootCount = Array.isArray(profile?.loot_table) ? profile.loot_table.length : 0;
  const currencyCount = Array.isArray(profile?.currency_rewards) ? profile.currency_rewards.length : 0;
  const questCount = Array.isArray(profile?.available_quests) ? profile.available_quests.length : Array.isArray(profile?.related_quests) ? profile.related_quests.length : 0;
  const inventoryCount = Array.isArray(profile?.inventory) ? profile.inventory.length : 0;
  const flagCount = Array.isArray(profile?.flags_set_on_interaction) ? profile.flags_set_on_interaction.length : 0;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {profile ? `${primary} / ${secondary}` : empty}
          </div>
        </div>
        {editorPath ? (
          <Link className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} to={editorPath}>Inspect Source Record</Link>
        ) : onCreate ? (
          <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.xs}`} onClick={onCreate}>{createLabel}</button>
        ) : (
          <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Locked</span>
        )}
      </div>
      {profile && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {isCombat ? (
            <>
              <Fact label="Abilities" value={String(abilityCount)} />
              <Fact label="Stat Rows" value={String(statCount)} />
              <Fact label="Loot Rows" value={String(lootCount)} />
              <Fact label="Currency Rewards" value={String(currencyCount)} />
            </>
          ) : (
            <>
              <Fact label="Quests" value={String(questCount)} />
              <Fact label="Trade Rows" value={String(inventoryCount)} />
              <Fact label="Flags Set" value={String(flagCount)} />
              <Fact label="Dialogue" value={displayText(profile.dialogue_tree_id, "Unlinked")} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LocationPreview({ data }: { data: EntryRecord }) {
  const biomeLabel = displayText(data.effective_biome, displayText(data.biome, "No biome"));
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-current/20 bg-white/60 dark:bg-black/20">
          <MapPinIcon className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase opacity-75">{displayText(data.place_kind, "Unclassified")} / {biomeLabel} / {displayText(data.region, "No region")}</div>
          <div className="mt-1 truncate text-xl font-semibold">{displayText(data.name, "Unnamed Location")}</div>
          <p className="mt-2 text-sm opacity-80">{displayText(data.description, "No location description yet.")}</p>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-semibold">
            <Badge label={levelRangeLabel(data.level_range)} />
            {displayText(data.biome_inheritance) && <Badge label={displayText(data.biome_inheritance)} />}
            {displayText(data.biome_modifier) && <Badge label={displayText(data.biome_modifier)} />}
            {Boolean(data.is_safe_zone) && <Badge label="safe zone" />}
            {Boolean(data.is_fast_travel_point) && <Badge label="fast travel" />}
            {Boolean(data.has_respawn_point) && <Badge label="respawn" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function levelRangeLabel(value: unknown): string {
  const range = controlIsRecord(value) ? value : {};
  const min = displayText(range.min, "?");
  const max = displayText(range.max, "?");
  return `Lv ${min}-${max}`;
}

function ShopInventoryEditor({
  rows,
  items,
  shop,
  onChange,
}: {
  rows: EntryRecord[];
  items: EntryRecord[];
  shop: EntryRecord;
  onChange: (rows: EntryRecord[]) => void;
}) {
  const itemsById = useMemo(() => new Map(items.map((item) => [displayText(item.id), item])), [items]);
  const addRow = () => onChange([...rows, { id: generateUlid(), item_id: "", stock: 1, price_multiplier: 1, price_modifier: 0, price_override: "" }]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{rows.length} inventory row{rows.length === 1 ? "" : "s"}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Blank stock means unlimited. Entry override wins over multiplier and modifier.</div>
        </div>
        <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={addRow}>Add Item</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No inventory rows yet." variant="compact">
          Add an item when this merchant should sell specific stock. Shop-wide pricing still works without inventory rows.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const item = itemsById.get(displayText(row.item_id));
            const preview = computeClientPrice(item, shop, row);
            const currency = shopInventoryCurrencyLabel(item, shop, row);
            const stockLabel = row.stock === "" || row.stock === null || row.stock === undefined ? "Unlimited" : formatNumber(row.stock);
            return (
              <div key={displayText(row.id, `inventory-${index}`)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded border text-lg font-semibold ${rarityClass(displayText(item?.rarity))}`}>
                      {displayText(item?.icon_path) ? <img className="h-10 w-10 object-contain" src={buildApiUrl(`/${displayText(item?.icon_path)}`)} alt="" /> : displayText(item?.name, "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item ? rowLabel(item, displayText(row.item_id)) : "Unassigned inventory item"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge label={displayText(item?.type, "no type")} />
                        <Badge label={displayText(item?.rarity, "no rarity")} />
                        <Badge label={`${stockLabel} stock`} />
                        {displayText(row.requirements_id) && <Badge label="locked row" />}
                      </div>
                    </div>
                  </div>
                  <button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.xs}`} onClick={() => onChange(removeRow(rows, index))}>Delete</button>
                </div>
                <div className="grid gap-3 xl:grid-cols-[1.4fr_0.55fr_0.55fr_0.55fr_0.6fr]">
                  <label>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Item</div>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={displayText(row.item_id)}
                      onChange={(event) => onChange(setRow(rows, index, { item_id: event.target.value }))}
                    >
                      <option value="">Choose item</option>
                      {items.map((option) => {
                        const id = displayText(option.id);
                        return <option key={id} value={id}>{rowLabel(option, id)}</option>;
                      })}
                    </select>
                  </label>
                  <NumberCell label="Stock" value={row.stock} onChange={(value) => onChange(setRow(rows, index, { stock: value }))} />
                  <NumberCell label="Multiplier" value={row.price_multiplier ?? 1} step="0.05" onChange={(value) => onChange(setRow(rows, index, { price_multiplier: value }))} />
                  <NumberCell label="Modifier" value={row.price_modifier ?? 0} onChange={(value) => onChange(setRow(rows, index, { price_modifier: value }))} />
                  <NumberCell label="Override" value={row.price_override} onChange={(value) => onChange(setRow(rows, index, { price_override: value }))} />
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                  <Fact label="Base" value={`${formatNumber(preview.base)} ${currency}`} />
                  <Fact label="After Shop" value={`${formatNumber(preview.afterShop)} ${currency}`} />
                  <Fact label="Final Buy" value={`${formatNumber(preview.buy)} ${currency}`} />
                  <Fact label="Sell Preview" value={`${formatNumber(preview.sell)} ${currency}`} />
                  <Fact label="Layer" value={inventoryPricingSummary(row)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ReferenceChipPicker label="Entry Currency" value={row.currency_id} reference="currencies" onChange={(value) => onChange(setRow(rows, index, { currency_id: value }))} />
                  <ReferenceChipPicker label="Entry Requirement" value={row.requirements_id} reference="requirements" onChange={(value) => onChange(setRow(rows, index, { requirements_id: value }))} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NumberCell({ label, value, step, onChange }: { label: string; value: unknown; step?: string; onChange: (value: number | "") => void }) {
  return (
    <label>
      <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <input
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        type="number"
        step={step}
        value={toNumberInput(value)}
        onChange={(event) => onChange(parseNumberInput(event.target.value))}
      />
    </label>
  );
}

function inventoryPricingSummary(row: EntryRecord): string {
  const override = row.price_override === "" || row.price_override === null || row.price_override === undefined ? "" : displayText(row.price_override);
  if (override) return `override ${override}`;
  const multiplier = numericOr(row.price_multiplier, 1);
  const modifier = numericOr(row.price_modifier, 0);
  const parts = [`x${formatNumber(multiplier)}`];
  if (modifier !== 0) parts.push(`${modifier > 0 ? "+" : ""}${formatNumber(modifier)}`);
  return parts.join(" ");
}

function computeClientPrice(item: EntryRecord | undefined, shop: EntryRecord, row: EntryRecord): { base: number; afterShop: number; buy: number; sell: number } {
  const base = numericOr(item?.base_price, 0);
  const shopOverride = shop.price_override === "" || shop.price_override === null || shop.price_override === undefined ? null : numericOr(shop.price_override, base);
  const entryOverride = row.price_override === "" || row.price_override === null || row.price_override === undefined ? null : numericOr(row.price_override, base);
  const afterShop = Math.max(0, shopOverride !== null ? shopOverride : base * numericOr(shop.price_multiplier, 1) + numericOr(shop.price_modifier, 0));
  const buy = Math.max(0, entryOverride !== null ? entryOverride : afterShop * numericOr(row.price_multiplier, 1) + numericOr(row.price_modifier, 0));
  return { base, afterShop, buy, sell: Math.max(0, buy * 0.5) };
}

function LocationCoordinateEditor({ data, onChange }: { data: EntryRecord; onChange: (next: EntryRecord) => void }) {
  const coordinates = isRecord(data.coordinates) ? data.coordinates : {};
  const x = clamp(Number(coordinates.x ?? 50), 0, 100);
  const y = clamp(Number(coordinates.y ?? 50), 0, 100);
  const setCoordinate = (key: "x" | "y", value: number | "") => {
    const numeric = value === "" ? 0 : value;
    onChange({ ...data, coordinates: { ...coordinates, [key]: clamp(Number(numeric), 0, 100) } });
  };

  const updateFromPointer = (clientX: number, clientY: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const nextX = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const nextY = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
    onChange({ ...data, coordinates: { ...coordinates, x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 } });
  };

  return (
    <div className="space-y-3">
      <div
        className="relative h-64 overflow-hidden rounded-md border border-slate-300 bg-[linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.18)_1px,transparent_1px)] bg-[size:32px_32px] dark:border-slate-700 dark:bg-slate-950"
        onClick={(event) => updateFromPointer(event.clientX, event.clientY, event.currentTarget)}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-emerald-50 to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
        <button
          type="button"
          className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-sky-700 bg-white text-sky-700 shadow dark:border-sky-300 dark:bg-slate-900 dark:text-sky-300"
          style={{ left: `${x}%`, top: `${y}%` }}
          title="Current coordinates"
        >
          <MapPinIcon className="h-5 w-5" />
        </button>
        <div className="absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-slate-700 shadow dark:bg-slate-900/80 dark:text-slate-300">
          x {formatNumber(x)} / y {formatNumber(y)}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberCell label="Map X" value={x} onChange={(value) => setCoordinate("x", value)} />
        <NumberCell label="Map Y" value={y} onChange={(value) => setCoordinate("y", value)} />
      </div>
    </div>
  );
}

function TogglePill({ label, active, onChange }: { label: string; active: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-2 text-sm font-semibold ${active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}
      onClick={() => onChange(!active)}
    >
      {label}
    </button>
  );
}

function LevelRangeEditor({ data, onChange }: { data: EntryRecord; onChange: (next: EntryRecord) => void }) {
  const range = controlIsRecord(data.level_range) ? data.level_range : {};
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Level Range</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          type="number"
          value={toNumberInput(range.min)}
          placeholder="Min"
          onChange={(event) => onChange({ ...data, level_range: { ...range, min: parseNumberInput(event.target.value) } })}
        />
        <input
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          type="number"
          value={toNumberInput(range.max)}
          placeholder="Max"
          onChange={(event) => onChange({ ...data, level_range: { ...range, max: parseNumberInput(event.target.value) } })}
        />
      </div>
    </div>
  );
}

function LocationAtlasPage() {
  const [locations, setLocations] = useState<EntryRecord[]>([]);
  const [routes, setRoutes] = useState<EntryRecord[]>([]);
  const [warnings, setWarnings] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [placeKindFilter, setPlaceKindFilter] = useState("");
  const [biomeFilter, setBiomeFilter] = useState("");
  const [routeTypeFilter, setRouteTypeFilter] = useState("");
  const [routeFlagFilter, setRouteFlagFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/ui/location_graph")
      .then((res) => res.json())
      .then((payload) => {
        if (!cancelled && isRecord(payload)) {
          setLocations(Array.isArray(payload.locations) ? payload.locations.filter(isRecord) : []);
          setRoutes(Array.isArray(payload.routes) ? payload.routes.filter(isRecord) : []);
          setWarnings(Array.isArray(payload.warnings) ? payload.warnings.filter(isRecord) : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocations([]);
          setRoutes([]);
          setWarnings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const regions = useMemo(() => Array.from(new Set(locations.map((location) => displayText(location.region)).filter(Boolean))).sort(), [locations]);
  const placeKinds = useMemo(() => Array.from(new Set(locations.map((location) => displayText(location.place_kind)).filter(Boolean))).sort(), [locations]);
  const biomes = useMemo(() => Array.from(new Set(locations.map((location) => displayText(location.effective_biome, displayText(location.biome))).filter(Boolean))).sort(), [locations]);
  const routeTypes = useMemo(() => Array.from(new Set(routes.map((route) => displayText(route.route_type)).filter(Boolean))).sort(), [routes]);
  const locationsById = useMemo(() => new Map(locations.map((location) => [displayText(location.id), location])), [locations]);
  const filtered = locations.filter((location) => {
    const effectiveBiome = displayText(location.effective_biome, displayText(location.biome));
    const text = `${location.name || ""} ${location.region || ""} ${location.place_kind || ""} ${effectiveBiome} ${(Array.isArray(location.environment_tags) ? location.environment_tags : []).join(" ")}`.toLowerCase();
    const matchesSearch = text.includes(filter.trim().toLowerCase());
    const matchesRegion = !regionFilter || displayText(location.region) === regionFilter;
    const matchesPlaceKind = !placeKindFilter || displayText(location.place_kind) === placeKindFilter;
    const matchesBiome = !biomeFilter || effectiveBiome === biomeFilter;
    return matchesSearch && matchesRegion && matchesPlaceKind && matchesBiome;
  });
  const visibleLocationIds = new Set(filtered.map((location) => displayText(location.id)));
  const filteredRoutes = routes.filter((route) => {
    const fromId = displayText(route.from_location_id);
    const toId = displayText(route.to_location_id);
    if (!visibleLocationIds.has(fromId) || !visibleLocationIds.has(toId)) return false;
    if (routeTypeFilter && displayText(route.route_type) !== routeTypeFilter) return false;
    if (routeFlagFilter === "hidden" && !route.is_hidden) return false;
    if (routeFlagFilter === "locked" && !displayText(route.requirements_id)) return false;
    if (routeFlagFilter === "fast" && !route.is_fast_travel_enabled) return false;
    return true;
  });

  return (
    <AuthoringPageShell>
        <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Location Atlas</div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">World Map Authoring</h1>
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Badge label={`${locations.length} total`} />
                <Badge label={`${filtered.length} visible`} />
              </div>
            </div>
            <div className="grid w-full gap-2 lg:w-auto lg:grid-cols-[minmax(180px,260px)_150px_150px_150px_150px_140px]">
              <input
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by name, place, ecology"
              />
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                <option value="">All regions</option>
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={placeKindFilter} onChange={(event) => setPlaceKindFilter(event.target.value)}>
                <option value="">All place kinds</option>
                {placeKinds.map((placeKind) => <option key={placeKind} value={placeKind}>{placeKind}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={biomeFilter} onChange={(event) => setBiomeFilter(event.target.value)}>
                <option value="">All effective biomes</option>
                {biomes.map((biome) => <option key={biome} value={biome}>{biome}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={routeTypeFilter} onChange={(event) => setRouteTypeFilter(event.target.value)}>
                <option value="">All route types</option>
                {routeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={routeFlagFilter} onChange={(event) => setRouteFlagFilter(event.target.value)}>
                <option value="">All route states</option>
                <option value="hidden">Hidden</option>
                <option value="locked">Locked</option>
                <option value="fast">Fast travel</option>
              </select>
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {warnings.length} graph warning{warnings.length === 1 ? "" : "s"} found. Check route records for missing location references.
            </div>
          )}
        </section>
        <section className="relative h-[640px] overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,.16)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.16)_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-emerald-50 to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {filteredRoutes.map((route) => {
              const from = locationsById.get(displayText(route.from_location_id));
              const to = locationsById.get(displayText(route.to_location_id));
              if (!from || !to) return null;
              const fromCoordinates = isRecord(from.coordinates) ? from.coordinates : {};
              const toCoordinates = isRecord(to.coordinates) ? to.coordinates : {};
              const x1 = clamp(Number(fromCoordinates.x ?? 50), 0, 100);
              const y1 = clamp(Number(fromCoordinates.y ?? 50), 0, 100);
              const x2 = clamp(Number(toCoordinates.x ?? 50), 0, 100);
              const y2 = clamp(Number(toCoordinates.y ?? 50), 0, 100);
              return (
                <Link key={displayText(route.id)} to={`/location-routes?selected=${encodeURIComponent(displayText(route.id))}`}>
                  <line
                    className={`pointer-events-auto cursor-pointer ${routeLineClass(route)}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeDasharray={route.is_hidden ? "4 4" : displayText(route.requirements_id) ? "8 3" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                </Link>
              );
            })}
          </svg>
          {loading ? (
            <div className="absolute left-4 top-4 rounded bg-white/90 px-3 py-2 text-sm text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">Loading locations...</div>
          ) : filtered.length === 0 ? (
            <div className="absolute left-4 top-4 max-w-sm rounded bg-white/90 px-3 py-2 text-sm text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">
              No locations match this filter. Clear one filter or create a location with matching region, place, or ecology.
            </div>
          ) : (
            filtered.map((location) => {
              const coordinates = isRecord(location.coordinates) ? location.coordinates : {};
              const effectiveBiome = displayText(location.effective_biome, displayText(location.biome));
              const x = clamp(Number(coordinates.x ?? 50), 0, 100);
              const y = clamp(Number(coordinates.y ?? 50), 0, 100);
              const id = displayText(location.id);
              return (
                <Link
                  key={id}
                  to={`/author/locations/${encodeURIComponent(id)}`}
                  className={`absolute flex max-w-[190px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium shadow hover:border-sky-500 hover:text-sky-700 dark:hover:border-sky-400 dark:hover:text-sky-300 ${locationPointClass(displayText(location.place_kind), effectiveBiome)}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={`${displayText(location.name, "Unnamed")} (${displayText(location.place_kind, "Unclassified")}, ${displayText(effectiveBiome, "No biome")}, ${levelRangeLabel(location.level_range)})`}
                >
                  <MapPinIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{displayText(location.name, "Unnamed")}</span>
                </Link>
              );
            })
          )}
        </section>
    </AuthoringPageShell>
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

function Badge({ label }: { label: string }) {
  return <span className="rounded bg-slate-900/10 px-2 py-0.5 text-[11px] font-semibold text-current dark:bg-white/10">{label}</span>;
}

function accentBorder(accent: string): string {
  const classes: Record<string, string> = {
    amber: "border-amber-300 dark:border-amber-800",
    emerald: "border-emerald-300 dark:border-emerald-800",
    violet: "border-violet-300 dark:border-violet-800",
    sky: "border-sky-300 dark:border-sky-800",
  };
  return classes[accent] || "border-slate-300 dark:border-slate-700";
}

function statusBadgeClass(isDirty: boolean, invalid: boolean): string {
  if (invalid) return "rounded-full bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300";
  if (isDirty) return "rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
}

function rarityClass(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "legendary":
      return "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
    case "epic":
      return "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-100";
    case "rare":
      return "border-blue-400 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100";
    case "uncommon":
      return "border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100";
    default:
      return "border-slate-300 bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  }
}

function locationPointClass(placeKind: string, biome: string): string {
  const kind = placeKind.toLowerCase();
  if (kind.includes("settlement")) return "border-violet-300 bg-violet-50/95 text-violet-900 dark:border-violet-800 dark:bg-violet-950/95 dark:text-violet-100";
  if (kind.includes("dungeon") || kind.includes("interior")) return "border-slate-400 bg-slate-100/95 text-slate-900 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-100";
  if (kind.includes("waterway")) return "border-sky-300 bg-sky-50/95 text-sky-900 dark:border-sky-800 dark:bg-sky-950/95 dark:text-sky-100";
  if (kind.includes("landmark")) return "border-amber-300 bg-amber-50/95 text-amber-900 dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100";
  if (kind.includes("abstract")) return "border-indigo-300 bg-indigo-50/95 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/95 dark:text-indigo-100";
  const normalized = biome.toLowerCase();
  if (normalized.includes("city") || normalized.includes("fortress")) return "border-violet-300 bg-violet-50/95 text-violet-900 dark:border-violet-800 dark:bg-violet-950/95 dark:text-violet-100";
  if (normalized.includes("forest") || normalized.includes("fungal")) return "border-emerald-300 bg-emerald-50/95 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/95 dark:text-emerald-100";
  if (normalized.includes("desert") || normalized.includes("magma")) return "border-amber-300 bg-amber-50/95 text-amber-900 dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100";
  if (normalized.includes("cave") || normalized.includes("ruins") || normalized.includes("abyss")) return "border-slate-400 bg-slate-100/95 text-slate-900 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-100";
  if (normalized.includes("coast") || normalized.includes("sky") || normalized.includes("cloud")) return "border-sky-300 bg-sky-50/95 text-sky-900 dark:border-sky-800 dark:bg-sky-950/95 dark:text-sky-100";
  return "border-slate-300 bg-white/95 text-slate-800 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200";
}

function routeLineClass(route: EntryRecord): string {
  const fast = Boolean(route.is_fast_travel_enabled);
  const type = displayText(route.route_type).toLowerCase();
  const width = fast ? "stroke-[3]" : "stroke-2";
  if (type.includes("portal")) return `stroke-fuchsia-500 ${width}`;
  if (type.includes("ship")) return `stroke-sky-600 ${width}`;
  if (type.includes("flight")) return `stroke-cyan-500 ${width}`;
  if (type.includes("secret")) return `stroke-violet-500 ${width}`;
  if (type.includes("dungeon") || type.includes("cave")) return `stroke-slate-700 dark:stroke-slate-300 ${width}`;
  if (type.includes("trail")) return `stroke-emerald-600 ${width}`;
  return `stroke-amber-700 dark:stroke-amber-300 ${width}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
