// LIVE SCORE · MIDI — 건반 연결(Web MIDI), MIDI 파일 읽기·쓰기
import { BAR } from './core.js';

// ── 건반 연결 ──
export const midiState = { supported: !!navigator.requestMIDIAccess, access: null, inputs: [], error: null };
const listeners = new Set();
export function onMidi(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const statusFns = new Set();
export function onMidiStatus(fn) { statusFns.add(fn); }
function emitStatus() { statusFns.forEach(f => f(midiState)); }

export async function connectMidi() {
  if (!midiState.supported) { midiState.error = 'unsupported'; emitStatus(); return midiState; }
  try {
    const acc = await navigator.requestMIDIAccess({ sysex: false });
    midiState.access = acc; midiState.error = null;
    const bind = () => {
      midiState.inputs = [...acc.inputs.values()].filter(i => i.state !== 'disconnected');
      midiState.inputs.forEach(inp => { inp.onmidimessage = handle; });
      emitStatus();
    };
    acc.onstatechange = bind;
    bind();
  } catch (e) {
    midiState.error = e && e.name === 'SecurityError' ? 'denied' : 'failed';
    emitStatus();
  }
  return midiState;
}
function handle(ev) {
  const [st, a, b] = ev.data;
  const type = st & 0xf0;
  let msg = null;
  if (type === 0x90 && b > 0) msg = { on: true, p: a, v: b };
  else if (type === 0x80 || (type === 0x90 && b === 0)) msg = { on: false, p: a, v: 0 };
  if (msg) { msg.time = ev.timeStamp; listeners.forEach(f => f(msg)); }
}
// 화면 건반·테스트에서 같은 길로 보내기
export function injectMidi(msg) { msg.time = msg.time ?? performance.now(); listeners.forEach(f => f(msg)); }

// ── MIDI 파일 읽기 ──
export function parseMidi(buf) {
  const d = new DataView(buf);
  let o = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(o + i)); o += n; return s; };
  const u32 = () => { const v = d.getUint32(o); o += 4; return v; };
  const u16 = () => { const v = d.getUint16(o); o += 2; return v; };
  if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아닙니다');
  const hl = u32(); const fmt = u16(); const ntr = u16(); const div = u16(); o += hl - 6;
  if (div & 0x8000) throw new Error('SMPTE 시간 형식은 지원하지 않습니다');
  const tracks = []; const tempos = [];
  for (let t = 0; t < ntr && o < d.byteLength; t++) {
    if (str(4) !== 'MTrk') break;
    const len = u32(); const end = o + len;
    let tick = 0, run = 0, name = '';
    const on = new Map(); const notes = []; let chan = 0, program = null;
    const vlq = () => { let v = 0, b; do { b = d.getUint8(o++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (o < end) {
      tick += vlq();
      let st = d.getUint8(o);
      if (st & 0x80) { o++; run = st; } else st = run;
      const type = st & 0xf0;
      if (st === 0xff) {
        const mt = d.getUint8(o++); const ml = vlq();
        if (mt === 0x51) tempos.push({ tick, us: (d.getUint8(o) << 16) | (d.getUint8(o + 1) << 8) | d.getUint8(o + 2) });
        if (mt === 0x03) { name = new TextDecoder().decode(new Uint8Array(buf, o, ml)); }
        o += ml;
      } else if (st === 0xf0 || st === 0xf7) { o += vlq(); }
      else if (type === 0x90 || type === 0x80) {
        const p = d.getUint8(o++), v = d.getUint8(o++); chan = st & 15;
        const key = (st & 15) * 128 + p;
        if (type === 0x90 && v > 0) { if (!on.has(key)) on.set(key, []); on.get(key).push({ tick, v }); }
        else { const q = on.get(key); if (q && q.length) { const s = q.shift(); notes.push({ p, v: s.v, t0: s.tick, t1: tick, ch: st & 15 }); } }
      } else if (type === 0xc0) { program = d.getUint8(o++); }
      else if (type === 0xd0) o += 1;
      else o += 2;
    }
    o = end;
    if (notes.length) tracks.push({ name, notes, ch: chan, program });
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  const secOf = tick => { // 템포 지도
    let s = 0, last = tempos[0];
    for (let i = 1; i < tempos.length && tempos[i].tick <= tick; i++) { s += (tempos[i].tick - last.tick) / div * last.us / 1e6; last = tempos[i]; }
    return s + (tick - last.tick) / div * last.us / 1e6;
  };
  tracks.forEach(tr => tr.notes.forEach(n => { n.t = secOf(n.t0); n.d = Math.max(.02, secOf(n.t1) - n.t); }));
  return { format: fmt, div, tempo: Math.round(60e6 / tempos[0].us), tracks };
}

// 파일 하나(수노 스템 하나)의 음들 → 박 단위 음표(16분음표)
export function stemToNotes(notes, bpm, offsetSec, grid, fromBar, bars, mono) {
  const beat = 60 / bpm;
  const lo = fromBar * BAR, hi = (fromBar + bars) * BAR;
  let out = notes.map(n => {
    const s = Math.round(((n.t - offsetSec) / beat * 4) / grid) * grid;
    let e = Math.round(((n.t + n.d - offsetSec) / beat * 4) / grid) * grid;
    if (e <= s) e = s + grid;
    return { p: n.p, v: n.v, s, d: e - s, ch: n.ch };
  }).filter(n => n.s >= lo && n.s < hi).map(n => ({ ...n, s: n.s - lo, d: Math.min(n.d, hi - n.s) }));
  if (mono) {
    out.sort((a, b) => a.s - b.s || b.d - a.d || b.p - a.p);
    const m = [];
    for (const n of out) { if (m.length && m[m.length - 1].s === n.s) continue; m.push(n); }
    for (let i = 0; i < m.length - 1; i++) if (m[i].s + m[i].d > m[i + 1].s) m[i].d = m[i + 1].s - m[i].s;
    out = m.filter(n => n.d > 0);
  } else {
    const by = new Map();
    out.forEach(n => { const k = n.s; if (!by.has(k)) by.set(k, []); by.get(k).push(n); });
    out = [...by.values()].map(g => { g.sort((a, b) => a.p - b.p); const d = Math.min(...g.map(x => x.d)); return { p: g[0].p, s: g[0].s, d, chord: g.length > 1 ? [...new Set(g.map(x => x.p))] : undefined }; });
    out.sort((a, b) => a.s - b.s);
    for (let i = 0; i < out.length - 1; i++) if (out[i].s + out[i].d > out[i + 1].s) out[i].d = out[i + 1].s - out[i].s;
    out = out.filter(n => n.d > 0);
  }
  return out;
}

// ── MIDI 파일 쓰기 ──
// tracks: [{name, program, channel, notes:[{p,s,d,chord?,kit?}]}]  (16분음표 단위)
export function writeMidi(tracks, tempo, meter = 4) {
  const PPQ = 480, U = PPQ / 4;
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const str = s => [...s].map(c => c.charCodeAt(0));
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const vlq = v => { const a = [v & 0x7f]; while ((v >>= 7)) a.unshift((v & 0x7f) | 0x80); return a; };
  const utf8 = s => [...new TextEncoder().encode(s)];
  push(...str('MThd'), ...u32(6), 0, 1, 0, tracks.length + 1, (PPQ >> 8) & 255, PPQ & 255);
  const tr0 = [];
  const us = Math.round(60e6 / tempo);
  tr0.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  tr0.push(0, 0xff, 0x58, 4, meter, 2, 24, 8);
  tr0.push(0, 0xff, 0x2f, 0);
  push(...str('MTrk'), ...u32(tr0.length), ...tr0);
  const DP = { kick: 36, snare: 38, hat: 42, crash: 49 };
  tracks.forEach((t, i) => {
    const ch = t.channel ?? (i >= 9 ? i + 1 : i);
    const ev = [];
    for (const n of t.notes) {
      if (n.p == null) continue;
      const ps = n.kit ? n.kit.map(k => DP[k] || n.p) : (n.chord || [n.p]);
      const s = n.s * U, e = (n.s + n.d) * U - (t.channel === 9 ? 0 : 8);
      ps.forEach(p => { ev.push([s, 1, 0x90 | ch, p, 90]); ev.push([Math.max(s + 10, e), 0, 0x80 | ch, p, 0]); });
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const data = [];
    const nm = utf8(t.name || 'Track');
    data.push(0, 0xff, 0x03, ...vlq(nm.length), ...nm);
    if (t.program != null && ch !== 9) data.push(0, 0xc0 | ch, t.program);
    let last = 0;
    for (const [tk, , st, p, v] of ev) { data.push(...vlq(tk - last), st, p, v); last = tk; }
    data.push(0, 0xff, 0x2f, 0);
    push(...str('MTrk'), ...u32(data.length), ...data);
  });
  return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
}
