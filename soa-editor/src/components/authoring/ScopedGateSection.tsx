import { useEffect, useState } from "react";
import { emptyScopedGatePacket, gateText, type ScopedGatePacket } from "../../authoring/scopedGate";
import { apiFetch } from "../../lib/api";
import { formatApiError } from "../../lib/apiErrors";
import type { EntryRecord } from "../../types/editorQol";
import { StatusNotice } from "../authoringUi";
import ScopedGateBuilder from "./ScopedGateBuilder";

interface ScopedGateSectionProps {
  targetSchema: string;
  targetId: string;
  targetLabel: string;
  requirementId?: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  onRequirementCommitted?: (requirementId: string) => void;
}

export default function ScopedGateSection({
  targetSchema,
  targetId,
  targetLabel,
  requirementId = "",
  title = "Access Gate",
  subtitle = "Create or reuse player-state requirements for this saved record.",
  tag = "scoped-gate",
  onRequirementCommitted,
}: ScopedGateSectionProps) {
  const [packet, setPacket] = useState<ScopedGatePacket>(emptyScopedGatePacket);
  const [draftFlags, setDraftFlags] = useState<EntryRecord[]>([]);
  const [requirementDraft, setRequirementDraft] = useState<EntryRecord | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState(requirementId);
  const [loadError, setLoadError] = useState("");

  useEffect(() => setSelectedRequirementId(requirementId), [requirementId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/ui/scoped-gates").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(formatApiError(body, "Gate catalog failed to load."));
      if (!cancelled) setPacket(body as ScopedGatePacket);
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Gate catalog failed to load.");
    });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <StatusNotice tone="error">{loadError}</StatusNotice>;
  if (!targetId) return <StatusNotice tone="warning">Save this record before creating and attaching an access gate.</StatusNotice>;

  return <ScopedGateBuilder
    packet={packet}
    baseName={targetLabel || targetId}
    draftFlags={draftFlags}
    setDraftFlags={setDraftFlags}
    requirementDraft={requirementDraft}
    setRequirementDraft={setRequirementDraft}
    selectedRequirementId={selectedRequirementId}
    setSelectedRequirementId={setSelectedRequirementId}
    targetSchema={targetSchema}
    setTargetSchema={() => undefined}
    targetId={targetId}
    setTargetId={() => undefined}
    directCommit
    fixedTarget
    title={title}
    subtitle={subtitle}
    tag={tag}
    onPacketChange={setPacket}
    onCommitted={(_, committedRequirementId) => {
      const id = gateText(committedRequirementId);
      setSelectedRequirementId(id);
      onRequirementCommitted?.(id);
    }}
  />;
}
