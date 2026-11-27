// LIVE SCORE · 악보 편집기 — 악보의 음표를 눌러 고르고, 높이·길이를 바로 고친다
import * as C from './core.js?v=8';
import * as SC from './score.js?v=8';
import * as SND from './sound.js?v=8';

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
        <div class="ed-grp ed-view" role="group" aria-label="악보 보기"><button type="button" data-view="page">페이지 보기</button><button type="button" data-view="scroll">스크롤 보기</button></div>
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
    paintSel(); speedUI();
  }
  // 스크롤 보기: 피날레처럼 왼쪽에 보표 시작·음자리표·조표·악기 이름을 고정해 둔다
  function stickyHead() {
    const svg = scoreEl.querySelector('svg'); if (!svg) return;
    const sr = svg.getBoundingClientRect(); if (!sr.width) return;
    const ts = [...svg.querySelectorAll('.abcjs-time-signature')];
    let edge = ts.length ? Math.min(...ts.map(e => e.getBoundingClientRect().left)) - sr.left - 3 : 0;
    if (!(edge > 12)) { const n = svg.querySelector('.abcjs-note, .abcjs-rest'); edge = n ? n.getBoundingClientRect().left - sr.left - 8 : 0; }
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
    if (!v.editable) { E.sel = null; paintSel(); opts.toast && opts.toast(v.lockMsg || '이 파트는 여기서 고칠 수 없어요'); return; }
    E.sel = m.q.p == null ? { vi: m.vi, s: m.q.s, d: m.q.d } : { vi: m.vi, ref: m.q.ref };
    paintSel(); preview();
  }
  function preview() {
    const s = E.sel; if (!s || !s.ref || voiceOf(s.vi).drum) return;
    const c = SND.audio(); (s.ref.chord || [s.ref.p]).forEach(p => SND.voice(c, SND.master, voiceOf(s.vi).inst === 'melody' ? 'voice' : 'keys', p, c.currentTime + .01, .35, .7));
  }
  const snap = () => JSON.stringify(E.model.voices.map(v => v.editable ? v.notes : null));
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
    const arr = JSON.parse(last);
    opts.model().voices.forEach((v, i) => { if (arr[i]) v.notes.splice(0, v.notes.length, ...arr[i]); });
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
  const api = { render, onKey, midiPitch, follow, setView, clear: () => { E.sel = null; E.hist = []; }, host, get sel() { return E.sel; }, get speed() { return E.speed; } };
  return api;
}
