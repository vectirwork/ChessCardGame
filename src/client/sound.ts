// Sons synthétisés avec Web Audio (aucun fichier audio, aucune licence).
import type { CardId } from '../shared/cards';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
try {
  enabled = localStorage.getItem('sm:sound') !== 'false';
} catch {
  // stockage indisponible
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem('sm:sound', String(v));
  } catch {
    // stockage indisponible
  }
}
export const soundEnabled = () => enabled;

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(c: AudioContext, duration: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hit(c: AudioContext, t: number, freq: number, q: number, dur: number, vol: number) {
  const n = noise(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(master!);
  n.start(t);
}

export function playSound(kind: 'move' | 'capture' | 'check' | 'start' | 'end' | 'notify' | 'low' | 'select' | 'error') {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'move':
      hit(c, t, 1800, 1.4, 0.07, 0.9);
      tone(c, 'sine', 220, 140, t, 0.09, 0.35);
      break;
    case 'capture':
      hit(c, t, 1300, 1.2, 0.11, 1.1);
      hit(c, t + 0.035, 2400, 2, 0.06, 0.6);
      tone(c, 'triangle', 180, 90, t, 0.14, 0.4);
      break;
    case 'check':
      tone(c, 'triangle', 880, 860, t, 0.18, 0.25);
      tone(c, 'sine', 1320, 1300, t + 0.06, 0.2, 0.18);
      break;
    case 'start':
      [523, 659, 784].forEach((f, i) => tone(c, 'triangle', f, f, t + i * 0.08, 0.35, 0.18));
      break;
    case 'end':
      [784, 659, 523, 392].forEach((f, i) => tone(c, 'triangle', f, f, t + i * 0.11, 0.5, 0.18));
      break;
    case 'notify':
      tone(c, 'sine', 988, 988, t, 0.15, 0.2);
      tone(c, 'sine', 1319, 1319, t + 0.09, 0.2, 0.18);
      break;
    case 'low':
      tone(c, 'square', 1200, 1200, t, 0.05, 0.06);
      break;
    case 'select':
      tone(c, 'sine', 660, 990, t, 0.12, 0.12);
      break;
    case 'error':
      tone(c, 'sawtooth', 200, 150, t, 0.18, 0.08);
      break;
  }
}

/** Son d'une carte : nappe scintillante puis signature propre à chaque sort. */
export function playCardSound(card: CardId) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  // Montée
  const n = noise(c, 0.9);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(5000, t + 0.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  n.connect(f).connect(g).connect(master!);
  n.start(t);
  [0, 4, 7, 12].forEach((s, i) => tone(c, 'sine', 440 * 2 ** (s / 12), 440 * 2 ** (s / 12), t + 0.12 * i, 0.5, 0.06));
  const at = t + 0.85;
  switch (card) {
    case 'lightning':
      hit(c, at, 900, 0.4, 0.9, 1.6);
      tone(c, 'sawtooth', 90, 40, at, 0.8, 0.35);
      break;
    case 'ice_wall':
    case 'freeze':
      [2093, 2637, 3136, 3951].forEach((fr, i) => tone(c, 'sine', fr, fr, at + i * 0.04, 0.6, 0.08));
      hit(c, at, 5000, 3, 0.4, 0.5);
      break;
    case 'shield':
      [523, 784, 1047].forEach(fr => tone(c, 'triangle', fr, fr, at, 0.9, 0.12));
      break;
    case 'rewind':
      tone(c, 'sawtooth', 1200, 120, t + 0.3, 0.9, 0.1);
      tone(c, 'sine', 900, 90, t + 0.35, 0.9, 0.15);
      break;
    case 'time_warp':
      for (let i = 0; i < 8; i++) tone(c, 'square', 1400, 1400, t + 0.1 + i * (0.14 - i * 0.012), 0.03, 0.05);
      tone(c, 'sine', 300, 1200, at, 0.6, 0.15);
      break;
    case 'gravity':
      tone(c, 'sine', 160, 35, at - 0.2, 1.2, 0.5);
      hit(c, at, 200, 0.6, 0.6, 1);
      break;
    case 'revive':
      [392, 494, 587, 784].forEach((fr, i) => tone(c, 'triangle', fr, fr * 1.01, at + i * 0.07, 0.8, 0.12));
      break;
    default:
      tone(c, 'triangle', 660, 1320, at, 0.4, 0.15);
      hit(c, at, 3000, 2, 0.3, 0.4);
  }
}
