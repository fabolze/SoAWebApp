export type MusicScene = "title" | "intro" | "village" | "wilderness" | "combat" | "ending";
export type SoundEffect = "select" | "confirm" | "travel" | "purchase" | "equip" | "quest" | "attack" | "heal" | "warning" | "victory" | "defeat";

type AudioNodes = { context: AudioContext; master: GainNode; music: GainNode; effects: GainNode; timer: number; step: number; scene: MusicScene };

let active: AudioNodes | null = null;
let preferredScene: MusicScene = "title";

const SCENES: Record<MusicScene, { notes: number[]; interval: number; voice: OscillatorType; drone: number; brightness: number }> = {
  title: { notes: [146.83, 196, 220, 164.81, 146.83, 246.94, 220, 196], interval: 1500, voice: "triangle", drone: 73.42, brightness: 1050 },
  intro: { notes: [130.81, 146.83, 196, 174.61, 146.83, 130.81], interval: 1850, voice: "sine", drone: 65.41, brightness: 820 },
  village: { notes: [196, 246.94, 293.66, 246.94, 220, 196, 164.81, 220], interval: 1320, voice: "triangle", drone: 98, brightness: 1450 },
  wilderness: { notes: [146.83, 174.61, 164.81, 123.47, 146.83, 110], interval: 1680, voice: "sine", drone: 55, brightness: 760 },
  combat: { notes: [110, 146.83, 130.81, 164.81, 110, 174.61, 146.83, 98], interval: 720, voice: "sawtooth", drone: 55, brightness: 1250 },
  ending: { notes: [146.83, 196, 246.94, 293.66, 246.94, 220, 196, 146.83], interval: 1750, voice: "triangle", drone: 73.42, brightness: 1700 },
};

function tone(context: AudioContext, output: AudioNode, frequency: number, when: number, duration: number, volume: number, type: OscillatorType, endFrequency?: number) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + Math.min(0.08, duration * .2));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain).connect(output);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

function scheduleMusic() {
  if (!active) return;
  const nodes = active;
  const spec = SCENES[nodes.scene];
  const now = nodes.context.currentTime + 0.03;
  const note = spec.notes[nodes.step % spec.notes.length];
  const duration = nodes.scene === "combat" ? .68 : Math.min(2.4, spec.interval / 1000 * 1.3);
  tone(nodes.context, nodes.music, note, now, duration, nodes.scene === "combat" ? .045 : .12, spec.voice);
  if (nodes.step % 2 === 0) tone(nodes.context, nodes.music, spec.drone, now, duration * 1.8, nodes.scene === "combat" ? .045 : .075, "sine");
  if (nodes.step % 4 === 0) tone(nodes.context, nodes.music, note * 1.5, now + duration * .35, duration * .65, .035, "sine");
  nodes.step += 1;
  nodes.timer = window.setTimeout(scheduleMusic, spec.interval);
}

export async function startMusic(scene: MusicScene = preferredScene): Promise<void> {
  preferredScene = scene;
  if (active) {
    active.scene = scene;
    active.step = 0;
    await active.context.resume();
    return;
  }
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const master = context.createGain();
  const music = context.createGain();
  const effects = context.createGain();
  const filter = context.createBiquadFilter();
  master.gain.value = 0.12;
  music.gain.value = .72;
  effects.gain.value = .7;
  filter.type = "lowpass";
  filter.frequency.value = SCENES[scene].brightness;
  music.connect(filter).connect(master);
  effects.connect(master);
  master.connect(context.destination);
  active = { context, master, music, effects, timer: 0, step: 0, scene };
  await context.resume();
  scheduleMusic();
}

export function setMusicScene(scene: MusicScene): void {
  preferredScene = scene;
  if (!active || active.scene === scene) return;
  active.scene = scene;
  active.step = 0;
}

export function playSfx(effect: SoundEffect): void {
  if (!active) return;
  const { context, effects } = active;
  const now = context.currentTime + .01;
  const sounds: Record<SoundEffect, () => void> = {
    select: () => tone(context, effects, 360, now, .08, .06, "sine", 480),
    confirm: () => { tone(context, effects, 330, now, .11, .07, "triangle", 440); tone(context, effects, 495, now + .07, .14, .05, "sine"); },
    travel: () => { tone(context, effects, 180, now, .65, .055, "triangle", 420); tone(context, effects, 90, now, .8, .04, "sine", 140); },
    purchase: () => { tone(context, effects, 660, now, .12, .07, "sine"); tone(context, effects, 880, now + .09, .18, .06, "sine"); },
    equip: () => { tone(context, effects, 210, now, .1, .08, "square", 150); tone(context, effects, 510, now + .05, .16, .04, "triangle"); },
    quest: () => { tone(context, effects, 293.66, now, .28, .06, "triangle"); tone(context, effects, 440, now + .18, .35, .055, "triangle"); tone(context, effects, 587.33, now + .35, .45, .045, "sine"); },
    attack: () => { tone(context, effects, 150, now, .09, .07, "sawtooth", 70); tone(context, effects, 480, now, .055, .035, "square", 160); },
    heal: () => { tone(context, effects, 420, now, .22, .05, "sine", 670); tone(context, effects, 630, now + .08, .26, .035, "sine", 840); },
    warning: () => { tone(context, effects, 110, now, .18, .07, "sawtooth"); tone(context, effects, 110, now + .24, .18, .06, "sawtooth"); },
    victory: () => { [0, 4, 7, 12].forEach((semitone, index) => tone(context, effects, 261.63 * 2 ** (semitone / 12), now + index * .13, .45, .055, "triangle")); },
    defeat: () => { tone(context, effects, 196, now, .8, .07, "sawtooth", 73.42); tone(context, effects, 98, now + .2, 1.1, .05, "sine", 49); },
  };
  sounds[effect]();
}

export function stopMusic(): void {
  if (!active) return;
  window.clearTimeout(active.timer);
  void active.context.close();
  active = null;
}

export function setMusicVolume(volume: number): void {
  if (!active) return;
  active.master.gain.setTargetAtTime(Math.max(0, Math.min(0.24, volume)), active.context.currentTime, 0.08);
}
