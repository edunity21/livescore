// LIVE SCORE · MIDI — 건반 연결(Web MIDI), MIDI 파일 읽기·쓰기
import { BAR } from './core.js?v=12';

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
  // 빠르기 지도가 흔들려도(수노 'Fixed tempo'도 박마다 136~140) 악보의 박은 틱 위에 있다.
  // → 곡 전체의 평균 빠르기 하나로 시간을 다시 계산해, 한 가지 빠르기로 박을 맞춰도 밀리지 않게 한다.
  const lastTick = Math.max(1, ...tracks.flatMap(tr => tr.notes.map(n => n.t1)));
  const spt = secOf(lastTick) / lastTick; // 틱 하나의 평균 길이(초)
  tracks.forEach(tr => tr.notes.forEach(n => { n.t = n.t0 * spt; n.d = Math.max(.02, (n.t1 - n.t0) * spt); }));
  const bpm = 60 / (spt * div);
  const steady = new Set(tempos.map(x => x.us)).size <= 1;
  // sec: 틱 → 원곡 시각(빠르기 지도 그대로) — 음원으로 악보 만들기에서 MP3와 맞출 때 쓴다
  return { format: fmt, div, tempo: Math.round(60e6 / tempos[0].us), bpm, steady, tracks, tempos, sec: secOf };
}

// 여러 파일(같은 곡의 스템들)을 한 시간 축에 놓는다: 박(틱÷분해능) × 가장 긴 파일의 평균 빠르기
export function retimeAll(list) {
  if (!list.length) return null;
  const len = m => Math.max(0, ...m.tracks.flatMap(t => t.notes.map(n => n.t1))) / m.div;
  const ref = list.reduce((a, m) => (len(m) > len(a) ? m : a), list[0]);
  const spb = 60 / ref.bpm;
  list.forEach(m => m.tracks.forEach(t => t.notes.forEach(n => { n.t = n.t0 / m.div * spb; n.d = Math.max(.02, (n.t1 - n.t0) / m.div * spb); })));
  return ref.bpm;
}

// ── 수노 스템 파일 정리 ──
// 수노 MIDI는 스템 하나(예: 「곡 (Vocals).mid」)가 구간마다 여러 트랙으로 쪼개져 있다.
// 파일 이름이 「… (스템).mid」 꼴이면 한 파트로 합친다. 우리 플랫폼에서 내보낸 MIDI처럼 이름이 다르면 트랙을 그대로 둔다.
const STEM_RE = /\(([^()]+)\)\s*\.midi?$/i;
const VOCAL_RE = /vocal|voice|vox|lead|melody|보컬|노래/i;
const BACK_RE = /backing|harmony|백보컬|코러스/i;
export const stemName = fileName => { const m = String(fileName).match(STEM_RE); return m ? m[1].trim() : null; };
export function stemTracks(fileName, parsed) {
  const stem = stemName(fileName);
  const tracks = parsed.tracks;
  if (!stem || tracks.length < 2) return tracks.map(t => ({ ...t, merged: 1 }));
  // ① 드럼 채널(10번)과 음높이 악기가 섞였으면 많은 쪽만 (예: Brass 스템 속 드럼 3음)
  const drumN = tracks.filter(t => t.ch === 9).reduce((a, t) => a + t.notes.length, 0);
  const all = tracks.reduce((a, t) => a + t.notes.length, 0);
  let use = drumN && drumN < all ? tracks.filter(t => (t.ch === 9) === (drumN * 2 >= all)) : tracks;
  // ② 노래 스템: 가장 음이 많은 악기(프로그램) 트랙만 — 수노가 잘못 알아들은 스트링·하프 트랙을 뺀다
  if (VOCAL_RE.test(stem) && !BACK_RE.test(stem)) {
    const by = new Map(); use.forEach(t => by.set(t.program, (by.get(t.program) || 0) + t.notes.length));
    const main = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
    use = use.filter(t => t.program === main);
  }
  const notes = use.flatMap(t => t.notes).sort((a, b) => a.t0 - b.t0);
  const prog = new Map(); use.forEach(t => prog.set(t.program, (prog.get(t.program) || 0) + t.notes.length));
  const program = [...prog.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return [{ name: stem, notes, ch: use.some(t => t.ch === 9) ? 9 : (use[0] || {}).ch || 0, program, merged: use.length, dropped: tracks.length - use.length }];
}

// ── 압축 파일(.zip)에서 MIDI 꺼내기 — 수노가 스템 MIDI를 zip 하나로 준다 ──
export async function unzipMidi(file, match = /\.midi?$/i) {
  const buf = await file.arrayBuffer(), d = new DataView(buf), u8 = new Uint8Array(buf);
  // 끝의 '중앙 디렉터리 끝' 기록 찾기
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (d.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip 파일이 아닙니다');
  const count = d.getUint16(e + 10, true);
  let o = d.getUint32(e + 16, true);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (d.getUint32(o, true) !== 0x02014b50) break;
    const flags = d.getUint16(o + 8, true), method = d.getUint16(o + 10, true);
    const csize = d.getUint32(o + 20, true), nlen = d.getUint16(o + 28, true), xlen = d.getUint16(o + 30, true), clen = d.getUint16(o + 32, true);
    const local = d.getUint32(o + 42, true);
    const raw = u8.subarray(o + 46, o + 46 + nlen);
    let name;
    try { name = new TextDecoder('utf-8', { fatal: !(flags & 0x800) ? true : false }).decode(raw); } catch (x) { name = new TextDecoder('euc-kr').decode(raw); }
    o += 46 + nlen + xlen + clen;
    const base = name.split('/').pop();
    if (!match.test(base) || base.startsWith('._')) continue;
    const ln = d.getUint16(local + 26, true), lx = d.getUint16(local + 28, true);
    const data = u8.subarray(local + 30 + ln + lx, local + 30 + ln + lx + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push(new File([bytes], base, { type: /\.midi?$/i.test(base) ? 'audio/midi' : 'application/octet-stream' }));
  }
  return out;
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
  const DP = { kick: 36, snare: 38, hat: 42, crash: 49, ride: 51, tom: 45, tamb: 54 };
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
