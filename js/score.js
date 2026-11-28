// LIVE SCORE · 악보 — abc 악보 글(화면 표시), MusicXML(뮤즈스코어)
import { BAR, KEYS, METER, KEYMAP, keyAtBar, barStart, barLen, meterAtBar, meterChg, meterSigOf, useMeter, pc, toPieces, lyricFlow, shiftKey, chordName, QUAL, is44, beatStarts, meterSig, tempoMark } from './core.js?v=22';

const SHARP_N = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
const FLAT_N = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
const SH = 'FCGDAEB', FL = 'BEADGCF';
const KEYSIG = Object.fromEntries(Object.entries(KEYS).map(([id, k]) => [id, Object.fromEntries([...(k.fifths >= 0 ? SH : FL).slice(0, Math.abs(k.fifths))].map(L => [L, k.fifths >= 0 ? 1 : -1]))]));
export function spell(p, key) {
  const k = KEYS[key] || KEYS.C;
  const [L, alt] = (k.fix && k.fix[pc(p)]) || (k.flat ? FLAT_N : SHARP_N)[pc(p)];
  return { L, alt, oct: Math.floor((p - alt) / 12) - 1 };
}
const DRUM_POS = { kick: 'F', snare: 'c', hat: 'g', crash: 'a', ride: 'f', tom: 'e', tamb: 'e' };
const DRUM_X_HEAD = { hat: 1, crash: 1, ride: 1, tamb: 1 };

function abcPitch(p, key, bar) {
  const { L, alt, oct } = spell(p, key);
  const sig = (KEYSIG[key] || {})[L] || 0;
  const id = L + oct;
  const cur = bar.has(id) ? bar.get(id) : sig;
  let acc = '';
  if (alt !== cur) { acc = alt === 1 ? '^' : alt === -1 ? '_' : '='; bar.set(id, alt); }
  let s = oct >= 5 ? L.toLowerCase() + "'".repeat(oct - 5) : L + ','.repeat(Math.max(0, 4 - oct));
  return acc + s;
}

// 빔 묶음: 한 마디 조각들 → 조각마다 묶음 번호(null = 묶지 않음)
// 4분음표보다 짧은 음표만, 박(16분음표 4칸)마다 묶고, 1·2박 또는 3·4박이 모두 8분음표 둘씩이면 반 마디(8분음표 넷)로 묶는다
function beamGroups(inBar, a) {
  if (!is44()) { // 박(겹박자는 점4분, 혼합박자는 묶음)마다 짧은 음끼리 빔
    const bs = beatStarts(), bt = q => bs.filter(x => x <= q.s - a).length - 1;
    return inBar.map(q => q.p != null && q.d < Math.min(4, METER.beats[bt(q)]) + (METER.beats[bt(q)] === 6 && q.d === 4 ? 1 : 0) ? 'b' + bt(q) : null);
  }
  const beat = q => Math.floor((q.s - a) / 4);
  const short = q => q.p != null && q.d < 4;
  const plain8 = bt => { const qs = inBar.filter(q => beat(q) === bt); return qs.length === 2 && qs.every(q => q.p != null && q.d === 2) && (qs[0].s - a) % 4 === 0; };
  const half = [plain8(0) && plain8(1), plain8(2) && plain8(3)];
  return inBar.map(q => {
    if (!short(q)) return null;
    const bt = beat(q);
    return half[bt >> 1] ? 'h' + (bt >> 1) : 'b' + bt;
  });
}

// voices: [{id, name, clef, notes, drum?, lyrics?:{map}, chords?:[{s,name}]}]
export function buildAbc(o) { return buildAbcMap(o).abc; }
// 편집기용: 악보 글과 함께, 글 속 각 음표·쉼표 위치(marks)를 돌려준다
// layout: intro(전주 마디 수 — 0이면 못갖춘마디는 짧은 첫 마디), sections [{bar, name}](리허설 표시·겹세로줄),
// header {subtitle, credit, style, info}(악보 머리), 성부마다 dyn [{s, m}](셈여림) · tech [{s, text}](주법 글)
// keys: 조 지도(전조) · transposed: 이조 악기를 기보음으로(피날레 '실음 보기' 끔)
export function buildAbcMap({ title = '', sub = '', tempo = 92, key = 'C', bars, perLine = 4, voices, showTitle = true, pickup = METER.pickup, cutEnd, barNumbers = true, intro = 0, sections = null, header = null, multirest = false, keys = KEYMAP.list, transposed = false }) {
  const kAt = b => keyAtBar(Math.max(0, b), key, keys), kChg = b => b > 0 && kAt(b) !== kAt(b - 1);
  if (intro) pickup = 0; // 전주가 있으면 여린내기 음은 전주 마지막 마디 안에 들어간다
  if (cutEnd == null) { // 못갖춘마디로 시작하면 마지막 마디를 그만큼 짧게(그 자리에 음이 없을 때만)
    const lastEnd = Math.max(0, ...voices.flatMap(v => v.notes.map(n => n.s + n.d)));
    cutEnd = lastEnd <= barStart(bars) - pickup ? pickup : 0;
  }
  const first = intro ? -intro : pickup ? -1 : 0;
  const total = barStart(bars) - cutEnd, start = intro ? -intro * BAR : -pickup;
  const lines = []; let pos = 0;
  const push = l => { lines.push(l); pos += l.length + 1; };
  const marks = [];
  const secAt = new Map((sections || []).map(x => [x.bar, x.name]));
  push('X:1');
  if (showTitle && title) push('T:' + title.replace(/\n/g, ' '));
  if (showTitle && header && header.subtitle) push('T:' + header.subtitle);
  if (showTitle && (header && header.credit || sub)) push('C:' + (header && header.credit || sub));
  const sig = meterSig(), tm = tempoMark(tempo);
  push(`M:${sig.num}/${sig.den}`); push('L:1/16');
  if (showTitle) push(header && header.style ? `Q:"${header.style}" ${tm.abc}` : `Q:${tm.abc}`);
  ['%%vocalfont "Pretendard" 13', '%%gchordfont "Pretendard" 12', '%%titlefont "Pretendard" 24', '%%subtitlefont "Pretendard" 14', '%%composerfont "Pretendard" 11', '%%voicefont "Pretendard" 11', '%%tempofont "Pretendard" 12', '%%partsfont "Pretendard" 12', '%%annotationfont "Pretendard" 10.5', '%%textfont "Pretendard" 11', '%%partsbox true'].forEach(push);
  if (showTitle && header && header.info) { // 편성 줄: 악기가 많으면 여러 줄로(쪽 밖으로 넘치지 않게)
    const [names, secs] = header.info.split(' | '), out = [];
    names.split(' · ').forEach(t => { const l = out[out.length - 1]; if (l != null && (l + ' · ' + t).length <= 58) out[out.length - 1] = l + ' · ' + t; else out.push(t); });
    if (secs) out.push(secs);
    out.forEach(l => push('%%center ' + l));
  }
  if (barNumbers) push('%%measurenb 0'); // 줄마다 첫 마디 번호
  if (pickup) push('%%setbarnb 0'); // 못갖춘마디는 0마디
  if (voices.length > 1) push('%%score ' + scoreLine(voices));
  push('K:' + key);
  voices.forEach(v => push(`V:${v.id} clef=${v.clef === 'perc' ? 'perc' : v.clef || 'treble'}${voices.length > 1 ? ` name="${(v.name || '').replace(/"/g, '')}"${v.sub ? ` subname="${v.sub}"` : ''}` : ''}`));
  const vp = voices.map(v => {
    const notes = v.drum ? v.notes.map(n => ({ ...n, chord: undefined, ref: n })) : v.notes;
    const pieces = toPieces(notes, total, start);
    if (v.drum) pieces.forEach(q => { if (q.ref && q.ref.ref) q.ref = q.ref.ref; });
    // 셈여림은 그 자리부터 첫 음에, 주법 글은 그 자리 첫 조각에
    const pre = new Map();
    const at = (s, k, txt, noteOnly) => { const q = pieces.find(x => x.s >= s && x.s < s + BAR * 2 && (!noteOnly || x.p != null)); if (q) pre.set(q, (pre.get(q) || '') + (k === 'tech' ? `"^${txt.replace(/"/g, '')}"` : `!${txt}!`)); };
    (v.tech || []).forEach(t => at(t.s, 'tech', t.text, false));
    (v.dyn || []).forEach(d => at(d.s, 'dyn', d.m, true));
    // 이음줄: 한 글자를 여러 음에 늘여 부르는 곳(네우마·멜리스마) — 글자 음부터 마지막 늘임 음까지
    const slA = new Set(), slB = new Set();
    if (v.lyrics && !v.drum) {
      const refs = []; pieces.forEach(q => { if (q.p != null && q.ref && refs[refs.length - 1] !== q.ref) refs.push(q.ref); });
      const ext = r => { const m = v.lyrics.map.get(r.id); return !!(m && m.kind === 'ext'); };
      refs.forEach((r, i) => { const nx = refs[i + 1]; if (!ext(r) && nx && ext(nx)) slA.add(r); if (ext(r) && (!nx || !ext(nx)) && i > 0) slB.add(r); });
    }
    return { v, pieces, pre, slA, slB };
  });
  // 줄마다 마디: 보통은 perLine 마디씩, 파트보(multirest)는 이어진 빈 마디를 여러 마디 쉼표(Z) 한 칸으로 센다
  const lineBars = [];
  if (multirest) {
    const empty = b => vp.every(({ pieces, pre }) => !pieces.some(q => q.s >= barStart(b) && q.s < barStart(b + 1) && (q.p != null || pre.has(q))));
    const segs = [];
    for (let b = intro ? first : pickup ? -1 : 0; b < bars;) {
      if (!(pickup && b === -1) && empty(b)) { let e = b + 1; while (e < bars && empty(e) && !secAt.has(e) && !meterChg(e)) e++; segs.push({ b, z: e - b }); b = e; }
      else segs.push({ b: b++, z: 1 });
    }
    let cur = [], n = 0;
    segs.forEach(sg => { cur.push(sg); if (!(pickup && sg.b === -1)) n++; if (n >= perLine) { lineBars.push(cur); cur = []; n = 0; } });
    if (cur.length) lineBars.push(cur);
  } else {
    for (let b0 = intro ? first : 0; b0 < bars; b0 += perLine) { const b1 = Math.min(bars, b0 + perLine), sg = []; for (let b = b0 === 0 && pickup ? -1 : b0; b < b1; b++) sg.push({ b, z: 1 }); lineBars.push(sg); }
  }
  lineBars.forEach((segs, li) => {
    vp.forEach(({ v, pieces, pre, slA, slB }, vi) => {
      const tr = transposed && !v.drum && v.trans ? v.trans : 0; // 이조 악기: 기보음 = 실음 + trans, 조표도 그만큼
      const vkey = b => { const k0 = v.key && !keys.length ? v.key : kAt(b); return tr ? shiftKey(k0, tr) : k0; };
      const k0 = vkey(segs[0].b);
      let mus = `[V:${v.id}] ` + (li === 0 && v.drum ? '[K:none clef=perc] ' : !v.drum && (k0 !== key || kChg(segs[0].b)) ? `[K:${k0}] ` : ''); // 타악기 보표에는 조표를 적지 않는다 · 줄마다 그 자리 조
      const lyr = [], local = [];
      const dsp = p => p + (v.disp || 0) + tr; // 옥타브 위로 적는 악기(기타·베이스) · 이조 악기
      for (const { b, z } of segs) {
        if (z > 1) { // 여러 마디 쉼표
          const last = b + z - 1;
          if (vi === 0 && secAt.has(b)) mus += `[P:${secAt.get(b)}] `;
          mus += `Z${z} ${last === bars - 1 ? '|]' : secAt.has(last + 1) ? '||' : '|'} `;
          continue;
        }
        const bar = new Map(), bk = vkey(b);
        if (vi === 0 && secAt.has(b)) mus += `[P:${secAt.get(b)}] `;
        if (!v.drum && kChg(b) && b !== segs[0].b) mus += `[K:${bk}] `; // 조바꿈: 새 조표
        if (meterChg(b)) { const sg = meterSigOf(meterAtBar(b)); mus += `[M:${sg.num}/${sg.den}] `; } // 변박자: 새 박자표
        const endBar = b === bars - 1 ? '|]' : (secAt.has(b + 1) || kChg(b + 1)) && b >= first && !(pickup && b === -1) ? '||' : '|';
        const inBar = pieces.filter(q => q.s >= barStart(b) && q.s < barStart(b + 1));
        if (!inBar.length) { mus += ' ' + endBar + ' '; continue; }
        const group = useMeter(meterAtBar(b), () => beamGroups(inBar, barStart(b)));
        let lastG = null;
        inBar.forEach((q, k) => {
          // 빔: 같은 박(또는 8분음표 넷이 이어진 반 마디) 안의 짧은 음표는 띄어 쓰지 않아 꼬리를 묶는다
          const g = group[k];
          if (k > 0 && !(g != null && g === lastG)) mus += ' ';
          lastG = g;
          local.push({ off: mus.length, vi, bar: b, mm: b - first, k, q });
          let tok = pre.get(q) || '';
          if (v.chords) { const c = v.chords.find(c => c.s === q.s); if (c) tok += `"${c.name.replace(/♯/g, '#').replace(/♭/g, 'b')}"`; }
          if (q.p == null) { mus += tok + 'z' + q.d; return; }
          if (v.drum) {
            const kit = q.ref.kit || ['kick'];
            const ps = kit.map(kk => (DRUM_X_HEAD[kk] ? '!style=x!' : '') + (DRUM_POS[kk] || 'c'));
            tok += (ps.length > 1 ? '[' + ps.join('') + ']' : ps[0]) + q.d;
          } else if (v.slash) {
            tok += '!style=rhythm!B' + q.d;
          } else if (q.ref && q.ref.chord && q.ref.chord.length > 1) {
            tok += '[' + [...q.ref.chord].sort((x, y) => x - y).map(p => abcPitch(dsp(p), bk, bar)).join('') + ']' + q.d;
          } else tok += (slA.has(q.ref) && !q.tiePrev ? '(' : '') + abcPitch(dsp(q.p), bk, bar) + q.d;
          if (q.tieNext) tok += '-';
          else if (slB.has(q.ref)) tok += ')';
          mus += tok;
          if (v.lyrics) {
            if (q.tiePrev) lyr.push('_');
            else { const m = v.lyrics.map.get(q.ref.id); lyr.push(m ? (m.kind === 'ext' ? '_' : m.text ? m.text.replace(/[-_*~\\|]/g, '') + (m.hy ? '-' : '') : '*') : '*'); }
          }
        });
        mus += ' ' + endBar + ' ';
      }
      local.forEach(m => marks.push({ at: pos + m.off, vi: m.vi, bar: m.bar, mm: m.mm, k: m.k, q: m.q }));
      push(mus.trim());
      if (v.lyrics && lyr.length) push('w: ' + lyr.map((t, i) => t + (/-$/.test(t) || i === lyr.length - 1 ? '' : ' ')).join('')); // 'hap-py'처럼 붙임표는 띄우지 않는다
    });
  });
  marks.sort((x, y) => x.at - y.at);
  return { abc: lines.join('\n') + '\n', marks, first };
}

// %%score: 노래 성부는 따로, 악기는 대괄호로 묶고 피아노 두 단은 중괄호
function scoreLine(voices) {
  const out = [], band = [];
  voices.forEach(v => (v.band ? band : out).push(v));
  const bandTxt = []; let i = 0;
  while (i < band.length) {
    const g = band[i].group;
    if (g) { const grp = []; while (i < band.length && band[i].group === g) grp.push(band[i++].id); bandTxt.push(grp.length > 1 ? '{' + grp.join(' ') + '}' : grp[0]); }
    else bandTxt.push(band[i++].id);
  }
  const bandStr = band.length > 1 ? '[' + bandTxt.join(' ') + ']' : bandTxt.join(' ');
  return [...out.map(v => v.id), bandStr].filter(Boolean).join(' ');
}

// 노래 성부 만들기(가사·화음 기호 포함)
export function melodyVoice(melody, lyricsLines, chords, name = '노래', id = 'V1') {
  const flow = lyricFlow(melody, lyricsLines);
  return { id, name, clef: 'treble', notes: melody.filter(n => n.p != null), lyrics: flow, chords: chords ? chords.map(c => ({ s: c.s, name: c.name })) : null };
}

export function renderAbc(el, abc, opts = {}) {
  if (!window.ABCJS) { el.textContent = '악보 그리기 도구를 불러오지 못했습니다.'; return null; }
  const r = window.ABCJS.renderAbc(el, abc, {
    add_classes: true, responsive: opts.fixed ? undefined : 'resize', oneSvgPerLine: !!opts.print, paddingtop: 6, paddingbottom: opts.print ? 14 : 6, paddingleft: 4, paddingright: 4,
    staffwidth: opts.staffwidth || 740, scale: opts.scale || 1, clickListener: opts.click, foregroundColor: '#1a1c1f', selectionColor: '#1F4D3A', dragging: false,
    format: { vocalfont: 'Pretendard 13', gchordfont: 'Pretendard 12' },
  });
  return r && r[0];
}

// ── MusicXML ──
const TYPE = { 24: ['whole', 1], 16: ['whole', 0], 12: ['half', 1], 8: ['half', 0], 6: ['quarter', 1], 4: ['quarter', 0], 3: ['eighth', 1], 2: ['eighth', 0], 1: ['16th', 0] };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DRUM_X = { kick: ['F', 4, 36], snare: ['C', 5, 38], tom: ['E', 5, 45], hat: ['G', 5, 42], ride: ['F', 5, 51], crash: ['A', 5, 49], tamb: ['E', 5, 54] };

// parts: [{name, clef, notes, drum?, program, lyrics?:flow, chords?:[{s,r,q,name}] }]
export function buildMusicXML({ title, sub, tempo, key, bars, parts, pickup = METER.pickup, intro = 0, sections = null, header = null, keys = KEYMAP.list }) {
  const kAt = b => keyAtBar(Math.max(0, b), key, keys);
  if (intro) pickup = 0;
  const first = intro ? -intro : pickup ? -1 : 0;
  const lastEnd = Math.max(0, ...parts.flatMap(p => p.notes.map(n => n.s + n.d)));
  const total = barStart(bars) - (pickup && lastEnd <= barStart(bars) - pickup ? pickup : 0), start = intro ? -intro * BAR : -pickup;
  const secAt = new Map((sections || []).map(q => [q.bar, q.name]));
  const k = KEYS[key] || KEYS.C;
  let x = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${esc(title || '우리 노래')}</work-title></work>
  <identification>${header && header.credit || sub ? `<creator type="composer">${esc(header && header.credit || sub)}</creator>` : ''}<encoding><software>LIVE SCORE 실시간 악보</software></encoding></identification>
${header && header.subtitle ? `  <credit page="1"><credit-type>subtitle</credit-type><credit-words default-x="600" default-y="1450" justify="center" font-size="14">${esc(header.subtitle)}</credit-words></credit>\n` : ''}  <part-list>\n`;
  const band = parts.filter(p => p.band);
  parts.forEach((p, i) => {
    const id = 'P' + (i + 1);
    if (p.band && p === band[0] && band.length > 1) x += `    <part-group type="start" number="1"><group-symbol>bracket</group-symbol><group-barline>yes</group-barline></part-group>\n`;
    if (p.group && (i === 0 || parts[i - 1].group !== p.group)) x += `    <part-group type="start" number="2"><group-name>${esc(p.name)}</group-name><group-symbol>brace</group-symbol><group-barline>yes</group-barline></part-group>\n`;
    x += `    <score-part id="${id}"><part-name${p.name ? '' : ' print-object="no"'}>${esc(p.name || '')}</part-name>${p.sub ? `<part-abbreviation>${esc(p.sub)}</part-abbreviation>` : ''}`;
    if (p.drum) {
      Object.entries(DRUM_X).forEach(([kk, v]) => { x += `<score-instrument id="${id}-${kk}"><instrument-name>${kk}</instrument-name></score-instrument>`; });
      Object.entries(DRUM_X).forEach(([kk, v]) => { x += `<midi-instrument id="${id}-${kk}"><midi-channel>10</midi-channel><midi-unpitched>${v[2] + 1}</midi-unpitched></midi-instrument>`; });
    } else {
      x += `<score-instrument id="${id}-I1"><instrument-name>${esc(p.name || p.sub || '악기')}</instrument-name></score-instrument><midi-instrument id="${id}-I1"><midi-channel>${i + 1 >= 10 ? i + 2 : i + 1}</midi-channel><midi-program>${(p.program ?? 0) + 1}</midi-program></midi-instrument>`;
    }
    x += `</score-part>\n`;
    if (p.group && (i === parts.length - 1 || parts[i + 1].group !== p.group)) x += `    <part-group type="stop" number="2"/>\n`;
    if (p.band && p === band[band.length - 1] && band.length > 1) x += `    <part-group type="stop" number="1"/>\n`;
  });
  x += `  </part-list>\n`;
  parts.forEach((p, i) => {
    const id = 'P' + (i + 1);
    x += `  <part id="${id}">\n`;
    const pieces = toPieces(p.drum ? p.notes.map(n => ({ ...n, chord: undefined })) : p.notes, total, start);
    const slA = new Set(), slB = new Set(); // 이음줄(네우마·멜리스마)
    if (p.lyrics && !p.drum) {
      const refs = []; pieces.forEach(q => { if (q.p != null && q.ref && refs[refs.length - 1] !== q.ref) refs.push(q.ref); });
      const ext = r => { const m = p.lyrics.map.get(r.id); return !!(m && m.kind === 'ext'); };
      refs.forEach((r, i) => { const nx = refs[i + 1]; if (!ext(r) && nx && ext(nx)) slA.add(r); if (ext(r) && (!nx || !ext(nx)) && i > 0) slB.add(r); });
    }
    const disp = p.disp || 0;
    // 이조 악기(클라리넷·트럼펫·색소폰): 기보음과 그 조표로 적고 <transpose>로 실음을 알려 준다 — 뮤즈스코어 '실음 보기'도 맞게
    const tr = p.drum ? 0 : p.trans || 0, pkAt = b => (tr ? shiftKey(kAt(b), tr) : kAt(b)); let pkey = pkAt(first), pk = KEYS[pkey] || k;
    const DIA = { 2: 1, 9: 5, 14: 8, 21: 12, 7: 4, '-3': -2 };
    const b0 = first;
    const dir = new Map(); // 셈여림·주법 글: 그 자리 첫 음(주법은 첫 조각) 앞에
    const put = (s, xml, noteOnly) => { const q = pieces.find(z => z.s >= s && z.s < s + BAR * 2 && (!noteOnly || z.p != null)); if (q) dir.set(q, (dir.get(q) || '') + xml); };
    (p.tech || []).forEach(t => put(t.s, `      <direction placement="above"><direction-type><words font-size="9">${esc(t.text)}</words></direction-type></direction>\n`, false));
    (p.dyn || []).forEach(d => put(d.s, `      <direction placement="below"><direction-type><dynamics><${d.m}/></dynamics></direction-type></direction>\n`, true));
    for (let b = b0; b < bars; b++) {
      const num = intro ? b - first + 1 : b + 1;
      x += `    <measure number="${num}"${!intro && b < 0 ? ' implicit="yes"' : ''}>\n`;
      { // 조바꿈 · 변박자: 그 마디 첫머리에 새 조표·박자표
        const kc = b > b0 && b > 0 && kAt(b) !== kAt(b - 1), mc = b > b0 && meterChg(b);
        if (kc) { pkey = pkAt(b); pk = KEYS[pkey] || k; }
        if ((kc && !p.drum) || mc) { const sg = meterSigOf(meterAtBar(b)); x += `      <attributes>${kc && !p.drum ? `<key><fifths>${pk.fifths}</fifths><mode>major</mode></key>` : ''}${mc ? `<time><beats>${sg.num}</beats><beat-type>${sg.den}</beat-type></time>` : ''}</attributes>\n`; }
      }
      if (i === 0 && secAt.has(b)) x += `      <direction placement="above"><direction-type><rehearsal enclosure="rectangle">${esc(secAt.get(b))}</rehearsal></direction-type></direction>\n`;
      if (b === b0) {
        const clef = p.drum ? '<sign>percussion</sign><line>2</line>' : p.clef === 'bass' ? '<sign>F</sign><line>4</line>' : p.clef === 'alto' ? '<sign>C</sign><line>3</line>' : p.clef === 'treble-8' ? '<sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change>' : '<sign>G</sign><line>2</line>';
        const tx = disp || tr ? `<transpose><diatonic>${-(7 * disp / 12 + (DIA[tr] ?? Math.round(tr * 7 / 12)))}</diatonic><chromatic>${-(disp + tr)}</chromatic></transpose>` : '';
        x += `      <attributes><divisions>4</divisions><key><fifths>${pk.fifths}</fifths><mode>major</mode></key><time><beats>${meterSig().num}</beats><beat-type>${meterSig().den}</beat-type></time><clef>${clef}</clef>${tx}</attributes>\n`;
        if (i === 0) { const [bu, dot, pm] = tempoMark(tempo).xml; x += `      <direction placement="above"><direction-type><metronome><beat-unit>${bu}</beat-unit>${dot ? '<beat-unit-dot/>' : ''}<per-minute>${pm}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>\n`; }
      }
      const inBar = pieces.filter(q => q.s >= barStart(b) && q.s < barStart(b + 1));
      for (const q of inBar) {
        if (dir.has(q)) x += dir.get(q);
        if (p.chords) {
          const c = p.chords.find(c => c.s === q.s);
          if (c) {
            // 코드 기호: 음 이름 자리대로(♭VII = B♭ · 나폴리 D♭/F · 독일 증6) — 이조 파트는 그 조로, 전조한 곳은 그 자리 조로
            const tk = c.k ? (tr ? shiftKey(c.k, tr) : c.k) : null;
            const nm = chordName({ r: c.r, q: c.q, deg: c.deg, ...(c.b != null ? { b: c.b } : {}), ...(tk ? { k: tk } : {}) }, pkey), [hd, bn] = nm.split('/');
            const sa = t => ({ L: t[0], alt: (t.match(/♯/g) || []).length - (t.match(/♭/g) || []).length }), sp = sa(hd), bb = bn ? sa(bn) : null;
            x += `      <harmony><root><root-step>${sp.L}</root-step>${sp.alt ? `<root-alter>${sp.alt}</root-alter>` : ''}</root><kind text="${esc((QUAL[c.q] || QUAL['']).sym)}">${(QUAL[c.q] || QUAL['']).xml}</kind>${bb ? `<bass><bass-step>${bb.L}</bass-step>${bb.alt ? `<bass-alter>${bb.alt}</bass-alter>` : ''}</bass>` : ''}</harmony>\n`;
          }
        }
        const [type, dot] = TYPE[q.d] || ['16th', 0];
        if (q.p == null) {
          x += q.d === barLen(b) && q.s === barStart(b) ? `      <note><rest measure="yes"/><duration>${q.d}</duration><voice>1</voice></note>\n` : `      <note><rest/><duration>${q.d}</duration><voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}</note>\n`;
          continue;
        }
        if (p.slash) { // 리듬 사선(코드 기호 위에)
          const tie = (q.tiePrev ? '<tie type="stop"/>' : '') + (q.tieNext ? '<tie type="start"/>' : '');
          const tied = (q.tiePrev ? '<tied type="stop"/>' : '') + (q.tieNext ? '<tied type="start"/>' : '');
          x += `      <note><pitch><step>B</step><octave>4</octave></pitch><duration>${q.d}</duration>${tie}<voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}<stem>up</stem><notehead>slash</notehead>${tied ? `<notations>${tied}</notations>` : ''}</note>\n`;
          continue;
        }
        const tie = (q.tiePrev ? '<tie type="stop"/>' : '') + (q.tieNext ? '<tie type="start"/>' : '');
        const tied = (q.tiePrev ? '<tied type="stop"/>' : '') + (q.tieNext ? '<tied type="start"/>' : '');
        const slur = (slA.has(q.ref) && !q.tiePrev ? '<slur type="start" number="1" placement="above"/>' : '') + (slB.has(q.ref) && !q.tieNext ? '<slur type="stop" number="1"/>' : '');
        const notations = tied || slur ? `<notations>${tied}${slur}</notations>` : '';
        if (p.drum) {
          (q.ref.kit || ['kick']).forEach((kk, j) => {
            const [st, oc] = DRUM_X[kk] || DRUM_X.snare;
            x += `      <note>${j ? '<chord/>' : ''}<unpitched><display-step>${st}</display-step><display-octave>${oc}</display-octave></unpitched><duration>${q.d}</duration><instrument id="${id}-${kk}"/><voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}<stem>up</stem>${DRUM_X_HEAD[kk] ? '<notehead>x</notehead>' : ''}</note>\n`;
          });
          continue;
        }
        const ps = q.ref && q.ref.chord && q.ref.chord.length > 1 ? [...q.ref.chord].sort((a, b) => a - b) : [q.p];
        ps.forEach((pp, j) => {
          const sp = spell(pp + disp + tr, pkey);
          let ly = '';
          if (j === 0 && p.lyrics && !q.tiePrev) {
            const m = p.lyrics.map.get(q.ref.id);
            if (m && m.kind === 'syl' && m.text) { const sb = m.wStart === false ? (m.wEnd === false ? 'middle' : 'end') : (m.wEnd === false ? 'begin' : 'single'); ly = `<lyric number="1"><syllabic>${sb}</syllabic><text>${esc(m.text)}</text></lyric>`; }
            else if (m && m.kind === 'ext') ly = `<lyric number="1"><extend/></lyric>`;
          }
          x += `      <note>${j ? '<chord/>' : ''}<pitch><step>${sp.L}</step>${sp.alt ? `<alter>${sp.alt}</alter>` : ''}<octave>${sp.oct}</octave></pitch><duration>${q.d}</duration>${tie}<voice>1</voice><type>${type}</type>${dot ? '<dot/>' : ''}${notations}${ly}</note>\n`;
        });
      }
      if (b === bars - 1) x += `      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n`;
      else if (secAt.has(b + 1) && !(pickup && b === -1)) x += `      <barline location="right"><bar-style>light-light</bar-style></barline>\n`;
      x += `    </measure>\n`;
    }
    x += `  </part>\n`;
  });
  x += `</score-partwise>\n`;
  return x;
}
