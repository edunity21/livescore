// LIVE SCORE · 소리 — 내장 신시사이저, 메트로놈, 재생, WAV 만들기 (인터넷 음원 없이)
import { BAR } from './core.js?v=6';

let ctx = null, master = null;
export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = makeBus(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function makeBus(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  const g = c.createGain(); g.gain.value = .8;
  g.connect(comp); comp.connect(c.destination);
  return g;
}
export const mtof = p => 440 * Math.pow(2, (p - 69) / 12);

let noiseBuf = null;
function noise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate && noiseBuf._c === c) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  b._c = c; noiseBuf = b; return b;
}

// 악기 한 음 — t: 시작(초), dur: 길이(초), vel 0~1
export function voice(c, out, inst, p, t, dur, vel = .8) {
  const g = c.createGain();
  g.connect(out);
  const f = mtof(p);
  const osc = (type, freq, det = 0) => { const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; return o; };
  const env = (a, peak, dec, sus, rel) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * vel, t + a);
    g.gain.setTargetAtTime(sus * peak * vel, t + a, dec);
    g.gain.setValueAtTime(sus * peak * vel, t + Math.max(a, dur));
    g.gain.setTargetAtTime(0, t + Math.max(a, dur), rel);
  };
  const stopAt = t + dur + 1.2;
  if (inst === 'drum') return drum(c, out, p, t, vel);
  let nodes = [];
  switch (inst) {
    case 'bass': {
      const o = osc('triangle', f), o2 = osc('sine', f / 2);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp); o2.connect(lp); lp.connect(g); env(.01, .55, .25, .55, .08); nodes = [o, o2]; break;
    }
    case 'guitar': {
      const o = osc('sawtooth', f), o2 = osc('square', f, 7);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + .4);
      o.connect(lp); o2.connect(lp); lp.connect(g); env(.005, .12, .18, .25, .06); nodes = [o, o2]; break;
    }
    case 'strings': {
      const o = osc('sawtooth', f, -6), o2 = osc('sawtooth', f, 6);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
      o.connect(lp); o2.connect(lp); lp.connect(g); env(.18, .09, .5, .9, .25); nodes = [o, o2]; break;
    }
    case 'flute': {
      const o = osc('sine', f), lfo = osc('sine', 5.2), lg = c.createGain(); lg.gain.value = f * .006;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); env(.06, .32, .3, .8, .08); nodes = [o, lfo]; break;
    }
    case 'brass': {
      const o = osc('sawtooth', f);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2600, t + .06);
      o.connect(lp); lp.connect(g); env(.04, .16, .2, .7, .08); nodes = [o]; break;
    }
    case 'voice': {
      const o = osc('triangle', f), o2 = osc('sine', f * 2), lfo = osc('sine', 5.5), lg = c.createGain(); lg.gain.value = f * .005;
      const g2 = c.createGain(); g2.gain.value = .18; o2.connect(g2); g2.connect(g);
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); env(.03, .5, .4, .85, .07); nodes = [o, o2, lfo]; break;
    }
    case 'click': {
      const o = osc('square', f); o.connect(g); g.gain.setValueAtTime(vel * .3, t); g.gain.exponentialRampToValueAtTime(.0001, t + .05); nodes = [o]; break;
    }
    default: { // keys / piano
      const o = osc('triangle', f), o2 = osc('sine', f * 2, 3);
      const g2 = c.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(g);
      o.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.42 * vel, t + .006);
      g.gain.setTargetAtTime(.12 * vel, t + .006, .35);
      g.gain.setValueAtTime(.12 * vel, t + Math.max(.01, dur));
      g.gain.setTargetAtTime(0, t + Math.max(.01, dur), .12);
      nodes = [o, o2];
    }
  }
  nodes.forEach(n => { n.start(t); n.stop(stopAt); });
  return { stop: (at) => { const s = at ?? c.currentTime; g.gain.cancelScheduledValues(s); g.gain.setTargetAtTime(0, s, .04); nodes.forEach(n => { try { n.stop(s + .3); } catch (e) { } }); } };
}

function drum(c, out, p, t, vel) {
  const g = c.createGain(); g.connect(out);
  if (p === 36 || p === 35) { // 큰북
    const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    g.gain.setValueAtTime(.9 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .32);
    o.connect(g); o.start(t); o.stop(t + .35); return;
  }
  const src = c.createBufferSource(); src.buffer = noise(c);
  const f = c.createBiquadFilter();
  if (p === 38 || p === 40 || p === 37) { // 작은북
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .7;
    g.gain.setValueAtTime(.55 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; const og = c.createGain();
    og.gain.setValueAtTime(.35 * vel, t); og.gain.exponentialRampToValueAtTime(.001, t + .08); o.connect(og); og.connect(out); o.start(t); o.stop(t + .1);
  } else if (p === 49 || p === 57 || p === 51) { // 심벌
    f.type = 'highpass'; f.frequency.value = 5000;
    g.gain.setValueAtTime(.32 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.2);
  } else { // 하이햇 · 기타
    f.type = 'highpass'; f.frequency.value = 7500;
    g.gain.setValueAtTime(.22 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
  }
  src.connect(f); f.connect(g); src.start(t); src.stop(t + 1.3);
}

// 건반 소리(실시간 연주)
const held = new Map();
export function noteOn(p, vel = 100) {
  const c = audio();
  noteOff(p);
  held.set(p, voice(c, master, 'keys', p, c.currentTime, 30, Math.max(.25, vel / 127)));
}
export function noteOff(p) {
  const v = held.get(p);
  if (v) { v.stop(); held.delete(p); }
}
export function allOff() { held.forEach(v => v.stop()); held.clear(); }

export function click(t, accent) {
  const c = audio();
  voice(c, master, 'click', accent ? 96 : 84, t, .05, accent ? 1 : .6);
}

// ── 재생 ──
// tracks: [{inst:'voice'|'keys'|..|'drum', notes:[{p,s,d,chord?,kit?}], vol}]
const INST_SOUND = { drums: 'drum', guitar: 'guitar', bass: 'bass', keys: 'keys', strings: 'strings', flute: 'flute', brass: 'brass', melody: 'voice' };
export function soundOf(id) { return INST_SOUND[id] || 'keys'; }
const DRUMP = { kick: 36, snare: 38, hat: 42, crash: 49 };

export function schedule(c, out, tracks, tempo, t0, from = 0, to = Infinity) {
  const u = 60 / tempo / 4;
  let end = 0;
  for (const tr of tracks) {
    const vol = tr.vol ?? .8;
    for (const n of tr.notes) {
      if (n.p == null || n.s < from || n.s >= to) continue;
      const t = t0 + (n.s - from) * u;
      const d = Math.min(n.d, to - n.s) * u * (tr.inst === 'voice' ? .96 : .92);
      if (tr.inst === 'drum') {
        (n.kit || [n.k || 'x']).forEach(k => drum(c, out, DRUMP[k] ?? n.p, t, vol));
      } else {
        (n.chord || [n.p]).forEach(p => voice(c, out, tr.inst, p, t, d, vol));
      }
      end = Math.max(end, t + d);
    }
  }
  return end;
}

let playing = null;
export function play(tracks, tempo, opts = {}) {
  stop();
  const c = audio();
  const bus = c.createGain(); bus.connect(master);
  const t0 = c.currentTime + .08;
  const from = opts.from || 0, to = opts.to ?? Infinity;
  const end = schedule(c, bus, tracks, tempo, t0, from, to);
  const len = Math.max(end - t0, ((to === Infinity ? 0 : to - from) * 60 / tempo / 4));
  const me = { bus, t0, from, tempo, len, onend: opts.onend };
  me.timer = setTimeout(() => { if (playing === me) { playing = null; opts.onend && opts.onend(); } }, (len + .4) * 1000);
  playing = me;
  return me;
}
export function stop() {
  if (!playing) return;
  const p = playing; playing = null;
  clearTimeout(p.timer);
  const c = audio();
  p.bus.gain.setTargetAtTime(0, c.currentTime, .03);
  setTimeout(() => p.bus.disconnect(), 300);
  p.onend && p.onend();
}
export function position() { // 지금 재생 위치(16분음표 단위)
  if (!playing) return null;
  const c = audio();
  return playing.from + (c.currentTime - playing.t0) / (60 / playing.tempo / 4);
}
export const isPlaying = () => !!playing;

// ── WAV 만들기(수노 Upload Audio용) ──
export async function renderWav(tracks, tempo, units) {
  const sr = 44100;
  const secs = units * 60 / tempo / 4 + 1.5;
  const oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
  const bus = makeBus(oc);
  schedule(oc, bus, tracks, tempo, .05);
  const buf = await oc.startRendering();
  return wavBlob(buf);
}
// MP3 만들기(수노 Upload Audio용) — lamejs(LGPL) 사용
export async function renderMp3(tracks, tempo, units) {
  if (!window.lamejs) throw new Error('MP3 도구를 불러오지 못했어요');
  const sr = 44100;
  const secs = units * 60 / tempo / 4 + 1.5;
  const oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
  const bus = makeBus(oc);
  schedule(oc, bus, tracks, tempo, .05);
  const buf = await oc.startRendering();
  const enc = new window.lamejs.Mp3Encoder(2, sr, 160);
  const toI16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  const L = toI16(buf.getChannelData(0)), R = toI16(buf.getChannelData(1));
  const out = [];
  for (let i = 0; i < L.length; i += 1152) {
    const b = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
    if (b.length) out.push(new Uint8Array(b));
    if (i % (1152 * 200) === 0) await new Promise(r => setTimeout(r, 0));
  }
  const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
  return new Blob(out, { type: 'audio/mpeg' });
}
function wavBlob(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((x, i) => data.setUint8(o + i, x.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let k = 0; k < ch; k++) { const v = Math.max(-1, Math.min(1, chans[k][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data], { type: 'audio/wav' });
}
export { master, BAR };
