// 음원(MP3)으로 악보 만들기 — 분석 도구 모음(화면 없음, 브라우저·노드 공용)
// · 음 찾기: 스포티파이 Basic Pitch 모델(Apache-2.0, lib/basic-pitch/)을 TensorFlow.js로 이 기기 안에서 돌린다 — 음원은 밖으로 나가지 않는다
// · 가운데 소리 뽑기(노래 강조) · 박·빠르기·첫 박 찾기 · 조 찾기 · 노래 선율 따라가기 · 가사를 음표에 차례로 붙이기
// · MP3 안의 제목·가사(ID3 USLT — 수노가 넣어 줌) 읽기

export const SR = 22050;
const HOP = 256, WIN = SR * 2 - HOP, OVL = 30 * HOP, STEP = WIN - OVL, KEEP = 172 - 30;
export const FPS = SR / HOP;

// ── Basic Pitch 추론 ── frames·onsets: 88건반(A0~C8), contours: 264칸(반음당 3칸)
export async function analyze(tf, model, x, onProg = () => {}) {
  const padded = new Float32Array(OVL / 2 + x.length); padded.set(x, OVL / 2);
  const nWin = Math.max(1, Math.ceil((padded.length - WIN) / STEP) + 1);
  const nOut = Math.floor(x.length / HOP);
  const frames = new Float32Array(nOut * 88), onsets = new Float32Array(nOut * 88);
  let at = 0;
  for (let w = 0; w < nWin && at < nOut; w++) {
    const seg = new Float32Array(WIN); seg.set(padded.subarray(w * STEP, w * STEP + WIN));
    const outs = tf.tidy(() => model.execute(tf.tensor(seg, [1, WIN, 1]), ['Identity_1', 'Identity_2']));
    const [f, o] = await Promise.all(outs.map(t => t.data())); outs.forEach(t => t.dispose());
    const take = Math.min(KEEP, nOut - at);
    frames.set(f.subarray(15 * 88, (15 + take) * 88), at * 88);
    onsets.set(o.subarray(15 * 88, (15 + take) * 88), at * 88);
    at += take; onProg((w + 1) / nWin);
    if (w % 3 === 2) await new Promise(r => setTimeout(r, 0));
  }
  return { n: at, frames, onsets, time: frameTime };
}
// 프레임 i의 시각: 창 w=⌊i/142⌋, 창 안 j → (w·STEP + j·HOP)/SR
export const frameTime = i => (Math.floor(i / KEEP) * STEP + (i % KEEP) * HOP) / SR;
const timeFrame = t => { const s = t * SR, w = Math.floor(s / STEP); return Math.max(0, w * KEEP + Math.min(KEEP - 1, Math.round((s - w * STEP) / HOP))); };

// ── FFT(제자리, 2의 거듭제곱) ──
function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const p = i + k, q = p + h, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const hann = n => Float32Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));

// ── 가운데 소리 뽑기: 왼쪽·오른쪽이 같은 소리(대개 노래)만 남긴다 ──
export async function centerExtract(L, R, { n = 2048, hop = 512, power = 3, onProg } = {}) {
  const w = hann(n), out = new Float32Array(L.length), norm = new Float32Array(L.length);
  const lr = new Float32Array(n), li = new Float32Array(n), rr = new Float32Array(n), ri = new Float32Array(n);
  const total = Math.ceil(L.length / hop);
  for (let f = 0, s = -n / 2; s < L.length; f++, s += hop) {
    for (let i = 0; i < n; i++) { const k = s + i, ok = k >= 0 && k < L.length; lr[i] = ok ? L[k] * w[i] : 0; rr[i] = ok ? R[k] * w[i] : 0; li[i] = 0; ri[i] = 0; }
    fft(lr, li); fft(rr, ri);
    for (let k = 0; k < n; k++) {
      const pl = lr[k] * lr[k] + li[k] * li[k], pr = rr[k] * rr[k] + ri[k] * ri[k];
      const sim = 2 * (lr[k] * rr[k] + li[k] * ri[k]) / (pl + pr + 1e-12);
      const m = sim > 0 ? Math.pow(sim, power) : 0;
      lr[k] = (lr[k] + rr[k]) * .5 * m; li[k] = (li[k] + ri[k]) * .5 * m;
    }
    fft(lr, li, true);
    for (let i = 0; i < n; i++) { const k = s + i; if (k >= 0 && k < L.length) { out[k] += lr[i] / n * w[i]; norm[k] += w[i] * w[i]; } }
    if (onProg && f % 400 === 0) { onProg(f / total); await new Promise(r => setTimeout(r, 0)); }
  }
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return out;
}

// ── 박 찾기 ── 소리 세기 변화(스펙트럼 증가량) → 빠르기(자기상관) → 박 위치(동적 계획법)
export function onsetEnvelope(x, { n = 1024, hop = HOP } = {}) {
  const w = hann(n), re = new Float32Array(n), im = new Float32Array(n), nb = n / 2;
  const nf = Math.floor(x.length / hop), env = new Float32Array(nf); let prev = new Float32Array(nb);
  const kMax = Math.min(nb, Math.round(8000 / SR * n));
  for (let f = 0; f < nf; f++) {
    const s = f * hop - n / 2;
    for (let i = 0; i < n; i++) { const k = s + i; re[i] = k >= 0 && k < x.length ? x[k] * w[i] : 0; im[i] = 0; }
    fft(re, im);
    const cur = new Float32Array(nb); let acc = 0;
    for (let k = 1; k < kMax; k++) { cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k])); const d = cur[k] - prev[k]; if (d > 0) acc += d; }
    env[f] = acc; prev = cur;
  }
  // 느린 흐름을 빼고 표준화
  const out = new Float32Array(nf), W = Math.round(FPS * .5);
  let sum = 0; for (let i = 0; i < Math.min(nf, W); i++) sum += env[i];
  for (let i = 0; i < nf; i++) { const a = i - W - 1, b = i + W; if (b < nf) sum += env[b]; if (a >= 0) sum -= env[a]; const cnt = Math.min(nf, b + 1) - Math.max(0, a + 1); out[i] = Math.max(0, env[i] - sum / cnt); }
  let m = 0, v = 0; for (const e of out) m += e; m /= nf || 1; for (const e of out) v += (e - m) ** 2; const sd = Math.sqrt(v / (nf || 1)) || 1;
  for (let i = 0; i < nf; i++) out[i] /= sd;
  return out;
}
export function tempoCandidates(env, { lo = 50, hi = 200, center = 100 } = {}) {
  const res = [];
  const L0 = Math.floor(FPS * 60 / hi), L1 = Math.ceil(FPS * 60 / lo);
  const ac = new Float32Array(L1 + 2);
  for (let L = L0 - 1; L <= L1 + 1; L++) { let s = 0; for (let i = L; i < env.length; i++) s += env[i] * env[i - L]; ac[L] = s / (env.length - L); }
  for (let L = L0; L <= L1; L++) {
    if (!(ac[L] >= ac[L - 1] && ac[L] >= ac[L + 1])) continue;
    const bpm = FPS * 60 / (L + (ac[L - 1] - ac[L + 1]) / (2 * (ac[L - 1] - 2 * ac[L] + ac[L + 1]) || 1));
    const wgt = Math.exp(-.5 * (Math.log2(bpm / center) / .9) ** 2);
    res.push({ bpm, score: ac[L] * wgt, raw: ac[L] });
  }
  return res.sort((a, b) => b.score - a.score);
}
export function beatTrack(env, bpm, tight = 100) {
  const p = FPS * 60 / bpm, n = env.length, sc = new Float32Array(n), back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    let best = 0, bi = -1;
    const a = Math.max(0, Math.round(t - 2 * p)), b = Math.round(t - p / 2);
    for (let q = a; q <= b; q++) { const v = sc[q] - tight * Math.log((t - q) / p) ** 2; if (v > best || bi < 0) { best = v; bi = q; } }
    sc[t] = env[t] + (bi >= 0 ? Math.max(0, best) : 0); back[t] = bi >= 0 && best > 0 ? bi : -1;
  }
  let t = n - 1, bt = t; for (let q = Math.max(0, Math.round(n - p)); q < n; q++) if (sc[q] > sc[bt]) bt = q;
  const beats = []; t = bt; while (t >= 0) { beats.push(t); t = back[t]; }
  beats.reverse();
  // 앞쪽 빈 곳도 같은 간격으로 채운다(전주가 조용해도 마디를 셀 수 있게)
  while (beats.length && beats[0] - p > 0) beats.unshift(Math.round(beats[0] - p));
  return beats.map(f => f / FPS);
}

// ── 화음 성분(크로마) · 조 찾기 ──
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export function chromaAt(an, t0, t1, { lo = 28, hi = 96 } = {}) {
  const c = new Float32Array(12), a = timeFrame(t0), b = Math.max(a + 1, timeFrame(t1));
  for (let f = a; f < Math.min(b, an.n); f++) for (let p = lo; p < hi; p++) { const v = an.frames[f * 88 + p - 21]; if (v > .2) c[p % 12] += v; }
  return c;
}
export function keyOf(chroma) { // 장조 12개 중(단조 곡은 나란한조의 장조로)
  let best = 0, bs = -1e9;
  for (let k = 0; k < 12; k++) { let s = 0; for (let i = 0; i < 12; i++) s += chroma[(i + k) % 12] * MAJ[i]; if (s > bs) { bs = s; best = k; } }
  return best;
}
// 마디 첫 박 찾기: 화음이 바뀌고 낮은 음이 새로 울리는 박을 1박으로
export function downbeatPhase(an, beats, meter = 4) {
  const ch = []; for (let i = 0; i + 1 < beats.length; i++) ch.push(chromaAt(an, beats[i], beats[i + 1]));
  const bass = beats.map(t => { const f = timeFrame(t); let s = 0; for (let df = -2; df <= 3; df++) { const g = f + df; if (g < 0 || g >= an.n) continue; for (let p = 28; p < 52; p++) s += an.onsets[g * 88 + p - 21]; } return s; });
  const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
  const sc = Array(meter).fill(0), cnt = Array(meter).fill(0);
  const bm = bass.reduce((a, v) => a + v, 0) / (bass.length || 1) || 1;
  for (let i = 1; i < ch.length; i++) { const nov = 1 - cos(ch[i - 1], ch[i]); const k = i % meter; sc[k] += nov + .35 * bass[i] / bm; cnt[k]++; }
  let k = 0; for (let i = 1; i < meter; i++) if (sc[i] / (cnt[i] || 1) > sc[k] / (cnt[k] || 1)) k = i;
  return k; // beats[k], beats[k+meter], … 가 1박
}

// ── 노래가 나오는 곳 찾기 ── 가운데 소리가 전체에서 차지하는 몫(1초 평균) — 반주만 나오는 전주·간주는 낮다
export function vocalActivity(L, R, C, { win = 1 } = {}) {
  const n = Math.floor(C.length / HOP), e = new Float32Array(n), m = new Float32Array(n);
  for (let f = 0; f < n; f++) { let a = 0, b = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) { a += C[i] * C[i]; const x = (L[i] + R[i]) / 2; b += x * x; } e[f] = a; m[f] = b; }
  const W = Math.round(FPS * win / 2), out = new Float32Array(n); let sa = 0, sb = 0;
  for (let i = 0; i < Math.min(n, W); i++) { sa += e[i]; sb += m[i]; }
  for (let f = 0; f < n; f++) { const a = f - W - 1, b = f + W; if (b < n) { sa += e[b]; sb += m[b]; } if (a >= 0) { sa -= e[a]; sb -= m[a]; } out[f] = sb > 1e-9 ? Math.min(1, sa / sb) : 0; }
  return out;
}
// 노래 음역 찾기: 노래가 나오는 곳에서 가장 많이 울린 한 옥타브 반
export function vocalRange(an, vad, { lo = 45, hi = 86, span = 19 } = {}) {
  const h = new Float32Array(128);
  for (let f = 0; f < an.n; f++) { const w = vad ? vad[Math.min(vad.length - 1, f)] : 1; if (w < .4) continue; for (let p = lo; p <= hi; p++) { const v = an.frames[f * 88 + p - 21]; if (v > .3) h[p] += v * w; } }
  let best = lo, bs = -1; for (let c = lo; c + span <= hi; c++) { let s = 0; for (let p = c; p <= c + span; p++) s += h[p]; if (s > bs) { bs = s; best = c; } }
  return [best - 2, best + span + 2];
}
// ── 노래 선율 따라가기 ── 노래 음역 안에서 가장 또렷한 음을 이어 가며(급한 도약·옥타브 뜀은 벌점) 한 줄로
export function melodyTrack(an, { lo = 52, hi = 84, jump = .45, octave = 1.2, voice = 1.6, thr = .32, vad = null } = {}) {
  const N = hi - lo + 1, n = an.n, S = N + 1; // 마지막 상태 = 쉼
  const prev = new Float32Array(S), cur = new Float32Array(S), bp = new Uint8Array(n * S);
  const fr = (f, p) => p >= 21 && p < 109 ? an.frames[f * 88 + p - 21] : 0;
  // 배음 합: 바탕음 + 옥타브·12도 위가 함께 울리면 바탕음이 맞다(옥타브 실수 줄이기)
  const em = (f, s) => {
    const w = vad ? vad[Math.min(vad.length - 1, f)] : 1;
    if (s === N) return Math.log(vad ? (w > .45 ? thr * .55 : thr * 1.6) : thr);
    const p = lo + s, v = fr(f, p) + .35 * fr(f, p + 12) + .2 * fr(f, p + 19) - .25 * fr(f, p - 12);
    return Math.log(Math.max(1e-4, v / 1.55 * (.35 + .65 * Math.min(1, w / .5))));
  };
  for (let s = 0; s < S; s++) prev[s] = em(0, s);
  const cost = d => jump * d + (d === 12 ? octave : 0);
  for (let f = 1; f < n; f++) {
    let bestV = -1e9, bestS = 0; for (let s = 0; s < N; s++) if (prev[s] > bestV) { bestV = prev[s]; bestS = s; }
    for (let s = 0; s < S; s++) {
      let b = -1e9, bi = 0;
      if (s === N) { b = prev[N]; bi = N; if (bestV - voice > b) { b = bestV - voice; bi = bestS; } }
      else {
        if (prev[N] - voice > b) { b = prev[N] - voice; bi = N; }
        const a = Math.max(0, s - 12), z = Math.min(N - 1, s + 12);
        for (let q = a; q <= z; q++) { const v = prev[q] - cost(Math.abs(q - s)); if (v > b) { b = v; bi = q; } }
        if (bestV - jump * 14 > b) { b = bestV - jump * 14; bi = bestS; }
      }
      cur[s] = b + em(f, s); bp[f * S + s] = bi;
    }
    prev.set(cur);
  }
  const path = new Int16Array(n); let s = 0; for (let q = 1; q < S; q++) if (prev[q] > prev[s]) s = q;
  for (let f = n - 1; f >= 0; f--) { path[f] = s === N ? -1 : lo + s; s = bp[f * S + s]; }
  return path;
}
// 따라간 선율 → 음표(같은 음이 이어져도 새로 치는 자리에서 나눈다)
export function trackNotes(an, path, { minDur = .12, onsetThr = .5, vad = null } = {}) {
  const notes = []; let cur = null;
  const onAt = (f, p) => { let m = 0; for (let df = -1; df <= 1; df++) { const g = f + df; if (g >= 0 && g < an.n) m = Math.max(m, an.onsets[g * 88 + p - 21]); } return m; };
  for (let f = 0; f < an.n; f++) {
    const p = path[f];
    const on = p >= 0 ? onAt(f, p) : 0;
    const re = cur && p === cur.p && on > onsetThr && on > cur.lastOn + .15 && f - cur.f0 > 6;
    if (!cur || p !== cur.p || re) {
      if (cur) notes.push(cur);
      cur = p >= 0 ? { p, f0: f, f1: f + 1, on, amp: an.frames[f * 88 + p - 21], lastOn: on } : null;
    } else { cur.f1 = f + 1; cur.amp = Math.max(cur.amp, an.frames[f * 88 + p - 21]); cur.lastOn = Math.min(cur.lastOn, on) * .5 + on * .5; }
  }
  if (cur) notes.push(cur);
  // 짧은 떨림(비브라토·꾸밈)을 이웃 음에 붙인다
  const out = [];
  for (const x of notes) {
    const t = frameTime(x.f0), d = frameTime(x.f1) - t;
    const last = out[out.length - 1];
    if (d < minDur) { if (last && frameTime(x.f0) - (last.t + last.d) < .03) last.d = t + d - last.t; continue; }
    if (last && last.p === x.p && t - (last.t + last.d) < .05 && x.on < onsetThr) { last.d = t + d - last.t; continue; }
    out.push({ p: x.p, t, d, on: x.on, amp: x.amp, f0: x.f0, f1: x.f1 });
  }
  if (vad) out.forEach(x => { let a = 0; for (let f = x.f0; f < x.f1; f++) a += vad[Math.min(vad.length - 1, f)]; x.vad = a / Math.max(1, x.f1 - x.f0); });
  return out;
}

// ── 가사 ──
// 수노 가사: [Verse 1] 같은 표시는 구간 이름으로, (괄호) 속 코러스·지시는 뺀다
export function parseLyrics(text) {
  const secs = []; let cur = null;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const ln = raw.trim();
    const tag = ln.match(/^\[([^\]]*)\]$/);
    if (tag) { const name = tag[1].split(':')[0].trim(); cur = { name, chorus: /chorus|후렴|hook|refrain/i.test(name), lines: [] }; secs.push(cur); continue; }
    const t = ln.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (!cur) { cur = { name: 'Verse', chorus: false, lines: [] }; secs.push(cur); }
    cur.lines.push(t);
  }
  return secs.filter(s => s.lines.length).flatMap(s => s.lines.map(t => ({ text: t, sec: s.name, chorus: s.chorus })));
}
export const sylOf = t => [...t].filter(ch => /[\p{L}\p{N}]/u.test(ch));

// 가사 줄 ↔ 음표 맞추기: 줄마다 음 묶음을 고르고(남는 음은 간주·반주로 보고 뺀다), 줄 안에서는 새로 치는 음에 글자를 붙인다
export function alignLyrics(notes, lines, { longCue = false } = {}) {
  const L = lines.map(l => sylOf(l.text).length), N = notes.length;
  if (!L.length || !N) return { lines: [], used: [] };
  // longCue(이어 부르는 노래 MIDI): 쉼이 없어도 앞 음이 길면(줄 끝 늘임) 줄이 바뀌는 자리로 본다
  const med = longCue ? notes.map(x => x.d).sort((a, b) => a - b)[N >> 1] : 0;
  const gapBefore = i => i === 0 ? 9 : notes[i].t - (notes[i - 1].t + notes[i - 1].d) + (longCue && notes[i - 1].d >= med * 2.2 ? .3 : 0);
  const gapAfter = i => i === N - 1 ? 9 : notes[i + 1].t - (notes[i].t + notes[i].d) + (longCue && notes[i].d >= med * 2.2 ? .3 : 0);
  const segCost = (li, a, b) => { // 음 a..b-1을 li번째 줄에
    const k = b - a, m = L[li];
    let c = Math.abs(k - m) / Math.max(3, m) * 4 + (k < m ? (m - k) / m * 3 : 0);
    c += gapBefore(a) > .25 ? 0 : 1.2; c += gapAfter(b - 1) > .25 ? 0 : 1.2;
    for (let i = a + 1; i < b; i++) if (gapBefore(i) > 1.2) c += 3; // 줄 안에 긴 쉼은 드물다
    return c;
  };
  const skip = i => .35 + Math.min(.6, notes[i].amp < .4 ? 0 : .3);
  const INF = 1e9, dp = Array.from({ length: L.length + 1 }, () => new Float64Array(N + 1).fill(INF));
  const bk = Array.from({ length: L.length + 1 }, () => new Int32Array(N + 1).fill(-1));
  dp[0][0] = 0;
  for (let j = 1; j <= N; j++) { dp[0][j] = dp[0][j - 1] + skip(j - 1); bk[0][j] = -2; }
  for (let i = 1; i <= L.length; i++) {
    const m = L[i - 1], kmin = Math.max(1, Math.floor(m * .5)), kmax = Math.ceil(m * 2.6) + 2;
    for (let j = 1; j <= N; j++) {
      let b = dp[i][j - 1] + skip(j - 1), bi = -2; // 이 음은 줄에 넣지 않는다
      for (let k = kmin; k <= kmax && k <= j; k++) { const v = dp[i - 1][j - k] + segCost(i - 1, j - k, j); if (v < b) { b = v; bi = k; } }
      dp[i][j] = b; bk[i][j] = bi;
    }
  }
  const seg = []; let i = L.length, j = N;
  while (i > 0 || j > 0) { const b = bk[i][j]; if (b === -2 || (i === 0 && j > 0)) { j--; continue; } seg.push({ li: i - 1, a: j - b, b: j }); j -= b; i--; }
  seg.reverse();
  const res = seg.map(({ li, a, b }) => {
    const sy = sylOf(lines[li].text), ns = notes.slice(a, b).map(x => ({ ...x })), m = sy.length;
    // 음이 모자라면: 긴 음을 반으로 나눈다(같은 음으로 되풀이해 부른 곳)
    while (ns.length < m) { let bi = 0; ns.forEach((x, q) => { if (x.d > ns[bi].d) bi = q; }); const x = ns[bi]; if (x.d < .12) break; const h = x.d / 2; ns.splice(bi, 1, { ...x, d: h }, { ...x, t: x.t + h, d: h, on: .5 }); }
    // 음이 남으면: 새로 치는 힘이 약하고 짧고 앞 음과 가까운 음을 늘임(멜리스마)으로
    const lx = ns.map(() => 'n');
    if (ns.length > m) {
      const score = ns.map((x, q) => q === 0 ? 1e9 : x.on * 2 + Math.min(1, x.d / .35) + Math.min(1, gapBefore(a + q) / .15) * .6 - (Math.abs(x.p - ns[q - 1].p) <= 2 ? .3 : 0));
      const keep = new Set([...score.keys()].sort((u, v) => score[v] - score[u]).slice(0, m));
      ns.forEach((_, q) => { if (!keep.has(q)) lx[q] = 'e'; });
    } else if (ns.length < m) { // 나눌 수 없으면 마지막 음들에 두 글자씩
      let extra = m - ns.length; for (let q = ns.length - 1; q >= 0 && extra > 0; q--, extra--) lx[q] = 'd';
    }
    return { li, notes: ns, lx, syl: sy };
  });
  return { lines: res };
}

// ── 시각(초) → 16분음표 칸 ── 찾은 박을 따라가며(빠르기가 조금씩 흔들려도)
export function timeToUnits(beats, t, b0 = 0) {
  if (!beats.length) return 0;
  let i = 0; while (i + 1 < beats.length && beats[i + 1] <= t) i++;
  const a = beats[i], b = beats[i + 1] ?? (a + (beats[i] - (beats[i - 1] ?? a - .5)));
  const pos = i + (t - a) / ((b - a) || .5);
  return (pos - b0) * 4;
}

// ── ID3 태그(제목·가수·가사) ──
export function readId3(buf) {
  const d = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return out;
  const ver = u8[3], ss = i => (u8[i] << 21) | (u8[i + 1] << 14) | (u8[i + 2] << 7) | u8[i + 3];
  const size = ss(6); let p = 10;
  if (u8[5] & 0x40) p += ver === 4 ? ss(10) : d.getUint32(10) + 4;
  const dec = (enc, a, b) => {
    const s = u8.subarray(a, b);
    if (enc === 1 || enc === 2) { const le = enc === 1 ? !(s[0] === 0xFE && s[1] === 0xFF) : false; const st = enc === 1 && ((s[0] === 0xFF && s[1] === 0xFE) || (s[0] === 0xFE && s[1] === 0xFF)) ? 2 : 0; return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(s.subarray(st)).replace(/\0+$/, ''); }
    return new TextDecoder(enc === 3 ? 'utf-8' : 'latin1').decode(s).replace(/\0+$/, '');
  };
  const skipStr = (enc, a, b) => { if (enc === 1 || enc === 2) { for (let i = a; i + 1 < b; i += 2) if (!u8[i] && !u8[i + 1]) return i + 2; } else { for (let i = a; i < b; i++) if (!u8[i]) return i + 1; } return b; };
  while (p + 10 <= 10 + size && p + 10 <= u8.length) {
    const id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? ss(p + 4) : d.getUint32(p + 4), a = p + 10, b = Math.min(u8.length, a + fs);
    const enc = u8[a];
    if (id === 'TIT2') out.title = dec(enc, a + 1, b).trim();
    else if (id === 'TPE1') out.artist = dec(enc, a + 1, b).trim();
    else if (id === 'USLT') { const st = skipStr(enc, a + 4, b); out.lyrics = dec(enc, st, b); }
    else if (id === 'COMM') { const st = skipStr(enc, a + 4, b); const c = dec(enc, st, b); if (!out.comment) out.comment = c; }
    p = a + fs;
  }
  return out;
}

// ── 박 격자 ── 찾은 박(흔들림 따라감) 또는 일정한 빠르기(사용자가 고친 값)
export function makeGrid({ beats, bpm, offset = 0, fixed = false, dur = 600 }) {
  if (!fixed && beats && beats.length > 8) return beats;
  const p = 60 / bpm, out = []; let t = offset; while (t - p > -p * 8 && t > 0) t -= p;
  for (; t < dur + p; t += p) out.push(+t.toFixed(4));
  return out;
}
// 가장 가까운 박의 번호
const beatIndexAt = (beats, t) => { let i = 0; while (i + 1 < beats.length && Math.abs(beats[i + 1] - t) < Math.abs(beats[i] - t)) i++; return i; };

// ── 곡 만들기 ── 분석 결과 + 가사 → 플랫폼 곡(2마디 한 줄, 16분음표 칸)
// notes: trackNotes 결과(vad 포함) · beats: 박 시각 · bar1: 1박인 박 번호(마디 맞춤 기준) · grid: 1|2
export function buildSong({ notes, lyrics, beats, bar1 = 0, grid = 2, vadMin = .42, regions = null, pickups = [0, 2, 4, 6, 8, 12], dp = false }) {
  const lines = parseLyrics(lyrics || '');
  let vn = regions ? notes.filter(x => regions.some(r => x.t + x.d * .5 >= r[0] - .3 && x.t < r[1] + .3)) : notes.filter(x => x.vad == null || x.vad >= vadMin);
  // 1) 가사 붙이기
  let placed;
  if (lines.length) {
    const al = regions && regions.length ? alignByRegions(vn, lines, regions, lyrics, { dp }) : alignLyrics(vn, lines);
    placed = al.lines.flatMap(r => {
      const src = lines[r.li].text, gap = []; let k = -1; for (const ch of src) { if (/[\p{L}\p{N}]/u.test(ch)) { k++; gap[k] = ''; } else if (k >= 0) gap[k] += ch; }
      let si = 0;
      return r.notes.map((x, q) => {
        const lx = r.lx[q]; let syl = '';
        if (lx === 'n') { syl = (r.syl[si] || '') + (gap[si] || ''); si++; }
        else if (lx === 'd') { syl = (r.syl[si] || '') + (r.syl[si + 1] || '') + (gap[si + 1] || ''); si += 2; }
        if (q === r.notes.length - 1 && si < r.syl.length) { syl += r.syl.slice(si).map((c, j) => c + (gap[si + j] || '')).join(''); si = r.syl.length; }
        return { ...x, lx, syl, li: r.li, chorus: lines[r.li].chorus, sec: lines[r.li].sec };
      }).map((x, q, arr) => { const lastSyl = arr.map(y => !!y.syl).lastIndexOf(true); return q === lastSyl && !/\s$/.test(x.syl) ? { ...x, syl: x.syl + ' ' } : x; });
    });
  } else placed = vn.map(x => ({ ...x, lx: 'n', syl: '' }));
  if (!placed.length) return null;
  // 2) 시각 → 칸(1박 = 4칸), 1마디 첫 박 = bar1번째 박
  const U = t => timeToUnits(beats, t, bar1);
  let ev = placed.map(x => ({ ...x, u0: U(x.t), u1: U(x.t + x.d) }));
  let q = ev.map(x => ({ ...x, s: Math.round(x.u0 / grid) * grid, e: Math.max(Math.round(x.u0 / grid) * grid + grid, Math.round(x.u1 / grid) * grid) }));
  q.sort((a, b) => a.s - b.s);
  const out = [];
  for (const x of q) {
    const last = out[out.length - 1];
    if (last && x.s <= last.s) { if (x.lx === 'e') continue; if (last.lx === 'e' || !last.syl) { out.pop(); } else { x.s = last.s + grid; } }
    if (last && last.e > x.s) last.e = x.s;
    out.push(x);
  }
  // 짧은 쉼(반 박 이하)은 앞 음을 늘여 메운다 — 노래는 이어 부른다
  for (let i = 0; i + 1 < out.length; i++) { const g = out[i + 1].s - out[i].e; if (g > 0 && g <= 2) out[i].e = out[i + 1].s; }
  out.forEach(x => { if (x.e <= x.s) x.e = x.s + grid; });
  // 3) 못갖춘마디: 첫 음이 마디 끝 박에 있으면 그다음 마디를 1마디로
  const s0 = out[0].s, barF = Math.floor(s0 / 16), inBar = s0 - barF * 16;
  let pickup = 0, base = barF * 16;
  if (inBar >= 8) { const need = 16 - inBar; pickup = pickups.find(v => v >= need) ?? 12; base = (barF + 1) * 16; }
  const notesU = out.map(x => ({ ...x, s: x.s - base, e: x.e - base, uq: x.u0 - base, ud: Math.max(.5, x.u1 - x.u0) })).filter(x => x.s >= -pickup);
  // 4) 2마디 한 줄로 가사 나누기(줄 경계는 −pickup + 32·k)
  const lineOf = s => Math.floor((s + pickup) / 32);
  const nLines = Math.max(1, lineOf(Math.max(...notesU.map(x => x.e - 1))) + 1);
  const L = Array.from({ length: nLines }, () => ({ text: '', chorus: 0, total: 0, sec: '' }));
  const mel = [];
  notesU.forEach(x => {
    const li = lineOf(x.s), l = L[li];
    const first = !mel.some(m => lineOf(m.s) === li);
    let lx = x.lx === 'e' && first ? 'x' : x.lx;
    if (lx === 'd' && [...x.syl].filter(ch => /[\p{L}\p{N}]/u.test(ch)).length < 2) lx = 'n';
    if ((lx === 'n' || lx === 'd') && !x.syl) lx = 'x';
    l.text += lx === 'n' || lx === 'd' ? x.syl : ''; l.total++; if (x.chorus) l.chorus++; if (!l.sec) l.sec = x.sec || '';
    mel.push({ p: x.p, s: x.s, d: Math.max(1, x.e - x.s), lx, t: x.t, uq: x.uq, ud: x.ud });
  });
  // 다음 줄로 넘어가는 늘임표 음은 줄 경계에서 자른다
  mel.forEach((n, i) => { const nx = mel[i + 1]; if (nx && n.s + n.d > nx.s) n.d = Math.max(1, nx.s - n.s); });
  const lyricLines = L.map(l => ({ text: l.text.replace(/\s+/g, ' ').trim(), chorus: l.total > 0 && l.chorus * 2 >= l.total, sec: l.sec }));
  return { melody: mel, lines: lyricLines, pickup, firstBar: base / 16, offsetBeat: bar1 + base / 4 - pickup / 4 };
}

// 노래 소리(보컬 스템)만 있을 때의 '노래가 나오는 곳': 소리 크기(1초 평균)를 0~1로
export function energyActivity(x, { win = .6 } = {}) {
  const n = Math.floor(x.length / HOP), e = new Float32Array(n);
  for (let f = 0; f < n; f++) { let a = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) a += x[i] * x[i]; e[f] = a / HOP; }
  const W = Math.round(FPS * win / 2), sm = new Float32Array(n); let sa = 0;
  for (let i = 0; i < Math.min(n, W); i++) sa += e[i];
  for (let f = 0; f < n; f++) { const a = f - W - 1, b = f + W; if (b < n) sa += e[b]; if (a >= 0) sa -= e[a]; sm[f] = sa / (Math.min(n, b + 1) - Math.max(0, a + 1)); }
  const srt = Float32Array.from(sm).sort(), hi = srt[Math.floor(srt.length * .95)] || 1, lo = srt[Math.floor(srt.length * .2)] || 0;
  for (let f = 0; f < n; f++) sm[f] = Math.max(0, Math.min(1, (Math.sqrt(sm[f]) - Math.sqrt(lo)) / (Math.sqrt(hi) - Math.sqrt(lo) || 1)));
  return sm;
}
// 노래 구간: 활동도가 기준을 넘는 곳(짧은 틈은 잇고, 짧은 조각은 버린다)
export function vocalRegions(vad, { thr = .45, minLen = 2.5, join = 2.5 } = {}) {
  const out = []; let a = -1;
  for (let f = 0; f <= vad.length; f++) { const on = f < vad.length && vad[f] >= thr; if (on && a < 0) a = f; if (!on && a >= 0) { out.push([a / FPS, f / FPS]); a = -1; } }
  const m = []; for (const r of out) { const l = m[m.length - 1]; if (l && r[0] - l[1] < join) l[1] = r[1]; else m.push([...r]); }
  return m.filter(r => r[1] - r[0] >= minLen);
}
export const INSTR = /intro|interlude|instrumental|solo|break|bridge.*inst|간주|전주|후주/i;
// 가사 묶음(연속으로 부르는 구간들) ↔ 노래 구간을 차례로 짝짓고, 묶음 안에서는 글자 수 비율과 쉼 자리로 줄을 나눈다
// 가사 묶음 ↔ 노래 구간: 간주 표시·빈 줄(연)로 줄을 묶고, 묶음마다 노래 구간 하나를 짝짓는다
export function lyricGroups(notes, lines, regions, rawText = '') {
  if (!lines.length || !regions || !regions.length) return [];
  // 묶음: 악기만 나오는 표시([Interlude] 등)가 있으면 그 앞뒤를 나눈다
  const groups = []; let g = null, lastSec = null;
  const tags = []; String(rawText).replace(/\r/g, '').split('\n').forEach(ln => { const t = ln.trim().match(/^\[([^\]]*)\]$/); if (t) tags.push(t[1]); });
  const instAfter = new Set(); { let cur = null; String(rawText).replace(/\r/g, '').split('\n').forEach(ln => { const t = ln.trim().match(/^\[([^\]]*)\]$/); if (t) { if (INSTR.test(t[1]) && cur) instAfter.add(cur); return; } if (ln.trim()) cur = ln.trim().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); }); }
  lines.forEach((l, i) => { if (!g || (i > 0 && instAfter.has(lines[i - 1].text) && lastSec !== null)) { g = { idx: [] }; groups.push(g); } g.idx.push(i); lastSec = l.sec; });
  const syl = lines.map(l => sylOf(l.text).length);
  // 노래 구간이 묶음보다 많으면(간주 표시 없이 빈 줄로만 연을 나눈 가사) 연(빈 줄·[표시] 다음 줄)에서도 나눈다
  if (regions.length > groups.length) {
    const stz = []; let br = false;
    String(rawText).replace(/\r/g, '').split('\n').forEach(ln => {
      const s = ln.trim(); if (!s || /^\[[^\]]*\]$/.test(s)) { br = true; return; }
      if (!s.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()) return;
      stz.push(stz.length > 0 && br); br = false;
    });
    const must = new Set(groups.slice(1).map(gr => gr.idx[0]));
    const blocks = []; lines.forEach((_, i) => { if (!blocks.length || stz[i] || must.has(i)) blocks.push([]); blocks[blocks.length - 1].push(i); });
    if (blocks.length > groups.length) {
      const G = Math.min(regions.length, blocks.length);
      let parts = blocks.map(b => b);
      if (blocks.length > G) { // 연을 G개 묶음으로: 글자 수 몫이 노래 구간 길이 몫과 가깝게(간주 자리는 꼭 나눈다)
        const Rs = [...regions].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, G).sort((a, b) => a[0] - b[0]);
        const dur = Rs.map(r => r[1] - r[0]), dT = dur.reduce((a, v) => a + v, 0), bs = blocks.map(b => b.reduce((a, i) => a + syl[i], 0)), sT = bs.reduce((a, v) => a + v, 0) || 1;
        const B = blocks.length, dp = Array.from({ length: G + 1 }, () => Array(B + 1).fill(1e9)), bk = Array.from({ length: G + 1 }, () => Array(B + 1).fill(-1));
        dp[0][0] = 0;
        for (let q = 1; q <= G; q++) for (let b = q; b <= B; b++) for (let a = q - 1; a < b; a++) {
          if (dp[q - 1][a] >= 1e9) continue;
          let bad = false; for (let x = a + 1; x < b; x++) if (must.has(blocks[x][0])) { bad = true; break; }
          if (bad) continue;
          let s = 0; for (let x = a; x < b; x++) s += bs[x];
          const v = dp[q - 1][a] + (s / sT - dur[q - 1] / dT) ** 2;
          if (v < dp[q][b]) { dp[q][b] = v; bk[q][b] = a; }
        }
        if (dp[G][B] < 1e9) { parts = []; let b = B; for (let q = G; q > 0; q--) { const a = bk[q][b]; parts.unshift(blocks.slice(a, b).flat()); b = a; } }
        else parts = null;
      }
      if (parts) { groups.length = 0; parts.forEach(p => groups.push({ idx: p.flat ? p.flat() : p })); }
    }
  }
  // 노래 구간이 묶음보다 많으면 가장 짧은 것부터 버리고, 적으면 가장 긴 구간을 가장 긴 쉼에서 나눈다
  let R = regions.map(r => [...r]);
  const noteGapSplit = r => { const ns = notes.filter(x => x.t >= r[0] && x.t < r[1]); let best = null, bg = 0; for (let i = 1; i < ns.length; i++) { const gp = ns[i].t - (ns[i - 1].t + ns[i - 1].d); if (gp > bg) { bg = gp; best = ns[i].t - gp / 2; } } return best ?? (r[0] + r[1]) / 2; };
  while (R.length > groups.length) { let k = 0; R.forEach((r, i) => { if (r[1] - r[0] < R[k][1] - R[k][0]) k = i; }); R.splice(k, 1); }
  while (R.length < groups.length && R.length) { let k = 0; R.forEach((r, i) => { if (r[1] - r[0] > R[k][1] - R[k][0]) k = i; }); const m = noteGapSplit(R[k]); R.splice(k, 1, [R[k][0], m], [m, R[k][1]]); }
  return groups.map((gr, gi) => ({ idx: gr.idx, r: R[gi] })).filter(gr => gr.r);
}
export function alignByRegions(notes, lines, regions, rawText = '', { dp = false } = {}) {
  if (!lines.length || !notes.length) return { lines: [] };
  const syl = lines.map(l => sylOf(l.text).length);
  const res = [];
  lyricGroups(notes, lines, regions, rawText).forEach(gr => {
    const r = gr.r;
    let ns = notes.filter(x => x.t + x.d * .5 >= r[0] - .3 && x.t < r[1] + .3);
    // 구간 앞뒤의 흐린 음(반주가 섞인 곳)은 덜어 낸다
    const strong = x => x.vad == null || (x.vad >= .55 && x.d >= .15);
    while (ns.length > 3 && !strong(ns[0])) ns.shift();
    while (ns.length > 3 && !strong(ns[ns.length - 1])) ns.pop();
    if (!ns.length) return;
    const t0 = ns[0].t, t1 = ns[ns.length - 1].t + ns[ns.length - 1].d;
    const tot = gr.idx.reduce((a, i) => a + syl[i], 0);
    // 줄 경계: 글자 수 비율 자리 근처(±줄 길이의 35%)에서 가장 긴 쉼
    // dp(이어 부르는 노래 MIDI): 쉼이 없어도 긴 음(줄 끝 늘임) 뒤를 줄이 바뀌는 자리로 본다
    const med = dp ? ns.map(x => x.d).sort((a, b) => a - b)[ns.length >> 1] : 0;
    const cuts = [t0]; let acc = 0;
    gr.idx.slice(0, -1).forEach(i => {
      acc += syl[i]; const want = t0 + (t1 - t0) * acc / tot, span = (t1 - t0) * syl[i] / tot * .35;
      let best = want, bs = -1e9;
      for (let k = 1; k < ns.length; k++) { const gs = ns[k - 1].t + ns[k - 1].d, ge = ns[k].t, mid = (gs + ge) / 2; if (Math.abs(mid - want) > span || mid <= cuts[cuts.length - 1] + .5) continue; const sc = (ge - gs) * 3 - Math.abs(mid - want) / span + (dp && ns[k - 1].d >= med * 2.2 ? .9 : 0); if (sc > bs) { bs = sc; best = ge - .01; } }
      cuts.push(best);
    });
    cuts.push(t1 + 1);
    gr.idx.forEach((li, k) => {
      const seg = ns.filter(x => x.t >= cuts[k] - .02 && x.t < cuts[k + 1] - .02).map(x => ({ ...x }));
      if (!seg.length) return;
      const sy = sylOf(lines[li].text), m = sy.length;
      while (seg.length < m) { let bi = 0; seg.forEach((x, q) => { if (x.d > seg[bi].d) bi = q; }); const x = seg[bi]; if (x.d < .14) break; const h = x.d / 2; seg.splice(bi, 1, { ...x, d: h }, { ...x, t: x.t + h, d: h, on: .5 }); }
      const lx = seg.map(() => 'n');
      if (seg.length > m) {
        const gb = q => q === 0 ? 9 : seg[q].t - (seg[q - 1].t + seg[q - 1].d);
        const score = seg.map((x, q) => q === 0 ? 1e9 : x.on * 2 + Math.min(1, x.d / .35) + Math.min(1, gb(q) / .15) * .6 - (x.p === seg[q - 1].p ? 0 : Math.abs(x.p - seg[q - 1].p) <= 2 ? .3 : 0));
        const keep = new Set([...score.keys()].sort((u, v) => score[v] - score[u]).slice(0, m));
        seg.forEach((_, q) => { if (!keep.has(q)) lx[q] = 'e'; });
      } else if (seg.length < m) { let extra = m - seg.length; for (let q = seg.length - 1; q >= 0 && extra > 0; q--, extra--) lx[q] = 'd'; }
      res.push({ li, notes: seg, lx, syl: sy });
    });
  });
  return { lines: res };
}

// ── 노래 MIDI(수노 Vocals MIDI 등)로 만들기 ── 음 찾기 없이 몇 초 만에, 음높이는 MIDI 그대로
// raw: [{p, v, t0, t1}](틱) · sec: 틱 → 초(MIDI 빠르기 지도 — 수노 MIDI는 원곡 박을 따라 박마다 빠르기가 적혀 있다) · div: 4분음표 틱
export function midiNotes(raw, sec, div) {
  const ns = raw.filter(n => n.t1 - n.t0 >= div / 12).map(n => ({ p: n.p, t: sec(n.t0), e: sec(n.t1), v: n.v || 90 })).sort((a, b) => a.t - b.t || b.p - a.p);
  const out = [];
  for (const n of ns) {
    const last = out[out.length - 1];
    if (last && n.t - last.t < .03) continue; // 같은 때 친 음은 높은 음(선율) 하나만
    if (last && last.e > n.t) last.e = n.t;
    out.push({ ...n });
  }
  const vm = Math.max(1, ...out.map(n => n.v));
  return out.filter(n => n.e - n.t >= .05).map(n => ({ p: n.p, t: n.t, d: n.e - n.t, on: .55 + .45 * n.v / vm, amp: .8 }));
}
export function midiBeats(sec, div, lastTick, extra = 8) {
  const b = [], n = Math.ceil(lastTick / div) + extra;
  for (let k = 0; k <= n; k++) b.push(sec(k * div));
  return b;
}
// 노래 구간: 음이 이어지는 곳(짧은 쉼은 잇는다)
export function noteRegions(notes, { join = 2.5, minLen = 1.5 } = {}) {
  const m = [];
  for (const x of notes) { const l = m[m.length - 1]; if (l && x.t - l[1] < join) l[1] = Math.max(l[1], x.t + x.d); else m.push([x.t, x.t + x.d]); }
  return m.filter(r => r[1] - r[0] >= minLen);
}
export const medianBpm = beats => { const d = beats.slice(1).map((t, i) => t - beats[i]).filter(x => x > .15).sort((a, b) => a - b); return d.length ? 60 / d[d.length >> 1] : 100; };
// 가사 한 줄이 몇 박에 걸치나 — 플랫폼은 한 줄이 2마디(8박)
export function beatsPerLine(regions, beats, nLines) {
  if (!nLines || !regions || !regions.length) return 0;
  const pos = t => timeToUnits(beats, t) / 4;
  return regions.reduce((a, r) => a + pos(r[1]) - pos(r[0]), 0) / nLines;
}
// 선율이 박 위에 놓인 자리와 무게(긴 음·구절 첫 음일수록 센 박에 온다)
function beatHits(notes, beats) {
  const pos = t => timeToUnits(beats, t) / 4, out = [];
  notes.forEach((x, i) => {
    const b = pos(x.t), j = Math.round(b);
    if (Math.abs(b - j) > .2) return;
    const len = pos(x.t + x.d) - b, gap = i ? b - pos(notes[i - 1].t + notes[i - 1].d) : 9;
    out.push({ j, w: Math.min(4, Math.max(0, len)) + (gap >= 1.5 ? 1.5 : 0) });
  });
  return out;
}
// 마디 첫 박 찾기(선율만으로): beats[k], beats[k+4], … 가 1박
export function melodyPhase(notes, beats, meter = 4) {
  const sc = Array(meter).fill(0);
  beatHits(notes, beats).forEach(({ j, w }) => { const k = ((j % meter) + meter) % meter; sc[k] += w; if (meter === 4) sc[(k + 2) % 4] += w * .3; });
  let k = 0; for (let i = 1; i < meter; i++) if (sc[i] > sc[k]) k = i;
  return k;
}
// ÷2(박 두 개를 하나로)일 때 남길 박: 선율이 더 잘 맞는 쪽(홀·짝)
export function bestOffset(notes, beats, step) {
  const sc = Array(step).fill(0);
  beatHits(notes, beats).forEach(({ j, w }) => { sc[((j % step) + step) % step] += w; });
  let o = 0; for (let i = 1; i < step; i++) if (sc[i] > sc[o]) o = i;
  return o;
}
// 박 시각 고쳐 쓰기: ×2(사이에 박 넣기) · ÷2(off번째부터 하나 건너 하나) — 빠르기가 흔들려도 원곡 박을 따라간다
export function scaleBeats(beats, mul, off = 0) {
  if (mul === 1) return beats.slice();
  if (mul < 1) { const st = Math.round(1 / mul); return beats.filter((_, i) => (((i - off) % st) + st) % st === 0); }
  const st = Math.round(mul), out = [];
  beats.forEach((t, i) => { const nx = beats[i + 1] ?? t + (t - (beats[i - 1] ?? t - .5)); for (let q = 0; q < st; q++) out.push(t + (nx - t) * q / st); });
  return out;
}
export const halfShift = beats => beats.map((t, i) => (t + (beats[i + 1] ?? t + (t - (beats[i - 1] ?? t - .5)))) / 2);
// 구간마다 마디 첫 박 다시 맞추기: 간주(2마디 넘는 쉼)에서 박을 빼, 다음 노래 구간도 제 1박에서 시작하게
// (수노 곡은 간주에 2/4 마디가 끼거나 박 지도가 한두 박 어긋나는 일이 잦다 — 플랫폼은 간주를 빈 줄로 두므로 괜찮다)
export function alignSections(notes, beats, regions, meter = 4) {
  const inR = r => notes.filter(x => x.t >= r[0] - .3 && x.t < r[1] + .3);
  const R = (regions || []).filter(r => inR(r).length);
  if (!R.length) return { beats, k: melodyPhase(notes, beats, meter), cut: 0 };
  const b = beats.slice(), k = melodyPhase(inR(R[0]), b, meter);
  let cut = 0;
  for (let i = 1; i < R.length; i++) {
    const ns = inR(R[i]); if (ns.length < 8) continue;
    const ia = Math.ceil(timeToUnits(b, R[i - 1][1]) / 4), ib = Math.floor(timeToUnits(b, R[i][0]) / 4);
    if (ib - ia < 2 * meter) continue;
    const m = (((melodyPhase(ns, b, meter) - k) % meter) + meter) % meter;
    if (!m) continue;
    b.splice(Math.round((ia + ib) / 2) - (m >> 1), m); cut += m;
  }
  return { beats: b, k, cut };
}
// 가사 줄마다 첫 음의 시각(가사를 음표에 맞춰 본 결과)
export function lyricLineStarts(notes, lyrics, regions = null, dp = false) {
  const lines = parseLyrics(lyrics || ''); if (!lines.length || !notes.length) return [];
  const vn = regions && regions.length ? notes.filter(x => regions.some(r => x.t + x.d * .5 >= r[0] - .3 && x.t < r[1] + .3)) : notes;
  const al = regions && regions.length ? alignByRegions(vn, lines, regions, lyrics, { dp }) : alignLyrics(vn, lines);
  return al.lines.map(r => r.notes[0] && r.notes[0].t).filter(t => t != null).sort((a, b) => a - b);
}
// 가사 줄 첫 음이 2마디 줄의 첫 박에 오게 마디를 맞춘다 — 노래 구간(간주로 나뉜 곳)마다 따로 재고,
// 어긋난 구간은 그 앞 간주에서 박을 빼서 맞춘다
export function alignLines(beats, starts, regions, meter = 4, span = 8) {
  const b = beats.slice(), sec = [];
  const R = (regions || []).length ? regions : [[-1e9, 1e9]];
  R.forEach(r => { const s = starts.filter(t => t >= r[0] - .5 && t < r[1] + .5); if (s.length) sec.push({ r, s }); });
  if (!sec.length) return null;
  const wrap = x => { const m = ((x % span) + span) % span; return m >= span / 2 ? m - span : m; };
  const best = s => { const pos = s.map(t => timeToUnits(b, t) / 4); let bp = 0, bc = 1e9; for (let p = 0; p < span; p++) { const c = pos.reduce((a, x) => a + Math.min(1.5, Math.abs(wrap(x - p))), 0); if (c < bc - 1e-6) { bc = c; bp = p; } } return bp; };
  const p0 = best(sec[0].s); let cut = 0;
  for (let i = 1; i < sec.length; i++) {
    const m = (((best(sec[i].s) - p0) % span) + span) % span; if (!m) continue;
    const ia = Math.ceil(timeToUnits(b, sec[i - 1].r[1]) / 4) + 1, ib = Math.floor(timeToUnits(b, sec[i].r[0]) / 4) - 1;
    if (ib - ia < m + 2) continue; // 간주가 짧으면 그대로
    b.splice(Math.round((ia + ib - m) / 2), m); cut += m;
  }
  return { beats: b, k: p0 % meter, cut };
}
