// 음원 악보 다듬기 (v13) — 화면 없음, 브라우저·노드 공용
// ① 루바토 박 다듬기 + 교차 검증: 박 후보(MIDI 박 지도 · MP3 박 추적 · 고른 빠르기 · 음표로 센 박)를 저마다 여러 번 다듬고,
//    서로 견줘 음표를 가장 단순한 박자로 설명하는 박을 고른다 — 노래가 늘었다 줄었다 해도 박이 따라간다
// ② 박마다 음표 자리 맞춤: 박마다 4분·8분·16분 중 가장 단순하면서 잘 맞는 자리(루바토로 생긴 점16분 같은 군더더기를 없앤다)
// ③ 마디·줄 맞춤: 첫 박 × 못갖춘마디 × 구간마다 어긋남 가설을 모두 견줘 가사 줄이 2마디 줄에 가장 잘 맞는 것
// ④ 가사 붙임새: 줄 안에서 글자마다 음 묶음 — 실러빅(한 글자 한 음) · 네우마틱(2~4음) · 멜리스마틱(5음 이상)
import { timeToUnits, beatTrack, tempoCandidates, parseLyrics, sylOf, scaleBeats, bestOffset, FPS, INSTR } from './a2s.js?v=13';

const posOf = (b, t) => timeToUnits(b, t) / 4; // 시각 → 박 번호(소수)
export function timeAt(b, p) { // 박 번호(소수) → 시각
  const n = b.length; if (!n) return 0; if (n === 1) return b[0] + p * .5;
  const i = Math.max(0, Math.min(n - 2, Math.floor(p)));
  return b[i] + (p - i) * (b[i + 1] - b[i]);
}
// 음표가 놓일 만한 자리: 박 · 반 박 · 4분의 1 박 · 셋잇단(박을 다듬을 때만) — 단순한 자리일수록 먼저
const TARGETS = [[0, 0], [1, 0], [.5, .02], [.25, .06], [.75, .06], [1 / 3, .09], [2 / 3, .09]];
function target(p) {
  const k = Math.floor(p), f = p - k; let best = k, bc = 1e9;
  for (const [g, pen] of TARGETS) { const c = Math.abs(f - g) + pen; if (c < bc) { bc = c; best = k + g; } }
  return best;
}
const fillNaN = c => {
  const known = []; c.forEach((v, i) => { if (!Number.isNaN(v)) known.push(i); });
  if (!known.length) return c.map(() => 0);
  return c.map((v, i) => {
    if (!Number.isNaN(v)) return v;
    let a = -1, b = -1; for (const k of known) { if (k < i) a = k; else { b = k; break; } }
    if (a < 0) return c[b]; if (b < 0) return c[a];
    return c[a] + (c[b] - c[a]) * (i - a) / (b - a);
  });
};
const smooth = c => c.map((v, i) => .25 * (c[i - 1] ?? v) + .5 * v + .25 * (c[i + 1] ?? v));
const noteW = x => .4 + Math.min(1.2, x.d / .5) + (x.on ?? .7);

// 박에 맞춘 어긋남(초, 음 무게로 평균)과 복잡도(4분의 1 박·셋잇단 자리에 놓인 음의 몫)
export function gridScore(notes, b) {
  let e = 0, w = 0, cx = 0;
  notes.forEach(x => { const tg = target(posOf(b, x.t)), f = tg - Math.floor(tg), wt = noteW(x); e += Math.abs(x.t - timeAt(b, tg)) * wt; w += wt; if (Math.abs(f * 2 - Math.round(f * 2)) > 1e-6) cx++; });
  return { err: e / (w || 1), cx: cx / (notes.length || 1) };
}

// ① 박 다듬기: 음마다 가장 그럴듯한 자리를 잡고, 남는 어긋남만큼 그 둘레 박을 옮긴다(고르게 · 박 간격이 뒤집히지 않게) — 여러 번
export function refineBeats(notes, beats, { passes = 5, alpha = .7 } = {}) {
  let b = beats.slice();
  const W = notes.map(noteW), log = [gridScore(notes, b).err];
  for (let it = 0; it < passes; it++) {
    const n = b.length, cs = new Float64Array(n), ws = new Float64Array(n);
    notes.forEach((x, i) => {
      const tg = target(posOf(b, x.t)), r = x.t - timeAt(b, tg), k = Math.floor(tg), f = tg - k;
      if (k >= 0 && k < n) { cs[k] += r * W[i] * (1 - f); ws[k] += W[i] * (1 - f); }
      if (f > 0 && k + 1 >= 0 && k + 1 < n) { cs[k + 1] += r * W[i] * f; ws[k + 1] += W[i] * f; }
    });
    const c = smooth(smooth(fillNaN(Array.from(cs, (v, i) => ws[i] > .15 ? v / ws[i] : NaN))));
    const nb = b.map((t, i) => t + alpha * c[i]);
    for (let i = 1; i < nb.length; i++) { const lo = (b[i] - b[i - 1]) * .7; if (nb[i] - nb[i - 1] < lo) nb[i] = nb[i - 1] + lo; }
    const e = gridScore(notes, nb).err;
    if (e > log[log.length - 1] + .002) break; // 나빠지면 멈춘다
    b = nb; log.push(e);
    if (it >= 2 && log[log.length - 2] - e < .0015) break; // 3번 넘게 다듬어 더 줄지 않으면 끝
  }
  return { beats: b, log };
}

const medIbi = (b, t0 = -1e9, t1 = 1e9) => { const d = []; for (let i = 1; i < b.length; i++) if (b[i] >= t0 && b[i - 1] <= t1) d.push(b[i] - b[i - 1]); d.sort((x, y) => x - y); return d.length ? d[d.length >> 1] : .5; };
// 박 간격을 기준에 맞춘다(×2 · ÷2) — 후보끼리 같은 단위로 견주려고
function levelTo(notes, b, ref) {
  let x = b, g = 0;
  while (g++ < 3) { const r = medIbi(x) / ref; if (r > 1.45) x = scaleBeats(x, 2); else if (r < .69) x = scaleBeats(x, .5, bestOffset(notes, x, 2)); else break; }
  return x;
}
// 음표만으로 박 세기: 음 시작에 무게를 둔 신호를 만들어 박 추적
function noteEnv(notes, dur) {
  const n = Math.ceil((dur + 2) * FPS), env = new Float32Array(n);
  notes.forEach(x => { const f = Math.round(x.t * FPS), w = noteW(x); for (let k = -2; k <= 2; k++) if (f + k >= 0 && f + k < n) env[f + k] += w * Math.exp(-k * k / 2); });
  return env;
}
// 교차 검증: 후보마다 다듬고(3번 넘게), 어긋남 + 복잡도가 가장 작은 박을 고른다. 다른 후보와 박이 얼마나 겹치는지도 잰다
// cands: [{ name, beats }] — 첫 후보를 기준 박 간격으로
export function crossGrids(notes, cands, { dur = 0, regions = null, nLines = 0 } = {}) {
  const list = cands.filter(c => c && c.beats && c.beats.length > 8);
  if (!list.length || !notes.length) return null;
  const t0 = notes[0].t, t1 = notes[notes.length - 1].t + notes[notes.length - 1].d, ref = medIbi(list[0].beats, t0, t1);
  const bpm = 60 / ref, end = Math.max(dur, t1 + 4);
  // 고른 빠르기 후보, 음표로 센 박 후보를 더한다
  const a0 = list[0].beats; let ia = 0; a0.forEach((t, i) => { if (Math.abs(t - t0) < Math.abs(a0[ia] - t0)) ia = i; });
  const flat = []; for (let t = a0[ia] - ia * ref; t < end + ref; t += ref) flat.push(t);
  const envN = noteEnv(notes, end);
  list.push({ name: '고른 빠르기', beats: flat }, { name: '음표로 센 박', beats: beatTrack(envN, bpm) });
  // 빠르기도 견준다: 음표 시작의 되풀이 간격으로 찾은 빠르기(같은 단위로 맞춰 4% 넘게 다르면) — 처음 찾은 빠르기가 틀렸을 때
  const seen = [bpm];
  tempoCandidates(envN, { lo: 30, hi: 240, center: bpm }).slice(0, 4).forEach(c => {
    let v = c.bpm; while (v > bpm * 1.41) v /= 2; while (v < bpm / 1.41) v *= 2;
    if (seen.some(u => Math.abs(v / u - 1) < .04)) return; seen.push(v);
    list.push({ name: `음표로 센 박(♩=${Math.round(v)})`, beats: beatTrack(envN, v) });
  });
  const res = list.map(c => {
    const lv = levelTo(notes, c.beats, ref), s0 = gridScore(notes, lv), rf = refineBeats(notes, lv), s1 = gridScore(notes, rf.beats);
    // 점수: 박 간격에 견준 어긋남(빠르기가 달라도 공정하게) + 복잡도 + 가사 한 줄이 2마디(8박)에서 벗어난 만큼
    const ibi = medIbi(rf.beats, t0, t1), rel = s1.err / ibi;
    let bpl = 0; if (regions && regions.length && nLines) { regions.forEach(r => { bpl += posOf(rf.beats, r[1]) - posOf(rf.beats, r[0]); }); bpl /= nLines; }
    const lineFit = bpl ? Math.abs(Math.log2(bpl / 8)) : 0;
    return { name: c.name, beats: rf.beats, err0: s0.err, err: s1.err, rel, cx: s1.cx, bpl, bpm: 60 / ibi, passes: rf.log.length - 1, score: rel + s1.cx * .05 + lineFit * .15 };
  });
  res.sort((a, b) => a.score - b.score);
  const best = res[0];
  // 겹침: 고른 박의 노래 구간 박 가운데 다른 후보에도 (박 간격 12% 안에) 박이 있는 몫
  // 노래하는 박(음 시작이 박 간격 60% 안에 있는 박)만 견준다 — 간주는 음이 없어 박이 제멋대로다
  const on = notes.map(x => x.t), inSpan = best.beats.filter(t => on.some(u => Math.abs(u - t) < ref * .6));
  res.forEach(r => { if (r === best) { r.agree = 1; return; } let ok = 0; inSpan.forEach(t => { let d = 1e9; for (const u of r.beats) { const v = Math.abs(u - t); if (v < d) d = v; if (u > t + 1) break; } if (d < ref * .12) ok++; }); r.agree = inSpan.length ? ok / inSpan.length : 0; });
  return { beats: best.beats, best: best.name, cands: res };
}

// ② 박마다 음표 자리 맞춤 — mode: 'auto'(박마다 4분·8분·16분 중 단순하고 맞는 자리) · 2(8분) · 1(16분)
export function quantize(notes, beats, { mode = 'auto' } = {}) {
  const SS = mode === 'auto' ? [[1, 0], [2, .6], [4, 2.2]] : +mode === 2 ? [[2, 0]] : [[4, 0]];
  const P = notes.map(x => posOf(beats, x.t)), byBeat = new Map();
  P.forEach((p, i) => { const k = Math.floor(p + .125); if (!byBeat.has(k)) byBeat.set(k, []); byBeat.get(k).push(i); });
  const s = new Array(notes.length), sub = new Array(notes.length);
  byBeat.forEach((idx, k) => {
    let best = null;
    for (const [S, lam] of SS) {
      const sn = idx.map(i => Math.min((S - 1) / S, Math.max(0, Math.round((P[i] - k) * S) / S)));
      let c = lam * idx.length; idx.forEach((i, j) => { c += ((P[i] - k - sn[j]) / .11) ** 2; });
      for (let j = 1; j < sn.length; j++) if (sn[j] <= sn[j - 1]) c += 50; // 두 음이 한 자리에
      if (!best || c < best.c) best = { c, sn, S };
    }
    idx.forEach((i, j) => { s[i] = Math.round((k + best.sn[j]) * 4); sub[i] = best.S; });
  });
  const out = notes.map((x, i) => ({ ...x, s: s[i], sub: sub[i], pos: P[i] }));
  for (let i = 1; i < out.length; i++) if (out[i].s <= out[i - 1].s) out[i].s = out[i - 1].s + 1; // 겹치면 16분 하나 뒤로
  out.forEach((x, i) => {
    const nx = out[i + 1], k = Math.floor(x.s / 4), ibi = timeAt(beats, k + 1) - timeAt(beats, k);
    const gap = nx ? nx.t - (x.t + x.d) : 9;
    if (nx && gap < Math.max(.3, ibi * .45)) x.e = nx.s; // 이어 부른다
    else { const pe = posOf(beats, x.t + x.d) * 4, g = x.sub === 4 ? 1 : 2; x.e = Math.max(x.s + 1, Math.round(pe / g) * g); if (nx) x.e = Math.min(x.e, nx.s); }
    if (x.e <= x.s) x.e = x.s + 1;
  });
  return out;
}

// ④ 가사 붙임새 — 글자가 새로 시작할 만한 음인지(박 세기 · 같은 음 · 쉼 · 긴 앞 음 · 도약 · 순차 짧은 음 · 세기)
const metW = u => { const m = ((u % 16) + 16) % 16; return m === 0 ? 1 : m === 8 ? .8 : m % 4 === 0 ? .55 : m % 2 === 0 ? .3 : .12; };
function startScore(ns, i, bar0) {
  if (i === 0) return 0;
  const x = ns[i], pv = ns[i - 1], dp = Math.abs(x.p - pv.p), rest = x.s - pv.e >= 1;
  let v = metW(x.s - bar0);
  if (dp === 0) v += 1.1; // 같은 음을 다시 치면 대개 새 글자
  if (rest) v += .7;
  if (pv.e - pv.s >= 6) v += .35; // 앞 음이 길면(늘임 뒤) 새 글자
  if (dp >= 3) v += .25;
  if (dp >= 1 && dp <= 2 && pv.e - pv.s <= 2 && !rest) v -= .35; // 짧은 순차 흐름은 한 글자 꾸밈(네우마·멜리스마)
  v += ((x.on ?? .75) - .75) * 1.2;
  return v;
}
const SIZE = [0, 0, .45, .85, 1.2];
const sizeCost = (n, last) => (n <= 4 ? SIZE[n] : 1.2 + .3 * (n - 4)) * (last ? .45 : 1);
function innerCost(ns, a, b) { let c = 0; for (let q = a + 1; q < b; q++) { const d = Math.abs(ns[q].p - ns[q - 1].p); if (d >= 5) c += .5; if (d === 0) c += .6; } return c; }
// 한 줄: 음 ns(가사 줄 하나) · m글자 → 글자마다 음 묶음 [크기…]
export function groupSyllables(ns, m, bar0 = 0) {
  const k = ns.length; if (!m || !k) return { sizes: [], cost: 0 };
  if (k <= m) return { sizes: ns.map(() => 1), cost: 0 };
  const INF = 1e9, dp = Array.from({ length: m + 1 }, () => new Float64Array(k + 1).fill(INF)), bk = Array.from({ length: m + 1 }, () => new Int32Array(k + 1).fill(-1));
  const st = ns.map((_, i) => startScore(ns, i, bar0));
  dp[0][0] = 0;
  for (let j = 1; j <= m; j++) for (let i = j; i <= k - (m - j); i++) for (let a = j - 1; a < i; a++) {
    if (dp[j - 1][a] >= INF) continue;
    const v = dp[j - 1][a] - st[a] + sizeCost(i - a, j === m) + innerCost(ns, a, i);
    if (v < dp[j][i]) { dp[j][i] = v; bk[j][i] = a; }
  }
  const sizes = []; let i = k; for (let j = m; j > 0; j--) { const a = bk[j][i]; sizes.unshift(i - a); i = a; }
  return { sizes, cost: dp[m][k] };
}
// 붙임새 이름: 끝 글자를 뺀 글자가 모두 한 음이면 실러빅, 가장 긴 묶음이 4음까지면 네우마틱, 5음 넘으면 멜리스마틱
export function settingOf(sizes) {
  if (!sizes.length) return '';
  const mx = Math.max(...sizes), body = Math.max(1, ...sizes.slice(0, -1));
  return mx >= 5 ? 'melismatic' : body <= 1 && sizes[sizes.length - 1] <= 4 ? 'syllabic' : 'neumatic';
}

// ④ 한 줄 붙임새 DP — 음 ns를 차례로 보며 m글자를 놓는다
//  n: 새 글자(박 세기·같은 음·쉼·긴 앞 음·도약·세기가 클수록) · e: 앞 글자 늘임(순차·이어 부름일수록, 줄 끝 글자는 싸게)
//  s: 긴 음을 박자에 맞게 둘로 나눠 두 글자(길수록 싸게) · d: 한 음에 두 글자(나눌 수 없을 때만)
//  낱말 단서: 쉼 뒤에는 낱말 첫 글자가 오고, 낱말 가운데에서 쉬는 일은 드물다
export function setLine(ns, wInit, m, bar0 = 0, half = () => 0) {
  const k = ns.length, INF = 1e9;
  if (!k || !m) return { ops: ns.map(() => 'x'), cost: 0 };
  const dp = Array.from({ length: k + 1 }, () => new Float64Array(m + 1).fill(INF)), bk = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(null));
  const st = ns.map((_, i) => startScore(ns, i, bar0));
  const rest = i => i > 0 && ns[i].s - ns[i - 1].e >= 2;
  const word = (j, i) => rest(i) ? (wInit[j] ? .8 : -1.2) : 0;
  const cont = (i, last) => (last ? .2 : .45) + (Math.abs(ns[i].p - ns[i - 1].p) >= 5 ? .5 : 0) + (ns[i].p === ns[i - 1].p ? .6 : 0) + (rest(i) ? .8 : 0);
  const splitC = x => { const d = x.e - x.s; return d >= 8 ? .25 : d >= 4 ? .45 : .9; };
  const relax = (i, j, v, from, op) => { if (v < dp[i][j]) { dp[i][j] = v; bk[i][j] = [from, op]; } };
  dp[0][0] = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j <= m; j++) {
    const b = dp[i][j]; if (b >= INF) continue;
    if (j < m) relax(i + 1, j + 1, b - st[i] - word(j, i), j, 'n');
    if (j >= 1 && i > 0) relax(i + 1, j, b + cont(i, j === m), j, 'e');
    if (j + 1 < m && half(ns[i])) relax(i + 1, j + 2, b - st[i] - word(j, i) - .3 - (wInit[j + 1] ? 0 : .1) + splitC(ns[i]), j, 's');
    if (j + 1 < m) relax(i + 1, j + 2, b - st[i] - word(j, i) + 2.5, j, 'd');
  }
  let j = m; if (dp[k][m] >= INF) { j = 0; for (let q = 0; q <= m; q++) if (dp[k][q] < INF) j = q; }
  const ops = []; let i = k;
  while (i > 0) { const [pj, op] = bk[i][j]; ops.unshift(op); j = pj; i--; }
  return { ops, cost: dp[k][m] };
}

// ③ 가사 줄 묶음 ↔ 노래 덩어리: 노래 구간을 긴 쉼(간주, 8초 넘게)에서만 끊어 덩어리로 보고,
//    가사 줄을 차례대로 덩어리에 나눠 준다 — 글자 수 몫이 덩어리 길이 몫과 가깝게, [간주] 표시 자리에서 끊기게, 빈 줄(연) 자리를 좋아하게
//    (덩어리 안의 연·후렴은 줄 나누기 DP가 2마디 줄 격자를 보며 나눈다 — 노래 구간이 흔들려 잘게 끊겨도 가사가 밀리지 않는다)
export function lineGroups(lines, regions, rawText = '', gapSec = 8) {
  if (!lines.length) return [];
  const SR = []; [...(regions || [])].sort((a, b) => a[0] - b[0]).forEach(r => { const l = SR[SR.length - 1]; if (l && r[0] - l[1] < gapSec) { l[1] = Math.max(l[1], r[1]); l.d += r[1] - r[0]; } else { const x = [r[0], r[1]]; x.d = r[1] - r[0]; SR.push(x); } });
  if (!SR.length) return [{ idx: lines.map((_, i) => i), r: [-1e9, 1e9] }];
  // 줄마다: 앞에 [간주] 표시가 있었나(inst) · 빈 줄·[표시] 뒤 연 첫 줄인가(stz) — parseLyrics와 같은 차례로
  const inst = [], stz = []; let br = false, ib = false;
  String(rawText).replace(/\r/g, '').split('\n').forEach(ln => {
    const s = ln.trim(), tag = s.match(/^\[([^\]]*)\]$/);
    if (!s || tag) { br = true; if (tag && INSTR.test(tag[1])) ib = true; return; }
    if (!s.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()) return;
    inst.push(inst.length > 0 && ib); stz.push(stz.length > 0 && br); br = false; ib = false;
  });
  const syl = lines.map(l => sylOf(l.text).length), sT = syl.reduce((a, v) => a + v, 0) || 1, dT = SR.reduce((a, r) => a + r.d, 0) || 1;
  const S = SR.length, L = lines.length, INF = 1e9;
  const cost = (s, a, b) => { // s번째 덩어리에 줄 a..b-1
    let c = 0, n = 0; for (let i = a; i < b; i++) { n += syl[i]; if (i > a && inst[i]) c += 4; }
    c += ((n / sT - SR[s].d / dT) ** 2) * 12;
    if (a === b) c += SR[s].d > 6 ? 2 : .2; // 노래 덩어리에 가사가 하나도 없으면
    else if (a > 0) c += inst[a] ? 0 : stz[a] ? .3 : 1.2;
    return c;
  };
  const dp = Array.from({ length: S + 1 }, () => new Float64Array(L + 1).fill(INF)), bk = Array.from({ length: S + 1 }, () => new Int32Array(L + 1).fill(-1));
  dp[0][0] = 0;
  for (let s = 1; s <= S; s++) for (let b = 0; b <= L; b++) for (let a = 0; a <= b; a++) { if (dp[s - 1][a] >= INF) continue; const v = dp[s - 1][a] + cost(s - 1, a, b); if (v < dp[s][b]) { dp[s][b] = v; bk[s][b] = a; } }
  const out = []; let b = L; for (let s = S; s > 0; s--) { const a = bk[s][b]; if (b > a) out.unshift({ idx: Array.from({ length: b - a }, (_, i) => a + i), r: [SR[s - 1][0], SR[s - 1][1]] }); b = a; }
  return out;
}

// ③ 한 묶음(노래 구간) 안에서 가사 줄마다 음 고르기 — 줄 격자(2마디, 첫 박 bar0, 못갖춘마디 pk)를 보고
function segment(ns, ms, grid) {
  const N = ns.length, M = ms.length, INF = 1e9;
  if (!N || !M) return { cost: N * .3, seg: [] };
  const { bar0, pk } = grid;
  const toLine = u => { const r = (((u - bar0 + pk) % 32) + 32) % 32; return Math.min(r, 32 - r); };
  const bc = a => { const d = toLine(ns[a].s); let c = d === 0 ? 0 : d === 1 || d === 3 ? .75 : d === 2 ? .55 : d === 4 ? .8 : 1.4 + d / 16; if (a === 0 || ns[a].s - ns[a - 1].e >= 2 || ns[a - 1].e - ns[a - 1].s >= 6) c -= .3; return c; };
  const lc = (j, a, b) => {
    const k = b - a, m = ms[j];
    let c;
    if (k >= m) c = Math.max(0, k / m - 1.25) * 1.5 + (k - m) * .12; // 남는 음은 꾸밈(네우마·멜리스마)으로 — 공짜는 아니다
    else { // 음이 모자라면 긴 음을 박자에 맞게 나눌 수 있는 만큼은 싸게(같은 음으로 되풀이해 부른 곳 · MIDI가 두 글자를 한 음으로 적은 곳)
      let cap = 0; for (let q = a; q < b; q++) cap += Math.max(0, Math.floor((ns[q].e - ns[q].s) / 2) - 1);
      const need = m - k; c = Math.min(need, cap) * .3 + Math.max(0, need - cap) * 1.1 + (k < m * .6 ? 5 : 0);
    }
    const span = ns[b - 1].e - ns[a].s;
    c += Math.max(0, span - 36) * .06 + Math.max(0, 20 - span) * .04; // 가사 한 줄은 대개 2마디
    for (let q = a + 1; q < b; q++) if (ns[q].s - ns[q - 1].e >= 8) c += 2; // 줄 안에 두 박 넘는 쉼은 드물다
    return c + bc(a);
  };
  // 가사 없이 넘기는 음: 묶음 앞(.3) · 줄 사이(.5) · 묶음 끝(.15 — 가사에 없는 되풀이·허밍은 대개 끝에 있다)
  const skip = j => j === 0 ? .3 : j === M ? .15 : .5;
  const dp = Array.from({ length: M + 1 }, () => new Float64Array(N + 1).fill(INF)), bk = Array.from({ length: M + 1 }, () => new Int32Array(N + 1).fill(-1));
  dp[0][0] = 0; for (let i = 1; i <= N; i++) { dp[0][i] = dp[0][i - 1] + skip(0); bk[0][i] = -2; }
  for (let j = 1; j <= M; j++) {
    const m = ms[j - 1], kmax = Math.ceil(m * 3.2) + 3;
    dp[j][0] = dp[j - 1][0] + 3; bk[j][0] = 0; // 음이 하나도 없는 줄(부르지 않은 줄)
    for (let i = 1; i <= N; i++) {
      let b = dp[j][i - 1] + skip(j), bi = -2;
      if (dp[j - 1][i] + 3 < b) { b = dp[j - 1][i] + 3; bi = 0; }
      for (let k = 1; k <= kmax && k <= i; k++) { const pv = dp[j - 1][i - k]; if (pv >= INF) continue; const v = pv + lc(j - 1, i - k, i); if (v < b) { b = v; bi = k; } }
      dp[j][i] = b; bk[j][i] = bi;
    }
  }
  const seg = []; let j = M, i = N;
  while (j > 0) { const b = bk[j][i]; if (b === -2) { i--; continue; } if (b === 0) { j--; continue; } if (b < 0) break; seg.unshift({ j: j - 1, a: i - b, b: i }); i -= b; j--; }
  return { cost: dp[M][N], seg };
}

// 노래 구간 밖의 음은 빼고, 구간 사이 간주에서 박을 덜어 내는 자리
const inRegion = (x, r) => x.t + x.d * .5 >= r[0] - .3 && x.t < r[1] + .3;
function cutBeats(beats, cuts) { // cuts: [{ at: 박 번호(가운데), n }]
  let b = beats.slice(); [...cuts].sort((x, y) => y.at - x.at).forEach(c => { if (c.n > 0) b.splice(Math.max(1, c.at - (c.n >> 1)), c.n); }); return b;
}

// ③+④ 곡 만들기(v13): 음(초) + 다듬은 박 + 가사 → 플랫폼 곡(2마디 한 줄, 16분음표 칸)
// shift: 손으로 옮긴 첫 박(박 수) · mode: 'auto' | 2 | 1
export function buildSongQ({ notes, lyrics, beats, regions = null, mode = 'auto', shift = 0, pickups = [0, 2, 4, 6, 8, 12] }) {
  const lines = parseLyrics(lyrics || '');
  const vn = regions && regions.length ? notes.filter(x => regions.some(r => inRegion(x, r))) : notes.slice();
  if (!vn.length) return null;
  const groups = lines.length ? (regions && regions.length ? lineGroups(lines, regions, lyrics) : [{ idx: lines.map((_, i) => i), r: [-1e9, 1e9] }]) : [];
  const ms = lines.map(l => sylOf(l.text).length);
  let q = quantize(vn, beats, { mode });
  const gnotes = gr => q.filter(x => inRegion(x, gr.r));
  // 첫 박 가설 점수(가사가 없을 때 · 보탬): 긴 음과 쉼 뒤 음이 센 박에
  const metPrior = bar0 => { let v = 0; q.forEach((x, i) => { const w = Math.min(4, (x.e - x.s) / 4) + (i && x.s - q[i - 1].e >= 4 ? 1 : 0); const m = (((x.s - bar0) % 16) + 16) % 16; v += m === 0 ? w : m === 8 ? w * .4 : 0; }); return v; };
  // ── 가설 견주기: 첫 박 4 × 못갖춘마디 6 × 구간마다 줄 어긋남 0~7박 ──
  const hyps = [];
  for (let k = 0; k < 4; k++) for (const pk of pickups) {
    const bar0 = k * 4; let cost = pk * .04 - metPrior(bar0) * .03, offs = [], acc = 0;
    groups.forEach((gr, gi) => {
      const ns = gnotes(gr); if (!ns.length) { offs.push(0); return; }
      const gms = gr.idx.map(i => ms[i]);
      let best = null;
      const range = gi === 0 ? [0] : [0, 1, 2, 3, 4, 5, 6, 7];
      for (const e of range) {
        const shifted = ns.map(x => ({ ...x, s: x.s - (acc + e) * 4, e: x.e - (acc + e) * 4 }));
        const c = segment(shifted, gms, { bar0, pk }).cost + (e ? .6 : 0);
        if (!best || c < best.c) best = { c, e };
      }
      cost += best.c; offs.push(best.e); acc += best.e;
    });
    if (!groups.length) cost = -metPrior(bar0) + pk * .1;
    hyps.push({ k, pk, cost, offs });
  }
  hyps.sort((a, b) => a.cost - b.cost);
  let h = hyps[0];
  if (shift) { // 손으로 옮긴 첫 박: 그 첫 박에서 가장 나은 가설
    const k2 = (((h.k + shift) % 4) + 4) % 4; h = hyps.find(x => x.k === k2) || h;
  }
  // ── 고른 가설대로 간주에서 박을 덜고 다시 맞춘다 ──
  const cuts = []; let fb = beats;
  if (h.offs.some(e => e)) {
    let acc = 0;
    groups.forEach((gr, gi) => {
      const e = h.offs[gi]; acc += e; if (!e || gi === 0) return;
      const prev = gnotes(groups[gi - 1]), cur = gnotes(gr); if (!prev.length || !cur.length) return;
      const a = Math.ceil(posOf(beats, prev[prev.length - 1].t + prev[prev.length - 1].d)) + 1, b = Math.floor(posOf(beats, cur[0].t)) - 1;
      if (b - a >= e + 1) cuts.push({ at: Math.round((a + b) / 2), n: e });
    });
    fb = cutBeats(beats, cuts);
    q = quantize(vn, fb, { mode });
  }
  const bar0 = h.k * 4, pk = h.pk;
  // ── 줄 나누기 · 글자 묶음 ──
  const lx = q.map(() => 'x'), syl = q.map(() => ''), li = q.map(() => -1), kinds = [];
  const word = lines.map(l => { const gap = []; let j = -1; for (const ch of l.text) { if (/[\p{L}\p{N}]/u.test(ch)) { j++; gap[j] = ''; } else if (j >= 0) gap[j] += ch; } return gap; });
  const wInit = word.map(gap => gap.map((g, j) => j === 0 || /\s/.test(gap[j - 1] || ''))); // 낱말 첫 글자(띄어쓰기 뒤)
  let qq = q;
  groups.forEach(gr => {
    const idx = []; qq.forEach((x, i) => { if (inRegion(x, gr.r)) idx.push(i); });
    if (!idx.length) return;
    const ns = idx.map(i => qq[i]), sg = segment(ns, gr.idx.map(i => ms[i]), { bar0, pk });
    sg.seg.forEach(({ j, a, b }) => {
      const L = gr.idx[j], sy = sylOf(lines[L].text), m = sy.length, gap = word[L];
      let ids = idx.slice(a, b);
      // 나눈 조각이 다음 줄(2마디) 경계를 넘지 않게
      const f0 = qq[ids[0]].s, lim = Math.max(f0 + 32 - ((((f0 - bar0 + pk) % 32) + 32) % 32), qq[ids[ids.length - 1]].s + 1);
      const half = x => { const d = x.e - x.s; let h2 = d >= 8 ? Math.round(d / 2 / 4) * 4 || 4 : d >= 4 ? Math.round(d / 2 / 2) * 2 : Math.floor(d / 2); while (h2 > 1 && x.s + h2 >= lim) h2 = h2 >= 4 ? h2 - 2 : h2 - 1; return x.s + h2 < lim && h2 >= 1 && d - h2 >= 1 ? h2 : 0; };
      // 붙임새 DP: 음마다 '새 글자'(n) · '앞 글자 늘임'(e, 네우마·멜리스마) · '둘로 나눠 두 글자'(s) · '한 음에 두 글자'(d, 최후 수단)
      const plan = setLine(ids.map(id => qq[id]), wInit[L], m, bar0, half);
      // 나누기: 뒤에서부터(번호가 밀리지 않게)
      for (let z = plan.ops.length - 1; z >= 0; z--) {
        if (plan.ops[z] !== 's') continue;
        const x = qq[ids[z]], h2 = half(x);
        const y = { ...x, s: x.s + h2, e: x.e, t: x.t + x.d / 2, d: x.d / 2, on: .5, split: true }; x.e = x.s + h2;
        const at = ids[z] + 1; qq = [...qq.slice(0, at), y, ...qq.slice(at)];
        lx.splice(at, 0, 'x'); syl.splice(at, 0, ''); li.splice(at, 0, -1);
        idx.forEach((v, w) => { if (v >= at) idx[w] = v + 1; }); ids = ids.map(v => v >= at ? v + 1 : v); ids.splice(z + 1, 0, at);
        plan.ops.splice(z, 1, 'n', 'n');
      }
      const lineNotes = ids.map(id => qq[id]);
      let si = 0; const sizes = [];
      plan.ops.forEach((op, z) => {
        const id = ids[z]; li[id] = L;
        if (op === 'e') { lx[id] = 'e'; if (sizes.length) sizes[sizes.length - 1]++; return; }
        const take = op === 'd' ? 2 : 1;
        lx[id] = take > 1 ? 'd' : 'n'; sizes.push(1);
        syl[id] = sy.slice(si, si + take).map((c, w) => c + (gap[si + w] || '')).join(''); si += take;
      });
      if (si < m) { // 그래도 남은 글자는 마지막 글자 음에
        for (let w = ids.length - 1; w >= 0; w--) if (lx[ids[w]] === 'n' || lx[ids[w]] === 'd') { syl[ids[w]] += sy.slice(si).map((c, v) => c + (gap[si + v] || '')).join(''); lx[ids[w]] = 'd'; break; }
      }
      kinds.push({ li: L, kind: settingOf(sizes), sizes, s0: lineNotes[0].s - bar0, k: ids.length, m });
      // 줄 끝 글자 뒤 띄어쓰기
      for (let w = ids.length - 1; w >= 0; w--) if (syl[ids[w]]) { if (!/\s$/.test(syl[ids[w]])) syl[ids[w]] += ' '; break; }
    });
  });
  q = qq;
  if (!lines.length) q.forEach((_, i) => { lx[i] = 'n'; });
  // ── 못갖춘마디 · 첫 줄: 줄 격자(2마디, −pk)에서 첫 음이 든 줄을 1줄로 ──
  const s0 = q[0].s - bar0, n0 = Math.floor((s0 + pk) / 32), base = bar0 + n0 * 32;
  const pickup = pk;
  const out = q.map((x, i) => ({ ...x, s: x.s - base, e: x.e - base, lx: lx[i], syl: syl[i], li: li[i] })).filter(x => x.s >= -pickup);
  const lineOf = s => Math.floor((s + pickup) / 32);
  const nLines = Math.max(1, lineOf(Math.max(...out.map(x => x.e - 1))) + 1);
  const L = Array.from({ length: nLines }, () => ({ text: '', chorus: 0, total: 0, sec: '' }));
  const mel = [];
  out.forEach(x => {
    const l = L[lineOf(x.s)], first = !mel.some(m => lineOf(m.s) === lineOf(x.s));
    let k = x.lx === 'e' && first ? 'x' : x.lx;
    if ((k === 'n' || k === 'd') && !x.syl) k = 'x';
    if (k === 'd' && sylOf(x.syl).length < 2) k = 'n';
    if (k === 'n' || k === 'd') l.text += x.syl;
    l.total++; if (x.li >= 0 && lines[x.li].chorus) l.chorus++; if (!l.sec && x.li >= 0) l.sec = lines[x.li].sec || '';
    const uq = timeToUnits(fb, x.t, bar0 / 4) - (base - bar0);
    mel.push({ p: x.p, s: x.s, d: Math.max(1, x.e - x.s), lx: k, t: x.t, uq, ud: Math.max(.5, timeToUnits(fb, x.t + x.d, bar0 / 4) - (base - bar0) - uq) });
  });
  mel.forEach((n, i) => { const nx = mel[i + 1]; if (nx && n.s + n.d > nx.s) n.d = Math.max(1, nx.s - n.s); });
  const lyricLines = L.map(l => ({ text: l.text.replace(/\s+/g, ' ').trim(), chorus: l.total > 0 && l.chorus * 2 >= l.total, sec: l.sec }));
  const count = { syllabic: 0, neumatic: 0, melismatic: 0 }; kinds.forEach(k => { if (count[k.kind] != null) count[k.kind]++; });
  return {
    melody: mel, lines: lyricLines, pickup, firstBar: base / 16 - h.k / 4, offsetBeat: h.k + base / 4 - bar0 / 4 - pickup / 4,
    grid: { beats: fb, bar1: h.k }, cut: cuts.reduce((a, c) => a + c.n, 0), kinds, count,
    hyps: hyps.slice(0, 3).map(x => ({ k: x.k, pk: x.pk, cost: +x.cost.toFixed(2) })), base
  };
}
