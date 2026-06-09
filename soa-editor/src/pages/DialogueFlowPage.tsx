import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { formatApiError } from "../lib/apiErrors";
import { useDirtyState } from "../components/useDirtyState";
import { EditableTagList, ReferenceChipPicker, displayText, isRecord } from "../authoringViews/controls";
import { generateSlug, generateUlid } from "../utils/generateId";
import type { EntryRecord } from "../types/editorQol";

type CanvasMode = "select" | "sketch" | "connect" | "move";
type Lens = "choices" | "consequences" | "locks" | "speakers" | "reachability";
type InspectorTab = "edit" | "health" | "play" | "context";
type Position = { x: number; y: number };

interface DialoguePacket {
  dialogue: EntryRecord;
  nodes: EntryRecord[];
  requirements: EntryRecord[];
  flags: EntryRecord[];
  factions: EntryRecord[];
  context: {
    interaction_profiles: EntryRecord[];
    events: EntryRecord[];
    pois: EntryRecord[];
    character: EntryRecord | null;
    location: EntryRecord | null;
  };
}

interface HealthResult {
  issues: string[];
  roots: string[];
  unreachable: Set<string>;
  cycles: Set<string>;
}

const EMPTY_CONTEXT = { interaction_profiles: [], events: [], pois: [], character: null, location: null };
const NEW_DRAFT_POINTER = "soa.draft.dialogue_flow.new";
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const activeButton = "rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const inactiveButton = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200";

function text(value: unknown, fallback = ""): string {
  return displayText(value, fallback);
}

function rows(value: unknown): EntryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function label(entry: EntryRecord | null | undefined, fallback = "Untitled"): string {
  return entry ? text(entry.name, text(entry.title, text(entry.slug, text(entry.id, fallback)))) : fallback;
}

function emptyDialogue(): EntryRecord {
  const id = generateUlid();
  return { id, slug: `new-dialogue-${id.slice(-6).toLowerCase()}`, title: "New Dialogue", description: "", tags: [] };
}

function emptyNode(dialogueId: string, index: number): EntryRecord {
  const id = generateUlid();
  const name = `New Line ${index}`;
  return { id, slug: generateSlug(`${name}-${id.slice(-5)}`), dialogue_id: dialogueId, speaker: "NPC", text: "", choices: [], set_flags: [], tags: [], __new: true };
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function layoutKey(dialogueId: string): string {
  return `soa.dialogue-flow.layout.${dialogueId}`;
}

function startKey(dialogueId: string): string {
  return `soa.dialogue-flow.start.${dialogueId}`;
}

function draftKey(dialogueId: string): string {
  return `soa.draft.dialogue_flow.${dialogueId}`;
}

function readPositions(dialogueId: string): Record<string, Position> {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKey(dialogueId)) || "{}");
    return isRecord(parsed) ? parsed as Record<string, Position> : {};
  } catch {
    return {};
  }
}

function autoLayout(nodes: EntryRecord[]): Record<string, Position> {
  const byId = new Map(nodes.map((node) => [text(node.id), node]));
  const inbound = new Map(nodes.map((node) => [text(node.id), 0]));
  nodes.forEach((node) => rows(node.choices).forEach((choice) => {
    const target = text(choice.next_node_id);
    if (inbound.has(target)) inbound.set(target, (inbound.get(target) || 0) + 1);
  }));
  const roots = nodes.filter((node) => (inbound.get(text(node.id)) || 0) === 0);
  const queue = roots.map((node) => ({ id: text(node.id), depth: 0 }));
  const depth = new Map<string, number>();
  while (queue.length) {
    const item = queue.shift()!;
    if (depth.has(item.id)) continue;
    depth.set(item.id, item.depth);
    rows(byId.get(item.id)?.choices).forEach((choice) => {
      const target = text(choice.next_node_id);
      if (byId.has(target) && !depth.has(target)) queue.push({ id: target, depth: item.depth + 1 });
    });
  }
  nodes.forEach((node) => { if (!depth.has(text(node.id))) depth.set(text(node.id), Math.max(1, ...depth.values()) + 1); });
  const groups = new Map<number, string[]>();
  depth.forEach((value, id) => groups.set(value, [...(groups.get(value) || []), id]));
  const positions: Record<string, Position> = {};
  groups.forEach((ids, column) => ids.forEach((id, index) => {
    positions[id] = { x: 70 + column * 270, y: 60 + index * 170 };
  }));
  return positions;
}

function analyze(nodes: EntryRecord[]): HealthResult {
  const issues: string[] = [];
  const ids = new Set(nodes.map((node) => text(node.id)).filter(Boolean));
  const inbound = new Map([...ids].map((id) => [id, 0]));
  const adjacency = new Map([...ids].map((id) => [id, [] as string[]]));
  nodes.forEach((node) => {
    const nodeId = text(node.id);
    if (!nodeId || !text(node.slug) || !text(node.speaker) || !text(node.text)) issues.push(`${label(node)} is missing id, slug, speaker, or text.`);
    const signatures = new Set<string>();
    rows(node.choices).forEach((choice, index) => {
      const target = text(choice.next_node_id);
      if (!target || !ids.has(target)) issues.push(`${label(node)} choice ${index + 1} targets a missing node.`);
      else {
        inbound.set(target, (inbound.get(target) || 0) + 1);
        adjacency.get(nodeId)?.push(target);
      }
      const signature = `${text(choice.choice_text)}|${target}|${text(choice.requirements_id)}|${strings(choice.set_flags).join(",")}`;
      if (signatures.has(signature)) issues.push(`${label(node)} has duplicate outgoing choices.`);
      signatures.add(signature);
    });
    if (rows(node.choices).length === 0) issues.push(`${label(node)} is a dead end.`);
  });
  const roots = [...inbound.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  if (nodes.length > 0 && roots.length !== 1) issues.push(roots.length === 0 ? "No inferred start node; the graph may be fully cyclic." : "Multiple inferred start nodes make playthrough ambiguous.");
  const reachable = new Set<string>();
  const queue = roots.length === 1 ? [...roots] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    adjacency.get(id)?.forEach((target) => queue.push(target));
  }
  const unreachable = new Set([...ids].filter((id) => !reachable.has(id)));
  if (unreachable.size) issues.push(`${unreachable.size} node(s) are unreachable from the inferred start.`);
  const cycles = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { cycles.add(id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    adjacency.get(id)?.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  ids.forEach(visit);
  if (cycles.size) issues.push("The dialogue contains one or more loops.");
  return { issues, roots, unreachable, cycles };
}

function requirementState(requirementId: unknown, requirements: EntryRecord[], flags: Set<string>, reputation: Record<string, number>): { available: boolean; reason: string } {
  const id = text(requirementId);
  if (!id) return { available: true, reason: "" };
  const requirement = requirements.find((entry) => text(entry.id) === id);
  if (!requirement) return { available: false, reason: `Missing requirement ${id}` };
  const missing = strings(requirement.required_flags).filter((flag) => !flags.has(flag));
  const forbidden = strings(requirement.forbidden_flags).filter((flag) => flags.has(flag));
  const reps = rows(requirement.min_faction_reputation).filter((row) => Number(reputation[text(row.faction_id)] || 0) < Number(row.min || 0));
  const reasons = [
    missing.length ? `Missing flags: ${missing.join(", ")}` : "",
    forbidden.length ? `Forbidden flags set: ${forbidden.join(", ")}` : "",
    reps.length ? `Low reputation: ${reps.map((row) => `${text(row.faction_id)} < ${Number(row.min || 0)}`).join(", ")}` : "",
  ].filter(Boolean);
  return { available: reasons.length === 0, reason: reasons.join(". ") };
}

export default function DialogueFlowPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const initialDialogue = useMemo(() => emptyDialogue(), []);
  const [dialogues, setDialogues] = useState<EntryRecord[]>([]);
  const [packet, setPacket] = useState<DialoguePacket>({ dialogue: initialDialogue, nodes: [], requirements: [], flags: [], factions: [], context: EMPTY_CONTEXT });
  const [original, setOriginal] = useState<DialoguePacket | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<{ nodeId: string; index: number } | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [lens, setLens] = useState<Lens>("choices");
  const [tab, setTab] = useState<InspectorTab>("edit");
  const [pendingSource, setPendingSource] = useState("");
  const [deletions, setDeletions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dirtySource = useRef(`dialogue-flow-${id || "index"}`);
  const { setDirty } = useDirtyState();

  const currentId = text(packet.dialogue.id);
  const nodes = packet.nodes;
  const activeNodes = useMemo(() => nodes.filter((node) => !deletions.includes(text(node.id))), [deletions, nodes]);
  const selectedNode = nodes.find((node) => text(node.id) === selectedNodeId);
  const selectedChoiceRow = selectedChoice ? rows(nodes.find((node) => text(node.id) === selectedChoice.nodeId)?.choices)[selectedChoice.index] : undefined;
  const health = useMemo(() => analyze(activeNodes), [activeNodes]);
  const brokenDeletionLinks = nodes.some((node) => !deletions.includes(text(node.id)) && rows(node.choices).some((choice) => deletions.includes(text(choice.next_node_id))));
  const invalidNodes = activeNodes.some((node) => !text(node.id) || !text(node.slug) || !text(node.dialogue_id) || !text(node.speaker) || !text(node.text));
  const invalidChoices = activeNodes.some((node) => rows(node.choices).some((choice) => !text(choice.next_node_id) || !activeNodes.some((target) => text(target.id) === text(choice.next_node_id))));
  const saveBlocked = brokenDeletionLinks || invalidNodes || invalidChoices || !text(packet.dialogue.title) || !text(packet.dialogue.slug);
  const serialized = stable({ dialogue: packet.dialogue, nodes, deletions });
  const originalSerialized = stable(original ? { dialogue: original.dialogue, nodes: original.nodes, deletions: [] } : null);
  const dirty = Boolean(original) && serialized !== originalSerialized;

  useEffect(() => {
    const source = dirtySource.current;
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDeletions([]);
    setNotice("");
    setSelectedChoice(null);
    setPendingSource("");
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
    ]).then(([allDialogues, loaded, requirements, flags, factions]) => {
      if (cancelled) return;
      setDialogues(Array.isArray(allDialogues) ? allDialogues.filter(isRecord) : []);
      let base: DialoguePacket = loaded && isRecord(loaded)
        ? loaded as unknown as DialoguePacket
        : { dialogue: initialDialogue, nodes: [], requirements: Array.isArray(requirements) ? requirements.filter(isRecord) : [], flags: Array.isArray(flags) ? flags.filter(isRecord) : [], factions: Array.isArray(factions) ? factions.filter(isRecord) : [], context: EMPTY_CONTEXT };
      if (isNew) {
        const draftId = localStorage.getItem(NEW_DRAFT_POINTER);
        if (draftId) base = { ...base, dialogue: { ...base.dialogue, id: draftId } };
      }
      const savedDraft = localStorage.getItem(draftKey(text(base.dialogue.id)));
      let restored = base;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (isRecord(parsed) && isRecord(parsed.dialogue) && Array.isArray(parsed.nodes)) {
            restored = { ...base, dialogue: parsed.dialogue, nodes: parsed.nodes.filter(isRecord) };
            setDeletions(Array.isArray(parsed.deletions) ? parsed.deletions.map(String) : []);
            setNotice("Restored unsaved dialogue flow draft.");
          }
        } catch { /* Ignore malformed local draft. */ }
      }
      setPacket(restored);
      setOriginal(base);
      const stored = readPositions(text(base.dialogue.id));
      setPositions({ ...autoLayout(restored.nodes), ...stored });
      setSelectedNodeId(text(restored.nodes[0]?.id));
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Dialogue Flow failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, initialDialogue, isNew]);

  useEffect(() => {
    if (!original || !currentId || !dirty) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(draftKey(currentId), JSON.stringify({ dialogue: packet.dialogue, nodes, deletions, ts: Date.now() }));
      if (isNew) localStorage.setItem(NEW_DRAFT_POINTER, currentId);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [currentId, deletions, dirty, isNew, nodes, original, packet.dialogue]);

  const updateDialogue = (patch: EntryRecord) => setPacket((current) => ({ ...current, dialogue: { ...current.dialogue, ...patch } }));
  const updateNode = (nodeId: string, patch: EntryRecord) => setPacket((current) => ({ ...current, nodes: current.nodes.map((node) => text(node.id) === nodeId ? { ...node, ...patch } : node) }));
  const updateChoice = (nodeId: string, index: number, patch: EntryRecord) => {
    const node = nodes.find((entry) => text(entry.id) === nodeId);
    const next = rows(node?.choices).map((choice, choiceIndex) => choiceIndex === index ? { ...choice, ...patch } : choice);
    updateNode(nodeId, { choices: next });
  };
  const removeChoice = (nodeId: string, index: number) => {
    const node = nodes.find((entry) => text(entry.id) === nodeId);
    updateNode(nodeId, { choices: rows(node?.choices).filter((_, choiceIndex) => choiceIndex !== index) });
    setSelectedChoice(null);
  };

  const addNodeAt = (position: Position) => {
    const node = emptyNode(currentId, nodes.length + 1);
    setPacket((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setPositions((current) => ({ ...current, [text(node.id)]: position }));
    setSelectedNodeId(text(node.id));
    setMode("select");
  };

  const connectTo = (targetId: string) => {
    if (!pendingSource) { setPendingSource(targetId); return; }
    if (pendingSource === targetId) return;
    const source = nodes.find((node) => text(node.id) === pendingSource);
    updateNode(pendingSource, { choices: [...rows(source?.choices), { choice_text: "", next_node_id: targetId, set_flags: [] }] });
    setSelectedChoice({ nodeId: pendingSource, index: rows(source?.choices).length });
    setPendingSource("");
    setMode("select");
  };

  const deleteNode = (node: EntryRecord) => {
    const nodeId = text(node.id);
    if (node.__new) {
      setPacket((current) => ({ ...current, nodes: current.nodes.filter((entry) => text(entry.id) !== nodeId) }));
      setSelectedNodeId("");
      setSelectedChoice(null);
    } else {
      setDeletions((current) => [...new Set([...current, nodeId])]);
    }
  };

  const save = async () => {
    setSaving(true);
    setNotice("");
    try {
      const cleanNodes = nodes.filter((node) => !deletions.includes(text(node.id))).map((node) => Object.fromEntries(Object.entries(node).filter(([key]) => key !== "__new")));
      const response = await apiFetch("/api/ui/dialogues/bundle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue: packet.dialogue, nodes: cleanNodes, deletions: { nodes: deletions } }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body)) throw new Error(formatApiError(body, "Dialogue bundle failed to save."));
      const saved = body as unknown as DialoguePacket;
      setPacket(saved);
      setOriginal(saved);
      setDeletions([]);
      localStorage.removeItem(draftKey(currentId));
      localStorage.removeItem(NEW_DRAFT_POINTER);
      localStorage.setItem(layoutKey(currentId), JSON.stringify(positions));
      setNotice("Dialogue flow saved.");
      if (isNew) navigate(`/author/dialogues/${encodeURIComponent(text(saved.dialogue.id))}`, { replace: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Dialogue save failed.");
    } finally {
      setSaving(false);
    }
  };

  const boardPosition = (clientX: number, clientY: number): Position => {
    const rect = boardRef.current?.getBoundingClientRect();
    return { x: Math.max(20, clientX - (rect?.left || 0) + (boardRef.current?.scrollLeft || 0)), y: Math.max(20, clientY - (rect?.top || 0) + (boardRef.current?.scrollTop || 0)) };
  };
  const boardDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (mode !== "sketch") return;
    addNodeAt(boardPosition(event.clientX, event.clientY));
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = boardPosition(event.clientX, event.clientY);
    setPositions((current) => ({ ...current, [drag.id]: { x: point.x - drag.dx, y: point.y - drag.dy } }));
  };
  const finishDrag = () => {
    if (drag) localStorage.setItem(layoutKey(currentId), JSON.stringify(positions));
    setDrag(null);
  };
  const reset = () => {
    if (!original) return;
    setPacket(original);
    setDeletions([]);
    setSelectedChoice(null);
    setSelectedNodeId(text(original.nodes[0]?.id));
    localStorage.removeItem(draftKey(currentId));
    if (isNew) localStorage.removeItem(NEW_DRAFT_POINTER);
    setNotice("Unsaved dialogue flow changes discarded.");
  };

  if (loading) return <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Loading Dialogue Flow Room...</div>;

  return (
    <div className="min-h-full bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs font-semibold uppercase text-slate-500">Dialogue Flow Room</div><h1 className="text-2xl font-semibold">{label(packet.dialogue)}</h1><div className="mt-1 text-xs text-slate-500">{nodes.length} nodes / {health.issues.length} health notices / {dirty ? "Unsaved" : "Saved"}</div></div>
            <div className="flex flex-wrap gap-2"><Link className={inactiveButton} to="/dialogues">Generic Dialogues</Link><Link className={inactiveButton} to="/dialogue-nodes">Generic Nodes</Link><button className={inactiveButton} disabled={!dirty || saving} onClick={reset}>Reset</button><button className={activeButton} disabled={saving || saveBlocked} onClick={() => void save()}>{saving ? "Saving..." : "Save Flow"}</button></div>
          </div>
          {notice && <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950">{notice}</div>}
          {brokenDeletionLinks && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950">Remove incoming choices targeting deleted nodes before saving.</div>}
          {!brokenDeletionLinks && (invalidNodes || invalidChoices) && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950">Complete required node fields and repair missing choice targets before saving.</div>}
        </header>

        <div className="grid gap-4 xl:grid-cols-[250px_minmax(650px,1fr)_390px]">
          <Panel title="Dialogues">
            <Link className={`${activeButton} mb-3 block text-center`} to="/author/dialogues/new">New Dialogue</Link>
            <div className="max-h-[760px] space-y-1 overflow-y-auto">{dialogues.map((dialogue) => <Link key={text(dialogue.id)} to={`/author/dialogues/${encodeURIComponent(text(dialogue.id))}`} className={`block rounded border px-3 py-2 text-sm ${text(dialogue.id) === currentId ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-slate-200 dark:border-slate-800"}`}>{label(dialogue)}</Link>)}</div>
          </Panel>

          <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-wrap justify-between gap-2"><div className="flex gap-2">{(["select", "sketch", "connect", "move"] as CanvasMode[]).map((item) => <button key={item} className={mode === item ? activeButton : inactiveButton} onClick={() => { setMode(item); setPendingSource(""); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div><button className={inactiveButton} onClick={() => { const next = autoLayout(nodes); setPositions(next); localStorage.setItem(layoutKey(currentId), JSON.stringify(next)); }}>Auto Layout</button></div>
              <div className="mt-2 flex flex-wrap gap-2">{(["choices", "consequences", "locks", "speakers", "reachability"] as Lens[]).map((item) => <button key={item} className={lens === item ? activeButton : inactiveButton} onClick={() => setLens(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
              <div className="mt-2 text-xs text-slate-500">{mode === "sketch" ? "Double-click empty canvas space." : mode === "connect" ? pendingSource ? "Select a target node." : "Select a source node." : mode === "move" ? "Drag nodes to arrange the conversation." : "Select a node or connection."}</div>
            </div>
            <div ref={boardRef} data-testid="dialogue-canvas" className="relative h-[760px] overflow-auto bg-slate-50 dark:bg-slate-950" onDoubleClick={boardDoubleClick} onPointerMove={pointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
              <div className="absolute left-0 top-0 h-[1600px] w-[2400px] bg-[linear-gradient(90deg,rgba(148,163,184,.16)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.16)_1px,transparent_1px)] bg-[size:40px_40px]" />
              <svg className="pointer-events-none absolute left-0 top-0 h-[1600px] w-[2400px]">
                <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-slate-500" /></marker></defs>
                {nodes.flatMap((node) => rows(node.choices).map((choice, index) => {
                  const from = positions[text(node.id)] || { x: 50, y: 50 };
                  const to = positions[text(choice.next_node_id)];
                  if (!to) return null;
                  const selected = selectedChoice?.nodeId === text(node.id) && selectedChoice.index === index;
                  return <g key={`${text(node.id)}-${index}`} className="pointer-events-auto cursor-pointer" onClick={() => { setSelectedChoice({ nodeId: text(node.id), index }); setSelectedNodeId(""); setTab("edit"); }}><line x1={from.x + 210} y1={from.y + 55} x2={to.x} y2={to.y + 55} strokeWidth={selected ? 4 : 2} className={text(choice.requirements_id) ? "stroke-amber-500" : strings(choice.set_flags).length ? "stroke-violet-500" : "stroke-slate-500"} strokeDasharray={!text(choice.choice_text) ? "6 4" : undefined} markerEnd="url(#arrow)" /><text x={(from.x + 210 + to.x) / 2} y={(from.y + to.y) / 2 + 45} className="fill-slate-600 text-[11px] dark:fill-slate-300">{text(choice.choice_text, "continue")}</text></g>;
                }))}
              </svg>
              {nodes.map((node) => {
                const nodeId = text(node.id);
                const position = positions[nodeId] || { x: 50, y: 50 };
                const issue = lens === "reachability" && health.unreachable.has(nodeId);
                const locked = Boolean(text(node.requirements_id));
                const consequential = strings(node.set_flags).length > 0 || rows(node.choices).some((choice) => strings(choice.set_flags).length > 0);
                const speakerHue = [...text(node.speaker)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
                const queued = deletions.includes(nodeId);
                return <button key={nodeId} data-testid={`dialogue-node-${nodeId}`} type="button" className={`absolute w-[210px] rounded-md border p-3 text-left shadow ${queued ? "border-red-500 bg-red-50 opacity-60 line-through dark:bg-red-950" : selectedNodeId === nodeId || pendingSource === nodeId ? "border-blue-600 ring-2 ring-blue-300" : issue ? "border-red-500 bg-red-50 dark:bg-red-950" : locked && lens === "locks" ? "border-amber-500 bg-amber-50 dark:bg-amber-950" : consequential && lens === "consequences" ? "border-violet-500 bg-violet-50 dark:bg-violet-950" : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"}`} style={{ left: position.x, top: position.y, borderLeftColor: lens === "speakers" ? `hsl(${speakerHue} 70% 50%)` : undefined, borderLeftWidth: lens === "speakers" ? 6 : undefined }} onClick={() => { if (mode === "connect") connectTo(nodeId); else { setSelectedNodeId(nodeId); setSelectedChoice(null); setTab("edit"); } }} onPointerDown={(event) => { if (mode !== "move") return; const point = boardPosition(event.clientX, event.clientY); setDrag({ id: nodeId, dx: point.x - position.x, dy: point.y - position.y }); event.currentTarget.setPointerCapture(event.pointerId); }}><div className="text-[10px] font-semibold uppercase text-slate-500">{text(node.speaker, "No speaker")}</div><div className="mt-1 line-clamp-3 text-sm">{text(node.text, "Empty line")}</div><div className="mt-2 flex gap-1 text-[10px] text-slate-500"><span>{rows(node.choices).length} choices</span>{queued && <span>Delete on save</span>}{locked && <span>Locked</span>}{strings(node.set_flags).length > 0 && <span>{strings(node.set_flags).length} flags</span>}</div></button>;
              })}
            </div>
          </section>

          <Panel title="Inspector">
            <div className="mb-3 flex flex-wrap gap-1">{(["edit", "health", "play", "context"] as InspectorTab[]).map((item) => <button key={item} className={tab === item ? activeButton : inactiveButton} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
            {tab === "edit" && selectedChoice && selectedChoiceRow ? <ChoiceEditor choice={selectedChoiceRow} nodes={nodes} deletions={deletions} canMoveUp={selectedChoice.index > 0} canMoveDown={selectedChoice.index < rows(nodes.find((node) => text(node.id) === selectedChoice.nodeId)?.choices).length - 1} onChange={(patch) => updateChoice(selectedChoice.nodeId, selectedChoice.index, patch)} onMove={(direction) => { const node = nodes.find((entry) => text(entry.id) === selectedChoice.nodeId); const choices = rows(node?.choices); const target = selectedChoice.index + direction; const next = [...choices]; [next[selectedChoice.index], next[target]] = [next[target], next[selectedChoice.index]]; updateNode(selectedChoice.nodeId, { choices: next }); setSelectedChoice({ nodeId: selectedChoice.nodeId, index: target }); }} onRemove={() => removeChoice(selectedChoice.nodeId, selectedChoice.index)} />
              : tab === "edit" && selectedNode ? <NodeEditor node={selectedNode} queuedForDeletion={deletions.includes(text(selectedNode.id))} onChange={(patch) => updateNode(text(selectedNode.id), patch)} onDelete={() => deleteNode(selectedNode)} onUndoDelete={() => setDeletions((current) => current.filter((nodeId) => nodeId !== text(selectedNode.id)))} onSetStart={() => { localStorage.setItem(startKey(currentId), text(selectedNode.id)); setNotice("Local playthrough start updated."); }} />
                : tab === "edit" ? <DialogueEditor dialogue={packet.dialogue} onChange={updateDialogue} /> : null}
            {tab === "health" && <HealthPanel health={health} nodes={activeNodes} onSelect={setSelectedNodeId} />}
            {tab === "play" && <PlayThrough key={currentId} packet={{ ...packet, nodes: activeNodes }} health={health} />}
            {tab === "context" && <ContextPanel packet={packet} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-3 text-sm font-semibold">{title}</h2>{children}</section>;
}

function DialogueEditor({ dialogue, onChange }: { dialogue: EntryRecord; onChange: (patch: EntryRecord) => void }) {
  return <div className="space-y-3"><Field label="Title" value={dialogue.title} onChange={(title) => onChange({ title, slug: text(dialogue.slug) ? dialogue.slug : generateSlug(title) })} /><Field label="Slug" value={dialogue.slug} onChange={(slug) => onChange({ slug })} /><Field label="Description" value={dialogue.description} textarea onChange={(description) => onChange({ description })} /><ReferenceChipPicker label="Character" value={dialogue.character_id} reference="characters" onChange={(character_id) => onChange({ character_id })} /><ReferenceChipPicker label="Location" value={dialogue.location_id} reference="locations" onChange={(location_id) => onChange({ location_id })} /><ReferenceChipPicker label="Requirement" value={dialogue.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} /><EditableTagList tags={dialogue.tags} onChange={(tags) => onChange({ tags })} /></div>;
}

function NodeEditor({ node, queuedForDeletion, onChange, onDelete, onUndoDelete, onSetStart }: { node: EntryRecord; queuedForDeletion: boolean; onChange: (patch: EntryRecord) => void; onDelete: () => void; onUndoDelete: () => void; onSetStart: () => void }) {
  return <div className="space-y-3"><Field label="Speaker" value={node.speaker} onChange={(speaker) => onChange({ speaker })} /><Field label="Slug" value={node.slug} onChange={(slug) => onChange({ slug })} /><Field label="Dialogue Text" value={node.text} textarea onChange={(value) => onChange({ text: value })} /><ReferenceChipPicker label="Requirement" value={node.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} /><FlagPicker value={node.set_flags} onChange={(set_flags) => onChange({ set_flags })} /><EditableTagList tags={node.tags} onChange={(tags) => onChange({ tags })} /><button className={inactiveButton} onClick={onSetStart}>Use As Local Start</button>{queuedForDeletion ? <button className={inactiveButton} onClick={onUndoDelete}>Undo Node Deletion</button> : <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={onDelete}>{node.__new ? "Discard Node" : "Delete Node On Save"}</button>}</div>;
}

function ChoiceEditor({ choice, nodes, deletions, canMoveUp, canMoveDown, onChange, onMove, onRemove }: { choice: EntryRecord; nodes: EntryRecord[]; deletions: string[]; canMoveUp: boolean; canMoveDown: boolean; onChange: (patch: EntryRecord) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  return <div className="space-y-3"><Field label="Choice Text (blank = auto continue)" value={choice.choice_text} onChange={(choice_text) => onChange({ choice_text })} /><label className="block text-xs font-semibold uppercase text-slate-500">Target<select className={`${inputClass} mt-1`} value={text(choice.next_node_id)} onChange={(event) => onChange({ next_node_id: event.target.value })}>{nodes.map((node) => <option key={text(node.id)} value={text(node.id)} disabled={deletions.includes(text(node.id))}>{label(node)}{deletions.includes(text(node.id)) ? " (delete on save)" : ""}</option>)}</select></label><ReferenceChipPicker label="Requirement" value={choice.requirements_id} reference="requirements" onChange={(requirements_id) => onChange({ requirements_id })} /><FlagPicker value={choice.set_flags} onChange={(set_flags) => onChange({ set_flags })} /><div className="flex gap-2"><button className={inactiveButton} disabled={!canMoveUp} onClick={() => onMove(-1)}>Move Up</button><button className={inactiveButton} disabled={!canMoveDown} onClick={() => onMove(1)}>Move Down</button></div><button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={onRemove}>Remove Choice</button></div>;
}

function FlagPicker({ value, onChange }: { value: unknown; onChange: (flags: string[]) => void }) {
  const [options, setOptions] = useState<EntryRecord[]>([]);
  useEffect(() => { void apiFetch("/api/flags").then((response) => response.json()).then((body) => setOptions(Array.isArray(body) ? body.filter(isRecord) : [])).catch(() => setOptions([])); }, []);
  const current = strings(value);
  return <label className="block text-xs font-semibold uppercase text-slate-500">Flags Set<select multiple className={`${inputClass} mt-1 min-h-28`} value={current} onChange={(event) => onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>{options.map((flag) => <option key={text(flag.id)} value={text(flag.id)}>{label(flag)}</option>)}</select></label>;
}

function Field({ label: fieldLabel, value, textarea, onChange }: { label: string; value: unknown; textarea?: boolean; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold uppercase text-slate-500">{fieldLabel}{textarea ? <textarea className={`${inputClass} mt-1 min-h-28 normal-case`} value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} /> : <input className={`${inputClass} mt-1 normal-case`} value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function HealthPanel({ health, nodes, onSelect }: { health: HealthResult; nodes: EntryRecord[]; onSelect: (id: string) => void }) {
  return <div className="space-y-2">{health.issues.length === 0 ? <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">No dialogue graph issues found.</div> : health.issues.map((issue) => <div key={issue} className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950">{issue}</div>)}<div className="pt-3 text-xs font-semibold uppercase text-slate-500">Nodes</div>{nodes.map((node) => <button key={text(node.id)} className="block w-full rounded border border-slate-200 p-2 text-left text-sm dark:border-slate-800" onClick={() => onSelect(text(node.id))}>{label(node)}</button>)}</div>;
}

function PlayThrough({ packet, health }: { packet: DialoguePacket; health: HealthResult }) {
  const localStart = localStorage.getItem(startKey(text(packet.dialogue.id))) || "";
  const start = packet.nodes.some((node) => text(node.id) === localStart) ? localStart : health.roots.length === 1 ? health.roots[0] : "";
  const defaultFlags = packet.flags.filter((flag) => Boolean(flag.default_value)).map((flag) => text(flag.id));
  const [currentId, setCurrentId] = useState(start);
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set(defaultFlags));
  const [reputation, setReputation] = useState<Record<string, number>>({});
  const current = packet.nodes.find((node) => text(node.id) === currentId);
  const dialogueGate = requirementState(packet.dialogue.requirements_id, packet.requirements, activeFlags, reputation);
  const nodeGate = requirementState(current?.requirements_id, packet.requirements, activeFlags, reputation);
  const restart = () => { setCurrentId(start); setActiveFlags(new Set(defaultFlags)); setReputation({}); };
  useEffect(() => {
    if (!current || !dialogueGate.available || !nodeGate.available) return;
    setActiveFlags((flags) => {
      const next = new Set([...flags, ...strings(current.set_flags)]);
      return next.size === flags.size ? flags : next;
    });
  }, [current, dialogueGate.available, nodeGate.available]);
  if (!start) return <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Choose a local start node or create one unique root before playthrough.</div>;
  return <div className="space-y-3"><div className="flex gap-2"><button className={inactiveButton} onClick={restart}>Restart</button></div><details className="rounded border border-slate-200 p-2 dark:border-slate-800"><summary className="cursor-pointer text-sm font-semibold">Temporary Player State</summary><div className="mt-2 space-y-2"><FlagPicker value={[...activeFlags]} onChange={(flags) => setActiveFlags(new Set(flags))} />{packet.factions.map((faction) => <label key={text(faction.id)} className="block text-xs">{label(faction)}<input className={inputClass} type="number" value={reputation[text(faction.id)] || 0} onChange={(event) => setReputation((currentRep) => ({ ...currentRep, [text(faction.id)]: Number(event.target.value) }))} /></label>)}</div></details>{!dialogueGate.available && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Dialogue locked: {dialogueGate.reason}</div>}{current && dialogueGate.available && <div className="rounded border border-slate-300 p-3 dark:border-slate-700"><div className="text-xs font-semibold uppercase text-slate-500">{text(current.speaker)}</div>{!nodeGate.available ? <div className="mt-2 text-sm text-amber-700">Node locked: {nodeGate.reason}</div> : <><div className="mt-2 whitespace-pre-wrap text-sm">{text(current.text)}</div><div className="mt-4 space-y-2">{rows(current.choices).map((choice, index) => { const state = requirementState(choice.requirements_id, packet.requirements, activeFlags, reputation); return <button key={index} disabled={!state.available} title={state.reason} className={`block w-full rounded border p-2 text-left text-sm ${state.available ? "border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950" : "border-slate-200 opacity-50 dark:border-slate-800"}`} onClick={() => { setActiveFlags((flags) => new Set([...flags, ...strings(choice.set_flags)])); setCurrentId(text(choice.next_node_id)); }}>{text(choice.choice_text, "Continue")}{!state.available && <span className="block text-xs">{state.reason}</span>}</button>; })}{rows(current.choices).length === 0 && <div className="text-sm text-slate-500">End of conversation.</div>}</div></>}</div>}</div>;
}

function ContextPanel({ packet }: { packet: DialoguePacket }) {
  const groups = [{ title: "Interaction Profiles", entries: packet.context.interaction_profiles, path: "interaction-profiles" }, { title: "Events", entries: packet.context.events, path: "events" }, { title: "POIs", entries: packet.context.pois, path: "location-pois" }];
  return <div className="space-y-4">{packet.context.character && <div className="text-sm">Character: <Link className="text-blue-700" to={`/author/characters/${encodeURIComponent(text(packet.context.character.id))}`}>{label(packet.context.character)}</Link></div>}{packet.context.location && <div className="text-sm">Location: <Link className="text-blue-700" to={`/author/locations/${encodeURIComponent(text(packet.context.location.id))}`}>{label(packet.context.location)}</Link></div>}{groups.map((group) => <div key={group.title}><div className="text-xs font-semibold uppercase text-slate-500">{group.title}</div>{group.entries.map((entry) => <Link key={text(entry.id)} className="mt-1 block rounded border border-slate-200 p-2 text-sm text-blue-700 dark:border-slate-800" to={`/${group.path}?selected=${encodeURIComponent(text(entry.id))}`}>{label(entry)}</Link>)}{group.entries.length === 0 && <div className="mt-1 text-sm text-slate-500">None.</div>}</div>)}</div>;
}
