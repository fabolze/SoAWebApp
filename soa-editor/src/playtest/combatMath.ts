import type { LocationId } from "./content";

export type MechanicKind = "circle" | "line" | "raidwide" | "cleave";

export type MechanicSpec = {
  name: string;
  kind: MechanicKind;
  duration: number;
  radius: number;
  width: number;
  damage: number;
  instruction: string;
};

export function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
  return Math.hypot(point.x - (start.x + vx * t), point.y - (start.y + vy * t));
}

export function rayToArenaEdge(
  start: { x: number; y: number },
  toward: { x: number; y: number },
  width: number,
  height: number,
  padding = 0,
) {
  const dx = toward.x - start.x;
  const dy = toward.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { ...start };
  const unitX = dx / length;
  const unitY = dy / length;
  const candidates = [
    unitX > 0 ? (width - padding - start.x) / unitX : unitX < 0 ? (padding - start.x) / unitX : Number.POSITIVE_INFINITY,
    unitY > 0 ? (height - padding - start.y) / unitY : unitY < 0 ? (padding - start.y) / unitY : Number.POSITIVE_INFINITY,
  ].filter((value) => value >= 0);
  const distanceToEdge = Math.min(...candidates);
  return { x: start.x + unitX * distanceToEdge, y: start.y + unitY * distanceToEdge };
}

export function pointInSector(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  directionRadians: number,
  radius: number,
  halfAngleRadians: number,
) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (Math.hypot(dx, dy) > radius) return false;
  const pointAngle = Math.atan2(dy, dx);
  const delta = Math.atan2(Math.sin(pointAngle - directionRadians), Math.cos(pointAngle - directionRadians));
  return Math.abs(delta) <= halfAngleRadians;
}

export function mechanicSequence(location: LocationId): MechanicSpec[] {
  if (location === "forest") return [
    { name: "Wild Charge", kind: "line", duration: 2.1, radius: 0, width: 64, damage: 24, instruction: "Leave the marked charge lane" },
    { name: "Torn Roots", kind: "circle", duration: 2.4, radius: 82, width: 0, damage: 20, instruction: "Move outside the rooted ground" },
  ];
  if (location === "swamp") return [
    { name: "Marsh Eruption", kind: "circle", duration: 2.5, radius: 96, width: 0, damage: 27, instruction: "Clear the unstable pool" },
    { name: "Dark Wake", kind: "line", duration: 2.25, radius: 0, width: 78, damage: 30, instruction: "Step out of the shadow wake" },
    { name: "Shadow Whisper", kind: "raidwide", duration: 3.0, radius: 0, width: 0, damage: 19, instruction: "Unavoidable — ward or restore the party" },
  ];
  return [
    { name: "Rift Lance", kind: "line", duration: 2.4, radius: 0, width: 72, damage: 34, instruction: "Leave the rift lane" },
    { name: "Unstable Eruption", kind: "circle", duration: 2.8, radius: 112, width: 0, damage: 38, instruction: "Clear the marked portal ground" },
    { name: "Shadow Flood", kind: "raidwide", duration: 3.2, radius: 0, width: 0, damage: 25, instruction: "Unavoidable — protect both allies" },
    { name: "Portal Sweep", kind: "cleave", duration: 2.25, radius: 142, width: 0, damage: 31, instruction: "Move behind the Warden" },
  ];
}
