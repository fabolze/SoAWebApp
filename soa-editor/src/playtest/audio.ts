type AudioNodes = { context: AudioContext; master: GainNode; timer: number; step: number };

let active: AudioNodes | null = null;

const NOTES = [146.83, 196, 220, 164.81, 146.83, 246.94, 220, 196];

function tone(context: AudioContext, output: AudioNode, frequency: number, when: number, duration: number, volume: number, type: OscillatorType) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain).connect(output);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

export async function startMusic(): Promise<void> {
  if (active) {
    await active.context.resume();
    return;
  }
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.12;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1100;
  master.connect(filter).connect(context.destination);
  const nodes: AudioNodes = { context, master, timer: 0, step: 0 };
  const schedule = () => {
    if (!active) return;
    const now = context.currentTime + 0.03;
    const note = NOTES[nodes.step % NOTES.length];
    tone(context, master, note, now, 1.65, 0.17, "triangle");
    if (nodes.step % 2 === 0) tone(context, master, note / 2, now, 2.8, 0.1, "sine");
    if (nodes.step % 4 === 0) tone(context, master, note * 1.5, now + 0.45, 1.1, 0.055, "sine");
    nodes.step += 1;
    nodes.timer = window.setTimeout(schedule, 1500);
  };
  active = nodes;
  await context.resume();
  schedule();
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
