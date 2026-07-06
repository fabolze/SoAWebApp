import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import { generateSlug, generateUlid } from "../utils/generateId";

type Entry = Record<string, unknown>;
type RequirementTargetGroup = { schema_name: string; entries: Entry[] };
type FlagUsage = { producers: Entry[]; consumers: Entry[] };
type FlowPacket = {
  events: Entry[];
  event_context: Entry[];
  encounters: Entry[];
  dialogues: Entry[];
  lore_entries: Entry[];
  requirements: Entry[];
  requirement_usages_by_id: Record<string, Entry[]>;
  flags: Entry[];
  flag_usage_by_id: Record<string, FlagUsage>;
  requirement_targets: RequirementTargetGroup[];
  dependency_index: { nodes: Entry[]; edges: Entry[]; health?: Entry };
};

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const emptyPacket: FlowPacket = {
  events: [],
  event_context: [],
  encounters: [],
  dialogues: [],
  lore_entries: [],
  requirements: [],
  requirement_usages_by_id: {},
  flags: [],
  flag_usage_by_id: {},
  requirement_targets: [],
  dependency_index: { nodes: [], edges: [] },
};

function text(value: unknown, fallback = ""): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function rows(value: unknown): Entry[] {
  return Array.isArray(value) ? value.filter((row): row is Entry => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function label(entry: Entry | null | undefined, fallback = "Untitled"): string {
  if (!entry) return fallback;
  return text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback))));
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function byId(entries: Entry[]): Map<string, Entry> {
  const pairs: Array<[string, Entry]> = [];
  entries.forEach((entry) => {
    const id = text(entry.id);
    if (id) pairs.push([id, entry]);
  });
  return new Map(pairs);
}

function makeFlag(baseName: string, suffix: string): Entry {
  const slug = generateSlug(`${baseName} ${suffix}`) || `progression-${generateUlid().slice(-6).toLowerCase()}`;
  return {
    id: generateUlid(),
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `Tracks ${slug.replace(/-/g, " ")}.`,
    flag_type: "Story Progress",
    default_value: false,
    content_pack_id: "",
    tags: ["progression-flow"],
  };
}

function makeRequirement(baseName: string, requiredFlags: string[]): Entry {
  const slug = generateSlug(`${baseName} gate`) || `progression-gate-${generateUlid().slice(-6).toLowerCase()}`;
  return {
    id: generateUlid(),
    slug,
    required_flags: requiredFlags,
    forbidden_flags: [],
    min_faction_reputation: [],
    tags: ["progression-flow"],
  };
}

function makeEvent(baseName: string, requirementId = ""): Entry {
  const slug = generateSlug(`${baseName} event`) || `progression-event-${generateUlid().slice(-6).toLowerCase()}`;
  return {
    id: generateUlid(),
    slug,
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    type: "Encounter",
    requirements_id: requirementId,
    location_id: "",
    lore_id: "",
    dialogue_id: "",
    encounter_id: "",
    item_rewards: [],
    xp_reward: 0,
    currency_rewards: [],
    reputation_rewards: [],
    flags_set: [],
    next_event_id: "",
    tags: ["progression-flow"],
  };
}

function normalizeEvent(event: Entry): Entry {
  const type = text(event.type, "Encounter");
  return {
    ...event,
    encounter_id: type === "Encounter" ? text(event.encounter_id) : "",
    dialogue_id: type === "Dialogue" ? text(event.dialogue_id) : "",
    lore_id: type === "LoreDiscovery" ? text(event.lore_id) : "",
    flags_set: strings(event.flags_set),
    tags: strings(event.tags),
    item_rewards: rows(event.item_rewards),
    currency_rewards: rows(event.currency_rewards),
    reputation_rewards: rows(event.reputation_rewards),
  };
}

function normalizeRequirement(requirement: Entry): Entry {
  return {
    ...requirement,
    required_flags: strings(requirement.required_flags),
    forbidden_flags: strings(requirement.forbidden_flags),
    min_faction_reputation: rows(requirement.min_faction_reputation),
    tags: strings(requirement.tags),
  };
}

function normalizeEncounter(encounter: Entry): Entry {
  const rewards = typeof encounter.rewards === "object" && encounter.rewards !== null && !Array.isArray(encounter.rewards)
    ? encounter.rewards as Entry
    : {};
  return {
    ...encounter,
    participants: rows(encounter.participants),
    tags: strings(encounter.tags),
    rewards: {
      xp: Number(rewards.xp || 0),
      items: rows(rewards.items),
      currencies: rows(rewards.currencies),
      reputation: rows(rewards.reputation),
      flags_set: strings(rewards.flags_set),
    },
  };
}

function buildBundle(flags: Entry[], requirement: Entry | null, eventDraft: Entry | null, encounterDraft: Entry | null, attachment: Entry | null) {
  return {
    flags,
    requirement: requirement ? normalizeRequirement(requirement) : null,
    events: eventDraft ? [normalizeEvent(eventDraft)] : [],
    encounters: encounterDraft ? [normalizeEncounter(encounterDraft)] : [],
    requirement_attachments: attachment ? [attachment] : [],
  };
}

export default function ProgressionFlowPage() {
  const [packet, setPacket] = useState<FlowPacket>(emptyPacket);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [baseName, setBaseName] = useState("New Progression Beat");
  const [draftFlags, setDraftFlags] = useState<Entry[]>([]);
  const [requirementDraft, setRequirementDraft] = useState<Entry | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [targetSchema, setTargetSchema] = useState("events");
  const [targetId, setTargetId] = useState("");
  const [eventDraft, setEventDraft] = useState<Entry | null>(null);
  const [encounterDraft, setEncounterDraft] = useState<Entry | null>(null);
  const [initialSerialized, setInitialSerialized] = useState("");
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [temporaryFlags, setTemporaryFlags] = useState<string[]>([]);
  const dirtySource = useRef("progression-flow");
  const { setDirty } = useDirtyState();

  const flagsById = useMemo(() => byId([...packet.flags, ...draftFlags]), [draftFlags, packet.flags]);
  const requirementsById = useMemo(() => byId(packet.requirements), [packet.requirements]);
  const selectedRequirement = requirementDraft || requirementsById.get(selectedRequirementId) || null;
  const selectedRequirementUsage = selectedRequirement ? packet.requirement_usages_by_id[text(selectedRequirement.id)] || [] : [];
  const targetEntries = packet.requirement_targets.find((group) => group.schema_name === targetSchema)?.entries || [];
  const attachment = selectedRequirement && targetSchema && targetId
    ? { schema_name: targetSchema, entry_id: targetId, requirements_id: text(selectedRequirement.id) }
    : null;
  const bundle = useMemo(() => buildBundle(draftFlags, requirementDraft, eventDraft, encounterDraft, attachment), [attachment, draftFlags, encounterDraft, eventDraft, requirementDraft]);
  const serialized = stable(bundle);
  const dirty = initialSerialized !== "" && serialized !== initialSerialized;
  const graph = useMemo(() => buildFlowRows(packet, eventDraft, encounterDraft, selectedRequirement, flagsById, temporaryFlags), [encounterDraft, eventDraft, flagsById, packet, selectedRequirement, temporaryFlags]);
  const issues = useMemo(() => localIssues(packet, bundle, flagsById), [bundle, flagsById, packet]);

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  const load = () => {
    setLoading(true);
    setNotice("");
    apiFetch("/api/ui/progression-flow")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(formatApiError(payload, "Progression Flow failed to load."));
        setPacket({ ...emptyPacket, ...payload });
        setInitialSerialized(stable(buildBundle([], null, null, null, null)));
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Progression Flow failed to load."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addDraftFlag = (suffix: string) => {
    const flag = makeFlag(baseName, suffix);
    setDraftFlags((current) => [...current, flag]);
    if (requirementDraft) {
      setRequirementDraft({ ...requirementDraft, required_flags: [...strings(requirementDraft.required_flags), text(flag.id)] });
      return;
    }
    if (selectedRequirement) {
      setRequirementDraft(normalizeRequirement({
        ...selectedRequirement,
        required_flags: [...strings(selectedRequirement.required_flags), text(flag.id)],
      }));
      return;
    }
    setRequirementDraft(makeRequirement(baseName, [text(flag.id)]));
  };

  const selectExistingRequirement = (id: string) => {
    setSelectedRequirementId(id);
    setRequirementDraft(null);
  };

  const createRequirementFromFlags = () => {
    const required = draftFlags.map((flag) => text(flag.id)).filter(Boolean);
    setRequirementDraft(makeRequirement(baseName, required));
    setSelectedRequirementId("");
  };

  const discardDraft = () => {
    setDraftFlags([]);
    setRequirementDraft(null);
    setSelectedRequirementId("");
    setTargetId("");
    setEventDraft(null);
    setEncounterDraft(null);
    setReview(null);
    setReviewError("");
    setInitialSerialized(stable(buildBundle([], null, null, null, null)));
  };

  const startEventDraft = (source?: Entry) => {
    const draft = source ? normalizeEvent(source) : makeEvent(baseName, text(selectedRequirement?.id));
    if (selectedRequirement && !text(draft.requirements_id)) draft.requirements_id = text(selectedRequirement.id);
    setEventDraft(draft);
    const encounterId = text(draft.encounter_id);
    const encounter = packet.encounters.find((entry) => text(entry.id) === encounterId);
    setEncounterDraft(encounter ? normalizeEncounter(encounter) : null);
  };

  const patchEvent = (patch: Entry) => {
    if (!eventDraft) return;
    const next = normalizeEvent({ ...eventDraft, ...patch });
    setEventDraft(next);
    const encounterId = text(next.encounter_id);
    const encounter = packet.encounters.find((entry) => text(entry.id) === encounterId);
    setEncounterDraft(encounter ? normalizeEncounter(encounter) : null);
  };

  const patchRequirement = (patch: Entry) => {
    if (!requirementDraft) return;
    setRequirementDraft(normalizeRequirement({ ...requirementDraft, ...patch }));
  };

  const patchEncounterRewards = (flags_set: string[]) => {
    if (!encounterDraft) return;
    const rewards = typeof encounterDraft.rewards === "object" && encounterDraft.rewards !== null ? encounterDraft.rewards as Entry : {};
    setEncounterDraft(normalizeEncounter({ ...encounterDraft, rewards: { ...rewards, flags_set } }));
  };

  const preview = async () => {
    setReviewError("");
    setSaving(true);
    try {
      const response = await apiFetch("/api/ui/progression-flow/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(formatApiError(body, "Progression Flow preview failed."));
      setReview(body as BundleReviewResult);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Progression Flow preview failed.");
    } finally {
      setSaving(false);
    }
  };

  const commit = async () => {
    setSaving(true);
    setReviewError("");
    try {
      const response = await apiFetch("/api/ui/progression-flow/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(formatApiError(body, "Progression Flow commit failed."));
      setPacket({ ...emptyPacket, ...body });
      setDraftFlags([]);
      setRequirementDraft(null);
      setSelectedRequirementId("");
      setEventDraft(null);
      setEncounterDraft(null);
      setReview(null);
      setTemporaryFlags([]);
      const clean = stable(buildBundle([], null, null, null, null));
      setInitialSerialized(clean);
      setNotice("Progression flow bundle saved.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Progression Flow commit failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading Progression Flow...</div>;

  return (
    <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <Header dirty={dirty} saving={saving} issues={issues} onPreview={() => void preview()} onDiscard={discardDraft} />
        {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{notice}</div>}
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <main className="space-y-4">
            <Panel title="Shared Base" subtitle="Use one phrase to generate related slugs, then keep real ids as the source of truth.">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <Field label="Base Name" value={baseName} onChange={setBaseName} />
                <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm} self-end`} onClick={() => addDraftFlag("resolved")}>New Outcome Flag</button>
                <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm} self-end`} onClick={createRequirementFromFlags}>New Gate</button>
              </div>
            </Panel>
            <GateBuilder
              packet={packet}
              flagsById={flagsById}
              draftFlags={draftFlags}
              setDraftFlags={setDraftFlags}
              requirementDraft={requirementDraft}
              setRequirementDraft={setRequirementDraft}
              selectedRequirement={selectedRequirement}
              selectedRequirementId={selectedRequirementId}
              selectExistingRequirement={selectExistingRequirement}
              patchRequirement={patchRequirement}
              targetSchema={targetSchema}
              setTargetSchema={setTargetSchema}
              targetId={targetId}
              setTargetId={setTargetId}
              targetEntries={targetEntries}
              selectedRequirementUsage={selectedRequirementUsage}
            />
            <EventComposer
              packet={packet}
              eventDraft={eventDraft}
              encounterDraft={encounterDraft}
              selectedRequirement={selectedRequirement}
              flagsById={flagsById}
              startEventDraft={startEventDraft}
              patchEvent={patchEvent}
              patchEncounterRewards={patchEncounterRewards}
            />
            <FlowCanvas rows={graph} />
            <BundleReview
              result={review}
              title="Progression Flow Bundle Review"
              description="Review the real records that will be created or changed."
              variant="inline"
              commitLabel="Commit Progression Flow"
              saving={saving}
              error={reviewError}
              additionalWarnings={issues}
              onCancel={() => setReview(null)}
              onCommit={() => void commit()}
            />
          </main>
          <aside className="space-y-4">
            <TemporaryPlaythrough packet={packet} temporaryFlags={temporaryFlags} setTemporaryFlags={setTemporaryFlags} flagsById={flagsById} />
            <IssuePanel issues={issues} />
            <UsagePanel packet={packet} selectedRequirement={selectedRequirement} flags={[...packet.flags, ...draftFlags]} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Header({ dirty, saving, issues, onPreview, onDiscard }: { dirty: boolean; saving: boolean; issues: string[]; onPreview: () => void; onDiscard: () => void }) {
  return <Panel title="Progression Flow And Gate Builder" subtitle="Create events, encounters, requirements, and flags hand in hand while preserving the canonical tables.">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-slate-500">{dirty ? "Unsaved linked-authoring draft" : "No pending flow changes"} / {issues.length} local warning(s)</div>
      <div className="flex gap-2">
        <button className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} disabled={saving || !dirty} onClick={onDiscard}>Discard Draft</button>
        <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || !dirty} onClick={onPreview}>{saving ? "Reviewing..." : "Review Bundle"}</button>
      </div>
    </div>
  </Panel>;
}

function GateBuilder(props: {
  packet: FlowPacket;
  flagsById: Map<string, Entry>;
  draftFlags: Entry[];
  setDraftFlags: (flags: Entry[]) => void;
  requirementDraft: Entry | null;
  setRequirementDraft: (requirement: Entry | null) => void;
  selectedRequirement: Entry | null;
  selectedRequirementId: string;
  selectExistingRequirement: (id: string) => void;
  patchRequirement: (patch: Entry) => void;
  targetSchema: string;
  setTargetSchema: (schema: string) => void;
  targetId: string;
  setTargetId: (id: string) => void;
  targetEntries: Entry[];
  selectedRequirementUsage: Entry[];
}) {
  const {
    packet, flagsById, draftFlags, setDraftFlags, requirementDraft, setRequirementDraft, selectedRequirement, selectedRequirementId,
    selectExistingRequirement, patchRequirement, targetSchema, setTargetSchema, targetId, setTargetId, targetEntries,
    selectedRequirementUsage,
  } = props;
  const allFlags = [...packet.flags, ...draftFlags];
  return <Panel title="Gate Builder" subtitle="Create or reuse flags, build one requirement, and attach it to supported gated content.">
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Caption>Draft Flags</Caption>
        <div className="space-y-2">
          {draftFlags.map((flag, index) => <div key={text(flag.id)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Name" value={flag.name} onChange={(name) => setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, name, slug: text(entry.slug) || generateSlug(name) } : entry))} />
              <Field label="Slug" value={flag.slug} onChange={(slug) => setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, slug } : entry))} />
            </div>
            <Field label="Description" value={flag.description} onChange={(description) => setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, description } : entry))} />
          </div>)}
          {!draftFlags.length && <Empty>No draft flags yet.</Empty>}
        </div>
      </div>
      <div>
        <Caption>Requirement</Caption>
        <select className={`${inputClass} mb-2`} value={selectedRequirementId} onChange={(event) => selectExistingRequirement(event.target.value)}>
          <option value="">{requirementDraft ? "Using draft requirement" : "Select existing requirement..."}</option>
          {packet.requirements.map((requirement) => <option key={text(requirement.id)} value={text(requirement.id)}>{label(requirement, text(requirement.id))}</option>)}
        </select>
        {requirementDraft && <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <Field label="Requirement Slug" value={requirementDraft.slug} onChange={(slug) => patchRequirement({ slug })} />
          <FlagMultiSelect label="Required Flags" value={strings(requirementDraft.required_flags)} flags={allFlags} onChange={(required_flags) => patchRequirement({ required_flags })} />
          <FlagMultiSelect label="Forbidden Flags" value={strings(requirementDraft.forbidden_flags)} flags={allFlags} onChange={(forbidden_flags) => patchRequirement({ forbidden_flags })} />
        </div>}
        {selectedRequirement && !requirementDraft && <div className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="font-semibold">{label(selectedRequirement)}</div>
          <div className="mt-1 text-xs text-slate-500">Required: {strings(selectedRequirement.required_flags).map((id) => label(flagsById.get(id), id)).join(", ") || "none"}</div>
          <div className="mt-1 text-xs text-slate-500">Forbidden: {strings(selectedRequirement.forbidden_flags).map((id) => label(flagsById.get(id), id)).join(", ") || "none"}</div>
          <button className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-3`} onClick={() => setRequirementDraft(normalizeRequirement(selectedRequirement))}>Edit This Requirement In Bundle</button>
        </div>}
      </div>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
      <label><Caption>Attach Gate To</Caption><select className={inputClass} value={targetSchema} onChange={(event) => { setTargetSchema(event.target.value); setTargetId(""); }}>{packet.requirement_targets.map((group) => <option key={group.schema_name} value={group.schema_name}>{group.schema_name.replace(/_/g, " ")}</option>)}</select></label>
      <label><Caption>Target Content</Caption><select className={inputClass} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Do not attach yet</option>{targetEntries.map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{label(entry, text(entry.id))}</option>)}</select></label>
    </div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <UsageList title="Requirement Usage" rows={selectedRequirementUsage} />
      <UsageList title="Selected Flag Usage" rows={strings(selectedRequirement?.required_flags).flatMap((flagId) => [...(packet.flag_usage_by_id[flagId]?.producers || []), ...(packet.flag_usage_by_id[flagId]?.consumers || [])])} />
    </div>
  </Panel>;
}

function EventComposer({ packet, eventDraft, encounterDraft, selectedRequirement, flagsById, startEventDraft, patchEvent, patchEncounterRewards }: {
  packet: FlowPacket;
  eventDraft: Entry | null;
  encounterDraft: Entry | null;
  selectedRequirement: Entry | null;
  flagsById: Map<string, Entry>;
  startEventDraft: (source?: Entry) => void;
  patchEvent: (patch: Entry) => void;
  patchEncounterRewards: (flags: string[]) => void;
}) {
  const eventType = text(eventDraft?.type, "Encounter");
  const payloadOptions = eventType === "Encounter" ? packet.encounters : eventType === "Dialogue" ? packet.dialogues : eventType === "LoreDiscovery" ? packet.lore_entries : [];
  const payloadKey = eventType === "Encounter" ? "encounter_id" : eventType === "Dialogue" ? "dialogue_id" : eventType === "LoreDiscovery" ? "lore_id" : "";
  return <Panel title="Source And Outcome Composer" subtitle="Edit one event's payload, outcome flags, next-event link, and encounter outcome state together.">
    <div className="mb-3 flex flex-wrap gap-2">
      <button className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} onClick={() => startEventDraft()}>New Event Draft</button>
      <select className={`${inputClass} max-w-md`} value="" onChange={(event) => {
        const source = packet.events.find((entry) => text(entry.id) === event.target.value);
        if (source) startEventDraft(source);
      }}>
        <option value="">Edit existing event...</option>
        {packet.events.map((event) => <option key={text(event.id)} value={text(event.id)}>{label(event, text(event.id))}</option>)}
      </select>
    </div>
    {!eventDraft ? <Empty>Create or select an event to compose a source/outcome flow.</Empty> : <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Title" value={eventDraft.title} onChange={(title) => patchEvent({ title, slug: text(eventDraft.slug) || generateSlug(title) })} />
        <Field label="Slug" value={eventDraft.slug} onChange={(slug) => patchEvent({ slug })} />
        <label><Caption>Type</Caption><select className={inputClass} value={eventType} onChange={(event) => patchEvent({ type: event.target.value })}>{["Encounter", "Dialogue", "ItemReward", "LoreDiscovery", "Teleport", "ScriptedScene"].map((type) => <option key={type}>{type}</option>)}</select></label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {payloadKey && <label><Caption>Payload</Caption><select className={inputClass} value={text(eventDraft[payloadKey])} onChange={(event) => patchEvent({ [payloadKey]: event.target.value })}><option value="">Unassigned</option>{payloadOptions.map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{label(entry, text(entry.id))}</option>)}</select></label>}
        <label><Caption>Requirement</Caption><select className={inputClass} value={text(eventDraft.requirements_id)} onChange={(event) => patchEvent({ requirements_id: event.target.value })}><option value="">Unassigned</option>{selectedRequirement && <option value={text(selectedRequirement.id)}>{label(selectedRequirement, text(selectedRequirement.id))}</option>}{packet.requirements.filter((entry) => text(entry.id) !== text(selectedRequirement?.id)).map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{label(entry, text(entry.id))}</option>)}</select></label>
        <label><Caption>Next Event</Caption><select className={inputClass} value={text(eventDraft.next_event_id)} onChange={(event) => patchEvent({ next_event_id: event.target.value })}><option value="">No next event</option>{packet.events.filter((entry) => text(entry.id) !== text(eventDraft.id)).map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{label(entry, text(entry.id))}</option>)}</select></label>
      </div>
      <FlagMultiSelect label="Event Flags Set" value={strings(eventDraft.flags_set)} flags={Array.from(flagsById.values())} onChange={(flags_set) => patchEvent({ flags_set })} />
      {encounterDraft && <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 text-sm font-semibold">Linked Encounter Outcome</div>
        <FlagMultiSelect label="Encounter Reward Flags Set" value={strings((encounterDraft.rewards as Entry)?.flags_set)} flags={Array.from(flagsById.values())} onChange={patchEncounterRewards} />
        <div className="mt-2 text-xs text-slate-500">Encounter: {label(encounterDraft, text(encounterDraft.id))}</div>
      </div>}
    </div>}
  </Panel>;
}

function buildFlowRows(packet: FlowPacket, event: Entry | null, encounter: Entry | null, requirement: Entry | null, flagsById: Map<string, Entry>, temporaryFlags: string[]) {
  const flowRows: Array<{ id: string; kind: string; label: string; detail: string; open?: boolean }> = [];
  if (event) {
    flowRows.push({ id: `event:${text(event.id)}`, kind: "Source", label: label(event), detail: `${text(event.type)} event` });
    strings(event.flags_set).forEach((flagId) => flowRows.push({ id: `event-flag:${flagId}`, kind: "State", label: label(flagsById.get(flagId), flagId), detail: "Set by event" }));
    if (text(event.next_event_id)) {
      const next = packet.events.find((entry) => text(entry.id) === text(event.next_event_id));
      flowRows.push({ id: `next:${text(event.next_event_id)}`, kind: "Follow-up", label: label(next, text(event.next_event_id)), detail: "Next event link" });
    }
  }
  if (encounter) {
    flowRows.push({ id: `encounter:${text(encounter.id)}`, kind: "Content", label: label(encounter), detail: `${rows(encounter.participants).length} participant rows` });
    strings((encounter.rewards as Entry)?.flags_set).forEach((flagId) => flowRows.push({ id: `encounter-flag:${flagId}`, kind: "State", label: label(flagsById.get(flagId), flagId), detail: "Set by encounter reward" }));
  }
  if (requirement) {
    const required = strings(requirement.required_flags);
    const forbidden = strings(requirement.forbidden_flags);
    const open = required.every((id) => temporaryFlags.includes(id)) && forbidden.every((id) => !temporaryFlags.includes(id));
    flowRows.push({ id: `requirement:${text(requirement.id)}`, kind: "Gate", label: label(requirement), detail: `${required.length} required / ${forbidden.length} forbidden`, open });
  }
  return flowRows;
}

function FlowCanvas({ rows: flowRows }: { rows: Array<{ id: string; kind: string; label: string; detail: string; open?: boolean }> }) {
  return <Panel title="Compact Flow" subtitle="A selected-seed chain, not a whole-project graph. Dotted proposals become real only through bundle review.">
    <div className="grid gap-2 md:grid-cols-4">
      {flowRows.length === 0 && <Empty>No flow focus yet.</Empty>}
      {flowRows.map((row) => <div key={row.id} className={`rounded-md border p-3 ${row.kind === "Gate" ? row.open ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950" : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}>
        <div className="text-[10px] font-semibold uppercase text-slate-500">{row.kind}</div>
        <div className="mt-1 text-sm font-semibold">{row.label}</div>
        <div className="mt-1 text-xs text-slate-500">{row.detail}{row.kind === "Gate" ? row.open ? " / open in temporary state" : " / blocked in temporary state" : ""}</div>
      </div>)}
    </div>
  </Panel>;
}

function TemporaryPlaythrough({ packet, temporaryFlags, setTemporaryFlags, flagsById }: { packet: FlowPacket; temporaryFlags: string[]; setTemporaryFlags: (flags: string[]) => void; flagsById: Map<string, Entry> }) {
  const openGates = packet.requirements.filter((requirement) => strings(requirement.required_flags).every((id) => temporaryFlags.includes(id)) && strings(requirement.forbidden_flags).every((id) => !temporaryFlags.includes(id)));
  return <Panel title="Temporary State" subtitle="Toggle flags and watch requirements that would open.">
    <FlagMultiSelect label="Active Flags" value={temporaryFlags} flags={packet.flags} onChange={setTemporaryFlags} />
    <div className="mt-3 space-y-2">
      <Caption>Open Gates</Caption>
      {openGates.slice(0, 8).map((requirement) => <div key={text(requirement.id)} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{label(requirement)} / {strings(requirement.required_flags).map((id) => label(flagsById.get(id), id)).join(", ")}</div>)}
      {!openGates.length && <Empty>No gates open under the temporary state.</Empty>}
    </div>
  </Panel>;
}

function UsagePanel({ packet, selectedRequirement, flags }: { packet: FlowPacket; selectedRequirement: Entry | null; flags: Entry[] }) {
  const selectedFlags = strings(selectedRequirement?.required_flags);
  return <Panel title="Usage Preview" subtitle="Producer and consumer context from the dependency index.">
    {selectedFlags.length === 0 && <Empty>Select or draft a requirement to inspect flag usage.</Empty>}
    {selectedFlags.map((flagId) => {
      const usage = packet.flag_usage_by_id[flagId] || { producers: [], consumers: [] };
      return <div key={flagId} className="mb-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="text-sm font-semibold">{label(flags.find((flag) => text(flag.id) === flagId), flagId)}</div>
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <UsageList title="Producers" rows={usage.producers} />
          <UsageList title="Consumers" rows={usage.consumers} />
        </div>
      </div>;
    })}
  </Panel>;
}

function localIssues(packet: FlowPacket, bundle: ReturnType<typeof buildBundle>, flagsById: Map<string, Entry>): string[] {
  const issues: string[] = [];
  const allSlugs = new Map<string, string>();
  [...packet.flags, ...bundle.flags].forEach((flag) => {
    const slug = text(flag.slug);
    if (!slug) issues.push(`Flag ${text(flag.id, "draft")} is missing a slug.`);
    else if (allSlugs.has(`flag:${slug}`) && allSlugs.get(`flag:${slug}`) !== text(flag.id)) issues.push(`Duplicate flag slug: ${slug}`);
    allSlugs.set(`flag:${slug}`, text(flag.id));
  });
  if (bundle.requirement) {
    const required = strings(bundle.requirement.required_flags);
    const forbidden = strings(bundle.requirement.forbidden_flags);
    required.filter((id) => !flagsById.has(id)).forEach((id) => issues.push(`Requirement references missing required flag ${id}.`));
    forbidden.filter((id) => !flagsById.has(id)).forEach((id) => issues.push(`Requirement references missing forbidden flag ${id}.`));
    required.filter((id) => forbidden.includes(id)).forEach((id) => issues.push(`Requirement both requires and forbids ${label(flagsById.get(id), id)}.`));
  }
  bundle.events.forEach((event) => {
    const type = text(event.type);
    if (type === "Encounter" && !text(event.encounter_id)) issues.push("Encounter event has no encounter payload.");
    if (type === "Dialogue" && !text(event.dialogue_id)) issues.push("Dialogue event has no dialogue payload.");
    if (type === "LoreDiscovery" && !text(event.lore_id)) issues.push("Lore event has no lore payload.");
  });
  return [...new Set(issues)];
}

function IssuePanel({ issues }: { issues: string[] }) {
  return <Panel title="Local Health" subtitle={`${issues.length} warning(s) before backend preview.`}>
    {issues.map((issue) => <div key={issue} className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{issue}</div>)}
    {!issues.length && <Empty>No local issues found.</Empty>}
  </Panel>;
}

function FlagMultiSelect({ label: pickerLabel, value, flags, onChange }: { label: string; value: string[]; flags: Entry[]; onChange: (value: string[]) => void }) {
  return <label className="block">
    <Caption>{pickerLabel}</Caption>
    <select multiple className={`${inputClass} min-h-28`} value={value} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>
      {flags.map((flag) => <option key={text(flag.id)} value={text(flag.id)}>{label(flag, text(flag.id))}</option>)}
    </select>
    <div className="mt-1 flex flex-wrap gap-1">{value.map((id) => <span key={id} className="rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-semibold text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{label(flags.find((flag) => text(flag.id) === id), id)}</span>)}{value.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}</div>
  </label>;
}

function UsageList({ title, rows: value }: { title: string; rows: Entry[] }) {
  return <div>
    <Caption>{title}</Caption>
    <div className="space-y-1">
      {value.slice(0, 8).map((row, index) => <div key={`${text(row.id, text(row.entry_id))}:${index}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-950">
        <span className="font-semibold">{text(row.label, text(row.entry_label, label(row)))}</span>
        <span className="text-slate-500"> / {text(row.schema_name, text(row.kind))} {text(row.path) ? `/ ${text(row.path)}` : ""}</span>
      </div>)}
      {!value.length && <Empty>None.</Empty>}
    </div>
  </div>;
}

function Field({ label: fieldLabel, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return <label className="block"><Caption>{fieldLabel}</Caption><input className={inputClass} value={text(value)} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>{subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}</div>{children}</section>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-xs text-slate-500">{children}</div>;
}
