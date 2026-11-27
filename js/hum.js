// LIVE SCORE · 흥얼거림 — 마이크로 노래(흥얼거림)를 녹음하고, 음 높이를 찾아 음표로 바꾼다 (인터넷·AI 없이 브라우저 안에서)

// ── 마이크 녹음기 ──
// 소리 조각마다 오디오 시계(프레임 번호)를 함께 적어, 예비박과 박이 정확히 맞게 한다.
const WORKLET = `class LsRec extends AudioWorkletProcessor {
  constructor() { super(); this.on = true; this.buf = new Float32Array(4096); this.n = 0; this.f = 0;
    this.port.onmessage = e => { if (e.data === 'end') { if (this.n) this.port.postMessage({ f: this.f, d: this.buf.slice(0, this.n) }); this.on = false; } }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && this.on) {
      if (this.n === 0) this.f = currentFrame;
      this.buf.set(ch, this.n); this.n += ch.length;
      if (this.n + 128 > this.buf.length) { this.port.postMessage({ f: this.f, d: this.buf.slice(0, this.n) }); this.n = 0; }
    }
    return this.on;
  }
}
registerProcessor('ls-rec', LsRec);`;
let workletReady = null;

export async function openRecorder(ctx) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomic');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
  const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
  const chunks = [];
  let node = null, proc = null, stopped = false;
  if (ctx.audioWorklet) {
    try {
      if (!workletReady || workletReady.ctx !== ctx) { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })); workletReady = { ctx, p: ctx.audioWorklet.addModule(url) }; }
      await workletReady.p;
      node = new AudioWorkletNode(ctx, 'ls-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      node.port.onmessage = e => chunks.push(e.data);
      src.connect(node); node.connect(mute);
    } catch (x) { node = null; }
  }
  if (!node) { // 예전 브라우저: ScriptProcessor (시각은 조금 덜 정확)
    const size = 2048;
    proc = ctx.createScriptProcessor(size, 1, 1);
    proc.onaudioprocess = e => { if (!stopped) chunks.push({ f: Math.round((e.playbackTime - 2 * size / ctx.sampleRate) * ctx.sampleRate), d: new Float32Array(e.inputBuffer.getChannelData(0)) }); };
    src.connect(proc); proc.connect(mute);
  }
  const tbuf = new Float32Array(an.fftSize);
  return {
    sampleRate: ctx.sampleRate,
    // 지금 소리(실시간 표시용): { rms, midi }
    now() { an.getFloatTimeDomainData(tbuf); let s = 0; for (let i = 0; i < tbuf.length; i++) s += tbuf[i] * tbuf[i]; const rms = Math.sqrt(s / tbuf.length); const r = rms > .008 ? yin(tbuf, ctx.sampleRate, 0, tbuf.length >> 1) : null; return { rms, midi: r && r.ap < .25 ? 69 + 12 * Math.log2(r.f / 440) : null }; },
    // 녹음 끝: 오디오 시각 t0(초)부터의 소리를 하나로 잇는다
    async finish(t0, t1) {
      stopped = true;
      if (node) { node.port.postMessage('end'); await new Promise(r => setTimeout(r, 120)); }
      try { src.disconnect(); } catch (x) { } try { an.disconnect(); } catch (x) { } try { (node || proc).disconnect(); } catch (x) { } try { mute.disconnect(); } catch (x) { }
      stream.getTracks().forEach(t => t.stop());
      const sr = ctx.sampleRate, f0 = Math.round(t0 * sr), f1 = Math.round(t1 * sr);
      const out = new Float32Array(Math.max(0, f1 - f0));
      chunks.forEach(c => { const o = c.f - f0; for (let i = 0; i < c.d.length; i++) { const k = o + i; if (k >= 0 && k < out.length) out[k] = c.d[i]; } });
      return out;
    },
    cancel() { stopped = true; try { node && node.port.postMessage('end'); } catch (x) { } stream.getTracks().forEach(t => t.stop()); try { src.disconnect(); } catch (x) { } },
  };
}

// ── 음 높이 찾기(YIN) ──
// x: 소리, 시작 i0, 창 길이 W → { f: 주파수, ap: 비주기성(0에 가까울수록 또렷한 음) }
function yin(x, sr, i0, W, fmin = 75, fmax = 1100) {
  const tmin = Math.max(2, Math.floor(sr / fmax)), tmax = Math.min(W - 1, Math.ceil(sr / fmin));
  const d = new Float32Array(tmax + 2);
  for (let t = 1; t <= tmax + 1; t++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[i0 + i] - x[i0 + i + t]; s += v * v; } d[t] = s; }
  let run = 0; const cm = new Float32Array(tmax + 2); cm[0] = 1;
  for (let t = 1; t <= tmax + 1; t++) { run += d[t]; cm[t] = run ? d[t] * t / run : 1; }
  let tau = -1;
  for (let t = tmin; t <= tmax; t++) if (cm[t] < .15) { while (t + 1 <= tmax && cm[t + 1] < cm[t]) t++; tau = t; break; }
  if (tau < 0) { let best = tmin; for (let t = tmin; t <= tmax; t++) if (cm[t] < cm[best]) best = t; tau = best; }
  const a = cm[tau - 1] ?? cm[tau], b = cm[tau], c = cm[tau + 1] ?? cm[tau];
  const den = a + c - 2 * b, sh = den ? (a - c) / (2 * den) : 0;
  return { f: sr / (tau + Math.max(-1, Math.min(1, sh))), ap: b };
}

// 16 kHz로 줄이기(음 높이 찾기를 빠르게)
async function down16(pcm, sr) {
  if (sr === 16000) return pcm;
  const oc = new OfflineAudioContext(1, Math.max(1, Math.ceil(pcm.length * 16000 / sr)), 16000);
  const b = oc.createBuffer(1, pcm.length, sr); b.copyToChannel(pcm, 0);
  const s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start();
  return (await oc.startRendering()).getChannelData(0);
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

// 녹음(pcm, 표본율 sr) → 음 높이 흐름과 음표들 [{p, v, t, d}] (t·d: 초, 녹음 시작 기준)
export async function transcribe(pcm, sr, onProgress) {
  const x = await down16(pcm, sr), SR = 16000, W = 512, HOP = 160;
  const n = Math.max(0, Math.floor((x.length - W * 2) / HOP));
  const fr = [];
  for (let k = 0; k < n; k++) {
    const i0 = k * HOP;
    let s = 0; for (let i = 0; i < W; i++) s += x[i0 + i] * x[i0 + i];
    fr.push({ t: (i0 + W / 2) / SR, rms: Math.sqrt(s / W), midi: null, ap: 1 });
    if (k % 150 === 0) { onProgress && onProgress(k / n * .5); await new Promise(r => setTimeout(r, 0)); }
  }
  const loud = median(fr.map(f => f.rms).filter(v => v > .002).sort((a, b) => a - b).slice(-Math.max(1, Math.floor(fr.length * .3)))) || 0;
  const gate = Math.max(.004, loud * .12);
  for (let k = 0; k < fr.length; k++) {
    const f = fr[k];
    if (f.rms >= gate) { const r = yin(x, SR, k * HOP, W); f.ap = r.ap; if (r.ap < .3) f.midi = 69 + 12 * Math.log2(r.f / 440); }
    if (k % 150 === 0) { onProgress && onProgress(.5 + k / fr.length * .5); await new Promise(r => setTimeout(r, 0)); }
  }
  // 튀는 값 다듬기(앞뒤 5칸 중앙값) + 한 옥타브 튐 바로잡기
  const sm = fr.map((f, k) => {
    if (f.midi == null) return null;
    const win = []; for (let j = k - 2; j <= k + 2; j++) if (fr[j] && fr[j].midi != null) win.push(fr[j].midi);
    let m = median(win);
    if (Math.abs(f.midi - m) > 9) return m; // 옥타브 튐
    return Math.abs(f.midi - m) > 1.2 ? m : f.midi;
  });
  // 음표로 나누기: 소리가 끊기거나, 음 높이가 바뀌거나, 소리가 다시 세게 시작되면(새 글자) 새 음표
  const H = HOP / SR / 2, notes = [];
  let cur = null, gap = 0, dev = 0;
  const begin = k => { cur = { k0: k, t0: fr[k].t - H, t1: fr[k].t + H, ps: [sm[k]], peak: fr[k].rms }; };
  const close = () => {
    if (!cur) return;
    const len = cur.t1 - cur.t0;
    if (len >= .07 && cur.ps.length) {
      const ps = cur.ps.slice(Math.floor(cur.ps.length * .2), Math.ceil(cur.ps.length * .8));
      notes.push({ p: Math.round(median(ps.length ? ps : cur.ps)), v: Math.max(40, Math.min(120, Math.round(50 + cur.peak / (loud || 1) * 50))), t: cur.t0, d: len });
    }
    cur = null;
  };
  for (let k = 0; k < fr.length; k++) {
    const m = sm[k];
    if (m == null) { if (cur && ++gap >= 4) close(); continue; }
    gap = 0;
    if (!cur) { begin(k); dev = 0; continue; }
    const ref = median(cur.ps.slice(-8));
    dev = Math.abs(m - ref) > .75 ? dev + 1 : 0;
    let lo = Infinity; for (let j = Math.max(0, k - 6); j < k; j++) lo = Math.min(lo, fr[j].rms);
    const onset = fr[k].rms > lo * 2.2 && lo < cur.peak * .45 && k - cur.k0 > 8;
    if (dev >= 4) { // 4칸 동안 다른 높이 → 그 첫 칸부터 새 음표
      const j = k - 3;
      cur.ps.splice(Math.max(1, cur.ps.length - 3)); cur.t1 = fr[j].t - H; close();
      begin(j); for (let q = j + 1; q <= k; q++) if (sm[q] != null) cur.ps.push(sm[q]);
      cur.t1 = fr[k].t + H; dev = 0; continue;
    }
    if (onset) { cur.t1 = fr[k].t - H; close(); begin(k); continue; }
    cur.ps.push(m); cur.t1 = fr[k].t + H; cur.peak = Math.max(cur.peak, fr[k].rms);
  }
  close();
  return { notes, frames: fr.map((f, k) => ({ t: f.t, midi: sm[k] })) };
}

// 소리 크기 맞추기(가장 큰 곳을 -1dB로)
export function normalize(pcm) {
  let pk = 0; for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]));
  if (pk < 1e-4) return pcm;
  const g = .89 / pk, out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * g;
  return out;
}
