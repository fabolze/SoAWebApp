import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { buildDependencyWalkthrough, type DependencyGateStatus, type DependencyNode, type DependencyWalkthroughModel, type DependencyWalkthroughStep } from "../authoring/dependencyWalkthrough";
import { buildQuestJourneyAnalysis, type QuestJourneyAnalysis, type QuestStoryMilestoneKind } from "../authoring/questJourneyAnalysis";
import { record } from "../authoring/storyPlacement";
import { EditableTagList, ReferenceChipPicker, ReferenceManageLink, rowLabel, useReferenceOptions } from "../authoringViews/controls";
import { buildQuestWalkthrough, type QuestWalkthroughStep } from "../authoring/questWalkthrough";
import ConsequenceComposer from "../components/authoring/ConsequenceComposer";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { useEntityStoryPlacement } from "../components/storyPlacement/useEntityStoryPlacement";
import { useDirtyState } from "../components/useDirtyState";
import { AuthoringHealthSummary, AuthoringPageShell, AuthoringPanel, AuthoringSectionNav, EmptyState, StatusNotice } from "../components/authoringUi";
import { apiFetch } from "../lib/api";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const panelClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter((row): row is EntryRecord => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value);
  return rendered || fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelFromOptions(id: unknown, options: EntryRecord[], fallback = "Unknown"): string {
  const value = text(id);
  const option = options.find((entry) => text(entry.id) === value);
  return option ? rowLabel(option, value) : value || fallback;
}

function JsonEditor({ label, value, onChange }: { label: string; value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(JSON.stringify(value ?? [], null, 2));
  useEffect(() => setDraft(JSON.stringify(value ?? [], null, 2)), [value]);
  return <label className="block text-sm font-medium">{label}<textarea className={`${inputClass} mt-1 min-h-32 font-mono text-xs`} value={draft} onChange={(event) => {
    setDraft(event.target.value);
    try { onChange(JSON.parse(event.target.value)); } catch { /* Keep incomplete JSON local until valid. */ }
  }} /></label>;
}

function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

function Shell({ title, subtitle, dirty, blockers = 0, warnings = 0, sections = [], onSave, onReset, children }: { title: string; subtitle: string; dirty: boolean; blockers?: number; warnings?: number; sections?: Array<{ id: string; label: string; summary: string }>; onSave: () => void; onReset: () => void; children: React.ReactNode }) {
  return <AuthoringPageShell>
    <AuthoringPanel
      title={title}
      subtitle={dirty ? "Unsaved journey draft" : "Draft matches last saved bundle"}
      help={`${subtitle} Save Quest Bundle writes the current quest record immediately. Reset Draft discards browser-local changes.`}
      status={<AuthoringHealthSummary blockers={blockers} warnings={warnings} dirty={dirty} />}
      actions={<><button type="button" className={`${BUTTON_CLASSES.secondary} ${BUTTON_SIZES.sm}`} onClick={onReset}>Reset Draft</button><button type="button" className={`${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`} disabled={!dirty} onClick={onSave}>Save Quest Bundle</button></>}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </AuthoringPanel>
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <AuthoringSectionNav sections={sections} />
      <div className="min-w-0">{children}</div>
    </div>
  </AuthoringPageShell>;
}

function MultiReferencePicker({ label, values, options, onChange, emptyText = "None selected." }: { label: string; values: unknown; options: EntryRecord[]; onChange: (values: string[]) => void; emptyText?: string }) {
  const selected = strings(values);
  const reference = label.includes("Flag") ? "flags" : label.includes("Quest Giver") ? "interaction_profiles" : "";
  const liveOptions = useReferenceOptions(reference, options);
  const resolvedOptions = reference ? liveOptions : options;
  const available = resolvedOptions.filter((option) => !selected.includes(text(option.id)));
  return <div>
    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{label}</div>{reference && <ReferenceManageLink reference={reference} onCreated={(id) => onChange(selected.includes(id) ? selected : [...selected, id])} />}
    <div className="flex flex-wrap gap-1">
      {selected.map((id) => {
        const option = resolvedOptions.find((entry) => text(entry.id) === id);
        return <button key={id} type="button" className="rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900" title="Remove" onClick={() => onChange(selected.filter((value) => value !== id))}>{option ? rowLabel(option, id) : id} x</button>;
      })}
      {selected.length === 0 && <EmptyState variant="compact">{emptyText}</EmptyState>}
    </div>
    <select className={`${inputClass} mt-2`} value="" disabled={available.length === 0} onChange={(event) => event.target.value && onChange([...selected, event.target.value])}>
      <option value="">{available.length ? `Add ${label.toLowerCase()}...` : "No more available"}</option>
      {available.map((option) => <option key={text(option.id)} value={text(option.id)}>{rowLabel(option, text(option.id))}</option>)}
    </select>
  </div>;
}

function ObjectiveBoard({ objectives, flags, selectedObjectiveId = "", canReviewConsequences = false, onChange, onReviewConsequence }: {
  objectives: unknown;
  flags: EntryRecord[];
  selectedObjectiveId?: string;
  canReviewConsequences?: boolean;
  onChange: (objectives: EntryRecord[]) => void;
  onReviewConsequence?: (objectiveId: string) => void;
}) {
  const objectiveRows = rows(objectives);
  const update = (index: number, patch: EntryRecord) => onChange(objectiveRows.map((objective, rowIndex) => rowIndex === index ? { ...objective, ...patch } : objective));
  const move = (index: number, offset: number) => {
    const next = [...objectiveRows];
    const [objective] = next.splice(index, 1);
    next.splice(index + offset, 0, objective);
    onChange(next);
  };
  return <div className="space-y-3">
    {objectiveRows.map((objective, index) => <article key={`${text(objective.objective_id)}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><div className="text-xs font-semibold uppercase text-slate-500">Objective {index + 1}</div><div className="text-sm font-medium">{text(objective.description) || "Describe what the player must accomplish."}</div></div>
        <div className="flex gap-1">
          {canReviewConsequences && onReviewConsequence && <button type="button" className={`rounded border px-2 py-1 text-xs ${selectedObjectiveId === text(objective.objective_id) ? "border-blue-600 bg-blue-600 text-white" : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300"}`} disabled={!text(objective.objective_id)} onClick={() => onReviewConsequence(text(objective.objective_id))}>Review Consequence</button>}
          <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
          <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={index === objectiveRows.length - 1} onClick={() => move(index, 1)}>Down</button>
          <button type="button" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => onChange(objectiveRows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold uppercase text-slate-500">Objective ID<input className={`${inputClass} mt-1`} value={text(objective.objective_id)} onChange={(event) => update(index, { objective_id: event.target.value })} /></label>
        <ReferenceChipPicker label="Unlock Requirement" value={objective.requirements_id} reference="requirements" onChange={(requirements_id) => update(index, { requirements_id })} />
        <label className="block text-xs font-semibold uppercase text-slate-500 md:col-span-2">Player-Facing Description<textarea className={`${inputClass} mt-1 min-h-20`} value={text(objective.description)} onChange={(event) => update(index, { description: event.target.value })} /></label>
        <div className="md:col-span-2"><MultiReferencePicker label="Flags Set" values={objective.flags_set} options={flags} onChange={(flags_set) => update(index, { flags_set })} /></div>
      </div>
    </article>)}
    {objectiveRows.length === 0 && <EmptyState title="No objectives yet">Add at least one ordered objective so the quest journey can describe what the player does before completion.</EmptyState>}
    <button type="button" className="rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:text-blue-300" onClick={() => onChange([...objectiveRows, { objective_id: generateSlug(`objective-${generateUlid().slice(-6)}`), description: "", requirements_id: "", flags_set: [] }])}>Add Objective</button>
  </div>;
}

function RewardRows({ label, rowsValue, reference, idKey, amountKey, onChange }: { label: string; rowsValue: unknown; reference: string; idKey: string; amountKey: string; onChange: (value: EntryRecord[]) => void }) {
  const options = useReferenceOptions(reference);
  const rewardRows = rows(rowsValue);
  const update = (index: number, patch: EntryRecord) => onChange(rewardRows.map((reward, rowIndex) => rowIndex === index ? { ...reward, ...patch } : reward));
  return <div>
    <div className="mb-2"><div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div><ReferenceManageLink reference={reference} onCreated={(id) => onChange([...rewardRows, { [idKey]: id, [amountKey]: amountKey === "quantity" ? 1 : 0 }])} /></div>
    <div className="space-y-2">{rewardRows.map((reward, index) => <div key={`${text(reward[idKey])}-${index}`} className="grid grid-cols-[1fr_7rem_auto] gap-2">
      <select className={inputClass} value={text(reward[idKey])} onChange={(event) => update(index, { [idKey]: event.target.value })}><option value="">Choose...</option>{options.map((option) => <option key={text(option.id)} value={text(option.id)}>{rowLabel(option, text(option.id))}</option>)}</select>
      <input className={inputClass} type="number" value={text(reward[amountKey])} onChange={(event) => update(index, { [amountKey]: Number(event.target.value) })} />
      <button type="button" className="rounded border border-red-300 px-2 text-xs text-red-700" onClick={() => onChange(rewardRows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
    </div>)}</div>
    <button type="button" className="mt-2 rounded border px-2 py-1 text-xs font-semibold" onClick={() => onChange([...rewardRows, { [idKey]: "", [amountKey]: amountKey === "quantity" ? 1 : 0 }])}>Add {label}</button>
  </div>;
}

function DependencyContext({ context, packet }: { context: unknown; packet: EntryRecord }) {
  const value = typeof context === "object" && context !== null && !Array.isArray(context) ? context as EntryRecord : {};
  const edges = [...rows(value.prerequisites), ...rows(value.aftermath)];
  const catalogs = [...rows(packet.flags), ...rows(packet.requirements), ...rows(packet.quests), ...rows(packet.story_arcs), ...rows(value.nodes)];
  const labels = new Map<string, string>();
  catalogs.forEach((entry) => {
    const resolvedLabel = text(entry.label) || rowLabel(entry, text(entry.id));
    labels.set(text(entry.id), resolvedLabel);
    if (text(entry.entry_id)) labels.set(text(entry.entry_id), resolvedLabel);
  });
  const nodeLabel = (nodeId: unknown) => {
    const raw = text(nodeId);
    const entryId = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
    return labels.get(raw) || labels.get(entryId) || entryId || "Unknown";
  };
  return <div className="space-y-3">
    <p className="text-sm text-slate-500">Objectives apply flags in order. Completion flags can unlock later content.</p>
    <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Prerequisites</div>{rows(value.prerequisites).length ? rows(value.prerequisites).map((edge) => <div key={text(edge.id)} className="mb-1 rounded border border-amber-200 px-2 py-1 text-xs">{nodeLabel(edge.source)} -&gt; {text(edge.relation)} -&gt; {nodeLabel(edge.target)}</div>) : <EmptyState variant="compact" title="No prerequisite flags">Add quest unlock requirements when this journey should be blocked by player state.</EmptyState>}</div>
    <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Aftermath</div>{rows(value.aftermath).length ? rows(value.aftermath).map((edge) => <div key={text(edge.id)} className="mb-1 rounded border border-emerald-200 px-2 py-1 text-xs">{nodeLabel(edge.source)} -&gt; unlocks -&gt; {nodeLabel(edge.target)}</div>) : <EmptyState variant="compact" title="No downstream unlocks">Add completion flags or follow-up requirements when this quest should open later content.</EmptyState>}</div>
    {edges.some((edge) => !text(edge.source) || !text(edge.target)) && <p className="text-sm text-red-600">Broken dependency context detected.</p>}
  </div>;
}

function FlagTray({ label, values, flags, empty = "No flags in this group." }: { label: string; values: string[]; flags: EntryRecord[]; empty?: string }) {
  return <div><div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{label}</div><div className="flex flex-wrap gap-1">
    {values.length ? values.map((flag) => <span key={flag} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{labelFromOptions(flag, flags, flag)}</span>) : <EmptyState variant="compact">{empty}</EmptyState>}
  </div></div>;
}

function RequirementStatus({ step, flags }: { step: QuestWalkthroughStep; flags: EntryRecord[] }) {
  const requirement = step.requirement;
  if (!requirement) return <EmptyState variant="compact" title="No unlock requirement">This step is currently available without checking player state.</EmptyState>;
  return <div className={`rounded-md border p-3 text-xs ${requirement.satisfied ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
    <div className="mb-2 font-semibold">{requirement.label} {requirement.satisfied ? "is open" : "is locked"}</div>
    <div className="grid gap-2 md:grid-cols-2">
      <FlagTray label="Required" values={requirement.requiredFlags} flags={flags} empty="No required flags." />
      <FlagTray label="Forbidden" values={requirement.forbiddenFlags} flags={flags} empty="No forbidden flags." />
    </div>
    {requirement.missingRequiredFlags.length > 0 && <div className="mt-2">Missing: {requirement.missingRequiredFlags.map((flag) => labelFromOptions(flag, flags, flag)).join(", ")}</div>}
    {requirement.presentForbiddenFlags.length > 0 && <div className="mt-2">Forbidden state present: {requirement.presentForbiddenFlags.map((flag) => labelFromOptions(flag, flags, flag)).join(", ")}</div>}
    {requirement.reputationGates.length > 0 && <div className="mt-2">Reputation gates: {requirement.reputationGates.map((gate) => `${gate.factionId} >= ${gate.minimum}`).join(", ")}</div>}
  </div>;
}

function RewardTray({ rewards, packet }: { rewards: EntryRecord; packet: EntryRecord }) {
  const itemRewards = rows(rewards.item_rewards);
  const currencyRewards = rows(rewards.currency_rewards);
  const reputationRewards = rows(rewards.reputation_rewards);
  const hasRewards = numberValue(rewards.xp_reward) !== 0 || itemRewards.length > 0 || currencyRewards.length > 0 || reputationRewards.length > 0;
  if (!hasRewards) return <EmptyState variant="compact" title="No payoff authored">Add XP, item, currency, or reputation rewards when this step should grant a payoff.</EmptyState>;
  return <div className="grid gap-2 text-xs md:grid-cols-2">
    {numberValue(rewards.xp_reward) !== 0 && <div className="rounded border border-slate-200 p-2 dark:border-slate-800">XP: {numberValue(rewards.xp_reward)}</div>}
    {itemRewards.map((reward, index) => <div key={`item-${index}`} className="rounded border border-slate-200 p-2 dark:border-slate-800">Item: {labelFromOptions(reward.item_id, rows(packet.items), text(reward.item_id))} x {text(reward.quantity) || "1"}</div>)}
    {currencyRewards.map((reward, index) => <div key={`currency-${index}`} className="rounded border border-slate-200 p-2 dark:border-slate-800">Currency: {labelFromOptions(reward.currency_id, rows(packet.currencies), text(reward.currency_id))} x {text(reward.amount) || "0"}</div>)}
    {reputationRewards.map((reward, index) => <div key={`reputation-${index}`} className="rounded border border-slate-200 p-2 dark:border-slate-800">Reputation: {labelFromOptions(reward.faction_id, rows(packet.factions), text(reward.faction_id))} {text(reward.amount) || "0"}</div>)}
  </div>;
}

function QuestWalkthroughPanel({ packet }: { packet: EntryRecord }) {
  const flags = rows(packet.flags);
  const [initialFlags, setInitialFlags] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const model = useMemo(() => buildQuestWalkthrough(packet, initialFlags), [packet, initialFlags]);
  const step = model.steps[Math.min(activeIndex, Math.max(model.steps.length - 1, 0))];
  const updateInitialFlags = (values: string[]) => {
    setInitialFlags(values);
    setActiveIndex(0);
  };
  if (!step) return null;
  return <div className="space-y-4" data-testid="quest-walkthrough-panel">
    <MultiReferencePicker label="Temporary Player State" values={initialFlags} options={flags} onChange={updateInitialFlags} emptyText="Start with no flags." />
    <div className="flex flex-wrap gap-2">
      {model.steps.map((entry, index) => <button key={entry.id} type="button" className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${index === activeIndex ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setActiveIndex(index)}>{entry.title}</button>)}
    </div>
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><div className="text-[11px] font-semibold uppercase text-slate-500">{step.kind}</div><h3 className="font-semibold">{step.title}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.description}</p></div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${step.requirement && !step.requirement.satisfied ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{step.requirement && !step.requirement.satisfied ? "Locked" : "Open"}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <RequirementStatus step={step} flags={flags} />
        <div className="space-y-3">
          <FlagTray label="Flags Before" values={step.flagsBefore} flags={flags} empty="No flags yet." />
          <FlagTray label="Flags Gained" values={step.flagsGained} flags={flags} empty="No flags gained." />
          <FlagTray label="Flags After" values={step.flagsAfter} flags={flags} empty="No flags after this step." />
        </div>
      </div>
      {step.kind === "completion" && <div className="mt-3"><div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Payoff</div><RewardTray rewards={step.rewards} packet={packet} /></div>}
      {step.warnings.length > 0 && <div className="mt-3 space-y-1">{step.warnings.map((warning) => <p key={warning} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{warning}</p>)}</div>}
    </article>
    {model.warnings.length > 0 && <div className="space-y-1">{model.warnings.map((warning) => <p key={warning} className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-800 dark:border-amber-900 dark:text-amber-200">{warning}</p>)}</div>}
    <DependencyContext context={packet.dependency_context} packet={packet} />
  </div>;
}

const milestoneTone: Record<QuestStoryMilestoneKind, string> = {
  start: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  escalation: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200",
  branch: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  resolution: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200",
  other: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200",
};

function QuestStoryPathPanel({ analysis, flags }: { analysis: QuestJourneyAnalysis; flags: EntryRecord[] }) {
  return <AuthoringPanel
    className="xl:col-span-2"
    title="Story Path"
    subtitle="Objective order beside canonical quest story placements and arc branches."
    help="Use this preview to compare playable objective order with canonical story placement, branch exits, and path diagnostics before reviewing the quest bundle."
    status={<div className="flex flex-wrap gap-1 text-xs">
        {(["start", "escalation", "branch", "resolution"] as QuestStoryMilestoneKind[]).map((kind) => <span key={kind} className={`rounded-full border px-2 py-1 font-semibold capitalize ${milestoneTone[kind]}`}>{kind}</span>)}
      </div>}
    testId="quest-story-path-panel"
  >
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Playable Steps</div>
        <div className="space-y-2">
          {analysis.steps.map((step, index) => <article key={step.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{step.label}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-900">{step.kind}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {step.requirementId && <span className="rounded-full border border-amber-200 px-2 py-1 text-xs text-amber-800 dark:border-amber-900 dark:text-amber-200">Gate: {step.requirementId}</span>}
                  {step.flagsSet.map((flag) => <span key={flag} className="rounded-full border border-emerald-200 px-2 py-1 text-xs text-emerald-800 dark:border-emerald-900 dark:text-emerald-200">Sets {labelFromOptions(flag, flags, flag)}</span>)}
                  {!step.requirementId && step.flagsSet.length === 0 && <EmptyState variant="compact">This step has no unlock requirement or state change.</EmptyState>}
                </div>
              </div>
            </div>
          </article>)}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Story Milestones</div>
        <div className="space-y-2">
          {analysis.milestones.map((milestone) => <article key={milestone.id} className={`rounded-lg border p-3 ${milestoneTone[milestone.kind]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase">{milestone.kind}</div>
                <h3 className="text-sm font-semibold">{milestone.beatLabel || milestone.label}</h3>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold dark:bg-slate-900/70">{milestone.importance}</span>
            </div>
            <p className="mt-1 text-xs">Order {milestone.order} / {milestone.lifecycle}</p>
          </article>)}
          {analysis.milestones.length === 0 && <EmptyState title="No canonical quest story placements">Attach story placement context when this quest should appear on the timeline or in branch previews.</EmptyState>}
        </div>
      </div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Arc Branches</div>
        <div className="space-y-2">
          {analysis.branches.map((branch) => <div key={branch.id} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
            <div className="font-semibold">{branch.conditionFlag ? labelFromOptions(branch.conditionFlag, flags, branch.conditionFlag) : "No condition"} -&gt; {branch.nextQuestLabel}</div>
            <div className="mt-1 text-xs">{branch.targetOrder === null ? "Target is outside this arc order." : `Arc order ${branch.targetOrder + 1}`}</div>
          </div>)}
          {analysis.branches.length === 0 && <EmptyState title="No branch exits">Add branch entries when completing this quest should move the player into another quest path.</EmptyState>}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Path Diagnostics</div>
        <div className="space-y-2">
          {analysis.diagnostics.map((diagnostic) => <p key={diagnostic.id} className={`rounded border px-3 py-2 text-sm ${diagnostic.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"}`}>{diagnostic.message}</p>)}
          {analysis.diagnostics.length === 0 && <StatusNotice tone="success">No branch path issues detected.</StatusNotice>}
        </div>
      </div>
    </div>
  </AuthoringPanel>;
}

export function QuestJourneyPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = !id || location.pathname.endsWith("/new");
  const generatedId = useMemo(() => generateUlid(), []);
  const empty = useMemo(() => ({ quest: { id: generatedId, slug: generateSlug(`new-quest-${generatedId.slice(-6)}`), title: "New Quest", description: "", objectives: [], flags_set_on_completion: [], item_rewards: [], currency_rewards: [], reputation_rewards: [], tags: [] }, requirements: [], arc: { story_arc_id: "", related_quests: [generatedId], branches: [] }, quest_giver_profile_ids: [] }) as EntryRecord, [generatedId]);
  const [packet, setPacket] = useDraft<EntryRecord>(`soa.quest-journey.${isNew ? "new" : id}`, empty);
  const [original, setOriginal] = useState(JSON.stringify(empty));
  const [selectedObjectiveConsequenceId, setSelectedObjectiveConsequenceId] = useState("");
  const originalPacket = useMemo(() => {
    try { return JSON.parse(original) as EntryRecord; } catch { return empty; }
  }, [empty, original]);
  const dirty = JSON.stringify(packet) !== original;
  const { setDirty } = useDirtyState();
  useEffect(() => { setDirty("quest-journey", dirty); return () => setDirty("quest-journey", false); }, [dirty, setDirty]);
  useEffect(() => { if (!isNew) apiFetch(`/api/ui/quests/${encodeURIComponent(id)}`).then((response) => response.json()).then((data) => { setPacket(data); setOriginal(JSON.stringify(data)); }); }, [id, isNew, setPacket]);
  const quest = packet.quest as EntryRecord;
  const update = (key: string, value: unknown) => setPacket({ ...packet, quest: { ...quest, [key]: value } });
  const allFlags = useReferenceOptions("flags");
  const allInteractionProfiles = useReferenceOptions("interaction_profiles");
  const questFlags = rows(packet.flags).length ? rows(packet.flags) : allFlags;
  const interactionProfiles = rows(packet.interaction_profiles).length ? rows(packet.interaction_profiles) : allInteractionProfiles;
  const hasRewards = numberValue(quest.xp_reward) !== 0 || rows(quest.item_rewards).length > 0 || rows(quest.currency_rewards).length > 0 || rows(quest.reputation_rewards).length > 0;
  const objectiveIssues = rows(quest.objectives).filter((objective) => !text(objective.objective_id) || !text(objective.description)).length;
  const savedQuest = record(originalPacket.quest);
  const savedObjectives = rows(savedQuest.objectives);
  const savedObjectiveIds = new Set(savedObjectives.map((objective) => text(objective.objective_id)).filter(Boolean));
  const selectedCurrentObjective = rows(quest.objectives).find((objective) => text(objective.objective_id) === selectedObjectiveConsequenceId);
  const objectiveConsequenceSource = selectedObjectiveConsequenceId && savedObjectiveIds.has(selectedObjectiveConsequenceId) ? {
    ...savedQuest,
    consequence_objective_id: selectedObjectiveConsequenceId,
    objectives: savedObjectives.map((objective) => text(objective.objective_id) === selectedObjectiveConsequenceId
      ? { ...objective, flags_set: strings(selectedCurrentObjective?.flags_set ?? objective.flags_set) }
      : objective),
  } : null;
  const storyPlacement = useEntityStoryPlacement({ entityKind: "quest", entityId: text(quest.id), entity: quest });
  const questAnalysis = useMemo(() => buildQuestJourneyAnalysis({ packet, storyPacket: storyPlacement.packet, questId: text(quest.id), occurrences: storyPlacement.context.occurrences }), [packet, quest, storyPlacement.context.occurrences, storyPlacement.packet]);
  const save = async () => { const response = await apiFetch("/api/ui/quests/bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet) }); const data = await response.json(); if (response.ok) { setPacket(data); setOriginal(JSON.stringify(data)); if (isNew) navigate(`/author/quests/${encodeURIComponent(text(data.quest.id))}`, { replace: true }); } };
  return <Shell title="Quest Journey Board" subtitle="Compose invitation, ordered objectives, completion, payoff, and aftermath." dirty={dirty} blockers={objectiveIssues} warnings={(hasRewards ? 0 : 1) + (strings(packet.quest_giver_profile_ids).length ? 0 : 1)} sections={[{ id: "authoring-invitation", label: "Invitation", summary: "Player-facing entry" }, { id: "authoring-journey-health", label: "Journey Health", summary: "Review blockers" }, { id: "authoring-ordered-objectives", label: "Objectives", summary: "Ordered steps" }, { id: "authoring-completion-payoff", label: "Completion And Payoff", summary: "Rewards and state" }, { id: "authoring-walkthrough-aftermath", label: "Walkthrough", summary: "Temporary playthrough" }]} onSave={save} onReset={() => setPacket(JSON.parse(original))}><div className="grid gap-4 xl:grid-cols-2">
    <AuthoringPanel title="Invitation" help="Define how the quest appears to the player, which unlock requirement controls availability, and which interaction profiles can offer it."><div className="space-y-3"><label className="block text-sm">Title<input className={`${inputClass} mt-1`} value={text(quest.title)} onChange={(event) => update("title", event.target.value)} /></label><label className="block text-sm">Slug<input className={`${inputClass} mt-1`} value={text(quest.slug)} onChange={(event) => update("slug", event.target.value)} /></label><label className="block text-sm">Description<textarea className={`${inputClass} mt-1 min-h-24`} value={text(quest.description)} onChange={(event) => update("description", event.target.value)} /></label><ReferenceChipPicker label="Quest Unlock Requirement" value={quest.requirements_id} reference="requirements" onChange={(requirements_id) => update("requirements_id", requirements_id)} /><MultiReferencePicker label="Quest Givers" values={packet.quest_giver_profile_ids} options={interactionProfiles} onChange={(quest_giver_profile_ids) => setPacket({ ...packet, quest_giver_profile_ids })} /><EditableTagList tags={quest.tags} onChange={(tags) => update("tags", tags)} /></div></AuthoringPanel>
    <AuthoringPanel title="Journey Health" help="Use this checklist before review. It flags missing objectives, missing player-facing text, missing payoff, and missing state links." status={<span className={`rounded-full px-2 py-1 text-xs font-semibold ${rows(quest.objectives).length && !objectiveIssues ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{rows(quest.objectives).length && !objectiveIssues ? "Ready to review" : "Needs attention"}</span>}><div className="space-y-2 text-sm">{rows(quest.objectives).length === 0 && <StatusNotice tone="warning">Add at least one objective.</StatusNotice>}{objectiveIssues > 0 && <StatusNotice tone="warning">{objectiveIssues} objective(s) need both an ID and player-facing description.</StatusNotice>}{strings(quest.flags_set_on_completion).length === 0 && <EmptyState variant="compact" title="No completion flag">Add a completion flag when this quest should directly unlock flag-gated content.</EmptyState>}{!hasRewards && <StatusNotice tone="warning">Quest has no authored payoff.</StatusNotice>}{strings(packet.quest_giver_profile_ids).length === 0 && <EmptyState variant="compact" title="No quest giver">Add a quest giver when this quest should be offered by a character or interaction profile.</EmptyState>}</div></AuthoringPanel>
    <AuthoringPanel className="xl:col-span-2" title="Ordered Objectives" help="Author the player-facing steps in order. Saved objectives can review their completion flags through the objective consequence composer."><ObjectiveBoard objectives={quest.objectives} flags={questFlags} selectedObjectiveId={selectedObjectiveConsequenceId} canReviewConsequences={!isNew && text(quest.id) !== ""} onReviewConsequence={setSelectedObjectiveConsequenceId} onChange={(objectives) => update("objectives", objectives)} />
      {!isNew && selectedObjectiveConsequenceId && !objectiveConsequenceSource && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Save this objective before reviewing its consequence packet.</p>}
      {!isNew && objectiveConsequenceSource && <div className="mt-4">
        <ConsequenceComposer
          sourceKind="quest_objective"
          source={objectiveConsequenceSource}
          expectedSource={{ ...savedQuest, consequence_objective_id: selectedObjectiveConsequenceId }}
          sourceLabel={text(selectedCurrentObjective?.description) || selectedObjectiveConsequenceId}
          title="Atomic Objective Consequence"
          subtitle="Commit objective completion flags through the shared reviewed consequence packet."
          onSourceCommitted={(savedQuestFromComposer) => {
            const savedObjective = rows(savedQuestFromComposer.objectives).find((objective) => text(objective.objective_id) === selectedObjectiveConsequenceId);
            setPacket((current) => {
              const currentQuest = record(current.quest);
              return {
                ...current,
                quest: {
                  ...currentQuest,
                  objectives: rows(currentQuest.objectives).map((objective) => text(objective.objective_id) === selectedObjectiveConsequenceId && savedObjective
                    ? { ...objective, flags_set: strings(savedObjective.flags_set) }
                    : objective),
                },
              };
            });
            setOriginal(JSON.stringify({ ...originalPacket, quest: savedQuestFromComposer }));
          }}
        />
      </div>}
    </AuthoringPanel>
    {!isNew && text(quest.id) && <QuestStoryPathPanel analysis={questAnalysis} flags={questFlags} />}
    <AuthoringPanel title="Completion & Payoff" help="Set the state and rewards granted when the full quest completes. Use the consequence review below for saved quests when you need an atomic commit."><div className="space-y-4"><MultiReferencePicker label="Completion Flags" values={quest.flags_set_on_completion} options={questFlags} onChange={(flags) => update("flags_set_on_completion", flags)} /><label className="block text-xs font-semibold uppercase text-slate-500">Experience Reward<input className={`${inputClass} mt-1`} type="number" value={text(quest.xp_reward)} onChange={(event) => update("xp_reward", Number(event.target.value))} /></label><RewardRows label="Item Reward" rowsValue={quest.item_rewards} reference="items" idKey="item_id" amountKey="quantity" onChange={(value) => update("item_rewards", value)} /><RewardRows label="Currency Reward" rowsValue={quest.currency_rewards} reference="currencies" idKey="currency_id" amountKey="amount" onChange={(value) => update("currency_rewards", value)} /><RewardRows label="Reputation Reward" rowsValue={quest.reputation_rewards} reference="factions" idKey="faction_id" amountKey="amount" onChange={(value) => update("reputation_rewards", value)} /></div></AuthoringPanel>
    {!isNew && text(quest.id) && <AuthoringPanel title="Quest Consequence Review" help="Review and commit completion flags, payoff rewards, reputation, and follow-up story consequences through one shared packet."><ConsequenceComposer
      sourceKind="quest"
      source={quest}
      expectedSource={record(originalPacket.quest)}
      sourceLabel={text(quest.title) || text(quest.id)}
      title="Atomic Quest Consequences"
      subtitle="Commit completion flags, payoff rewards, reputation, and follow-up story consequences through one reviewed packet."
      onSourceCommitted={(savedQuest) => {
        setPacket((current) => ({ ...current, quest: savedQuest }));
        setOriginal(JSON.stringify({ ...originalPacket, quest: savedQuest }));
      }}
    /></AuthoringPanel>}
    <AuthoringPanel title="Walkthrough & Aftermath" help="Test the quest flow with temporary player state and inspect prerequisite or downstream dependency context."><QuestWalkthroughPanel packet={packet} /><Link className="mt-4 inline-block text-sm font-semibold text-primary" to="/author/dependencies">Inspect Dependency Map</Link></AuthoringPanel>
    {!isNew && text(quest.id) && <section className="xl:col-span-2"><StoryPlacementPanel entityKind="quest" entityId={text(quest.id)} entityLabel={text(quest.title) || text(quest.id)} entity={quest} storyPacket={storyPlacement.packet} onStoryPacketChange={storyPlacement.setPacket} /></section>}
    <AuthoringPanel className="xl:col-span-2" title="Advanced Arc & Branch Data" help="Use this advanced JSON editor only when the structured story path and branch controls do not expose the needed arc data."><JsonEditor label="Arc selection and branches" value={packet.arc} onChange={(value) => setPacket({ ...packet, arc: value })} /></AuthoringPanel>
  </div></Shell>;
}

export function LegacyDependencyMapPage() {
  const [index, setIndex] = useState<EntryRecord>({ nodes: [], edges: [], health: {} });
  const [focus, setFocus] = useState("");
  useEffect(() => { apiFetch("/api/ui/dependencies").then((response) => response.json()).then(setIndex); }, []);
  const nodes = rows(index.nodes);
  const edges = rows(index.edges).filter((edge) => !focus || edge.source === focus || edge.target === focus);
  return <div className="space-y-5 p-5"><header><h1 className="text-2xl font-semibold">Adventure Dependency Map</h1><p className="text-sm text-slate-500">Solid relationships are stored; dashed relationships are inferred.</p></header><select className={inputClass} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="">All nodes</option>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)}>{text(node.kind)}: {text(node.label)}</option>)}</select><div className="grid gap-4 lg:grid-cols-3"><section className={panelClass}><h2 className="font-semibold">Health Lenses</h2><pre className="mt-3 max-h-[32rem] overflow-auto text-xs">{JSON.stringify(index.health, null, 2)}</pre></section><section className={`${panelClass} lg:col-span-2`}><h2 className="font-semibold">Focused Relationships</h2><div className="mt-3 space-y-2">{edges.map((edge) => <div key={text(edge.id)} className={`rounded-md border p-2 text-xs ${edge.explicit ? "border-solid" : "border-dashed"}`}>{text(edge.source)} → {text(edge.relation)} → {text(edge.target)}</div>)}</div></section></div></div>;
}

function DependencyFlagPicker({ flags, selected, onChange }: { flags: DependencyNode[]; selected: string[]; onChange: (values: string[]) => void }) {
  const available = flags.filter((flag) => !selected.includes(flag.id));
  return <div>
    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Initial Temporary Flags</div>
    <div className="flex flex-wrap gap-1">
      {selected.map((id) => {
        const flag = flags.find((entry) => entry.id === id);
        return <button key={id} type="button" className="rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900" title="Remove" onClick={() => onChange(selected.filter((value) => value !== id))}>{flag?.label || id} x</button>;
      })}
      {selected.length === 0 && <EmptyState variant="compact" title="No starting flags">Start with temporary flags only when you want to test a later-game dependency state.</EmptyState>}
    </div>
    <select className={`${inputClass} mt-2`} value="" disabled={available.length === 0} onChange={(event) => event.target.value && onChange([...selected, event.target.value])}>
      <option value="">{available.length ? "Add initial flag..." : "No more flags"}</option>
      {available.map((flag) => <option key={flag.id} value={flag.id}>{flag.label}</option>)}
    </select>
  </div>;
}

function DependencyFlagList({ label, flagIds, flags, empty = "No flags in this step." }: { label: string; flagIds: string[]; flags: DependencyNode[]; empty?: string }) {
  return <div><div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{label}</div><div className="flex flex-wrap gap-1">
    {flagIds.length ? flagIds.map((id) => {
      const flag = flags.find((entry) => entry.id === id);
      return <span key={id} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{flag?.label || id}</span>;
    }) : <EmptyState variant="compact">{empty}</EmptyState>}
  </div></div>;
}

function DependencyGateList({ title, gates, flags, onFocus, empty, testId }: { title: string; gates: DependencyGateStatus[]; flags: DependencyNode[]; onFocus: (id: string) => void; empty: string; testId: string }) {
  return <div data-testid={testId}>
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{gates.length}</span></div>
    <div className="space-y-2">
      {gates.map((gate) => <article key={gate.id} className={`rounded-md border p-2 text-xs ${gate.open ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 text-left font-semibold text-blue-700 dark:text-blue-300" onClick={() => onFocus(gate.content.id)}>{gate.content.label}</button>
          <button type="button" className="shrink-0 text-[10px] text-slate-500" onClick={() => onFocus(gate.requirement.id)}>Focus gate</button>
        </div>
        <div className="mt-1 text-slate-600 dark:text-slate-300">{gate.requirement.label}</div>
        {!gate.open && <div className="mt-2 space-y-1">
          {gate.missingRequiredFlags.length > 0 && <DependencyFlagList label="Missing" flagIds={gate.missingRequiredFlags} flags={flags} />}
          {gate.presentForbiddenFlags.length > 0 && <DependencyFlagList label="Forbidden Present" flagIds={gate.presentForbiddenFlags} flags={flags} />}
        </div>}
      </article>)}
      {gates.length === 0 && <EmptyState variant="compact">{empty}</EmptyState>}
    </div>
  </div>;
}

function DependencyWalkthroughPanel({ model, initialFlags, triggerIds, activeIndex, onInitialFlagsChange, onTriggerIdsChange, onActiveIndexChange, onFocus }: {
  model: DependencyWalkthroughModel;
  initialFlags: string[];
  triggerIds: string[];
  activeIndex: number;
  onInitialFlagsChange: (values: string[]) => void;
  onTriggerIdsChange: (values: string[]) => void;
  onActiveIndexChange: (value: number) => void;
  onFocus: (id: string) => void;
}) {
  const step: DependencyWalkthroughStep | undefined = model.steps[Math.min(activeIndex, Math.max(model.steps.length - 1, 0))];
  const triggerById = new Map(model.triggers.map((trigger) => [trigger.id, trigger]));
  const addTrigger = (id: string) => {
    if (!id) return;
    onTriggerIdsChange([...triggerIds, id]);
    onActiveIndexChange(triggerIds.length + 1);
  };
  const moveTrigger = (index: number, offset: number) => {
    const next = [...triggerIds];
    const [trigger] = next.splice(index, 1);
    next.splice(index + offset, 0, trigger);
    onTriggerIdsChange(next);
    onActiveIndexChange(Math.max(1, index + offset + 1));
  };
  const removeTrigger = (index: number) => {
    onTriggerIdsChange(triggerIds.filter((_, rowIndex) => rowIndex !== index));
    onActiveIndexChange(Math.max(0, Math.min(activeIndex, triggerIds.length - 1)));
  };
  return <AuthoringPanel
    title="State Walkthrough"
    subtitle="Step through temporary flag state from existing sources. Nothing here is saved."
    help="Use the walkthrough to test whether a sequence of authored flag producers opens or blocks later content without editing any records."
    actions={(initialFlags.length > 0 || triggerIds.length > 0) && <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold" onClick={() => { onInitialFlagsChange([]); onTriggerIdsChange([]); onActiveIndexChange(0); }}>Reset Walkthrough</button>}
    testId="dependency-walkthrough-panel"
  >
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <DependencyFlagPicker flags={model.flags} selected={initialFlags} onChange={(values) => { onInitialFlagsChange(values); onActiveIndexChange(0); }} />
        <label className="block text-xs font-semibold uppercase text-slate-500">Trigger Existing Source<select className={`${inputClass} mt-1`} value="" disabled={model.triggers.length === 0} onChange={(event) => addTrigger(event.target.value)}>
          <option value="">{model.triggers.length ? "Add trigger..." : "No flag-setting sources"}</option>
          {model.triggers.map((trigger) => <option key={trigger.id} value={trigger.id}>{trigger.label}</option>)}
        </select></label>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Trigger Queue</div>
          <div className="space-y-2">
            {triggerIds.map((id, index) => {
              const trigger = triggerById.get(id);
              return <div key={`${id}-${index}`} className="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-left font-semibold text-blue-700 dark:text-blue-300" onClick={() => onActiveIndexChange(index + 1)}>{trigger?.label || id}</button>
                  <button type="button" className="text-red-700 dark:text-red-300" onClick={() => removeTrigger(index)}>Remove</button>
                </div>
                <DependencyFlagList label="Sets" flagIds={trigger?.flagsSet || []} flags={model.flags} empty="No flags." />
                <div className="mt-2 flex gap-1">
                  <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={index === 0} onClick={() => moveTrigger(index, -1)}>Up</button>
                  <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={index === triggerIds.length - 1} onClick={() => moveTrigger(index, 1)}>Down</button>
                  {trigger && <button type="button" className="rounded border px-2 py-1" onClick={() => onFocus(trigger.id)}>Focus</button>}
                </div>
              </div>;
            })}
            {triggerIds.length === 0 && <EmptyState variant="compact" title="No trigger queue">Add a flag-setting source to see how authored flags unlock or block content.</EmptyState>}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {model.steps.map((entry, index) => <button key={entry.id} type="button" className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${index === activeIndex ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => onActiveIndexChange(index)}>{entry.title}</button>)}
        </div>
        {step && <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-[11px] font-semibold uppercase text-slate-500">{step.trigger ? "trigger" : "state"}</div><h3 className="font-semibold">{step.title}</h3></div>
            {step.trigger && <button type="button" className="rounded border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:text-blue-300" onClick={() => onFocus(step.trigger!.id)}>Focus Source</button>}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <DependencyFlagList label="Flags Before" flagIds={step.flagsBefore} flags={model.flags} empty="No flags yet." />
            <DependencyFlagList label="Flags Gained" flagIds={step.flagsGained} flags={model.flags} empty="No new flags." />
            <DependencyFlagList label="Flags After" flagIds={step.flagsAfter} flags={model.flags} empty="No flags yet." />
          </div>
        </article>}
        {step && <div className="grid gap-4 lg:grid-cols-2">
          <DependencyGateList title="Newly Available" gates={step.newlyOpenGates} flags={model.flags} onFocus={onFocus} empty="No new content opens at this step." testId="dependency-newly-available" />
          <DependencyGateList title="Still Blocked" gates={step.blockedGates} flags={model.flags} onFocus={onFocus} empty="No gated content remains blocked." testId="dependency-still-blocked" />
        </div>}
      </div>
    </div>
  </AuthoringPanel>;
}

function dependencyNodeTone(node: EntryRecord | undefined, issueNodeIds: Set<string>): string {
  if (!node) return "border-red-400 bg-red-50 text-red-900";
  if (issueNodeIds.has(text(node.id))) return "border-amber-400 bg-amber-50 text-amber-950";
  const kind = text(node.kind);
  if (kind === "flag") return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-950";
  if (kind === "requirement") return "border-amber-300 bg-amber-50 text-amber-950";
  if (kind.includes("quest")) return "border-blue-300 bg-blue-50 text-blue-950";
  if (kind.includes("event") || kind.includes("encounter") || kind.includes("dialogue")) return "border-violet-300 bg-violet-50 text-violet-950";
  return "border-slate-300 bg-white text-slate-900";
}

function dependencyGraphNodes(
  visibleEdges: EntryRecord[],
  nodeById: Map<string, EntryRecord>,
  issueNodeIds: Set<string>,
): Node[] {
  const ids = [...new Set(visibleEdges.flatMap((edge) => [text(edge.source), text(edge.target)]).filter(Boolean))];
  const byKind = new Map<string, string[]>();
  ids.forEach((id) => {
    const kind = text(nodeById.get(id)?.kind, "missing");
    byKind.set(kind, [...(byKind.get(kind) || []), id]);
  });
  const kindOrder = ["flag", "requirement", "quests", "events", "encounters", "dialogues", "route", "shop", "missing"];
  const sortedKinds = [...byKind.keys()].sort((left, right) => {
    const leftIndex = kindOrder.findIndex((value) => left.includes(value));
    const rightIndex = kindOrder.findIndex((value) => right.includes(value));
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex) || left.localeCompare(right);
  });
  const columnByKind = new Map(sortedKinds.map((kind, index) => [kind, index]));
  const rowCounts = new Map<string, number>();
  return ids.map((id) => {
    const entry = nodeById.get(id);
    const kind = text(entry?.kind, "missing");
    const row = rowCounts.get(kind) || 0;
    rowCounts.set(kind, row + 1);
    return {
      id,
      position: { x: (columnByKind.get(kind) || 0) * 260, y: row * 100 },
      data: {
        label: (
          <div className={`min-w-44 rounded-md border px-3 py-2 text-xs shadow-sm ${dependencyNodeTone(entry, issueNodeIds)}`}>
            <div className="text-[10px] font-semibold uppercase opacity-70">{kind}</div>
            <div className="mt-1 max-w-44 truncate font-semibold">{text(entry?.label) || text(entry?.entry_id) || id}</div>
          </div>
        ),
      },
      style: { border: "none", background: "transparent", padding: 0 },
    };
  });
}

function dependencyGraphEdges(visibleEdges: EntryRecord[]): Edge[] {
  return visibleEdges.map((edge, index) => ({
    id: text(edge.id, `edge-${index}`),
    source: text(edge.source),
    target: text(edge.target),
    label: text(edge.relation),
    animated: !edge.explicit,
    type: "smoothstep",
    style: {
      stroke: edge.explicit ? "#334155" : "#7c3aed",
      strokeDasharray: edge.explicit ? undefined : "5 5",
      strokeWidth: 1.5,
    },
    labelStyle: { fontSize: 10, fill: "#475569", fontWeight: 600 },
  }));
}

function DependencyGraphPanel({
  visibleEdges,
  nodeById,
  issueNodeIds,
  onFocus,
}: {
  visibleEdges: EntryRecord[];
  nodeById: Map<string, EntryRecord>;
  issueNodeIds: Set<string>;
  onFocus: (id: string) => void;
}) {
  const graphNodes = useMemo(() => dependencyGraphNodes(visibleEdges, nodeById, issueNodeIds), [issueNodeIds, nodeById, visibleEdges]);
  const graphEdges = useMemo(() => dependencyGraphEdges(visibleEdges), [visibleEdges]);
  return <AuthoringPanel
    title="Focused Graph"
    subtitle="Read-only map of the same filtered relationships. Click a node to focus its neighborhood."
    help="Use the graph for orientation, then use the relationship list and health panel for exact records and affected fields."
    status={
      <>
        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{graphNodes.length} shown nodes</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{graphEdges.length} shown edges</span>
      </>
    }
    testId="dependency-graph-panel"
  >
    <div className="h-[420px] overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      {graphNodes.length > 0 ? (
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_event: MouseEvent, node: Node) => onFocus(node.id)}
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      ) : (
        <div className="grid h-full place-items-center p-4"><EmptyState title="No graph relationships match">Clear the focus, search, or lens filters to restore the dependency graph.</EmptyState></div>
      )}
    </div>
  </AuthoringPanel>;
}

export function DependencyMapPage() {
  const [index, setIndex] = useState<EntryRecord>({ nodes: [], edges: [], health: {} });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [focus, setFocus] = useState("");
  const [lens, setLens] = useState<DependencyLens>("all");
  const [search, setSearch] = useState("");
  const [initialFlags, setInitialFlags] = useState<string[]>([]);
  const [triggerIds, setTriggerIds] = useState<string[]>([]);
  const [activeWalkthroughIndex, setActiveWalkthroughIndex] = useState(0);
  const load = () => {
    setLoading(true);
    setLoadError("");
    apiFetch("/api/ui/dependencies").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(text(data.message, "Dependency Map failed to load."));
      setIndex(data);
    }).catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Dependency Map failed to load.")).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const nodes = useMemo(() => rows(index.nodes), [index.nodes]);
  const allEdges = useMemo(() => rows(index.edges), [index.edges]);
  const walkthrough = useMemo(() => buildDependencyWalkthrough(index, initialFlags, triggerIds), [index, initialFlags, triggerIds]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [text(node.id), node])), [nodes]);
  const health = useMemo(() => typeof index.health === "object" && index.health !== null && !Array.isArray(index.health) ? index.health as EntryRecord : {}, [index.health]);
  const brokenEdges = useMemo(() => allEdges.filter((edge) => !nodeById.has(text(edge.source)) || !nodeById.has(text(edge.target))), [allEdges, nodeById]);
  const issueNodeIds = useMemo(() => {
    const ids = new Set<string>();
    ["dead_flags", "unused_flags", "contradictions", "impossible_gates"].forEach((key) => rows(health[key]).forEach((node) => ids.add(text(node.id))));
    const cycles = Array.isArray(health.cycles) ? health.cycles : [];
    cycles.forEach((cycle) => { if (Array.isArray(cycle)) cycle.forEach((id) => ids.add(text(id))); });
    brokenEdges.forEach((edge) => { ids.add(text(edge.source)); ids.add(text(edge.target)); });
    return ids;
  }, [brokenEdges, health]);
  const visibleEdges = allEdges.filter((edge) => {
    if (focus && edge.source !== focus && edge.target !== focus) return false;
    if (!dependencyLensMatches(edge, lens)) return false;
    if (!search.trim()) return true;
    const haystack = [edge.relation, edge.path, nodeById.get(text(edge.source))?.label, nodeById.get(text(edge.target))?.label, edge.source, edge.target].map((entry) => text(entry)).join(" ").toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  if (loading) return <AuthoringPageShell><StatusNotice>Loading Dependency Map...</StatusNotice></AuthoringPageShell>;
  if (loadError) return <AuthoringPageShell><StatusNotice tone="error" action={<button type="button" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={load}>Try Again</button>}>{loadError} Check the service and retry.</StatusNotice></AuthoringPageShell>;
  return <AuthoringPageShell>
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <AuthoringSectionNav sections={[{ id: "dependency-header", label: "Dependency Map", summary: "Graph scope" }, { id: "dependency-filters", label: "Filters", summary: "Focus and lenses" }, { id: "dependency-graph", label: "Graph", summary: "Relationship canvas" }, { id: "dependency-walkthrough", label: "Walkthrough", summary: "Temporary flags" }, { id: "dependency-health", label: "Actionable Health", summary: "Broken chains" }, { id: "dependency-relationships", label: "Relationships", summary: "Exact links" }]} />
      <main className="min-w-0 space-y-4">
    <div id="dependency-header" className="scroll-mt-24" />
    <AuthoringPanel title="Adventure Dependency Map" subtitle="Trace prerequisites, flags, unlocks, and branches. Solid relationships are stored; dashed relationships are inferred." help="Use this read-only workspace to find broken unlock chains, impossible requirements, unused flags, and the content affected by a flag or requirement." status={<><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{nodes.length} nodes</span><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{allEdges.length} relationships</span><span className={`rounded-full px-2 py-1 ${issueNodeIds.size ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{issueNodeIds.size} issue nodes</span></>} />
    <AuthoringHealthSummary blockers={issueNodeIds.size} warnings={brokenEdges.length} dirty={Boolean(focus || search || lens !== "all")} />
    <div id="dependency-filters" className="scroll-mt-24" />
    <AuthoringPanel title="Dependency Filters" help="Focus on one node, search by label or field path, or switch lenses to isolate prerequisites, unlocks, flag links, branches, explicit links, or inferred links."><div className="grid gap-3 lg:grid-cols-2"><label className="block text-xs font-semibold uppercase text-slate-500">Focus Node<select className={`${inputClass} mt-1`} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="">All nodes</option>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)}>{text(node.kind)}: {text(node.label)}</option>)}</select></label><label className="block text-xs font-semibold uppercase text-slate-500">Search Relationships<input className={`${inputClass} mt-1`} value={search} placeholder="Search node, relation, or field..." onChange={(event) => setSearch(event.target.value)} /></label></div><div className="mt-3 flex flex-wrap gap-2">{dependencyLenses.map((value) => <button key={value} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${lens === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setLens(value)}>{dependencyLensLabel(value)}</button>)}{(focus || search || lens !== "all") && <button type="button" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold" onClick={() => { setFocus(""); setSearch(""); setLens("all"); }}>Clear Filters</button>}</div></AuthoringPanel>
    <div id="dependency-graph" className="scroll-mt-24" />
    <DependencyGraphPanel visibleEdges={visibleEdges} nodeById={nodeById} issueNodeIds={issueNodeIds} onFocus={setFocus} />
    <div id="dependency-walkthrough" className="scroll-mt-24" />
    <DependencyWalkthroughPanel model={walkthrough} initialFlags={initialFlags} triggerIds={triggerIds} activeIndex={activeWalkthroughIndex} onInitialFlagsChange={setInitialFlags} onTriggerIdsChange={setTriggerIds} onActiveIndexChange={setActiveWalkthroughIndex} onFocus={setFocus} />
    <div id="dependency-health" className="grid scroll-mt-24 gap-4 xl:grid-cols-[380px_1fr]">
      <AuthoringPanel title="Actionable Health" subtitle="Select an issue to focus its relationships, then open the affected record." help="Use these issue groups to find dependency records that block reachable content or create contradictory state.">{issueNodeIds.size === 0 && <StatusNotice tone="success">No dependency health issues detected.</StatusNotice>}<div className="mt-3 space-y-4"><HealthIssueGroup title="Impossible Gates" description="A requirement depends on a flag that nothing currently sets." severity="error" nodes={rows(health.impossible_gates)} onFocus={setFocus} /><HealthIssueGroup title="Dead Flags" description="These flags are consumed but have no producer." severity="error" nodes={rows(health.dead_flags)} onFocus={setFocus} /><HealthIssueGroup title="Contradictions" description="A requirement both requires and forbids the same flag." severity="error" nodes={rows(health.contradictions)} onFocus={setFocus} /><CycleIssueGroup cycles={Array.isArray(health.cycles) ? health.cycles : []} nodeById={nodeById} onFocus={setFocus} /><HealthIssueGroup title="Unused Flags" description="These flags are produced but never consumed." severity="warning" nodes={rows(health.unused_flags)} onFocus={setFocus} /><BrokenEdgeGroup edges={brokenEdges} nodeById={nodeById} onFocus={setFocus} /></div></AuthoringPanel>
      <AuthoringPanel title="Relationships" subtitle={`${visibleEdges.length} shown. Click either endpoint to focus it.`} help="This list shows the exact relationship records behind the graph, including inferred edges and broken endpoints." actions={focus && <NodeLink node={nodeById.get(focus)} compact />}><div className="space-y-2">{visibleEdges.map((edge) => <DependencyEdgeCard key={text(edge.id)} edge={edge} source={nodeById.get(text(edge.source))} target={nodeById.get(text(edge.target))} issueNodeIds={issueNodeIds} onFocus={setFocus} />)}{visibleEdges.length === 0 && <EmptyState title="No relationships match">Clear the focus, search, or lens filters to show relationship records again.</EmptyState>}</div></AuthoringPanel>
    </div>
      </main>
    </div>
  </AuthoringPageShell>;
}

type DependencyLens = "all" | "prerequisites" | "unlocks" | "flags" | "branches" | "explicit" | "inferred";
const dependencyLenses: DependencyLens[] = ["all", "prerequisites", "unlocks", "flags", "branches", "explicit", "inferred"];

function dependencyLensLabel(lens: DependencyLens): string {
  return lens[0].toUpperCase() + lens.slice(1);
}

function dependencyLensMatches(edge: EntryRecord, lens: DependencyLens): boolean {
  const relation = text(edge.relation);
  if (lens === "all") return true;
  if (lens === "prerequisites") return ["required_by", "forbidden_by", "gates"].includes(relation);
  if (lens === "unlocks") return relation === "unlocks";
  if (lens === "flags") return ["sets", "required_by", "forbidden_by"].includes(relation);
  if (lens === "branches") return ["branches_to", "next", "contains"].includes(relation);
  if (lens === "explicit") return Boolean(edge.explicit);
  return !edge.explicit;
}

function nodePath(node: EntryRecord | undefined): string {
  if (!node) return "";
  const schema = text(node.schema_name);
  const id = encodeURIComponent(text(node.entry_id));
  if (schema === "quests") return `/author/quests/${id}`;
  if (schema === "encounters") return `/author/encounters/${id}`;
  if (schema === "dialogues") return `/author/dialogues/${id}`;
  if (schema === "abilities") return `/author/abilities/${id}`;
  if (schema === "characters") return `/author/characters/${id}`;
  if (schema === "locations") return `/author/locations/${id}`;
  const routeBySchema: Record<string, string> = { flags: "flags", requirements: "requirements", events: "events", interaction_profiles: "interaction-profiles", dialogue_nodes: "dialogue-nodes", story_arcs: "story-arcs" };
  const route = routeBySchema[schema] || schema.replace(/_/g, "-");
  return route ? `/${route}?selected=${id}` : "";
}

function NodeLink({ node, compact = false }: { node: EntryRecord | undefined; compact?: boolean }) {
  if (!node) return <span className="text-red-600">Missing node</span>;
  const className = compact ? "max-w-52 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 dark:border-blue-900 dark:text-blue-300" : "block min-w-0 rounded-md border border-slate-200 bg-white p-2 text-left text-xs text-blue-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300";
  return <Link className={className} to={nodePath(node)}><span className="block text-[10px] font-semibold uppercase text-slate-500">{text(node.kind)}</span><span className="block truncate font-semibold">{text(node.label) || text(node.entry_id)}</span></Link>;
}

function DependencyEdgeCard({ edge, source, target, issueNodeIds, onFocus }: { edge: EntryRecord; source: EntryRecord | undefined; target: EntryRecord | undefined; issueNodeIds: Set<string>; onFocus: (id: string) => void }) {
  const sourceId = text(edge.source);
  const targetId = text(edge.target);
  const issue = issueNodeIds.has(sourceId) || issueNodeIds.has(targetId);
  return <article className={`grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_150px_1fr] ${edge.explicit ? "border-solid" : "border-dashed"} ${issue ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-800"}`}><div className="min-w-0"><NodeLink node={source} /><button type="button" className="mt-1 text-[10px] text-slate-500" onClick={() => onFocus(sourceId)}>Focus source</button></div><div className="self-center text-center"><div className="text-xs font-semibold">{text(edge.relation)}</div><div className="truncate text-[10px] text-slate-500">{edge.explicit ? "Stored" : "Inferred"}{text(edge.path) ? ` / ${text(edge.path)}` : ""}</div></div><div className="min-w-0"><NodeLink node={target} /><button type="button" className="mt-1 text-[10px] text-slate-500" onClick={() => onFocus(targetId)}>Focus target</button></div></article>;
}

function HealthIssueGroup({ title, description, severity, nodes, onFocus }: { title: string; description: string; severity: "error" | "warning"; nodes: EntryRecord[]; onFocus: (id: string) => void }) {
  if (!nodes.length) return null;
  const classes = severity === "error" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30";
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{nodes.length}</span></div><p className="mb-2 text-xs text-slate-500">{description}</p><div className="space-y-1">{nodes.map((node) => <div key={text(node.id)} className={`flex items-center justify-between gap-2 rounded border p-2 ${classes}`}><button type="button" className="min-w-0 flex-1 text-left text-xs font-semibold" onClick={() => onFocus(text(node.id))}>{text(node.label) || text(node.entry_id)}</button><NodeLink node={node} compact /></div>)}</div></div>;
}

function CycleIssueGroup({ cycles, nodeById, onFocus }: { cycles: unknown[]; nodeById: Map<string, EntryRecord>; onFocus: (id: string) => void }) {
  const valid = cycles.filter((cycle): cycle is unknown[] => Array.isArray(cycle));
  if (!valid.length) return null;
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">Cycles</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{valid.length}</span></div><p className="mb-2 text-xs text-slate-500">Event chains or quest branches loop back into themselves.</p><div className="space-y-1">{valid.map((cycle, index) => <button key={index} type="button" className="block w-full rounded border border-red-200 bg-red-50 p-2 text-left text-xs dark:border-red-900 dark:bg-red-950/30" onClick={() => onFocus(text(cycle[0]))}>{cycle.map((id) => text(nodeById.get(text(id))?.label) || text(id)).join(" -> ")}</button>)}</div></div>;
}

function BrokenEdgeGroup({ edges, nodeById, onFocus }: { edges: EntryRecord[]; nodeById: Map<string, EntryRecord>; onFocus: (id: string) => void }) {
  if (!edges.length) return null;
  return <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold">Broken References</h3><span className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-slate-900">{edges.length}</span></div><p className="mb-2 text-xs text-slate-500">A relationship endpoint does not exist in the dependency index.</p><div className="space-y-1">{edges.map((edge) => { const focusId = nodeById.has(text(edge.source)) ? text(edge.source) : text(edge.target); return <button key={text(edge.id)} type="button" className="block w-full rounded border border-red-200 bg-red-50 p-2 text-left text-xs dark:border-red-900 dark:bg-red-950/30" onClick={() => onFocus(focusId)}>{text(edge.source)} -&gt; {text(edge.relation)} -&gt; {text(edge.target)}</button>; })}</div></div>;
}
