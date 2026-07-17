import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position as FlowPosition,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./DialogueFlowPage.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EditableTagList, ReferenceChipPicker, displayText, isRecord } from "../authoringViews/controls";
import BundleReview, { type BundleReviewResult } from "../components/authoring/BundleReview";
import ConsequenceComposer from "../components/authoring/ConsequenceComposer";
import ThenComposer from "../components/authoring/ThenComposer";
import ScopedGateSection from "../components/authoring/ScopedGateSection";
import { AuthoringHealthSummary, AuthoringPageShell, AuthoringPanel, EmptyState, StatusNotice } from "../components/authoringUi";
import StoryPlacementPanel from "../components/storyPlacement/StoryPlacementPanel";
import { useDirtyState } from "../components/useDirtyState";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { BUTTON_CLASSES, BUTTON_SIZES } from "../styles/uiTokens";
import type { EntryRecord } from "../types/editorQol";
import { generateSlug, generateUlid } from "../utils/generateId";
import DialogueScriptView from "../dialogues/script/DialogueScriptView";
import DialogueImportDialog from "../dialogues/dlg/DialogueImportDialog";
import { readSnapshots, saveSnapshot, type LocalSnapshot } from "../dialogues/history";

type CenterView = "script" | "flow" | "rehearsal" | "impact";
type Lens = "choices" | "consequences" | "locks" | "speakers" | "reachability" | "world";
type InspectorTab = "edit" | "beat" | "health" | "context";
type Point = { x: number; y: number };
type ChoiceSelection = { nodeId: string; index: number } | null;

const CHOICE_ACTION_OPTIONS = [
  { value: "open_shop", label: "Open shop now", targetType: "shop", continuation: "resume_source_dialogue" },
  { value: "start_encounter", label: "Start encounter", targetType: "encounter", continuation: "end_source_dialogue" },
  { value: "join_companion", label: "Companion joins", targetType: "character", continuation: "advance_to_next_node" },
  { value: "discover_quest", label: "Discover quest", targetType: "quest", continuation: "advance_to_next_node" },
  { value: "assign_quest", label: "Assign quest", targetType: "quest", continuation: "advance_to_next_node" },
  { value: "reveal_map_marker", label: "Reveal map marker", targetType: "location_poi", continuation: "advance_to_next_node" },
] as const;

interface CoverageGroup { matched: EntryRecord[]; missing: string[] }
interface BeatCoverage {
  required: CoverageGroup;
  forbidden: CoverageGroup;
  outputs: CoverageGroup;
  implementation_paths: Record<string, string[]>;
  warnings: string[];
}
interface DialoguePacket {
  dialogue: EntryRecord;
  nodes: EntryRecord[];
  story_beats: EntryRecord[];
  beat_coverage: Record<string, BeatCoverage>;
  requirements: EntryRecord[];
  flags: EntryRecord[];
  factions: EntryRecord[];
  characters: EntryRecord[];
  context: {
    interaction_profiles: EntryRecord[];
    events: EntryRecord[];
    pois: EntryRecord[];
    character: EntryRecord | null;
    location: EntryRecord | null;
    participants: EntryRecord[];
    story_profiles: EntryRecord[];
    relationships: EntryRecord[];
    participant_next_sort_order: Record<string, number>;
  };
  world_echo: { dialogue_id: string; produced_flags: EntryRecord[]; consumers: EntryRecord[] };
}
interface Health {
  blockers: string[];
  warnings: string[];
  roots: string[];
  unreachable: Set<string>;
  cycles: Set<string>;
}
interface CardData extends Record<string, unknown> {
  entry: EntryRecord;
  speaker: string;
  selectedChoice: ChoiceSelection;
  lens: Lens;
  health: Health;
  grouped: boolean;
  queued: boolean;
  isStart: boolean;
  speakerHue: number;
  onSelect: () => void;
  onText: (value: string) => void;
  onAdd: (automatic: boolean) => void;
  onStart: () => void;
  onTerminal: () => void;
}

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const active = `${BUTTON_CLASSES.primary} ${BUTTON_SIZES.sm}`;
const inactive = `${BUTTON_CLASSES.outline} ${BUTTON_SIZES.sm}`;
const EMPTY_CONTEXT = {
  interaction_profiles: [], events: [], pois: [], character: null, location: null, participants: [],
  story_profiles: [], relationships: [], participant_next_sort_order: {},
};
const EMPTY_ECHO = { dialogue_id: "", produced_flags: [], consumers: [] };
const NEW_DRAFT_POINTER = "soa.draft.dialogue_flow.new";
const BEAT_TYPES = ["Entrance", "Decision", "Revelation", "Conflict", "Change", "Reaction", "Exit", "Other"];

const rows = (value: unknown): EntryRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const text = (value: unknown, fallback = "") => displayText(value, fallback);
const stable = (value: unknown) => JSON.stringify(value ?? null);
const label = (entry: EntryRecord | null | undefined, fallback = "Untitled") => entry ? text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback)))) : fallback;
const layoutKey = (id: string) => `soa.dialogue-flow.layout.${id}`;
const draftKey = (id: string) => `soa.draft.dialogue_flow.${id}`;
const groupKey = (id: string) => `soa.dialogue-flow.beat-groups.${id}`;
const uiKey = (id: string) => `soa.dialogue-flow.ui.${id}`;

function readRecord(key: string): Record<string, Point> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return isRecord(value) ? value as Record<string, Point> : {};
  } catch { return {}; }
}

function readGroups(id: string): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(groupKey(id)) || "{}");
    return isRecord(value) ? Object.fromEntries(Object.entries(value).map(([key, row]) => [key, String(row)])) : {};
  } catch { return {}; }
}

function emptyDialogue(): EntryRecord {
  const id = generateUlid();
  return { id, slug: `new-dialogue-${id.slice(-6).toLowerCase()}`, title: "New Dialogue", description: "", tags: [], starting_node_id: null };
}

function emptyNode(dialogueId: string, index: number, speaker = "NPC"): EntryRecord {
  const id = generateUlid();
  return {
    id, slug: generateSlug(`new-line-${index}-${id.slice(-5)}`), dialogue_id: dialogueId, speaker,
    text: "", choices: [], set_flags: [], tags: [], is_terminal: true, __new: true,
  };
}

function normalizedChoice(choice: EntryRecord, nodeId: string, index: number): EntryRecord {
  return {
    ...choice,
    choice_id: text(choice.choice_id, `legacy-choice-${nodeId}-${index + 1}`),
    actions: rows(choice.actions),
    set_flags: strings(choice.set_flags),
  };
}

function newChoice(choiceText: string, nextNodeId: string): EntryRecord {
  return { choice_id: generateUlid(), choice_text: choiceText, next_node_id: nextNodeId, actions: [], set_flags: [] };
}

function newChoiceAction(actionType: string, sortOrder: number): EntryRecord {
  const option = CHOICE_ACTION_OPTIONS.find((entry) => entry.value === actionType) || CHOICE_ACTION_OPTIONS[0];
  return {
    action_id: generateUlid(), action_type: option.value, target_ref_type: option.targetType, target_ref_id: "",
    timing: "immediate", repeat_policy: "inherit_owner", continuation_policy: option.continuation,
    sort_order: sortOrder, runtime_support: "runtime_unverified",
  };
}

function normalizePacket(value: EntryRecord, fallback: DialoguePacket): DialoguePacket {
  const context = isRecord(value.context) ? value.context : {};
  const echo = isRecord(value.world_echo) ? value.world_echo : {};
  return {
    ...fallback,
    ...value,
    dialogue: isRecord(value.dialogue) ? value.dialogue : fallback.dialogue,
    nodes: rows(value.nodes).map((node) => ({
      ...node,
      choices: rows(node.choices).map((choice, index) => normalizedChoice(choice, text(node.id), index)),
    })),
    story_beats: rows(value.story_beats),
    beat_coverage: isRecord(value.beat_coverage) ? value.beat_coverage as Record<string, BeatCoverage> : {},
    requirements: rows(value.requirements),
    flags: rows(value.flags),
    factions: rows(value.factions),
    characters: rows(value.characters),
    context: {
      ...EMPTY_CONTEXT, ...context,
      interaction_profiles: rows(context.interaction_profiles), events: rows(context.events), pois: rows(context.pois),
      participants: rows(context.participants), story_profiles: rows(context.story_profiles), relationships: rows(context.relationships),
      character: isRecord(context.character) ? context.character : null, location: isRecord(context.location) ? context.location : null,
      participant_next_sort_order: isRecord(context.participant_next_sort_order) ? context.participant_next_sort_order as Record<string, number> : {},
    },
    world_echo: {
      ...EMPTY_ECHO, ...echo, produced_flags: rows(echo.produced_flags), consumers: rows(echo.consumers),
    },
  };
}

function speakerLabel(node: EntryRecord, characters: EntryRecord[]) {
  const character = characters.find((entry) => text(entry.id) === text(node.speaker_character_id));
  return character ? label(character, text(node.speaker, "No speaker")) : text(node.speaker, "No speaker");
}

function sceneParticipants(packet: DialoguePacket): EntryRecord[] {
  const ids = new Set([
    text(packet.dialogue.character_id),
    ...packet.nodes.map((node) => text(node.speaker_character_id)),
    ...packet.context.participants.map((participant) => text(participant.id)),
  ].filter(Boolean));
  const participants = new Map<string, EntryRecord>();
  packet.context.participants.forEach((entry) => participants.set(text(entry.id), entry));
  packet.characters.filter((entry) => ids.has(text(entry.id))).forEach((entry) => participants.set(text(entry.id), entry));
  return [...participants.values()].filter((entry) => ids.has(text(entry.id)));
}

function autoLayout(nodes: EntryRecord[]): Record<string, Point> {
  const inbound = new Map(nodes.map((node) => [text(node.id), 0]));
  nodes.forEach((node) => rows(node.choices).forEach((choice) => {
    const target = text(choice.next_node_id);
    if (inbound.has(target)) inbound.set(target, (inbound.get(target) || 0) + 1);
  }));
  const depth = new Map<string, number>();
  const queue = nodes.filter((node) => inbound.get(text(node.id)) === 0).map((node) => ({ id: text(node.id), depth: 0 }));
  while (queue.length) {
    const item = queue.shift()!;
    if (depth.has(item.id)) continue;
    depth.set(item.id, item.depth);
    const node = nodes.find((row) => text(row.id) === item.id);
    rows(node?.choices).forEach((choice) => queue.push({ id: text(choice.next_node_id), depth: item.depth + 1 }));
  }
  nodes.forEach((node) => { if (!depth.has(text(node.id))) depth.set(text(node.id), Math.max(0, ...depth.values()) + 1); });
  const lanes = new Map<number, string[]>();
  depth.forEach((value, id) => lanes.set(value, [...(lanes.get(value) || []), id]));
  const positions: Record<string, Point> = {};
  lanes.forEach((ids, column) => ids.forEach((id, index) => { positions[id] = { x: 50 + column * 330, y: 70 + index * 250 }; }));
  return positions;
}

function analyze(nodes: EntryRecord[], packet: DialoguePacket, groups: Record<string, string>): Health {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(nodes.map((node) => text(node.id)).filter(Boolean));
  const inbound = new Map([...ids].map((id) => [id, 0]));
  const adjacency = new Map([...ids].map((id) => [id, [] as string[]]));
  nodes.forEach((node) => {
    const nodeId = text(node.id);
    if (!nodeId || !text(node.slug) || !text(node.speaker) || !text(node.text)) blockers.push(`${label(node)} is missing id, slug, speaker, or text.`);
    const consequences = new Set<string>();
    rows(node.choices).forEach((choice, index) => {
      const target = text(choice.next_node_id);
      if (!target || !ids.has(target)) blockers.push(`${label(node)} choice ${index + 1} targets a missing node.`);
      else { inbound.set(target, (inbound.get(target) || 0) + 1); adjacency.get(nodeId)?.push(target); }
      const signature = `${target}|${text(choice.requirements_id)}|${strings(choice.set_flags).sort().join(",")}`;
      if (consequences.has(signature)) warnings.push(`${label(node)} has choices with identical consequences.`);
      consequences.add(signature);
    });
    if (rows(node.choices).length === 0 && !node.is_terminal) blockers.push(`${label(node)} has no outgoing connection and is not marked as an ending.`);
    if (rows(node.choices).length > 0 && node.is_terminal) blockers.push(`${label(node)} is marked as an ending but has outgoing connections.`);
  });
  const roots = [...inbound.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  const canonicalStart = text(packet.dialogue.starting_node_id);
  if (nodes.length && !canonicalStart) blockers.push("Choose a canonical starting line.");
  if (canonicalStart && !ids.has(canonicalStart)) blockers.push("The canonical starting line is missing from this dialogue.");
  if (nodes.length && roots.length !== 1) warnings.push(roots.length ? "Multiple root lines exist; the canonical start controls rehearsal." : "The graph has no root line and may be fully cyclic.");
  const reachable = new Set<string>();
  const queue = canonicalStart && ids.has(canonicalStart) ? [canonicalStart] : roots.length === 1 ? [...roots] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    adjacency.get(id)?.forEach((target) => queue.push(target));
  }
  const unreachable = new Set([...ids].filter((id) => !reachable.has(id)));
  if (unreachable.size) warnings.push(`${unreachable.size} node(s) are unreachable from the canonical start.`);
  const cycles = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { cycles.add(id); return; }
    if (visited.has(id)) return;
    visiting.add(id); adjacency.get(id)?.forEach(visit); visiting.delete(id); visited.add(id);
  };
  ids.forEach(visit);
  if (cycles.size) warnings.push("The dialogue contains one or more loops.");
  const participants = new Set(sceneParticipants(packet).map((entry) => text(entry.id)));
  packet.story_beats.forEach((beat) => {
    if (!participants.has(text(beat.character_id))) warnings.push(`Story beat '${label(beat)}' is owned by a former participant.`);
    const groupedNodes = nodes.filter((node) => groups[text(node.id)] === text(beat.id));
    if (groupedNodes.length) {
      const outputs = new Set(groupedNodes.flatMap((node) => [...strings(node.set_flags), ...rows(node.choices).flatMap((choice) => strings(choice.set_flags))]));
      strings(beat.expected_output_flags).filter((flag) => !outputs.has(flag)).forEach((flag) => warnings.push(`Grouped nodes for '${label(beat)}' do not produce expected flag '${flag}'.`));
    } else {
      (packet.beat_coverage[text(beat.id)]?.warnings || []).forEach((warning) => warnings.push(warning));
    }
  });
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], roots, unreachable, cycles };
}

function requirementState(requirementId: unknown, requirements: EntryRecord[], flags: Set<string>, reputation: Record<string, number>) {
  const id = text(requirementId);
  if (!id) return { available: true, reason: "" };
  const requirement = requirements.find((entry) => text(entry.id) === id);
  if (!requirement) return { available: false, reason: `Missing requirement ${id}` };
  const missing = strings(requirement.required_flags).filter((flag) => !flags.has(flag));
  const forbidden = strings(requirement.forbidden_flags).filter((flag) => flags.has(flag));
  const reps = rows(requirement.min_faction_reputation).filter((row) => Number(reputation[text(row.faction_id)] || 0) < Number(row.min_value ?? row.min ?? 0));
  const reasons = [
    missing.length ? `Missing flags: ${missing.join(", ")}` : "",
    forbidden.length ? `Forbidden flags set: ${forbidden.join(", ")}` : "",
    reps.length ? `Low reputation: ${reps.map((row) => text(row.faction_id)).join(", ")}` : "",
  ].filter(Boolean);
  return { available: reasons.length === 0, reason: reasons.join(". ") };
}

function DialogueCard({ data, selected }: NodeProps<Node<CardData>>) {
  const node = data.entry;
  const id = text(node.id);
  const consequential = strings(node.set_flags).length > 0 || rows(node.choices).some((choice) => strings(choice.set_flags).length > 0);
  const locked = Boolean(text(node.requirements_id));
  const issue = data.lens === "reachability" && data.health.unreachable.has(id);
  const tone = data.queued ? "border-red-500 bg-red-50 opacity-60 dark:bg-red-950"
    : selected ? "border-blue-600 ring-2 ring-blue-300"
      : issue ? "border-red-500 bg-red-50 dark:bg-red-950"
        : data.grouped ? "border-violet-500 bg-violet-50 dark:bg-violet-950"
          : locked && data.lens === "locks" ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
            : consequential && (data.lens === "consequences" || data.lens === "world") ? "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950"
              : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900";
  return <div data-testid={`dialogue-node-${id}`} className={`w-[275px] rounded-lg border p-3 shadow-md ${tone}`} style={data.lens === "speakers" ? { borderLeftColor: `hsl(${data.speakerHue} 70% 50%)`, borderLeftWidth: 7 } : undefined} onClick={data.onSelect}>
    <Handle type="target" position={FlowPosition.Left} />
    <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>{data.speaker}</span><span>{data.isStart ? "Start" : node.is_terminal ? "Ending" : ""}</span></div>
    <textarea
      aria-label={`Dialogue text ${id}`}
      className="nodrag mt-1 min-h-20 w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm focus:border-blue-400 focus:outline-none"
      value={text(node.text)}
      placeholder="Write the line..."
      onClick={(event) => { data.onSelect(); event.stopPropagation(); }}
      onFocus={data.onSelect}
      onChange={(event) => data.onText(event.target.value)}
    />
    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
      <span>{rows(node.choices).length} choices</span>{locked && <span>Locked</span>}{strings(node.set_flags).length > 0 && <span>{strings(node.set_flags).length} flags</span>}
    </div>
    <div className="nodrag mt-2 flex gap-1">
      <button aria-label={`Add choice after ${data.speaker}`} className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={(event) => { event.stopPropagation(); data.onAdd(false); }}>+ Choice</button>
      <button aria-label={`Add continuation after ${data.speaker}`} className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={(event) => { event.stopPropagation(); data.onAdd(true); }}>+ Continue</button>
      <button aria-label="Set as dialogue start" title="Set as start" className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={(event) => { event.stopPropagation(); data.onStart(); }}>Start</button>
      <button aria-label="Mark as dialogue ending" title="Mark as ending" disabled={rows(node.choices).length > 0} className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={(event) => { event.stopPropagation(); data.onTerminal(); }}>End</button>
    </div>
    <Handle type="source" position={FlowPosition.Right} />
  </div>;
}

const nodeTypes = { dialogueCard: DialogueCard };

export default function DialogueFlowPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const initialDialogue = useMemo(() => emptyDialogue(), []);
  const emptyPacket = useMemo<DialoguePacket>(() => ({
    dialogue: initialDialogue, nodes: [], story_beats: [], beat_coverage: {}, requirements: [], flags: [], factions: [],
    characters: [], context: EMPTY_CONTEXT, world_echo: EMPTY_ECHO,
  }), [initialDialogue]);
  const [dialogues, setDialogues] = useState<EntryRecord[]>([]);
  const [packet, setPacket] = useState<DialoguePacket>(emptyPacket);
  const [original, setOriginal] = useState<DialoguePacket | null>(null);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<ChoiceSelection>(null);
  const [selectedBeatId, setSelectedBeatId] = useState("");
  const [beatUnlinks, setBeatUnlinks] = useState<EntryRecord[]>([]);
  const [deletions, setDeletions] = useState<string[]>([]);
  const [view, setView] = useState<CenterView>(isNew ? "script" : "flow");
  const [lens, setLens] = useState<Lens>("choices");
  const [tab, setTab] = useState<InspectorTab>("edit");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<BundleReviewResult | null>(null);
  const [previewMutation, setPreviewMutation] = useState<EntryRecord | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [setupOpen, setSetupOpen] = useState(isNew);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [nodeQuery, setNodeQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<LocalSnapshot<DialoguePacket>[]>([]);
  const dirtySource = useRef(`dialogue-flow-${id || "index"}`);
  const undoStack = useRef<DialoguePacket[]>([]);
  const redoStack = useRef<DialoguePacket[]>([]);
  const mutationGroup = useRef({ name: "", at: 0 });
  const { setDirty } = useDirtyState();

  const currentId = text(packet.dialogue.id);
  const activeNodes = useMemo(() => packet.nodes.filter((node) => !deletions.includes(text(node.id))), [deletions, packet.nodes]);
  const selectedNode = packet.nodes.find((node) => text(node.id) === selectedNodeId);
  const selectedCharacter = packet.characters.find((entry) => text(entry.id) === text(selectedNode?.speaker_character_id));
  const selectedVoice = packet.context.story_profiles.find((entry) => text(entry.character_id) === text(selectedNode?.speaker_character_id));
  const selectedRelationship = packet.context.relationships.find((entry) => [text(entry.from_character_id), text(entry.to_character_id)].includes(text(selectedNode?.speaker_character_id)));
  const selectedConsequenceNode = selectedNode || (selectedChoice ? packet.nodes.find((node) => text(node.id) === selectedChoice.nodeId) : undefined);
  const originalConsequenceNode = original?.nodes.find((node) => text(node.id) === text(selectedConsequenceNode?.id));
  const selectedChoiceRow = selectedChoice ? rows(packet.nodes.find((node) => text(node.id) === selectedChoice.nodeId)?.choices)[selectedChoice.index] : undefined;
  const selectedBeat = packet.story_beats.find((beat) => text(beat.id) === selectedBeatId);
  const health = useMemo(() => analyze(activeNodes, packet, groups), [activeNodes, groups, packet]);
  const dirty = Boolean(original) && stable({ dialogue: packet.dialogue, nodes: packet.nodes, story_beats: packet.story_beats, deletions, beatUnlinks }) !== stable({ dialogue: original?.dialogue, nodes: original?.nodes, story_beats: original?.story_beats, deletions: [], beatUnlinks: [] });
  const saveBlocked = health.blockers.length > 0 || !text(packet.dialogue.title) || !text(packet.dialogue.slug);

  useEffect(() => { const source = dirtySource.current; setDirty(source, dirty); return () => setDirty(source, false); }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(""); setNotice(""); setDeletions([]); setBeatUnlinks([]); setReview(null);
    Promise.all([
      apiFetch("/api/dialogues").then((response) => response.json()),
      isNew ? Promise.resolve(null) : apiFetch(`/api/ui/dialogues/${encodeURIComponent(id)}`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(formatApiError(body, "Dialogue failed to load."));
        return body;
      }),
      apiFetch("/api/requirements").then((response) => response.json()),
      apiFetch("/api/flags").then((response) => response.json()),
      apiFetch("/api/factions").then((response) => response.json()),
      apiFetch("/api/characters").then((response) => response.json()),
    ]).then(([allDialogues, loaded, requirements, flags, factions, characters]) => {
      if (cancelled) return;
      setDialogues(Array.isArray(allDialogues) ? allDialogues.filter(isRecord) : []);
      const fallback = { ...emptyPacket, requirements: rows(requirements), flags: rows(flags), factions: rows(factions), characters: rows(characters) };
      let base = loaded && isRecord(loaded) ? normalizePacket(loaded, fallback) : fallback;
      if (isNew) {
        const draftId = localStorage.getItem(NEW_DRAFT_POINTER);
        if (draftId) base = { ...base, dialogue: { ...base.dialogue, id: draftId } };
      }
      const storedDraft = localStorage.getItem(draftKey(text(base.dialogue.id)));
      let restored = base;
      if (storedDraft) {
        try {
          const parsed = JSON.parse(storedDraft);
          if (isRecord(parsed) && isRecord(parsed.dialogue) && Array.isArray(parsed.nodes)) {
            restored = { ...base, dialogue: parsed.dialogue, nodes: rows(parsed.nodes), story_beats: rows(parsed.story_beats) };
            setDeletions(strings(parsed.deletions)); setBeatUnlinks(rows(parsed.beatUnlinks));
            setNotice("Restored unsaved dialogue flow draft.");
          }
        } catch { /* ignore malformed local draft */ }
      }
      setPacket(restored); setOriginal(base);
      const storedPositions = readRecord(layoutKey(text(base.dialogue.id)));
      setPositions({ ...autoLayout(restored.nodes), ...storedPositions });
      setGroups(readGroups(text(base.dialogue.id)));
      setSnapshots(readSnapshots<DialoguePacket>(text(base.dialogue.id)));
      try {
        const ui = JSON.parse(localStorage.getItem(uiKey(text(base.dialogue.id))) || "{}");
        if (isRecord(ui)) { setSetupOpen(Boolean(ui.setupOpen)); setLibraryOpen(ui.libraryOpen !== false); setInspectorOpen(ui.inspectorOpen !== false); }
      } catch { /* use defaults */ }
      setSelectedNodeId(text(restored.nodes[0]?.id));
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "Dialogue Scene Room failed to load.";
      setLoadError(message);
      setNotice(message);
    })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [emptyPacket, id, isNew]);

  useEffect(() => {
    if (!original || !currentId || !dirty) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(draftKey(currentId), JSON.stringify({ dialogue: packet.dialogue, nodes: packet.nodes, story_beats: packet.story_beats, deletions, beatUnlinks, ts: Date.now() }));
      if (isNew) localStorage.setItem(NEW_DRAFT_POINTER, currentId);
      setLocalSavedAt(Date.now());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [beatUnlinks, currentId, deletions, dirty, isNew, original, packet.dialogue, packet.nodes, packet.story_beats]);

  useEffect(() => {
    if (!currentId) return;
    localStorage.setItem(uiKey(currentId), JSON.stringify({ setupOpen, libraryOpen, inspectorOpen }));
  }, [currentId, inspectorOpen, libraryOpen, setupOpen]);

  const mutatePacket = useCallback((updater: (current: DialoguePacket) => DialoguePacket, group = "mutation") => {
    setPacket((current) => {
      const now = Date.now();
      if (mutationGroup.current.name !== group || now - mutationGroup.current.at > 750) undoStack.current.push(current);
      mutationGroup.current = { name: group, at: now }; redoStack.current = [];
      return updater(current);
    });
  }, []);
  const undo = useCallback(() => setPacket((current) => {
    const previous = undoStack.current.pop(); if (!previous) return current;
    redoStack.current.push(current); mutationGroup.current = { name: "", at: 0 }; return previous;
  }), []);
  const redo = useCallback(() => setPacket((current) => {
    const next = redoStack.current.pop(); if (!next) return current;
    undoStack.current.push(current); mutationGroup.current = { name: "", at: 0 }; return next;
  }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const updateDialogue = (patch: EntryRecord) => mutatePacket((current) => ({ ...current, dialogue: { ...current.dialogue, ...patch } }), "dialogue");
  const syncCommittedGate = (requirements_id: string) => {
    setPacket((current) => ({ ...current, dialogue: { ...current.dialogue, requirements_id } }));
    setOriginal((current) => current ? { ...current, dialogue: { ...current.dialogue, requirements_id } } : current);
  };
  const updateNode = useCallback((nodeId: string, patch: EntryRecord) => mutatePacket((current) => ({ ...current, nodes: current.nodes.map((node) => text(node.id) === nodeId ? { ...node, ...patch } : node) }), `node:${nodeId}`), [mutatePacket]);
  const updateChoice = (nodeId: string, index: number, patch: EntryRecord) => {
    const node = packet.nodes.find((entry) => text(entry.id) === nodeId);
    updateNode(nodeId, { choices: rows(node?.choices).map((choice, choiceIndex) => choiceIndex === index ? { ...choice, ...patch } : choice) });
  };
  const addLinkedNode = useCallback((sourceId: string, automatic: boolean) => {
    const source = packet.nodes.find((node) => text(node.id) === sourceId);
    const sourceIndex = packet.nodes.findIndex((node) => text(node.id) === sourceId);
    const recentDistinct = [...packet.nodes.slice(0, Math.max(0, sourceIndex)).reverse(), ...packet.nodes.slice(sourceIndex + 1).reverse()].find((node) => text(node.speaker) && text(node.speaker) !== text(source?.speaker));
    const node = emptyNode(currentId, packet.nodes.length + 1, text(recentDistinct?.speaker, text(source?.speaker, "NPC")));
    node.speaker_character_id = recentDistinct?.speaker_character_id || source?.speaker_character_id || null;
    mutatePacket((current) => ({
      ...current,
      nodes: [...current.nodes.map((entry) => text(entry.id) === sourceId ? { ...entry, is_terminal: false, choices: [...rows(entry.choices), newChoice(automatic ? "" : "New response", text(node.id))] } : entry), node],
    }), `add:${sourceId}`);
    const sourcePosition = positions[sourceId] || { x: 50, y: 50 };
    setPositions((current) => ({ ...current, [text(node.id)]: { x: sourcePosition.x + 330, y: sourcePosition.y + rows(source?.choices).length * 190 } }));
    setSelectedNodeId(text(node.id)); setSelectedChoice(null);
    window.setTimeout(() => document.getElementById(`script-line-${text(node.id)}`)?.querySelector("textarea")?.focus(), 0);
  }, [currentId, mutatePacket, packet.nodes, positions]);
  const addChoiceNode = useCallback((sourceId: string, choiceLabel: string) => {
    const source = packet.nodes.find((node) => text(node.id) === sourceId);
    const node = emptyNode(currentId, packet.nodes.length + 1, text(packet.nodes.slice().reverse().find((entry) => text(entry.speaker) !== text(source?.speaker))?.speaker, text(source?.speaker, "NPC")));
    mutatePacket((current) => ({ ...current, nodes: [...current.nodes.map((entry) => text(entry.id) === sourceId ? { ...entry, is_terminal: false, choices: [...rows(entry.choices), newChoice(choiceLabel, text(node.id))] } : entry), node] }), `choice:${sourceId}`);
    setSelectedNodeId(text(node.id)); setSelectedChoice(null);
    window.setTimeout(() => document.getElementById(`script-line-${text(node.id)}`)?.querySelector("textarea")?.focus(), 0);
  }, [currentId, mutatePacket, packet.nodes]);
  const addFirstLine = useCallback(() => {
    const node = emptyNode(currentId, 1);
    mutatePacket((current) => ({ ...current, dialogue: { ...current.dialogue, starting_node_id: node.id }, nodes: [node] }), "first-line");
    setSelectedNodeId(text(node.id));
    window.setTimeout(() => document.getElementById(`script-line-${text(node.id)}`)?.querySelector("textarea")?.focus(), 0);
  }, [currentId, mutatePacket]);
  const moveLine = useCallback((nodeId: string, direction: -1 | 1) => mutatePacket((current) => {
    const nodes = [...current.nodes]; const from = nodes.findIndex((node) => text(node.id) === nodeId); const to = from + direction;
    if (from < 0 || to < 0 || to >= nodes.length) return current;
    [nodes[from], nodes[to]] = [nodes[to], nodes[from]]; return { ...current, nodes };
  }, `move:${nodeId}`), [mutatePacket]);
  const duplicateBranch = useCallback((sourceId: string, choiceIndex: number) => mutatePacket((current) => {
    const source = current.nodes.find((node) => text(node.id) === sourceId); const choice = rows(source?.choices)[choiceIndex]; const targetId = text(choice?.next_node_id);
    if (!source || !choice || !targetId) return current;
    const byId = new Map(current.nodes.map((node) => [text(node.id), node])); const branch = new Set<string>(); const queue = [targetId];
    while (queue.length && branch.size < 100) { const id = queue.shift()!; if (branch.has(id) || !byId.has(id)) continue; branch.add(id); rows(byId.get(id)?.choices).forEach((edge) => queue.push(text(edge.next_node_id))); }
    const mapped = Object.fromEntries([...branch].map((id) => [id, generateUlid()]));
    const copies = [...branch].map((id, index) => { const node = byId.get(id)!; return { ...node, id: mapped[id], slug: generateSlug(`${text(node.slug, "line")}-copy-${index + 1}-${mapped[id].slice(-4)}`), choices: rows(node.choices).map((edge) => ({ ...edge, choice_id: generateUlid(), actions: rows(edge.actions).map((action, actionIndex) => ({ ...action, action_id: generateUlid(), sort_order: actionIndex })), next_node_id: mapped[text(edge.next_node_id)] || edge.next_node_id })), __new: true }; });
    return { ...current, nodes: [...current.nodes.map((node) => text(node.id) === sourceId ? { ...node, choices: [...rows(node.choices), { ...choice, choice_id: generateUlid(), actions: rows(choice.actions).map((action, index) => ({ ...action, action_id: generateUlid(), sort_order: index })), choice_text: `Copy: ${text(choice.choice_text, "Continue")}`, next_node_id: mapped[targetId] }] } : node), ...copies] };
  }, `duplicate:${sourceId}:${choiceIndex}`), [mutatePacket]);
  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const source = packet.nodes.find((node) => text(node.id) === connection.source);
    updateNode(connection.source, { is_terminal: false, choices: [...rows(source?.choices), newChoice("New response", connection.target)] });
  }, [packet.nodes, updateNode]);

  const flowNodes = useMemo<Node<CardData>[]>(() => activeNodes.map((node) => ({
    id: text(node.id), type: "dialogueCard", position: positions[text(node.id)] || { x: 50, y: 50 },
    selected: selectedNodeId === text(node.id),
    data: {
      entry: node, speaker: speakerLabel(node, packet.characters), selectedChoice, lens, health,
      grouped: Boolean(selectedBeatId && groups[text(node.id)] === selectedBeatId), queued: deletions.includes(text(node.id)),
      isStart: text(packet.dialogue.starting_node_id) === text(node.id),
      speakerHue: [...speakerLabel(node, packet.characters)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360,
      onSelect: () => { setSelectedNodeId(text(node.id)); setSelectedChoice(null); setTab("edit"); },
      onText: (value: string) => updateNode(text(node.id), { text: value }),
      onAdd: (automatic: boolean) => addLinkedNode(text(node.id), automatic),
      onStart: () => mutatePacket((current) => ({ ...current, dialogue: { ...current.dialogue, starting_node_id: node.id } }), "dialogue-start"),
      onTerminal: () => updateNode(text(node.id), { is_terminal: true }),
    },
  })), [activeNodes, addLinkedNode, deletions, groups, health, lens, mutatePacket, packet.characters, packet.dialogue.starting_node_id, positions, selectedBeatId, selectedChoice, selectedNodeId, updateNode]);

  const flowEdges = useMemo<Edge[]>(() => activeNodes.flatMap((node) => rows(node.choices).map((choice, index) => {
    const selected = selectedChoice?.nodeId === text(node.id) && selectedChoice.index === index;
    const consequential = strings(choice.set_flags).length > 0;
    return {
      id: `${text(node.id)}:${index}`, source: text(node.id), target: text(choice.next_node_id), label: text(choice.choice_text, "Continue"),
      type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
      animated: selected,
      style: { strokeWidth: selected ? 4 : 2, stroke: text(choice.requirements_id) ? "#d97706" : consequential ? "#a21caf" : "#64748b" },
      labelStyle: { fontSize: 11, fontWeight: selected ? 700 : 500 },
    };
  })), [activeNodes, selectedChoice]);

  const cleanBeat = (beat: EntryRecord) => Object.fromEntries(Object.entries(beat).filter(([key]) => !key.startsWith("__") && key !== "expected_previous"));
  const mutation = (accepted: string[] = []) => {
    const originalBeats = new Map((original?.story_beats || []).map((beat) => [text(beat.id), beat]));
    const story_beats = packet.story_beats.filter((beat) => stable(cleanBeat(beat)) !== stable(cleanBeat(originalBeats.get(text(beat.id)) || {}))).map((beat) => {
      const previous = originalBeats.get(text(beat.id));
      return previous ? { ...cleanBeat(beat), expected_previous: previous } : cleanBeat(beat);
    });
    return {
      dialogue: packet.dialogue,
      nodes: packet.nodes.filter((node) => !deletions.includes(text(node.id))).map((node) => Object.fromEntries(Object.entries(node).filter(([key]) => !key.startsWith("__")))),
      story_beats,
      beat_unlinks: beatUnlinks,
      deletions: { nodes: deletions },
      accepted_warning_ids: accepted,
    };
  };

  const preview = async () => {
    const nextMutation = mutation();
    setSaving(true); setNotice(""); setReviewError("");
    try {
      const response = await apiFetch("/api/ui/dialogues/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextMutation) });
      const body = await response.json();
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Dialogue preview failed."));
      setReview(body as unknown as BundleReviewResult); setPreviewMutation(nextMutation);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Dialogue preview failed."); }
    finally { setSaving(false); }
  };

  const commit = async (acceptedWarningIds: string[]) => {
    if (!previewMutation) return;
    setSaving(true); setNotice(""); setReviewError("");
    try {
      const response = await apiFetch("/api/ui/dialogues/bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...previewMutation, accepted_warning_ids: acceptedWarningIds }) });
      const body = await response.json();
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Dialogue bundle failed to save."));
      const saved = normalizePacket(body, emptyPacket);
      setPacket(saved); setOriginal(saved); setDeletions([]); setBeatUnlinks([]); setReview(null); setPreviewMutation(null);
      localStorage.removeItem(draftKey(currentId)); localStorage.removeItem(NEW_DRAFT_POINTER);
      localStorage.setItem(layoutKey(currentId), JSON.stringify(positions)); localStorage.setItem(groupKey(currentId), JSON.stringify(groups));
      setNotice("Dialogue Scene bundle committed.");
      if (isNew) navigate(`/author/dialogues/${encodeURIComponent(text(saved.dialogue.id))}`, { replace: true });
    } catch (error) { setReviewError(error instanceof Error ? error.message : "Dialogue commit failed."); }
    finally { setSaving(false); }
  };

  const reset = () => {
    if (!original) return;
    setPacket(original); setDeletions([]); setBeatUnlinks([]); setSelectedChoice(null); setSelectedBeatId(""); setReview(null); setPreviewMutation(null); setReviewError("");
    localStorage.removeItem(draftKey(currentId)); if (isNew) localStorage.removeItem(NEW_DRAFT_POINTER);
    setNotice("Unsaved Dialogue Scene changes discarded.");
  };

  const applyRecipe = (recipe: string) => {
    if (packet.nodes.length > 0) { setNotice("Starter recipes can only be applied to an empty dialogue."); return; }
    const owner = packet.characters.find((entry) => text(entry.id) === text(packet.dialogue.character_id));
    const speaker = label(owner, "NPC");
    const make = (line: string, speakerText = speaker): EntryRecord => ({ ...emptyNode(currentId, 1, speakerText), text: line, speaker_character_id: owner?.id || null });
    let created: EntryRecord[] = [];
    if (recipe === "Greeting") {
      const a = make("Welcome. What can I do for you?"); const b = make("Tell me about this place."); const c = make("Safe travels.");
      a.choices = [newChoice("Ask about the area", text(b.id)), newChoice("Leave", text(c.id))]; b.choices = [newChoice("Thanks", text(c.id))]; created = [a, b, c];
    } else if (recipe === "Quest Briefing") {
      const a = make("I need your help."); const b = make("Will you take the task?"); const c = make("Then we have an agreement."); const d = make("I understand.");
      a.choices = [newChoice("What happened?", text(b.id))]; b.choices = [newChoice("Accept", text(c.id)), newChoice("Refuse", text(d.id))]; created = [a, b, c, d];
    } else if (recipe === "Negotiation") {
      const a = make("Give me one reason to agree."); const b = make("That is convincing."); const c = make("That changes nothing."); const d = make("We are done.");
      a.choices = [newChoice("Appeal", text(b.id)), newChoice("Offer proof", text(b.id)), newChoice("Threaten", text(c.id))]; c.choices = [newChoice("Leave", text(d.id))]; created = [a, b, c, d];
    } else {
      const a = make("It is over. Are you hurt?"); const b = make("Then let us decide what comes next."); const c = make("We should move.");
      a.choices = [newChoice("Discuss what happened", text(b.id)), newChoice("Move on", text(c.id))]; b.choices = [newChoice("Continue", text(c.id))]; created = [a, b, c];
    }
    created = created.map((node) => ({ ...node, is_terminal: rows(node.choices).length === 0 }));
    mutatePacket((current) => ({ ...current, dialogue: { ...current.dialogue, starting_node_id: created[0]?.id || null }, nodes: created }), "recipe");
    setPositions(autoLayout(created)); setSelectedNodeId(text(created[0]?.id)); setNotice(`${recipe} starter staged.`);
  };

  const createBeat = (characterId: string) => {
    if (!characterId) return;
    const character = packet.characters.find((entry) => text(entry.id) === characterId);
    const next = Number(packet.context.participant_next_sort_order[characterId] || 0) + packet.story_beats.filter((beat) => beat.__new && text(beat.character_id) === characterId).length;
    const beat: EntryRecord = {
      id: generateUlid(), character_id: characterId, dialogue_id: currentId, title: `${label(character)} Dialogue Beat`,
      beat_type: "Other", sort_order: next, summary: "", state_before: "", state_after: "", player_impact: "", world_impact: "",
      required_flags: [], forbidden_flags: [], expected_output_flags: [], relationship_changes: [], tags: [], __new: true,
    };
    mutatePacket((current) => ({ ...current, story_beats: [...current.story_beats, beat] }), "beat-create"); setSelectedBeatId(text(beat.id)); setTab("beat");
  };

  const updateBeat = (beatId: string, patch: EntryRecord) => mutatePacket((current) => ({ ...current, story_beats: current.story_beats.map((beat) => text(beat.id) === beatId ? { ...beat, ...patch } : beat) }), `beat:${beatId}`);
  const unlinkBeat = (beat: EntryRecord) => {
    if (!beat.__new) {
      const originalBeat = original?.story_beats.find((entry) => text(entry.id) === text(beat.id));
      if (originalBeat) setBeatUnlinks((current) => [...current, { id: beat.id, expected_previous: originalBeat }]);
    }
    setPacket((current) => ({ ...current, story_beats: current.story_beats.filter((entry) => text(entry.id) !== text(beat.id)) }));
    setGroups((current) => Object.fromEntries(Object.entries(current).filter(([, beatId]) => beatId !== text(beat.id))));
    setSelectedBeatId("");
  };

  if (loading) return <AuthoringPageShell><StatusNotice>Loading Dialogue Scene Room...</StatusNotice></AuthoringPageShell>;
  if (loadError) return <AuthoringPageShell><StatusNotice tone="error" action={<button type="button" className={inactive} onClick={() => window.location.reload()}>Try Again</button>}>{loadError} Refresh the workspace after the service is available.</StatusNotice></AuthoringPageShell>;

  return <AuthoringPageShell>
    <div className="space-y-4">
      <AuthoringPanel
        id="dialogue-header"
        title={label(packet.dialogue)}
        subtitle={`${activeNodes.length} lines / ${packet.story_beats.length} beats / ${health.blockers.length} blockers / ${health.warnings.length} warnings / ${dirty ? localSavedAt ? "Saved locally" : "Unsaved locally" : "Committed to project"}`}
        help="Use this workspace to write a dialogue graph, rehearse choices, connect story beats, and review the saved bundle. Editing here drafts dialogue lines and beat links until you preview and commit."
        actions={<div className="flex flex-wrap gap-2"><button className={inactive} onClick={undo} aria-label="Undo dialogue change">Undo</button><button className={inactive} onClick={redo} aria-label="Redo dialogue change">Redo</button><button className={inactive} onClick={() => setCommandOpen(true)}>Commands <kbd>Ctrl K</kbd></button><button className={inactive} onClick={() => setFocusMode((value) => !value)}>{focusMode ? "Exit focus" : "Focus mode"}</button><button className={inactive} onClick={() => setSetupOpen((value) => !value)}>Scene setup</button><button className={inactive} onClick={() => setImportOpen(true)} disabled={activeNodes.length > 0} title={activeNodes.length ? "V1 import is limited to empty dialogues." : "Import DLG/1"}>Import DLG/1</button><Link className={inactive} to="/dialogues">Generic Editor</Link><button className={inactive} disabled={!dirty || saving} onClick={reset}>Reset Draft</button><button className={active} disabled={saving || saveBlocked || !dirty} onClick={() => void preview()}>{saving ? "Reviewing..." : "Review Dialogue Bundle"}</button></div>}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-semibold uppercase text-violet-600">Dialogue Scene Room</div><h1 className="sr-only">{label(packet.dialogue)}</h1><AuthoringHealthSummary blockers={health.blockers.length} warnings={health.warnings.length} dirty={dirty} saving={saving} /></div>
        </div>
        {notice && <Notice>{notice}</Notice>}
        {deletions.length > 0 && <div className="mt-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950"><span>{deletions.length} line(s) queued for deletion.</span><button className={inactive} onClick={() => setDeletions([])}>Undo Line Deletions</button></div>}
      </AuthoringPanel>

      <main className="space-y-4">
          {setupOpen && !focusMode && <div className="space-y-4"><div id="dialogue-brief" className="scroll-mt-24"><SceneBrief packet={packet} onChange={updateDialogue} onRecipe={applyRecipe} /></div>
          <div id="dialogue-beats" className="scroll-mt-24"><BeatTrack packet={packet} selectedBeatId={selectedBeatId} setSelectedBeatId={(beatId) => { setSelectedBeatId(beatId); setTab("beat"); }} onCreate={createBeat} /></div>
          {!isNew && currentId && <StoryPlacementPanel entityKind="dialogue" entityId={currentId} entityLabel={label(packet.dialogue)} entity={{ ...packet.dialogue, nodes: packet.nodes }} enableCrossEntityConsequenceActions />}
          {!isNew && currentId && <ScopedGateSection targetSchema="dialogues" targetId={currentId} targetLabel={label(packet.dialogue)} requirementId={text(packet.dialogue.requirements_id)} title="Dialogue Access Gate" subtitle="Create or reuse the player-state requirement that makes this scene available." tag="dialogue-gate" onRequirementCommitted={syncCommittedGate} />}</div>}

      <div id="dialogue-workbench" className={`grid scroll-mt-24 gap-4 ${!focusMode && libraryOpen && inspectorOpen ? "xl:grid-cols-[minmax(210px,280px)_minmax(0,1fr)_minmax(300px,390px)]" : !focusMode && (libraryOpen || inspectorOpen) ? "xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]" : "grid-cols-1"}`}>
        {!focusMode && libraryOpen && <Panel
          id="dialogue-library"
          title="Dialogue Library"
          subtitle="Switch scenes without leaving the dialogue authoring workspace."
          help="Use this to move between saved dialogues. Dirty-state protection still applies through the app shell, so review or reset drafts before switching when needed."
        >
          <div className="mb-3 flex gap-2"><Link className={`${active} flex-1 text-center`} to="/author/dialogues/new">New Dialogue</Link><button className={inactive} onClick={() => setLibraryOpen(false)} aria-label="Close dialogue library">Hide</button></div>
          <input aria-label="Search dialogue library" className={`${inputClass} mb-3`} placeholder="Search title, slug, tags…" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} />
          <div className="max-h-[700px] space-y-1 overflow-y-auto">{dialogues.filter((dialogue) => stable([dialogue.title, dialogue.slug, dialogue.tags, dialogue.character_id, dialogue.location_id]).toLowerCase().includes(libraryQuery.toLowerCase())).map((dialogue) => <Link key={text(dialogue.id)} to={`/author/dialogues/${encodeURIComponent(text(dialogue.id))}`} className={`block rounded border px-3 py-2 text-sm ${text(dialogue.id) === currentId ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-800"}`}>{label(dialogue)}<span className="block truncate text-[10px] text-slate-500">{text(dialogue.slug)}</span></Link>)}{!dialogues.length && <Empty title="No saved dialogues loaded.">Create a new dialogue or retry after the dialogue list is available.</Empty>}</div>
        </Panel>}

        <section id="dialogue-canvas" className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 scroll-mt-24">
          <div className="border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">{(["script", "flow", "rehearsal", "impact"] as CenterView[]).map((item) => <button key={item} className={view === item ? active : inactive} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <div className="flex gap-1">{!libraryOpen && !focusMode && <button className={inactive} onClick={() => setLibraryOpen(true)}>Library</button>}{!inspectorOpen && !focusMode && <button className={inactive} onClick={() => setInspectorOpen(true)}>Inspector</button>}{activeNodes.length === 0 && <button className={active} onClick={addFirstLine}>Add first line</button>}</div>
              {view === "flow" && <button className={inactive} onClick={() => { const next = autoLayout(activeNodes); setPositions(next); localStorage.setItem(layoutKey(currentId), JSON.stringify(next)); }}>Auto Layout</button>}
            </div>
            {view === "flow" && <div className="mt-2 flex flex-wrap gap-1">{(["choices", "consequences", "locks", "speakers", "reachability", "world"] as Lens[]).map((item) => <button key={item} className={lens === item ? active : inactive} onClick={() => setLens(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>}
            <div className="relative mt-2"><input aria-label="Search dialogue nodes" className={inputClass} placeholder="Find a speaker, line, or node slug…" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} />{nodeQuery && <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border bg-white p-1 shadow-lg dark:bg-slate-950">{activeNodes.filter((node) => stable([node.speaker, node.text, node.slug]).toLowerCase().includes(nodeQuery.toLowerCase())).slice(0, 20).map((node) => <button type="button" key={text(node.id)} className="block w-full rounded p-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setSelectedNodeId(text(node.id)); setSelectedChoice(null); setNodeQuery(""); if (view === "script") window.setTimeout(() => document.getElementById(`script-line-${text(node.id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }}>{speakerLabel(node, packet.characters)}: {text(node.text, "Empty line")}</button>)}</div>}</div>
            {selectedNode && <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs dark:bg-violet-950/30"><b>{label(selectedCharacter, text(selectedNode.speaker, "Speaker"))}</b>{text(selectedVoice?.want) && <span>Wants: {text(selectedVoice?.want)}</span>}{text(selectedVoice?.voice_notes) && <span>Voice: {text(selectedVoice?.voice_notes)}</span>}{text(selectedRelationship?.summary) && <span>Relationship: {text(selectedRelationship?.summary)}</span>}<span className="ml-auto">{text(selectedNode.requirements_id) ? "1 requirement in" : "No line requirement"} · {strings(selectedNode.set_flags).length + rows(selectedNode.choices).flatMap((choice) => strings(choice.set_flags)).length} flags out</span></div>}
          </div>
          {view === "script" && <DialogueScriptView nodes={activeNodes} startId={text(packet.dialogue.starting_node_id)} characters={packet.characters} selectedNodeId={selectedNodeId} onSelect={(nodeId) => { setSelectedNodeId(nodeId); setSelectedChoice(null); }} onChange={updateNode} onAdd={(nodeId) => addLinkedNode(nodeId, true)} onAddChoice={addChoiceNode} onDelete={(nodeId) => { const node = packet.nodes.find((entry) => text(entry.id) === nodeId); if (node?.__new) mutatePacket((current) => ({ ...current, nodes: current.nodes.filter((entry) => text(entry.id) !== nodeId) }), `delete:${nodeId}`); else setDeletions((current) => [...new Set([...current, nodeId])]); }} onSetStart={(nodeId) => updateDialogue({ starting_node_id: nodeId })} onMove={moveLine} onDuplicateBranch={duplicateBranch} />}
          {view === "flow" && <div data-testid="dialogue-canvas" className="dialogue-flow-canvas h-[760px]">
            <ReactFlow
              nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.8}
              onConnect={connect}
              onNodeClick={(_event, node) => { setSelectedNodeId(node.id); setSelectedChoice(null); setTab("edit"); }}
              onNodeDragStop={(_event, node) => { const next = { ...positions, [node.id]: node.position }; setPositions(next); localStorage.setItem(layoutKey(currentId), JSON.stringify(next)); }}
              onEdgeClick={(_event, edge) => { const [nodeId, index] = edge.id.split(":"); setSelectedChoice({ nodeId, index: Number(index) }); setSelectedNodeId(""); setTab("edit"); }}
            >
              <Background gap={28} /><MiniMap pannable zoomable /><Controls />
            </ReactFlow>
          </div>}
          {view === "rehearsal" && <Rehearsal packet={{ ...packet, nodes: activeNodes }} health={health} groups={groups} selectedBeatId={selectedBeatId} onBeat={setSelectedBeatId} />}
          {view === "impact" && <ImpactView packet={packet} selectedNodeId={selectedNodeId || selectedChoice?.nodeId || ""} />}
        </section>

        {!focusMode && inspectorOpen && <Panel
          id="dialogue-context"
          title="Context Dock"
          subtitle="Edit the selected line, story beat, health issue, or scene context."
          help="The dock changes with the selected tab. Edit works on the selected node or choice, Beat edits story milestones, Health explains blockers and warnings, and Context shows linked world records."
        >
          <div className="mb-3 flex flex-wrap gap-1">{(["edit", "beat", "health", "context"] as InspectorTab[]).map((item) => <button key={item} className={tab === item ? active : inactive} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}<button className={inactive} onClick={() => setInspectorOpen(false)} aria-label="Close context dock">Hide</button></div>
          {tab === "edit" && selectedChoice && selectedChoiceRow ? <ChoiceEditor choice={selectedChoiceRow} nodes={packet.nodes} flags={packet.flags} deletions={deletions} onChange={(patch) => updateChoice(selectedChoice.nodeId, selectedChoice.index, patch)} onRemove={() => { const node = packet.nodes.find((entry) => text(entry.id) === selectedChoice.nodeId); updateNode(selectedChoice.nodeId, { choices: rows(node?.choices).filter((_, index) => index !== selectedChoice.index) }); setSelectedChoice(null); }} />
            : tab === "edit" && selectedNode ? <NodeEditor node={selectedNode} packet={packet} groupedBeatId={groups[text(selectedNode.id)] || ""} selectedBeatId={selectedBeatId} onChange={(patch) => updateNode(text(selectedNode.id), patch)} onGroup={(beatId) => { const next = { ...groups, [text(selectedNode.id)]: beatId }; if (!beatId) delete next[text(selectedNode.id)]; setGroups(next); localStorage.setItem(groupKey(currentId), JSON.stringify(next)); }} onDelete={() => selectedNode.__new ? setPacket((current) => ({ ...current, nodes: current.nodes.filter((entry) => text(entry.id) !== text(selectedNode.id)) })) : setDeletions((current) => [...new Set([...current, text(selectedNode.id)])])} />
              : tab === "edit" ? <DialogueEditor dialogue={packet.dialogue} onChange={updateDialogue} /> : null}
          {tab === "edit" && selectedConsequenceNode && !selectedConsequenceNode.__new && <div className="mt-3">
            <ConsequenceComposer
              sourceKind="dialogue_node"
              source={selectedConsequenceNode}
              expectedSource={originalConsequenceNode || selectedConsequenceNode}
              sourceLabel={label(selectedConsequenceNode, text(selectedConsequenceNode.text, "Selected line"))}
              title="Line Consequences"
              subtitle="Commit node and choice flags through the shared reviewed consequence packet."
              onSourceCommitted={(savedNode) => {
                setPacket((current) => ({ ...current, nodes: current.nodes.map((node) => text(node.id) === text(savedNode.id) ? savedNode : node) }));
                setOriginal((current) => current ? { ...current, nodes: current.nodes.map((node) => text(node.id) === text(savedNode.id) ? savedNode : node) } : current);
              }}
            />
          </div>}
          {tab === "edit" && selectedNode && !selectedNode.__new && <div className="mt-3">
            <ScopedGateSection
              targetSchema="dialogue_nodes"
              targetId={text(selectedNode.id)}
              targetLabel={label(selectedNode, text(selectedNode.text, text(selectedNode.id)))}
              requirementId={text(selectedNode.requirements_id)}
              title="Line Access Gate"
              subtitle="Create or reuse the player-state requirement that controls this dialogue line."
              tag="dialogue-node-gate"
              onRequirementCommitted={(requirements_id) => {
                setPacket((current) => ({ ...current, nodes: current.nodes.map((node) => text(node.id) === text(selectedNode.id) ? { ...node, requirements_id } : node) }));
                setOriginal((current) => current ? { ...current, nodes: current.nodes.map((node) => text(node.id) === text(selectedNode.id) ? { ...node, requirements_id } : node) } : current);
              }}
            />
          </div>}
          {tab === "edit" && selectedChoice && selectedChoiceRow && <div className="mt-3">
            <ThenComposer
              title={`After '${text(selectedChoiceRow.choice_text, "Continue")}'`}
              origin={{
                ref: { kind: "dialogue", ...(isNew ? { draftId: currentId } : { canonicalId: currentId }), label: label(packet.dialogue) },
                subRef: { kind: "dialogue_choice", canonicalId: text(selectedChoiceRow.choice_id), label: text(selectedChoiceRow.choice_text, "Continue") },
              }}
              returnFrame={{ workspace: `/author/dialogues/${encodeURIComponent(currentId)}`, context: { kind: "dialogue", ...(isNew ? { draftId: currentId } : { canonicalId: currentId }), label: label(packet.dialogue) }, selectedId: selectedChoice.nodeId, localViewState: { tab: "edit", choiceIndex: selectedChoice.index } }}
            />
          </div>}
          {tab === "edit" && selectedNode && Boolean(selectedNode.is_terminal) && <div className="mt-3">
            <ThenComposer
              title={`After ${label(selectedNode, "dialogue ending")}`}
              origin={{
                ref: { kind: "dialogue", ...(isNew ? { draftId: currentId } : { canonicalId: currentId }), label: label(packet.dialogue) },
                subRef: { kind: "dialogue_node", ...(selectedNode.__new ? { draftId: text(selectedNode.id) } : { canonicalId: text(selectedNode.id) }), label: text(selectedNode.text, label(selectedNode)) },
              }}
              returnFrame={{ workspace: `/author/dialogues/${encodeURIComponent(currentId)}`, context: { kind: "dialogue", ...(isNew ? { draftId: currentId } : { canonicalId: currentId }), label: label(packet.dialogue) }, selectedId: text(selectedNode.id), localViewState: { tab: "edit" } }}
            />
          </div>}
          {tab === "beat" && selectedBeat ? <BeatEditor beat={selectedBeat} packet={packet} coverage={packet.beat_coverage[text(selectedBeat.id)]} onChange={(patch) => updateBeat(text(selectedBeat.id), patch)} onUnlink={() => unlinkBeat(selectedBeat)} /> : tab === "beat" ? <Empty title="No story beat selected.">Select an existing beat or add one from the Story Beat Track to edit its milestone details.</Empty> : null}
          {tab === "health" && <HealthPanel health={health} onSelect={(nodeId) => { setSelectedNodeId(nodeId); setView("flow"); }} />}
          {tab === "context" && <ContextPanel packet={packet} />}
        </Panel>}
       </div>
         </main>
     </div>
    {commandOpen && <div role="dialog" aria-modal="true" aria-label="Dialogue commands" className="fixed inset-0 z-50 bg-slate-950/50 p-4" onMouseDown={() => setCommandOpen(false)}><div className="mx-auto mt-20 max-w-lg rounded-xl bg-white p-4 shadow-2xl dark:bg-slate-900" onMouseDown={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><b>Dialogue commands</b><button onClick={() => setCommandOpen(false)} aria-label="Close commands">✕</button></div><div className="grid gap-2">
      <button className={inactive} disabled={!selectedNodeId} onClick={() => { if (selectedNodeId) addLinkedNode(selectedNodeId, true); setCommandOpen(false); }}>Add continuation</button>
      <button className={inactive} disabled={!selectedNodeId} onClick={() => { const choice = window.prompt("Player choice label"); if (selectedNodeId && choice?.trim()) addChoiceNode(selectedNodeId, choice.trim()); setCommandOpen(false); }}>Add choice</button>
      <button className={inactive} onClick={() => { setFocusMode((value) => !value); setCommandOpen(false); }}>Toggle focus mode</button>
      <button className={inactive} onClick={() => { setView("rehearsal"); setCommandOpen(false); }}>Rehearse from canonical start</button>
      <button className={inactive} disabled={activeNodes.length > 0} onClick={() => { setImportOpen(true); setCommandOpen(false); }}>Import dialogue text</button>
      <button className={inactive} onClick={() => { const name = window.prompt("Snapshot name", `Snapshot ${new Date().toLocaleString()}`); if (name?.trim()) { const snapshot = { id: generateUlid(), name: name.trim(), createdAt: Date.now(), value: packet }; setSnapshots(saveSnapshot(currentId, snapshot)); setNotice(`Local snapshot '${name.trim()}' created.`); } setCommandOpen(false); }}>Create local snapshot</button>
      {snapshots.slice().reverse().map((snapshot) => <button key={snapshot.id} className={inactive} onClick={() => { mutatePacket(() => snapshot.value, `snapshot:${snapshot.id}`); setCommandOpen(false); setNotice(`Restored local snapshot '${snapshot.name}'.`); }}>Restore: {snapshot.name}</button>)}
    </div><div className="mt-3 text-xs text-slate-500">Ctrl/Cmd+K commands · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Script: Ctrl/Cmd+Enter continue, Alt+Enter choice</div></div></div>}
    {importOpen && <DialogueImportDialog dialogueId={currentId} characters={packet.characters} onCancel={() => setImportOpen(false)} onStage={(candidate) => {
      const snapshot = { id: generateUlid(), name: "Before DLG/1 import", createdAt: Date.now(), value: packet };
      setSnapshots(saveSnapshot(currentId, snapshot));
      mutatePacket((current) => ({ ...current, dialogue: { ...current.dialogue, ...candidate.dialogue }, nodes: candidate.nodes }), "dlg-import");
      setPositions(autoLayout(candidate.nodes)); setSelectedNodeId(text(candidate.dialogue.starting_node_id)); setView("script"); setImportOpen(false); setNotice("DLG/1 candidate staged as a local draft. Review, rehearse, and preview before committing.");
    }} />}
    {review && <BundleReview result={review} title="Dialogue Scene Bundle Review" description="Dialogue, lines, and story beats will commit atomically." variant="modal" commitLabel="Commit Bundle" saving={saving} error={reviewError} warningAcknowledgement="required" onCancel={() => { setReview(null); setPreviewMutation(null); setReviewError(""); }} onCommit={(acceptedWarningIds) => void commit(acceptedWarningIds)} />}
  </AuthoringPageShell>;
}

function SceneBrief({ packet, onChange, onRecipe }: { packet: DialoguePacket; onChange: (patch: EntryRecord) => void; onRecipe: (recipe: string) => void }) {
  const participants = sceneParticipants(packet);
  const owner = packet.characters.find((entry) => text(entry.id) === text(packet.dialogue.character_id)) || packet.context.character;
  return <Panel title="Scene Brief" subtitle="Why this conversation happens, who is present, and where it sits in the world." help="Use this before writing lines. It sets the dialogue title, owner, location, entry requirement, and optional starter graph. Recipes only stage a draft and never save automatically.">
    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr]">
      <div><Field label="Scene Title" value={packet.dialogue.title} onChange={(title) => onChange({ title, slug: text(packet.dialogue.slug) || generateSlug(title) })} /><div className="mt-2"><Field label="Scene Direction" value={packet.dialogue.description} textarea onChange={(description) => onChange({ description })} /></div></div>
      <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800"><Caption>Scene Anchors</Caption><div>Owner: {owner ? label(owner) : "Unassigned"}</div><div>Location: {packet.context.location ? label(packet.context.location) : "Unassigned"}</div><div>Entry requirement: {text(packet.dialogue.requirements_id, "No entry requirement")}</div><div className="mt-2 flex flex-wrap gap-1">{participants.map((entry) => <Chip key={text(entry.id)}>{label(entry)}</Chip>)}{!participants.length && <span className="text-xs text-slate-500">No participants linked yet.</span>}</div></div>
      <div><Caption>Starter Recipes</Caption><div className="flex flex-wrap gap-1">{["Greeting", "Quest Briefing", "Negotiation", "Post-Encounter Reaction"].map((recipe) => <button key={recipe} className={`${BUTTON_CLASSES.outline} ${BUTTON_SIZES.xs}`} onClick={() => onRecipe(recipe)}>{recipe}</button>)}</div><p className="mt-2 text-xs text-slate-500">Recipes stage a complete local graph and never save automatically.</p></div>
    </div>
  </Panel>;
}

function BeatTrack({ packet, selectedBeatId, setSelectedBeatId, onCreate }: { packet: DialoguePacket; selectedBeatId: string; setSelectedBeatId: (id: string) => void; onCreate: (characterId: string) => void }) {
  const [owner, setOwner] = useState("");
  const participants = sceneParticipants(packet);
  const lanes = participants.map((participant) => ({ participant, beats: packet.story_beats.filter((beat) => text(beat.character_id) === text(participant.id)).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)) }));
  return <Panel title="Story Beat Track" subtitle="Character milestones linked to this dialogue. Node grouping is local to this room." help="Use story beats to describe what changes for a participant across the conversation. Grouping dialogue lines to a beat is local authoring context until the bundle is reviewed and committed.">
    <div className="mb-3 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold uppercase text-slate-500">Beat Owner<select aria-label="Beat Owner" className={`${inputClass} mt-1 normal-case`} value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">Choose participant</option>{participants.map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{label(entry)}</option>)}</select></label><button className={active} disabled={!owner} onClick={() => onCreate(owner)}>Add Story Beat</button></div>
    <div className="space-y-2">{lanes.map(({ participant, beats }) => <div key={text(participant.id)} className="grid gap-2 rounded border border-slate-200 p-2 dark:border-slate-800 md:grid-cols-[150px_1fr]"><div className="text-xs font-semibold">{label(participant)}<div className="font-normal text-slate-500">{beats.length} dialogue beats</div></div><div className="flex gap-2 overflow-x-auto">{beats.map((beat) => <button key={text(beat.id)} className={`min-w-48 rounded border p-2 text-left text-xs ${selectedBeatId === text(beat.id) ? "border-violet-600 bg-violet-50 ring-2 ring-violet-200 dark:bg-violet-950" : "border-slate-300 dark:border-slate-700"}`} onClick={() => setSelectedBeatId(text(beat.id))}><div className="text-[10px] uppercase text-violet-600">{text(beat.beat_type)} / Arc #{Number(beat.sort_order) + 1}</div><div className="mt-1 font-semibold">{label(beat)}</div><div className="mt-1 text-slate-500">{strings(beat.required_flags).length + strings(beat.forbidden_flags).length} inputs → {strings(beat.expected_output_flags).length} outputs</div></button>)}{beats.length === 0 && <Empty title="No beats for this participant yet.">Add a story beat when this conversation should change what the character knows, wants, or does next.</Empty>}</div></div>)}{!lanes.length && <Empty title="No participants available.">Assign an owner, speaker, or participant before adding character story beats.</Empty>}</div>
  </Panel>;
}

function DialogueEditor({ dialogue, onChange }: { dialogue: EntryRecord; onChange: (patch: EntryRecord) => void }) {
  return <div className="space-y-3"><Field label="Title" value={dialogue.title} onChange={(title) => onChange({ title, slug: text(dialogue.slug) || generateSlug(title) })} /><Field label="Slug" value={dialogue.slug} onChange={(slug) => onChange({ slug })} /><Field label="Writing Direction" value={dialogue.description} textarea onChange={(description) => onChange({ description })} /><ReferenceChipPicker label="Owner Character" value={dialogue.character_id} reference="characters" onChange={(character_id) => onChange({ character_id })} /><ReferenceChipPicker label="Location" value={dialogue.location_id} reference="locations" onChange={(location_id) => onChange({ location_id })} /><ReferenceChipPicker label="Entry Requirement" value={dialogue.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} /><EditableTagList tags={dialogue.tags} onChange={(tags) => onChange({ tags })} /></div>;
}

function NodeEditor({ node, packet, groupedBeatId, selectedBeatId, onChange, onGroup, onDelete }: { node: EntryRecord; packet: DialoguePacket; groupedBeatId: string; selectedBeatId: string; onChange: (patch: EntryRecord) => void; onGroup: (id: string) => void; onDelete: () => void }) {
  return <div className="space-y-3"><label className="block text-xs font-semibold uppercase text-slate-500">Linked Speaker<select className={`${inputClass} mt-1 normal-case`} value={text(node.speaker_character_id)} onChange={(event) => { const character = packet.characters.find((entry) => text(entry.id) === event.target.value); onChange({ speaker_character_id: event.target.value || null, speaker: character ? label(character) : node.speaker }); }}><option value="">Fallback speaker only</option>{packet.characters.map((character) => <option key={text(character.id)} value={text(character.id)}>{label(character)}</option>)}</select></label><Field label="Fallback Speaker" value={node.speaker} onChange={(speaker) => onChange({ speaker })} /><Field label="Slug" value={node.slug} onChange={(slug) => onChange({ slug })} /><Field label="Dialogue Text" value={node.text} textarea onChange={(value) => onChange({ text: value })} /><ReferenceChipPicker label="Requirement" value={node.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} /><FlagPicker label="Flags Produced By Line" value={node.set_flags} options={packet.flags} onChange={(set_flags) => onChange({ set_flags })} /><label className="block text-xs font-semibold uppercase text-slate-500">Local Story Beat Group<select aria-label="Local Story Beat Group" className={`${inputClass} mt-1 normal-case`} value={groupedBeatId} onChange={(event) => onGroup(event.target.value)}><option value="">No local grouping</option>{packet.story_beats.map((beat) => <option key={text(beat.id)} value={text(beat.id)}>{label(beat)}</option>)}</select></label>{selectedBeatId && groupedBeatId !== selectedBeatId && <button className={inactive} onClick={() => onGroup(selectedBeatId)}>Group With Selected Beat</button>}<button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={onDelete}>{node.__new ? "Discard Line" : "Delete Line On Save"}</button></div>;
}

function ChoiceEditor({ choice, nodes, flags, deletions, onChange, onRemove }: { choice: EntryRecord; nodes: EntryRecord[]; flags: EntryRecord[]; deletions: string[]; onChange: (patch: EntryRecord) => void; onRemove: () => void }) {
  const [actionType, setActionType] = useState("open_shop");
  const actions = rows(choice.actions);
  const setActions = (next: EntryRecord[]) => onChange({ actions: next.map((action, index) => ({ ...action, sort_order: index })) });
  const updateAction = (index: number, patch: EntryRecord) => setActions(actions.map((action, actionIndex) => actionIndex === index ? { ...action, ...patch } : action));
  const referenceFor = (targetType: string) => ({ shop: "shops", encounter: "encounters", character: "characters", quest: "quests", location_poi: "location-pois" }[targetType] || "");
  return <div className="space-y-3">
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-950"><span className="font-semibold">Stable choice</span><code className="ml-2 break-all text-slate-500">{text(choice.choice_id)}</code></div>
    <Field label="Player Choice (blank = continue)" value={choice.choice_text} onChange={(choice_text) => onChange({ choice_text })} />
    <label className="block text-xs font-semibold uppercase text-slate-500">Target<select className={`${inputClass} mt-1 normal-case`} value={text(choice.next_node_id)} onChange={(event) => onChange({ next_node_id: event.target.value })}>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)} disabled={deletions.includes(text(node.id))}>{label(node, text(node.text, "Empty line"))}</option>)}</select></label>
    <ReferenceChipPicker label="Requirement" value={choice.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} />
    <FlagPicker label="Flags Produced By Choice" value={choice.set_flags} options={flags} onChange={(set_flags) => onChange({ set_flags })} />
    <div className="rounded-md border border-violet-200 p-3 dark:border-violet-800">
      <div className="text-xs font-semibold uppercase text-violet-700 dark:text-violet-300">Immediate typed actions</div>
      <p className="mt-1 text-xs text-slate-500">Actions are ordered and export as runtime unverified until the game consumer is verified.</p>
      <div className="mt-2 flex gap-2"><select aria-label="New choice action" className={inputClass} value={actionType} onChange={(event) => setActionType(event.target.value)}>{CHOICE_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className={active} onClick={() => setActions([...actions, newChoiceAction(actionType, actions.length)])}>Add action</button></div>
      <div className="mt-3 space-y-2">{actions.map((action, index) => {
        const selected = CHOICE_ACTION_OPTIONS.find((option) => option.value === text(action.action_type)) || CHOICE_ACTION_OPTIONS[0];
        return <div key={text(action.action_id, String(index))} className="rounded border border-slate-200 p-2 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{index + 1}. {selected.label}</span><span className="text-[10px] uppercase text-amber-700">{text(action.runtime_support).replace(/_/g, " ")}</span></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Action type<select className={`${inputClass} mt-1 normal-case`} value={selected.value} onChange={(event) => { const option = CHOICE_ACTION_OPTIONS.find((entry) => entry.value === event.target.value) || CHOICE_ACTION_OPTIONS[0]; updateAction(index, { action_type: option.value, target_ref_type: option.targetType, target_ref_id: "", continuation_policy: option.continuation }); }}>{CHOICE_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <ReferenceChipPicker label="Canonical target" value={action.target_ref_id} reference={referenceFor(selected.targetType)} allowEmpty={false} onChange={(target_ref_id) => updateAction(index, { target_ref_id })} />
            <label className="text-xs font-semibold uppercase text-slate-500">Timing<select className={`${inputClass} mt-1 normal-case`} value={text(action.timing)} onChange={(event) => updateAction(index, { timing: event.target.value })}><option value="immediate">Immediate</option><option value="after_completion">After completion</option><option value="on_turn_in">On turn-in</option></select></label>
            <label className="text-xs font-semibold uppercase text-slate-500">Repeat policy<select className={`${inputClass} mt-1 normal-case`} value={text(action.repeat_policy)} onChange={(event) => updateAction(index, { repeat_policy: event.target.value })}><option value="inherit_owner">Inherit choice owner</option><option value="one_shot">One shot</option><option value="repeatable">Repeatable</option></select></label>
          </div>
          <div className="mt-2 flex gap-1"><button type="button" aria-label={`Move action ${index + 1} up`} disabled={index === 0} className={inactive} onClick={() => { const next = [...actions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setActions(next); }}>↑</button><button type="button" aria-label={`Move action ${index + 1} down`} disabled={index === actions.length - 1} className={inactive} onClick={() => { const next = [...actions]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setActions(next); }}>↓</button><button type="button" className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={() => setActions(actions.filter((_, actionIndex) => actionIndex !== index))}>Remove action</button></div>
        </div>;
      })}{actions.length === 0 && <div className="text-xs text-slate-500">No typed action. This choice only navigates and applies its existing flags.</div>}</div>
    </div>
    <button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={onRemove}>Remove Choice</button>
  </div>;
}

function BeatEditor({ beat, packet, coverage, onChange, onUnlink }: { beat: EntryRecord; packet: DialoguePacket; coverage?: BeatCoverage; onChange: (patch: EntryRecord) => void; onUnlink: () => void }) {
  return <div className="space-y-3"><Field label="Beat Title" value={beat.title} onChange={(title) => onChange({ title })} /><label className="block text-xs font-semibold uppercase text-slate-500">Beat Type<select className={`${inputClass} mt-1 normal-case`} value={text(beat.beat_type)} onChange={(event) => onChange({ beat_type: event.target.value })}>{BEAT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label><Field label="Summary" value={beat.summary} textarea onChange={(summary) => onChange({ summary })} /><Field label="State Before" value={beat.state_before} textarea onChange={(state_before) => onChange({ state_before })} /><Field label="State After" value={beat.state_after} textarea onChange={(state_after) => onChange({ state_after })} /><Field label="Player Impact" value={beat.player_impact} textarea onChange={(player_impact) => onChange({ player_impact })} /><Field label="World Impact" value={beat.world_impact} textarea onChange={(world_impact) => onChange({ world_impact })} /><FlagPicker label="Required Before" value={beat.required_flags} options={packet.flags} onChange={(required_flags) => onChange({ required_flags })} /><FlagPicker label="Must Not Be True" value={beat.forbidden_flags} options={packet.flags} onChange={(forbidden_flags) => onChange({ forbidden_flags })} /><FlagPicker label="Expected After" value={beat.expected_output_flags} options={packet.flags} onChange={(expected_output_flags) => onChange({ expected_output_flags })} />{coverage?.warnings.map((warning) => <Issue key={warning} tone="amber">{warning}</Issue>)}<button className={`${BUTTON_CLASSES.danger} ${BUTTON_SIZES.sm}`} onClick={onUnlink}>{beat.__new ? "Discard Beat" : "Unlink Beat From Dialogue"}</button></div>;
}

function Rehearsal({ packet, health, groups, selectedBeatId, onBeat }: { packet: DialoguePacket; health: Health; groups: Record<string, string>; selectedBeatId: string; onBeat: (id: string) => void }) {
  const canonicalStart = text(packet.dialogue.starting_node_id);
  const start = packet.nodes.some((node) => text(node.id) === canonicalStart) ? canonicalStart : health.roots.length === 1 ? health.roots[0] : text(packet.nodes[0]?.id);
  const defaults = packet.flags.filter((flag) => Boolean(flag.default_value)).map((flag) => text(flag.id));
  const [currentId, setCurrentId] = useState(start);
  const [flags, setFlags] = useState<Set<string>>(new Set(defaults));
  const [reputation, setReputation] = useState<Record<string, number>>({});
  const [transcript, setTranscript] = useState<EntryRecord[]>([]);
  const [snapshots, setSnapshots] = useState<EntryRecord[][]>([]);
  const current = packet.nodes.find((node) => text(node.id) === currentId);
  const dialogueGate = requirementState(packet.dialogue.requirements_id, packet.requirements, flags, reputation);
  const nodeGate = requirementState(current?.requirements_id, packet.requirements, flags, reputation);
  const restart = () => { setCurrentId(start); setFlags(new Set(defaults)); setReputation({}); setTranscript([]); onBeat(""); };
  useEffect(() => {
    if (!current || !dialogueGate.available || !nodeGate.available) return;
    setFlags((value) => new Set([...value, ...strings(current.set_flags)]));
    const beatId = groups[text(current.id)] || "";
    if (beatId && beatId !== selectedBeatId) onBeat(beatId);
  }, [current, dialogueGate.available, groups, nodeGate.available, onBeat, selectedBeatId]);
  if (!current) return <div className="p-6"><Empty title="No dialogue line to rehearse.">Create a line or apply a starter recipe before using rehearsal.</Empty></div>;
  return <div className="grid min-h-[760px] gap-4 bg-slate-50 p-4 dark:bg-slate-950 lg:grid-cols-[1fr_330px]">
    <div className="flex flex-col justify-center"><div className="mx-auto w-full max-w-3xl rounded-xl border border-slate-300 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900"><div className="text-xs font-semibold uppercase text-violet-600">{speakerLabel(current, packet.characters)}</div>{!dialogueGate.available ? <Issue tone="amber">Dialogue locked: {dialogueGate.reason}</Issue> : !nodeGate.available ? <Issue tone="amber">Line locked: {nodeGate.reason}</Issue> : <><div className="mt-3 whitespace-pre-wrap text-lg">{text(current.text)}</div><div className="mt-6 grid gap-2">{rows(current.choices).map((choice, index) => { const state = requirementState(choice.requirements_id, packet.requirements, flags, reputation); return <button key={index} disabled={!state.available} className="rounded border border-blue-300 p-3 text-left text-sm hover:bg-blue-50 disabled:opacity-40 dark:hover:bg-blue-950" onClick={() => { setTranscript((value) => [...value, { speaker: speakerLabel(current, packet.characters), line: current.text, choice: text(choice.choice_text, "Continue") }]); setFlags((value) => new Set([...value, ...strings(choice.set_flags)])); setCurrentId(text(choice.next_node_id)); }}>{text(choice.choice_text, "Continue")}{!state.available && <span className="block text-xs text-amber-700">{state.reason}</span>}</button>; })}{rows(current.choices).length === 0 && <div className="rounded bg-slate-100 p-3 text-sm dark:bg-slate-800">End of conversation.</div>}</div></>}</div></div>
    <aside className="space-y-3"><Panel title="Rehearsal Controls" help="Rehearsal uses temporary player state only. It does not save flags or reputation; it just shows which requirements would allow each line or choice."><div className="flex gap-2"><button className={inactive} onClick={restart}>Restart</button><button className={inactive} onClick={() => setSnapshots((value) => [...value, transcript])}>Snapshot Path</button></div><details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Temporary Player State</summary><div className="mt-2"><FlagPicker value={[...flags]} options={packet.flags} onChange={(next) => setFlags(new Set(next))} />{packet.factions.map((faction) => <label key={text(faction.id)} className="mt-2 block text-xs">{label(faction)}<input className={inputClass} type="number" value={reputation[text(faction.id)] || 0} onChange={(event) => setReputation((value) => ({ ...value, [text(faction.id)]: Number(event.target.value) }))} /></label>)}</div></details></Panel><Panel title="Transcript">{transcript.map((row, index) => <div key={index} className="mb-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-800"><b>{text(row.speaker)}</b>: {text(row.line)}<div className="mt-1 text-blue-700">→ {text(row.choice)}</div></div>)}{!transcript.length && <Empty title="No rehearsal choices yet.">Choices appear here as you play through the scene.</Empty>}</Panel>{snapshots.length > 0 && <Panel title="Path Comparison">{snapshots.map((path, index) => <div key={index} className="mb-2 rounded border p-2 text-xs">Path {index + 1}: {path.map((row) => text(row.choice)).join(" → ") || "Start"}</div>)}</Panel>}</aside>
  </div>;
}

function ImpactView({ packet, selectedNodeId }: { packet: DialoguePacket; selectedNodeId: string }) {
  const source = selectedNodeId ? `dialogue_nodes:${selectedNodeId}` : "";
  const flags = source ? packet.world_echo.produced_flags.filter((entry) => text(entry.source_id) === source) : packet.world_echo.produced_flags;
  const consumers = source ? packet.world_echo.consumers.filter((entry) => text(entry.source_id) === source) : packet.world_echo.consumers;
  return <div className="min-h-[760px] bg-slate-50 p-5 dark:bg-slate-950"><div className="mx-auto max-w-5xl"><h2 className="text-xl font-semibold">World Echo</h2><p className="mt-1 text-sm text-slate-500">{selectedNodeId ? "Impact produced by the selected line and its choices." : "All downstream impact produced by this conversation."}</p><div className="mt-5 grid gap-4 md:grid-cols-2"><Panel title="Produced State" help="Flags shown here are produced by the selected line or by the whole conversation if nothing is selected.">{flags.map((entry) => <Link key={`${text(entry.id)}:${text(entry.path)}`} to={text(entry.route)} className="mb-2 block rounded border border-fuchsia-300 bg-fuchsia-50 p-3 text-sm dark:bg-fuchsia-950"><div className="font-semibold">{text(entry.label, text(entry.entry_id))}</div><div className="text-xs text-slate-500">{text(entry.path)}</div></Link>)}{!flags.length && <Empty title="No produced state from this focus.">Add line or choice flags when this conversation should change player state.</Empty>}</Panel><Panel title="Downstream World" help="These records depend on state produced by the dialogue. Use this to check whether a line unlocks later content.">{consumers.map((entry) => <Link key={`${text(entry.id)}:${text(entry.path)}`} to={text(entry.route)} className="mb-2 block rounded border border-violet-300 bg-violet-50 p-3 text-sm dark:bg-violet-950"><div className="text-[10px] uppercase text-violet-600">{text(entry.kind)}</div><div className="font-semibold">{text(entry.label, text(entry.entry_id))}</div><div className="text-xs text-slate-500">Unlocked through {text(entry.path)}</div></Link>)}{!consumers.length && <Empty title="No known downstream consumers from this focus.">That is fine for flavor dialogue. Add requirements elsewhere when this conversation should unlock future content.</Empty>}</Panel></div></div></div>;
}

function HealthPanel({ health, onSelect }: { health: Health; onSelect: (id: string) => void }) {
  return <div className="space-y-2">{health.blockers.map((issue) => <Issue key={issue} tone="red">{issue}</Issue>)}{health.warnings.map((issue) => <Issue key={issue} tone="amber">{issue}</Issue>)}{!health.blockers.length && !health.warnings.length && <Issue tone="green">No scene issues found.</Issue>}{health.unreachable.size > 0 && <div><Caption>Unreachable Lines</Caption>{[...health.unreachable].map((id) => <button key={id} className="block text-sm text-blue-700" onClick={() => onSelect(id)}>{id}</button>)}</div>}</div>;
}

function ContextPanel({ packet }: { packet: DialoguePacket }) {
  return <div className="space-y-4"><div><Caption>Participants</Caption>{packet.context.participants.map((entry) => { const profile = packet.context.story_profiles.find((row) => text(row.character_id) === text(entry.id)); return <div key={text(entry.id)} className="mb-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-800"><Link className="font-semibold text-blue-700" to={`/author/characters/${encodeURIComponent(text(entry.id))}`}>{label(entry)}</Link>{profile && <div className="mt-1 text-xs text-slate-500">Want: {text(profile.want, "Unwritten")}<br />Voice: {text(profile.voice_notes, "Unwritten")}</div>}</div>; })}</div><ContextList title="Relationships" entries={packet.context.relationships} route={(entry) => `/character-relationships?selected=${encodeURIComponent(text(entry.id))}`} /><ContextList title="Events" entries={packet.context.events} route={(entry) => `/events?selected=${encodeURIComponent(text(entry.id))}`} /><ContextList title="POIs" entries={packet.context.pois} route={(entry) => `/location-pois?selected=${encodeURIComponent(text(entry.id))}`} /><ContextList title="Interaction Profiles" entries={packet.context.interaction_profiles} route={(entry) => `/interaction-profiles?selected=${encodeURIComponent(text(entry.id))}`} /></div>;
}

function ContextList({ title, entries, route }: { title: string; entries: EntryRecord[]; route: (entry: EntryRecord) => string }) {
  return <div><Caption>{title}</Caption>{entries.map((entry) => <Link key={text(entry.id)} className="mb-1 block rounded border border-slate-200 p-2 text-sm text-blue-700 dark:border-slate-800" to={route(entry)}>{label(entry)}</Link>)}{!entries.length && <Empty title={`No ${title.toLowerCase()} linked.`}>Link related records when the conversation needs more world context.</Empty>}</div>;
}

function FlagPicker({ value, options, label: pickerLabel = "Flags Set", onChange }: { value: unknown; options: EntryRecord[]; label?: string; onChange: (flags: string[]) => void }) {
  const [loaded, setLoaded] = useState<EntryRecord[]>(options);
  useEffect(() => {
    if (options.length) { setLoaded(options); return; }
    void apiFetch("/api/flags").then((response) => response.json()).then((body) => setLoaded(rows(body))).catch(() => setLoaded([]));
  }, [options]);
  const selected = strings(value);
  const selectedFlags = selected.map((id) => loaded.find((flag) => text(flag.id) === id) || { id, name: id });
  const available = loaded.filter((flag) => !selected.includes(text(flag.id)));
  return <div>
    <div className="flex items-center justify-between gap-2"><Caption>{pickerLabel}</Caption><Link className="text-[10px] font-semibold text-blue-700 dark:text-blue-400" to="/flags">Manage global flags</Link></div>
    <div className="mb-2 flex min-h-7 flex-wrap gap-1 rounded border border-slate-200 p-1.5 dark:border-slate-800">
      {selectedFlags.map((flag) => <span key={text(flag.id)} className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-semibold text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200">{label(flag)}<button type="button" aria-label={`Remove ${label(flag)}`} className="rounded-full px-1 hover:bg-fuchsia-200 dark:hover:bg-fuchsia-800" onClick={() => onChange(selected.filter((id) => id !== text(flag.id)))}>x</button></span>)}
      {!selected.length && <span className="text-xs text-slate-500">No flags selected.</span>}
    </div>
    <select aria-label={pickerLabel} className={`${inputClass} normal-case`} value="" onChange={(event) => { if (event.target.value) onChange([...selected, event.target.value]); }}>
      <option value="">{available.length ? "Add existing flag..." : "No more flags available"}</option>
      {available.map((flag) => <option key={text(flag.id)} value={text(flag.id)}>{label(flag)}</option>)}
    </select>
    <p className="mt-1 text-[10px] text-slate-500">This links existing world-state flags. Global flag creation and deletion happen in Flags.</p>
  </div>;
}

function Field({ label: fieldLabel, value, textarea, onChange }: { label: string; value: unknown; textarea?: boolean; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold uppercase text-slate-500">{fieldLabel}{textarea ? <textarea aria-label={fieldLabel} className={`${inputClass} mt-1 min-h-24 normal-case`} value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} /> : <input aria-label={fieldLabel} className={`${inputClass} mt-1 normal-case`} value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />}</label>;
}
function Panel({ id, title, subtitle, help, children }: { id?: string; title: string; subtitle?: string; help?: ReactNode; children: ReactNode }) { return <AuthoringPanel id={id} title={title} subtitle={subtitle} help={help}>{children}</AuthoringPanel>; }
function Notice({ children }: { children: ReactNode }) { return <div className="mt-3"><StatusNotice>{children}</StatusNotice></div>; }
function Empty({ title, children }: { title?: ReactNode; children: ReactNode }) { return <EmptyState variant="compact" title={title}>{children}</EmptyState>; }
function Caption({ children }: { children: ReactNode }) { return <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>; }
function Chip({ children }: { children: ReactNode }) { return <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{children}</span>; }
function Issue({ children, tone }: { children: ReactNode; tone: "red" | "amber" | "green" }) { const style = tone === "red" ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950" : tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950"; return <div className={`mb-2 rounded border p-2 text-xs ${style}`}>{children}</div>; }
