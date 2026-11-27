// LIVE SCORE · 음악 엔진 — 음 이름, 박 맞춤, 마디 나누기, 가사 흐름, 화성, 자동 편곡, 비교
export const SOL = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
export const SOL_FLAT = ['도', '레♭', '레', '미♭', '미', '파', '솔♭', '솔', '라♭', '라', '시♭', '시'];
export const LETTER = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const KEYS = {
  C: { name: '다장조', tonic: 0, fifths: 0, flat: false },
  G: { name: '사장조', tonic: 7, fifths: 1, flat: false },
  D: { name: '라장조', tonic: 2, fifths: 2, flat: false },
  F: { name: '바장조', tonic: 5, fifths: -1, flat: true },
};
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const pc = p => ((p % 12) + 12) % 12;
export function solName(p, key = 'C') {
  const k = KEYS[key] || KEYS.C;
  return (k.flat ? SOL_FLAT : SOL)[pc(p)];
}
export function sciName(p, key = 'C') {
  const k = KEYS[key] || KEYS.C;
  const flatL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  return (k.flat ? flatL : LETTER)[pc(p)] + (Math.floor(p / 12) - 1);
}

export const BAR = 16; // 4/4, 16분음표 단위
export const uid = () => Math.random().toString(36).slice(2, 9);

// ── 가사: 글자 = 음절 ──
export function syllables(text) {
  return [...(text || '')].filter(ch => /[\p{L}\p{N}]/u.test(ch));
}

// ── 박 맞춤 ──
// events: [{p, v, t, d}] (초, 1마디 첫 박 기준)  grid: 16분음표 단위(4,2,1)
export function quantize(events, tempo, grid, totalUnits) {
  const beat = 60 / tempo;
  const toU = sec => (sec / beat) * 4;
  let notes = events.map(e => {
    let s = Math.round(toU(e.t) / grid) * grid;
    let end = Math.round(toU(e.t + e.d) / grid) * grid;
    if (end <= s) end = s + grid;
    return { p: e.p, v: e.v, s, d: end - s, raw: e };
  }).filter(n => n.s >= 0 && n.s < totalUnits);
  // 같은 자리에 겹친 음은 가장 세게·길게 누른 음 하나만
  notes.sort((a, b) => a.s - b.s || b.d - a.d || b.v - a.v);
  const out = [];
  for (const n of notes) {
    if (out.length && out[out.length - 1].s === n.s) continue;
    out.push(n);
  }
  for (let i = 0; i < out.length; i++) {
    const nx = out[i + 1];
    if (nx && out[i].s + out[i].d > nx.s) out[i].d = nx.s - out[i].s;
    if (out[i].s + out[i].d > totalUnits) out[i].d = totalUnits - out[i].s;
  }
  return out.filter(n => n.d > 0).map(n => ({ id: uid(), p: n.p, s: n.s, d: n.d, lx: 'n' }));
}

// 박에 맞추며 각 음이 얼마나 옮겨졌는지(시각화용)
export function quantizeShift(events, tempo, grid) {
  const beat = 60 / tempo;
  return events.map(e => {
    const u = (e.t / beat) * 4;
    return { p: e.p, from: u, to: Math.round(u / grid) * grid, len: (e.d / beat) * 4 };
  });
}

// ── 마디·붙임줄 나누기 ──
// 한 마디 안 위치 p에서 쓸 수 있는 길이(읽기 쉬운 표기)
function fits(p, v) {
  if (p + v > BAR) return false;
  switch (v) {
    case 16: return p === 0;
    case 12: return p === 0 || p === 4;
    case 8: return p % 8 === 0;
    case 6: return p % 4 === 0;
    case 4: return p % 4 === 0;
    case 3: return p % 4 === 0;
    case 2: return p % 2 === 0;
    default: return true;
  }
}
const VALS = [16, 12, 8, 6, 4, 3, 2, 1];
export function splitDur(pos, dur) {
  const out = [];
  let p = pos, left = dur;
  while (left > 0) {
    const inBar = p % BAR;
    const room = Math.min(left, BAR - inBar);
    let v = VALS.find(x => x <= room && fits(inBar, x)) || 1;
    out.push({ s: p, d: v });
    p += v; left -= v;
  }
  return out;
}

// 하나의 성부(단선율)를 마디별 조각 배열로: [{s,d,p|null,tieNext,tiePrev,ref}]
export function toPieces(notes, totalUnits) {
  const seq = [...notes].sort((a, b) => a.s - b.s);
  const pieces = [];
  let t = 0;
  const pushRest = (from, to) => {
    for (const r of splitDur(from, to - from)) pieces.push({ s: r.s, d: r.d, p: null });
  };
  for (const n of seq) {
    if (n.s >= totalUnits) break;
    if (n.s > t) pushRest(t, n.s);
    const s = Math.max(n.s, t);
    const end = Math.min(n.s + n.d, totalUnits);
    if (end <= s) continue;
    const parts = splitDur(s, end - s);
    parts.forEach((q, i) => pieces.push({ s: q.s, d: q.d, p: n.p, chord: n.chord, tiePrev: i > 0, tieNext: i < parts.length - 1, ref: n }));
    t = end;
  }
  if (t < totalUnits) pushRest(t, totalUnits);
  return pieces;
}

// ── 가사 흐름(줄 = 2마디) ──
// 반환: Map(note.id → {text, kind:'syl'|'ext'|'none'}), 줄별 점검
export function lyricFlow(melody, lines, linesBars = 2) {
  const map = new Map();
  const report = [];
  const span = BAR * linesBars;
  const sorted = [...melody].filter(n => n.p != null).sort((a, b) => a.s - b.s);
  lines.forEach((line, li) => {
    const syl = syllables(line.text);
    const inLine = sorted.filter(n => n.s >= li * span && n.s < (li + 1) * span);
    let k = 0, slots = 0;
    inLine.forEach((n, i) => {
      if (n.lx === 'e' && i > 0) { map.set(n.id, { text: '', kind: 'ext', line: li }); return; }
      const take = n.lx === 'd' ? 2 : 1;
      slots += take;
      const txt = syl.slice(k, k + take).join('');
      k += take;
      map.set(n.id, { text: txt, kind: txt ? 'syl' : 'none', line: li, idx: k - take });
    });
    // 노랫말도 음표도 없는 줄 = 반주만 나오는 마디(전주·간주·후주) → 맞은 줄로 본다
    const rest = !syl.length && !inLine.length;
    report.push({ line: li, syl: syl.length, slots, notes: inLine.length, ok: rest || (syl.length === slots && syl.length > 0), rest, extra: syl.slice(slots) });
  });
  return { map, report };
}

// 음절 j를 줄 안 음표 t에 오도록 옮기기(끌어 놓기)
export function placeSyllable(melody, lines, li, j, targetId) {
  const span = BAR * 2;
  for (let guard = 0; guard < 24; guard++) {
    const notes = melody.filter(n => n.p != null && n.s >= li * span && n.s < (li + 1) * span).sort((a, b) => a.s - b.s);
    const ti = notes.findIndex(n => n.id === targetId);
    if (ti < 0) return;
    const { map } = lyricFlow(melody, lines);
    const pos = notes.findIndex(n => { const m = map.get(n.id); return m && m.kind === 'syl' && m.idx <= j && j < m.idx + (n.lx === 'd' ? 2 : 1); });
    if (pos < 0) {
      // 음절이 줄 끝에서 넘친 상태 → 앞쪽의 늘임표를 하나 풀어 당긴다
      const e = notes.findIndex((n, i) => i > 0 && n.lx === 'e');
      if (e >= 0) { notes[e].lx = 'n'; continue; }
      return;
    }
    if (pos === ti) return;
    if (pos < ti) {
      const n = notes[pos], m = map.get(n.id);
      if (n.lx === 'd') { if (m.idx === j) { n.lx = 'n'; continue; } n.lx = 'n'; continue; }
      if (pos === 0) { // 첫 음은 늘임이 될 수 없다 → 앞 음절을 두 글자로 묶지 않고 뒤로 민다
        n.lx = 'e'; continue;
      }
      n.lx = 'e'; continue;
    }
    // pos > ti : 앞으로 당긴다
    const e = notes.findIndex((n, i) => i >= ti && i < pos && n.lx === 'e');
    if (e >= 0) { notes[e].lx = 'n'; continue; }
    const prev = notes[pos - 1];
    if (prev && prev.lx !== 'd') { prev.lx = 'd'; continue; }
    return;
  }
}

// ── 화성: 마디(또는 반 마디)마다 3화음 고르기 ──
const DEG = [
  { r: 0, q: '', name: 'I' }, { r: 2, q: 'm', name: 'ii' }, { r: 4, q: 'm', name: 'iii' },
  { r: 5, q: '', name: 'IV' }, { r: 7, q: '', name: 'V' }, { r: 9, q: 'm', name: 'vi' },
];
const TRANS = { // 앞 화음 → 다음 화음 가산점
  I: { IV: 2, V: 2, vi: 1.5, ii: 1, iii: .5, I: .6 },
  ii: { V: 2.5, IV: .5, I: .2, vi: .3, ii: .4, iii: 0 },
  iii: { vi: 2, IV: 1.5, ii: .5, I: .3, V: .3, iii: .3 },
  IV: { V: 2, I: 2, ii: 1, vi: .6, IV: .6, iii: .3 },
  V: { I: 2.6, vi: 1.4, IV: .6, V: .6, ii: .2, iii: .2 },
  vi: { IV: 2, ii: 1.6, V: 1, I: .6, iii: .6, vi: .4 },
};
export function chordTones(ch, tonic) { // 반환: 피치클래스 3개
  const root = pc(tonic + ch.r);
  const third = pc(root + (ch.q === 'm' ? 3 : 4));
  return [root, third, pc(root + 7)];
}
export function chordName(ch, key) {
  const k = KEYS[key] || KEYS.C;
  const flatL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const L = k.flat ? flatL : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return L[pc(k.tonic + ch.r)] + ch.q;
}
// opts: {pool:['I','IV','V','vi'...], perBar:1|2, seed}
export function harmonize(melody, bars, key, opts = {}) {
  const k = KEYS[key] || KEYS.C;
  const pool = DEG.filter(d => (opts.pool || ['I', 'ii', 'IV', 'V', 'vi']).includes(d.name));
  const per = opts.perBar || 1;
  const segLen = BAR / per;
  const segs = bars * per;
  const score = (ch, seg) => {
    const tones = chordTones(ch, k.tonic);
    const a = seg * segLen, b = a + segLen;
    let sc = 0;
    for (const n of melody) {
      if (n.p == null) continue;
      const ov = Math.min(b, n.s + n.d) - Math.max(a, n.s);
      if (ov <= 0) continue;
      const strong = (n.s === a ? 1.6 : (n.s - a) % 4 === 0 ? 1.15 : .8);
      const w = ov * strong;
      const x = pc(n.p);
      if (x === tones[0]) sc += 1.25 * w; else if (tones.includes(x)) sc += 1 * w;
      else if (MAJOR.includes(pc(x - k.tonic))) sc -= .35 * w; else sc -= .8 * w;
    }
    return sc / 4;
  };
  // 비터비
  let best = pool.map(ch => ({ s: score(ch, 0) + (ch.name === 'I' ? 2 : 0), path: [ch] }));
  for (let i = 1; i < segs; i++) {
    const last = i === segs - 1, pen = i === segs - 2;
    best = pool.map(ch => {
      let top = null;
      for (const b of best) {
        const prev = b.path[b.path.length - 1];
        let s = b.s + (TRANS[prev.name][ch.name] || 0) * (opts.flow || 1);
        if (prev.name === ch.name && per === 2 && i % 2 === 1) s += .8; // 반 마디 바꿈은 아껴서
        if (!top || s > top.s) top = { s, path: b.path };
      }
      let s = top.s + score(ch, i) + ((opts.bias || {})[ch.name] || 0);
      if (last && per === 1) s += ch.name === 'I' ? 4 : -3;
      if (last && per === 2) s += ch.name === 'I' ? 4 : -2;
      if (pen && per === 1) s += ch.name === 'V' ? 1.2 : 0;
      if (opts.seed) s += ((ch.r * 7 + i * 13 + opts.seed * 5) % 9) * .04;
      return { s, path: [...top.path, ch] };
    });
  }
  best.sort((a, b) => b.s - a.s);
  return best[0].path.map((ch, i) => ({ s: i * segLen, d: segLen, r: ch.r, q: ch.q, deg: ch.name, name: chordName(ch, key) }));
}

// 화음 → 실제 음(성부)
function near(pcx, around) { // around 가까이의 해당 피치클래스 음
  let p = around - 6 + pc(pcx - (around - 6));
  return p;
}
export function voicing(ch, tonic, center = 64, size = 3) {
  const t = chordTones(ch, tonic);
  const root = near(t[0], center - 4);
  const v = [root, root + (ch.q === 'm' ? 3 : 4), root + 7];
  if (size === 4) v.push(root + 12);
  return v;
}

// ── 자동 편곡 ──
export const GENRES = { pop: '밴드 팝', ballad: '발라드', rock: '록', acoustic: '어쿠스틱' };
export const MOODS = { bright: '밝게', calm: '잔잔하게', power: '힘차게' };
export const INSTS = {
  drums: { name: '드럼', clef: 'perc', gm: 0, drum: true },
  guitar: { name: '기타', clef: 'treble', gm: 29 },
  bass: { name: '베이스기타', clef: 'bass', gm: 33 },
  keys: { name: '키보드', clef: 'treble', gm: 4 },
  strings: { name: '스트링', clef: 'treble', gm: 48 },
  flute: { name: '플루트', clef: 'treble', gm: 73 },
  brass: { name: '관악기', clef: 'treble', gm: 61 },
};
export const INST_ORDER = ['flute', 'brass', 'guitar', 'keys', 'strings', 'bass', 'drums'];

const DRUM = { kick: 36, snare: 38, hat: 42, crash: 49 };
export { DRUM };

function drumBar(genre, mood, bar, last, chorus, first) {
  const o = bar * BAR, hits = [];
  const add = (k, u) => hits.push({ k, s: o + u, d: 2 });
  if (last) { add('crash', 0); add('kick', 0); return hits; }
  const busy = mood === 'power' || genre === 'rock';
  const soft = mood === 'calm' || genre === 'ballad' || genre === 'acoustic';
  if (first || (chorus && bar % 2 === 0 && !soft)) add('crash', 0);
  if (soft) {
    for (let u = 0; u < 16; u += 4) if (!(first && u === 0)) add('hat', u);
    add('kick', 0); add('kick', 10); add('snare', 12);
    if (genre !== 'acoustic') add('snare', 4);
  } else if (busy) {
    for (let u = 0; u < 16; u += 2) if (!(u === 0 && hits.some(h => h.k === 'crash'))) add('hat', u);
    [0, 6, 8, 10].forEach(u => add('kick', u)); add('snare', 4); add('snare', 12);
    if (chorus) add('snare', 14);
  } else {
    for (let u = 0; u < 16; u += 2) if (!(u === 0 && hits.some(h => h.k === 'crash'))) add('hat', u);
    add('kick', 0); add('kick', 6); add('kick', 8); add('snare', 4); add('snare', 12);
  }
  return hits;
}

export function arrange(melody, lines, key, settings, variant = 0) {
  const k = KEYS[key] || KEYS.C;
  const bars = Math.max(lines.length * 2, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / BAR), 2);
  const { genre = 'pop', mood = 'bright', inst = ['drums', 'bass', 'keys', 'guitar'] } = settings;
  const pools = [['I', 'IV', 'V', 'vi'], ['I', 'ii', 'iii', 'IV', 'V', 'vi'], ['I', 'ii', 'IV', 'V', 'vi']];
  const biases = [{ I: .3, IV: .3, V: .3 }, { vi: 1.6, ii: 1.3, iii: 1.1, I: -.4 }, { IV: .4, vi: .5 }];
  const chords = harmonize(melody, bars, key, { pool: pools[variant % 3], perBar: variant === 2 ? 2 : 1, seed: variant + 1, flow: variant === 1 ? .6 : 1.1, bias: biases[variant % 3] });
  const chorusBar = b => lines[Math.floor(b / 2)] && lines[Math.floor(b / 2)].chorus;
  const chordAt = u => chords.find(c => u >= c.s && u < c.s + c.d) || chords[chords.length - 1];
  const parts = [];
  const mk = (id, notes) => parts.push({ id, name: INSTS[id].name, inst: id, clef: INSTS[id].clef, notes });

  for (const id of INST_ORDER) {
    if (!inst.includes(id)) continue;
    const notes = [];
    if (id === 'drums') {
      for (let b = 0; b < bars; b++) drumBar(genre, mood, b, b === bars - 1, chorusBar(b), b === 0).forEach(h => notes.push({ p: DRUM[h.k], k: h.k, s: h.s, d: h.d }));
      // 같은 자리 묶기 → 화음, 길이는 다음 타격까지
      const by = new Map();
      notes.forEach(n => { if (!by.has(n.s)) by.set(n.s, []); by.get(n.s).push(n.k); });
      const ss = [...by.keys()].sort((a, b) => a - b);
      const grouped = ss.map((s, i) => ({ s, d: Math.min((ss[i + 1] ?? bars * BAR) - s, 4), p: DRUM[by.get(s)[0]], kit: [...new Set(by.get(s))] }));
      mk(id, grouped); continue;
    }
    for (const c of chords) {
      const b = Math.floor(c.s / BAR), lastBar = b === bars - 1;
      const ch = { r: c.r, q: c.q };
      const root = pc(k.tonic + c.r);
      if (id === 'bass') {
        const R = 36 + pc(root - 0); const r = R < 40 ? R + 12 : R; const low = r - 12 >= 28 ? r - 12 : r;
        const fifth = low + 7;
        if (lastBar) { notes.push({ p: low, s: c.s, d: c.d }); continue; }
        if (genre === 'rock' || mood === 'power') for (let u = 0; u < c.d; u += 2) notes.push({ p: low, s: c.s + u, d: 2 });
        else if (genre === 'ballad' || genre === 'acoustic' || mood === 'calm') {
          if (c.d >= 16) { notes.push({ p: low, s: c.s, d: 8 }); notes.push({ p: fifth, s: c.s + 8, d: 8 }); } else notes.push({ p: low, s: c.s, d: c.d });
        } else {
          const pat = c.d >= 16 ? [[0, 6, low], [6, 2, low], [8, 6, fifth], [14, 2, low]] : [[0, 6, low], [6, 2, low]];
          pat.forEach(([u, d, p]) => notes.push({ p, s: c.s + u, d }));
        }
      } else if (id === 'keys') {
        const v = voicing(ch, k.tonic, 62);
        if (lastBar) { notes.push({ p: v[0], s: c.s, d: c.d, chord: v }); continue; }
        if (genre === 'ballad' || mood === 'calm') {
          const arp = [v[0] - 12, v[0], v[1], v[2], v[0] + 12, v[2], v[1], v[0]];
          for (let u = 0, i = 0; u < c.d; u += 2, i++) notes.push({ p: arp[i % arp.length], s: c.s + u, d: 2 });
        } else if (genre === 'rock') notes.push({ p: v[0], s: c.s, d: c.d, chord: v });
        else {
          const pat = c.d >= 16 ? [[0, 6], [6, 2], [8, 6], [14, 2]] : [[0, 6], [6, 2]];
          pat.forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        }
      } else if (id === 'guitar') {
        const v = voicing(ch, k.tonic, 58);
        if (lastBar) { notes.push({ p: v[0], s: c.s, d: c.d, chord: v }); continue; }
        if (genre === 'rock' || mood === 'power') {
          const pw = [v[0], v[0] + 7];
          for (let u = 0; u < c.d; u += 2) notes.push({ p: pw[0], s: c.s + u, d: 2, chord: pw });
        } else if (genre === 'acoustic' || genre === 'ballad') {
          const pat = c.d >= 16 ? [[0, 4], [4, 2], [6, 4], [10, 2], [12, 4]] : [[0, 4], [4, 2], [6, 2]];
          pat.forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        } else {
          const pat = c.d >= 16 ? [[4, 2], [12, 2]] : [[4, 2]];
          pat.forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        }
      } else if (id === 'strings') {
        const v = voicing(ch, k.tonic, 67);
        notes.push({ p: v[0], s: c.s, d: c.d, chord: v });
      } else if (id === 'flute') {
        // 후렴은 노래를 한 옥타브 위로 겹치고, 나머지는 노래가 쉬거나 길게 끌 때 화음음으로 대답
        const a = c.s, e = c.s + c.d;
        if (chorusBar(b)) {
          melody.filter(n => n.p != null && n.s >= a && n.s < e).forEach(n => notes.push({ p: n.p + 12, s: n.s, d: Math.min(n.d, e - n.s) }));
        } else {
          const t = chordTones(ch, k.tonic);
          const busy = u => melody.some(n => n.p != null && n.s <= u && u < n.s + n.d && n.s > u - 4);
          [4, 12].forEach((u, i) => {
            if (u >= c.d) return;
            if (!busy(a + u)) notes.push({ p: near(t[(i + b) % 3], 79), s: a + u, d: 4 });
          });
        }
      } else if (id === 'brass') {
        if (!chorusBar(b) && !lastBar) continue;
        const v = voicing(ch, k.tonic, 60);
        if (lastBar) notes.push({ p: v[0], s: c.s, d: c.d, chord: v });
        else [[0, 2], [6, 2]].forEach(([u, d]) => { if (u < c.d) notes.push({ p: v[0], s: c.s + u, d, chord: v }); });
      }
    }
    mk(id, notes.sort((a, b) => a.s - b.s));
  }
  return { chords, parts, bars };
}

// 편곡 스타일에 맞춰 노래 리듬·음이 바뀐 버전(비교 활동용) — 마디 두세 곳, 리듬/음 번갈아
export function styleVocal(melody, settings, variant, key = 'C') {
  const tonic = (KEYS[key] || KEYS.C).tonic;
  const inKey = p => MAJOR.includes(pc(p - tonic));
  const v = melody.filter(n => n.p != null).map(n => ({ ...n, id: uid(), lx: 'n' })).sort((a, b) => a.s - b.s);
  const { genre = 'pop' } = settings;
  const bars = Math.ceil(Math.max(0, ...v.map(n => n.s + n.d)) / BAR);
  const style = genre === 'rock' ? 'repeat' : genre === 'ballad' || genre === 'acoustic' ? 'stretch' : 'push';
  const targets = [];
  for (let b = 0; b < bars - 1; b++) if ((b + variant) % 3 === 1) targets.push(b);
  let out = v;
  targets.slice(0, 3).forEach((b, k) => {
    const idx = out.map((n, i) => i).filter(i => Math.floor(out[i].s / BAR) === b);
    if (!idx.length) return;
    let done = false;
    if (k % 2 === 0) { // 리듬 바꾸기
      for (const i of idx) {
        const n = out[i], pv = out[i - 1], nx = out[i + 1];
        if (style === 'push' && pv && n.s % BAR !== 0 && pv.d >= 4 && pv.s + pv.d === n.s && Math.floor(pv.s / BAR) === b) {
          pv.d -= 2; n.s -= 2; n.d += 2; done = true; break; // 당김음
        }
        if (style === 'repeat' && n.d >= 8) {
          const half = n.d / 2; n.d = half; out.splice(i + 1, 0, { ...n, id: uid(), s: n.s + half, d: half }); done = true; break; // 같은 음 되풀이
        }
        if (style === 'stretch' && n.d === 2 && nx && nx.d === 2 && nx.s === n.s + 2 && Math.floor(nx.s / BAR) === b) {
          n.d = 3; nx.s += 1; nx.d = 1; done = true; break; // 점리듬
        }
      }
      if (!done) { // 어느 장르든: 마디 안 긴 음을 둘로 나눔
        const i = idx.find(j => out[j].d >= 4);
        if (i != null) { const n = out[i], half = n.d / 2; n.d = half; out.splice(i + 1, 0, { ...n, id: uid(), s: n.s + half, d: half }); done = true; }
      }
    }
    if (!done) { // 음 하나를 이웃한 음계음으로
      const i = idx.find(j => out[j].d >= 4) ?? idx[idx.length - 1];
      const n = out[i]; n.p = inKey(n.p + 2) ? n.p + 2 : n.p + 1;
    }
  });
  return out;
}

// ── 비교 ──
export function barNotes(notes, b) { return notes.filter(n => n.p != null && n.s >= b * BAR && n.s < (b + 1) * BAR).sort((x, y) => x.s - y.s); }
export function diffBars(mine, ai, bars) {
  const res = [];
  for (let b = 0; b < bars; b++) {
    const A = barNotes(mine, b), B = barNotes(ai, b);
    const sig = x => x.map(n => n.s + ':' + n.d).join(',');
    const pit = x => x.map(n => n.p).join(',');
    const rhythm = sig(A) !== sig(B);
    const uq = x => [...new Set(x.map(n => n.p))].sort().join();
    const pitch = !rhythm ? pit(A) !== pit(B) : uq(A) !== uq(B);
    if (rhythm || pitch) res.push({ bar: b, rhythm, pitch, kind: rhythm && pitch ? '리듬과 음' : rhythm ? '리듬' : '음' });
  }
  return res;
}
export function sameNote(n, list) { return list.some(m => m.s === n.s && m.d === n.d && m.p === n.p); }

// ── 예시곡(시연용) ──
export function demoSong() {
  const mel = [
    [64, 0, 4], [64, 4, 4], [67, 8, 4], [67, 12, 4], [69, 16, 4], [67, 20, 2], [64, 22, 2], [62, 24, 8],
    [60, 32, 2], [62, 34, 2], [64, 36, 4], [64, 40, 2], [62, 42, 2], [60, 44, 4], [62, 48, 2], [64, 50, 2], [67, 52, 4], [69, 56, 2], [67, 58, 6],
    [69, 64, 4], [69, 68, 2], [67, 70, 2], [69, 72, 4], [72, 76, 4], [71, 80, 2], [69, 82, 2], [67, 84, 4], [64, 88, 4], [62, 92, 4],
    [64, 96, 4], [67, 100, 4], [72, 104, 6], [71, 110, 2], [69, 112, 2], [67, 114, 2], [64, 116, 2], [62, 118, 2], [60, 120, 8],
  ].map(([p, s, d]) => ({ id: uid(), p, s, d, lx: 'n' }));
  return {
    title: '우리들의 아침', lyrics: [
      { text: '창문 열면 아침 햇살', chorus: false },
      { text: '친구 불러 함께 걷는 등굣길', chorus: false },
      { text: '오늘은 어떤 노래 부를까', chorus: false },
      { text: '우리들의 아침이 밝아', chorus: true },
    ], melody: mel,
  };
}
