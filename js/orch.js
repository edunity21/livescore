// LIVE SCORE · 편성 엔진 — 실제 악기 편성(인원수)에 맞춰 사람이 연주할 수 있는 파트로 계산해 묶는다
// · 한 사람이 동시에 내는 음: 관악기·노래 1음, 현악 1음(합주는 인원만큼 나눠 3성부까지 한 보표에), 키보드는 두 손(손마다 한 옥타브 안 3음),
//   기타는 한 사람에 한 보표(1 = 리듬·코드, 2 = 리드·아르페지오), 드럼은 두 손 + 큰북
// · MIDI(수노 스템)는 그대로 옮기지 않고 재료(화음·리듬·윤곽)로만 써서 이 규칙으로 다시 계산한다
// · 구간(Intro/Verse/Chorus)마다 역할·셈여림·주법을 정한다 — 소리가 조금 비어도 실제로 연주할 수 있는 악보
import { BAR, KEYS, MAJOR, pc, chordTones } from './core.js?v=11';

// cat: 편성 칸 묶음 · disp: 적는 음 옥타브(리코더는 한 옥타브 아래로 적는다) · trans: 이조 악기(기보음 = 실음 + trans, 파트보에서 쓴다)
export const ENS = {
  vocal: { name: '노래', sub: 'Voc.', max: 40, def: 4, unit: '명', cat: 'voice' },
  flute: { name: '플루트', sub: 'Fl.', max: 6, range: [67, 91], gm: 73, snd: 'flute', clef: 'treble', divisi: 2, cat: 'wind' },
  recorder: { name: '리코더', sub: 'Rec.', max: 30, range: [72, 88], gm: 74, snd: 'recorder', clef: 'treble', divisi: 2, disp: -12, cat: 'wind' },
  clarinet: { name: '클라리넷', sub: 'Cl.', max: 6, range: [52, 79], gm: 71, snd: 'reed', clef: 'treble', divisi: 2, trans: 2, cat: 'wind' },
  sax: { name: '알토 색소폰', sub: 'A.Sax', max: 4, range: [51, 75], gm: 65, snd: 'sax', clef: 'treble', divisi: 2, trans: 9, cat: 'wind' },
  trumpet: { name: '트럼펫', sub: 'Tpt.', max: 4, range: [58, 79], gm: 56, snd: 'trumpet', clef: 'treble', divisi: 2, trans: 2, cat: 'wind' },
  trombone: { name: '트롬본', sub: 'Tbn.', max: 4, range: [43, 67], gm: 57, snd: 'brass', clef: 'bass', divisi: 2, cat: 'wind' },
  oboe: { name: '오보에', sub: 'Ob.', max: 3, range: [58, 86], gm: 68, snd: 'reed', clef: 'treble', divisi: 2, cat: 'wind' },
  bassoon: { name: '바순', sub: 'Bsn.', max: 3, range: [34, 65], gm: 70, snd: 'reed', clef: 'bass', divisi: 2, cat: 'wind' },
  horn: { name: '호른', sub: 'Hn.', max: 4, range: [41, 72], gm: 60, snd: 'brass', clef: 'treble', divisi: 2, trans: 7, cat: 'wind' },
  violin: { name: '바이올린', sub: 'Vn.', max: 8, range: [55, 88], gm: 40, snd: 'violin', clef: 'treble', divisi: 2, cat: 'string' },
  violin2: { name: '바이올린 2', sub: 'Vn. 2', max: 8, range: [55, 81], gm: 40, snd: 'violin', clef: 'treble', divisi: 2, cat: 'string' },
  viola: { name: '비올라', sub: 'Va.', max: 6, range: [48, 74], gm: 41, snd: 'violin', clef: 'alto', divisi: 2, cat: 'string' },
  strings: { name: '스트링', sub: 'Str.', max: 12, range: [55, 84], gm: 48, snd: 'strings', clef: 'treble', divisi: 3, cat: 'string' },
  cello: { name: '첼로', sub: 'Vc.', max: 4, range: [36, 64], gm: 42, snd: 'cello', clef: 'bass', cat: 'string' },
  contrabass: { name: '콘트라베이스', sub: 'Cb.', max: 3, range: [28, 52], gm: 43, snd: 'cello', clef: 'bass', cat: 'string' },
  harp: { name: '하프', sub: 'Hp.', max: 1, range: [36, 91], gm: 46, snd: 'harp', cat: 'string' },
  guitar: { name: '기타', sub: 'Gtr.', max: 2, range: [40, 76], gm: 27, snd: 'guitar', clef: 'treble-8', cat: 'band' },
  uke: { name: '우쿨렐레', sub: 'Uke', max: 30, range: [60, 79], gm: 24, snd: 'uke', clef: 'treble', cat: 'band' },
  keys: { name: '키보드', sub: 'Kbd.', max: 1, gm: 0, snd: 'keys', cat: 'band' },
  bass: { name: '베이스기타', sub: 'B.', max: 1, range: [28, 55], gm: 33, snd: 'bass', clef: 'bass', cat: 'band' },
  mallet: { name: '실로폰', sub: 'Xyl.', max: 4, range: [65, 93], gm: 13, snd: 'mallet', clef: 'treble', cat: 'perc' },
  timpani: { name: '팀파니', sub: 'Timp.', max: 1, range: [41, 57], gm: 47, snd: 'timp', clef: 'bass', cat: 'perc' },
  drums: { name: '드럼', sub: 'Dr.', max: 1, snd: 'drums', clef: 'perc', cat: 'perc' },
  cajon: { name: '카혼', sub: 'Caj.', max: 2, snd: 'drums', clef: 'perc', cat: 'perc' },
  tamb: { name: '탬버린', sub: 'Tamb.', max: 4, snd: 'drums', clef: 'perc', cat: 'perc' },
};
export const ENS_CATS = { voice: '노래', wind: '관악기', string: '현악기', band: '기타 · 건반 · 베이스', perc: '타악기' };
// 총보 순서: 목관 → 금관 → 현 → 리듬 섹션 → 타악기
export const ENS_ORDER = ['flute', 'recorder', 'oboe', 'clarinet', 'bassoon', 'sax', 'horn', 'trumpet', 'trombone', 'violin', 'violin2', 'strings', 'viola', 'cello', 'contrabass', 'harp', 'guitar', 'uke', 'keys', 'bass', 'timpani', 'mallet', 'drums', 'cajon', 'tamb'];
// 관현악 총보 순서: 목관 → 금관 → 팀파니·타악기 → 하프 → 건반 → 현악(맨 아래)
export const ORCH_ORDER = ['flute', 'recorder', 'oboe', 'clarinet', 'bassoon', 'sax', 'horn', 'trumpet', 'trombone', 'timpani', 'mallet', 'drums', 'cajon', 'tamb', 'harp', 'guitar', 'uke', 'keys', 'bass', 'violin', 'violin2', 'strings', 'viola', 'cello', 'contrabass'];
export const defaultEns = () => ({ vocal: 4, flute: 0, recorder: 0, oboe: 0, clarinet: 0, bassoon: 0, sax: 0, horn: 0, trumpet: 0, trombone: 0, violin: 0, violin2: 0, strings: 0, viola: 0, cello: 0, contrabass: 0, harp: 0, guitar: 1, uke: 0, keys: 1, bass: 1, timpani: 0, mallet: 0, drums: 1, cajon: 0, tamb: 0 });
// 미리 짜 둔 편성
export const PRESETS = {
  band: { name: '밴드', ens: defaultEns(), genre: 'pop' },
  orch: { name: '관현악(학교 오케스트라)', genre: 'orch', ens: { vocal: 4, flute: 2, oboe: 1, clarinet: 2, bassoon: 1, horn: 2, trumpet: 2, trombone: 1, timpani: 1, harp: 1, violin: 6, violin2: 6, viola: 4, cello: 3, contrabass: 1, guitar: 0, keys: 0, bass: 0, drums: 0 } },
  chamber: { name: '현악 합주 + 피아노', genre: 'orch', ens: { vocal: 4, violin: 4, violin2: 4, viola: 2, cello: 2, contrabass: 1, keys: 1, guitar: 0, bass: 0, drums: 0 } },
  class: { name: '학급 합주(리코더·우쿨렐레)', genre: 'acoustic', ens: { vocal: 20, recorder: 8, uke: 8, mallet: 2, keys: 1, guitar: 0, bass: 0, drums: 0, cajon: 1, tamb: 2 } },
};
const HANDS = ['crash', 'snare', 'tom', 'ride', 'hat']; // 드러머의 두 손: 앞쪽이 먼저

// ── 작은 도구 ──
const clip = (ns, a, b) => ns.filter(n => n.s >= a && n.s < b).map(n => ({ ...n, d: Math.min(n.d, b - n.s) })).filter(n => n.d > 0);
function fit(p, lo, hi) { while (p < lo) p += 12; while (p > hi) p -= 12; return p < lo ? p + 12 : p; }
function tonesIn(pcs, lo, hi) { const out = []; for (let p = lo; p <= hi; p++) if (pcs.includes(pc(p))) out.push(p); return out; }
function nearest(cands, prev) { return cands.reduce((b, p) => (b == null || Math.abs(p - prev) < Math.abs(b - prev) ? p : b), null); }
function mono(ns) {
  const by = new Map(); ns.forEach(n => { const o = by.get(n.s); if (!o || n.p > o.p) by.set(n.s, n); });
  const out = [...by.values()].sort((a, b) => a.s - b.s).map(n => ({ ...n }));
  for (let i = 0; i < out.length - 1; i++) if (out[i].s + out[i].d > out[i + 1].s) out[i].d = out[i + 1].s - out[i].s;
  return out.filter(n => n.d > 0);
}
function onsets(src) { // 같은 자리 음 묶기 → [{s, d, ps(높은 음부터)}]
  const by = new Map();
  src.forEach(n => (n.chord || [n.p]).forEach(p => { if (!by.has(n.s)) by.set(n.s, { s: n.s, d: n.d, ps: [] }); const g = by.get(n.s); g.ps.push(p); g.d = Math.min(g.d, n.d); }));
  const gs = [...by.values()].sort((a, b) => a.s - b.s);
  gs.forEach((g, i) => { g.ps = [...new Set(g.ps)].sort((a, b) => b - a); if (gs[i + 1]) g.d = Math.min(g.d, gs[i + 1].s - g.s); });
  return gs.filter(g => g.d > 0);
}
function lineFrom(src, k, [lo, hi]) { // 여러 음 재료 → k번째 성부(0 = 맨 위), 악기 음역으로 옥타브째 옮김
  const gs = onsets(src).filter(g => g.ps.length > k);
  if (!gs.length) return [];
  const raw = gs.map(g => ({ p: g.ps[k], s: g.s, d: g.d }));
  const med = raw.map(n => n.p).sort((a, b) => a - b)[raw.length >> 1];
  const sh = Math.round(((lo + hi) / 2 - med) / 12) * 12;
  return mono(raw.map(n => ({ ...n, p: fit(n.p + sh, lo, hi) })));
}
function below3(p, tonic) { // 음계를 따라 3도 아래
  if (!MAJOR.includes(pc(p - tonic))) return null;
  let q = p, n = 0; while (n < 2) { q--; if (MAJOR.includes(pc(q - tonic))) n++; }
  return q;
}
const secOf = (sections, s) => { let cur = sections[0] || { name: 'Verse', s: 0 }; for (const x of sections) if (x.s <= s) cur = x; return cur; };
const kindOf = name => (/^(Intro|Interlude|Outro)/.test(name) ? 'intro' : /^Chorus/.test(name) ? 'chorus' : 'verse');

// ── 드럼: 한 사람(두 손 + 큰북) ──
export function kitOf(p) {
  if (p === 35 || p === 36) return 'kick';
  if ([37, 38, 39, 40].includes(p)) return 'snare';
  if ([41, 43, 45, 47, 48, 50].includes(p)) return 'tom';
  if ([49, 52, 55, 57].includes(p)) return 'crash';
  if ([51, 53, 59].includes(p)) return 'ride';
  return 'hat';
}
export function playableKit(kit) {
  const set = new Set(kit);
  if (set.has('crash')) { set.delete('hat'); set.delete('ride'); }
  const hands = HANDS.filter(k => set.has(k)).slice(0, 2);
  return [...(set.has('kick') ? ['kick'] : []), ...hands];
}
function drumPart(hits, a, b) {
  const by = new Map();
  hits.forEach(h => { if (h.s < a || h.s >= b) return; if (!by.has(h.s)) by.set(h.s, new Set()); h.kit.forEach(k => by.get(h.s).add(k)); });
  const ss = [...by.keys()].sort((x, y) => x - y);
  return ss.map((s, i) => { const kit = playableKit([...by.get(s)]); return { s, d: Math.min((ss[i + 1] ?? b) - s, 4, BAR - (((s % BAR) + BAR) % BAR)), p: { kick: 36, snare: 38, tom: 45, crash: 49, ride: 51, hat: 42 }[kit[0]], kit }; }).filter(n => n.kit.length);
}

// ── 화음 쌓기 ──
function closeVoicing(pcs, prev, lo, hi, n = 3) { // 앞 화음에서 가장 적게 움직이는 밀집 화음(n음)
  let best = null;
  for (let inv = 0; inv < 3; inv++) {
    const ord = [pcs[inv], pcs[(inv + 1) % 3], pcs[(inv + 2) % 3]];
    for (let base = lo; base <= hi - 7; base++) {
      if (pc(base) !== ord[0]) continue;
      const v = [base]; for (let k = 1; k < 3; k++) { let q = v[k - 1] + 1; while (pc(q) !== ord[k]) q++; v.push(q); }
      if (v[2] > hi) continue;
      const cost = prev ? v.reduce((a, p, i) => a + Math.abs(p - prev[i]), 0) : Math.abs(v[1] - (lo + hi) / 2);
      if (!best || cost < best.cost) best = { v, cost };
    }
  }
  const v = best ? best.v : [lo, lo + 4, lo + 7];
  return n >= 3 ? v : n === 2 ? [v[0], v[2]] : [v[2]]; // 인원이 적으면 바깥 성부부터
}
function guitarShape(c, tonic, power) { // 기타 한 사람이 잡을 수 있는 모양(실음)
  const r = fit(pc(tonic + c.r), 40, 51);
  if (power) return [r, r + 7, r + 12];
  const t = chordTones(c, tonic);
  return [r, r + 7, r + 12, fit(t[1], r + 13, r + 24)].filter(p => p <= 69);
}

// ── 본체 ──
// o: {melody, chords, key, bars, start, end, intro, sections, lead, genre, mood, ens, chorusBar(b), sources?, old?:{drums,bass}}
export function orchestrate(o) {
  const { chords, key, genre = 'pop', mood = 'bright', melody = [] } = o;
  const start = o.start ?? 0, end = o.end ?? (o.bars || 0) * BAR;
  const ens = { ...defaultEns(), ...(o.ens || {}) };
  const src = o.sources || {}, old = o.old || {}, lead = o.lead || [];
  const sections = o.sections && o.sections.length ? o.sections : [{ s: start, name: 'Verse' }];
  const tonic = (KEYS[key] || KEYS.C).tonic;
  const lastS = chords.length ? chords[chords.length - 1].s : 0;
  const rockish = genre === 'rock' || genre === 'pop' || mood === 'power';
  const soft = genre === 'ballad' || genre === 'acoustic' || mood === 'calm';
  const electric = !soft && genre !== 'acoustic';
  const kindAt = s => kindOf(secOf(sections, s).name);
  const parts = [];
  // 셈여림: 구간이 바뀔 때만(같으면 다시 쓰지 않는다)
  const dynFor = (role) => { const out = []; let last = null; sections.forEach(x => { const k = kindOf(x.name); const m = k === 'intro' ? (role === 'lead' ? 'mf' : 'mp') : k === 'chorus' ? 'mf' : 'mp'; if (m !== last) { out.push({ s: x.s, m }); last = m; } }); return out; };
  const add = (id, info, notes, extra = {}) => {
    const players = extra.players ?? 1;
    const nm = extra.name ?? `${info.name}${players > 1 ? ` (${players}명)` : players === 1 && info.divisi ? '(솔로)' : ''}`;
    parts.push({ id, inst: info.snd, gm: info.gm, name: nm, sub: extra.sub ?? info.sub, clef: extra.clef ?? info.clef, players, band: true, notes: clip(notes, start, end), dyn: extra.dyn ?? dynFor(extra.role), tech: extra.tech || [], ...(info.disp ? { disp: info.disp } : {}), ...(info.trans ? { trans: info.trans } : {}), ...Object.fromEntries(Object.entries(extra).filter(([k]) => ['disp', 'group', 'drum', 'slash'].includes(k))) });
  };
  const leadIn = (range) => lead.map(n => ({ ...n, p: fit(n.p + 12 * Math.round(((range[0] + range[1]) / 2 - n.p) / 12), range[0], range[1]) }));
  // 후렴이 없으면(수노 곡처럼 Intro·Verse만) 노래 구간 전체를 '주 구간'으로 본다
  const mainK = sections.some(x => kindOf(x.name) === 'chorus') ? 'chorus' : 'verse';
  const octFit = (ns, [lo, hi]) => { if (!ns.length) return []; const med = ns.map(n => n.p).sort((a, b) => a - b)[ns.length >> 1]; const sh = Math.round(((lo + hi) / 2 - med) / 12) * 12; return mono(ns.map(n => ({ ...n, p: fit(n.p + sh, lo, hi) }))); };
  const melIn = k => melody.filter(m => m.p != null && m.s >= 0 && kindAt(m.s) === k).map(m => ({ p: m.p, s: m.s, d: m.d }));
  const withThird = (ns, range, n) => n < 2 ? ns : ns.map(x => { const q = below3(x.p, tonic); return q == null || q < range[0] ? x : { ...x, chord: [q, x.p] }; });
  // 학생 연주용으로 쉽게: 16분음표처럼 아주 짧은 음은 앞 음에 붙인다
  const easy = ns => { const out = []; mono(ns).forEach(n => { const l = out[out.length - 1]; if (n.d < 2 && l && l.s + l.d >= n.s) { l.d += n.d; return; } out.push({ ...n, d: Math.max(2, n.d) }); }); return mono(out); };
  // 길잡이음 대선율: 화음의 3음을 앞 음에서 가장 가깝게 잇고, 박을 나누면 이웃 화음음으로 살짝 움직인다
  function guide(range, pat, players = 1) {
    const out = []; let prev = Math.round((range[0] + range[1]) / 2);
    chords.forEach(c => {
      const t = chordTones(c, tonic);
      const g = nearest(tonesIn([t[1]], range[0], range[1]), prev) ?? nearest(tonesIn(t, range[0], range[1]), prev);
      if (g == null) return; prev = g;
      (c.s === lastS ? [[0, c.d]] : pat(c)).forEach(([u, d], k) => {
        if (u >= c.d) return;
        let p = g; if (k % 2 === 1) { const a = nearest(tonesIn([t[0], t[2]], range[0], range[1]), g); if (a != null && Math.abs(a - g) <= 5) p = a; }
        const lo = players > 1 ? nearest(tonesIn(t, Math.max(range[0], p - 9), p - 3), p - 5) : null; // 아랫성부도 악기 음역 안에서만
        out.push({ p, s: c.s + u, d: Math.min(d, c.d - u), chord: lo != null ? [lo, p] : undefined });
      });
    });
    return mono(out).map(n => { const o = out.find(x => x.s === n.s && x.p === n.p); return o && o.chord ? { ...n, chord: o.chord } : n; });
  }
  const hookOr = (range, ns) => mono([...leadIn(range), ...ns]);
  const lastLong = (range, ns) => { const c = chords.find(x => x.s === lastS); if (!c) return ns; const t = chordTones(c, tonic), p = nearest(tonesIn([t[0]], range[0], range[1]), ns.length ? ns[ns.length - 1].p : range[0] + 7); return p == null ? ns : mono([...ns.filter(n => n.s < c.s), { p, s: c.s, d: c.d }]); };
  // 타악기: 마디마다 무늬(구간에 따라)
  function patHits(fn) { const hits = []; for (let b = Math.floor(start / BAR); b * BAR < end; b++) { const s0 = b * BAR; fn(kindAt(s0), s0 + BAR >= end).forEach(([u, kit]) => hits.push({ s: s0 + u, kit })); } return hits; }
  function percNotes(hits) {
    const by = new Map(); hits.forEach(h => { if (h.s < start || h.s >= end) return; if (!by.has(h.s)) by.set(h.s, new Set()); h.kit.forEach(k => by.get(h.s).add(k)); });
    const ss = [...by.keys()].sort((x, y) => x - y);
    return ss.map((s, i) => { const kit = [...by.get(s)]; return { s, d: Math.min((ss[i + 1] ?? end) - s, 4, BAR - (((s % BAR) + BAR) % BAR)), p: { kick: 36, snare: 38, tamb: 54 }[kit[0]] || 38, kit }; });
  }

  // 플루트(관악기 독주/합주): 전주는 훅 선율, 벌스는 쉼, 후렴은 노래를 옥타브 위로 — 2명 이상이면 3도 아래를 함께
  if (ens.flute > 0) {
    const info = ENS.flute, n = Math.min(ens.flute, info.divisi);
    let top = src.flute && src.flute.length ? lineFrom(src.flute, 0, info.range) : null;
    if (!top || !top.length) {
      top = leadIn(info.range);
      top = mono([...top, ...octFit(melIn(mainK), info.range)]);
    }
    const ns = top.map(x => { if (n < 2) return x; const q = below3(x.p, tonic); return q == null || q < info.range[0] ? x : { ...x, chord: [q, x.p] }; });
    add('flute', info, ns, { players: ens.flute, role: 'lead' });
  }
  // 리코더(반 전체도): 전주 훅 + 주 구간 노래 선율을 쉽게 — 2명 이상이면 3도 아래를 함께
  if (ens.recorder > 0) {
    const info = ENS.recorder, n = Math.min(ens.recorder, info.divisi);
    const ns = easy(hookOr(info.range, octFit(melIn(mainK), info.range)));
    add('rec', info, withThird(lastLong(info.range, ns), info.range, n), { players: ens.recorder, role: 'lead', tech: ns.length ? [{ s: ns[0].s, text: '한 옥타브 아래로 적음' }] : [] });
  }
  // 클라리넷: 벌스는 길잡이음 대선율(길게), 주 구간은 노래의 3도 아래 화음 선율
  if (ens.clarinet > 0) {
    const info = ENS.clarinet, n = Math.min(ens.clarinet, info.divisi);
    const cm = mainK === 'chorus' ? guide(info.range, c => (c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]), n).filter(x => kindAt(x.s) === 'verse') : [];
    const har = octFit(melIn(mainK).map(m => ({ ...m, p: below3(m.p, tonic) ?? m.p - 3 })), info.range);
    add('cl', info, easy([...cm, ...har]), { players: ens.clarinet });
  }
  // 알토 색소폰: 벌스는 길게, 주 구간은 팝 혼 리프(엇박 찌르기)
  if (ens.sax > 0) {
    const info = ENS.sax, n = Math.min(ens.sax, info.divisi);
    const ns = guide(info.range, c => kindAt(c.s) === mainK ? [[0, 3], [6, 2], [10, 4]] : kindAt(c.s) === 'intro' ? [] : c.d >= 16 ? [[0, 16]] : [[0, c.d]], n);
    add('sax', info, ns, { players: ens.sax, tech: sections.filter(x => kindOf(x.name) === mainK).slice(0, 1).map(x => ({ s: x.s, text: '짧고 힘있게' })) });
  }
  // 트럼펫: 전주 훅 + 주 구간 노래 선율(밝게) — 수노 관악 스템이 있으면 그 맨 위 선율
  if (ens.trumpet > 0) {
    const info = ENS.trumpet, n = Math.min(ens.trumpet, info.divisi);
    let ns = src.brass && src.brass.length ? lineFrom(src.brass, 0, info.range) : [];
    if (!ns.length) ns = easy(hookOr(info.range, octFit(melIn(mainK), info.range)));
    add('tpt', info, withThird(lastLong(info.range, ns), info.range, n), { players: ens.trumpet, role: 'lead' });
  }
  // 트롬본: 후렴과 끝에서 길게(근음·3음) — 2명 이상이면 두 음
  if (ens.trombone > 0) {
    const info = ENS.trombone, n = Math.min(ens.trombone, info.divisi), ns = [];
    if (src.brass && src.brass.length) { const a = lineFrom(src.brass, 0, info.range), b = n > 1 ? lineFrom(src.brass, 1, info.range) : []; a.forEach(x => { const y = b.find(z => z.s === x.s); ns.push(y && y.p < x.p ? { ...x, chord: [y.p, x.p] } : x); }); }
    else {
      let hiP = 57, loP = 50;
      chords.forEach(c => {
        if (kindAt(c.s) !== 'chorus' && c.s !== lastS) return;
        const t = chordTones(c, tonic);
        hiP = nearest(tonesIn([t[1], t[2]], 50, 64), hiP); loP = nearest(tonesIn([t[0]], 43, hiP - 3), loP) ?? hiP - 7;
        const ps = n > 1 ? [loP, hiP] : [hiP];
        (c.s === lastS ? [[0, c.d]] : c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]).forEach(([u, d]) => ns.push({ p: ps[0], s: c.s + u, d, chord: ps.length > 1 ? ps : undefined }));
      });
    }
    add('tbn', info, ns, { players: ens.trombone });
  }
  // 바이올린: 전주 훅 · 벌스 높은 길잡이음 · 주 구간 노래를 옥타브 위로 — 수노 현악 스템이 있으면 맨 위 선율
  if (ens.violin > 0) {
    const info = ENS.violin, n = Math.min(ens.violin, info.divisi);
    let ns = src.strings && src.strings.length ? lineFrom(src.strings, 0, info.range) : [];
    if (!ns.length) {
      const cm = mainK === 'chorus' ? guide([67, 84], c => (c.d >= 16 ? [[0, 16]] : [[0, c.d]])).filter(x => kindAt(x.s) === 'verse') : [];
      ns = mono([...leadIn(info.range), ...cm, ...octFit(melIn(mainK).map(m => ({ ...m, p: m.p + 12 })), [67, 88])]);
    }
    add('vn', info, withThird(lastLong(info.range, ns), info.range, n), { players: ens.violin, role: 'lead' });
  }
  // 첼로: 근음을 길게(벌스) · 근음과 5음(주 구간) — 베이스 기타와 겹쳐도 활로 길게
  if (ens.cello > 0) {
    const info = ENS.cello, ns = [];
    chords.forEach(c => {
      const r = fit(pc(tonic + c.r), 36, 47), k = c.s === lastS ? 'end' : kindAt(c.s);
      const pat = k === 'end' || k === 'intro' || k === 'verse' ? [[0, c.d, r]] : c.d >= 16 ? [[0, 8, r], [8, 8, r + 7]] : [[0, c.d, r]];
      pat.forEach(([u, d, p]) => ns.push({ p: fit(p, ...info.range), s: c.s + u, d }));
    });
    add('vc', info, mono(ns), { players: ens.cello, tech: [{ s: start, text: 'arco' }] });
  }
  // 기타: 1 = 리듬(전주 길게 울림 · 벌스 팜 뮤트 8분 · 후렴 스트로크), 2 = 리드(전주 훅 · 아르페지오)
  if (ens.guitar > 0) {
    const info = ENS.guitar, nm = (electric ? '일렉기타' : '어쿠스틱 기타');
    const two = ens.guitar >= 2;
    const g1 = [];
    const strum = { pop: [0, 4, 6, 10, 12], rock: [0, 4, 6, 10, 12], acoustic: [0, 4, 6, 10, 12], ballad: [0, 8], dance: [2, 6, 10, 14], hiphop: [0, 10] }[genre] || [0, 4, 8, 12];
    chords.forEach(c => {
      const k = c.s === lastS ? 'end' : kindAt(c.s);
      let pat, power = false;
      if (k === 'end' || k === 'intro') pat = [[0, c.d]];
      else if (k === 'verse' && rockish && !soft) { power = true; pat = []; for (let u = 0; u < c.d; u += 2) pat.push([u, 2]); }
      else if (k === 'verse' && soft) pat = c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]];
      else { const st = strum.filter(u => u < c.d); pat = st.map((u, i) => [u, (st[i + 1] ?? c.d) - u]); }
      const v = guitarShape(c, tonic, power);
      pat.forEach(([u, d]) => g1.push({ p: v[0], s: c.s + u, d, chord: v }));
    });
    const tech1 = sections.map(x => { const k = kindOf(x.name); return { s: x.s, text: k === 'intro' ? (electric ? 'Dist. (let ring)' : 'Strum (길게 울림)') : k === 'chorus' ? (electric ? 'Dist. (스트로크)' : 'Strum (스트로크)') : rockish && !soft ? 'P.M. (팜 뮤트)' : 'Clean (길게 울림)' }; });
    add('gtr1', info, g1, { name: two ? nm + ' 1' : nm, sub: two ? 'Gtr. 1' : 'Gtr.', disp: 12, tech: tech1, role: 'rhythm' });
    if (two) {
      const g2 = leadIn([55, 76]);
      chords.forEach(c => {
        const k = kindAt(c.s); if (k === 'intro' && lead.length) return;
        const r = fit(pc(tonic + c.r), 48, 59), t = chordTones(c, tonic), third = fit(t[1], r + 12, r + 23);
        const seq = c.s === lastS ? [r] : [r, r + 7, r + 12, third, r + 12, r + 7, r + 12, third];
        const step = c.s === lastS ? c.d : k === 'chorus' ? 4 : 2;
        for (let u = 0, i = 0; u < c.d; u += step, i++) g2.push({ p: Math.min(76, seq[i % seq.length]), s: c.s + u, d: step });
      });
      const tech2 = sections.map(x => { const k = kindOf(x.name); return { s: x.s, text: k === 'intro' ? 'Lead · Clean' : k === 'chorus' ? 'Clean · 아르페지오' : 'Clean · let ring' }; });
      add('gtr2', info, mono(g2), { name: nm + ' 2', sub: 'Gtr. 2', disp: 12, tech: tech2, role: 'lead' });
    }
  }
  // 우쿨렐레(반 전체도): 리듬 빗금 + 코드 기호 — 스트로크 무늬는 장르에 따라
  if (ens.uke > 0) {
    const info = ENS.uke, ns = []; let prev = null;
    const strum = { pop: [0, 4, 6, 10, 12], acoustic: [0, 4, 6, 10, 12], ballad: [0, 8], rock: [0, 2, 4, 6, 8, 10, 12, 14], dance: [2, 6, 10, 14], hiphop: [0, 6, 10] }[genre] || [0, 4, 8, 12];
    chords.forEach(c => {
      const v = closeVoicing(chordTones(c, tonic), prev, 60, 76); prev = v;
      const k = c.s === lastS ? 'end' : kindAt(c.s);
      const st = k === 'end' || k === 'intro' ? [0] : k === 'verse' && mainK === 'chorus' && !soft ? [0, 4, 8, 12] : strum;
      const us = st.filter(u => u < c.d);
      us.forEach((u, i) => ns.push({ p: v[0], s: c.s + u, d: (us[i + 1] ?? c.d) - u, chord: v }));
    });
    const tech = sections.map(x => ({ s: x.s, text: { intro: '길게 울림', verse: mainK === 'chorus' ? '↓ 4분 스트로크' : '↓ ↓↑ ↑↓↑', chorus: '↓ ↓↑ ↑↓↑' }[kindOf(x.name)] }));
    add('uke', info, ns, { players: ens.uke, slash: true, tech });
  }
  // 키보드: 큰보표(오른손 밀집 화음 · 왼손 근음)
  if (ens.keys > 0) {
    const info = ENS.keys;
    let R = [], L = [];
    if (src.keys && src.keys.length) {
      onsets(src.keys).forEach(g => {
        const low = g.ps[g.ps.length - 1];
        if (low < 57 || g.ps.length > 3) L.push({ p: fit(low, 36, 55), s: g.s, d: g.d });
        const up = g.ps.filter(p => p >= 55); if (!up.length) return;
        const hand = [...new Set(up.filter(p => p >= up[0] - 12).map(p => fit(p, 55, 84)))].sort((a, b) => a - b).slice(-3);
        R.push({ p: hand[0], s: g.s, d: g.d, chord: hand.length > 1 ? hand : undefined });
      });
      R = mono(R); L = mono(L);
    } else {
      let prev = null;
      const rhPat = { pop: [[0, 8], [8, 8]], rock: [[0, 4], [4, 4], [8, 4], [12, 4]], acoustic: [[0, 8], [8, 8]], ballad: 'broken', dance: [[2, 2], [6, 2], [10, 2], [14, 2]], hiphop: [[0, 16]] }[genre] || [[0, 8], [8, 8]];
      chords.forEach(c => {
        const t = chordTones(c, tonic), v = closeVoicing(t, prev, 59, 79); prev = v;
        const root = fit(pc(tonic + c.r), 40, 52), last = c.s === lastS, intro = kindAt(c.s) === 'intro';
        const rh = last || intro ? [[0, c.d]] : rhPat;
        if (rh === 'broken') [v[0], v[1], v[2], v[1]].forEach((p, k) => { if (k * 4 < c.d) R.push({ p, s: c.s + k * 4, d: 4 }); });
        else rh.forEach(([u, d]) => { if (u < c.d) R.push({ p: v[0], s: c.s + u, d: Math.min(d, c.d - u), chord: v }); });
        const lh = last || soft ? [[0, c.d]] : [[0, 8], [8, 8]];
        lh.forEach(([u, d]) => { if (u < c.d) L.push({ p: root, s: c.s + u, d: Math.min(d, c.d - u) }); });
      });
    }
    add('kbdR', info, R, { clef: 'treble', group: 'kbd' });
    add('kbdL', info, L, { clef: 'bass', group: 'kbd', name: '', sub: '' });
  }
  // 스트링(현악 합주): 인원만큼 나눠 길게 — 1명 1음, 2명 2음, 3명 이상 3음
  if (ens.strings > 0) {
    const info = ENS.strings, n = Math.min(ens.strings, info.divisi), ns = [];
    if (src.strings && src.strings.length) {
      const ls = [0, 1, 2].slice(0, n).map(k => lineFrom(src.strings, k, info.range));
      ls[0].forEach(x => { const ps = [x.p, ...ls.slice(1).map(l => (l.find(z => z.s === x.s) || {}).p).filter(p => p != null && p < x.p)]; ns.push({ ...x, chord: ps.length > 1 ? ps.sort((a, b) => a - b) : undefined }); });
    } else {
      let prev = null;
      chords.forEach(c => {
        const v = closeVoicing(chordTones(c, tonic), prev, 62, 81, n); prev = n >= 3 ? v : prev;
        const pat = c.s === lastS || kindAt(c.s) === 'intro' || soft ? [[0, c.d]] : c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]];
        pat.forEach(([u, d]) => ns.push({ p: v[0], s: c.s + u, d, chord: v.length > 1 ? v : undefined }));
      });
    }
    add('str', info, ns, { players: ens.strings });
  }
  // 베이스기타: 한 줄(악보는 한 옥타브 위로) — 전주는 2분음표 근음
  if (ens.bass > 0) {
    const info = ENS.bass;
    let ns;
    if (src.bass && src.bass.length) ns = lineFrom(src.bass.map(n => ({ ...n, p: Math.min(...(n.chord || [n.p])) })), 0, info.range);
    else {
      ns = (old.bass || []).filter(n => n.s >= 0).map(n => ({ ...n, p: fit(n.p, ...info.range) }));
      chords.filter(c => c.s < 0 || !old.bass).forEach(c => { const r = fit(pc(tonic + c.r), 28, 43); (c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]).forEach(([u, d]) => ns.push({ p: r, s: c.s + u, d })); });
      ns = mono(ns);
    }
    add('bass', info, ns, { disp: 12 });
  }
  // 실로폰: 전주 훅 · 주 구간은 화음음 8분음표 아르페지오(반짝이는 종소리)
  if (ens.mallet > 0) {
    const info = ENS.mallet, ns = [...leadIn([72, 91])];
    chords.forEach(c => {
      const k = c.s === lastS ? 'end' : kindAt(c.s); if (k === 'intro' && lead.length) return;
      const t = chordTones(c, tonic), r = fit(t[0], 72, 83), seq = [r, fit(t[1], r, r + 11), fit(t[2], r, r + 11), r + 12];
      if (k === 'end') { ns.push({ p: r + 12, s: c.s, d: c.d }); return; }
      if (k !== mainK) return;
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      for (let u = 0, i = 0; u < c.d; u += 2, i++) ns.push({ p: Math.min(info.range[1], seq[order[i % 8]]), s: c.s + u, d: 2 });
    });
    add('xyl', info, mono(ns), { players: ens.mallet, tech: [{ s: start, text: '단단한 채' }] });
  }
  // 드럼: 드러머 한 사람 — 전주는 첫 마디 무늬를 이어 쓰고 처음에 크래시
  if (ens.drums > 0) {
    const info = ENS.drums;
    let hits = (src.drums && src.drums.length ? src.drums : old.drums || []).map(n => ({ s: n.s, kit: n.kit || [kitOf(n.p)] }));
    if (o.intro > 0 && start < 0 && !(src.drums && src.drums.length)) { // 전주(온마디)만 — 못갖춘마디는 반주가 쉰다
      const bar0 = hits.filter(h => h.s >= 0 && h.s < BAR).map(h => (h.kit.includes('crash') ? { ...h, kit: [...h.kit.filter(k => k !== 'crash'), 'hat'] } : h));
      for (let b = start; b < 0; b += BAR) bar0.forEach(h => hits.push({ s: b + h.s, kit: h.kit }));
      hits.push({ s: start, kit: ['crash', 'kick'] });
    }
    add('drums', info, drumPart(hits, start, end), { drum: true });
  }
  // 카혼: 가운데(저음 = 큰북 자리)와 모서리(고음 = 작은북 자리) — 드럼 무늬가 있으면 그 큰북·작은북만
  if (ens.cajon > 0) {
    const info = ENS.cajon;
    const base = (src.drums && src.drums.length ? src.drums : old.drums || []).map(n => ({ s: n.s, kit: (n.kit || [kitOf(n.p)]).map(k => (k === 'kick' || k === 'tom' ? 'kick' : k === 'snare' || k === 'crash' ? 'snare' : null)).filter(Boolean) })).filter(h => h.kit.length);
    const hits = base.length ? base : patHits((k, last) => last ? [[0, ['kick']]] : k === 'intro' ? [[0, ['kick']], [8, ['snare']]] : k === 'chorus' || mainK === 'verse' ? [[0, ['kick']], [4, ['snare']], [6, ['kick']], [8, ['kick']], [12, ['snare']], [14, ['snare']]] : [[0, ['kick']], [4, ['snare']], [10, ['kick']], [12, ['snare']]]);
    add('caj', info, percNotes(hits), { drum: true, players: ens.cajon, tech: [{ s: start, text: '아래 = 가운데(저음) · 위 = 모서리(고음)' }] });
  }
  // 탬버린: 주 구간의 2·4박(뒷박) — 끝에서 한 번
  if (ens.tamb > 0) {
    const info = ENS.tamb;
    const hits = patHits((k, last) => last ? [[0, ['tamb']]] : k === mainK ? [[4, ['tamb']], [12, ['tamb']]] : []);
    add('tamb', info, percNotes(hits), { drum: true, players: ens.tamb });
  }
  // ── 관현악 악기 ──
  const pads = (range, n, when) => { // 화음을 길게(사람 수만큼 성부) — when(k): 그 구간에서 울릴지
    const ns = []; let prev = null;
    chords.forEach(c => {
      const k = c.s === lastS ? 'end' : kindAt(c.s); if (!when(k)) return;
      const v = closeVoicing(chordTones(c, tonic), prev, range[0], range[1], Math.max(1, n)); prev = v.length >= 3 ? v : prev;
      ns.push({ p: v[v.length - 1], s: c.s, d: c.d, chord: v.length > 1 ? v : undefined });
    });
    return ns;
  };
  // 오보에: 벌스는 길잡이음 대선율, 주 구간은 노래를 같은 높이로(플루트가 있으면 대선율만)
  if (ens.oboe > 0) {
    const info = ENS.oboe, n = Math.min(ens.oboe, info.divisi);
    const cm = guide(info.range, c => (c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]), n).filter(x => kindAt(x.s) === 'verse' || (ens.flute > 0 && kindAt(x.s) === mainK));
    const mel = ens.flute > 0 ? [] : octFit(melIn(mainK), info.range);
    add('ob', info, easy(mono([...cm, ...mel])), { players: ens.oboe, tech: [{ s: start, text: 'dolce' }] });
  }
  // 바순: 근음을 길게(벌스) · 주 구간은 근음과 5음으로 걸어 다님
  if (ens.bassoon > 0) {
    const info = ENS.bassoon, ns = [];
    chords.forEach(c => {
      const r = fit(pc(tonic + c.r), 41, 52), k = c.s === lastS ? 'end' : kindAt(c.s);
      const pat = k === mainK && c.d >= 16 ? [[0, 8, r], [8, 8, r + 7]] : [[0, c.d, r]];
      if (k === 'intro' && ens.cello > 0) return;
      pat.forEach(([u, d, q]) => ns.push({ p: fit(q, ...info.range), s: c.s + u, d }));
    });
    add('bsn', info, mono(ns), { players: ens.bassoon });
  }
  // 호른: 화음을 길게 — 전주·주 구간·끝(벌스는 쉬어 소리를 쌓아 간다)
  if (ens.horn > 0) {
    const info = ENS.horn, n = Math.min(ens.horn, info.divisi);
    add('hn', info, pads([53, 70], n, k => k !== 'verse'), { players: ens.horn, tech: [{ s: start, text: 'cantabile' }] });
  }
  // 바이올린 2: 벌스는 피치카토 4분음표 화음음, 주 구간은 활로 길게 안쪽 화음
  if (ens.violin2 > 0) {
    const info = ENS.violin2, n = Math.min(ens.violin2, info.divisi), ns = []; let prev = null;
    chords.forEach(c => {
      const k = c.s === lastS ? 'end' : kindAt(c.s), v = closeVoicing(chordTones(c, tonic), prev, 60, 76, 3); prev = v;
      if (k === 'verse') { for (let u = 0, i = 0; u < c.d; u += 4, i++) ns.push({ p: v[[0, 1, 2, 1][i % 4]], s: c.s + u, d: 4 }); }
      else { const top = n > 1 ? [v[1], v[2]] : [v[1]]; ns.push({ p: top[top.length - 1], s: c.s, d: c.d, chord: top.length > 1 ? top : undefined }); }
    });
    const tech = sections.map(x => ({ s: x.s, text: kindOf(x.name) === 'verse' ? 'pizz.' : 'arco' }));
    add('vn2', info, mono(ns).map(x => { const o = ns.find(z => z.s === x.s && z.p === x.p); return o && o.chord ? { ...x, chord: o.chord } : x; }), { players: ens.violin2, tech });
  }
  // 비올라: 안쪽 성부 — 화음의 5음·3음을 길게 잇는다
  if (ens.viola > 0) {
    const info = ENS.viola, ns = []; let prev = 62;
    chords.forEach(c => {
      const t = chordTones(c, tonic), g = nearest(tonesIn([t[2], t[1]], 55, 69), prev) ?? nearest(tonesIn(t, 55, 69), prev); if (g == null) return; prev = g;
      const k = c.s === lastS ? 'end' : kindAt(c.s);
      (k === mainK && c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]).forEach(([u, d]) => ns.push({ p: g, s: c.s + u, d }));
    });
    add('va', info, mono(ns), { players: ens.viola });
  }
  // 콘트라베이스: 근음(악보는 한 옥타브 위로) — 벌스 피치카토 2분음표, 주 구간·끝은 활로 길게
  if (ens.contrabass > 0) {
    const info = ENS.contrabass, ns = [];
    chords.forEach(c => {
      const r = fit(pc(tonic + c.r), 28, 40), k = c.s === lastS ? 'end' : kindAt(c.s);
      (k === 'verse' && c.d >= 16 ? [[0, 8], [8, 8]] : [[0, c.d]]).forEach(([u, d]) => ns.push({ p: r, s: c.s + u, d }));
    });
    const tech = sections.map(x => ({ s: x.s, text: kindOf(x.name) === 'verse' ? 'pizz.' : 'arco' }));
    add('cb', info, mono(ns), { players: ens.contrabass, disp: 12, tech });
  }
  // 하프: 큰보표 — 오른손 화음 펼침(8분음표 오르내림), 왼손 근음·5음
  if (ens.harp > 0) {
    const info = ENS.harp, R = [], L = [];
    chords.forEach(c => {
      const t = chordTones(c, tonic), r = fit(t[0], 60, 71), seq = [r, fit(t[1], r, r + 11), fit(t[2], r, r + 11), r + 12];
      const k = c.s === lastS ? 'end' : kindAt(c.s), root = fit(pc(tonic + c.r), 36, 47);
      L.push({ p: root, s: c.s, d: c.d, chord: c.d >= 8 ? [root, root + 7] : undefined });
      if (k === 'end') { R.push({ p: seq[3], s: c.s, d: c.d, chord: seq.slice(0, 4) }); return; }
      if (k === mainK) { [0, 8].forEach(u => { if (u < c.d) R.push({ p: seq[3], s: c.s + u, d: Math.min(8, c.d - u), chord: seq.slice(0, 4) }); }); return; }
      const ord = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let u = 0, i = 0; u < c.d; u += 2, i++) R.push({ p: seq[ord[i % 8]], s: c.s + u, d: 2 });
    });
    add('hpR', info, R, { clef: 'treble', group: 'harp', tech: [{ s: start, text: 'arpeggio' }] });
    add('hpL', info, L, { clef: 'bass', group: 'harp', name: '', sub: '' });
  }
  // 팀파니: 으뜸음·딸림음 두 북 — 구간 첫 박에 치고, 전주 끝과 곡 끝은 굴림(roll)
  if (ens.timpani > 0) {
    const info = ENS.timpani, I = fit(tonic, 43, 54), V = fit(tonic + 7, 41, 55), ns = [], tech = [];
    const firstOf = new Set(sections.map(x => x.s));
    chords.forEach(c => {
      const isV = c.r === 7 || c.r === 11, p = isV ? V : I, k = c.s === lastS ? 'end' : kindAt(c.s);
      if (k === 'end') { ns.push({ p: I, s: c.s, d: c.d }); tech.push({ s: c.s, text: 'roll' }); return; }
      if (firstOf.has(c.s) || (k === mainK && (((c.s % (BAR * 2)) + BAR * 2) % (BAR * 2)) === 0)) ns.push({ p, s: c.s, d: Math.min(4, c.d) });
    });
    const introEnd = sections.find(x => kindOf(x.name) !== 'intro');
    if (introEnd && introEnd.s > start) { ns.push({ p: V, s: introEnd.s - 4, d: 4 }); tech.push({ s: introEnd.s - 4, text: 'roll' }); }
    add('timp', info, mono(ns), { tech: [{ s: start, text: `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][pc(I)]}·${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][pc(V)]}` }, ...tech] });
  }
  const ORD = Object.fromEntries((genre === 'orch' ? ORCH_ORDER : ENS_ORDER).map((k, i) => [k, i]));
  const keyOf = id => ({ rec: 'recorder', cl: 'clarinet', sax: 'sax', tpt: 'trumpet', tbn: 'trombone', vn: 'violin', str: 'strings', vc: 'cello', gtr1: 'guitar', gtr2: 'guitar', uke: 'uke', kbdR: 'keys', kbdL: 'keys', bass: 'bass', xyl: 'mallet', drums: 'drums', caj: 'cajon', tamb: 'tamb', flute: 'flute', ob: 'oboe', bsn: 'bassoon', hn: 'horn', vn2: 'violin2', va: 'viola', cb: 'contrabass', hpR: 'harp', hpL: 'harp', timp: 'timpani' }[id]);
  return parts.map((p, i) => ({ p, i })).sort((a, b) => (ORD[keyOf(a.p.id)] ?? 99) - (ORD[keyOf(b.p.id)] ?? 99) || a.i - b.i).map(x => x.p);
}
