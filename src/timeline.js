import { SCHEDULE, DAY_START, DAY_END } from './config.js';

export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

export const START = toMin(DAY_START);
export const END = toMin(DAY_END);
const SORTED = [...SCHEDULE].sort((a, b) => toMin(a.start) - toMin(b.start));

export function phaseAt(min) {
  let cur = SORTED[0];
  for (const p of SORTED) if (toMin(p.start) <= min) cur = p;
  return cur;
}
export function phaseIndex(phase) { return SORTED.indexOf(phase); }
export function phases() { return SORTED; }
export function nextPhase(min) { return SORTED.find((p) => toMin(p.start) > min); }
export function prevPhaseStart(min) {
  const cur = phaseAt(min);
  const i = SORTED.indexOf(cur);
  // 始まってすぐなら一つ前へ
  if (min - toMin(cur.start) < 1 && i > 0) return toMin(SORTED[i - 1].start);
  return toMin(cur.start);
}

/** 時計（再生・一時停止・速度） */
export class Clock {
  constructor() {
    this.min = START;
    this.playing = false;
    this.speed = 60; // 実時間1秒あたり何秒進むか（60 = 1秒で1分）
    this.listeners = new Set();
  }
  set(min, source = 'local') {
    this.min = Math.max(START, Math.min(END, min));
    for (const f of this.listeners) f(this.min, source);
  }
  tick(dt) {
    if (!this.playing) return;
    const m = this.min + (dt * this.speed) / 60;
    if (m >= END) { this.playing = false; }
    this.set(m, 'tick');
  }
  onChange(f) { this.listeners.add(f); }
}
