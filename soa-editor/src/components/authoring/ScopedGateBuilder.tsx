import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildScopedGateBundle,
  gateById,
  gateLabel,
  gateStrings,
  gateText,
  makeScopedGateFlag,
  makeScopedGateRequirement,
  normalizeScopedGateRequirement,
  scopedGateIssues,
  stableGateBundle,
  type ScopedGatePacket,
} from "../../authoring/scopedGate";
import { apiFetch } from "../../lib/api";
import { formatApiError } from "../../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../../styles/uiTokens";
import type { EntryRecord } from "../../types/editorQol";
import { AuthoringPanel, AuthoringStatusChip, EmptyState, StatusNotice } from "../authoringUi";
import type { BundleReviewResult } from "./BundleReview";
import BundleReview from "./BundleReview";

interface ScopedGateBuilderProps {
  packet: ScopedGatePacket;
  baseName: string;
  draftFlags: EntryRecord[];
  setDraftFlags: (flags: EntryRecord[]) => void;
  requirementDraft: EntryRecord | null;
  setRequirementDraft: (requirement: EntryRecord | null) => void;
  selectedRequirementId: string;
  setSelectedRequirementId: (id: string) => void;
  targetSchema: string;
  setTargetSchema: (schema: string) => void;
  targetId: string;
  setTargetId: (id: string) => void;
  directCommit?: boolean;
  onPacketChange?: (packet: ScopedGatePacket) => void;
  onCommitted?: (packet: ScopedGatePacket, requirementId: string, attachment: EntryRecord | null) => void;
  title?: string;
  subtitle?: string;
  tag?: string;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export default function ScopedGateBuilder({
  packet,
  baseName,
  draftFlags,
  setDraftFlags,
  requirementDraft,
  setRequirementDraft,
  selectedRequirementId,
  setSelectedRequirementId,
  targetSchema,
  setTargetSchema,
  targetId,
  setTargetId,
  directCommit = false,
  onPacketChange,
  onCommitted,
  title = "Gate Builder",
  subtitle = "Create or reuse flags, build one requirement, and attach it to supported gated content.",
  tag = "scoped-gate",
}: ScopedGateBuilderProps) {
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const flagsById = useMemo(() => gateById([...packet.flags, ...draftFlags]), [draftFlags, packet.flags]);
  const requirementsById = useMemo(() => gateById(packet.requirements), [packet.requirements]);
  const selectedRequirement = requirementDraft || requirementsById.get(selectedRequirementId) || null;
  const selectedRequirementUsage = selectedRequirement ? packet.requirement_usages_by_id[gateText(selectedRequirement.id)] || [] : [];
  const targetEntries = packet.requirement_targets.find((group) => group.schema_name === targetSchema)?.entries || [];
  const attachment = useMemo(() => selectedRequirement && targetSchema && targetId
    ? { schema_name: targetSchema, entry_id: targetId, requirements_id: gateText(selectedRequirement.id) }
    : null, [selectedRequirement, targetId, targetSchema]);
  const bundle = useMemo(() => buildScopedGateBundle(draftFlags, requirementDraft, attachment), [attachment, draftFlags, requirementDraft]);
  const issues = useMemo(() => scopedGateIssues(packet, bundle, flagsById), [bundle, flagsById, packet]);

  useEffect(() => {
    if (!targetSchema && packet.requirement_targets.length > 0) setTargetSchema(packet.requirement_targets[0].schema_name);
  }, [packet.requirement_targets, setTargetSchema, targetSchema]);

  const clearReview = () => {
    setReview(null);
    setReviewError("");
  };

  const addDraftFlag = (suffix: string) => {
    const flag = makeScopedGateFlag(baseName, suffix, tag);
    setDraftFlags([...draftFlags, flag]);
    if (requirementDraft) {
      setRequirementDraft({ ...requirementDraft, required_flags: [...gateStrings(requirementDraft.required_flags), gateText(flag.id)] });
    }
    clearReview();
  };

  const createRequirement = () => {
    setRequirementDraft(makeScopedGateRequirement(baseName, draftFlags.map((flag) => gateText(flag.id)), tag));
    setSelectedRequirementId("");
    clearReview();
  };

  const selectExistingRequirement = (id: string) => {
    setSelectedRequirementId(id);
    setRequirementDraft(null);
    clearReview();
  };

  const patchRequirement = (patch: EntryRecord) => {
    if (!requirementDraft) return;
    setRequirementDraft({ ...requirementDraft, ...patch });
    clearReview();
  };

  const submit = async (commit: boolean) => {
    setSaving(true);
    setReviewError("");
    try {
      const response = await apiFetch(`/api/ui/scoped-gates/${commit ? "bundle" : "preview"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stableGateBundle(bundle),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(formatApiError(body, "Scoped gate preview failed."));
      if (commit) {
        onPacketChange?.({ ...packet, ...body });
        onCommitted?.({ ...packet, ...body }, gateText(selectedRequirement?.id), attachment);
        setDraftFlags([]);
        setRequirementDraft(null);
        setSelectedRequirementId(gateText(selectedRequirement?.id));
        setReview(null);
      } else {
        setReview(body as BundleReviewResult);
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Scoped gate operation failed.");
    } finally {
      setSaving(false);
    }
  };

  return <AuthoringPanel
    title={title}
    subtitle={subtitle}
    help="Use this to make or reuse an unlock requirement for one piece of content. Draft flags describe player state, the requirement decides which flags are needed or forbidden, and the attachment chooses the content that uses it. Shared-use sections show what else may be affected before you commit."
    status={issues.length > 0 ? <AuthoringStatusChip tone="warning">{issues.length} issue{issues.length === 1 ? "" : "s"}</AuthoringStatusChip> : undefined}
  >
    <div className="mb-3 flex flex-wrap gap-2">
      <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => addDraftFlag("done")}>Add Done Flag</button>
      <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => addDraftFlag("available")}>Add Available Flag</button>
      {!requirementDraft && <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={createRequirement}>Create Requirement</button>}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Caption>Draft Flags</Caption>
        <div className="space-y-2">
          {draftFlags.map((flag, index) => <div key={gateText(flag.id)} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Name" value={flag.name} onChange={(name) => { setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, name } : entry)); clearReview(); }} />
              <Field label="Slug" value={flag.slug} onChange={(slug) => { setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, slug } : entry)); clearReview(); }} />
            </div>
            <Field label="Description" value={flag.description} onChange={(description) => { setDraftFlags(draftFlags.map((entry, row) => row === index ? { ...entry, description } : entry)); clearReview(); }} />
          </div>)}
          {!draftFlags.length && <EmptyState variant="compact" title="No draft flags yet.">Add a flag when this requirement needs new saved player state; otherwise reuse an existing requirement.</EmptyState>}
        </div>
      </div>
      <div>
        <Caption>Requirement</Caption>
        <select className={`${inputClass} mb-2`} value={selectedRequirementId} onChange={(event) => selectExistingRequirement(event.target.value)}>
          <option value="">{requirementDraft ? "Using draft requirement" : "Select existing requirement..."}</option>
          {packet.requirements.map((requirement) => <option key={gateText(requirement.id)} value={gateText(requirement.id)}>{gateLabel(requirement, gateText(requirement.id))}</option>)}
        </select>
        {requirementDraft && <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <Field label="Requirement Slug" value={requirementDraft.slug} onChange={(slug) => patchRequirement({ slug })} />
          <FlagMultiSelect label="Required Flags" value={gateStrings(requirementDraft.required_flags)} flags={[...packet.flags, ...draftFlags]} onChange={(required_flags) => patchRequirement({ required_flags })} />
          <FlagMultiSelect label="Forbidden Flags" value={gateStrings(requirementDraft.forbidden_flags)} flags={[...packet.flags, ...draftFlags]} onChange={(forbidden_flags) => patchRequirement({ forbidden_flags })} />
        </div>}
        {selectedRequirement && !requirementDraft && <div className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="font-semibold">{gateLabel(selectedRequirement)}</div>
          <div className="mt-1 text-xs text-slate-500">Required: {gateStrings(selectedRequirement.required_flags).map((id) => gateLabel(flagsById.get(id), id)).join(", ") || "none"}</div>
          <div className="mt-1 text-xs text-slate-500">Forbidden: {gateStrings(selectedRequirement.forbidden_flags).map((id) => gateLabel(flagsById.get(id), id)).join(", ") || "none"}</div>
          <button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs} mt-3`} onClick={() => { setRequirementDraft(normalizeScopedGateRequirement(selectedRequirement)); clearReview(); }}>Edit This Requirement In Bundle</button>
        </div>}
      </div>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
      <label><Caption>Attach Gate To</Caption><select className={inputClass} value={targetSchema} onChange={(event) => { setTargetSchema(event.target.value); setTargetId(""); clearReview(); }}>{packet.requirement_targets.map((group) => <option key={group.schema_name} value={group.schema_name}>{group.schema_name.replace(/_/g, " ")}</option>)}</select></label>
      <label><Caption>Target Content</Caption><select className={inputClass} value={targetId} onChange={(event) => { setTargetId(event.target.value); clearReview(); }}><option value="">Do not attach yet</option>{targetEntries.map((entry) => <option key={gateText(entry.id)} value={gateText(entry.id)}>{gateLabel(entry, gateText(entry.id))}</option>)}</select></label>
    </div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <UsageList title="Requirement Usage" rows={selectedRequirementUsage} />
      <UsageList title="Selected Flag Usage" rows={gateStrings(selectedRequirement?.required_flags).flatMap((flagId) => [...(packet.flag_usage_by_id[flagId]?.producers || []), ...(packet.flag_usage_by_id[flagId]?.consumers || [])])} />
    </div>
    {issues.length > 0 && <div className="mt-3 space-y-1">{issues.map((issue) => <StatusNotice key={issue} tone="warning">{issue}</StatusNotice>)}</div>}
    {directCommit && <div className="mt-3 flex justify-end">
      <button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={saving || issues.length > 0 || (!requirementDraft && !draftFlags.length && !attachment)} onClick={() => void submit(false)}>{saving ? "Reviewing..." : "Review Gate"}</button>
    </div>}
    {directCommit && (review || reviewError) && <div className="mt-3"><BundleReview
      result={review}
      title="Scoped Gate Review"
      description="Preview validates flags, requirement rules, and the gate attachment before committing."
      variant="inline"
      commitLabel="Commit Gate"
      saving={saving}
      error={reviewError}
      testId="scoped-gate-review"
      onCancel={() => { setReview(null); setReviewError(""); }}
      onCommit={() => void submit(true)}
    /></div>}
  </AuthoringPanel>;
}

function Caption({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{children}</div>;
}

function Field({ label, value, onChange }: { label: string; value: unknown; onChange: (value: string) => void }) {
  return <label className="block"><Caption>{label}</Caption><input className={inputClass} value={gateText(value)} onChange={(event) => onChange(event.target.value)} /></label>;
}

function FlagMultiSelect({ label, value, flags, onChange }: { label: string; value: string[]; flags: EntryRecord[]; onChange: (value: string[]) => void }) {
  return <label className="block"><Caption>{label}</Caption>
    <select multiple className={`${inputClass} min-h-28`} value={value} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>
      {flags.map((flag) => <option key={gateText(flag.id)} value={gateText(flag.id)}>{gateLabel(flag, gateText(flag.id))}</option>)}
    </select>
    <div className="mt-1 flex flex-wrap gap-1">{value.map((id) => <span key={id} className="rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-semibold text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{gateLabel(flags.find((flag) => gateText(flag.id) === id), id)}</span>)}{value.length === 0 && <EmptyState variant="compact" title="No flags selected.">Select saved player-state flags when this requirement should allow or block access.</EmptyState>}</div>
  </label>;
}

function UsageList({ title, rows }: { title: string; rows: EntryRecord[] }) {
  return <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-2 space-y-1">
      {rows.slice(0, 8).map((row, index) => <div key={`${gateText(row.schema_name)}:${gateText(row.entry_id)}:${gateText(row.path)}:${index}`} className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">
        <span className="font-semibold">{gateText(row.entry_label, gateLabel(row))}</span>
        <span className="text-slate-500"> / {gateText(row.schema_name)} / {gateText(row.path)}</span>
      </div>)}
      {rows.length === 0 && <EmptyState variant="compact" title="Usage not found in loaded content.">This requirement or flag is not referenced by loaded content yet. Attach it to a target before committing if it should control access.</EmptyState>}
    </div>
  </div>;
}
