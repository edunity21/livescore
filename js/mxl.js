// 뮤즈스코어 연동: MusicXML(.musicxml · .xml · .mxl) 읽기
// 뮤즈스코어에서 고친 악보를 다시 불러와 선율·가사·빠르기·조·못갖춘마디를 플랫폼 곡으로 되살린다
import { unzipMidi } from './midi.js?v=17';

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FIFTHS = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', 7: 'Db', '-7': 'B' };

export async function readFile(file) {
  if (/\.mxl$/i.test(file.name)) {
    const fs = await unzipMidi(file, /\.(xml|musicxml)$/i);
    const main = fs.find(f => !/^container\.xml$/i.test(f.name)) || fs[0];
    if (!main) throw new Error('압축 안에 악보(MusicXML)가 없어요');
    return new TextDecoder('utf-8').decode(await main.arrayBuffer());
  }
  return await file.text();
}

const kids = (el, tag) => el ? [...el.children].filter(c => c.tagName === tag) : [];
const kid = (el, tag) => kids(el, tag)[0] || null;
const txt = (el, tag) => { const k = kid(el, tag); return k ? k.textContent.trim() : ''; };

// 악보 → { title, tempo, key, meter:[n,d], pickup(16분음표 칸), parts:[{id,name,notes:[{p,s,d,ly:{t,sb}|ext}],lyrics}] }
export function parse(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 파일을 읽지 못했어요');
  const root = doc.documentElement;
  if (root.tagName === 'score-timewise') throw new Error('timewise 형식은 아직 읽지 못해요 — 뮤즈스코어에서 다시 내보내 주세요');
  const title = txt(kid(root, 'work'), 'work-title') || txt(root, 'movement-title') || (root.querySelector('credit-words') || {}).textContent || '';
  const names = {}; kids(kid(root, 'part-list'), 'score-part').forEach(sp => { names[sp.getAttribute('id')] = txt(sp, 'part-name') || txt(sp, 'part-abbreviation') || sp.getAttribute('id'); });
  let tempo = 0, fifths = null, meter = null, pickup = 0;
  const parts = kids(root, 'part').map((part, pi) => {
    let div = 1, pos = 0, tr = 0, first = true;
    const notes = []; let lastStart = null;
    kids(part, 'measure').forEach((m, mi) => {
      const attr = kid(m, 'attributes');
      if (attr) {
        if (kid(attr, 'divisions')) div = +txt(attr, 'divisions') || div;
        const k = kid(attr, 'key'); if (k && fifths == null && pi === 0) fifths = +txt(k, 'fifths') || 0;
        const t = kid(attr, 'time'); if (t && !meter) { const bt = String(txt(t, 'beats') || '4'); meter = [bt.split('+').reduce((a, v) => a + (+v || 0), 0) || 4, +txt(t, 'beat-type') || 4, bt]; }
        const trn = kid(attr, 'transpose'); if (trn) tr = (+txt(trn, 'chromatic') || 0) + 12 * (+txt(trn, 'octave-change') || 0);
      }
      m.querySelectorAll('sound[tempo]').forEach(snd => { if (!tempo) tempo = +snd.getAttribute('tempo'); });
      if (!tempo) { const pm = m.querySelector('metronome per-minute'); if (pm) tempo = +pm.textContent || 0; }
      const start = pos; let cur = pos, maxEnd = pos;
      for (const el of m.children) {
        if (el.tagName === 'backup') { cur -= (+txt(el, 'duration') || 0) / div * 4; continue; }
        if (el.tagName === 'forward') { cur += (+txt(el, 'duration') || 0) / div * 4; maxEnd = Math.max(maxEnd, cur); continue; }
        if (el.tagName !== 'note') continue;
        const dur = (+txt(el, 'duration') || 0) / div * 4;
        const isChord = !!kid(el, 'chord'), voice = txt(el, 'voice') || '1', staff = txt(el, 'staff') || '1';
        if (isChord) { if (lastStart != null && voice === '1' && staff === '1') { const pt = kid(el, 'pitch'); if (pt) { const p = 12 * (+txt(pt, 'octave') + 1) + STEP[txt(pt, 'step')] + (+txt(pt, 'alter') || 0) + tr; const n = notes[notes.length - 1]; if (n && n.s === lastStart && p > n.p) n.p = p; } } continue; }
        const at = cur; cur += dur; maxEnd = Math.max(maxEnd, cur);
        if (kid(el, 'grace') || voice !== '1' || staff !== '1') continue;
        const pt = kid(el, 'pitch'); if (!pt) { lastStart = null; continue; } // 쉼표
        const p = 12 * (+txt(pt, 'octave') + 1) + STEP[txt(pt, 'step')] + (+txt(pt, 'alter') || 0) + tr;
        const ties = kids(el, 'tie').map(t => t.getAttribute('type'));
        const lyEl = el.querySelector('lyric');
        let ly = null;
        if (lyEl) { const tt = [...lyEl.querySelectorAll('text')].map(t => t.textContent).join('').trim(); if (tt) ly = { t: tt, sb: txt(lyEl, 'syllabic') || 'single' }; else if (lyEl.querySelector('extend')) ly = { ext: true }; }
        const prev = notes[notes.length - 1];
        if (ties.includes('stop') && prev && prev.p === p && Math.abs(prev.s + prev.d - at) < .01) { prev.d += dur; lastStart = at; continue; }
        notes.push({ p, s: at, d: dur, ly }); lastStart = at;
      }
      const len = Math.max(maxEnd, cur) - start;
      if (first && pi === 0 && (m.getAttribute('implicit') === 'yes' || (meter && len > 0 && len < meter[0] * 16 / meter[1] - .01))) pickup = Math.round(len);
      first = false;
      pos = start + (len > 0 ? len : (meter ? meter[0] * 16 / meter[1] : 16));
    });
    return { id: part.getAttribute('id'), name: names[part.getAttribute('id')] || `파트 ${pi + 1}`, notes, transposed: tr };
  });
  // 못갖춘마디: 첫 마디 길이만큼 앞으로(1마디 첫 박 = 0)
  parts.forEach(pt => pt.notes.forEach(n => { n.s -= pickup; }));
  return { title: String(title).trim(), tempo: Math.round(tempo) || 0, key: FIFTHS[fifths ?? 0] || 'C', meter: meter || [4, 4], pickup, parts };
}

// 노래 파트 고르기: 가사가 가장 많은 파트(없으면 첫 파트)
export function melodyPart(sc) {
  let best = sc.parts[0], bn = -1;
  sc.parts.forEach(p => { const n = p.notes.filter(x => x.ly && x.ly.t).length; if (n > bn) { bn = n; best = p; } });
  return best;
}

// 플랫폼 곡으로: 2마디 한 줄 가사(낱말 띄어쓰기는 syllabic로 되살림) + 음표(lx)
export function toSong(sc, part, { pickups = [0, 2, 4, 6, 8, 12], line = 32, lineBars = 2 } = {}) {
  const P = pickups.reduce((a, v) => Math.abs(v - sc.pickup) < Math.abs(a - sc.pickup) ? v : a, 0);
  let notes = part.notes.filter(n => n.s >= -P).map(n => ({ ...n, s: Math.round(n.s), d: Math.max(1, Math.round(n.d)) }));
  const lineOf = s => Math.floor((s + P) / line);
  // 노래가 나오기 전의 빈 줄(전주 마디)은 덜어 낸다 — 전주는 6단계 편곡에서 다시 붙인다
  const lead = notes.length ? Math.max(0, lineOf(Math.min(...notes.map(n => n.s)))) : 0;
  if (lead) notes = notes.map(n => ({ ...n, s: n.s - lead * line }));
  const nLines = Math.max(1, notes.length ? lineOf(Math.max(...notes.map(n => n.s))) + 1 : 1);
  const lines = Array.from({ length: nLines }, () => ({ text: '', chorus: false }));
  const melody = []; const seen = new Set();
  notes.forEach(n => {
    const li = lineOf(n.s), firstInLine = !seen.has(li); seen.add(li);
    let lx = 'n';
    if (n.ly && n.ly.t) {
      const sy = [...n.ly.t].filter(ch => /[\p{L}\p{N}]/u.test(ch));
      if (sy.length >= 2) lx = 'd';
      const sep = n.ly.sb === 'begin' || n.ly.sb === 'middle' ? '' : ' ';
      lines[li].text += sy.slice(0, 2).join('') + sep;
    } else lx = firstInLine ? 'x' : (n.ly && n.ly.ext) || melody.length ? 'e' : 'x';
    melody.push({ p: n.p, s: n.s, d: n.d, lx });
  });
  // 가사가 하나도 없는 악보: 모든 음을 글자 자리로
  if (!part.notes.some(n => n.ly && n.ly.t)) melody.forEach(m => { m.lx = 'n'; });
  lines.forEach(l => { l.text = l.text.replace(/\s+/g, ' ').trim(); });
  return { melody, lines, pickup: P, introBars: lead * lineBars };
}
