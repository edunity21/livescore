// LIVE SCORE · 악보 편집기 — 악보의 음표를 눌러 고르고, 높이·길이를 바로 고친다
import * as C from './core.js?v=13';
import * as SC from './score.js?v=13';
import * as SND from './sound.js?v=13';

const LENS = [[1, '16분'], [2, '8분'], [4, '4분'], [6, '점4분'], [8, '2분'], [12, '점2분'], [16, '온']];
const KEYLEN = { '3': 1, '4': 2, '5': 4, '6': 8, '7': 16 };
let active = null;
export const activeEditor = () => active;

// opts: { model: () => ({tempo,key,bars,perLine,title,sub,showTitle,voices:[{id,name,clef,notes,drum,lyrics,chords,editable}]}),
//         onChange(), onPlay(fromUnit), toast(msg), staffwidth }
export function createEditor(host, opts) {
  host.classList.add('editor');
  host.innerHTML = `
    <div class="ed-bar" role="toolbar" aria-label="악보 편집 도구">
      <div class="ed-sel"><span class="ed-dot"></span><b class="ed-what">음표를 눌러 고르세요</b><small class="ed-hint">↑↓ 반음 · Shift+↑↓ 옥타브 · ←→ 이동 · 3~7 길이 · Del 지우기 · 건반을 누르면 그 음으로</small></div>
      <div class="ed-tools">
        <div class="ed-grp" aria-label="음 높이"><button type="button" data-e="up" title="반음 위 (↑)">▲</button><button type="button" data-e="down" title="반음 아래 (↓)">▼</button><button type="button" data-e="oup" title="옥타브 위 (Shift+↑)">8va</button><button type="button" data-e="odown" title="옥타브 아래 (Shift+↓)">8vb</button></div>
        <div class="ed-grp lens" aria-label="음 길이">${LENS.map(([d, n]) => `<button type="button" data-len="${d}">${n}</button>`).join('')}</div>
        <div class="ed-grp"><button type="button" data-e="del" title="지우기 (Delete)">지우기</button><button type="button" data-e="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button></div>
        <div class="ed-grp ed-plays"><button type="button" data-e="playall" class="pl" title="처음부터 듣기 (Space)">▶ 처음부터</button><button type="button" data-e="play" class="pl2" title="고른 마디부터 듣기">▶ 여기부터</button></div>
        <div class="ed-grp ed-speed" role="group" aria-label="재생 빠르기"><button type="button" data-sp="-1" title="느리게">−</button><b class="ed-spv" title="재생 빠르기(악보의 빠르기는 그대로)">100%</b><button type="button" data-sp="1" title="빠르게">＋</button></div>
        <div class="ed-grp ed-lygrp" hidden><button type="button" data-e="lyric" class="ed-lybtn" title="가사 입력 (L) — 음표를 누르고 글자를 친 뒤 띄어쓰기로 다음 음표">가사 입력</button></div>
        <div class="ed-grp ed-view" role="group" aria-label="악보 보기"><button type="button" data-view="page">페이지 보기</button><button type="button" data-view="scroll">스크롤 보기</button></div>
        <div class="ed-grp ed-prgrp"><button type="button" data-e="print" class="ed-prbtn" title="총보·파트보 인쇄 (Ctrl+P)">인쇄</button></div>
      </div>
    </div>
    <div class="score ed-score"><div class="ed-cursor" hidden></div></div>`;
  const scoreEl = host.querySelector('.ed-score');
  const E = { marks: [], tune: null, sel: null, hist: [], model: null, view: 'page', tl: null, follow: false, speed: 1 };
  try { E.view = localStorage.getItem('livescore-view') || 'page'; E.speed = +localStorage.getItem('livescore-speed') || 1; } catch (x) { }
  const SPEEDS = [.5, .6, .7, .75, .8, .9, 1, 1.1, 1.25, 1.5];
  function speedUI() {
    const m = E.model, b = host.querySelector('.ed-spv');
    b.textContent = `${Math.round(E.speed * 100)}%` + (m && m.tempo ? ` · ♩=${Math.round(m.tempo * E.speed)}` : '');
    host.querySelector('.ed-speed').classList.toggle('on', E.speed !== 1);
  }
  function setSpeed(dir) {
    let i = SPEEDS.indexOf(E.speed); if (i < 0) i = SPEEDS.indexOf(1);
    E.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
    try { localStorage.setItem('livescore-speed', E.speed); } catch (x) { }
    speedUI();
    if (SND.isPlaying() && E.follow) { // 듣는 중이면 지금 자리부터 새 빠르기로 다시
      const pos = SND.position(); const btn = host.querySelector('.ed-plays .playing') || host.querySelector('[data-e=playall]');
      SND.stop(); opts.onPlay && opts.onPlay(Math.floor(pos), btn, E.speed); if (SND.isPlaying()) follow();
    }
  }
  const cursor = () => scoreEl.querySelector('.ed-cursor');

  function render() {
    E.model = opts.model();
    const m = E.model;
    if (!m || !m.voices.length) { scoreEl.innerHTML = '<p class="empty">아직 악보가 없어요.</p>'; return; }
    const scroll = E.view === 'scroll';
    const { abc, marks } = SC.buildAbcMap({ title: m.title, sub: m.sub, tempo: m.tempo, key: m.key, bars: m.bars, perLine: scroll ? m.bars + (m.intro || 1) : (m.perLine || 4), voices: m.voices, showTitle: !!m.showTitle && !scroll, intro: m.intro || 0, sections: m.sections, header: m.header, ...(m.pickup != null ? { pickup: m.pickup } : {}) });
    E.marks = marks;
    const cur = cursor(); if (cur) cur.remove();
    scoreEl.classList.toggle('scrollview', scroll);
    host.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === E.view));
    const w = scroll ? Math.max(900, m.bars * Math.min(380, Math.max(170, 40 + avgPerBar(marks, m.bars) * 20))) : (opts.staffwidth || 980);
    E.tune = SC.renderAbc(scoreEl, abc, { click: onClick, staffwidth: w, fixed: scroll });
    const c = document.createElement('div'); c.className = 'ed-cursor'; c.hidden = true; scoreEl.appendChild(c);
    E.tl = null; E.els = null;
    if (scroll) stickyHead();
    host.querySelector('.ed-lygrp').hidden = !opts.lyric || lyVoice() < 0;
    host.querySelector('.ed-prgrp').hidden = scroll; // 인쇄는 페이지 보기에서
    paintSel(); speedUI();
    if (LY.on) requestAnimationFrame(lyPlace);
  }
  // 스크롤 보기: 피날레처럼 왼쪽에 보표 시작·음자리표·조표·악기 이름을 고정해 둔다
  function stickyHead() {
    const svg = scoreEl.querySelector('svg'); if (!svg) return;
    const sr = svg.getBoundingClientRect(); if (!sr.width) return;
    // 박자표까지 고정(박자표 오른쪽 끝 + 여백, 첫 음표는 가리지 않게)
    const ts = [...svg.querySelectorAll('.abcjs-time-signature')];
    const fn = [...svg.querySelectorAll('.abcjs-note, .abcjs-rest')].map(e => e.getBoundingClientRect().left).filter(x => x > sr.left);
    const firstNote = fn.length ? Math.min(...fn) - sr.left : Infinity;
    let edge = ts.length ? Math.max(...ts.map(e => e.getBoundingClientRect().right)) - sr.left + 7 : 0;
    if (!(edge > 12)) edge = Number.isFinite(firstNote) ? firstNote - 8 : 0;
    if (Number.isFinite(firstNote)) edge = Math.min(edge, firstNote - 3);
    if (edge < 12) return;
    const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
    const k = vb ? vb.width / sr.width : 1;
    const c = svg.cloneNode(true);
    c.removeAttribute('style'); c.removeAttribute('class');
    c.setAttribute('viewBox', `${vb ? vb.x : 0} ${vb ? vb.y : 0} ${edge * k} ${vb ? vb.height : sr.height}`);
    c.setAttribute('width', edge); c.setAttribute('height', sr.height); c.setAttribute('preserveAspectRatio', 'xMinYMin slice');
    c.querySelectorAll('.ed-on,.ed-play').forEach(x => x.classList.remove('ed-on', 'ed-play'));
    const h = document.createElement('div'); h.className = 'ed-head'; h.setAttribute('aria-hidden', 'true');
    h.style.top = (sr.top - scoreEl.getBoundingClientRect().top + scoreEl.scrollTop) + 'px'; h.style.width = edge + 'px'; h.style.height = sr.height + 'px';
    h.appendChild(c); scoreEl.appendChild(h);
    const sync = () => { const x = scoreEl.scrollLeft; h.hidden = x < 2; h.style.transform = `translateX(${x}px)`; };
    scoreEl.onscroll = sync; sync();
  }
  // 음표 SVG 요소 찾기: 한 번 훑어 표를 만든다(음표마다 악보 전체를 뒤지지 않게)
  function elsMap() {
    if (E.els) return E.els;
    const map = new Map();
    scoreEl.querySelectorAll('.abcjs-note, .abcjs-rest').forEach(el => {
      let v = null, mm = null, n = null;
      for (const c of el.classList) { if (c.startsWith('abcjs-v')) v = c.slice(7); else if (c.startsWith('abcjs-mm')) mm = c.slice(8); else if (/^abcjs-n\d+$/.test(c)) n = c.slice(7); }
      if (v != null && mm != null && n != null) { const k = v + ':' + mm + ':' + n; if (!map.has(k)) map.set(k, []); map.get(k).push(el); }
    });
    return (E.els = map);
  }
  const elsOf = m => elsMap().get(m.vi + ':' + (m.mm ?? m.bar) + ':' + m.k) || [];
  const voiceOf = vi => E.model.voices[vi];
  function markAt(ch) {
    let lo = 0, hi = E.marks.length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (E.marks[mid].at <= ch) { best = E.marks[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }
  function selMarks() {
    const s = E.sel; if (!s) return [];
    return E.marks.filter(m => m.vi === s.vi && (s.ref ? m.q.ref === s.ref : m.q.p == null && m.q.s === s.s));
  }
  function paintSel() {
    scoreEl.querySelectorAll('.ed-on').forEach(e => e.classList.remove('ed-on'));
    const ms = selMarks();
    ms.forEach(m => { elsOf(m).forEach(e => e.classList.add('ed-on')); });
    label();
  }
  function label() {
    const s = E.sel, what = host.querySelector('.ed-what');
    host.classList.toggle('has-sel', !!s);
    if (!s) { what.textContent = '음표를 눌러 고르세요'; return; }
    const v = voiceOf(s.vi), b0 = Math.floor((s.ref ? s.ref.s : s.s) / C.BAR) + 1, intro = E.model.intro || 0;
    const bar = b0 >= 1 ? b0 : intro ? `전주 ${b0 + intro}` : '못갖춘';
    if (!s.ref) { what.textContent = `${v.name} · ${bar}마디 · 쉼표 — ▲▼나 건반으로 음을 넣어요`; return; }
    const n = s.ref;
    const nm = v.drum ? (n.kit || []).map(k => ({ kick: '큰북', snare: '작은북', hat: '하이햇', crash: '심벌', ride: '라이드', tom: '탐' }[k])).join('+') : (n.chord && n.chord.length > 1 ? '화음 ' : '') + `${C.solName(n.p, E.model.key)}(${C.sciName(n.p, E.model.key)})`;
    what.textContent = `${v.name} · ${bar}마디 · ${nm} · ${(LENS.find(l => l[0] === n.d) || [0, n.d / 4 + '박'])[1]}`;
    host.querySelectorAll('[data-len]').forEach(b => b.classList.toggle('on', +b.dataset.len === n.d));
  }
  function onClick(el) {
    active = api;
    const m = markAt(Math.max(el.startChar, (el.endChar || el.startChar + 1) - 1)); if (!m) return;
    const v = voiceOf(m.vi);
    if (LY.on && m.vi === lyVoice() && m.q.p != null) { lySave(); E.sel = { vi: m.vi, ref: m.q.ref }; paintSel(); lyOpen(); return; } // 가사 입력 중: 누른 음표로
    if (LY.on) lyClose();
    if (!v.editable) { E.sel = null; paintSel(); opts.toast && opts.toast(v.lockMsg || '이 파트는 여기서 고칠 수 없어요'); return; }
    E.sel = m.q.p == null ? { vi: m.vi, s: m.q.s, d: m.q.d } : { vi: m.vi, ref: m.q.ref };
    paintSel(); preview();
  }
  function preview() {
    const s = E.sel; if (!s || !s.ref || voiceOf(s.vi).drum) return;
    const c = SND.audio(); (s.ref.chord || [s.ref.p]).forEach(p => SND.voice(c, SND.master, voiceOf(s.vi).inst === 'melody' ? 'voice' : 'keys', p, c.currentTime + .01, .35, .7));
  }
  const snap = () => JSON.stringify({ v: E.model.voices.map(v => v.editable ? v.notes : null), x: opts.state ? opts.state.get() : null });
  function commit(fn) {
    const before = snap();
    if (fn() === false) return;
    E.hist.push(before); if (E.hist.length > 80) E.hist.shift();
    opts.onChange && opts.onChange();
    render(); E.tl = null;
  }
  function sorted(v) { return [...v.notes].sort((a, b) => a.s - b.s); }
  function room(v, s, self) { const nx = sorted(v).find(n => n !== self && n.s > s); return (nx ? nx.s : E.model.end ?? E.model.bars * C.BAR) - s; }
  function prevPitch(v, s) { const pv = sorted(v).filter(n => n.s < s).pop(); return pv ? pv.p : v.clef === 'bass' ? 43 : v.clef === 'perc' ? 38 : 67; }
  function insertAt(p) {
    const s = E.sel, v = voiceOf(s.vi);
    const n = { p, s: s.s, d: Math.min(s.d, room(v, s.s)) };
    if (v.drum) { n.p = 38; n.kit = ['snare']; }
    if (v.lyricsTarget) { n.id = C.uid(); n.lx = 'n'; }
    v.notes.push(n); v.notes.sort((a, b) => a.s - b.s);
    E.sel = { vi: s.vi, ref: n };
  }
  function pitch(delta) {
    const s = E.sel; if (!s) return;
    const v = voiceOf(s.vi); if (v.drum) return opts.toast && opts.toast('드럼은 높이를 바꾸지 않아요');
    commit(() => {
      if (!s.ref) { insertAt(prevPitch(v, s.s) + (delta > 0 ? 0 : 0)); return; }
      const n = s.ref, np = Math.max(21, Math.min(108, n.p + delta));
      const dd = np - n.p; n.p = np; if (n.chord) n.chord = n.chord.map(x => x + dd);
    });
    preview();
  }
  function setLen(d) {
    const s = E.sel; if (!s) return;
    const v = voiceOf(s.vi);
    commit(() => {
      if (!s.ref) { const r = room(v, s.s); if (r <= 0) return false; insertAt(prevPitch(v, s.s)); E.sel.ref.d = Math.min(d, r); return; }
      const r = room(v, s.ref.s, s.ref);
      if (d > r && opts.toast) opts.toast('다음 음표 앞까지만 늘였어요');
      s.ref.d = Math.max(1, Math.min(d, r));
    });
  }
  function del() {
    const s = E.sel; if (!s || !s.ref) return;
    const v = voiceOf(s.vi), n = s.ref;
    commit(() => { const i = v.notes.indexOf(n); if (i >= 0) v.notes.splice(i, 1); E.sel = { vi: s.vi, s: n.s, d: n.d }; });
  }
  function undo() {
    const last = E.hist.pop(); if (!last) return opts.toast && opts.toast('되돌릴 것이 없어요');
    const o = JSON.parse(last), arr = Array.isArray(o) ? o : o.v;
    if (o.x != null && opts.state) opts.state.set(o.x);
    opts.model().voices.forEach((v, i) => { if (arr[i]) v.notes.splice(0, v.notes.length, ...arr[i]); });
    if (LY.on) lyClose();
    E.sel = null; opts.onChange && opts.onChange(); render();
  }
  function move(dir) {
    const s = E.sel; if (!s) return;
    const list = E.marks.filter(m => m.vi === s.vi && !m.q.tiePrev);
    const cur = selMarks()[0]; if (!cur) return;
    const i = list.indexOf(list.find(m => m.at === cur.at));
    const nx = list[i + dir]; if (!nx) return;
    E.sel = nx.q.p == null ? { vi: nx.vi, s: nx.q.s, d: nx.q.d } : { vi: nx.vi, ref: nx.q.ref };
    paintSel(); preview();
    const e = scoreEl.querySelector('.ed-on'); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function midiPitch(p) {
    const s = E.sel; if (!s) return false;
    const v = voiceOf(s.vi); if (v.drum) return false;
    commit(() => {
      if (!s.ref) { insertAt(p); return; }
      const n = s.ref, dd = p - n.p; n.p = p; if (n.chord) n.chord = n.chord.map(x => x + dd);
    });
    return true;
  }
  host.querySelector('.ed-bar').addEventListener('click', e => {
    active = api;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.view) return setView(b.dataset.view);
    if (b.dataset.sp) return setSpeed(+b.dataset.sp);
    if (b.dataset.len) return setLen(+b.dataset.len);
    const a = b.dataset.e;
    if (a === 'undo') return undo();
    if (a === 'lyric') return LY.on ? lyClose() : lyStart();
    if (a === 'print') return printMenu(b);
    if (a === 'playall') { opts.onPlay && opts.onPlay(E.model.start ?? 0, b, E.speed); if (SND.isPlaying()) follow(); else endFollow(); return; }
    if (!E.sel && a !== 'play') return opts.toast && opts.toast('먼저 악보에서 음표를 눌러 골라요');
    if (a === 'up') pitch(1); if (a === 'down') pitch(-1);
    if (a === 'oup') pitch(12); if (a === 'odown') pitch(-12);
    if (a === 'del') del();
    if (a === 'play') { const at = E.sel ? Math.floor((E.sel.ref ? E.sel.ref.s : E.sel.s) / C.BAR) * C.BAR : 0; opts.onPlay && opts.onPlay(at, b, E.speed); if (SND.isPlaying()) follow(); else endFollow(); }
  });
  host.addEventListener('pointerdown', () => { active = api; });
  function onKey(e) {
    if (active !== api || !host.offsetParent || e.target.closest('input,textarea,select')) return false;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return true; }
    if (e.key === ' ') { e.preventDefault(); host.querySelector(E.sel ? '[data-e=play]' : '[data-e=playall]').click(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && E.view === 'page') { e.preventDefault(); printMenu(host.querySelector('.ed-prbtn')); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyL' && opts.lyric && lyVoice() >= 0) { e.preventDefault(); lyStart(); return true; }
    if (!E.sel) return false;
    if (e.key === 'ArrowUp') { e.preventDefault(); pitch(e.shiftKey ? 12 : 1); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); pitch(e.shiftKey ? -12 : -1); return true; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); return true; }
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return true; }
    if (KEYLEN[e.key]) { e.preventDefault(); setLen(KEYLEN[e.key]); return true; }
    if (e.key === 'Escape') { E.sel = null; paintSel(); return true; }
    return false;
  }
  function avgPerBar(marks, bars) {
    const per = new Map(); marks.forEach(m => { const k = m.vi + ':' + m.bar; per.set(k, (per.get(k) || 0) + 1); });
    let mx = 0; for (let b = 0; b < bars; b++) { let t = 0; E.model.voices.forEach((v, vi) => { t = Math.max(t, per.get(vi + ':' + b) || 0); }); mx += t; }
    return mx / Math.max(1, bars);
  }
  // 재생 위치(16분음표) → 악보 위 x 좌표, 줄
  function timeline() {
    const cr = scoreEl.getBoundingClientRect(), sl = scoreEl.scrollLeft, st = scoreEl.scrollTop;
    const pts = new Map(), lines = new Map();
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.left - cr.left + sl, y: r.top - cr.top + st, r: r.right - cr.left + sl, b: r.bottom - cr.top + st }; };
    E.marks.forEach(m => {
      const el = elsOf(m)[0]; if (!el) return;
      const lc = [...el.classList].find(c => /^abcjs-l\d+$/.test(c)); const line = lc ? +lc.slice(7) : 0;
      const b = box(el); const cur = pts.get(m.q.s);
      if (!cur || b.x < cur.x) pts.set(m.q.s, { s: m.q.s, x: b.x, line });
      m.el = el;
    });
    scoreEl.querySelectorAll('.abcjs-staff, .abcjs-note, .abcjs-rest, .abcjs-bar').forEach(el => {
      const lc = [...el.classList].find(c => /^abcjs-l\d+$/.test(c)); if (!lc) return;
      const line = +lc.slice(7), b = box(el), L = lines.get(line);
      if (!L) lines.set(line, { top: b.y, bot: b.b, right: b.r }); else { L.top = Math.min(L.top, b.y); L.bot = Math.max(L.bot, b.b); L.right = Math.max(L.right, b.r); }
    });
    // 강조할 음표: 시작 순서대로(재생 중에는 바뀐 것만 고친다)
    const hl = E.marks.filter(m => m.el && m.q.p != null).map(m => ({ s: m.q.s, e: m.q.s + m.q.d, el: m.el })).sort((a, b) => a.s - b.s);
    E.tl = { pts: [...pts.values()].sort((a, b) => a.s - b.s), lines, hl, k: 0, on: new Set(), last: -1 };
  }
  function highlight(pos) {
    const T = E.tl;
    if (pos < T.last) { T.on.forEach(x => x.el.classList.remove('ed-play')); T.on.clear(); T.k = 0; } // 뒤로 갔으면 처음부터
    T.last = pos;
    while (T.k < T.hl.length && T.hl[T.k].s <= pos) { const h = T.hl[T.k++]; if (pos < h.e) { h.el.classList.add('ed-play'); T.on.add(h); } }
    T.on.forEach(h => { if (pos >= h.e) { h.el.classList.remove('ed-play'); T.on.delete(h); } });
  }
  function place(pos) {
    if (!E.tl) timeline();
    const { pts, lines } = E.tl; if (!pts.length) return;
    let i = 0; while (i < pts.length - 1 && pts[i + 1].s <= pos) i++;
    const a = pts[i], b = pts[i + 1];
    const L = lines.get(a.line) || { top: 0, bot: scoreEl.scrollHeight, right: a.x + 40 };
    const xEnd = b && b.line === a.line ? b.x : L.right;
    const sEnd = b ? b.s : E.model.end ?? E.model.bars * C.BAR;
    const t = Math.max(0, Math.min(1, (pos - a.s) / Math.max(1, sEnd - a.s)));
    const x = a.x + (xEnd - a.x) * t;
    const c = cursor(); c.hidden = false;
    c.style.transform = `translate(${x - 1}px, ${L.top - 6}px)`; c.style.height = (L.bot - L.top + 12) + 'px';
    // 지금 나는 음 강조(바뀐 음표만)
    highlight(pos);
    // 화면 따라가기
    if (E.view === 'scroll') {
      const want = Math.max(0, Math.round(x - scoreEl.clientWidth * .3));
      if (Math.abs(scoreEl.scrollLeft - want) >= 1) scoreEl.scrollLeft = want;
      if (!E.shown) { E.shown = true; const r = scoreEl.getBoundingClientRect(); if (r.bottom < 80 || r.top > window.innerHeight - 80) scoreEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    else if (E.lastLine !== a.line) {
      E.lastLine = a.line;
      const top = scoreEl.getBoundingClientRect().top + window.scrollY + L.top;
      const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 120;
      const bar = host.querySelector('.ed-bar').offsetHeight || 0;
      const want = top - hdr - bar - 40;
      if (top - window.scrollY < hdr + bar + 20 || top + (L.bot - L.top) - window.scrollY > window.innerHeight - 110) window.scrollTo({ top: want, behavior: 'smooth' });
    }
  }
  function endFollow() {
    E.follow = false; E.lastLine = null;
    const c = cursor(); if (c) c.hidden = true;
    const clr = () => scoreEl.querySelectorAll('.ed-play').forEach(e => e.classList.remove('ed-play'));
    clr(); requestAnimationFrame(clr);
    host.classList.remove('following');
  }
  function follow() {
    E.follow = true; E.lastLine = null; E.tl = null; E.shown = false; host.classList.add('following');
    const tick = () => {
      if (!E.follow) return;
      const pos = SND.position();
      if (pos == null || !SND.isPlaying()) { endFollow(); return; }
      place(pos); requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
  }
  function setView(v) {
    E.view = v; try { localStorage.setItem('livescore-view', v); } catch (x) { }
    const was = E.follow; render(); if (was) { E.tl = null; }
  }
  // ── 타이프 인 스코어(가사 입력) — 피날레처럼 음표 아래에 바로 쳐 넣는다 ──
  // 띄어쓰기·Enter·Tab → 다음 음표, Shift+Tab·← → 앞 음표, - 붙임표(영어 음절), _ 앞 글자 늘이기, 빈 칸에서 ⌫ 앞 음표, Esc 끝
  const LY = { on: false, box: null, inp: null, orig: '' };
  function lyVoice() { const m = E.model; return m ? m.voices.findIndex(v => v.lyricsTarget && v.editable) : -1; }
  function lyNotes(vi) { const seen = new Set(), out = []; E.marks.forEach(m => { if (m.vi === vi && m.q.p != null && !m.q.tiePrev && m.q.ref && !seen.has(m.q.ref)) { seen.add(m.q.ref); out.push(m.q.ref); } }); return out; }
  function lyStart() {
    const vi = lyVoice(); if (vi < 0 || !opts.lyric) return;
    if (!E.sel || E.sel.vi !== vi || !E.sel.ref) {
      const ns = lyNotes(vi), firstEmpty = ns.find(n => !opts.lyric.get(voiceOf(vi), n));
      const n = firstEmpty || ns[0]; if (!n) return opts.toast && opts.toast('노래 음표가 아직 없어요');
      E.sel = { vi, ref: n };
    }
    LY.on = true; host.classList.add('ly-mode'); host.querySelector('.ed-lybtn').classList.add('on');
    paintSel(); lyOpen();
    if (!LY.told) { LY.told = true; opts.toast && opts.toast('글자를 치고 띄어쓰기로 다음 음표 · Esc로 끝'); }
  }
  function lyClose() {
    if (LY.box) { lySave(); LY.box.remove(); LY.box = LY.inp = null; }
    LY.on = false; host.classList.remove('ly-mode'); const b = host.querySelector('.ed-lybtn'); if (b) b.classList.remove('on');
  }
  function lyOpen() {
    if (!LY.box) {
      LY.box = document.createElement('div'); LY.box.className = 'ed-lyin';
      LY.box.innerHTML = '<input type="text" autocomplete="off" spellcheck="false" aria-label="가사 한 글자"><small>띄어쓰기 다음 · Esc 끝</small>';
      host.appendChild(LY.box); LY.inp = LY.box.querySelector('input');
      LY.inp.addEventListener('keydown', lyKey);
      LY.inp.addEventListener('input', lyInput);
      LY.inp.addEventListener('blur', () => setTimeout(() => { if (LY.on && !LY.ptr && document.activeElement !== LY.inp) lySave(); }, 0));
    }
    const v = voiceOf(E.sel.vi), cur = opts.lyric.get(v, E.sel.ref) || '';
    LY.orig = cur; LY.inp.value = cur;
    lyPlace(); LY.inp.focus({ preventScroll: true }); LY.inp.select();
  }
  function lyPlace() {
    if (!LY.box || !E.sel || !E.sel.ref) return;
    const m = selMarks()[0], el = m && elsOf(m)[0]; if (!el) return;
    const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
    const lc = [...el.classList].find(c => /^abcjs-l\d+$/.test(c));
    let bottom = r.bottom;
    if (lc) { // 그 음표가 놓인 보표의 아래 줄 밑(가사 자리)
      const cy = (r.top + r.bottom) / 2;
      let best = null; scoreEl.querySelectorAll('.abcjs-staff.' + lc).forEach(st => { const b = st.getBoundingClientRect(), d = cy < b.top ? b.top - cy : cy > b.bottom ? cy - b.bottom : 0; if (!best || d < best.d) best = { d, b }; });
      const staffB = best ? best.b.bottom : r.bottom;
      if (best) bottom = Math.max(staffB, r.bottom - 4);
      // 이미 가사 줄이 있으면 그 높이에 맞춘다
      const ly = [...scoreEl.querySelectorAll('.abcjs-lyric')].map(e => e.getBoundingClientRect().top).filter(t => t > staffB - 2 && t < staffB + 70);
      if (ly.length) bottom = Math.min(...ly) - 9;
    }
    const x = (r.left + r.right) / 2 - hr.left, y = bottom - hr.top + 6;
    LY.box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // 화면 밖이면 보이게
    if (E.view === 'scroll') { const sr = scoreEl.getBoundingClientRect(); if (r.left < sr.left + 60 || r.right > sr.right - 60) scoreEl.scrollLeft += r.left - sr.left - sr.width * .35; requestAnimationFrame(() => { if (!LY.box || !el.isConnected) return; const r2 = el.getBoundingClientRect(); LY.box.style.transform = `translate(${Math.round((r2.left + r2.right) / 2 - host.getBoundingClientRect().left)}px, ${Math.round(y)}px)`; }); }
    else { const vb = LY.box.getBoundingClientRect(), top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 120) + (host.querySelector('.ed-bar').offsetHeight || 0) + 30; if (r.top < top || vb.bottom > window.innerHeight - 100) window.scrollBy({ top: r.top - top - 40, behavior: 'smooth' }); }
  }
  function lySave(text) {
    if (!LY.inp || !E.sel || !E.sel.ref) return;
    const t = text != null ? text : LY.inp.value.trim();
    const v = voiceOf(E.sel.vi), n = E.sel.ref;
    if (t === (opts.lyric.get(v, n) || '')) return;
    commit(() => { const r = opts.lyric.set(v, n, t); if (r && r.long) opts.toast && opts.toast('한 음표에는 두 글자까지 붙여요'); });
    LY.orig = t;
  }
  function lyMove(dir) {
    const vi = E.sel.vi, ns = lyNotes(vi), i = ns.indexOf(E.sel.ref);
    const nx = ns[i + dir];
    if (!nx) { opts.toast && opts.toast(dir > 0 ? '마지막 음표예요' : '첫 음표예요'); LY.inp.value = opts.lyric.get(voiceOf(vi), E.sel.ref) || ''; LY.inp.select(); return; }
    E.sel = { vi, ref: nx }; paintSel(); lyOpen();
  }
  function lyKey(e) {
    if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중에는 입력기가 먼저
    const val = LY.inp.value;
    const k = e.key;
    if (k === ' ' || k === 'Enter' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); lySave(); lyMove(1); return; }
    if (k === 'Tab' && e.shiftKey) { e.preventDefault(); lySave(); lyMove(-1); return; }
    if (k === '-') { e.preventDefault(); if (val.trim()) { lySave(val.trim() + (opts.lyric.hyphen ? '-' : '')); lyMove(1); } return; }
    if (k === '_') { e.preventDefault(); if (val.trim()) lySave(); else lySave('_'); lyMove(1); return; }
    if (k === 'Escape') { e.preventDefault(); lyClose(); paintSel(); return; }
    if (k === 'Backspace' && !val) { e.preventDefault(); const v = voiceOf(E.sel.vi); if (opts.lyric.get(v, E.sel.ref)) lySave(''); else lyMove(-1); return; }
    if (k === 'ArrowLeft' && LY.inp.selectionStart === 0 && LY.inp.selectionEnd === 0) { e.preventDefault(); lySave(); lyMove(-1); return; }
    if (k === 'ArrowRight' && LY.inp.selectionStart === val.length) { e.preventDefault(); lySave(); lyMove(1); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); lyClose(); undo(); return; }
  }
  function lyInput(e) { // 입력기가 조합을 끝내며 넣은 띄어쓰기·붙임표
    if (e.isComposing) return;
    const val = LY.inp.value;
    if (/\s$/.test(val)) { const t = val.trim(); LY.inp.value = t; lySave(t); lyMove(1); }
    else if (/^.+-$/.test(val)) { const t = val.slice(0, -1).trim(); lySave(t + (opts.lyric.hyphen ? '-' : '')); lyMove(1); }
  }
  document.addEventListener('pointerdown', e => { if (LY.on && !host.contains(e.target)) lyClose(); });
  // 악보를 누르는 동안에는 저장을 미룬다(누른 음표로 옮겨 가며 저장) — 음표가 아닌 곳이면 저장하고 입력 칸으로 돌아온다
  scoreEl.addEventListener('pointerdown', () => { if (LY.on) LY.ptr = true; }, true);
  document.addEventListener('pointerup', () => { if (!LY.ptr) return; setTimeout(() => { LY.ptr = false; if (LY.on && LY.inp && document.activeElement !== LY.inp) { lySave(); if (LY.inp) LY.inp.focus({ preventScroll: true }); } }, 80); });

  // ── 인쇄: 총보 · 파트보(파트마다 새 쪽, 빈 마디는 여러 마디 쉼표로, 이조 악기는 기보음으로) ──
  function partGroups() {
    const out = [];
    (E.model ? E.model.voices : []).forEach((v, i) => {
      const last = out[out.length - 1];
      if (v.group && last && last.group === v.group) { last.vs.push(v); return; }
      out.push({ group: v.group || null, name: (v.name || '').replace(/\s*\(\d+명\)$/, '') || `파트 ${out.length + 1}`, full: v.name, vs: [v], i });
    });
    return out;
  }
  function printMenu(btn) {
    const old = host.querySelector('.ed-pop'); if (old) { old.remove(); return; }
    if (!E.model || !E.model.voices.length) return;
    const gs = partGroups(), hasTr = gs.some(g => g.vs.some(v => v.trans));
    const pop = document.createElement('div'); pop.className = 'ed-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '악보 인쇄');
    pop.innerHTML = `<div class="ep-h"><b>악보 인쇄</b><button type="button" class="ep-x" aria-label="닫기">×</button></div>
      <div class="ep-kind"><label><input type="radio" name="epk" value="score" checked><span><b>총보</b><small>모든 파트를 한 악보에 · 실음</small></span></label>
      <label><input type="radio" name="epk" value="parts"><span><b>파트보</b><small>파트마다 새 쪽 · 빈 마디는 여러 마디 쉼표</small></span></label></div>
      <div class="ep-parts" hidden><div class="ep-all"><button type="button" data-ep="all">모두</button><button type="button" data-ep="none">지우기</button></div>
      ${gs.map((g, k) => `<label><input type="checkbox" data-pg="${k}" checked><span>${escH(g.full || g.name)}${g.vs.some(v => v.trans) ? ` <em>${escH(transLabel(g.vs[0].trans))}</em>` : ''}</span></label>`).join('')}
      ${hasTr ? '<label class="ep-tr"><input type="checkbox" id="epTr" checked><span>이조 악기는 기보음(연주자가 읽는 음)으로</span></label>' : ''}</div>
      <div class="ep-size"><span>악보 크기</span><select id="epScale"><option value="0.86">작게</option><option value="1" selected>보통</option><option value="1.15">크게</option></select></div>
      <div class="ep-go"><button type="button" class="btn sm" data-ep="go">인쇄 · PDF로 저장</button></div>`;
    host.appendChild(pop);
    const hr = host.getBoundingClientRect(), br = btn.getBoundingClientRect();
    pop.style.top = (br.bottom - hr.top + 8) + 'px'; pop.style.right = Math.max(8, hr.right - br.right) + 'px';
    const kind = () => pop.querySelector('[name=epk]:checked').value;
    pop.addEventListener('change', e => { if (e.target.name === 'epk') pop.querySelector('.ep-parts').hidden = kind() !== 'parts'; });
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('ep-x')) return pop.remove();
      if (b.dataset.ep === 'all' || b.dataset.ep === 'none') { pop.querySelectorAll('[data-pg]').forEach(c => { c.checked = b.dataset.ep === 'all'; }); return; }
      if (b.dataset.ep === 'go') {
        const scale = +pop.querySelector('#epScale').value || 1;
        if (kind() === 'score') { pop.remove(); return doPrint([{ vs: E.model.voices, label: '총보' }], scale); }
        const pick = [...pop.querySelectorAll('[data-pg]')].filter(c => c.checked).map(c => gs[+c.dataset.pg]);
        if (!pick.length) return opts.toast && opts.toast('인쇄할 파트를 하나 이상 골라요');
        const tr = !pop.querySelector('#epTr') || pop.querySelector('#epTr').checked;
        pop.remove(); doPrint(pick.map(g => ({ vs: g.vs, label: g.name, part: true, tr })), scale);
      }
    });
    setTimeout(() => { const off = e => { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('pointerdown', off); } }; document.addEventListener('pointerdown', off); }, 0);
  }
  const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TRN = { 2: 'B♭ 악기', 9: 'E♭ 악기', 14: 'B♭ 악기(한 옥타브 위)', 21: 'E♭ 악기(한 옥타브 위)', '-3': 'A 악기', 7: 'F 악기' };
  const transLabel = t => TRN[t] || `${t > 0 ? '+' : ''}${t}반음`;
  function doPrint(pages, scale = 1) {
    const m = E.model;
    let box = document.getElementById('lsPrint');
    if (!box) { box = document.createElement('div'); box.id = 'lsPrint'; document.body.appendChild(box); }
    box.innerHTML = '';
    const title = m.title || (opts.printTitle && opts.printTitle()) || '우리 노래';
    const header = { ...(m.header || {}), ...(opts.printHeader ? opts.printHeader() : {}) };
    pages.forEach(pg => {
      const sec = document.createElement('section'); sec.className = 'lsp-page' + (pg.part ? ' part' : ' full');
      let key = m.key, voices = pg.vs.map(v => ({ ...v, notes: v.notes }));
      let trNote = '';
      if (pg.part && pg.tr && voices[0].trans) { // 기보음: 조표와 음을 함께 옮긴다
        const t = voices[0].trans; key = C.shiftKey(m.key, t);
        voices = voices.map(v => ({ ...v, notes: v.notes.map(n => (n.p == null ? n : { ...n, p: n.p + t, chord: n.chord ? n.chord.map(x => x + t) : n.chord })), chords: null }));
        trNote = `${transLabel(t)} · 기보음 · ${C.KEYS[key].name}`;
      } else if (pg.part && voices[0].trans) trNote = '실음';
      if (pg.part && !voices.some(v => v.chords) && m.voices[0] && m.voices[0].chords && !voices[0].drum && !voices[0].trans) voices[0] = { ...voices[0], chords: m.voices[0].chords }; // 리듬 파트도 코드 기호를
      if (pg.part) voices = voices.map(v => ({ ...v, name: v.group ? v.name : '', sub: v.group ? v.sub : '' }));
      const build = () => SC.buildAbcMap({ title, sub: m.sub, header: null, tempo: m.tempo, key, bars: m.bars, perLine: 4, voices, showTitle: false, intro: m.intro || 0, sections: m.sections, multirest: !!pg.part, ...(m.pickup != null ? { pickup: m.pickup } : {}) }).abc;
      const credit = header.credit || m.sub || '', style = header.style ? `${header.style} ` : '';
      sec.innerHTML = `<header class="lsp-h"><div class="lsp-part"><b>${escH(pg.label)}</b>${trNote ? `<small>${escH(trNote)}</small>` : pg.part ? '' : '<small>실음(C) 총보</small>'}</div><div class="lsp-meta">${escH(C.KEYS[m.key].name)} · ${m.bars}마디</div></header>
        <div class="lsp-title"><h1>${escH(title)}</h1>${!pg.part && header.subtitle ? `<p class="lsp-sub">${escH(header.subtitle)}</p>` : ''}<div class="lsp-cr"><span>${escH(style)}♩ = ${m.tempo}</span><span>${escH(credit)}</span></div>${!pg.part && header.info ? `<p class="lsp-info">${escH(header.info)}</p>` : ''}</div>
        <div class="lsp-score"></div><footer class="lsp-f">LIVE SCORE · 실시간 악보${pg.part ? ` · ${escH(pg.label)}` : ''}</footer>`;
      box.appendChild(sec);
      const tgt = sec.querySelector('.lsp-score'), abc = build();
      let W = Math.round(740 / scale);
      SC.renderAbc(tgt, abc, { staffwidth: W, print: true });
      // 한 단(악보 한 줄)이 한 쪽에 들어가도록: 단이 너무 높으면 넓게 그려 작게 줄인다(총보처럼 보표가 많을 때)
      const tall = Math.max(0, ...[...tgt.querySelectorAll('svg')].map(v => (v.viewBox && v.viewBox.baseVal ? v.viewBox.baseVal.height : 0)));
      const need = Math.ceil(tall * 703 / 760); // A4 본문 높이에서 머리글·제목 자리를 뺀 만큼(첫 단도 제목과 한 쪽에)
      if (need > W) { W = Math.min(2400, need); tgt.innerHTML = ''; SC.renderAbc(tgt, abc, { staffwidth: W, print: true }); }
    });
    document.body.classList.add('ls-printing');
    const done = () => { document.body.classList.remove('ls-printing'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 120);
  }

  const api = { render, onKey, midiPitch, follow, setView, clear: () => { E.sel = null; E.hist = []; }, host, get sel() { return E.sel; }, get speed() { return E.speed; } };
  return api;
}
