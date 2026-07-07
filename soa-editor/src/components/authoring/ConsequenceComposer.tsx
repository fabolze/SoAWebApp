import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildConsequenceComposerBundle,
  buildStoryConsequenceLinks,
  consequenceLabel,
  consequenceRows,
  consequenceStrings,
  consequenceText,
  defaultStoryConsequenceDraft,
  emptyConsequencePacket,
  findSource,
  normalizeConsequencePacket,
  normalizeConsequenceSource,
  stableConsequenceBundle,
  type ConsequencePacket,
  type ConsequenceSourceKind,
} from "../../authoring/consequenceComposer";
import { CROSS_ENTITY_CONSEQUENCE_PRESETS, applyStoryPlacementPreset, storyPlacementPresetIsActive } from "../../authoring/storyPlacementPresets";
import {
  CROSS_ENTITY_CONSEQUENCE_TARGET_KINDS,
  crossEntityConsequenceTargetOptions,
  record,
  type CrossEntityConsequenceTargetKind,
  type StoryPlacementDraft,
} from "../../authoring/storyPlacement";
import { apiFetch } from "../../lib/api";
import { formatApiError } from "../../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import type { EntryRecord } from "../../types/editorQol";
import BundleReview, { type BundleReviewResult } from "./BundleReview";
import LifecycleFields from "../storyPlacement/LifecycleFields";

interface ConsequenceComposerProps {
  sourceKind?: ConsequenceSourceKind;
  source?: EntryRecord | null;
  expectedSource?: EntryRecord | null;
  sourceLabel?: string;
  title?: string;
  subtitle?: string;
  enableSourceConsequences?: boolean;
  enableStoryConsequences?: boolean;
  storyAnchorKind?: "character" | "dialogue" | "encounter";
  storyAnchorId?: string;
  storyAnchorLabel?: string;
  storyPacket?: EntryRecord | null;
  onStoryPacketChange?: (packet: EntryRecord) => void;
  onSourceCommitted?: (source: EntryRecord, packet: ConsequencePacket) => void;
  onPacketChange?: (packet: ConsequencePacket) => void;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ConsequenceComposer({
  sourceKind,
  source,
  expectedSource: expectedSourceProp,
  sourceLabel,
  title = "Consequence Composer",
  subtitle = "Compose saved outcome state, rewards, follow-up links, and explicit story consequences.",
  enableSourceConsequences = true,
  enableStoryConsequences = false,
  storyAnchorKind,
  storyAnchorId = "",
  storyAnchorLabel = "",
  onStoryPacketChange,
  onSourceCommitted,
  onPacketChange,
}: ConsequenceComposerProps) {
  const [packet, setPacket] = useState<ConsequencePacket>(emptyConsequencePacket);
  const [sourceDraft, setSourceDraft] = useState<EntryRecord | null>(() => sourceKind && source ? normalizeConsequenceSource(sourceKind, source) : null);
  const [expectedSource, setExpectedSource] = useState<EntryRecord | null>(() => sourceKind && (expectedSourceProp || source) ? normalizeConsequenceSource(sourceKind, (expectedSourceProp || source)!) : null);
  const [targetKind, setTargetKind] = useState<CrossEntityConsequenceTargetKind>("character");
  const [targetDraft, setTargetDraft] = useState<StoryPlacementDraft>(() => defaultStoryConsequenceDraft("character"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSourceDraft(sourceKind && source ? normalizeConsequenceSource(sourceKind, source) : null);
    setExpectedSource(sourceKind && (expectedSourceProp || source) ? normalizeConsequenceSource(sourceKind, (expectedSourceProp || source)!) : null);
    setReview(null);
    setReviewError("");
  }, [expectedSourceProp, source, sourceKind]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    apiFetch("/api/ui/consequences")
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(formatApiError(body, "Consequence Composer failed to load."));
        if (!cancelled) setPacket(normalizeConsequencePacket(body));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Consequence Composer failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!targetDraft.adventure_beat_id && packet.adventure_beats.length > 0) {
      setTargetDraft((current) => ({ ...current, adventure_beat_id: consequenceText(packet.adventure_beats[0].id) }));
    }
  }, [packet.adventure_beats, targetDraft.adventure_beat_id]);

  const catalogs = useMemo(() => ({
    characters: packet.characters,
    factions: packet.factions,
    items: packet.items,
    locations: packet.locations,
  }), [packet.characters, packet.factions, packet.items, packet.locations]);
  const targets = crossEntityConsequenceTargetOptions(targetKind, catalogs, storyAnchorKind === "character" ? storyAnchorId : "");
  const canSaveStory = enableStoryConsequences && storyAnchorKind && storyAnchorId && targetDraft.adventure_beat_id && targetDraft.target_id;
  const canSaveSource = Boolean(enableSourceConsequences && sourceKind && sourceDraft);

  const clearReview = () => {
    setReview(null);
    setReviewError("");
  };

  const patchSource = (patch: EntryRecord) => {
    if (!sourceDraft) return;
    setSourceDraft({ ...sourceDraft, ...patch });
    clearReview();
  };

  const patchRewards = (patch: EntryRecord) => {
    if (!sourceDraft) return;
    const rewards = record(sourceDraft.rewards);
    patchSource({ rewards: { ...rewards, ...patch } });
  };

  const buildBundle = () => {
    let storyLinks: EntryRecord[] = [];
    if (canSaveStory && storyAnchorKind) {
      const story = buildStoryConsequenceLinks({
        anchorKind: storyAnchorKind,
        anchorId: storyAnchorId,
        anchorLabel: storyAnchorLabel || sourceLabel || storyAnchorId,
        targetDraft,
        existingLinks: packet.adventure_beat_links,
      });
      if (story.error) return { bundle: null, error: story.error };
      storyLinks = story.links;
    }
    const bundle = buildConsequenceComposerBundle({
      sourceKind: canSaveSource ? sourceKind : undefined,
      sourceDraft: canSaveSource ? sourceDraft : null,
      expectedSource: canSaveSource ? expectedSource : null,
      storyLinks,
    });
    if (!canSaveSource && storyLinks.length === 0) return { bundle: null, error: "Choose at least one consequence before previewing." };
    return { bundle, error: "" };
  };

  const submit = async (commit: boolean) => {
    const { bundle, error } = buildBundle();
    if (error || !bundle) {
      setReview(null);
      setReviewError(error || "Unable to build consequence bundle.");
      return;
    }
    setSaving(true);
    setReviewError("");
    try {
      const response = await apiFetch(`/api/ui/consequences/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stableConsequenceBundle(bundle),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(formatApiError(body, "Consequence operation failed."));
      if (commit) {
        const nextPacket = normalizeConsequencePacket(record(body).packet);
        setPacket(nextPacket);
        onPacketChange?.(nextPacket);
        const nextSource = sourceKind && sourceDraft ? findSource(nextPacket, sourceKind, consequenceText(sourceDraft.id)) : undefined;
        if (nextSource) {
          setSourceDraft(normalizeConsequenceSource(sourceKind!, nextSource));
          setExpectedSource(normalizeConsequenceSource(sourceKind!, nextSource));
          onSourceCommitted?.(nextSource, nextPacket);
        }
        const nextStoryPacket = record(nextPacket.story_packet);
        if (Object.keys(nextStoryPacket).length > 0) onStoryPacketChange?.(nextStoryPacket);
        setTargetDraft(defaultStoryConsequenceDraft(targetKind, targetDraft.adventure_beat_id));
        setReview(null);
      } else {
        setReview(body as BundleReviewResult);
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Consequence operation failed.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="consequence-composer">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || loading || (!canSaveSource && !canSaveStory)} onClick={() => void submit(false)}>{saving ? "Reviewing..." : "Review Consequence"}</button>
    </div>
    {loading && <p className="text-xs text-slate-500">Loading consequence context...</p>}
    {loadError && <Issue>{loadError}</Issue>}
    {!loading && !loadError && <div className="space-y-4">
      {enableSourceConsequences && sourceKind && sourceDraft && <SourceOutcomeEditor
        sourceKind={sourceKind}
        source={sourceDraft}
        packet={packet}
        sourceLabel={sourceLabel || consequenceLabel(sourceDraft)}
        onPatch={patchSource}
        onPatchRewards={patchRewards}
        onClearReview={clearReview}
      />}
      {enableStoryConsequences && storyAnchorKind && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Explicit Story Consequence</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">Place {storyAnchorLabel || storyAnchorId} in a beat and apply a lifecycle change to one selected target.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label><Caption>Adventure Beat</Caption><select className={inputClass} value={targetDraft.adventure_beat_id} onChange={(event) => { setTargetDraft({ ...targetDraft, adventure_beat_id: event.target.value }); clearReview(); }}>
            <option value="">Choose beat</option>
            {packet.adventure_beats.map((beat) => <option key={consequenceText(beat.id)} value={consequenceText(beat.id)}>{consequenceLabel(beat, consequenceText(beat.id))}</option>)}
          </select></label>
          <label><Caption>Target Type</Caption><select className={inputClass} value={targetKind} onChange={(event) => {
            const next = event.target.value as CrossEntityConsequenceTargetKind;
            setTargetKind(next);
            setTargetDraft(defaultStoryConsequenceDraft(next, targetDraft.adventure_beat_id));
            clearReview();
          }}>{CROSS_ENTITY_CONSEQUENCE_TARGET_KINDS.map((kind) => <option key={kind} value={kind}>{titleCase(kind)}</option>)}</select></label>
          <label><Caption>Explicit Target</Caption><select className={inputClass} value={targetDraft.target_id} onChange={(event) => { setTargetDraft({ ...targetDraft, target_id: event.target.value, continuity_group_id: event.target.value }); clearReview(); }}>
            <option value="">Choose target</option>
            {targets.map((target) => <option key={consequenceText(target.id)} value={consequenceText(target.id)}>{consequenceLabel(target, consequenceText(target.id))}</option>)}
          </select></label>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
          {CROSS_ENTITY_CONSEQUENCE_PRESETS[targetKind].map((preset) => {
            const active = storyPlacementPresetIsActive(targetDraft, preset);
            return <button key={preset.id} type="button" className={`rounded border p-2 text-left text-xs ${active ? "border-amber-600 bg-white text-amber-950 ring-2 ring-amber-200 dark:bg-slate-950 dark:text-amber-100 dark:ring-amber-900" : "border-amber-200 bg-white hover:border-amber-400 dark:border-amber-900 dark:bg-slate-950"}`} onClick={() => { setTargetDraft(applyStoryPlacementPreset(targetDraft, preset)); clearReview(); }}>
              <span className="block font-semibold">{preset.label}</span>
              <span className="mt-1 block text-[10px] text-slate-500">{preset.note}</span>
            </button>;
          })}
        </div>
        <div className="mt-3">
          <LifecycleFields value={targetDraft} beatOptions={packet.adventure_beats} onChange={(value) => { setTargetDraft(value); clearReview(); }} />
        </div>
        {targets.length === 0 && <p className="mt-3 text-xs text-amber-900 dark:text-amber-100">No valid targets are available for this consequence type.</p>}
      </div>}
      {(review || reviewError) && <BundleReview
        result={review}
        title="Consequence Review"
        description="Preview validates every canonical source and story-link change without writing it."
        variant="inline"
        commitLabel="Commit Consequence"
        saving={saving}
        error={reviewError}
        testId="consequence-review"
        onCancel={() => { setReview(null); setReviewError(""); }}
        onCommit={() => void submit(true)}
      />}
    </div>}
  </section>;
}

function SourceOutcomeEditor({ sourceKind, source, packet, sourceLabel, onPatch, onPatchRewards, onClearReview }: {
  sourceKind: ConsequenceSourceKind;
  source: EntryRecord;
  packet: ConsequencePacket;
  sourceLabel: string;
  onPatch: (patch: EntryRecord) => void;
  onPatchRewards: (patch: EntryRecord) => void;
  onClearReview: () => void;
}) {
  if (sourceKind === "dialogue_node") {
    const choices = consequenceRows(source.choices);
    return <Panel title="Dialogue Flags" subtitle={`${sourceLabel} can save node flags and explicit choice flags.`}>
      <FlagMultiSelect label="Node Flags Set" values={consequenceStrings(source.set_flags)} flags={packet.flags} onChange={(set_flags) => onPatch({ set_flags })} />
      <div className="mt-3 space-y-2">
        {choices.map((choice, index) => <div key={`${consequenceText(choice.next_node_id)}:${index}`} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{consequenceText(choice.choice_text, `Choice ${index + 1}`)}</div>
          <FlagMultiSelect label="Choice Flags Set" values={consequenceStrings(choice.set_flags)} flags={packet.flags} onChange={(set_flags) => {
            const next = choices.map((entry, row) => row === index ? { ...entry, set_flags } : entry);
            onPatch({ choices: next });
            onClearReview();
          }} />
        </div>)}
        {choices.length === 0 && <p className="text-xs text-slate-500">This node has no choices.</p>}
      </div>
    </Panel>;
  }

  if (sourceKind === "encounter") {
    const rewards = record(source.rewards);
    return <Panel title="Encounter Outcome" subtitle={`${sourceLabel} saves aftermath through encounter rewards.`}>
      <div className="grid gap-3 md:grid-cols-2"><NumberField label="Experience" value={rewards.xp} onChange={(xp) => onPatchRewards({ xp })} /><FlagMultiSelect label="Reward Flags Set" values={consequenceStrings(rewards.flags_set)} flags={packet.flags} onChange={(flags_set) => onPatchRewards({ flags_set })} /></div>
      <RewardRowEditor label="Item Rewards" rows={consequenceRows(rewards.items)} options={packet.items} referenceKey="item_id" numberKey="quantity" onChange={(items) => onPatchRewards({ items })} />
      <RewardRowEditor label="Currency Rewards" rows={consequenceRows(rewards.currencies)} options={packet.currencies} referenceKey="currency_id" numberKey="amount" onChange={(currencies) => onPatchRewards({ currencies })} />
      <RewardRowEditor label="Reputation Rewards" rows={consequenceRows(rewards.reputation)} options={packet.factions} referenceKey="faction_id" numberKey="amount" onChange={(reputation) => onPatchRewards({ reputation })} />
    </Panel>;
  }

  const completionFlagKey = sourceKind === "quest" ? "flags_set_on_completion" : "flags_set";
  return <Panel title={sourceKind === "quest" ? "Quest Completion Outcome" : "Event Outcome"} subtitle={`${sourceLabel} saves flags, rewards, reputation, and follow-up where supported.`}>
    <div className="grid gap-3 md:grid-cols-2">
      <NumberField label="Experience" value={source.xp_reward} onChange={(xp_reward) => onPatch({ xp_reward })} />
      <FlagMultiSelect label={sourceKind === "quest" ? "Completion Flags Set" : "Event Flags Set"} values={consequenceStrings(source[completionFlagKey])} flags={packet.flags} onChange={(value) => onPatch({ [completionFlagKey]: value })} />
    </div>
    {sourceKind === "event" && <label className="mt-3 block"><Caption>Next Event</Caption><select className={inputClass} value={consequenceText(source.next_event_id)} onChange={(event) => onPatch({ next_event_id: event.target.value })}>
      <option value="">No next event</option>
      {packet.events.filter((entry) => consequenceText(entry.id) !== consequenceText(source.id)).map((entry) => <option key={consequenceText(entry.id)} value={consequenceText(entry.id)}>{consequenceLabel(entry, consequenceText(entry.id))}</option>)}
    </select></label>}
    <RewardRowEditor label="Item Rewards" rows={consequenceRows(source.item_rewards)} options={packet.items} referenceKey="item_id" numberKey="quantity" onChange={(item_rewards) => onPatch({ item_rewards })} />
    <RewardRowEditor label="Currency Rewards" rows={consequenceRows(source.currency_rewards)} options={packet.currencies} referenceKey="currency_id" numberKey="amount" onChange={(currency_rewards) => onPatch({ currency_rewards })} />
    <RewardRowEditor label="Reputation Rewards" rows={consequenceRows(source.reputation_rewards)} options={packet.factions} referenceKey="faction_id" numberKey="amount" onChange={(reputation_rewards) => onPatch({ reputation_rewards })} />
  </Panel>;
}

function RewardRowEditor({ label, rows: value, options, referenceKey, numberKey, onChange }: { label: string; rows: EntryRecord[]; options: EntryRecord[]; referenceKey: string; numberKey: string; onChange: (rows: EntryRecord[]) => void }) {
  const update = (index: number, patch: EntryRecord) => onChange(value.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  return <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
    <Caption>{label}</Caption>
    <div className="space-y-2">
      {value.map((row, index) => <div key={`${consequenceText(row[referenceKey])}:${index}`} className="grid grid-cols-[1fr_100px_auto] gap-2">
        <select className={inputClass} value={consequenceText(row[referenceKey])} onChange={(event) => update(index, { [referenceKey]: event.target.value })}><option value="">Select</option>{options.map((option) => <option key={consequenceText(option.id)} value={consequenceText(option.id)}>{consequenceLabel(option, consequenceText(option.id))}</option>)}</select>
        <input className={inputClass} type="number" value={Number(row[numberKey] || 0)} onChange={(event) => update(index, { [numberKey]: Number(event.target.value) })} />
        <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
      </div>)}
      {value.length === 0 && <p className="text-xs text-slate-500">No rows.</p>}
    </div>
    <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-2`} onClick={() => onChange([...value, { [referenceKey]: "", [numberKey]: numberKey === "quantity" ? 1 : 0 }])}>Add Row</button>
  </div>;
}

function FlagMultiSelect({ label, values, flags, onChange }: { label: string; values: string[]; flags: EntryRecord[]; onChange: (values: string[]) => void }) {
  return <label className="block"><Caption>{label}</Caption>
    <select multiple className={`${inputClass} min-h-24`} value={values} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>
      {flags.map((flag) => <option key={consequenceText(flag.id)} value={consequenceText(flag.id)}>{consequenceLabel(flag, consequenceText(flag.id))}</option>)}
    </select>
    <div className="mt-1 flex flex-wrap gap-1">{values.map((id) => <span key={id} className="rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-semibold text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{consequenceLabel(flags.find((flag) => consequenceText(flag.id) === id), id)}</span>)}{values.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}</div>
  </label>;
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} type="number" value={Number(value || 0)} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{children}</div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800"><div className="mb-3"><h3 className="text-sm font-semibold">{title}</h3>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{children}</div>;
}

function Issue({ children }: { children: ReactNode }) {
  return <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{children}</p>;
}
