import type { LocationId } from "./content";

export type MechanicKind = "circle" | "line" | "raidwide" | "cleave";

export function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
  return Math.hypot(point.x - (start.x + vx * t), point.y - (start.y + vy * t));
}

export function mechanicSequence(location: LocationId): { name: string; kind: MechanicKind; duration: number; radius: number; width: number; damage: number }[] {
  if (location === "forest") return [
    { name: "Bristle Charge", kind: "line", duration: 1.8, radius: 0, width: 60, damage: 24 },
    { name: "Rootbreak", kind: "circle", duration: 2.2, radius: 82, width: 0, damage: 20 },
  ];
  if (location === "swamp") return [
    { name: "Mire Eruption", kind: "circle", duration: 2.25, radius: 96, width: 0, damage: 27 },
    { name: "Drowning Wake", kind: "line", duration: 2.0, radius: 0, width: 78, damage: 30 },
    { name: "Fen Sickness", kind: "raidwide", duration: 2.7, radius: 0, width: 0, damage: 19 },
  ];
  return [
    { name: "Shanoir Lance", kind: "line", duration: 2.15, radius: 0, width: 72, damage: 34 },
    { name: "Broken Promise", kind: "circle", duration: 2.55, radius: 112, width: 0, damage: 38 },
    { name: "Warden's Refrain", kind: "raidwide", duration: 3.0, radius: 0, width: 0, damage: 25 },
    { name: "Gate Sweep", kind: "cleave", duration: 1.85, radius: 122, width: 0, damage: 31 },
  ];
}
