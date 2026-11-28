// LIVE SCORE · 소리 — 내장 신시사이저, 메트로놈, 재생, WAV 만들기 (인터넷 음원 없이)
import { BAR } from './core.js?v=19';

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
  let relT = .12;
  const env = (a, peak, dec, sus, rel) => {
    relT = rel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * vel, t + a);
    g.gain.setTargetAtTime(sus * peak * vel, t + a, dec);
    g.gain.setValueAtTime(sus * peak * vel, t + Math.max(a, dur));
    g.gain.setTargetAtTime(0, t + Math.max(a, dur), rel);
  };
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
    case 'recorder': { // 맑은 관(사인 + 약한 2배음, 숨소리 같은 빠른 시작)
      const o = osc('sine', f), o2 = osc('triangle', f * 2), g2 = c.createGain(); g2.gain.value = .12; o2.connect(g2); g2.connect(g);
      o.connect(g); env(.03, .3, .2, .85, .06); nodes = [o, o2]; break;
    }
    case 'reed': case 'sax': { // 클라리넷(홀수 배음) · 색소폰(더 밝게)
      const o = osc(inst === 'sax' ? 'sawtooth' : 'square', f), lfo = osc('sine', 5), lg = c.createGain(); lg.gain.value = f * .004;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = inst === 'sax' ? 2400 : 1500; lp.Q.value = inst === 'sax' ? 2 : .7;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(lp); lp.connect(g); env(.04, inst === 'sax' ? .13 : .14, .25, .8, .07); nodes = [o, lfo]; break;
    }
    case 'trumpet': {
      const o = osc('sawtooth', f), o2 = osc('square', f, 4);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(3600, t + .05); lp.frequency.setTargetAtTime(2600, t + .05, .2);
      const g2 = c.createGain(); g2.gain.value = .35; o2.connect(g2); g2.connect(lp); o.connect(lp); lp.connect(g); env(.03, .13, .2, .75, .07); nodes = [o, o2]; break;
    }
    case 'violin': case 'cello': {
      const o = osc('sawtooth', f), lfo = osc('sine', 5.6), lg = c.createGain(); lg.gain.value = f * .007;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = inst === 'cello' ? 1300 : 2600;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(lp); lp.connect(g); env(.09, .12, .4, .85, .14); nodes = [o, lfo]; break;
    }
    case 'uke': { // 나일론 줄 튕김
      const o = osc('triangle', f), o2 = osc('sine', f * 3, 5), g2 = c.createGain(); g2.gain.value = .15; o2.connect(g2); g2.connect(g);
      o.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3 * vel, t + .004); g.gain.setTargetAtTime(0, t + .004, .22); relT = .1; nodes = [o, o2]; break;
    }
    case 'mallet': { // 실로폰: 짧고 단단한 나무 소리
      const o = osc('sine', f), o2 = osc('sine', f * 3.9), g2 = c.createGain(); g2.gain.setValueAtTime(.25, t); g2.gain.exponentialRampToValueAtTime(.001, t + .06); o2.connect(g2); g2.connect(g);
      o.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.4 * vel, t + .002); g.gain.setTargetAtTime(0, t + .002, .09); relT = .05; nodes = [o, o2]; break;
    }
    case 'harp': { // 하프: 맑게 튕기고 길게 울림
      const o = osc('triangle', f), o2 = osc('sine', f * 2, 3), g2 = c.createGain(); g2.gain.setValueAtTime(.3, t); g2.gain.setTargetAtTime(.05, t, .15); o2.connect(g2); g2.connect(g);
      o.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.34 * vel, t + .003); g.gain.setTargetAtTime(0, t + .003, .7); relT = .3; nodes = [o, o2]; break;
    }
    case 'timp': { // 팀파니: 낮은 북 소리(음높이 있음)
      const o = osc('sine', f), o2 = osc('sine', f * 1.5, -8), g2 = c.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(g);
      o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + .08);
      const nb = c.createBuffer(1, Math.floor(c.sampleRate * .08), c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
      const ns = c.createBufferSource(); ns.buffer = nb; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const gn = c.createGain(); gn.gain.value = .5 * vel; ns.connect(lp); lp.connect(gn); gn.connect(out); ns.start(t);
      o.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.7 * vel, t + .006); g.gain.setTargetAtTime(0, t + .006, .45); relT = .3; nodes = [o, o2]; break;
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
  const stopAt = t + Math.max(.01, dur) + Math.max(.2, relT * 5); // 울림이 거의 사라지면 멈춘다
  nodes.forEach(n => { n.start(t); n.stop(stopAt); });
  nodes[0].onended = () => { try { g.disconnect(); } catch (e) { } }; // 끝난 음은 소리 길에서 떼어 낸다(긴 곡에서 소리가 끊기지 않게)
  return { stop: (at) => { const s = at ?? c.currentTime; g.gain.cancelScheduledValues(s); g.gain.setTargetAtTime(0, s, .04); nodes.forEach(n => { try { n.stop(s + .3); } catch (e) { } }); } };
}

function drum(c, out, p, t, vel) {
  const g = c.createGain(); g.connect(out);
  if (p === 36 || p === 35) { // 큰북
    const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    g.gain.setValueAtTime(.9 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .32);
    o.connect(g); o.start(t); o.stop(t + .35); o.onended = () => { try { g.disconnect(); } catch (e) { } }; return;
  }
  if ([41, 43, 45, 47, 48, 50].includes(p)) { // 탐
    const o = c.createOscillator(); const f0 = { 41: 82, 43: 98, 45: 120, 47: 140, 48: 160, 50: 185 }[p];
    o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + .09);
    g.gain.setValueAtTime(.7 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .45);
    o.connect(g); o.start(t); o.stop(t + .5); o.onended = () => { try { g.disconnect(); } catch (e) { } }; return;
  }
  const src = c.createBufferSource(); src.buffer = noise(c);
  const f = c.createBiquadFilter();
  if (p === 38 || p === 40 || p === 37) { // 작은북
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .7;
    g.gain.setValueAtTime(.55 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; const og = c.createGain();
    og.gain.setValueAtTime(.35 * vel, t); og.gain.exponentialRampToValueAtTime(.001, t + .08); o.connect(og); og.connect(out); o.start(t); o.stop(t + .1);
  } else if (p === 49 || p === 57) { // 심벌
    f.type = 'highpass'; f.frequency.value = 5000;
    g.gain.setValueAtTime(.32 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.2);
  } else if (p === 51 || p === 59 || p === 53) { // 라이드
    f.type = 'bandpass'; f.frequency.value = 6500; f.Q.value = 1.2;
    g.gain.setValueAtTime(.2 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .5);
  } else if (p === 54) { // 탬버린: 방울
    f.type = 'bandpass'; f.frequency.value = 8500; f.Q.value = 2.5;
    g.gain.setValueAtTime(.3 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .22);
  } else { // 하이햇 · 기타
    f.type = 'highpass'; f.frequency.value = 7500;
    g.gain.setValueAtTime(.22 * vel, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
  }
  src.connect(f); f.connect(g); src.start(t); src.stop(t + 1.3);
  src.onended = () => { try { g.disconnect(); } catch (e) { } };
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
const INST_SOUND = { drums: 'drum', guitar: 'guitar', bass: 'bass', keys: 'keys', strings: 'strings', flute: 'flute', brass: 'brass', melody: 'voice', recorder: 'recorder', reed: 'reed', sax: 'sax', trumpet: 'trumpet', violin: 'violin', cello: 'cello', uke: 'uke', mallet: 'mallet', harp: 'harp', timp: 'timp' };
export function soundOf(id) { return INST_SOUND[id] || 'keys'; }
const DRUMP = { kick: 36, snare: 38, hat: 42, crash: 49, ride: 51, tom: 45, tamb: 54 };

// 재생할 음을 시작 순서대로 한 줄로
function flatten(tracks, from, to) {
  const ev = [];
  for (const tr of tracks) {
    const vol = tr.vol ?? .8;
    for (const n of tr.notes) { if (n.p == null || n.s < from || n.s >= to) continue; ev.push({ tr, n, vol }); }
  }
  return ev.sort((a, b) => a.n.s - b.n.s);
}
function playOne(c, out, e, tempo, t0, from, to, clip = true, warp = null) {
  const u = 60 / tempo / 4, { tr, n, vol } = e;
  const len = clip ? Math.min(n.d, to - n.s) : n.d;
  // warp(칸 → 초): 박 지도대로 칠 때(음원으로 악보 만들기에서 원곡과 함께 — 루바토를 따라간다)
  const t = warp ? t0 + warp(n.s) - warp(from) : t0 + (n.s - from) * u;
  const d = (warp ? warp(n.s + len) - warp(n.s) : len * u) * (tr.inst === 'voice' ? .96 : .92);
  if (tr.inst === 'drum') (n.kit || [n.k || 'x']).forEach(k => drum(c, out, DRUMP[k] ?? n.p, t, vol));
  else (n.chord || [n.p]).forEach(p => voice(c, out, tr.inst, p, t, d, vol));
  return t + d;
}
export function schedule(c, out, tracks, tempo, t0, from = 0, to = Infinity, clip = true) {
  let end = 0;
  for (const e of flatten(tracks, from, to)) end = Math.max(end, playOne(c, out, e, tempo, t0, from, to, clip));
  return end;
}

let playing = null;
// 미리 듣기: 곡 전체를 한꺼번에 예약하지 않고 1.5초 앞만 조금씩 예약한다.
// (수노 스템처럼 음이 수천 개인 곡도 시작이 뭉치거나 소리가 끊기지 않게)
export function play(tracks, tempo, opts = {}) {
  stop();
  const c = audio();
  const bus = c.createGain(); bus.connect(master);
  const from = opts.from ?? Math.min(0, ...tracks.map(t => t.notes.reduce((a, n) => Math.min(a, n.s), 0))), to = opts.to ?? Infinity; // 전주·못갖춘마디(음수 자리)부터
  const ev = flatten(tracks, from, to), u = 60 / tempo / 4, warp = opts.warp || null;
  const endU = ev.reduce((a, e) => Math.max(a, Math.min(e.n.s + e.n.d, to)), from);
  const t0 = c.currentTime + .12, at = s => warp ? warp(s) - warp(from) : (s - from) * u;
  const len = Math.max(at(endU), to === Infinity ? 0 : at(to));
  const me = { bus, t0, from, tempo, len, onend: opts.onend, i: 0, pump: null };
  const pump = () => {
    if (playing !== me) return;
    const horizon = c.currentTime + 1.5;
    while (me.i < ev.length && t0 + at(ev[me.i].n.s) < horizon) { playOne(c, bus, ev[me.i], tempo, t0, from, to, true, warp); me.i++; }
    if (me.i < ev.length) me.pump = setTimeout(pump, 200);
  };
  playing = me; pump();
  me.timer = setTimeout(() => { if (playing === me) { playing = null; opts.onend && opts.onend(); } }, (len + .4) * 1000);
  return me;
}
export function stop() {
  if (!playing) return;
  const p = playing; playing = null;
  clearTimeout(p.timer); clearTimeout(p.pump);
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

// ── 음원 만들기(MP3·WAV) ──
// 곡 전체를 한 번에 그리면 음이 많은 곡(수노 스템 등)은 몇 분이 걸려도 끝나지 않는다.
// → 약 6초씩 잘라 따로 그린 뒤 이어 붙인다. onProgress(0~1)로 진행률을 알린다.
async function renderMix(tracks, tempo, units, onProgress) {
  const sr = 44100, u = 60 / tempo / 4, lead = .05;
  const total = Math.ceil((units * u + 1.5 + lead) * sr);
  const L = new Float32Array(total); // 내장 악기는 좌우가 같아 한 채널(모노)로 그린다
  const ev = flatten(tracks, 0, units);
  const chunkU = Math.max(4, Math.round(1.5 / u / 4) * 4); // 약 1.5초(박 단위)씩 — 조각이 짧을수록 한꺼번에 살아 있는 소리가 적어 빠르다
  const jobs = [];
  let i = 0;
  for (let a = 0; a < units; a += chunkU) {
    const b = Math.min(units, a + chunkU), part = [];
    while (i < ev.length && ev[i].n.s < b) part.push(ev[i++]);
    if (part.length) jobs.push({ a, b, part });
  }
  let done = 0, next = 0;
  const work = async () => { // 조각 여러 개를 동시에(오디오 그리기는 따로 도는 일꾼에서 돈다)
    while (next < jobs.length) {
      const { a, b, part } = jobs[next++];
      let last = (b - a) * u; part.forEach(e => { last = Math.max(last, (e.n.s + e.n.d - a) * u + 1.3); }); // 마지막 음의 울림까지
      const oc = new OfflineAudioContext(1, Math.ceil(last * sr), sr);
      const bus = makeBus(oc);
      part.forEach(e => playOne(oc, bus, e, tempo, 0, a, Infinity, false));
      const l = (await oc.startRendering()).getChannelData(0);
      const off = Math.round((lead + a * u) * sr), n = Math.min(l.length, total - off);
      for (let k = 0; k < n; k++) L[off + k] += l[k];
      onProgress && onProgress(++done / jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, work));
  return { chans: [L], sr };
}
// MP3로 묶기 — lamejs(LGPL) 사용. chans: Float32Array 1개(모노) 또는 2개(스테레오)
export async function encodeMp3(chans, sr, kbps = 160, onProgress) {
  if (!window.lamejs) throw new Error('MP3 도구를 불러오지 못했어요');
  const enc = new window.lamejs.Mp3Encoder(chans.length, sr, kbps);
  const toI16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  const I = chans.map(toI16), N = I[0].length, out = [];
  for (let i = 0; i < N; i += 1152) {
    const b = I.length > 1 ? enc.encodeBuffer(I[0].subarray(i, i + 1152), I[1].subarray(i, i + 1152)) : enc.encodeBuffer(I[0].subarray(i, i + 1152));
    if (b.length) out.push(new Uint8Array(b));
    if (i % (1152 * 200) === 0) { onProgress && onProgress(i / N); await new Promise(r => setTimeout(r, 0)); }
  }
  const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
  return new Blob(out, { type: 'audio/mpeg' });
}
export async function renderWav(tracks, tempo, units, onProgress) {
  const { chans, sr } = await renderMix(tracks, tempo, units, onProgress);
  return wavBlob({ numberOfChannels: chans.length, length: chans[0].length, sampleRate: sr, getChannelData: i => chans[i] });
}
export async function renderMp3(tracks, tempo, units, onProgress) {
  const { chans, sr } = await renderMix(tracks, tempo, units, p => onProgress && onProgress(p * .7));
  return encodeMp3(chans, sr, 128, p => onProgress && onProgress(.7 + p * .3));
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
