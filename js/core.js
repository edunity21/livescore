// LIVE SCORE · 음악 엔진 — 음 이름, 박 맞춤, 마디 나누기, 가사 흐름, 화성, 자동 편곡, 비교
export const SOL = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
export const SOL_FLAT = ['도', '레♭', '레', '미♭', '미', '파', '솔♭', '솔', '라♭', '라', '시♭', '시'];
export const LETTER = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const KEYS = {
  C: { name: '다장조', tonic: 0, fifths: 0, flat: false },
  G: { name: '사장조', tonic: 7, fifths: 1, flat: false },
  D: { name: '라장조', tonic: 2, fifths: 2, flat: false },
  A: { name: '가장조', tonic: 9, fifths: 3, flat: false },
  E: { name: '마장조', tonic: 4, fifths: 4, flat: false },
  B: { name: '나장조', tonic: 11, fifths: 5, flat: false },
  'F#': { name: '올림바장조', tonic: 6, fifths: 6, flat: false, fix: { 5: ['E', 1] } }, // 이끎음은 미♯
  F: { name: '바장조', tonic: 5, fifths: -1, flat: true },
  Bb: { name: '내림나장조', tonic: 10, fifths: -2, flat: true },
  Eb: { name: '내림마장조', tonic: 3, fifths: -3, flat: true },
  Ab: { name: '내림가장조', tonic: 8, fifths: -4, flat: true },
  Db: { name: '내림라장조', tonic: 1, fifths: -5, flat: true },
  Gb: { name: '내림사장조', tonic: 6, fifths: -6, flat: true, fix: { 11: ['C', -1] } }, // 버금딸림음은 도♭
};
// 5도권 순서(올림표 → 내림표) — 12개 장조 모두
export const KEY_ORDER = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const KEY_OF_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// 으뜸음 피치클래스 → 조(조표가 적은 쪽, 올림바·내림사는 앞 조의 쪽을 따른다)
export function keyByPc(t, flatPref = false) { const x = ((t % 12) + 12) % 12; return x === 6 ? (flatPref ? 'Gb' : 'F#') : KEY_OF_PC[x]; }
// 조를 반음 sh개만큼 옮긴 조
export function shiftKey(key, sh) { const k = KEYS[key] || KEYS.C; return keyByPc(k.tonic + sh, sh < 0 ? true : k.flat); }
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

// ── 박자 ── 모든 길이는 16분음표 칸. beats: 센 박(메트로놈·박 세기) 길이 · groups: 빔·강세 묶음 길이 · line: 가사 한 줄 마디 수
// 홑박자(2/4 3/4 4/4) · 겹박자(6/8 9/8 12/8: 박 = 점4분) · 혼합박자(5/4 5/8 7/8: 2와 3이 섞인 묶음)
export const METERS = {
  '2/4': { n: 2, d: 4, beats: [4, 4], groups: [8], kind: 'simple', line: 4 },
  '3/4': { n: 3, d: 4, beats: [4, 4, 4], groups: [12], kind: 'simple', line: 4 },
  '4/4': { n: 4, d: 4, beats: [4, 4, 4, 4], groups: [8, 8], kind: 'simple', line: 2 },
  '6/8': { n: 6, d: 8, beats: [6, 6], groups: [6, 6], kind: 'compound', line: 2 },
  '9/8': { n: 9, d: 8, beats: [6, 6, 6], groups: [6, 6, 6], kind: 'compound', line: 2 },
  '12/8': { n: 12, d: 8, beats: [6, 6, 6, 6], groups: [12, 12], kind: 'compound', line: 2 },
  '5/4': { n: 5, d: 4, beats: [4, 4, 4, 4, 4], groups: [12, 8], kind: 'mixed', line: 2, label: '5/4 (3+2)' },
  '5/4b': { n: 5, d: 4, beats: [4, 4, 4, 4, 4], groups: [8, 12], kind: 'mixed', line: 2, label: '5/4 (2+3)' },
  '5/8': { n: 5, d: 8, beats: [6, 4], groups: [6, 4], kind: 'mixed', line: 4, label: '5/8 (3+2)' },
  '5/8b': { n: 5, d: 8, beats: [4, 6], groups: [4, 6], kind: 'mixed', line: 4, label: '5/8 (2+3)' },
  '7/8': { n: 7, d: 8, beats: [4, 4, 6], groups: [4, 4, 6], kind: 'mixed', line: 2, label: '7/8 (2+2+3)' },
  '7/8b': { n: 7, d: 8, beats: [6, 4, 4], groups: [6, 4, 4], kind: 'mixed', line: 2, label: '7/8 (3+2+2)' },
  '7/8c': { n: 7, d: 8, beats: [4, 6, 4], groups: [4, 6, 4], kind: 'mixed', line: 2, label: '7/8 (2+3+2)' },
};
export const METER_KINDS = { simple: '홑박자', compound: '겹박자', mixed: '혼합박자' };
export const meterLabel = k => (METERS[k] && METERS[k].label) || k;
// 박자표(분자 글 · 분모) → 박자 이름: '3' 4 → '3/4' · '2+2+3' 8 → '7/8' · 없는 박자는 null
export function meterKeyOf(num, den) {
  const d = +den, parts = String(num).split('+').map(Number).filter(x => x > 0);
  if (!parts.length || ![4, 8].includes(d)) return null;
  const n = parts.reduce((a, v) => a + v, 0), u = 16 / d;
  if (parts.length > 1) { const g = parts.map(x => x * u).join(','); const k = Object.keys(METERS).find(m => METERS[m].d === d && METERS[m].n === n && METERS[m].groups.join(',') === g); if (k) return k; }
  const k = `${n}/${d}`; return METERS[k] ? k : null;
}
// 못갖춘마디(여린내기): 첫 음이 1마디 첫 박보다 pickup(16분음표 칸)만큼 앞에서 시작.
// 음표 위치는 1마디 첫 박 = 0 그대로(못갖춘마디 음은 음수), 가사 한 줄은 pickup만큼 앞당겨 시작하고, 마지막 마디는 pickup만큼 짧다.
export const METER = { pickup: 0, key: '4/4', n: 4, d: 4, beats: [4, 4, 4, 4], groups: [8, 8], kind: 'simple', lineBars: 2 };
export let BAR = 16; // 한 마디 칸 수(박자에 따라) — 다른 모듈은 이 값을 그대로 따라간다(ES 모듈 살아 있는 묶음)
export let LINE = 32; // 가사 한 줄 칸 수 = lineBars 마디
export const PICKUPS = { 0: '갖춘마디', 2: '반 박(♪)', 4: '1박(♩)', 6: '1박 반(♩.)', 8: '2박', 12: '3박' };
export const is44 = () => METER.key === '4/4';
// 박자표 글: 혼합박자는 묶음을 보이게(3+2/4 · 2+2+3/8)
export function meterSig() { const u = 16 / METER.d; return { num: METER.kind === 'mixed' ? METER.groups.map(g => g / u).join('+') : String(METER.n), den: METER.d }; }
// 빠르기 표시 음표: 홑박자 ♩ · 겹박자 ♩. · 8분 혼합박자 ♪ (안에서 쓰는 빠르기는 늘 4분음표 기준)
export function tempoMark(tempo, key) { const t = Math.round(tempo), M = key && METERS[key] ? METERS[key] : METER; return M.kind === 'compound' ? { unit: '♩.', bpm: Math.round(tempo / 1.5), abc: `3/8=${Math.round(tempo / 1.5)}`, xml: ['quarter', true, Math.round(tempo / 1.5)] } : M.d === 8 ? { unit: '♪', bpm: t * 2, abc: `1/8=${t * 2}`, xml: ['eighth', false, t * 2] } : { unit: '♩', bpm: t, abc: `1/4=${t}`, xml: ['quarter', false, t] }; }
export const tempoText = (tempo, key) => { const m = tempoMark(tempo, key); return `${m.unit}=${m.bpm}`; };
// 박자 바꾸기 — 곡을 열거나 박자를 고를 때 부른다
export function setMeter(key = '4/4', lineBars) {
  const m = METERS[key] || METERS['4/4'], k = METERS[key] ? key : '4/4';
  Object.assign(METER, { key: k, n: m.n, d: m.d, beats: m.beats.slice(), groups: m.groups.slice(), kind: m.kind, lineBars: lineBars || m.line });
  BAR = m.beats.reduce((a, v) => a + v, 0); LINE = BAR * METER.lineBars;
  // 못갖춘마디 고르기: 마디보다 짧은 8분음표 칸 묶음
  Object.keys(PICKUPS).forEach(x => delete PICKUPS[x]);
  if (k === '4/4') Object.assign(PICKUPS, { 0: '갖춘마디', 2: '반 박(♪)', 4: '1박(♩)', 6: '1박 반(♩.)', 8: '2박', 12: '3박' });
  else { PICKUPS[0] = '갖춘마디'; for (let u = 2; u < BAR; u += 2) PICKUPS[u] = pickupName(u); }
  return METER;
}
// 못갖춘마디 이름: 홑박자는 박(♩), 8분 박자는 ♪ 개수
export function pickupName(u) {
  if (!u) return '갖춘마디';
  if (METER.d === 8) return `♪ ${u / 2}개`;
  return u % 4 === 0 ? `${u / 4}박` : u === 2 ? '반 박(♪)' : `${Math.floor(u / 4)}박 반`;
}
// 마디 안 박 시작 칸 · 묶음 시작 칸
export const beatStarts = () => { const o = []; let a = 0; METER.beats.forEach(b => { o.push(a); a += b; }); return o; };
export const groupStarts = () => { const o = []; let a = 0; METER.groups.forEach(g => { o.push(a); a += g; }); return o; };
// 마디 안 자리 u의 세기: 마디 첫 박 1 · 묶음 첫 박 .8 · 박 .55 · 8분 .3 · 16분 .12
export function metWeight(u) {
  const m = ((u % BAR) + BAR) % BAR;
  if (m === 0) return 1;
  if (groupStarts().includes(m)) return .8;
  if (beatStarts().includes(m)) return .55;
  return m % 2 === 0 ? .3 : .12;
}
// 길이 len(칸)인 구간을 묶음마다 나눈 [[시작, 길이]…] — 4/4의 '반 마디씩'을 박자에 맞게
export function groupSplit(len) {
  if (len < BAR) return [[0, len]];
  const out = []; let a = 0;
  for (let b = 0; a < len; b++) { for (const g of METER.groups) { if (a >= len) break; out.push([a, Math.min(g, len - a)]); a += g; } }
  return out;
}
// 길이 len 구간의 박마다 [[시작, 박 길이]…]
export function beatSplit(len) { const out = []; let a = 0; while (a < len) { for (const b of METER.beats) { if (a >= len) break; out.push([a, Math.min(b, len - a)]); a += b; } } return out; }
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
  }).filter(n => n.s >= -METER.pickup && n.s < totalUnits);
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

// ── 마디·붙임줄 나누기 (4/4 기보 규칙) ──
// · 마디 가운데(3박 앞)를 가리지 않는다 — 마디 처음에서 시작하는 음, 2박의 2분음표(당김) 말고는 3박에서 끊어 붙임줄
// · 4분음표보다 짧은 음은 박을 넘지 않는다 · 반 마디 안의 ♪♩♪ 당김은 그대로 쓴다
// · 쉼표는 박을 보여 준다(점쉼표·당김 쉼표 없음)
const MID = BAR / 2;
function fits(p, v, rest) {
  if (p + v > BAR) return false;
  const crossMid = p < MID && p + v > MID;
  if (rest) {
    if (v === 16) return p === 0;
    if (v === 8) return p % 8 === 0;
    if (v === 4) return p % 4 === 0;
    if (v === 2) return p % 2 === 0;
    return v === 1;
  }
  if (crossMid && p !== 0 && !(p === 4 && v === 8)) return false;
  switch (v) {
    case 16: return p === 0;
    case 12: return p === 0;
    case 8: return p === 0 || p === 8 || p === 4;
    case 6: return p % 4 === 0;
    case 4: return p % 4 === 0 || p % 4 === 2;
    case 3: return p % 4 <= 1;
    case 2: return p % 4 <= 2;
    default: return true;
  }
}
// 다른 박자: 박을 가리지 않게 — 박보다 짧은 음은 한 박 안에서(4분 박의 ♪♩♪ 당김은 묶음 안에서 허용),
// 여러 박에 걸친 음은 박 처음에서 박 끝까지 · 묶음 경계는 마디 첫 음만 넘는다 · 점음표는 박 처음에서
const VALSX = [24, 16, 12, 8, 6, 4, 3, 2, 1];
function fitsX(p, v, rest) {
  if (p + v > BAR) return false;
  if (!VALSX.includes(v)) return false;
  const bs = beatStarts(), gs = groupStarts();
  const bi = bs.filter(x => x <= p).length - 1, b0 = bs[bi], bl = METER.beats[bi], off = p - b0;
  const gEnd = x => { const i = gs.filter(y => y <= x).length - 1; return gs[i] + METER.groups[i]; };
  const crossG = gs.some(g => g > p && g < p + v);
  if (rest) {
    if (p === 0 && v === BAR) return true;
    if (p + v <= b0 + bl) return off % v === 0 || (bl === 6 && v === 2 && off % 2 === 0); // 한 박 안
    return off === 0 && bs.includes((p + v) % BAR === 0 ? 0 : p + v) && !crossG && (p + v === BAR || bs.includes(p + v)); // 박 처음부터 박 끝까지
  }
  if (crossG && p !== 0) return false;
  if (p + v <= b0 + bl) { // 한 박 안
    if (v === 3) return off <= 1 || (bl === 6 && off === 3);
    if (v === 4 && bl === 6) return off === 0 || off === 2;
    if (v === 6) return off === 0;
    return true;
  }
  // 박을 넘는 음
  if (bl === 4 && v === 4 && off === 2 && p + v <= gEnd(p)) return true; // ♪♩♪ 당김
  if (bl === 4 && v === 6 && off === 0 && p + v <= gEnd(p)) return true; // ♩.♪
  if (off !== 0) return false;
  const e = p + v; return e === BAR || bs.includes(e) || (bl === 4 && v === 6);
}
const VALS = [16, 12, 8, 6, 4, 3, 2, 1];
export function splitDur(pos, dur, rest = false) {
  const out = [];
  let p = pos, left = dur;
  const four = is44();
  while (left > 0) {
    const inBar = ((p % BAR) + BAR) % BAR;
    const room = Math.min(left, BAR - inBar);
    let v = four ? VALS.find(x => x <= room && fits(inBar, x, rest)) || 1 : VALSX.find(x => x <= room && fitsX(inBar, x, rest)) || 1;
    out.push({ s: p, d: v });
    p += v; left -= v;
  }
  return out;
}

// 하나의 성부(단선율)를 마디별 조각 배열로: [{s,d,p|null,tieNext,tiePrev,ref}]
export function toPieces(notes, totalUnits, start = 0) {
  const seq = [...notes].filter(n => n.s + n.d > start).sort((a, b) => a.s - b.s);
  const pieces = [];
  let t = start;
  const pushRest = (from, to) => {
    // 쉼표는 마디마다 따로 나눈다
    let a = from;
    while (a < to) { const e = Math.min(to, (Math.floor(a / BAR) + 1) * BAR); for (const r of splitDur(a, e - a, true)) pieces.push({ s: r.s, d: r.d, p: null }); a = e; }
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

// ── 가사 흐름(줄 = lineBars마디 — 4/4는 2마디) ──
// 반환: Map(note.id → {text, kind:'syl'|'ext'|'none'}), 줄별 점검
export function lineStart(li) { return li * LINE - METER.pickup; }
export function lineOf(s) { return Math.floor((s + METER.pickup) / LINE); }
export function lyricFlow(melody, lines, linesBars = METER.lineBars) {
  const map = new Map();
  const report = [];
  const span = BAR * linesBars, P = METER.pickup;
  const sorted = [...melody].filter(n => n.p != null).sort((a, b) => a.s - b.s);
  lines.forEach((line, li) => {
    const syl = syllables(line.text);
    const inLine = sorted.filter(n => n.s >= li * span - P && n.s < (li + 1) * span - P);
    const brk = []; { let j = -1; for (const ch of line.text || '') { if (/[\p{L}\p{N}]/u.test(ch)) { j++; brk[j] = false; } else if (j >= 0 && /\s/.test(ch)) brk[j] = true; } } // 낱말 끝(띄어쓰기 앞) 글자
    let k = 0, slots = 0;
    inLine.forEach((n, i) => {
      if (n.lx === 'e' && i > 0) { map.set(n.id, { text: '', kind: 'ext', line: li }); return; }
      if (n.lx === 'x') { map.set(n.id, { text: '', kind: 'skip', line: li }); return; } // 글자 없이 건너뛰는 음(타이프 인 스코어)
      const take = n.lx === 'd' ? 2 : 1;
      slots += take;
      const txt = syl.slice(k, k + take).join('');
      k += take;
      const i0 = k - take, i1 = Math.min(syl.length, k) - 1;
      map.set(n.id, { text: txt, kind: txt ? 'syl' : 'none', line: li, idx: i0, wStart: i0 === 0 || !!brk[i0 - 1], wEnd: i1 >= syl.length - 1 || !!brk[i1] });
    });
    // 노랫말도 음표도 없는 줄 = 반주만 나오는 마디(전주·간주·후주) → 맞은 줄로 본다
    const rest = !syl.length && !inLine.length;
    report.push({ line: li, syl: syl.length, slots, notes: inLine.length, ok: rest || (syl.length === slots && syl.length > 0), rest, extra: syl.slice(slots) });
  });
  return { map, report };
}

// 타이프 인 스코어: 음표 하나에 글자를 적고, 그 줄의 노랫말·글자 붙임(lx)을 다시 맞춘다
// text: 글자(한 음에 두 글자까지) · '' 지우기 · '_' 앞 글자를 늘이기 — 띄어쓰기는 원래 노랫말의 자리를 지킨다
export function setNoteLyric(melody, lines, id, text) {
  const n = melody.find(x => x.id === id); if (!n || n.p == null) return null;
  const li = Math.max(0, lineOf(n.s)); while (lines.length <= li) lines.push({ text: '', chorus: false });
  const span = LINE, P = METER.pickup;
  const inLine = melody.filter(x => x.p != null && x.s >= li * span - P && x.s < (li + 1) * span - P).sort((a, b) => a.s - b.s);
  const { map } = lyricFlow(melody, lines);
  const src = lines[li].text || '', all = syllables(src);
  const gap = []; let k = -1; for (const ch of src) { if (/[\p{L}\p{N}]/u.test(ch)) { k++; gap[k] = ''; } else if (k >= 0) gap[k] += ch; }
  const lead = (src.match(/^[^\p{L}\p{N}]*/u) || [''])[0];
  let used = 0;
  const cells = inLine.map(x => {
    const m = map.get(x.id); if (!m || m.kind === 'skip' || m.kind === 'none') return { t: '', g: '' };
    if (m.kind === 'ext') return { t: '_', g: '' };
    const c = syllables(m.text).length; used = Math.max(used, m.idx + c);
    return { t: m.text, g: c ? gap[m.idx + c - 1] || '' : '' };
  });
  const rest = all.slice(used).map((t, j) => ({ t, g: gap[used + j] || '' })); // 음표보다 많은 글자는 줄 끝에 그대로
  const i = inLine.indexOf(n);
  let t = String(text || '').trim(), long = false;
  if (t !== '_') { const sy = syllables(t); long = sy.length > 2; t = sy.slice(0, 2).join(''); }
  cells[i] = { t: t === '_' && i === 0 ? '' : t, g: cells[i].t && t && t !== '_' ? cells[i].g : '' };
  const lastT = cells.reduce((a, c, j) => (c.t && c.t !== '_' ? j : a), -1);
  const out = [];
  cells.forEach((c, j) => {
    const x = inLine[j];
    if (c.t === '_') { x.lx = j > 0 ? 'e' : 'x'; return; }
    if (!c.t) { x.lx = j < lastT ? 'x' : 'n'; return; }
    x.lx = syllables(c.t).length > 1 ? 'd' : 'n';
    out.push(c.t + c.g);
  });
  rest.forEach(c => out.push(c.t + c.g));
  lines[li].text = (lead + out.join('')).replace(/\s+$/, '');
  return { line: li, long };
}

// 음절 j를 줄 안 음표 t에 오도록 옮기기(끌어 놓기)
export function placeSyllable(melody, lines, li, j, targetId) {
  const span = LINE, P = METER.pickup;
  for (let guard = 0; guard < 24; guard++) {
    const notes = melody.filter(n => n.p != null && n.s >= li * span - P && n.s < (li + 1) * span - P).sort((a, b) => a.s - b.s);
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
      if (n.lx === 'd') { n.lx = 'n'; continue; }
      if (pos === 0) return 'first'; // 줄의 첫 음은 늘임이 될 수 없다 — 첫 글자는 첫 음에서 시작
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

// ── 화성(v19) · 응용화성학 ──
// 화음 = { r: 으뜸음에서 뿌리까지 반음, q: 성질, b?: 베이스(자리바꿈 · 으뜸음에서 반음), k?: 그 자리의 조(전조) }
// 성질: 3화음(장·단·감·증) · 7화음(딸림7·장7·단7·반감7·감7) · 증6(이탈리아·프랑스·독일)
export const QUAL = {
  '': { iv: [0, 4, 7], ls: [0, 2, 4], sym: '', xml: 'major' },
  m: { iv: [0, 3, 7], ls: [0, 2, 4], sym: 'm', xml: 'minor' },
  dim: { iv: [0, 3, 6], ls: [0, 2, 4], sym: 'dim', xml: 'diminished' },
  aug: { iv: [0, 4, 8], ls: [0, 2, 4], sym: 'aug', xml: 'augmented' },
  7: { iv: [0, 4, 7, 10], ls: [0, 2, 4, 6], sym: '7', xml: 'dominant' },
  maj7: { iv: [0, 4, 7, 11], ls: [0, 2, 4, 6], sym: 'maj7', xml: 'major-seventh' },
  m7: { iv: [0, 3, 7, 10], ls: [0, 2, 4, 6], sym: 'm7', xml: 'minor-seventh' },
  m7b5: { iv: [0, 3, 6, 10], ls: [0, 2, 4, 6], sym: 'm7♭5', xml: 'half-diminished' },
  dim7: { iv: [0, 3, 6, 9], ls: [0, 2, 4, 6], sym: 'dim7', xml: 'diminished-seventh' },
  it6: { iv: [0, 4, 10], ls: [0, 2, 5], sym: '7(omit5)', xml: 'italian' },
  fr6: { iv: [0, 4, 6, 10], ls: [0, 2, 3, 5], sym: '7♭5', xml: 'french' },
  ger6: { iv: [0, 4, 7, 10], ls: [0, 2, 4, 5], sym: '7', xml: 'german' },
};
// g 0 = 이 조의 기본 화음(3·7화음) · 1 = 1차 관계조·부속화음(부속 딸림·부속 이끎) · 2 = 2차 관계조·같은으뜸음조에서 빌려온 화음 · 3 = 변성화음
// fn: T(으뜸) · S(버금딸림) · D(딸림) · A(부속 — to: 해결할 뿌리) · st: 음 이름 자리(으뜸음 글자에서) · b: 기본 자리바꿈(베이스)
const P = (name, r, q, st, g, fn, x = {}) => ({ name, r, q, st, g, fn, ...x });
const DEG = [
  P('I', 0, '', 0, 0, 'T'), P('ii', 2, 'm', 1, 0, 'S'), P('iii', 4, 'm', 2, 0, 'T'), P('IV', 5, '', 3, 0, 'S'), P('V', 7, '', 4, 0, 'D'), P('vi', 9, 'm', 5, 0, 'T'),
  P('vii°', 11, 'dim', 6, 0, 'D', { b: 2, label: '이끎화음 · 첫자리바꿈' }),
  P('Imaj7', 0, 'maj7', 0, 0, 'T', { c7: 1 }), P('ii7', 2, 'm7', 1, 0, 'S', { c7: 1 }), P('iii7', 4, 'm7', 2, 0, 'T', { c7: 1 }), P('IVmaj7', 5, 'maj7', 3, 0, 'S', { c7: 1 }),
  P('V7', 7, '7', 4, 0, 'D', { c7: 1 }), P('vi7', 9, 'm7', 5, 0, 'T', { c7: 1 }), P('viiø7', 11, 'm7b5', 6, 0, 'D', { c7: 1, label: '반감7화음' }),
  // 1차 관계조 · 부속화음
  P('V/V', 2, '', 1, 1, 'A', { to: 7, label: '부속 딸림 · 딸림조' }), P('V7/V', 2, '7', 1, 1, 'A', { to: 7, c7: 1, label: '부속 딸림7 · 딸림조' }), P('vii°7/V', 6, 'dim7', 3, 1, 'A', { to: 7, c7: 1, lt: 1, label: '부속 이끎7 · 딸림조' }),
  P('V/vi', 4, '', 2, 1, 'A', { to: 9, label: '부속 딸림 · 나란한조' }), P('V7/vi', 4, '7', 2, 1, 'A', { to: 9, c7: 1, label: '부속 딸림7 · 나란한조' }), P('vii°7/vi', 8, 'dim7', 4, 1, 'A', { to: 9, c7: 1, lt: 1, label: '부속 이끎7 · 나란한조' }),
  P('V/ii', 9, '', 5, 1, 'A', { to: 2, label: '부속 딸림 · 버금딸림조의 나란한조' }), P('V7/ii', 9, '7', 5, 1, 'A', { to: 2, c7: 1, label: '부속 딸림7' }), P('vii°7/ii', 1, 'dim7', 0, 1, 'A', { to: 2, c7: 1, lt: 1, label: '부속 이끎7' }),
  P('V7/IV', 0, '7', 0, 1, 'A', { to: 5, c7: 1, label: '부속 딸림7 · 버금딸림조' }),
  P('V/iii', 11, '', 6, 1, 'A', { to: 4, label: '부속 딸림 · 딸림조의 나란한조' }), P('V7/iii', 11, '7', 6, 1, 'A', { to: 4, c7: 1, label: '부속 딸림7' }),
  P('v', 7, 'm', 4, 1, 'S', { label: '버금딸림조 ii(믹솔리디아)' }), P('♭VII', 10, '', 6, 1, 'S', { label: '버금딸림조 IV' }),
  // 2차 관계조 · 같은으뜸음조(빌려온 화음)
  P('iv', 5, 'm', 3, 2, 'S', { label: '같은으뜸음조 iv' }), P('iv7', 5, 'm7', 3, 2, 'S', { c7: 1, label: '같은으뜸음조 iv7' }), P('♭VI', 8, '', 5, 2, 'S', { label: '같은으뜸음조 VI' }), P('♭VImaj7', 8, 'maj7', 5, 2, 'S', { c7: 1, label: '같은으뜸음조 VI' }),
  P('♭III', 3, '', 2, 2, 'T', { label: '같은으뜸음조 III' }), P('ii°', 2, 'dim', 1, 2, 'S', { b: 5, label: '같은으뜸음조 ii° · 첫자리바꿈' }), P('iiø7', 2, 'm7b5', 1, 2, 'S', { c7: 1, label: '같은으뜸음조 반감7' }),
  P('vii°7', 11, 'dim7', 6, 2, 'D', { c7: 1, label: '같은으뜸음조 이끎7(감7)' }), P('♭VII7', 10, '7', 6, 2, 'D', { c7: 1, label: '뒷문 딸림7(같은으뜸음조)' }), P('i', 0, 'm', 0, 2, 'T', { label: '같은으뜸음조 으뜸화음' }),
  // 변성화음
  P('N6', 1, '', 1, 3, 'S', { b: 5, n6: 1, label: '나폴리 6화음' }), P('It+6', 8, 'it6', 5, 3, 'S', { a6: 1, label: '이탈리아 증6' }), P('Fr+6', 8, 'fr6', 5, 3, 'S', { a6: 1, label: '프랑스 증6' }), P('Ger+6', 8, 'ger6', 5, 3, 'S', { a6: 1, label: '독일 증6' }),
  P('V+', 7, 'aug', 4, 3, 'D', { label: '증3화음(딸림)' }), P('I+', 0, 'aug', 0, 3, 'A', { to: 5, label: '증3화음(으뜸 → IV)' }),
];
export const CHORD_GROUPS = ['기본 화음(3·7화음)', '1차 관계조 · 부속화음', '2차 관계조 · 빌려온 화음', '변성화음(나폴리·증6·증3)'];
export const CHORD_RANGE = { basic: '기본 화음', near: '1차 관계조·부속화음까지', far: '2차 관계조·빌려온 화음까지', all: '변성화음까지(반음계 화성 모두)' };
export const CHORD_PER = { 1: '마디마다 1개', 2: '마디마다 2개', 4: '박마다(최대 4개)' };
const GPEN = [0, .75, 1.15, 1.9]; // 넓은 범위의 화음은 노래 음이 분명히 바랄 때만
export function chordTones(ch, tonic) { // 피치클래스: 뿌리 · 3음 · 5음 (· 7음) — 증6은 뿌리(♭6) · 3음 · (5·증4) · 증6
  const root = pc(tonic + ch.r), Q = QUAL[ch.q] || QUAL[''];
  return Q.iv.map(i => pc(root + i));
}
export const bassOf = (ch, tonic) => pc(tonic + (ch.b != null ? ch.b : ch.r));
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], NAT = [0, 2, 4, 5, 7, 9, 11];
export const chordDeg = ch => (ch.deg && DEG.find(x => x.name === ch.deg)) || DEG.find(x => x.r === ch.r && x.q === ch.q) || null;
const spellPc = (p, li) => { const alt = ((p - NAT[li]) % 12 + 18) % 12 - 6; return Math.abs(alt) <= 2 ? LETTERS[li] + (alt > 0 ? '♯'.repeat(alt) : '♭'.repeat(-alt)) : null; };
// 코드 이름(철자는 음 이름 자리대로 — 다장조 ♭VII = B♭, 나폴리 = D♭/F, 독일 증6 = A♭7)
export function chordName(ch, key) {
  const kid = KEYS[key] ? key : 'C', k = KEYS[kid], local = ch.k && KEYS[ch.k] ? ch.k : kid, lk = KEYS[local];
  const rr = pc(k.tonic + ch.r - lk.tonic); // 그 자리 조에서의 뿌리
  const Q = QUAL[ch.q] || QUAL[''], root = pc(k.tonic + ch.r);
  const dg = DEG.find(x => x.r === rr && x.q === ch.q && (!ch.deg || x.name === ch.deg)) || DEG.find(x => x.r === rr && x.q === ch.q);
  let li = null, nm = null;
  if (dg) { li = (LETTERS.indexOf(local[0]) + dg.st) % 7; nm = spellPc(root, li); }
  if (!nm) { const L = lk.flat ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']; nm = L[root]; li = LETTERS.indexOf(nm[0]); }
  let out = nm + Q.sym;
  if (ch.b != null && pc(ch.b) !== pc(ch.r)) { // 자리바꿈: 베이스 음 이름은 화음 구성음 글자 자리로
    const bp = pc(k.tonic + ch.b), mi = Q.iv.findIndex(i => pc(root + i) === bp);
    const bn = (mi >= 0 ? spellPc(bp, (li + Q.ls[mi]) % 7) : null) || ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][bp];
    out += '/' + bn;
  }
  return out;
}
// 응용화성 진행 점수(앞 화음 a → 다음 화음 b, 같은 조 안에서)
const FN = { T: { T: .45, S: 1, D: .8 }, S: { T: .7, S: .4, D: 1.6 }, D: { T: 2, S: -.7, D: .3 } };
function progScore(a, b) {
  if (a.name === b.name) return .25;
  let s;
  if (a.fn === 'A') { // 부속화음은 제 목표로 해결(위종지 정도는 봐준다)
    if (b.r === a.to && b.fn !== 'A' && b.q !== 'dim7') s = 2.8;
    else if (b.fn === 'A' && b.r === pc(a.to)) s = 1.4; // 부속화음 사슬(V7/ii → V7/V …)
    else if (b.g <= 2 && b.fn !== 'A' && ((pc(b.r - a.to) === 9 && /^m/.test(b.q)) || (pc(b.r - a.to) === 8 && (b.q === '' || b.q === 'maj7')))) s = .4; // 위종지(목표의 vi · ♭VI)
    else s = -1.6;
  } else if (a.n6) s = (b.r === 7 && (b.fn === 'D')) || (b.name === 'vii°7') ? 2.2 : b.name === 'V/V' || b.name === 'vii°7/V' ? 1 : -1.3;
  else if (a.a6) s = b.r === 7 && b.fn === 'D' ? 2.4 : b.name === 'I' ? .6 : -1.9; // 증6 → V (또는 I6/4)
  else if (a.r === 7 && a.fn === 'D' && b.name === 'vi') s = 1.4; // 위종지 V → vi
  else if (a.fn === 'D' && b.r === 0 && b.fn === 'T') s = a.q === 'aug' ? 2.4 : 2.6;
  else if (a.name === 'iv' || a.name === 'iv7') s = b.r === 0 ? 2.2 : b.r === 7 ? 1.4 : b.name === '♭VII' ? .8 : -.3;
  else if (a.name === '♭VI' || a.name === '♭VImaj7') s = b.name === '♭VII' ? 2 : b.r === 7 && b.fn === 'D' ? 1.5 : b.name === 'iv' ? .8 : b.a6 ? 1 : .1;
  else if (a.name === '♭VII' || a.name === '♭VII7') s = b.r === 0 ? 2.2 : b.name === 'IV' ? 1.1 : .1;
  else if (a.name === '♭III') s = b.name === '♭VI' || b.name === 'iv' || b.name === '♭VII' ? 1.2 : b.name === 'IV' ? .8 : .1;
  else if (a.name === 'ii°' || a.name === 'iiø7') s = b.r === 7 && b.fn === 'D' ? 2.4 : -.4;
  else if (a.name === 'v') s = b.name === 'IV' || b.name === 'I' || b.name === '♭VII' ? 1.2 : .2;
  else if (b.fn === 'A') s = a.fn === 'D' && a.r === 7 && b.to === 7 ? -.8 : .55; // 부속화음은 아무 데서나 들어올 수 있다(V → V/V 같은 역행은 빼고)
  else s = (FN[a.fn] || FN.T)[b.fn === 'A' ? 'D' : b.fn] ?? .3;
  // 뿌리 움직임: 5도 아래(가장 강함) · 2도 위 · 3도 아래
  const m = pc(b.r - a.r);
  if (m === 5) s += .5; else if (m === 2) s += .15; else if (m === 9 || m === 8) s += .2;
  if (a.r === b.r && a.q !== b.q) s += a.q === '' && b.q === '7' ? .9 : .2; // V → V7 처럼 7음을 더하는 것
  return s;
}
// opts: { pool, range: basic|near|far|all, perBar: 1|2|4, seed, flow, bias, lines: 가사 줄([{text, chorus}]), keys: [{bar, key}] 조 지도, genre }
export function harmonize(melody, bars, key, opts = {}) {
  const k0 = KEYS[key] || KEYS.C;
  const range = opts.range || 'all', base = opts.pool || null;
  const maxG = { basic: 0, near: 1, far: 2, all: 3 }[range] ?? 3;
  const jazz = ['ballad', 'jazz'].includes(opts.genre);
  const pool0 = DEG.filter(d => d.g <= maxG && (d.g > 0 || !base || base.includes(d.name) || d.c7 || d.name === 'vii°') && (maxG > 0 || !d.c7 || d.name === 'V7'));
  const per = [1, 2, 4].includes(+opts.perBar) ? +opts.perBar : 1;
  const cut = per === 1 ? [0] : per === 2 ? (is44() ? [0, 8] : METER.groups.length > 1 ? groupStarts() : beatStarts().filter((_, i, a) => i === 0 || i === a.length - 1)) : beatStarts();
  const SEG = []; for (let b = 0; b < bars; b++) cut.forEach((c, i) => SEG.push([b * BAR + c, (cut[i + 1] ?? BAR) - c]));
  const segs = SEG.length, perN = cut.length;
  // 조 지도: 자리마다 그 조(전조·변조)
  const kmap = (opts.keys || []).filter(x => KEYS[x.key]).sort((a, b) => a.bar - b.bar);
  const keyAt = s => { let kk = key; for (const x of kmap) if (x.bar * BAR <= s) kk = x.key; return kk; };
  const segKey = SEG.map(([s]) => keyAt(s));
  // 선율: 앞뒤 음(비화성음이 2도로 오가는지)
  const mel = melody.filter(n => n.p != null).slice().sort((a, b) => a.s - b.s);
  const nb = mel.map((n, i) => ({ n, pv: mel[i - 1], nx: mel[i + 1] }));
  // 가사 줄 끝(종지 자리): 줄마다 LINE칸 · 빈 줄은 간주
  const lines = opts.lines || [], LN = LINE;
  const lineOfSeg = i => Math.floor(SEG[i][0] / LN);
  const lineEndSeg = new Set(), linePenSeg = new Set();
  for (let i = 0; i < segs; i++) { const l = lineOfSeg(i); if (i === segs - 1 || lineOfSeg(i + 1) !== l) { lineEndSeg.add(i); if (i > 0) linePenSeg.add(i - 1); } }
  const sung = l => lines.length ? !!(lines[l] && String(lines[l].text || '').trim()) : true;
  const stanzaEnd = l => !lines.length ? (l % 4 === 3) : (!sung(l + 1) || (lines[l + 1] && !!lines[l + 1].chorus !== !!(lines[l] && lines[l].chorus)) || l === lines.length - 1);
  const posInStanza = l => { let p = 0; for (let x = l - 1; x >= 0 && sung(x) && !stanzaEnd(x); x--) p++; return p; };
  // 선율 맞춤: 화음음 + / 비화성음은 경과·이웃(약박·2도)이면 가볍게, 센박 비화성음·반음계 음은 무겁게
  const fit = (ch, i, kk) => {
    const lk = KEYS[kk] || k0, tones = chordTones(ch, lk.tonic), scale = MAJOR.map(x => pc(lk.tonic + x));
    const a = SEG[i][0], b = a + SEG[i][1];
    let sc = 0;
    for (const { n, pv, nx } of nb) {
      const ov = Math.min(b, n.s + n.d) - Math.max(a, n.s); if (ov <= 0) continue;
      const head = n.s >= a, strong = head && n.s === a ? 1.6 : head && (is44() ? (n.s - a) % 4 === 0 : metWeight(n.s) >= .55) ? 1.15 : .8;
      const w = ov * strong, x = pc(n.p), chrom = !scale.includes(x);
      const ti = tones.indexOf(x);
      if (ti === 0) sc += 1.25 * w; else if (ti > 0) sc += (ti === 3 ? .85 : 1) * w * (chrom ? 1.5 : 1);
      else {
        const step = q => q && Math.abs(q.p - n.p) <= 2 && Math.abs(q.p - n.p) > 0;
        const passing = step(pv) && step(nx), neigh = step(nx) || step(pv);
        const resolvesDown = nx && n.p - nx.p > 0 && n.p - nx.p <= 2 && tones.includes(pc(nx.p)); // 앞꾸밈음·걸림음
        if (strong < 1.1 && n.d <= 4 && (passing || neigh)) sc -= (chrom ? .35 : .12) * w;
        else if (strong >= 1.1 && resolvesDown && n.d <= 6) sc -= (chrom ? .55 : .3) * w;
        else sc -= (chrom ? 1.3 : .55) * w;
      }
    }
    return sc / (BAR / 4) * 1.15 * (per === 4 ? 1.5 : 1);
  };
  const prior = ch => GPEN[ch.g] * (per === 4 ? .6 : 1) + (ch.c7 ? (ch.name === 'V7' ? .05 : jazz ? .12 : ch.g ? .15 : .35) : 0) + (ch.q === 'aug' ? .4 : 0);
  // 가설(조마다 화음 묶음) — 뿌리는 원래 조 기준 r로 바꿔 둔다
  const cand = segKey.map(kk => { const t = (KEYS[kk] || k0).tonic; return pool0.map(d => ({ ...d, kk, R: pc(t + d.r - k0.tonic) })); });
  const sd = (ch, i) => opts.seed ? (((ch.r * 7 + ch.st * 3 + i * 13 + opts.seed * 5) % 9) * .04) : 0;
  const cad = (ch, i) => { // 종지 · 프레이즈
    let s = 0; const l = lineOfSeg(i);
    if (i === segs - 1) return ch.name === 'I' ? 5 : ch.name === 'Imaj7' ? (jazz ? 5 : 3.8) : ch.fn === 'T' ? -1.5 : -3;
    if (i === segs - 2) s += ch.name === 'V7' ? 1.8 : ch.name === 'V' ? 1.4 : ch.fn === 'D' ? .6 : 0;
    if (i === segs - 3) s += ch.fn === 'S' ? .7 + (ch.g === 3 ? .35 : 0) : 0; // 마지막 종지 앞 버금딸림(나폴리·증6도 이 자리)
    if (lineEndSeg.has(i) && sung(l)) {
      if (stanzaEnd(l)) s += ch.name === 'I' || ch.name === 'Imaj7' ? 2.2 : ch.fn === 'T' ? .4 : ch.fn === 'D' ? -.3 : -.8; // 정격 종지
      else if (posInStanza(l) % 2 === 0) s += ch.fn === 'D' && ch.r === 7 ? 1.3 : ch.name === 'I' ? .5 : ch.fn === 'A' && ch.to === 7 ? .5 : 0; // 반종지(물음)
      else s += ch.name === 'I' ? 1.3 : ch.name === 'vi' ? .4 : 0; // 답(정격·위종지)
    }
    if (linePenSeg.has(i) && sung(l) && stanzaEnd(l)) s += ch.fn === 'D' ? .9 : ch.fn === 'S' ? .2 : 0;
    return s;
  };
  // 비터비
  let best = cand[0].map(ch => ({ s: fit(ch, 0, ch.kk) - prior(ch) + (ch.name === 'I' ? 3 : ch.fn === 'T' ? .3 : -1.2) + sd(ch, 0), path: [ch] }));
  for (let i = 1; i < segs; i++) {
    best = cand[i].map(ch => {
      let top = null;
      for (const b of best) {
        const prev = b.path[b.path.length - 1];
        let tr;
        if (prev.kk === ch.kk) tr = progScore(prev, ch);
        else { // 조가 바뀌는 자리: 앞 화음을 새 조로 읽어(피벗) 이어 본다
          const t2 = KEYS[ch.kk].tonic, pr = pc(KEYS[prev.kk].tonic + prev.r - t2), piv = DEG.find(d => d.r === pr && d.q === prev.q);
          tr = piv ? progScore(piv, ch) + (piv.g === 0 && prev.g === 0 ? .6 : 0) : .2;
        }
        let s = b.s + tr * (opts.flow || 1) / (per === 4 && i % perN ? 3 : 1);
        if (prev.name === ch.name && prev.kk === ch.kk && per > 1 && i % perN) s += per === 4 ? 1.1 : .8; // 마디 안에서 바꿈은 아껴서
        if (!top || s > top.s) top = { s, path: b.path };
      }
      const s = top.s + fit(ch, i, ch.kk) - prior(ch) + cad(ch, i) + ((opts.bias || {})[ch.name] || 0) + sd(ch, i);
      return { s, path: [...top.path, ch] };
    });
  }
  best.sort((a, b) => b.s - a.s);
  // 같은 화음이 이어지면 하나로(마디를 넘지 않게)
  const out = [];
  best[0].path.forEach((ch, i) => {
    const [s, segLen] = SEG[i], prev = out[out.length - 1];
    if (prev && prev.deg === ch.name && prev.k0 === ch.kk && Math.floor(prev.s / BAR) === Math.floor(s / BAR)) { prev.d += segLen; return; }
    const lk = KEYS[ch.kk] || k0, c = { s, d: segLen, r: ch.R, q: ch.q, deg: ch.name, g: ch.g, k0: ch.kk };
    if (ch.b != null) c.b = pc(lk.tonic + ch.b - k0.tonic);
    out.push(c);
  });
  bassLine(out, melody, k0);
  out.forEach(c => { if (c.k0 !== key) c.k = c.k0; delete c.k0; c.name = chordName(c, key); });
  return out;
}
// 베이스 진행 다듬기: 뿌리 베이스가 크게 뛰면 첫자리바꿈으로 2도 진행(I – V6 – vi …) · 끝·종지 화음은 기본 자리
function bassLine(chs, melody, k0) {
  const bp = c => pc(k0.tonic + (c.b != null ? c.b : c.r));
  for (let i = 1; i < chs.length - 1; i++) {
    const c = chs[i]; if (c.b != null || c.g === 3 || /dim7|it6|fr6|ger6|aug/.test(c.q)) continue;
    const a = chs[i - 1], z = chs[i + 1], pa = bp(a), pz = bp(z);
    const iv = (QUAL[c.q] || QUAL['']).iv, third = pc(k0.tonic + c.r + iv[1]);
    const d = (x, y) => Math.min(pc(x - y), pc(y - x));
    const rootMove = d(pa, pc(k0.tonic + c.r)) + d(pc(k0.tonic + c.r), pz), thirdMove = d(pa, third) + d(third, pz);
    const top = melody.find(n => n.p != null && n.s <= c.s && n.s + n.d > c.s);
    if (top && pc(top.p) === third) continue; // 바깥 성부 8도 겹침은 피한다
    if (thirdMove <= 3 && rootMove >= thirdMove + 4 && c.d <= BAR) c.b = pc(c.r + iv[1]);
  }
}
// 화음 → 실제 음(성부)
function near(pcx, around) { return around - 6 + pc(pcx - (around - 6)); }
export function voicing(ch, tonic, center = 64, size = 3) {
  const t = chordTones(ch, tonic), root = near(t[0], center - 4);
  const v = [root, ...t.slice(1).map(x => root + pc(x - t[0]))];
  if (size === 4 && v.length < 4) v.push(root + 12);
  return v;
}

// ── 자동 편곡 ──
export const GENRES = { pop: '밴드 팝', ballad: '발라드', rock: '록', acoustic: '어쿠스틱', dance: '댄스', hiphop: '힙합', orch: '오케스트라' };
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

// 4/4가 아닌 박자의 드럼: 묶음 첫 박 큰북(번갈아 작은북) · 홑박자 묶음 안 나머지 박은 작은북(왈츠 '쿵짝짝') · 하이햇 8분/박
function drumBarX(genre, mood, bar, last, chorus, first) {
  const o = bar * BAR, hits = [], add = (k, u) => hits.push({ k, s: o + u, d: 2 });
  if (last) { add('crash', 0); add('kick', 0); return hits; }
  const soft = mood === 'calm' || genre === 'ballad' || genre === 'acoustic' || genre === 'orch', busy = mood === 'power' || genre === 'rock';
  if (first || (chorus && bar % 2 === 0 && !soft)) add('crash', 0);
  const gs = groupStarts(), bs = beatStarts();
  gs.forEach((g, i) => {
    const multi = METER.groups[i] > METER.beats[0] && METER.kind !== 'compound' || (METER.kind === 'compound' && METER.groups[i] > 6);
    add(i % 2 && !multi ? 'snare' : 'kick', g);
    if (multi) bs.filter(b => b > g && b < g + METER.groups[i]).forEach(b => { if (!soft || METER.key === '3/4') add('snare', b); });
  });
  if (!gs.slice(1).length && METER.kind === 'compound') add('snare', 6);
  for (let u = 0; u < BAR; u += soft ? (METER.d === 8 ? 2 : 4) : 2) if (!(u === 0 && hits.some(h => h.k === 'crash'))) add('hat', u);
  if (busy && chorus) add('snare', BAR - 2);
  return hits;
}
function drumBar(genre, mood, bar, last, chorus, first) {
  if (!is44()) return drumBarX(genre, mood, bar, last, chorus, first);
  const o = bar * BAR, hits = [];
  const add = (k, u) => hits.push({ k, s: o + u, d: 2 });
  if (last) { add('crash', 0); add('kick', 0); return hits; }
  const busy = mood === 'power' || genre === 'rock';
  const soft = mood === 'calm' || genre === 'ballad' || genre === 'acoustic' || genre === 'orch';
  if (first || (chorus && bar % 2 === 0 && !soft)) add('crash', 0);
  if (genre === 'dance') { // 네 박 모두 큰북(포 온 더 플로어), 엇박 하이햇
    [0, 4, 8, 12].forEach(u => add('kick', u)); add('snare', 4); add('snare', 12);
    [2, 6, 10, 14].forEach(u => add('hat', u));
    if (chorus || mood === 'power') [0, 4, 8, 12].forEach(u => { if (!(u === 0 && hits.some(h => h.k === 'crash'))) add('hat', u); });
    return hits;
  }
  if (genre === 'hiphop') { // 붐뱁: 큰북 엇갈림, 작은북 2·4박, 8분 하이햇
    for (let u = 0; u < 16; u += 2) if (!(u === 0 && hits.some(h => h.k === 'crash'))) add('hat', u);
    [0, 7, 10].forEach(u => add('kick', u)); add('snare', 4); add('snare', 12);
    if (mood === 'power') add('kick', 14);
    return hits;
  }
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

export function arrange(melody, lines, key, settings, variant = 0, fixed = null) {
  const bars = Math.max(lines.length * METER.lineBars, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / BAR), 2);
  if (!ORCH) return arrangeOld(melody, lines, key, settings, variant, fixed, bars);
  const r = arrangeOld(melody, lines, key, { ...settings, inst: ['drums', 'bass'] }, variant, fixed, bars); // 화음 진행과 드럼·베이스 리듬 틀
  const ly = layoutOf(melody, lines, r.chords, settings.intro ?? 2, bars);
  const chorusBar = b => !!(lines[Math.floor(b / METER.lineBars)] && lines[Math.floor(b / METER.lineBars)].chorus);
  const ens = settings.ens || ensFromInst(settings.inst);
  const pick = id => (r.parts.find(p => p.inst === id) || {}).notes;
  const parts = ORCH.orchestrate({ melody, chords: ly.chords, key, bars, start: ly.start, end: ly.end, intro: ly.intro, sections: ly.sections, lead: ly.lead, genre: settings.genre || 'pop', mood: settings.mood || 'bright', ens, chorusBar, old: { drums: pick('drums'), bass: pick('bass') } });
  return { chords: ly.chords, parts, bars, intro: ly.intro, sections: ly.sections };
}
// 곡의 틀: 전주(후렴 첫 두 마디를 악기로) · 마디 구간(Intro/Verse/Chorus) · 악보 처음과 끝
export function layoutOf(melody, lines, chords, intro, bars) {
  const P = METER.pickup;
  intro = Math.max(0, Math.min(4, intro | 0));
  const melEnd = Math.max(0, ...melody.map(n => n.s + n.d));
  const out = { intro, start: intro ? -intro * BAR : -P, end: bars * BAR - (intro || melEnd > bars * BAR - P ? 0 : P), sections: [], lead: [], chords: chords.filter(c => c.s >= 0) };
  if (intro) {
    const ci = lines.findIndex(l => l.chorus), hs = (ci >= 0 ? ci : 0) * LINE, len = intro * BAR, sh = -len - hs;
    const hook = chords.filter(c => c.s >= hs && c.s < hs + len);
    out.chords = [...hook.map(c => ({ ...c, s: c.s + sh, d: Math.min(c.d, hs + len - c.s) })), ...out.chords];
    if (!hook.length) for (let b = 0; b < intro; b++) out.chords.unshift({ ...(chords[0] || { r: 0, q: '', name: 'C' }), s: -len + b * BAR, d: BAR });
    out.chords.sort((a, b) => a.s - b.s);
    out.lead = melody.filter(n => n.p != null && n.s >= hs && n.s < hs + len).map(n => ({ p: n.p, s: n.s + sh, d: Math.min(n.d, hs + len - n.s) }))
      .map(n => ({ ...n, d: Math.min(n.d, -P - n.s) })).filter(n => n.d > 0); // 노래 여린내기와 겹치지 않게
    out.sections.push({ bar: -intro, s: -len, name: 'Intro' });
  }
  const seen = {};
  let prev = null;
  // 가사도 노래 음도 없는 줄 = 악기만 나오는 간주·후주
  const empty = li => !syllables(lines[li].text).length && !melody.some(n => n.p != null && n.s >= lineStart(li) && n.s < lineStart(li + 1));
  lines.forEach((l, li) => {
    const nm = empty(li) && li > 0 ? (lines.slice(li).every((_, k) => empty(li + k)) ? 'Outro' : 'Interlude') : l.chorus ? 'Chorus' : 'Verse';
    if (nm === prev) return;
    prev = nm; seen[nm] = (seen[nm] || 0) + 1;
    out.sections.push({ bar: li * METER.lineBars, s: li * LINE, name: seen[nm] > 1 ? `${nm} ${seen[nm]}` : nm });
  });
  return out;
}
// 편성 엔진(orch.js)은 순환 참조를 피해 나중에 끼운다
let ORCH = null;
export function useOrchestrator(o) { ORCH = o; }
export function ensFromInst(inst = ['drums', 'bass', 'keys', 'guitar']) {
  return { vocal: 4, keys: inst.includes('keys') ? 1 : 0, guitar: inst.includes('guitar') ? 1 : 0, bass: inst.includes('bass') ? 1 : 0, drums: inst.includes('drums') ? 1 : 0, flute: inst.includes('flute') ? 1 : 0, strings: inst.includes('strings') ? 3 : 0, trombone: inst.includes('brass') ? 2 : 0 };
}
function arrangeOld(melody, lines, key, settings, variant, fixed, bars) {
  const k = KEYS[key] || KEYS.C;
  const { genre = 'pop', mood = 'bright', inst = ['drums', 'bass', 'keys', 'guitar'] } = settings;
  const pools = [['I', 'IV', 'V', 'vi'], ['I', 'ii', 'iii', 'IV', 'V', 'vi'], ['I', 'ii', 'IV', 'V', 'vi']];
  const biases = [{ I: .3, IV: .3, V: .3 }, { vi: 1.6, ii: 1.3, iii: 1.1, I: -.4 }, { IV: .4, vi: .5 }];
  const per = settings.perBar && settings.perBar !== 'auto' ? +settings.perBar : variant === 2 ? 2 : 1;
  let chords = harmonize(melody, bars, key, { pool: pools[variant % 3], range: settings.range || 'all', perBar: per, seed: variant + 1, flow: variant === 1 ? .6 : 1.1, bias: biases[variant % 3], lines, genre, keys: settings.keys });
  if (fixed && fixed.length) { // 학생이 고른 코드로 바꾸기(나누고 합친 자리 그대로) — 고르지 않은 자리만 새로 붙인 화음으로 채운다
    const fx = fixed.filter(f => f.s >= 0 && f.s < bars * BAR).map(f => makeChord(f.r, f.q, f.s, Math.min(f.d, bars * BAR - f.s), key, f));
    const cover = (a, b) => fx.some(f => f.s < b && a < f.s + f.d);
    chords = [...fx, ...chords.filter(c => !cover(c.s, c.s + c.d))].sort((a, b) => a.s - b.s);
  }
  const chorusBar = b => lines[Math.floor(b / METER.lineBars)] && lines[Math.floor(b / METER.lineBars)].chorus;
  const four = is44(), GS = groupSplit, BT = beatStarts(), GT = groupStarts();
  // 화음 구간 [c.s, c.s+c.d) 안의 박 시작(마디 기준 자리) — [구간 안 자리, 박 길이, 묶음 첫 박인가]
  const beatsIn = c => { const o = []; for (let b = Math.floor(c.s / BAR) * BAR; b < c.s + c.d; b += BAR) BT.forEach((bs, i) => { const a = b + bs; if (a >= c.s && a < c.s + c.d) o.push([a - c.s, Math.min(METER.beats[i], c.s + c.d - a), GT.includes(bs)]); }); return o; };
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
      const root = bassOf(c, k.tonic);
      if (id === 'bass') {
        const R = 36 + pc(root - 0); const r = R < 40 ? R + 12 : R; const low = r - 12 >= 28 ? r - 12 : r;
        const tt = chordTones(c, k.tonic), fpc = c.b != null && pc(c.b) !== pc(c.r) ? tt[0] : tt[2], fifth = low + (pc(fpc - low) || 7); // 5음(자리바꿈이면 뿌리)
        if (lastBar) { notes.push({ p: low, s: c.s, d: c.d }); continue; }
        if (genre === 'dance') { for (let u = 2; u < c.d; u += 4) notes.push({ p: u % 8 === 6 ? low + 12 : low, s: c.s + u, d: 2 }); continue; }
        if (genre === 'hiphop') { [[0, 6, low], [7, 3, low], [10, 4, fifth]].forEach(([u, d, p]) => { if (u < c.d) notes.push({ p, s: c.s + u, d: Math.min(d, c.d - u) }); }); continue; }
        if (genre === 'rock' || mood === 'power') for (let u = 0; u < c.d; u += 2) notes.push({ p: low, s: c.s + u, d: 2 });
        else if (!four) { // 묶음 첫 박마다 근음·5음(왈츠는 '쿵' 하나)
          GS(c.d).forEach(([u, d], i) => notes.push({ p: i % 2 ? fifth : low, s: c.s + u, d: genre === 'ballad' || genre === 'acoustic' || genre === 'orch' || mood === 'calm' ? d : Math.min(d, METER.beats[0]) }));
        } else if (genre === 'ballad' || genre === 'acoustic' || genre === 'orch' || mood === 'calm') {
          if (c.d >= 16) { notes.push({ p: low, s: c.s, d: 8 }); notes.push({ p: fifth, s: c.s + 8, d: 8 }); } else notes.push({ p: low, s: c.s, d: c.d });
        } else {
          const pat = c.d >= 16 ? [[0, 6, low], [6, 2, low], [8, 6, fifth], [14, 2, low]] : c.d >= 8 ? [[0, 6, low], [6, 2, low]] : [[0, c.d, low]];
          pat.forEach(([u, d, p]) => notes.push({ p, s: c.s + u, d }));
        }
      } else if (id === 'keys') {
        const v = voicing(ch, k.tonic, 62);
        if (lastBar) { notes.push({ p: v[0], s: c.s, d: c.d, chord: v }); continue; }
        if (genre === 'dance') { for (let u = 2; u < c.d; u += 4) notes.push({ p: v[0], s: c.s + u, d: 2, chord: v }); continue; }
        if (genre === 'hiphop') { notes.push({ p: v[0], s: c.s, d: Math.min(c.d, 12), chord: v }); continue; }
        if (genre === 'ballad' || genre === 'orch' || mood === 'calm') {
          const arp = [v[0] - 12, v[0], v[1], v[2], v[0] + 12, v[2], v[1], v[0]];
          for (let u = 0, i = 0; u < c.d; u += 2, i++) notes.push({ p: arp[i % arp.length], s: c.s + u, d: 2 });
        } else if (genre === 'rock') notes.push({ p: v[0], s: c.s, d: c.d, chord: v });
        else if (!four) { // '짝짝': 묶음 첫 박 말고 박마다(겹박자는 8분 둘째·셋째)
          const hits = []; beatsIn(c).forEach(([u, bl, g]) => { if (METER.beats.includes(6) && bl > 4) { [2, 4].forEach(x => { if (x < bl) hits.push([u + x, 2]); }); } else if (!g || METER.groups.length === BT.length) hits.push([u, bl]); });
          (hits.length ? hits : [[0, c.d]]).forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        } else {
          const pat = c.d >= 16 ? [[0, 6], [6, 2], [8, 6], [14, 2]] : [[0, 6], [6, 2]];
          pat.forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        }
      } else if (id === 'guitar') {
        const v = voicing(ch, k.tonic, 58);
        if (lastBar) { notes.push({ p: v[0], s: c.s, d: c.d, chord: v }); continue; }
        if (!four) { // 박마다 내려치기(겹박자 ♩♪)
          const pat = []; beatsIn(c).forEach(([u, bl]) => { if (bl > 4) { pat.push([u, 4]); pat.push([u + 4, bl - 4]); } else pat.push([u, bl]); });
          if (!pat.length) pat.push([0, c.d]);
          pat.forEach(([u, d]) => notes.push({ p: v[0], s: c.s + u, d, chord: v }));
        } else if (genre === 'hiphop' || genre === 'dance') {
          const pat = c.d >= 16 ? [[6, 2], [14, 2]] : [[6, 2]];
          pat.forEach(([u, d]) => { if (u < c.d) notes.push({ p: v[0], s: c.s + u, d, chord: v }); });
        } else if (genre === 'rock' || mood === 'power') {
          const pw = [v[0], v[0] + 7];
          for (let u = 0; u < c.d; u += 2) notes.push({ p: pw[0], s: c.s + u, d: 2, chord: pw });
        } else if (genre === 'acoustic' || genre === 'ballad' || genre === 'orch') {
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
          (four ? [4, 12] : BT.filter(x => !GT.includes(x)).concat(GT.slice(1)).sort((x, y) => x - y).slice(0, 2)).forEach((u, i) => {
            if (u >= c.d) return;
            if (!busy(a + u)) notes.push({ p: near(t[(i + b) % 3], 79), s: a + u, d: 4 });
          });
        }
      } else if (id === 'brass') {
        if (!chorusBar(b) && !lastBar) continue;
        const v = voicing(ch, k.tonic, 60);
        if (lastBar) notes.push({ p: v[0], s: c.s, d: c.d, chord: v });
        else (four ? [[0, 2], [6, 2]] : GT.map(g => [g, 2])).forEach(([u, d]) => { if (u < c.d) notes.push({ p: v[0], s: c.s + u, d, chord: v }); });
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
  const style = genre === 'rock' ? 'repeat' : genre === 'ballad' || genre === 'acoustic' || genre === 'orch' ? 'stretch' : 'push';
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

// ── 코드 직접 고르기 ──
export const CHORD_POOL = DEG;
export function makeChord(r, q, s, d, key, x = {}) {
  const c = { s, d, r, q, ...(x.b != null ? { b: x.b } : {}), ...(x.k && x.k !== key ? { k: x.k } : {}) };
  const local = c.k || key, rr = pc((KEYS[key] || KEYS.C).tonic + r - (KEYS[local] || KEYS.C).tonic);
  const dg = (x.deg && DEG.find(y => y.name === x.deg && y.r === rr && y.q === q)) || DEG.find(y => y.r === rr && y.q === q);
  c.deg = dg ? dg.name : ''; c.g = dg ? dg.g : 0; c.name = chordName(c, key); return c;
}
// 도수 이름(V7/V · N6 …)으로 화음 만들기 — local: 그 자리의 조(전조한 곳)
export function chordFromDeg(name, s, d, key, local = null) {
  const g = DEG.find(x => x.name === name); if (!g) return null;
  const k0 = KEYS[key] || KEYS.C, lk = KEYS[local || key] || k0, sh = lk.tonic - k0.tonic;
  return makeChord(pc(g.r + sh), g.q, s, d, key, { deg: g.name, ...(g.b != null ? { b: pc(g.b + sh) } : {}), ...(local && local !== key ? { k: local } : {}) });
}
// 코드마다 노래 음이 화음음과 얼마나 맞는지(0~1, 길이 가중)
export function chordFit(melody, chords, key) {
  const k = KEYS[key] || KEYS.C;
  return chords.map(c => {
    const t = chordTones(c, k.tonic); let all = 0, ok = 0;
    for (const n of melody) {
      if (n.p == null) continue;
      const ov = Math.min(c.s + c.d, n.s + n.d) - Math.max(c.s, n.s); if (ov <= 0) continue;
      all += ov; if (t.includes(pc(n.p))) ok += ov;
    }
    return all ? ok / all : null;
  });
}

// ── 음역·조옮김 ──
export const COMFORT = { lo: 60, hi: 74, warnLo: 57, warnHi: 77 }; // 도4~레5 편함, 라3~미5까지 주의
export function range(notes) {
  const ps = notes.filter(n => n.p != null).map(n => n.p);
  return ps.length ? { lo: Math.min(...ps), hi: Math.max(...ps) } : null;
}
export function keyShift(from, to) { // 가장 가까운 방향의 반음 수(-6~+5)
  const d = pc((KEYS[to] || KEYS.C).tonic - (KEYS[from] || KEYS.C).tonic);
  return d > 5 ? d - 12 : d;
}
// 지금 선율을 다른 조로 옮겼을 때 편한 음역에 가장 잘 들어오는 조 찾기
export function bestKey(notes, from) {
  const r = range(notes); if (!r) return null;
  let best = null;
  for (const k of KEY_ORDER) {
    for (const oct of [-12, 0, 12]) {
      const sh = keyShift(from, k) + oct, lo = r.lo + sh, hi = r.hi + sh;
      const out = Math.max(0, COMFORT.lo - lo) + Math.max(0, hi - COMFORT.hi);
      const sc = out * 10 + Math.abs(sh) * .3 + Math.abs((lo + hi) / 2 - (COMFORT.lo + COMFORT.hi) / 2) * .2;
      if (!best || sc < best.sc) best = { key: k, shift: sh, sc, lo, hi, out };
    }
  }
  return best;
}
export function shiftPitches(notes, semis) {
  return notes.map(n => (n.p == null ? n : { ...n, p: n.p + semis, chord: n.chord ? n.chord.map(x => x + semis) : n.chord }));
}

// ── 작곡 기법: 마디 반복·동형진행·역행·전위 ──
export const BAR_TOOLS = { copy: '그대로 반복', up: '2도 위로(동형진행)', down: '2도 아래로(동형진행)', retro: '거꾸로(역행)', inv: '뒤집기(전위)' };
function degOf(p, tonic) { // 음계 안 위치(옥타브×7 + 음계 순서), 음계 밖 음은 바로 아래 음계음
  let q = p, guard = 0; while (!MAJOR.includes(pc(q - tonic)) && guard++ < 2) q--;
  const oct = Math.floor((q - tonic) / 12);
  return { deg: oct * 7 + MAJOR.indexOf(pc(q - tonic)), alt: p - q };
}
function pitchOf(deg, tonic, alt = 0) {
  const oct = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
  return tonic + oct * 12 + MAJOR[i] + alt;
}
export function transformBar(melody, from, to, kind, key) {
  const tonic = (KEYS[key] || KEYS.C).tonic;
  const a = from * BAR, b = a + BAR, ta = to * BAR, tb = ta + BAR;
  let src = melody.filter(n => n.p != null && n.s >= a && n.s < b).map(n => ({ p: n.p, s: n.s - a, d: Math.min(n.d, b - n.s) }));
  if (!src.length) return null;
  if (kind === 'up' || kind === 'down') {
    const st = kind === 'up' ? 1 : -1;
    src = src.map(n => { const g = degOf(n.p, tonic); return { ...n, p: pitchOf(g.deg + st, tonic, g.alt) }; });
  } else if (kind === 'retro') {
    src = src.map(n => ({ ...n, s: BAR - (n.s + n.d) })).sort((x, y) => x.s - y.s);
  } else if (kind === 'inv') {
    const g0 = degOf(src[0].p, tonic).deg;
    src = src.map(n => { const g = degOf(n.p, tonic); return { ...n, p: pitchOf(2 * g0 - g.deg, tonic, 0) }; });
  }
  const kept = melody.filter(n => !(n.s >= ta && n.s < tb)).map(n => (n.s < ta && n.s + n.d > ta ? { ...n, d: ta - n.s } : n));
  const next = kept.filter(n => n.s >= tb).sort((x, y) => x.s - y.s)[0];
  const lim = next ? next.s : Infinity;
  const fresh = src.map(n => ({ id: uid(), p: Math.max(36, Math.min(96, n.p)), s: ta + n.s, d: Math.min(n.d, lim - (ta + n.s)), lx: 'n' })).filter(n => n.d > 0);
  return [...kept, ...fresh].sort((x, y) => x.s - y.s);
}

// ── 비교 ──
export function barNotes(notes, b) { return notes.filter(n => n.p != null && n.s >= b * BAR && n.s < (b + 1) * BAR).sort((x, y) => x.s - y.s); }
export function diffBars(mine, ai, bars) {
  const res = [];
  for (let b = METER.pickup ? -1 : 0; b < bars; b++) {
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
