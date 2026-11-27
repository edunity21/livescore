// LIVE SCORE · 화면
import * as C from './core.js?v=9';
import * as SND from './sound.js?v=9';
import * as MIDI from './midi.js?v=9';
import * as SC from './score.js?v=9';
import * as HUM from './hum.js?v=9';
import qrcode from '../lib/qrcode.mjs';
import { createEditor, activeEditor } from './editor.js?v=9';
import * as PLUS from './plus.js?v=9';
import * as ORCH from './orch.js?v=9';
C.useOrchestrator(ORCH);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const STORE = 'livescore-project-v1';
const ROLE = { lyric: '작사', compose: '작곡', arrange: '편곡', record: '기록', present: '발표' };
const STEPN = ['', '연결하기', '가사 쓰기', '선율 연주', '박 맞춤', '가사 붙이기', 'AI 편곡', '비교·수정', '악보 완성'];
const DUR = { 1: '16분', 2: '♪', 3: '♪.', 4: '♩', 6: '♩.', 8: '2분', 12: '2분.', 16: '온' };
const durLabel = d => DUR[d] || (d / 4) + '박';

// ── 상태 ──
function blank() {
  return {
    v: 1, title: '', group: '', reflect: { items: {}, good: '', next: '' }, roles: { lyric: '', compose: '', arrange: '', record: '', present: '' }, mode: 'keys',
    tempo: 92, key: 'C', pickup: 0, lyrics: [0, 1, 2, 3].map(() => ({ text: '', chorus: false })), take: null, grid: 2, melody: [],
    arr: { settings: { genre: 'pop', mood: 'bright', inst: ['drums', 'bass', 'keys', 'guitar'], ens: ORCH.defaultEns(), intro: 2, range: 'far', perBar: 'auto' }, versions: [], chosen: null, scene: '', why: '', nv: null },
    base: null, decisions: {}, log: [], step: 1, made: false,
  };
}
function load() {
  try { const j = JSON.parse(localStorage.getItem(STORE) || 'null'); if (j && j.v === 1) return Object.assign(blank(), j); } catch (e) { }
  return null;
}
let S = migrate(load() || blank());
function migrate(x) { // 예전 프로젝트: 악기 고르기 → 편성(인원수)
  const st = x.arr.settings;
  if (!st.ens) st.ens = C.ensFromInst(st.inst);
  if (st.intro == null) st.intro = 2;
  if (st.range == null) st.range = 'far'; // 코드 범위: 2차 관계조까지(노래 음이 바랄 때만 쓴다)
  if (st.perBar == null) st.perBar = 'auto';
  st.ens = { ...ORCH.defaultEns(), ...Object.fromEntries(Object.keys(ORCH.defaultEns()).filter(k => k !== 'vocal').map(k => [k, 0])), ...st.ens };
  if (x.pickup == null) x.pickup = 0;
  C.METER.pickup = x.pickup;
  return x;
}
const U = { step: S.step || 1, sel: null, lySel: null, hist: [], rec: null, bar: null, pick: null, tab: 'auto', suno: { tracks: [], cfg: null }, audio: {}, mpos: null, mdur: 4, soundOk: false, playBtn: null, viewer: null };

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    S.step = U.step;
    const data = JSON.stringify(S);
    for (let k = 0; k < 12; k++) {
      try { localStorage.setItem(STORE, data); $('#saveBadge').hidden = false; U.saveWarned = false; return; }
      catch (e) { if (!PLUS.snapTrim()) break; } // 작업 기록이 자리를 차지하면 오래된 것부터 비운다
    }
    $('#saveBadge').hidden = true;
    if (!U.saveWarned) { U.saveWarned = true; toast('브라우저 저장 공간이 가득 차 자동 저장이 안 돼요 — 메뉴 → 프로젝트 파일로 저장해 주세요'); }
  }, 300);
}
function pushHist() { U.hist.push(JSON.stringify(S.melody)); if (U.hist.length > 60) U.hist.shift(); }
function undo() { if (!U.hist.length) return toast('되돌릴 것이 없어요'); S.melody = JSON.parse(U.hist.pop()); save(); refresh(); }

function totalBars() {
  const end = Math.max(0, ...S.melody.map(n => n.s + n.d));
  return Math.max(2, S.lyrics.length * 2, Math.ceil(end / C.BAR));
}
const units = () => totalBars() * C.BAR;
const chosen = () => S.arr.versions.find(v => v.id === S.arr.chosen) || null;
const vlab = v => (v && v.source === 'suno' ? 'AI' : '편곡');
const roleName = r => (S.roles[r] ? `${ROLE[r]}(${S.roles[r]})` : ROLE[r]);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
function ask(msg, ok, okText = '계속') {
  const d = $('#askDlg'); $('#askP').textContent = msg; $('#askOk').textContent = okText;
  $('#askOk').onclick = () => { d.close(); ok(); };
  d.showModal();
}
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const fileBase = () => (S.title || '우리노래').replace(/[\\/:*?"<>|]/g, '').trim() || '우리노래';

// ── 재생 ──
function stopPlay() { SND.stop(); }
function playWith(btn, tracks, opts = {}) {
  if (U.playBtn === btn && SND.isPlaying()) { stopPlay(); return; }
  stopPlay();
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '■ 멈춤'; btn.classList.add('playing'); }
  U.playBtn = btn;
  SND.play(tracks, opts.tempo || S.tempo, {
    ...opts, onend: () => {
      if (btn) { btn.innerHTML = label; btn.classList.remove('playing'); }
      if (U.playBtn === btn) U.playBtn = null;
      drawStep();
    }
  });
  loop();
}
function verTracks(v, vocal) {
  const tr = [];
  if (vocal && !S.arr.vmute) tr.push({ inst: 'voice', notes: vocal, vol: .85 * (S.arr.vvol ?? 1) });
  if (v) v.parts.forEach(p => { if (!p.mute) tr.push({ inst: SND.soundOf(p.inst), notes: p.notes, vol: (p.inst === 'drums' ? .7 : .45) * (p.vol ?? 1) }); });
  return tr;
}
let raf = null;
function loop() {
  cancelAnimationFrame(raf);
  const tick = () => { drawStep(); if (SND.isPlaying() || U.rec) raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}

// ── 피아노 롤 ──
function drawRoll(cv, o) {
  const dpr = window.devicePixelRatio || 1;
  const wrap = cv.parentElement;
  if (!cv.dataset.h) cv.dataset.h = cv.getAttribute('height');
  const H = +cv.dataset.h;
  const z = o.zoom || 1;
  const per = o.bars > 16 ? (window.innerWidth < 700 ? 72 : 96) : (wrap.clientWidth - 40) / o.bars;
  const need = o.bars > 16 || z > 1 ? Math.ceil(o.bars * per * z + 40) : 0;
  if (need > wrap.clientWidth) cv.style.width = need + 'px'; else cv.style.width = '';
  const W = Math.max(280, need > wrap.clientWidth ? need : cv.clientWidth);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const P0 = o.from == null ? (S.pickup || 0) : 0; // 못갖춘마디 자리도 보이게
  const from = o.from != null ? o.from * C.BAR : -P0, bars = o.bars, U16 = bars * C.BAR + P0;
  const all = o.layers.flatMap(l => l.notes).filter(n => n && n.p != null);
  let lo = all.length ? Math.min(...all.map(n => n.p)) - 1 : 57, hi = all.length ? Math.max(...all.map(n => n.p)) + 1 : 79;
  while (hi - lo < 12) { lo--; hi++; }
  const L = 34, T = o.lyr ? 34 : 18, R = 6, B = 6;
  const x = u => L + ((u - from) / U16) * (W - L - R);
  const rowH = (H - T - B) / (hi - lo + 1);
  const y = p => T + (hi - p) * rowH;
  // 바탕
  for (let p = lo; p <= hi; p++) {
    const black = [1, 3, 6, 8, 10].includes(C.pc(p));
    if (black) { g.fillStyle = '#f4f4f4'; g.fillRect(L, y(p), W - L - R, rowH); }
    if (C.pc(p) === 0) { g.fillStyle = '#6e6e6e'; g.font = '10px "Noto Sans KR",sans-serif'; g.textBaseline = 'middle'; g.fillText('도' + (Math.floor(p / 12) - 1), 3, y(p) + rowH / 2); g.fillStyle = '#e3e3e3'; g.fillRect(L, y(p) + rowH - .5, W - L - R, .5); }
  }
  for (let u = Math.ceil(from / 4) * 4; u <= from + U16; u += 4) {
    const bar = u % C.BAR === 0;
    g.fillStyle = bar ? '#9a9a9a' : '#e6e6e6'; g.fillRect(Math.round(x(u)) - (bar ? .5 : 0), T - (bar ? 6 : 0), bar ? 1 : 1, H - T - B + (bar ? 6 : 0));
    if (bar && u < from + U16) { g.fillStyle = '#111'; g.font = '700 10px Archivo,"Noto Sans KR",sans-serif'; g.textBaseline = 'alphabetic'; g.fillText((u / C.BAR + 1) + '', x(u) + 3, T - 8); }
  }
  if (o.lyr) {
    S.lyrics.forEach((ln, i) => {
      const a = C.lineStart(i); if (a < from || a >= from + U16) return;
      const txt = C.syllables(ln.text).join(' ');
      g.fillStyle = ln.chorus ? '#31684F' : '#6e6e6e'; g.font = '11px "Noto Sans KR",sans-serif';
      g.save(); g.beginPath(); g.rect(x(a) + 14, 0, x(a + 2 * C.BAR) - x(a) - 16, 20); g.clip(); g.fillText(txt, x(a) + 16, 12); g.restore();
    });
  }
  if (o.focus != null) { g.strokeStyle = '#9A382F'; g.lineWidth = 2; g.strokeRect(x(o.focus * C.BAR) + 1, T - 2, x((o.focus + 1) * C.BAR) - x(o.focus * C.BAR) - 2, H - T - B + 4); }
  const ST = {
    raw: { f: 'rgba(110,110,110,.28)', s: 'rgba(110,110,110,.6)' }, q: { f: 'rgba(45,91,215,.18)', s: '#2D5BD7' },
    mel: { f: '#111', s: '#111' }, rec: { f: '#31684F', s: '#31684F' }, same: { f: '#9b9b9b', s: '#9b9b9b' }, diff: { f: '#D9822B', s: '#B5641A' },
    mine: { f: 'rgba(0,0,0,0)', s: '#111' }, sel: { f: '#31684F', s: '#31684F' },
  };
  const minW = (W - L - R) / U16 * .5;
  for (const l of o.layers) {
    const st = ST[l.kind] || ST.mel;
    const solid = !['raw', 'q', 'mine'].includes(l.kind);
    for (const n of l.notes) {
      if (!n || n.p == null) continue;
      const s = n.s, e = n.s + Math.max(.25, n.d);
      if (e < from || s > from + U16) continue;
      const x0 = x(Math.max(s, from)) + 1, x1 = x(Math.min(e, from + U16)) - 2;
      const w = Math.max(minW > 3 ? 3 : 2, x1 - x0);
      const kind = n.kind ? (ST[n.kind] || st) : (o.sel && n.id === o.sel ? ST.sel : st);
      const hh = Math.max(4, Math.min(rowH - 2, 16)), yy = y(n.p) + (rowH - hh) / 2;
      g.fillStyle = kind.f;
      if (g.roundRect) { g.beginPath(); g.roundRect(x0, yy, w, hh, 2); g.fill(); } else g.fillRect(x0, yy, w, hh);
      g.strokeStyle = kind.s; g.lineWidth = l.kind === 'mine' ? 2 : 1;
      if (!solid || l.kind === 'mine') { g.strokeRect(x0 + .5, yy + .5, w - 1, hh - 1); }
      // 음의 시작: 진한 머리
      g.fillStyle = solid ? 'rgba(0,0,0,.45)' : kind.s;
      g.fillRect(x0, yy, Math.min(3, w), hh);
      // 칸이 넉넉하면 음 이름
      if ((solid || l.kind === 'q') && w >= 22 && hh >= 10) {
        g.fillStyle = solid ? '#fff' : '#1d3f9e'; g.font = `700 ${Math.min(11, hh - 2)}px "Noto Sans KR",sans-serif`; g.textBaseline = 'middle';
        g.save(); g.beginPath(); g.rect(x0, yy, w, hh); g.clip(); g.fillText(C.solName(n.p, S.key), x0 + 5, yy + hh / 2 + .5); g.restore();
      }
    }
    if (l.links) { g.strokeStyle = 'rgba(45,91,215,.5)'; g.lineWidth = 1; l.links.forEach(k => { g.beginPath(); g.moveTo(x(k.from), y(k.p) + rowH / 2); g.lineTo(x(k.to), y(k.p) + rowH / 2); g.stroke(); }); }
  }
  if (o.play != null && o.play >= from && o.play <= from + U16) { g.fillStyle = '#9A382F'; g.fillRect(x(o.play) - 1, T - 6, 2, H - T - B + 6); }
  if (need > wrap.clientWidth) {
    if (o.scrollTo != null) wrap.scrollLeft = Math.max(0, x(o.scrollTo) - 40);
    else if (o.follow && o.play != null) { const px = x(o.play); if (px < wrap.scrollLeft + 40 || px > wrap.scrollLeft + wrap.clientWidth - 80) wrap.scrollLeft = Math.max(0, px - wrap.clientWidth * .25); }
  }
}

// ── 단계 이동 ──
function go(n) {
  n = Math.max(1, Math.min(8, n));
  if (U.rec) stopRec();
  if (U.hum) humStop();
  stopPlay();
  U.step = n; save();
  $$('.step').forEach(s => { s.hidden = +s.dataset.step !== n; });
  refresh();
  window.scrollTo(0, 0);
}
function stepDone(i) {
  switch (i) {
    case 1: return S.made;
    case 2: return S.lyrics.some(l => C.syllables(l.text).length);
    case 3: return S.melody.length > 0;
    case 4: return S.melody.length > 0 && (S.mode === 'mouse' || !!S.take);
    case 5: { const r = C.lyricFlow(S.melody, S.lyrics).report; return S.melody.length > 0 && r.length && r.every(x => x.ok); }
    case 6: return !!chosen();
    case 7: { const v = chosen(); if (!v || !S.base) return false; return diffs().every(d => S.decisions[d.bar]); }
    default: return false;
  }
}
function refresh() {
  C.METER.pickup = S.pickup || 0;
  $$('#steps button').forEach(b => { const i = +b.dataset.step; b.classList.toggle('on', i === U.step); b.classList.toggle('done', stepDone(i)); b.setAttribute('aria-current', i === U.step ? 'step' : 'false'); });
  $('#projName').textContent = S.title ? S.title + (S.group ? ' · ' + S.group : '') : '새 창작곡';
  $('#prevBtn').disabled = U.step === 1;
  $('#nextBtn').innerHTML = U.step === 8 ? '처음으로' : `다음: ${STEPN[U.step + 1]} ▶`;
  $('#pagerMid').textContent = `${U.step} / 8 · ${STEPN[U.step]}`;
  ({ 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7, 8: r8 })[U.step]();
}
function drawStep() {
  const pos = SND.position();
  if (U.step === 3) { drawRoll3(pos); if (!U.hum && pos == null) drawRollHum(); }
  if (U.step === 4) drawRoll4(pos);
  if (U.step === 7) drawRoll7(pos);
}
$('#steps').addEventListener('click', e => { const b = e.target.closest('button[data-step]'); if (b) go(+b.dataset.step); });
$('#prevBtn').onclick = () => go(U.step - 1);
$('#nextBtn').onclick = () => go(U.step === 8 ? 1 : U.step + 1);

// ── 메뉴 ──
const menuBtn = $('#menuBtn'), menuPop = $('#menuPop');
menuBtn.onclick = () => { const o = menuPop.hidden; menuPop.hidden = !o; menuBtn.setAttribute('aria-expanded', o); };
document.addEventListener('click', e => { if (!e.target.closest('.menu')) { menuPop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  menuPop.hidden = true;
  const a = b.dataset.act;
  if (a === 'snap') { const ok = PLUS.snapSave(S, `${U.step}단계 · 직접 기록`); toast(ok ? '지금 상태를 작업 기록에 남겼어요' : '저장 공간이 부족해 기록하지 못했어요'); }
  if (a === 'snaps') snapUI();
  if (a === 'new') ask('지금 곡을 지우고 새 창작곡을 시작할까요? 지금 곡은 작업 기록에 남겨 둡니다.', () => { autoSnap('새 곡 시작 전'); S = blank(); U.hist = []; save(); fillSetup(); go(1); toast('새 창작곡을 시작해요'); }, '새로 시작');
  if (a === 'demo') { const doit = () => { autoSnap('예시곡 불러오기 전'); loadDemo(); toast('예시곡 「우리들의 아침」을 불러왔어요'); go(2); }; (S.melody.length || S.lyrics.some(l => l.text)) ? ask('지금 곡 대신 예시곡을 불러올까요?', doit, '불러오기') : doit(); }
  if (a === 'save') { download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), fileBase() + '.livescore.json'); }
  if (a === 'open') $('#openFile').click();
  if (a === 'share') share();
  if (a === 'suno') { U.tab = 'suno'; go(6); setTimeout(() => $('#sDrop').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
});
$('#openFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (j.v !== 1) throw 0; autoSnap('파일 열기 전'); S = Object.assign(blank(), j); U.hist = []; save(); fillSetup(); go(S.step || 2); toast('프로젝트를 열었어요'); } catch (x) { toast('LIVE SCORE 프로젝트 파일이 아니에요'); }
  e.target.value = '';
};
function autoSnap(label) { if (S.melody.length || S.lyrics.some(l => l.text)) PLUS.snapSave(S, label); }
function snapUI() {
  const d = $('#snapDlg'), list = PLUS.snapList();
  $('#snapList').innerHTML = list.length ? list.map((x, i) => `<li><div><b>${esc(x.title)}</b><span>${esc(x.label)} · ${x.step}단계</span><small>${new Date(x.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><button type="button" class="btn sm" data-snap="${i}">되돌리기</button><button type="button" class="btn ghost sm" data-snapdel="${i}" aria-label="기록 지우기">✕</button></li>`).join('') : '<li class="empty">아직 남긴 기록이 없어요. 메뉴 → 지금 상태 기록해 두기</li>';
  if (!d.open) d.showModal();
}
$('#snapList').addEventListener('click', e => {
  const r = e.target.closest('[data-snap]'), x = e.target.closest('[data-snapdel]');
  if (x) { PLUS.snapDelete(+x.dataset.snapdel); snapUI(); return; }
  if (!r) return;
  const j = PLUS.snapGet(+r.dataset.snap); if (!j) return;
  PLUS.snapSave(S, '되돌리기 전');
  S = Object.assign(blank(), j); U.hist = []; U.edVer = null; save(); fillSetup();
  $('#snapDlg').close(); go(S.step || 1); toast('기록해 둔 상태로 되돌렸어요 (되돌리기 전 상태도 기록에 남겼어요)');
});
function loadDemo() {
  const d = C.demoSong();
  S = blank();
  S.title = d.title; S.group = '예시 모둠'; S.lyrics = d.lyrics; S.made = true;
  // 사람이 친 것처럼 조금씩 어긋난 연주 기록
  const beat = 60 / S.tempo;
  S.take = { tempo: S.tempo, events: d.melody.map((n, i) => ({ p: n.p, v: 70 + (i * 37) % 40, t: (n.s / 4 + (((i * 53) % 9) - 4) * .022) * beat, d: (n.d / 4) * beat * (.9 + ((i * 29) % 7) * .012) })) };
  S.melody = C.quantize(S.take.events, S.tempo, 2, units());
  U.hist = [];
  save(); fillSetup();
}

// ── 1 연결하기 ──
function fillSetup() {
  $('#fTitle').value = S.title; $('#fGroup').value = S.group;
  $$('[data-role]').forEach(i => { i.value = S.roles[i.dataset.role] || ''; });
  $$('#fMode input').forEach(r => { r.checked = r.value === S.mode; });
}
$('#setupForm').addEventListener('submit', e => {
  e.preventDefault();
  S.title = $('#fTitle').value.trim() || '우리 노래';
  S.group = $('#fGroup').value.trim();
  $$('[data-role]').forEach(i => { S.roles[i.dataset.role] = i.value.trim(); });
  S.mode = $$('#fMode input').find(r => r.checked).value;
  S.made = true; save();
  toast('프로젝트를 만들었어요 — 이제 노랫말을 써요');
  go(2);
});
$$('#fMode input').forEach(r => r.addEventListener('change', () => { S.mode = r.value; save(); }));
function r1() { fillSetup(); midiUI(MIDI.midiState); }
function midiUI(st) {
  const n = st.inputs.length, badge = $('#midiBadge');
  badge.dataset.state = n ? 'on' : st.supported ? 'off' : 'no';
  badge.querySelector('span').textContent = n ? 'MIDI 건반 연결됨' : st.supported ? (st.error === 'denied' ? 'MIDI 권한 필요' : '건반 없음') : '건반 연결 불가 브라우저';
  const set = (id, ok, txt) => { const li = $(id); li.className = ok ? 'ok' : ok === false ? 'no' : ''; if (txt) li.querySelector('span').textContent = txt; };
  set('#ck1', st.supported, st.supported ? '건반을 쓸 수 있는 브라우저예요.' : '이 브라우저는 건반 연결이 안 돼요. 노트북 크롬(또는 엣지)에서 열어 주세요. 마우스 입력은 그대로 쓸 수 있어요.');
  set('#ck2', n > 0 ? true : st.error === 'denied' ? false : null, n ? `연결됨: ${st.inputs.map(i => i.name).join(', ')}` : st.error === 'denied' ? 'MIDI 사용 권한이 막혀 있어요. 주소창 왼쪽 아이콘 → MIDI 기기 허용 후 새로 고침.' : '건반을 노트북 USB에 꽂으면 자동으로 찾습니다.');
  set('#ck3', U.soundOk || null, U.soundOk ? '소리가 나요. 준비 끝!' : null);
  $('#midiBanner').hidden = !n; $('#midiName').textContent = n ? st.inputs.map(i => i.name).join(', ') : '';
  const help = $('#midiHelp');
  help.hidden = !!n || !st.supported;
  help.textContent = '건반을 꽂았는데 안 보이면: ① 케이블을 다시 꽂기 ② 다른 프로그램(뮤즈스코어 등)이 건반을 쓰고 있으면 닫기 ③ 건반 다시 찾기.';
}
MIDI.onMidiStatus(st => { midiUI(st); });
$('#findMidi').onclick = () => { MIDI.connectMidi(); toast('건반을 찾고 있어요'); };
$('#testSound').onclick = () => {
  SND.audio(); const c = SND.audio();
  [60, 64, 67, 72].forEach((p, i) => SND.voice(c, SND.master, 'keys', p, c.currentTime + .05 + i * .16, .3, .8));
  U.soundOk = true; midiUI(MIDI.midiState);
};

// ── 건반 입력(실제 건반·화면 건반) ──
const KB_LO = 48, KB_HI = 84;
function buildKb() {
  const kb = $('#kb3'); kb.innerHTML = '';
  for (let p = KB_LO; p <= KB_HI; p++) {
    const black = [1, 3, 6, 8, 10].includes(C.pc(p));
    const k = document.createElement('button');
    k.type = 'button'; k.className = 'k ' + (black ? 'b' : 'w'); k.dataset.p = p;
    k.setAttribute('aria-label', C.sciName(p) + ' ' + C.solName(p));
    if (!black) k.innerHTML = `<span>${C.pc(p) === 0 ? '도' + (Math.floor(p / 12) - 1) : C.solName(p)}</span>`;
    kb.appendChild(k);
  }
  let down = null;
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('.k'); if (!k) return; e.preventDefault();
    down = +k.dataset.p; kb.setPointerCapture && kb.setPointerCapture(e.pointerId);
    if (S.mode === 'mouse' && U.step === 3) { mouseAdd(down); return; }
    MIDI.injectMidi({ on: true, p: down, v: 90 });
  });
  const up = () => { if (down != null && !(S.mode === 'mouse' && U.step === 3)) MIDI.injectMidi({ on: false, p: down, v: 0 }); down = null; };
  kb.addEventListener('pointerup', up); kb.addEventListener('pointercancel', up);
}
function kbLight(p, on) { const k = $(`#kb3 .k[data-p="${p}"]`); if (k) k.classList.toggle('on', on); }
MIDI.onMidi(m => {
  if (m.on) {
    if (!m.silent) SND.noteOn(m.p, m.v); kbLight(m.p, true);
    $('#nowNote').textContent = `지금 누른 음: ${C.solName(m.p, S.key)}(${C.sciName(m.p, S.key)}) · 세기 ${m.v}`;
    if (!U.soundOk) { U.soundOk = true; if (U.step === 1) midiUI(MIDI.midiState); }
    if (U.rec) recOn(m);
    if (U.step === 6 || U.step === 8) { const ae = activeEditor(); if (ae && ae.sel && ae.host.offsetParent) ae.midiPitch(m.p); }
  } else {
    SND.noteOff(m.p); kbLight(m.p, false);
    if (U.rec) recOff(m);
  }
});
document.addEventListener('keydown', e => { if (U.step !== 6 && U.step !== 8) return; const ae = activeEditor(); if (ae && ae.host.offsetParent) ae.onKey(e); });
// 컴퓨터 자판으로도(건반 없을 때 연습): a s d f g h j k = 도~도
const KEYMAP = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 }; // e.code: 한글 입력 상태에서도 같은 자리
const kdown = new Set();
document.addEventListener('keydown', e => {
  if (U.step !== 3 || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input,textarea,select,dialog'))) return;
  const p = KEYMAP[e.code]; if (!p) return; e.preventDefault();
  if (S.mode === 'mouse') { mouseAdd(p); return; }
  kdown.add(p); MIDI.injectMidi({ on: true, p, v: 88 });
});
document.addEventListener('keyup', e => { const p = KEYMAP[e.code]; if (p && kdown.has(p)) { kdown.delete(p); MIDI.injectMidi({ on: false, p, v: 0 }); } });
window.addEventListener('blur', () => { kdown.forEach(p => MIDI.injectMidi({ on: false, p, v: 0 })); kdown.clear(); });

// ── 2 가사 쓰기 ──
function r2() {
  const box = $('#lyricRows');
  box.innerHTML = S.lyrics.map((l, i) => `
    <div class="lrow" data-i="${i}">
      <span class="ln">${i + 1}</span>
      <input class="lt" value="${esc(l.text)}" maxlength="40" placeholder="${i === 0 ? '예: 창문 열면 아침 햇살' : '노랫말 한 줄'}" aria-label="${i + 1}번째 줄">
      <button type="button" class="ch ${l.chorus ? 'on' : ''}" aria-pressed="${l.chorus}">후렴</button>
      <button type="button" class="del" aria-label="${i + 1}번째 줄 지우기" ${S.lyrics.length < 2 ? 'disabled' : ''}>✕</button>
    </div>`).join('');
  sylView();
}
$('#lyricRows').addEventListener('input', e => {
  const r = e.target.closest('.lrow'); if (!r || !e.target.classList.contains('lt')) return;
  S.lyrics[+r.dataset.i].text = e.target.value; save(); sylView();
});
$('#lyricRows').addEventListener('click', e => {
  const r = e.target.closest('.lrow'); if (!r) return; const i = +r.dataset.i;
  if (e.target.classList.contains('ch')) { S.lyrics[i].chorus = !S.lyrics[i].chorus; save(); r2(); }
  if (e.target.classList.contains('del')) { S.lyrics.splice(i, 1); save(); r2(); }
});
$('#addLine').onclick = () => { if (S.lyrics.length >= MAX_LINES) return toast(`최대 ${MAX_LINES}줄(${MAX_LINES * 2}마디)까지 쓸 수 있어요`); S.lyrics.push({ text: '', chorus: false }); save(); r2(); $$('#lyricRows .lt').pop().focus(); };
$('#lyricRows').addEventListener('paste', e => {
  const inp = e.target.closest('.lt'); if (!inp) return;
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/\r?\n/.test(txt.trim())) return;
  e.preventDefault();
  const rows = txt.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  const i = +inp.closest('.lrow').dataset.i;
  const before = inp.value.slice(0, inp.selectionStart), after = inp.value.slice(inp.selectionEnd);
  S.lyrics[i].text = (before + rows[0]).slice(0, 40);
  const room = MAX_LINES - S.lyrics.length;
  const add = rows.slice(1, 1 + room).map(t => ({ text: t.slice(0, 40), chorus: false }));
  if (after.trim()) add.push({ text: after.trim(), chorus: false });
  // 바로 뒤의 빈 줄은 붙여 넣은 줄로 채운다
  let j = i + 1;
  while (add.length && j < S.lyrics.length && !S.lyrics[j].text.trim()) { S.lyrics[j].text = add.shift().text; j++; }
  S.lyrics.splice(j, 0, ...add.slice(0, MAX_LINES - S.lyrics.length));
  save(); r2();
  toast(rows.length - 1 > room ? `${MAX_LINES}줄까지만 넣었어요` : `${rows.length}줄을 붙여 넣었어요`);
});
function sylView() {
  let tot = 0;
  $('#sylView').innerHTML = S.lyrics.map((l, i) => {
    const s = C.syllables(l.text); tot += s.length;
    const warn = s.length > 12 ? 'warn' : s.length && s.length < 6 ? 'low' : '';
    return `<div class="sline ${l.chorus ? 'chorus' : ''}">
      <div class="sh"><b>${i + 1}줄</b><span>${i * 2 + 1}–${i * 2 + 2}마디</span>${l.chorus ? '<em>후렴</em>' : ''}<span class="cnt ${warn}">${s.length}음절</span></div>
      <div class="sc">${s.length ? s.map(c => `<i>${esc(c)}</i>`).join('') : '<span class="empty">비어 있어요 · 음표도 없으면 반주 마디(전주·간주)</span>'}</div>
      ${warn === 'warn' ? '<p class="w">12음절이 넘으면 두 마디에 음이 촘촘해져요. 줄을 나누거나 말을 줄여 봐요.</p>' : ''}
    </div>`;
  }).join('');
  const bars = S.lyrics.length * 2;
  $('#sylSum').innerHTML = `<b>합계</b><span>${S.lyrics.length}줄</span><span>${tot}음절</span><span>${bars}마디</span><span>${bars * 4}박</span><small>최대 ${MAX_LINES}줄 · ${MAX_LINES * 2}마디</small><button class="btn sm" type="button" id="toS3">다음: 선율 연주 ▶</button>`;
  $('#toS3').onclick = () => go(3);
}

// ── 3 선율 연주 ──
$('#tempo').oninput = e => { S.tempo = +e.target.value; $('#tempoV').textContent = '♩=' + S.tempo; save(); };
$('#pickSel').onchange = e => {
  const P = +e.target.value; S.pickup = P; C.METER.pickup = P;
  const first = S.melody.filter(n => n.p != null).sort((a, b) => a.s - b.s)[0];
  if (S.mode === 'mouse' && !S.melody.length) U.mpos = -P;
  save(); refresh();
  if (first && first.s !== -P) {
    const sh = -P - first.s;
    ask(`첫 음이 ${P ? '못갖춘마디(여린내기)' : '1마디 첫 박'}에서 시작하도록 선율 전체를 ${Math.abs(sh) / 4}박 ${sh < 0 ? '앞으로' : '뒤로'} 옮길까요? 옮기지 않으면 마디 나눔만 바뀌어요.`, () => {
      pushHist(); S.melody = S.melody.map(n => ({ ...n, s: n.s + sh })).filter(n => n.s >= -P);
      if (S.take) { const tu = 60 / S.take.tempo / 4; S.take.events = S.take.events.map(x => ({ ...x, t: +(x.t + sh * tu).toFixed(4) })); }
      save(); refresh(); toast('선율을 옮겼어요');
    }, '옮기기');
  }
};
$('#keySel').onchange = e => {
  const old = S.key, to = e.target.value;
  if (!S.melody.length || old === to) { S.key = to; save(); return; }
  const sh = C.keyShift(old, to);
  S.key = to; save();
  if (!sh) { refresh(); return; } // 딴이름한소리조(올림바 ↔ 내림사): 조표만
  ask(`선율도 ${C.KEYS[to].name}으로 옮길까요? (${sh > 0 ? '반음 ' + sh + '개 위로' : '반음 ' + -sh + '개 아래로'}) 옮기지 않으면 조표만 바뀌어요.`, () => { transposeAll(sh, old); toast(`곡 전체를 ${C.KEYS[to].name}으로 옮겼어요`); }, '함께 옮기기');
};
const MAX_LINES = 50;
const fromBar = () => Math.max(0, Math.min(U.recFrom || 0, totalBars() - 2));
function fillFrom() {
  const sel = $('#recFrom'), lines = Math.ceil(totalBars() / 2);
  sel.innerHTML = Array.from({ length: lines }, (_, i) => `<option value="${i * 2}">${i + 1}줄 (${i * 2 + 1}마디)부터</option>`).join('');
  sel.value = String(fromBar());
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]'); if (!b) return;
  const steps = [1, 1.5, 2, 3, 4];
  let i = steps.indexOf(U.zoom || 1); i = Math.max(0, Math.min(steps.length - 1, i + (+b.dataset.zoom)));
  U.zoom = steps[i];
  $$('.zoom-v').forEach(x => { x.textContent = Math.round(U.zoom * 100) + '%'; });
  drawStep();
});
$('#recFrom').onchange = e => {
  U.recFrom = +e.target.value;
  if (S.mode === 'mouse') { U.mpos = C.lineStart(U.recFrom / 2); mposLabel(); }
  U.scrollReq = U.recFrom * C.BAR; drawRoll3();
};
function r3() {
  $('#tempo').value = S.tempo; $('#tempoV').textContent = '♩=' + S.tempo; $('#keySel').value = S.key;
  const mouse = S.mode === 'mouse';
  $('#mousePal').hidden = !mouse; $('#recBtn').hidden = mouse;
  $('#s3one').textContent = mouse ? '음표 길이를 고른 뒤 화면 건반을 누르면 음표가 차례로 들어갑니다.' : '예비박 네 번 뒤 건반으로 노래를 연주하면, 누른 음이 막대로 실시간 기록됩니다.';
  $('#recState').textContent = mouse ? '마우스 입력' : S.take ? `녹음됨 · 음 ${S.take.events.length}개` : '대기';
  fillFrom();
  if (mouse && U.mpos == null) U.mpos = S.melody.length ? Math.max(...S.melody.map(n => n.s + n.d)) : -(S.pickup || 0);
  $('#pickSel').value = S.pickup || 0;
  mposLabel();
  drawRoll3(SND.position());
  if (humOut) humShow(); else drawRollHum();
}
function drawRoll3(play) {
  const cv = $('#roll3'); if (!cv.offsetParent) return;
  const bars = totalBars();
  const layers = [];
  if (U.rec) {
    const tu = 60 / U.rec.tempo / 4, now = SND.audio().currentTime, off = U.rec.from * C.BAR;
    const live = U.rec.events.map(e => ({ p: e.p, s: off + e.t / tu, d: e.d / tu }));
    U.rec.on.forEach((v, p) => live.push({ p, s: off + v.t / tu, d: Math.max(.3, (now - U.rec.t0 - v.t) / tu) }));
    layers.push({ kind: 'raw', notes: S.melody }, { kind: 'rec', notes: live });
    play = off + Math.max(0, (now - U.rec.t0) / tu);
  } else if (S.mode === 'mouse' || !S.take) layers.push({ kind: 'mel', notes: S.melody });
  else { const tu = 60 / S.take.tempo / 4; layers.push({ kind: 'rec', notes: S.take.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu })) }); }
  const req = U.scrollReq; U.scrollReq = null;
  drawRoll(cv, { bars, layers, lyr: true, play, follow: play != null, scrollTo: req, zoom: U.zoom || 1 });
}
function startRec() {
  const c = SND.audio();
  const beat = 60 / S.tempo, bars = totalBars(), f = fromBar();
  const bus = c.createGain(); bus.connect(SND.master);
  const start = c.currentTime + .15, t0 = start + 4 * beat;
  U.rec = { tempo: S.tempo, from: f, start, t0, end: t0 + (bars - f) * 4 * beat, events: [], on: new Map(), bus };
  const metro = $('#metro').checked;
  for (let i = 0; i < 4 + (bars - f) * 4; i++) {
    if (i >= 4 && !metro) break;
    SND.voice(c, bus, 'click', i % 4 === 0 ? 96 : 84, start + i * beat, .05, i < 4 ? .9 : .55);
  }
  $('#recBtn').textContent = '■ 멈춤'; $('#recBtn').classList.add('playing');
  $('#recFrom').disabled = true;
  stopPlay();
  loop(); recTick();
}
function recTick() {
  if (!U.rec) return;
  const c = SND.audio(), now = c.currentTime, beat = 60 / U.rec.tempo;
  const at = `${U.rec.from / 2 + 1}줄부터 `;
  if (now < U.rec.t0) $('#recState').textContent = '예비박 ' + [1, 2, 3, 4].slice(0, Math.min(4, Math.floor((now - U.rec.start) / beat) + 1)).join('·');
  else {
    const s = Math.floor(now - U.rec.t0), bar = U.rec.from + Math.floor((now - U.rec.t0) / (beat * 4)) + 1;
    $('#recState').textContent = `${at}녹음 중 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · ${bar}마디`;
  }
  if (now >= U.rec.end) { stopRec(); return; }
  setTimeout(recTick, 100);
}
function ctxTime(m) { const c = SND.audio(); return c.currentTime - Math.max(0, (performance.now() - (m.time || performance.now())) / 1000); }
function recOn(m) { const lead = (S.pickup || 0) * 15 / U.rec.tempo, t = ctxTime(m) - U.rec.t0; if (t < -lead - (60 / U.rec.tempo) / 2) return; U.rec.on.set(m.p, { t: Math.max(t, -lead - .05), v: m.v }); } // 여린내기 음은 예비박 끝에서
function recOff(m) { const o = U.rec.on.get(m.p); if (!o) return; U.rec.on.delete(m.p); U.rec.events.push({ p: m.p, v: o.v, t: o.t, d: Math.max(.03, ctxTime(m) - U.rec.t0 - o.t) }); }
function stopRec() {
  const r = U.rec; if (!r) return;
  const c = SND.audio(), now = Math.min(c.currentTime, r.end);
  r.on.forEach((o, p) => r.events.push({ p, v: o.v, t: o.t, d: Math.max(.05, now - r.t0 - o.t) }));
  r.bus.gain.setTargetAtTime(0, c.currentTime, .02); setTimeout(() => r.bus.disconnect(), 300);
  U.rec = null;
  $('#recBtn').textContent = '● 녹음'; $('#recBtn').classList.remove('playing'); $('#recFrom').disabled = false;
  if (!r.events.length) { $('#recState').textContent = '녹음된 음이 없어요 — 다시 녹음'; drawStep(); return; }
  // 녹음한 구간만 바꾸고 앞뒤 선율은 그대로 둔다
  const tu = 60 / r.tempo / 4, off = r.from * C.BAR;
  const endU = Math.min(units(), Math.ceil((off + Math.max(0, now - r.t0) / tu) / C.BAR) * C.BAR);
  const fresh = r.events.map(e => ({ p: e.p, v: e.v, t: +(e.t + off * tu).toFixed(4), d: +e.d.toFixed(4) }));
  applyTake(fresh, r.tempo, off, endU);
  save(); refresh();
  $('#recState').textContent = `녹음됨 · ${off / C.BAR + 1}~${endU / C.BAR}마디 · 음 ${fresh.length}개`;
  toast(`${off / C.BAR + 1}~${endU / C.BAR}마디를 녹음했어요 — 4단계에서 박을 맞춰요`);
}
// 녹음한 음(초)을 선율에 넣기 — 건반·흥얼거림 공통. 녹음한 구간만 바꾸고 앞뒤 선율은 그대로 둔다
function applyTake(fresh, tempo, off, endU) {
  const tu = 60 / tempo / 4, lo = off - (S.pickup || 0); // 그 줄의 여린내기 자리부터
  let kept = [];
  if (S.take) {
    const tuOld = 60 / S.take.tempo / 4;
    kept = S.take.events.map(e => ({ ...e, t: +(e.t / tuOld * tu).toFixed(4), d: +(e.d / tuOld * tu).toFixed(4) })).filter(e => { const u = e.t / tu; return u < lo || u >= endU; });
  }
  S.take = { tempo, events: [...kept, ...fresh].sort((a, b) => a.t - b.t) };
  pushHist();
  const newNotes = C.quantize(fresh, tempo, S.grid || 2, units()).filter(n => n.s >= lo && n.s < endU);
  const keepNotes = S.melody.filter(n => n.s < lo || n.s >= endU).map(n => (n.s < lo && n.s + n.d > lo ? { ...n, d: lo - n.s } : n));
  const all = [...keepNotes, ...newNotes].sort((a, b) => a.s - b.s);
  for (let i = 0; i < all.length - 1; i++) if (all[i].s + all[i].d > all[i + 1].s) all[i].d = all[i + 1].s - all[i].s;
  S.melody = all.filter(n => n.d > 0);
}
$('#recBtn').onclick = () => {
  if (U.hum || U.humBusy) return toast('흥얼거림 녹음을 먼저 끝내요');
  if (U.rec) return stopRec();
  const f = fromBar(), after = S.melody.some(n => n.s >= f * C.BAR);
  if (after) ask(`${f / 2 + 1}줄(${f + 1}마디)부터 녹음하면, 녹음한 마디까지의 선율이 새로 바뀌어요. 그 앞과 녹음을 멈춘 뒤의 마디는 그대로예요. 녹음할까요?`, startRec, '녹음');
  else startRec();
};
$('#playTake').onclick = e => {
  const from = fromBar() * C.BAR;
  if (S.mode !== 'mouse' && S.take) {
    const tu = 60 / S.take.tempo / 4;
    playWith(e.currentTarget, [{ inst: 'keys', notes: S.take.events.map(x => ({ p: x.p, s: x.t / tu, d: x.d / tu })), vol: .8 }], { from });
  } else playWith(e.currentTarget, [{ inst: 'keys', notes: S.melody, vol: .8 }], { from });
};
// 마우스 입력
$('#mousePal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.dur) { U.mdur = +b.dataset.dur; $$('#mousePal [data-dur]').forEach(x => x.classList.toggle('on', x === b)); }
  if (b.id === 'mRest') { U.mpos = Math.min(units(), (U.mpos || 0) + U.mdur); }
  if (b.id === 'mBack') {
    pushHist();
    const cur = U.mpos || 0;
    const last = S.melody.filter(n => n.s < cur).sort((a, b2) => a.s - b2.s).pop();
    if (last && last.s + last.d >= cur) { S.melody = S.melody.filter(n => n !== last); U.mpos = last.s; }
    else U.mpos = Math.max(-(S.pickup || 0), (U.mpos || 0) - U.mdur);
    save();
  }
  if (b.id === 'mClear') { pushHist(); S.melody = []; U.mpos = -(S.pickup || 0); save(); }
  mposLabel(); drawRoll3();
});
function mouseAdd(p) {
  const c = SND.audio(); SND.voice(c, SND.master, 'keys', p, c.currentTime + .01, .35, .8);
  kbLight(p, true); setTimeout(() => kbLight(p, false), 180);
  $('#nowNote').textContent = `지금 누른 음: ${C.solName(p, S.key)}(${C.sciName(p, S.key)})`;
  const pos = U.mpos || 0;
  if (pos + U.mdur > units()) return toast('마지막 마디까지 다 채웠어요');
  pushHist();
  S.melody = S.melody.filter(n => n.s + n.d <= pos || n.s >= pos + U.mdur);
  S.melody.push({ id: C.uid(), p, s: pos, d: U.mdur, lx: 'n' });
  U.mpos = pos + U.mdur; U.soundOk = true;
  save(); mposLabel(); drawRoll3();
}
function mposLabel() { const p = U.mpos || 0, ib = ((p % C.BAR) + C.BAR) % C.BAR; $('#mPos').textContent = `다음 음표 자리: ${p < 0 ? '못갖춘마디' : Math.floor(p / C.BAR) + 1 + '마디'} ${Math.floor(ib / 4) + 1}박`; }

// ── 흥얼거림 녹음(마이크) → MP3 · 음표 ──
let humOut = null; // { pcm, sr, mp3, url, events, notes, from, tempo, endU }
async function humStart() {
  if (U.rec) return toast('건반 녹음을 먼저 멈춰요');
  if (U.humBusy) return;
  stopPlay();
  const c = SND.audio();
  $('#humState').textContent = '마이크를 여는 중…';
  let rec;
  try { U.humBusy = true; rec = await HUM.openRecorder(c); }
  catch (x) {
    U.humBusy = false;
    $('#humState').textContent = '마이크를 쓸 수 없어요';
    toast(x && x.name === 'NotAllowedError' ? '마이크 사용을 허락해 주세요 (주소창 왼쪽 아이콘 → 마이크 허용)' : '마이크를 찾지 못했어요. 이어폰 마이크나 노트북 마이크를 확인해요');
    return;
  }
  U.humBusy = false;
  const beat = 60 / S.tempo, f = fromBar();
  const start = c.currentTime + .25, t0 = start + 4 * beat, end = t0 + (totalBars() - f) * 4 * beat;
  const bus = c.createGain(); bus.connect(SND.master);
  const metro = $('#humMetro').checked;
  for (let i = 0; i < 4 + (metro ? (totalBars() - f) * 4 : 0); i++) SND.voice(c, bus, 'click', i % 4 === 0 ? 96 : 84, start + i * beat, .05, i < 4 ? .9 : .5);
  U.hum = { rec, start, t0, end, from: f, tempo: S.tempo, live: [], bus };
  $('#humRec').textContent = '■ 멈춤'; $('#humRec').classList.add('playing'); $('#humOut').hidden = true;
  $('#recFrom').disabled = true;
  humTick();
}
function humTick() {
  const h = U.hum; if (!h) return;
  const c = SND.audio(), now = c.currentTime, beat = 60 / h.tempo, tu = beat / 4;
  const { rms, level, midi } = h.rec.now();
  $('#humLv').style.width = Math.round((level ?? Math.min(1, rms * 5)) * 100) + '%';
  $('#humNow').textContent = midi == null ? '—' : `${C.solName(Math.round(midi), S.key)}(${C.sciName(Math.round(midi), S.key)})`;
  if (now < h.t0) $('#humState').textContent = '예비박 ' + [1, 2, 3, 4].slice(0, Math.min(4, Math.floor((now - h.start) / beat) + 1)).join('·');
  else {
    const sec = Math.floor(now - h.t0), bar = h.from + Math.floor((now - h.t0) / (beat * 4)) + 1;
    $('#humState').textContent = `녹음 중 ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} · ${bar}마디`;
    const u = h.from * C.BAR + (now - h.t0) / tu;
    if (midi != null) { const p = Math.round(midi), last = h.live[h.live.length - 1]; if (last && last.p === p && u - (last.s + last.d) < .8) last.d = u - last.s; else h.live.push({ p, s: u, d: .3 }); }
  }
  drawRollHum(h.from * C.BAR + Math.max(0, (now - h.t0) / tu));
  if (now >= h.end) { humStop(); return; }
  setTimeout(humTick, 40);
}
async function humStop() {
  const h = U.hum; if (!h) return;
  U.hum = null; U.humBusy = true;
  const c = SND.audio(), now = Math.min(c.currentTime, h.end);
  h.bus.gain.setTargetAtTime(0, c.currentTime, .02); setTimeout(() => h.bus.disconnect(), 300);
  $('#humRec').textContent = '🎤 녹음'; $('#humRec').classList.remove('playing'); $('#humLv').style.width = '0'; $('#humNow').textContent = '—';
  $('#recFrom').disabled = false;
  try {
    if (now <= h.t0 + .5) { h.rec.cancel(); $('#humState').textContent = '녹음이 너무 짧아요 — 다시 녹음'; drawRollHum(); return; }
    // 학생은 들리는 박(출력 지연)에 맞춰 부르고, 마이크 소리는 그만큼 늦게 들어온다 → 지연만큼 당긴다
    const lat = Math.min(.15, (c.outputLatency || 0) + (c.baseLatency || 0) + .01);
    const pre = 30 / h.tempo; // 반 박 먼저부터(살짝 일찍 부른 첫 음도 담게)
    const pcm = await h.rec.finish(h.t0 - pre + lat, now + lat), sr = h.rec.sampleRate;
    const tr = await HUM.transcribe(pcm, sr, p => { $('#humState').textContent = `음 높이를 찾는 중… ${Math.round(p * 100)}%`; });
    const tu = 60 / h.tempo / 4, off = h.from * C.BAR;
    const events = tr.notes.map(n => ({ p: n.p, v: n.v, t: +(n.t - pre + off * tu).toFixed(4), d: +n.d.toFixed(4) }));
    const endU = Math.min(units(), Math.ceil((off + (now - h.t0) / tu) / C.BAR) * C.BAR);
    const notes = C.quantize(events, h.tempo, S.grid || 2, units()).filter(n => n.s >= off && n.s < endU);
    $('#humState').textContent = 'MP3를 만드는 중…';
    const mp3 = await SND.encodeMp3([HUM.normalize(pcm)], sr, 128);
    if (humOut && humOut.url) URL.revokeObjectURL(humOut.url);
    humOut = { mp3, url: URL.createObjectURL(mp3), events, notes, from: h.from, tempo: h.tempo, endU, secs: now - h.t0 };
    const s = Math.round(humOut.secs);
    $('#humState').textContent = `녹음됨 · ${Math.floor(s / 60)}분 ${s % 60}초 · 음 ${notes.length}개`;
    humShow();
  } catch (x) { console.warn(x); $('#humState').textContent = '녹음을 정리하지 못했어요 — 다시 녹음'; }
  finally { U.humBusy = false; }
}
function humShow() {
  const o = humOut; $('#humOut').hidden = !o; if (!o) return;
  const a = $('#humAudio'); if (a.src !== o.url) a.src = o.url;
  const G = { 1: '16분음표', 2: '8분음표', 4: '4분음표' }[S.grid || 2];
  $('#humInfo').textContent = o.notes.length ? `${o.from + 1}~${o.endU / C.BAR}마디 · 음 ${o.notes.length}개 · ${G} 단위로 맞춤 · ♩=${o.tempo}` : '또렷한 음을 찾지 못했어요 — 조금 더 크고 길게 불러 봐요';
  if (o.notes.length) SC.renderAbc($('#humScore'), SC.buildAbc({ tempo: o.tempo, key: S.key, bars: totalBars(), perLine: 4, showTitle: false, voices: [SC.melodyVoice(o.notes, S.lyrics, null)] }));
  else $('#humScore').innerHTML = '';
  drawRollHum();
}
function drawRollHum(play) {
  const cv = $('#rollHum'); if (!cv || !cv.offsetParent) return;
  const layers = [];
  if (S.melody.length) layers.push({ kind: 'raw', notes: S.melody });
  if (U.hum) layers.push({ kind: 'rec', notes: U.hum.live });
  else if (humOut && humOut.notes.length) layers.push({ kind: 'q', notes: humOut.notes });
  drawRoll(cv, { bars: totalBars(), layers, lyr: true, play, follow: play != null, zoom: U.zoom || 1 });
}
$('#humRec').onclick = () => { if (U.hum) humStop(); else humStart(); };
$('#humMp3').onclick = () => { if (humOut) download(humOut.mp3, fileBase() + '_흥얼거림.mp3'); };
$('#humUse').onclick = () => {
  const o = humOut; if (!o || !o.notes.length) return toast('찾은 음이 없어요 — 조금 더 크고 길게 불러 봐요');
  const doit = () => { applyTake(o.events, o.tempo, o.from * C.BAR, o.endU); save(); refresh(); toast(`${o.from + 1}~${o.endU / C.BAR}마디에 흥얼거린 선율을 넣었어요 — 4단계에서 박을 맞춰요`); };
  if (S.melody.some(n => n.s >= o.from * C.BAR && n.s < o.endU)) ask(`${o.from + 1}~${o.endU / C.BAR}마디의 선율이 흥얼거린 선율로 바뀌어요. 바꿀까요?`, doit, '바꾸기'); else doit();
};

// 곡 전체 조옮김(선율·연주 기록·비교 기준·자동 편곡을 함께)
function transposeAll(sh, fromKey, sunoTo = null) {
  if (!sh) return;
  pushHist();
  S.melody = C.shiftPitches(S.melody, sh);
  if (S.take) S.take.events = S.take.events.map(e => ({ ...e, p: e.p + sh }));
  if (S.base) S.base = C.shiftPitches(S.base, sh);
  S.arr.versions.forEach(v => {
    if (v.source === 'suno') { // 수노 편곡도 함께: 노래·재료를 옮기고 편성 엔진으로 다시(악기 음역 안으로)
      v.vocal = C.shiftPitches(v.vocal || [], sh);
      if (v.src) Object.keys(v.src).forEach(k => { if (k !== 'drums') v.src[k] = C.shiftPitches(v.src[k], sh); });
      else v.parts.forEach(p => { if (!isDrum(p)) p.notes = C.shiftPitches(p.notes, sh); });
      v.key = sunoTo && v.id === U.edVer ? sunoTo : C.shiftKey(v.key || fromKey || S.key, sh);
      if (v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, v.key) }));
      if (v.src) orchSuno(v);
      return;
    }
    if (v.source !== 'auto') return;
    v.vocal = C.shiftPitches(v.vocal || [], sh);
    v.parts.forEach(p => { if (p.inst !== 'drums') p.notes = C.shiftPitches(p.notes, sh); });
    if (fromKey && v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, S.key) }));
  });
  if (S.arr.nv) { S.arr.nv.parts.forEach(p => { if (p.inst !== 'drums') p.notes = C.shiftPitches(p.notes, sh); }); if (S.arr.nv.chords) S.arr.nv.chords = S.arr.nv.chords.map(c => ({ ...c, name: C.chordName(c, S.key) })); }
  save(); refresh();
}
function rangeUI() {
  const r = C.range(S.melody), box = $('#rangeBox');
  $('#rKey').innerHTML = C.KEY_ORDER.map(k => `<option value="${k}" ${k === S.key ? 'selected' : ''}>${C.KEYS[k].name}</option>`).join('');
  if (!r) { box.innerHTML = '<p class="empty">선율이 생기면 가장 낮은 음과 높은 음을 보여 줘요.</p>'; return; }
  const LO = 52, HI = 84, pct = p => ((Math.max(LO, Math.min(HI, p)) - LO) / (HI - LO) * 100).toFixed(1);
  const nm = p => `${C.solName(p, S.key)}${Math.floor(p / 12) - 1}`;
  const out = r.lo < C.COMFORT.warnLo || r.hi > C.COMFORT.warnHi ? 'bad' : r.lo < C.COMFORT.lo || r.hi > C.COMFORT.hi ? 'mid' : 'ok';
  const msg = { ok: '모둠원 모두 부르기 편한 음역이에요.', mid: '조금 높거나 낮은 음이 있어요. 목을 풀고 부르거나 조를 옮겨 봐요.', bad: '부르기 힘든 음이 있어요. 아래에서 조를 옮겨 봐요.' }[out];
  const bk = C.bestKey(S.melody, S.key);
  const sug = bk && (bk.key !== S.key || bk.shift) && out !== 'ok' ? `<button type="button" class="btn sm" id="rBest" data-k="${bk.key}" data-sh="${bk.shift}">추천: ${C.KEYS[bk.key].name}${bk.shift && bk.key === S.key ? (bk.shift > 0 ? ' 옥타브 위' : ' 옥타브 아래') : ''}로 옮기기</button>` : '';
  box.innerHTML = `<div class="rng"><div class="rng-z" style="left:${pct(C.COMFORT.lo)}%;width:${(pct(C.COMFORT.hi) - pct(C.COMFORT.lo)).toFixed(1)}%"><span>편한 음역</span></div><div class="rng-m ${out}" style="left:${pct(r.lo)}%;width:${Math.max(1.5, pct(r.hi) - pct(r.lo))}%"></div></div>
    <p class="rng-t"><b>${nm(r.lo)} ~ ${nm(r.hi)}</b><span>${r.hi - r.lo}반음 · ${C.KEYS[S.key].name}</span><em class="${out}">${msg}</em></p>${sug}`;
}
$('#rangeCard').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'rBest') { const k = b.dataset.k, sh = +b.dataset.sh, old = S.key; S.key = k; transposeAll(sh, old); toast(`${C.KEYS[k].name}으로 옮겼어요`); return; }
  if (b.dataset.oct) { transposeAll(+b.dataset.oct * 12, S.key); toast(+b.dataset.oct > 0 ? '한 옥타브 올렸어요' : '한 옥타브 내렸어요'); }
});
$('#rKey').onchange = e => { const to = e.target.value, old = S.key; if (to === old) return; const sh = C.keyShift(old, to); S.key = to; if (!sh) { save(); refresh(); return; } transposeAll(sh, old); toast(`곡 전체를 ${C.KEYS[to].name}으로 옮겼어요`); };
// 작곡 기법: 마디 반복·동형진행·역행·전위
function barToolUI() {
  const bars = totalBars(), opt = (sel) => Array.from({ length: bars }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}마디</option>`).join('');
  const f = Math.min(U.btFrom ?? 0, bars - 1), t = Math.min(U.btTo ?? 1, bars - 1);
  $('#btFrom').innerHTML = opt(f); $('#btTo').innerHTML = opt(t);
  $('#btKind').innerHTML = Object.entries(C.BAR_TOOLS).map(([k, v]) => `<button type="button" data-bt="${k}" class="${(U.btKind || 'copy') === k ? 'on' : ''}">${v}</button>`).join('');
}
$('#btKind').addEventListener('click', e => { const b = e.target.closest('[data-bt]'); if (!b) return; U.btKind = b.dataset.bt; $$('#btKind button').forEach(x => x.classList.toggle('on', x === b)); });
$('#btFrom').onchange = e => { U.btFrom = +e.target.value; };
$('#btTo').onchange = e => { U.btTo = +e.target.value; };
$('#btApply').onclick = () => {
  const f = +$('#btFrom').value, t = +$('#btTo').value, k = U.btKind || 'copy';
  if (f === t) return toast('가져올 마디와 넣을 마디를 다르게 골라요');
  const out = C.transformBar(S.melody, f, t, k, S.key);
  if (!out) return toast(`${f + 1}마디에 음표가 없어요`);
  pushHist(); S.melody = out; save(); r4();
  playWith(null, [{ inst: 'voice', notes: S.melody, vol: .8 }], { from: Math.min(f, t) * C.BAR, to: (Math.max(f, t) + 1) * C.BAR });
  toast(`${f + 1}마디를 ${C.BAR_TOOLS[k]} → ${t + 1}마디에 넣었어요 · 되돌리기로 취소`);
};

// ── 4 박 맞춤 ──
$('#gridSel').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.grid = +b.dataset.g; save(); r4(); });
$('#doQuant').onclick = () => {
  if (!S.take) return toast(S.mode === 'mouse' ? '마우스로 입력한 음은 이미 박에 맞춰져 있어요' : '3단계에서 먼저 녹음해 주세요');
  pushHist();
  S.melody = C.quantize(S.take.events, S.take.tempo, S.grid, units());
  U.sel = null; save(); r4();
  toast(`${{ 4: '4분음표', 2: '8분음표', 1: '16분음표' }[S.grid]} 단위로 박을 맞췄어요`);
};
$('#playQuant').onclick = e => playWith(e.currentTarget, [{ inst: 'voice', notes: S.melody }]);
function r4() {
  $$('#gridSel button').forEach(b => b.classList.toggle('on', +b.dataset.g === S.grid));
  $('#quantMsg').textContent = !S.take ? (S.mode === 'mouse' ? '마우스로 입력한 음은 이미 박에 맞춰져 있어요. 아래에서 음표를 고칠 수 있어요.' : '3단계에서 녹음하면 원래 연주와 맞춘 결과가 여기에 겹쳐 보여요.') : '점선 회색은 원래 연주, 파랑은 박에 맞춘 위치예요. 단위를 바꿔 가며 우리 노랫말에 맞는 리듬을 골라요.';
  drawRoll4(SND.position());
  const bars = totalBars();
  SC.renderAbc($('#score4'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: 4, showTitle: false, voices: [{ id: 'V1', name: '노래', clef: 'treble', notes: S.melody }] }));
  noteChips(); rangeUI(); barToolUI();
}
function drawRoll4(play) {
  const cv = $('#roll4'); if (!cv.offsetParent) return;
  const layers = [];
  if (S.take) {
    const tu = 60 / S.take.tempo / 4;
    const raw = S.take.events.map(e => ({ p: e.p, s: e.t / tu, d: e.d / tu }));
    const links = raw.map(r => ({ p: r.p, from: r.s, to: Math.round(r.s / S.grid) * S.grid })).filter(k => Math.abs(k.from - k.to) > .05);
    layers.push({ kind: 'raw', notes: raw, links });
  }
  layers.push({ kind: 'q', notes: S.melody });
  drawRoll(cv, { bars: totalBars(), layers, play, sel: U.sel, follow: play != null, zoom: U.zoom || 1 });
}
function noteChips() {
  const box = $('#noteChips');
  const sorted = [...S.melody].sort((a, b) => a.s - b.s);
  if (!sorted.length) { box.innerHTML = '<span class="empty">아직 음표가 없어요. 3단계에서 연주하거나 입력해요.</span>'; return; }
  let html = '', bar = -1;
  sorted.forEach(n => {
    const b = Math.floor(n.s / C.BAR);
    if (b !== bar) { if (bar >= 0) html += '</span>'; html += `<span class="cbar"><em>${b + 1}</em>`; bar = b; }
    html += `<button type="button" class="nc ${U.sel === n.id ? 'on' : ''}" data-id="${n.id}">${C.solName(n.p, S.key)}<small>${durLabel(n.d)}</small></button>`;
  });
  box.innerHTML = html + '</span>';
}
$('#noteChips').addEventListener('click', e => {
  const b = e.target.closest('.nc'); if (!b) return;
  U.sel = U.sel === b.dataset.id ? null : b.dataset.id;
  const n = S.melody.find(x => x.id === U.sel);
  if (n) { const c = SND.audio(); SND.voice(c, SND.master, 'voice', n.p, c.currentTime + .01, .35, .8); }
  noteChips(); drawRoll4();
});
$('#noteTools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const ed = b.dataset.ed;
  if (ed === 'undo') return undo();
  const n = S.melody.find(x => x.id === U.sel);
  if (!n) return toast('먼저 고칠 음표를 눌러 골라요');
  pushHist();
  const sorted = [...S.melody].sort((a, c) => a.s - c.s), nx = sorted[sorted.indexOf(n) + 1];
  if (ed === 'up') n.p = Math.min(96, n.p + 1);
  if (ed === 'down') n.p = Math.max(36, n.p - 1);
  if (ed === 'longer') {
    const gap = (nx ? nx.s : units()) - (n.s + n.d);
    if (gap >= 2) n.d += 2; else if (gap >= 1) n.d += 1;
    else if (nx && nx.d > 2) { nx.s += 2; nx.d -= 2; n.d += 2; }
    else { U.hist.pop(); return toast('다음 음표와 붙어 있어 더 길게 할 수 없어요'); }
  }
  if (ed === 'shorter') { if (n.d > 2) n.d -= 2; else if (n.d > 1) n.d -= 1; else { U.hist.pop(); return toast('더 짧게 할 수 없어요'); } }
  if (ed === 'del') { S.melody = S.melody.filter(x => x !== n); U.sel = null; }
  if (n && ed !== 'del') { const c = SND.audio(); SND.voice(c, SND.master, 'voice', n.p, c.currentTime + .01, .3, .8); }
  save(); r4();
});

// ── 5 가사 붙이기 ──
function r5() {
  const bars = totalBars();
  const mv = SC.melodyVoice(S.melody, S.lyrics, null);
  SC.renderAbc($('#score5'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars, perLine: 4, showTitle: false, voices: [mv] }));
  const { map, report } = mv.lyrics;
  const sorted = [...S.melody].filter(n => n.p != null).sort((a, b) => a.s - b.s);
  $('#lyEdit').innerHTML = S.lyrics.map((l, li) => {
    const ns = sorted.filter(n => n.s >= C.lineStart(li) && n.s < C.lineStart(li + 1));
    const syl = C.syllables(l.text);
    const rep = report[li];
    const cells = ns.map(n => {
      const m = map.get(n.id) || { kind: 'none', text: '' };
      let lab = '';
      if (m.kind === 'ext') lab = '<span class="ext">⌒</span>';
      else if (m.kind === 'syl') lab = [...m.text].map((ch, k) => `<span class="sy" data-li="${li}" data-j="${m.idx + k}">${esc(ch)}</span>`).join('');
      else if (m.kind === 'skip') lab = '<span class="ext" title="글자 없이 건너뛰는 음(가사 입력에서 비움) — 보통으로 되돌릴 수 있어요">·</span>';
      else lab = '<span class="miss">?</span>';
      const barStart = n.s % C.BAR === 0 || ns.indexOf(n) === 0 || Math.floor(n.s / C.BAR) !== Math.floor(ns[ns.indexOf(n) - 1].s / C.BAR);
      return `<div class="cell ${U.lySel === n.id ? 'on' : ''} ${n.lx === 'd' ? 'dbl' : ''} ${barStart ? 'bs' : ''}" data-id="${n.id}" data-li="${li}"><b>${C.solName(n.p, S.key)}</b><small>${durLabel(n.d)}</small><div class="sl">${lab}</div></div>`;
    }).join('');
    const extra = rep && rep.extra.length ? `<div class="over">남은 글자 ${rep.extra.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : '';
    return `<div class="lyline ${rep && rep.ok ? 'ok' : 'bad'}${rep && rep.rest ? ' rest' : ''}"><div class="lh"><b>${li + 1}줄</b><span>${li * 2 + 1}–${li * 2 + 2}마디</span><span class="tx">${rep && rep.rest ? '반주 마디' : esc(syl.join(' '))}</span></div><div class="cells">${cells || `<span class="empty">${rep && rep.rest ? '노랫말과 음표가 없는 반주 마디예요(전주·간주·후주)' : '이 마디에 음표가 없어요'}</span>`}</div>${extra}</div>`;
  }).join('');
  $('#lyCheck').innerHTML = report.map(r => {
    const diff = r.syl - r.slots;
    const why = r.rest ? '✓ 반주 마디' : r.ok ? '✓ 맞음' : r.syl === 0 ? '노랫말이 비어 있어요' : diff > 0 ? `글자가 ${diff}개 남아요` : `음표 칸이 ${-diff}개 남아요`;
    return `<li class="${r.ok ? 'ok' : 'bad'}"><b>${r.line + 1}줄</b><span>${r.rest ? '노랫말·음표 없음' : `글자 ${r.syl} · 음표 칸 ${r.slots}`}</span><em>${why}</em></li>`;
  }).join('') + (report.some(r => r.syl) && report.every(r => r.ok) ? '<li class="done">모든 줄이 맞아요. 가사가 붙은 악보가 완성됐어요 → AI 편곡으로</li>' : '');
}
$('#lyEdit').addEventListener('click', e => {
  const c = e.target.closest('.cell'); if (!c || dragged) return;
  U.lySel = U.lySel === c.dataset.id ? null : c.dataset.id;
  $$('#lyEdit .cell').forEach(x => x.classList.toggle('on', x.dataset.id === U.lySel));
});
$('#lyTools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.ly === 'undo') return undo();
  const n = S.melody.find(x => x.id === U.lySel);
  if (!n) return toast('먼저 음표 칸을 눌러 골라요');
  const li = C.lineOf(n.s);
  const first = S.melody.filter(x => x.p != null && C.lineOf(x.s) === li).sort((a, c) => a.s - c.s)[0];
  if (b.dataset.ly === 'e' && first === n) return toast('줄의 첫 음은 앞 글자를 늘일 수 없어요');
  pushHist(); n.lx = b.dataset.ly; save(); r5();
});
// 끌어 놓기
let drag = null, dragged = false;
$('#lyEdit').addEventListener('pointerdown', e => {
  const sy = e.target.closest('.sy'); if (!sy) return;
  e.preventDefault(); dragged = false;
  const g = document.createElement('div'); g.className = 'drag-ghost'; g.textContent = sy.textContent; document.body.appendChild(g);
  drag = { li: +sy.dataset.li, j: +sy.dataset.j, g, x0: e.clientX, y0: e.clientY };
  moveGhost(e);
});
function moveGhost(e) { if (!drag) return; drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; }
document.addEventListener('pointermove', e => {
  if (!drag) return; moveGhost(e);
  if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6) dragged = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest('.cell');
  $$('#lyEdit .cell').forEach(x => x.classList.toggle('drop', x === c && +c.dataset.li === drag.li));
});
document.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; d.g.remove();
  $$('#lyEdit .cell.drop').forEach(x => x.classList.remove('drop'));
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest('.cell');
  if (dragged && c && +c.dataset.li === d.li) {
    pushHist(); const r = C.placeSyllable(S.melody, S.lyrics, d.li, d.j, c.dataset.id);
    if (r === 'first') { U.hist.pop(); toast('줄의 첫 글자는 첫 음에서 시작해요 — 앞 음에 두 글자를 붙여 뒤 글자를 당겨 보세요'); }
    save(); r5();
  } else if (dragged && c) toast('같은 줄 안에서만 옮길 수 있어요');
  setTimeout(() => { dragged = false; }, 0);
});
$('#playSong5').onclick = e => playWith(e.currentTarget, [{ inst: 'voice', notes: S.melody }]);

// ── 6 AI 편곡 ──
function chipsGroup(box, obj, sel, multi) {
  box.innerHTML = Object.entries(obj).map(([k, v]) => `<button type="button" data-k="${k}" class="${(multi ? sel.includes(k) : sel === k) ? 'on' : ''}" aria-pressed="${multi ? sel.includes(k) : sel === k}">${typeof v === 'string' ? v : v.name}</button>`).join('');
}
function r6() {
  const st = S.arr.settings;
  chipsGroup($('#optGenre'), C.GENRES, st.genre);
  chipsGroup($('#optMood'), C.MOODS, st.mood);
  chipsGroup($('#optRange'), C.CHORD_RANGE, st.range || 'far');
  chipsGroup($('#optPer'), { auto: '편곡마다 다르게', ...C.CHORD_PER }, String(st.perBar || 'auto'));
  ensUI();
  $('#scene').value = S.arr.scene || ''; $('#pickWhy').value = S.arr.why || '';
  $$('.tabs [data-tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === U.tab));
  $('#tabAuto').hidden = U.tab !== 'auto'; $('#tabSuno').hidden = U.tab !== 'suno';
  versionsUI(); sunoUI();
  if (!U.edVer && U.tab === 'suno') U.edVer = (S.arr.versions.find(v => v.source === 'suno') || {}).id;
  showEditor6();
}
$('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; U.tab = t.dataset.tab; r6(); });
$('#optGenre').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.genre = b.dataset.k; save(); r6(); };
$('#optMood').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.mood = b.dataset.k; save(); r6(); };
$('#optRange').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.range = b.dataset.k; save(); r6(); };
$('#optPer').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.arr.settings.perBar = b.dataset.k; save(); r6(); };
// 우리 편성: 악기마다 연주할 사람 수
const ENS_NOTE = {
  vocal: '한 보표에 함께(제창)', flute: '1명 독주 · 2명이면 3도 화음', recorder: '노래 선율을 쉽게 · 한 옥타브 아래로 적음', clarinet: 'B♭ 이조 · 대선율과 3도 화음 선율',
  sax: 'E♭ 이조 · 팝 혼 리프', trumpet: 'B♭ 이조 · 전주 훅과 선율', trombone: '후렴에서 길게 · 2명이면 두 음', violin: '훅 · 높은 대선율 · 옥타브 위 선율',
  strings: '사람 수만큼 화음(3성부까지)', cello: '근음을 활로 길게', guitar: '1 리듬·코드 · 2 리드·아르페지오', uke: '코드 기호 + 리듬 빗금(스트로크)',
  keys: '큰보표(오른손·왼손)', bass: '한 줄 · 한 옥타브 위로 적음', mallet: '훅 · 화음음 아르페지오', drums: '두 손 + 큰북', cajon: '가운데(저음)·모서리(고음)', tamb: '2·4박 뒷박',
};
const staffN = (k, n) => (!n ? 0 : k === 'keys' ? 2 : k === 'guitar' ? Math.min(2, n) : 1);
function ensUI() {
  const e = S.arr.settings.ens, keys = ['vocal', ...ORCH.ENS_ORDER];
  const cats = Object.entries(ORCH.ENS_CATS).map(([cat, label]) => {
    const ks = keys.filter(k => ORCH.ENS[k].cat === cat); if (!ks.length) return '';
    const on = ks.reduce((a, k) => a + (e[k] || 0), 0);
    return `<div class="ens-cat"><h3>${label}${on ? `<small>${on}명</small>` : ''}</h3><div class="ens">${ks.map(k => { const info = ORCH.ENS[k], n = e[k] || 0; return `<div class="ens-i ${n ? 'on' : ''}" data-ens="${k}"><b>${info.name}${info.trans ? `<i class="ens-tr" title="이조 악기 — 파트보는 기보음으로 인쇄">${info.trans === 9 ? 'E♭' : 'B♭'}</i>` : ''}</b><span class="ens-st"><button type="button" data-d="-1" aria-label="${info.name} 줄이기">−</button><output>${n}</output><button type="button" data-d="1" aria-label="${info.name} 늘리기">+</button></span><small>${ENS_NOTE[k] || ''} · 최대 ${info.max}명</small></div>`; }).join('')}</div></div>`;
  }).join('');
  $('#ensBox').innerHTML = cats;
  const total = keys.reduce((a, k) => a + (e[k] || 0), 0), staves = (e.vocal ? 1 : 0) + ORCH.ENS_ORDER.reduce((a, k) => a + staffN(k, e[k]), 0);
  $('#ensSum').textContent = `모두 ${total}명 · 보표 ${staves}개`;
  $('#introSel').value = S.arr.settings.intro ?? 2;
}
$('#ensBox').addEventListener('click', ev => {
  const b = ev.target.closest('[data-d]'); if (!b) return;
  const k = b.closest('[data-ens]').dataset.ens, info = ORCH.ENS[k], e = S.arr.settings.ens;
  e[k] = Math.max(0, Math.min(info.max, (e[k] || 0) + +b.dataset.d));
  if (!ORCH.ENS_ORDER.some(x => e[x])) { e[k] = 1; toast('악기를 한 가지 이상 남겨 두어요'); }
  save(); ensUI(); reorch();
});
$('#introSel').onchange = ev => { S.arr.settings.intro = +ev.target.value; save(); reorch(); };
// 편성·전주가 바뀌면 이미 만든 편곡들을 그 편성으로 다시 계산(코드·노래는 그대로)
function reorch() {
  let n = 0;
  S.arr.versions.forEach(v => {
    if (v.source === 'auto') { v.settings = { ...v.settings, ens: clone(S.arr.settings.ens), intro: S.arr.settings.intro }; rebuildParts(v, S.melody); n++; }
    else if (v.src) { orchSuno(v); n++; }
  });
  S.arr.nv = null;
  if (n) { save(); versionsUI(); showEditor6(); toast(`편곡 ${n}가지를 새 편성으로 다시 계산했어요`); }
}
$('#scene').oninput = e => { S.arr.scene = e.target.value; save(); };
$('#pickWhy').oninput = e => { S.arr.why = e.target.value; save(); };
const VARN = ['기본 코드', '색채 코드', '빠른 코드 바꿈'];
$('#genArr').onclick = () => {
  if (!S.melody.length) return toast('먼저 선율을 만들어 주세요 (3단계)');
  if (!ORCH.ENS_ORDER.some(k => S.arr.settings.ens[k])) return toast('편성에서 악기를 하나 이상 골라 주세요');
  const st = clone(S.arr.settings);
  const keep = S.arr.versions.filter(v => v.source === 'suno');
  const slots = ['A', 'B', 'C'].filter(id => !keep.some(v => v.id === id));
  const made = slots.map((id, i) => {
    const r = C.arrange(S.melody, S.lyrics, S.key, st, i);
    return { id, source: 'auto', name: `${C.GENRES[st.genre]} · ${C.MOODS[st.mood]} · ${VARN[i]}`, settings: st, variant: i, chords: r.chords, parts: r.parts, vocal: C.styleVocal(S.melody, st, i, S.key), bars: r.bars, intro: r.intro, sections: r.sections };
  });
  S.arr.versions = [...keep, ...made].sort((a, b) => a.id.localeCompare(b.id));
  if (S.arr.chosen && !S.arr.versions.some(v => v.id === S.arr.chosen)) S.arr.chosen = null;
  if (made.some(v => v.id === S.arr.chosen)) { S.arr.chosen = null; S.base = null; }
  save(); versionsUI(); if (U.edVer && !S.arr.versions.some(v => v.id === U.edVer)) U.edVer = null; showEditor6();
  toast(`편곡 ${made.length}가지를 만들었어요 — 끝까지 들어 보고 골라요`);
  $('#verWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
function progression(v) {
  const per = new Map();
  v.chords.forEach(c => { const b = Math.floor(c.s / C.BAR); if (!per.has(b)) per.set(b, []); per.get(b).push(c.name); });
  return [...per.values()].map(a => a.join(' ')).join(' | ');
}
function versionsUI() {
  const vs = S.arr.versions;
  $('#verWrap').hidden = !vs.length;
  if (!vs.length) return;
  $('#verCount').textContent = `편곡 ${vs.length}가지`;
  $('#vers').innerHTML = vs.map(v => `
    <article class="ver ${S.arr.chosen === v.id ? 'on' : ''}" data-id="${v.id}">
      <div class="vh"><b class="vid">${v.id}</b><div><h3>${esc(v.name)}</h3><span class="tag ${v.source}">${v.source === 'suno' ? '수노 AI' : '자동 편곡'}</span></div></div>
      <p class="prog">${esc(progression(v))}</p>
      <p class="vparts">${v.parts.map(p => esc(p.name)).join(' · ')}</p>
      ${U.audio[v.id] ? `<audio controls preload="none" src="${U.audio[v.id]}"></audio>` : ''}
      <div class="row"><button type="button" class="btn ghost sm" data-play="${v.id}">▶ 듣기</button><button type="button" class="btn ghost sm" data-editv="${v.id}">악보 편집</button><button type="button" class="btn sm" data-choose="${v.id}">${S.arr.chosen === v.id ? '✓ 선택됨' : '선택'}</button></div>
    </article>`).join('');
  const v = chosen();
  const vol = (id, val) => `<input type="range" class="vol" min="0" max="150" step="5" value="${Math.round((val ?? 1) * 100)}" data-vol="${id}" aria-label="음량">`;
  $('#partList').innerHTML = v ? [`<li><b>노래</b><span>${v.vocal ? v.vocal.length + '음' : '없음'}</span>${vol('__voice', S.arr.vvol)}<button type="button" class="mute ${S.arr.vmute ? 'on' : ''}" data-mute="__voice">${S.arr.vmute ? '소리 켜기' : '소리 끄기'}</button></li>`, ...v.parts.map(p => `<li><b>${esc(p.group ? (p.name ? p.name + ' 오른손' : '키보드 왼손') : p.name)}</b><span>${p.notes.length}개</span>${vol(p.id, p.vol)}<button type="button" class="mute ${p.mute ? 'on' : ''}" data-mute="${p.id}">${p.mute ? '소리 켜기' : '소리 끄기'}</button></li>`)].join('') : '<li class="empty">편곡을 하나 고르면 파트가 여기에 나뉘어 나와요. 소리 크기도 파트마다 맞출 수 있어요.</li>';
  chordUI();
}
$('#vers').addEventListener('click', e => {
  const p = e.target.closest('[data-play]'), c = e.target.closest('[data-choose]');
  if (p) { const v = S.arr.versions.find(x => x.id === p.dataset.play); playWith(p, verTracks(v, v.vocal), { tempo: v.bpm }); if (v.id === U.edVer && SND.isPlaying()) ed6.follow(); }
  const ed = e.target.closest('[data-editv]');
  if (ed) { U.edVer = ed.dataset.editv; ed6.clear(); showEditor6(); $('#edCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (c) {
    const id = c.dataset.choose;
    const doit = () => { S.arr.chosen = id; S.base = clone(S.melody); S.decisions = {}; S.log = []; U.bar = null; save(); versionsUI(); refresh(); toast(`${id} 편곡을 골랐어요 — 고른 이유를 남기고 7단계로`); };
    if (S.arr.chosen && S.arr.chosen !== id && S.log.length) ask('편곡을 바꾸면 7단계 결정 기록이 처음부터 다시 시작돼요. 바꿀까요?', doit, '바꾸기'); else if (S.arr.chosen !== id) doit();
  }
});
$('#partList').addEventListener('click', e => {
  const m = e.target.closest('[data-mute]'); if (!m) return;
  if (m.dataset.mute === '__voice') S.arr.vmute = !S.arr.vmute;
  else { const p = chosen().parts.find(x => x.id === m.dataset.mute); p.mute = !p.mute; syncNv(); }
  save(); versionsUI();
});
$('#partList').addEventListener('input', e => {
  const r = e.target.closest('[data-vol]'); if (!r) return;
  const val = +r.value / 100;
  if (r.dataset.vol === '__voice') S.arr.vvol = val; else { const p = chosen().parts.find(x => x.id === r.dataset.vol); if (p) p.vol = val; syncNv(); }
  save();
});
// 8단계에서 다시 만든 반주(nv)에도 파트 음량·끄기를 그대로
function syncNv() {
  const v = chosen(), nv = S.arr.nv; if (!v || !nv || nv.of !== v.id) return;
  nv.parts.forEach(p => { const o = v.parts.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
}
// ── 코드 직접 바꾸기 ──
function chordVer() { return S.arr.versions.find(x => x.id === U.edVer) || chosen() || S.arr.versions[0]; }
function chordUI() {
  const v = chordVer(), box = $('#chordBox');
  const st = S.arr.settings;
  $('#hRange').innerHTML = Object.entries(C.CHORD_RANGE).map(([k, t]) => `<option value="${k}" ${k === (st.range || 'far') ? 'selected' : ''}>${t}</option>`).join('');
  $('#hPer').innerHTML = [['auto', '편곡마다 다르게'], ...Object.entries(C.CHORD_PER)].map(([k, t]) => `<option value="${k}" ${String(k) === String(st.perBar || 'auto') ? 'selected' : ''}>${t}</option>`).join('');
  if (!v || !v.chords || !v.chords.length) { box.innerHTML = '<p class="empty">편곡을 만들면 마디마다 코드가 여기에 나와요.</p>'; return; }
  const key = v.key || S.key, voc = v.source === 'suno' ? (v.vocal || []) : S.melody;
  const fit = C.chordFit(voc, v.chords, key);
  $('#chordWho').textContent = `${v.id} · ${v.name} · ${C.KEYS[key].name}`;
  const opt = c => C.CHORD_GROUPS.map((g, gi) => `<optgroup label="${g}">${C.CHORD_POOL.filter(d => d.g === gi).map(d => `<option value="${d.r}${d.q}" ${d.r === c.r && d.q === c.q ? 'selected' : ''}>${C.chordName(d, key)} · ${d.name}${d.label ? ' (' + d.label + ')' : ''}</option>`).join('')}</optgroup>`).join('');
  const list = v.chords.map((c, i) => [c, i]).filter(([c]) => c.s >= 0);
  // 마디마다 한 칸 — 그 안에 코드가 여럿이면 나란히
  const bars = new Map(); list.forEach(([c, i]) => { const b = Math.floor(c.s / C.BAR); if (!bars.has(b)) bars.set(b, []); bars.get(b).push([c, i]); });
  box.innerHTML = [...bars.entries()].map(([b, cs]) => `<div class="cbar ${cs.length > 1 ? 'multi' : ''}"><span class="cb-n">${b + 1}마디</span><div class="cb-cs">${cs.map(([c, i], j) => {
    const f = fit[i], lvl = f == null ? '' : f >= .6 ? 'good' : f >= .35 ? 'mid' : 'low';
    const beat = ((c.s % C.BAR) + C.BAR) % C.BAR / 4 + 1, dg = C.chordDeg(c);
    const nx = v.chords[i + 1], canMerge = nx && Math.floor(nx.s / C.BAR) === b;
    return `<label class="cc ${lvl} ${dg && dg.g ? 'ext g' + dg.g : ''}">${cs.length > 1 || c.d < C.BAR ? `<span>${beat}박~</span>` : ''}<select data-ci="${i}" aria-label="${b + 1}마디 ${beat}박 코드">${opt(c)}</select><i title="노래 음 가운데 화음음 비율">${f == null ? '쉼' : Math.round(f * 100) + '%'}</i><span class="cc-tools">${c.d >= 8 ? `<button type="button" data-split="${i}" title="이 코드를 반으로 나눠 코드 둘로">나누기</button>` : ''}${canMerge ? `<button type="button" data-merge="${i}" title="다음 코드와 하나로 합치기">합치기</button>` : ''}</span></label>`;
  }).join('')}</div></div>`).join('');
}
// 코드를 바꾼 뒤: 자동 편곡은 반주를 다시, 수노 편곡은 재료로 다시 계산(편성 엔진)
function afterChords(v, i) {
  v.userChords = true;
  if (v.source === 'auto') rebuildParts(v, S.melody);
  else if (v.src) orchSuno(v);
  else toast('수노 파트는 그대로 두고 코드 이름만 바꿨어요');
  if (S.arr.nv && S.arr.nv.of === v.id) S.arr.nv = null;
  save(); versionsUI(); if (U.edVer === v.id) ed6.render();
  if (i != null && v.chords[i]) playChord(v.chords[i], v.key || S.key);
}
$('#chordBox').addEventListener('change', e => {
  const sel = e.target.closest('select[data-ci]'); if (!sel) return;
  const v = chordVer(); if (!v) return;
  const d = C.CHORD_POOL.find(x => x.r + x.q === sel.value), i = +sel.dataset.ci, c = v.chords[i];
  v.chords[i] = C.makeChord(d.r, d.q, c.s, c.d, v.key || S.key);
  afterChords(v, i);
});
$('#chordBox').addEventListener('click', e => {
  const b = e.target.closest('[data-split],[data-merge]'); if (!b) return;
  e.preventDefault();
  const v = chordVer(); if (!v) return;
  const key = v.key || S.key;
  if (b.dataset.split != null) { // 한 코드를 반으로: 같은 코드 둘(뒤쪽을 바꿔 쓰면 한 마디에 코드 둘)
    const i = +b.dataset.split, c = v.chords[i], h = c.d / 2;
    v.chords.splice(i, 1, C.makeChord(c.r, c.q, c.s, h, key), C.makeChord(c.r, c.q, c.s + h, h, key));
    afterChords(v, null); toast(`${Math.floor(c.s / C.BAR) + 1}마디 코드를 둘로 나눴어요 — 뒤쪽 코드를 골라 바꿔요`);
  } else {
    const i = +b.dataset.merge, c = v.chords[i], n = v.chords[i + 1];
    v.chords.splice(i, 2, C.makeChord(c.r, c.q, c.s, c.d + n.d, key));
    afterChords(v, i);
  }
});
$('#hRange').onchange = e => { S.arr.settings.range = e.target.value; save(); chipsGroup($('#optRange'), C.CHORD_RANGE, S.arr.settings.range); };
$('#hPer').onchange = e => { S.arr.settings.perBar = e.target.value; save(); chipsGroup($('#optPer'), { auto: '편곡마다 다르게', ...C.CHORD_PER }, String(S.arr.settings.perBar)); };
// 이 설정으로 코드 다시 붙이기(고른 편곡 하나)
$('#reHarm').onclick = () => {
  const v = chordVer(); if (!v) return toast('편곡을 먼저 만들어요');
  const st = S.arr.settings;
  if (v.source === 'auto') { v.settings = { ...v.settings, range: st.range, perBar: st.perBar }; v.userChords = false; rebuildParts(v, S.melody); }
  else { const p = sunoPitched(v); v.chords = C.harmonize(p.length ? p : S.melody, v.bars, v.key || S.key, harmOpts()); v.userChords = false; if (v.src) orchSuno(v); }
  if (S.arr.nv && S.arr.nv.of === v.id) S.arr.nv = null;
  save(); versionsUI(); if (U.edVer === v.id) ed6.render();
  const ext = v.chords.filter(c => { const d = C.chordDeg(c); return d && d.g; }).length;
  toast(`코드를 다시 붙였어요 · ${v.chords.length}개${ext ? ` (관계조·부속화음 ${ext}개)` : ''}`);
};
function rebuildParts(v, melody) {
  const r = C.arrange(melody, S.lyrics, S.key, v.settings, v.variant, v.userChords ? v.chords : null);
  r.parts.forEach(p => { const o = v.parts.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
  v.parts = r.parts; v.chords = r.chords; v.bars = r.bars; v.intro = r.intro; v.sections = r.sections;
  return r;
}
function playChord(c, key) {
  const ctx = SND.audio(), vs = C.voicing(c, C.KEYS[key].tonic, 62);
  vs.forEach(p => SND.voice(ctx, SND.master, 'keys', p, ctx.currentTime + .02, .7, .6));
}
$('#resetChords').onclick = () => {
  const v = chordVer(); if (!v || v.source !== 'auto') return toast('자동 편곡에서만 처음 코드로 돌릴 수 있어요');
  v.userChords = false; rebuildParts(v, S.melody); save(); versionsUI(); ed6.render(); toast('처음 만든 코드로 돌렸어요');
};
// 수노 MIDI — 끌어다 놓으면 박을 맞춘(퀀타이즈) 악보로 바로
function guessPart(name, tr) {
  const stem = MIDI.stemName(name) || '';
  const n = (stem + ' ' + name + ' ' + (tr.name || '')).toLowerCase();
  if (/backing|harmony|백보컬|코러스/.test(n)) return 'skip'; // 수노 Backing Vocals: 노래 파트는 하나만
  if (/\bfx\b|effect|효과/.test(n)) return 'skip';
  if (tr.ch === 9 || /drum|perc|kick|snare|드럼|타악/.test(n)) return 'drums';
  if (/vocal|voice|vox|sing|lead|melody|보컬|노래/.test(n)) return 'melody';
  if (/bass|베이스/.test(n)) return 'bass';
  if (/guitar|gtr|기타/.test(n)) return 'guitar';
  if (/string|violin|cello|orch|스트링/.test(n)) return 'strings';
  if (/flute|wood|플루트/.test(n)) return 'flute';
  if (/brass|horn|sax|trumpet|관악/.test(n)) return 'brass';
  return 'keys';
}
const PARTOPT = { melody: '노래', drums: '드럼', bass: '베이스기타', guitar: '기타', keys: '키보드', strings: '스트링', flute: '플루트', brass: '관악기', skip: '빼기' };
const DKIT = p => (p === 35 || p === 36 ? 'kick' : [37, 38, 39, 40].includes(p) ? 'snare' : [49, 51, 52, 55, 57].includes(p) ? 'crash' : 'hat');
const PROF = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
function detectKey(notes) {
  const h = Array(12).fill(0); notes.forEach(n => { h[C.pc(n.p)] += n.d || 1; });
  let best = 'C', bs = -1e9;
  for (const [k, info] of Object.entries(C.KEYS)) { let sc = 0; for (let i = 0; i < 12; i++) sc += h[(i + info.tonic) % 12] * PROF[i]; if (sc > bs) { bs = sc; best = k; } }
  return best;
}
function autoSlot() {
  const ids = ['A', 'B', 'C'];
  return ids.find(id => !S.arr.versions.some(v => v.id === id)) || ids.find(id => S.arr.versions.find(v => v.id === id).source !== 'suno') || 'C';
}
const fmtBpm = b => String(Math.round(b * 10) / 10);
// 노래가 시작하는 마디(맞춤 단위의 8분음표 자리로 반올림해 살짝 이른 첫 음도 그 마디로)
function autoVstart() {
  const c = U.suno.cfg, voc = U.suno.tracks.filter(t => t.part === 'melody').flatMap(t => t.notes);
  if (!voc.length) return 0;
  const beat = 60 / c.bpm, first = Math.min(...voc.map(n => n.t));
  return Math.max(0, Math.floor(Math.round((first - (c.off || 0)) / beat * 2) / 2 / 4 + 1e-6));
}
// 마디 첫 박 찾기: 수노 MIDI는 첫 마디가 박 몇 개 밀려 시작하기도 한다 — 크래시·긴 음·베이스·큰북/작은북이 모이는 자리를 1박으로
function autoPhase() {
  const c = U.suno.cfg, beat = 60 / c.bpm, sc = [0, 0, 0, 0];
  let first = Infinity;
  U.suno.tracks.filter(t => t.part !== 'skip').forEach(t => t.notes.forEach(n => {
    const b = (n.t - (c.off || 0)) / beat; first = Math.min(first, b);
    const rb = Math.round(b); if (Math.abs(b - rb) > .2) return; // 박 위의 음만
    const at = ((rb % 4) + 4) % 4;
    if (t.part === 'drums') {
      if ([49, 52, 55, 57].includes(n.p)) sc[at] += 4; // 크래시: 마디 첫 박
      else if (n.p === 35 || n.p === 36) { sc[at] += .5; sc[(at + 2) % 4] += .5; } // 큰북: 1·3박
      else if (n.p >= 37 && n.p <= 40) { sc[(at + 3) % 4] += .6; sc[(at + 1) % 4] += .6; } // 작은북: 2·4박
      return;
    }
    const w = Math.min(4, n.d / beat) * (t.part === 'bass' ? 1.5 : 1); // 긴 음·베이스는 마디 첫 박에 많다
    sc[at] += w; sc[(at + 2) % 4] += w * .4;
  }));
  let k = 0; for (let i = 1; i < 4; i++) if (sc[i] > sc[k]) k = i;
  if (!k || sc[k] < sc[0] * 1.08) return { k: 0, off: c.off || 0 };
  const early = first < k - .25; // 첫 박 앞에 음이 있으면 잘라 내지 않고 한 마디를 앞에 둔다
  return { k, early, off: (c.off || 0) + (early ? k - 4 : k) * beat };
}
async function importSuno(fileList) {
  let files = [...fileList];
  const zips = files.filter(f => /\.zip$/i.test(f.name) || /zip/.test(f.type));
  files = files.filter(f => !zips.includes(f));
  for (const z of zips) { try { files.push(...await MIDI.unzipMidi(z)); } catch (x) { toast(`${z.name}: 압축을 풀지 못했어요`); } }
  files = files.filter(f => /\.midi?$/i.test(f.name) || /midi/.test(f.type));
  if (!files.length) return toast('MIDI 파일(.mid)이나 수노에서 받은 압축 파일(.zip)을 넣어 주세요');
  const lead = f => { const n = (MIDI.stemName(f.name) || f.name).toLowerCase(); return /vocal|voice|vox|lead|melody|보컬|노래/.test(n) && !/backing|harmony|백보컬|코러스/.test(n) ? 0 : 1; };
  files.sort((a, b) => lead(a) - lead(b) || a.name.localeCompare(b.name));
  const parsed = [];
  for (const f of files) {
    try { parsed.push({ f, m: MIDI.parseMidi(await f.arrayBuffer()) }); }
    catch (x) { toast(`${f.name}: ${x.message || '읽을 수 없는 파일'}`); }
  }
  if (!parsed.length) return;
  const fileBpm = MIDI.retimeAll(parsed.map(x => x.m)) || S.tempo; // 모든 스템을 한 시간 축(박)에
  const tracks = [];
  parsed.forEach(({ f, m }) => MIDI.stemTracks(f.name, m).forEach(tr => tracks.push({ file: f.name, name: tr.name, notes: tr.notes, ch: tr.ch, program: tr.program, merged: tr.merged || 1, dropped: tr.dropped || 0, part: guessPart(f.name, tr) })));
  if (!tracks.length) return toast('MIDI에 음표가 없어요');
  let seen = false; tracks.forEach(t => { if (t.part === 'melody') { if (seen) t.part = 'flute'; seen = true; } });
  if (!seen) { const c = tracks.filter(t => t.part !== 'drums' && t.part !== 'skip').map(t => ({ t, avg: t.notes.reduce((a, n) => a + n.p, 0) / t.notes.length })).sort((x, y) => y.avg - x.avg)[0]; if (c) c.t.part = 'melody'; }
  U.suno = { tracks, files: parsed.length, cfg: { bpm: fileBpm, fileBpm, grid: U.suno.cfg ? U.suno.cfg.grid : 2, off: 0, clean: true, vstart: 0, vstartSet: false }, slot: $('#sSlot').value === 'auto' ? autoSlot() : $('#sSlot').value };
  const ph = autoPhase(); U.suno.cfg.off = Math.round(ph.off * 1000) / 1000; U.suno.cfg.phase = ph.k; U.suno.cfg.early = !!ph.early;
  buildSuno(true);
}
function buildSuno(first) {
  const t = U.suno.tracks.filter(x => x.part !== 'skip'); if (!t.length) return toast('가져올 트랙이 없어요');
  const cfg = U.suno.cfg;
  if (!cfg.vstartSet) cfg.vstart = autoVstart();
  const { bpm, grid, off, clean } = cfg;
  const barSec = 240 / bpm, beat = 60 / bpm;
  const end = Math.max(...t.flatMap(x => x.notes.map(n => n.t + n.d)));
  const bars = Math.min(200, Math.max(2, Math.ceil((end - off) / barSec)));
  const keep = n => !clean || n.d >= beat * grid / 4 * .45; // 잔음 정리: 맞춤 단위의 절반보다 짧은 음은 뺀다
  const melNotes = []; const parts = [];
  t.forEach(tr => {
    if (tr.part === 'melody') { melNotes.push(...tr.notes.filter(keep)); return; } // 노래로 고른 트랙은 모두 합쳐 한 줄로
    if (tr.part === 'drums') {
      const raw = MIDI.stemToNotes(tr.notes, bpm, off, grid, 0, bars, false);
      const by = new Map();
      raw.forEach(n => { if (!by.has(n.s)) by.set(n.s, new Set()); (n.chord || [n.p]).map(DKIT).forEach(k => by.get(n.s).add(k)); });
      const ss = [...by.keys()].sort((x, y) => x - y);
      parts.push({ id: 'drums' + parts.length, name: '드럼', inst: 'drums', clef: 'perc', src: tr.name, notes: ss.map((s, i) => ({ s, d: Math.min((ss[i + 1] ?? bars * C.BAR) - s, 4), p: 36, kit: [...by.get(s)] })) });
      return;
    }
    const mono = ['bass', 'flute'].includes(tr.part);
    const notes = MIDI.stemToNotes(tr.notes.filter(keep), bpm, off, grid, 0, bars, mono);
    const info = C.INSTS[tr.part];
    parts.push({ id: tr.part + parts.length, name: info.name, inst: tr.part, clef: tr.part === 'bass' ? 'bass' : 'treble', src: tr.name, program: tr.program ?? undefined, notes: notes.map(n => ({ p: n.p, s: n.s, d: n.d, chord: n.chord })) });
  });
  // 같은 악기가 둘 이상이면 스템 이름을 붙여 구별(예: 키보드·Synth)
  parts.forEach(p => { if (parts.filter(q => q.inst === p.inst).length > 1 && p.src) p.name = `${p.name}·${p.src}`; });
  const vocal = melNotes.length ? MIDI.stemToNotes(melNotes, bpm, off, grid, 0, bars, true).map(n => ({ id: C.uid(), p: n.p, s: n.s, d: n.d, lx: 'n' })) : null;
  parts.sort((x, y) => C.INST_ORDER.indexOf(x.inst) - C.INST_ORDER.indexOf(y.inst));
  const pitched = [...(vocal || []), ...parts.filter(p => p.inst !== 'drums').flatMap(p => p.notes.flatMap(n => (n.chord || [n.p]).map(q => ({ p: q, s: n.s, d: n.d }))))];
  const key = detectKey(pitched.length ? pitched : S.melody);
  const chords = C.harmonize(pitched.length ? pitched : S.melody, bars, key, harmOpts());
  const slot = U.suno.slot;
  const prev = S.arr.versions.find(x => x.id === slot);
  const name = $('#sName').value.trim() || (prev && prev.source === 'suno' ? prev.name : `수노 편곡 ${slot}`);
  // 수노 스템은 그대로 쓰지 않고 '재료'로 모아 우리 편성에 맞게 다시 계산한다
  const src = {};
  parts.forEach(p => { const k = p.inst === 'drums' ? 'drums' : p.inst; (src[k] = src[k] || []).push(...p.notes); });
  const v = { id: slot, source: 'suno', name, parts: [], src, vocal: vocal || [], chords, bars, vstart: cfg.vstart, bpm: Math.round(bpm), key, grid };
  orchSuno(v);
  S.arr.versions = [...S.arr.versions.filter(x => x.id !== slot), v].sort((x, y) => x.id.localeCompare(y.id));
  if (S.arr.chosen === slot) { S.base = clone(S.melody); S.decisions = {}; S.log = []; }
  U.edVer = slot; save(); versionsUI(); sunoUI(); showEditor6();
  const G = { 1: '16분음표', 2: '8분음표', 4: '4분음표' }[grid];
  const merged = U.suno.tracks.reduce((a, x) => a + (x.merged || 1), 0);
  let long = !cfg.halved && bpm > 108 && vocal && vocal.length ? ' <em class="s-tip">가사 한 줄이 4마디로 길게 나오면 맞춤 설정에서 <b>÷2</b>를 눌러요</em>' : '';
  if (melNotes.length) { // 노래 첫 음이 박 사이(반 박)에 걸려 있으면 첫 박 위치를 알려 준다
    const fb = (Math.min(...melNotes.map(n => n.t)) - off) / beat, fr = fb - Math.floor(fb);
    if (fr > .35 && fr < .65) long += ' <em class="s-tip">노래 첫 음이 박과 박 사이에 있어요 — 맞춤 설정의 첫 박 위치 <b>◀ 반 박</b>(또는 <b>반 박 ▶</b>)으로 맞춰 보세요</em>';
  }
  if (first && cfg.phase) long += ` <em class="s-tip ok">수노 MIDI의 마디가 ${cfg.phase}박 밀려 있어서, 크래시·큰북·긴 음이 모이는 자리를 1박으로 맞췄어요${cfg.early ? ' — 첫 박 앞에 나오는 음이 있어 그 앞에 한 마디를 두었어요' : ''}. 다르게 들리면 악보 편집의 <b>◀ 한 박 · 한 박 ▶</b>으로 고쳐요</em>`;
  $('#sMsg').innerHTML = `<b>✓ ${slot} 칸에 악보로 넣었어요</b> · ${G} 단위로 박 맞춤 · ${bars}마디 · ♩=${fmtBpm(bpm)} · ${C.KEYS[key].name} · 노래 ${vocal ? vocal.length + '음' : '없음'}(${cfg.vstart + 1}마디부터) · 파트 ${parts.length}개${merged > U.suno.tracks.length ? ` · 쪼개진 트랙 ${merged}개를 스템 ${U.suno.tracks.length}개로 합침` : ''}${long}`;
  if (first) { toast('수노 MIDI를 박에 맞춘 악보로 바꿨어요 — 음표를 눌러 고쳐요'); setTimeout(() => $('#edCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
}
const harmOpts = () => { const st = S.arr.settings; return { pool: ['I', 'ii', 'iii', 'IV', 'V', 'vi'], range: st.range || 'far', perBar: st.perBar && st.perBar !== 'auto' ? +st.perBar : 1 }; };
const isDrum = p => p.inst === 'drums' || p.drum;
// 수노 편곡의 노래·재료 음 → 코드 다시 붙이기
function sunoPitched(v) {
  const src = v.src ? Object.entries(v.src).filter(([k]) => k !== 'drums').flatMap(([, ns]) => ns) : v.parts.filter(p => !isDrum(p)).flatMap(p => p.notes);
  return [...(v.vocal || []), ...src.flatMap(n => (n.chord || [n.p]).map(q => ({ p: q, s: n.s, d: n.d })))];
}
// 저장된 수노 편곡을 박 단위로 옮기기(MIDI 파일 없이도) — u: 16분음표 칸(−면 앞으로). 앞으로 옮기다 음이 잘리면 한 마디를 앞에 둔다
function shiftVer(v, u) {
  const all = [...(v.vocal || []), ...(v.src ? Object.values(v.src).flat() : v.parts.flatMap(p => p.notes))];
  if (!all.length) return toast('옮길 음표가 없어요');
  const first = Math.min(...all.map(n => n.s));
  const d = first + u < 0 ? u + C.BAR : u;
  const mv = ns => (ns || []).map(n => ({ ...n, s: n.s + d })).filter(n => n.s >= 0);
  v.vocal = mv(v.vocal);
  if (v.src) Object.keys(v.src).forEach(k => { v.src[k] = mv(v.src[k]); });
  else v.parts.forEach(p => { p.notes = mv(p.notes); p.dyn = (p.dyn || []).map(x => ({ ...x, s: Math.max(0, x.s + d) })); p.tech = (p.tech || []).map(x => ({ ...x, s: Math.max(0, x.s + d) })); });
  const end = Math.max(...[...(v.vocal || []), ...(v.src ? Object.values(v.src).flat() : v.parts.flatMap(p => p.notes))].map(n => n.s + n.d));
  v.bars = Math.min(200, Math.max(2, Math.ceil(end / C.BAR)));
  if (v.vocal && v.vocal.length) v.vstart = Math.max(0, Math.floor(Math.round(Math.min(...v.vocal.map(n => n.s)) / 2) * 2 / C.BAR));
  const p = sunoPitched(v);
  v.chords = C.harmonize(p.length ? p : S.melody, v.bars, v.key || S.key, harmOpts()); v.userChords = false;
  if (v.src) orchSuno(v);
  else v.sections = v.vstart ? [{ bar: 0, s: 0, name: 'Intro' }, { bar: v.vstart, s: v.vstart * C.BAR, name: 'Verse' }] : [{ bar: 0, s: 0, name: 'Verse' }];
  if (S.arr.chosen === v.id) { S.base = clone(S.melody); S.decisions = {}; S.log = []; }
  S.arr.nv = null;
  return d;
}
function orchSuno(v) {
  const vs = v.vstart || 0, end = v.bars * C.BAR;
  const sections = vs ? [{ bar: 0, s: 0, name: 'Intro' }, { bar: vs, s: vs * C.BAR, name: 'Verse' }] : [{ bar: 0, s: 0, name: 'Verse' }];
  const old = v.parts || [];
  v.parts = ORCH.orchestrate({ melody: v.vocal || [], chords: v.chords, key: v.key, bars: v.bars, start: 0, end, intro: 0, sections, lead: [], genre: S.arr.settings.genre, mood: S.arr.settings.mood, ens: S.arr.settings.ens, sources: v.src });
  v.parts.forEach(p => { const o = old.find(x => x.id === p.id); if (o) { p.mute = o.mute; p.vol = o.vol; } });
  v.sections = sections;
}
function sunoUI() {
  const has = U.suno.tracks && U.suno.tracks.length, cfg = U.suno.cfg || { grid: 2 };
  $$('#sGridSel button').forEach(b => b.classList.toggle('on', +b.dataset.g === (cfg.grid || 2)));
  $('#sAdvBody').hidden = !has; $('#sAdvNone').hidden = !!has;
  if (!has) return;
  $('#sTracks').innerHTML = `<table><thead><tr><th>스템(파일)</th><th>트랙</th><th>음</th><th>파트</th></tr></thead><tbody>${U.suno.tracks.map((x, i) => `<tr><td>${esc(MIDI.stemName(x.file) || x.file)}</td><td>${x.merged > 1 ? `${x.merged}개 합침` : esc(x.name || '—')}${x.dropped ? ` <small>(${x.dropped}개 뺌)</small>` : ''}</td><td>${x.notes.length}</td><td><select data-ti="${i}">${Object.entries(PARTOPT).map(([k, v]) => `<option value="${k}" ${x.part === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
  if (document.activeElement !== $('#sBpm')) $('#sBpm').value = fmtBpm(cfg.bpm);
  $('#sBpmInfo').textContent = cfg.fileBpm ? `MIDI ♩=${fmtBpm(cfg.fileBpm)}` : '';
  if (document.activeElement !== $('#sBar')) $('#sBar').value = (cfg.vstart || 0) + 1;
  $('#sBarAuto').hidden = !cfg.vstartSet;
  $('#sOff').value = cfg.off || 0; $('#sClean').checked = cfg.clean !== false;
}
let sunoT = null;
function sunoRe() { clearTimeout(sunoT); sunoT = setTimeout(() => { if (U.suno.tracks && U.suno.tracks.length) buildSuno(false); }, 250); }
$('#sTracks').addEventListener('change', e => { const s = e.target.closest('select[data-ti]'); if (s) { U.suno.tracks[+s.dataset.ti].part = s.value; sunoRe(); } });
$('#sGridSel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  U.suno.cfg = { ...(U.suno.cfg || {}), grid: +b.dataset.g };
  $$('#sGridSel button').forEach(x => x.classList.toggle('on', x === b));
  if (U.suno.tracks && U.suno.tracks.length) buildSuno(false); else toast('MIDI 파일을 넣으면 이 단위로 박을 맞춰요');
});
$('#sBpm').addEventListener('input', () => { if (!U.suno.cfg) return; const v = +$('#sBpm').value; if (v >= 20 && v <= 300) { U.suno.cfg.bpm = v; sunoRe(); } });
// ÷2·×2: 빠르기를 정확히 반·두 배로(박이 한 칸도 밀리지 않게)
['sHalf', 'sDouble'].forEach(id => $('#' + id).addEventListener('click', () => {
  const c = U.suno.cfg; if (!c || !U.suno.tracks.length) return toast('MIDI 파일을 먼저 넣어요');
  c.bpm = id === 'sHalf' ? c.bpm / 2 : c.bpm * 2; c.halved = true;
  $('#sBpm').value = fmtBpm(c.bpm); sunoRe();
  toast(id === 'sHalf' ? `♩=${fmtBpm(c.bpm)} — 한 마디가 두 배로 길어져요` : `♩=${fmtBpm(c.bpm)} — 한 마디가 반으로 짧아져요`);
}));
$('#sOff').addEventListener('input', () => { if (!U.suno.cfg) return; U.suno.cfg.off = +$('#sOff').value || 0; sunoRe(); });
// 첫 박 옮기기: 반 박씩(모든 파트의 박 자리가 함께 옮겨진다)
[['sOffL', -.5], ['sOffR', .5], ['sOffL4', -1], ['sOffR4', 1]].forEach(([id, bt]) => $('#' + id).addEventListener('click', () => {
  const c = U.suno.cfg; if (!c || !U.suno.tracks.length) return toast('MIDI 파일을 먼저 넣어요');
  c.off = Math.round(((c.off || 0) + bt * 60 / c.bpm) * 1000) / 1000; c.phase = 0;
  $('#sOff').value = c.off; sunoRe();
}));
$('#sBar').addEventListener('input', () => { if (!U.suno.cfg) return; U.suno.cfg.vstart = Math.max(0, (+$('#sBar').value || 1) - 1); U.suno.cfg.vstartSet = true; $('#sBarAuto').hidden = false; sunoRe(); });
$('#sBarAuto').addEventListener('click', () => { if (!U.suno.cfg) return; U.suno.cfg.vstartSet = false; sunoRe(); });
$('#sClean').addEventListener('change', () => { if (!U.suno.cfg) return; U.suno.cfg.clean = $('#sClean').checked; sunoRe(); });
$('#sMidi').onchange = e => { importSuno(e.target.files); e.target.value = ''; };
const drop = $('#sDrop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => importSuno(e.dataTransfer.files));
document.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(i => i.kind === 'file')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (e.target.closest('#sDrop')) return;
  const fs = [...(e.dataTransfer.files || [])]; if (!fs.some(f => /\.(midi?|zip)$/i.test(f.name))) return;
  e.preventDefault(); U.tab = 'suno'; go(6); importSuno(fs);
});
$('#sAudio').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const slot = $('#sSlot').value === 'auto' ? (U.edVer || autoSlot()) : $('#sSlot').value;
  if (U.audio[slot]) URL.revokeObjectURL(U.audio[slot]);
  U.audio[slot] = URL.createObjectURL(f); toast(`${slot} 칸에 수노 음원을 붙였어요 (이 기기에서만)`); versionsUI();
};
// 악보 편집(6단계)
const ed6 = createEditor($('#ed6'), {
  model: () => {
    const v = S.arr.versions.find(x => x.id === U.edVer); if (!v) return null;
    const voices = [];
    const ch = v.chords ? v.chords.map(c => ({ s: c.s, name: c.name })) : null;
    if (v.vocal && v.vocal.length) voices.push({ id: 'V', name: v.source === 'suno' ? '노래(수노)' : '노래(편곡)', sub: 'Voc.', clef: 'treble', notes: v.vocal, editable: true, inst: 'melody', lyricsTarget: true, chords: ch, lyrics: noteLyrics(v.vocal) });
    v.parts.forEach((p, i) => voices.push(partVoice(p, i, true, !voices.length && i === 0 ? ch : null, ch)));
    const suno = v.source === 'suno';
    return { tempo: v.bpm || S.tempo, key: v.key || S.key, bars: v.bars || totalBars(), perLine: 4, voices, intro: suno ? 0 : v.intro || 0, sections: v.sections, ...(suno ? { pickup: 0 } : {}), start: suno ? 0 : -(v.intro ? v.intro * C.BAR : S.pickup || 0) };
  },
  // 타이프 인 스코어: 편곡 노래 음표마다 글자(영어 붙임표 'hap-' · 늘임 '_')
  lyric: { get: (v, n) => n.ly || '', set: (v, n, t) => { if (t) n.ly = t; else delete n.ly; }, hyphen: true },
  printTitle: () => S.title || '우리 노래',
  printHeader: () => { const v = S.arr.versions.find(x => x.id === U.edVer); return { credit: [S.group, v ? `${v.id} · ${v.name}` : ''].filter(Boolean).join(' · '), style: `${STYLE[S.arr.settings.genre] || 'Pop'}` }; },
  onChange: () => { save(); versionsUI(); },
  onPlay: (at, btn, sp = 1) => { const v = S.arr.versions.find(x => x.id === U.edVer); if (v) playWith(btn, verTracks(v, v.vocal), { from: at, tempo: (v.bpm || S.tempo) * sp }); },
  toast, staffwidth: 1000,
});
// 파트 → 악보 성부(편성 정보 그대로)
function partVoice(p, i, editable, chords = null, allCh = null) {
  return { id: 'P' + i, name: p.name, sub: p.sub, clef: p.clef, notes: p.notes, drum: isDrum(p), disp: p.disp, trans: p.trans, slash: p.slash, group: p.group, band: true, dyn: p.dyn, tech: p.tech, editable, inst: p.inst, chords: chords || (p.slash ? allCh : null), lockMsg: '수노 파트는 6단계 악보 편집에서 고쳐요' };
}
// 음표마다 적은 가사(ly) → 악보 가사 줄
function noteLyrics(ns) {
  if (!ns || !ns.some(n => n.ly)) return null;
  const map = new Map(); ns.forEach(n => { if (!n.ly || !n.id) return; map.set(n.id, n.ly === '_' ? { text: '', kind: 'ext' } : { text: n.ly.replace(/-$/, ''), kind: 'syl', hy: /-$/.test(n.ly) }); });
  return { map };
}
function showEditor6() {
  const v = S.arr.versions.find(x => x.id === U.edVer);
  $('#edCard').hidden = !v; if (!v) return;
  $('#edName').textContent = `${v.id} · ${v.name}`;
  $('#etShift').hidden = v.source !== 'suno';
  keyCtl($('#etKey'), v.source === 'suno' ? v.key || S.key : S.key);
  $('#edPick').innerHTML = S.arr.versions.map(x => `<button type="button" data-edv="${x.id}" class="${x.id === v.id ? 'on' : ''}">${x.id}</button>`).join('');
  ed6.render();
}
// 악보 편집 도구 줄: 박 옮기기(수노) · 조옮김
$('#etShift').addEventListener('click', e => {
  const b = e.target.closest('[data-sh]'); if (!b) return;
  const v = S.arr.versions.find(x => x.id === U.edVer); if (!v || v.source !== 'suno') return;
  const u = +b.dataset.sh;
  if (U.suno.tracks && U.suno.tracks.length && U.suno.slot === v.id && U.suno.cfg) { // MIDI가 아직 열려 있으면 원본에서 다시
    const c = U.suno.cfg; c.off = Math.round(((c.off || 0) - u / 4 * 60 / c.bpm) * 1000) / 1000; c.phase = 0; $('#sOff').value = c.off; buildSuno(false);
  } else { const d = shiftVer(v, u); if (d == null) return; ed6.clear(); save(); versionsUI(); showEditor6(); if (d !== u) toast('앞으로 옮기면 첫 음이 잘려서, 한 마디를 앞에 두고 옮겼어요'); }
  toast(`모든 파트를 ${Math.abs(u) / 4}박 ${u < 0 ? '앞으로' : '뒤로'} 옮겼어요`);
});
// 조옮김 도구: 12개 장조 + 반음 ▲▼ (곡 전체 — 내 선율·자동 편곡·수노 편곡을 함께)
function keyCtl(box, cur) {
  if (!box) return;
  box.innerHTML = `<span class="et-l">조옮김</span><button type="button" data-tr="-1" title="곡 전체를 반음 내리기">반음 ▼</button><select data-keysel aria-label="조성">${C.KEY_ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${C.KEYS[k].name} (${k.replace('b', '♭').replace('#', '♯')})</option>`).join('')}</select><button type="button" data-tr="1" title="곡 전체를 반음 올리기">반음 ▲</button>`;
  box.dataset.cur = cur;
}
function transposeSong(sh, toKey) {
  if (!sh) return;
  const old = S.key, ev = S.arr.versions.find(x => x.id === U.edVer);
  const ref = ev && ev.source === 'suno' && U.step === 6 ? ev.key || old : old; // 보고 있는 악보의 조를 기준으로
  S.key = toKey && ref === old ? toKey : C.shiftKey(old, sh);
  transposeAll(sh, old, ev && ev.source === 'suno' && U.step === 6 ? toKey : null);
  toast(`곡 전체를 ${sh > 0 ? '반음 ' + sh + '개 위로' : '반음 ' + -sh + '개 아래로'} 옮겼어요 — ${C.KEYS[toKey || S.key].name}`);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.et-key [data-tr]'); if (!b) return;
  const cur = b.closest('.et-key').dataset.cur || S.key, d = +b.dataset.tr;
  transposeSong(d, C.shiftKey(cur, d));
});
document.addEventListener('change', e => {
  const sel = e.target.closest('.et-key [data-keysel]'); if (!sel) return;
  const cur = sel.closest('.et-key').dataset.cur || S.key, to = sel.value; if (to === cur) return;
  const sh = C.keyShift(cur, to); if (!sh) { // 딴이름한소리조(올림바 ↔ 내림사): 음은 그대로, 조표만
    S.key = S.key === cur ? to : S.key; S.arr.versions.forEach(v => { if (v.key === cur) { v.key = to; if (v.chords) v.chords = v.chords.map(c => ({ ...c, name: C.chordName(c, to) })); } }); save(); refresh(); return;
  }
  transposeSong(sh, to);
});
$('#edPick').addEventListener('click', e => { const b = e.target.closest('[data-edv]'); if (!b) return; U.edVer = b.dataset.edv; ed6.clear(); showEditor6(); });

// ── 7 비교·수정 ──
const vOff = v => (v && v.source === 'suno' ? (v.vstart || 0) * C.BAR : 0);
const shiftN = (ns, off, keep = 0) => off ? ns.map(n => ({ ...n, s: n.s - off })).filter(n => n.s >= -keep) : ns;
const sunoIntro = v => Math.min(4, (v && v.vstart) || 0);
const alignedVocal = v => shiftN(v.vocal || [], vOff(v));
const alignedParts = v => vOff(v) ? v.parts.map(p => ({ ...p, notes: shiftN(p.notes, vOff(v), sunoIntro(v) * C.BAR), dyn: (p.dyn || []).map(d => ({ ...d, s: d.s - vOff(v) })), tech: (p.tech || []).map(d => ({ ...d, s: d.s - vOff(v) })) })) : v.parts;
const alignedChords = v => v.chords ? shiftN(v.chords, vOff(v), sunoIntro(v) * C.BAR) : null;
function diffs() { const v = chosen(); if (!v || !S.base) return []; return C.diffBars(S.base, alignedVocal(v), totalBars()); }
const BANK = ['빠르기', '셈여림', '음색', '리듬', '화음', '짜임새', '구성', '센박', '말맛', '또렷하게'];
function r7() {
  const v = chosen();
  $$('.vlab').forEach(x => { x.textContent = vlab(v) === 'AI' ? 'AI' : '편곡'; });
  $('.vlab2').textContent = vlab(v) === 'AI' ? 'AI가' : '편곡이';
  if (!v) { $('#cmpBody').hidden = true; $('#cmpEmpty').hidden = false; $('#cmpEmpty').innerHTML = '<h2>아직 고른 편곡이 없어요</h2><p>6단계에서 편곡 3가지를 끝까지 듣고 하나를 골라 주세요.</p><button class="btn" type="button" id="to6">6단계로 가기</button>'; $('#to6').onclick = () => go(6); return; }
  if (!S.base) S.base = clone(S.melody);
  const ds = diffs();
  if (!ds.length) { $('#cmpBody').hidden = true; $('#cmpEmpty').hidden = false; $('#cmpEmpty').innerHTML = `<h2>바뀐 마디가 없어요</h2><p>${esc(v.name)}은 내 선율을 그대로 썼어요. 다른 편곡을 골라 비교하거나 8단계로 가서 총보를 완성해요.</p><button class="btn" type="button" id="to8">8단계로 가기</button>`; $('#to8').onclick = () => go(8); return; }
  $('#cmpBody').hidden = false; $('#cmpEmpty').hidden = true;
  if (U.bar == null || !ds.some(d => d.bar === U.bar)) U.bar = (ds.find(d => !S.decisions[d.bar]) || ds[0]).bar;
  $('#barTabs').innerHTML = ds.map(d => { const dc = S.decisions[d.bar]; return `<button type="button" data-bar="${d.bar}" class="${d.bar === U.bar ? 'on' : ''} ${dc ? 'done ' + dc.choice : ''}"><b>${d.bar + 1}마디</b><span>${d.kind}</span>${dc ? `<em>${dc.choice === 'mine' ? '내 것' : vlab(v)}</em>` : ''}</button>`; }).join('');
  const d = ds.find(x => x.bar === U.bar);
  $('#barAlert').textContent = `${d.bar + 1}마디: ${vlab(v) === 'AI' ? 'AI가' : '편곡이'} ${d.kind}을 바꿨어요`;
  const word = d.rhythm ? (d.pitch ? '선율' : '리듬') : '음';
  $('.choose [data-pick=mine]').textContent = `✓ 내 ${word} 유지`;
  $('.choose [data-pick=ai]').textContent = `${vlab(v)} ${word} 쓰기`;
  U.word = word;
  const dc = S.decisions[d.bar];
  U.pick = U.pick && U.pickBar === d.bar ? U.pick : dc ? dc.choice : null; U.pickBar = d.bar;
  $$('.choose .opt-c').forEach(o => o.classList.toggle('on', o.dataset.c === U.pick));
  if (U.whyBar !== d.bar) { $('#why').value = dc ? dc.why : ''; U.whyBar = d.bar; }
  $('#bank').innerHTML = '<span class="lab">낱말 은행</span>' + BANK.map(w => `<button type="button">${w}</button>`).join('');
  $('#who').innerHTML = Object.keys(ROLE).map(r => `<option value="${r}" ${r === 'record' ? 'selected' : ''}>${esc(roleName(r))}</option>`).join('') + '<option value="all">모둠 전체</option>';
  if (dc) $('#who').value = dc.who;
  validDec();
  // 그 줄(2마디) 악보: 내 선율 / 편곡 버전
  const line = Math.max(0, Math.floor(d.bar / 2)), a = line * 2 * C.BAR, P = line === 0 ? S.pickup || 0 : 0; // 첫 줄은 못갖춘마디까지
  const shift = ns => ns.filter(n => n.p != null && n.s >= a - P && n.s < a + 2 * C.BAR).map(n => ({ ...n, s: n.s - a }));
  const nm = vlab(v) === 'AI' ? 'AI 버전' : '편곡 버전';
  SC.renderAbc($('#score7'), SC.buildAbc({ tempo: S.tempo, key: S.key, bars: 2, perLine: 2, showTitle: false, pickup: P, cutEnd: 0, voices: [{ id: 'M', name: '내 선율', clef: 'treble', notes: shift(S.base) }, { id: 'A', name: nm, clef: 'treble', notes: shift(alignedVocal(v)) }] }), { staffwidth: 640 });
  drawRoll7(SND.position());
  stat('#stat7'); logUI();
}
function drawRoll7(play) {
  const cv = $('#roll7'); if (!cv.offsetParent) return;
  const v = chosen(); if (!v || U.bar == null) return;
  const line = Math.max(0, Math.floor(U.bar / 2));
  const mine = S.base.filter(n => n.p != null);
  const ai = alignedVocal(v).map(n => ({ ...n, kind: C.sameNote(n, mine) ? 'same' : 'diff' }));
  drawRoll(cv, { bars: 2, from: line * 2, layers: [{ kind: 'same', notes: ai }, { kind: 'mine', notes: mine }], focus: U.bar, play });
}
$('#barTabs').addEventListener('click', e => { const b = e.target.closest('[data-bar]'); if (!b) return; U.bar = +b.dataset.bar; U.pick = null; r7(); });
$('.choose').addEventListener('click', e => {
  const v = chosen(); const d = U.bar; if (!v || d == null) return;
  const pl = e.target.closest('[data-pl]'), pk = e.target.closest('[data-pick]');
  if (pl) {
    const line = Math.max(0, Math.floor(d / 2)), a = C.lineStart(line), b = line * 2 * C.BAR + 2 * C.BAR;
    const voc = pl.dataset.pl === 'mine' ? S.base : alignedVocal(v);
    playWith(pl, verTracks({ parts: alignedParts(v) }, voc), { from: a, to: b });
  }
  if (pk) { U.pick = pk.dataset.pick; $$('.choose .opt-c').forEach(o => o.classList.toggle('on', o.dataset.c === U.pick)); validDec(); }
});
$('#bank').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const w = $('#why'); w.value = (w.value.trim() + ' ' + b.textContent).trim(); w.focus(); validDec(); });
$('#why').addEventListener('input', validDec);
function validDec() {
  const ok = !!U.pick && $('#why').value.trim().length >= 4;
  $('#saveDec').disabled = !ok;
  $('#decMsg').textContent = !U.pick ? '두 쪽을 모두 들어 본 뒤 하나를 골라요.' : $('#why').value.trim().length < 4 ? '고친 이유를 한 줄로 써 주세요. (어디서 + 무엇이 + 어떻게 들려서)' : '';
}
$('#saveDec').onclick = () => {
  const v = chosen(), bar = U.bar; if (!v || bar == null || !U.pick) return;
  const why = $('#why').value.trim(), who = $('#who').value;
  const d = diffs().find(x => x.bar === bar);
  pushHist();
  const a = bar * C.BAR, b = a + C.BAR;
  const src = U.pick === 'ai' ? alignedVocal(v) : S.base;
  S.melody = S.melody.filter(n => !(n.s >= a && n.s < b)).map(n => (n.s < a && n.s + n.d > a ? { ...n, d: a - n.s } : n)); // 앞 마디에서 넘어온 음은 마디 앞에서 끊는다
  src.filter(n => n.p != null && n.s >= a && n.s < b).forEach(n => S.melody.push({ id: C.uid(), p: n.p, s: n.s, d: Math.min(n.d, (S.melody.find(m => m.s >= b) || { s: Infinity }).s - n.s), lx: U.pick === 'mine' ? (n.lx || 'n') : 'n' }));
  S.melody.sort((x, y) => x.s - y.s);
  S.decisions[bar] = { choice: U.pick, why, who, at: Date.now() };
  S.log.push({ bar, choice: U.pick, why, who, kind: d ? d.kind : '', word: U.word || '리듬', at: Date.now() });
  save();
  const rep = C.lyricFlow(S.melody, S.lyrics).report;
  const bad = rep.filter(r => !r.ok).map(r => r.line + 1);
  toast(`${bar + 1}마디 결정을 저장했어요`);
  const next = diffs().find(x => !S.decisions[x.bar]);
  U.pick = null; U.whyBar = null;
  if (next) U.bar = next.bar;
  r7(); refresh();
  if (bad.length) $('#decMsg').textContent = `가사 칸이 맞지 않는 줄이 있어요(${bad.join('·')}줄) → 5단계에서 맞춰 주세요.`;
  else if (!next) $('#decMsg').textContent = '바뀐 마디를 모두 정했어요. 8단계에서 총보를 완성해요.';
};
function counts() { const ds = Object.values(S.decisions); return { n: S.log.length, mine: ds.filter(d => d.choice === 'mine').length, ai: ds.filter(d => d.choice === 'ai').length }; }
function stat(sel) { const c = counts(), v = chosen(); $(sel).innerHTML = `<b>수정 ${c.n}회</b><span>학생 결정 ${c.mine}</span><span>${vlab(v)} 채택 ${c.ai}</span>`; }
function logUI() {
  const v = chosen();
  $('#log').innerHTML = S.log.length ? S.log.slice().reverse().map(l => `<li><b>${l.bar + 1}마디</b><span class="c ${l.choice}">${l.choice === 'mine' ? `내 ${l.word || '리듬'} 유지` : `${vlab(v)} ${l.word || '리듬'} 쓰기`}</span><p>${esc(l.why)}</p><small>${esc(l.who === 'all' ? '모둠 전체' : roleName(l.who))} · ${new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small></li>`).join('') : '<li class="empty">아직 기록이 없어요. 주황 마디마다 결정과 이유가 여기에 쌓여요.</li>';
}

// ── 8 악보 완성 ──
function finalParts() {
  const v = chosen();
  const nv = S.arr.nv && S.arr.nv.of === S.arr.chosen ? S.arr.nv : null;
  if (nv) return { parts: nv.parts, chords: nv.chords, locked: false, intro: nv.intro || 0, sections: nv.sections };
  if (!v) return { parts: [], chords: null, locked: false, intro: 0, sections: C.layoutOf(S.melody, S.lyrics, [], 0, totalBars()).sections };
  const norm = ch => (ch && v.key && v.key !== S.key ? ch.map(c => ({ ...c, r: C.pc(C.KEYS[v.key].tonic + c.r - C.KEYS[S.key].tonic) })) : ch); // 수노 곡 조성이 달라도 코드 뿌리는 그대로
  if (v.source === 'suno') { const it = vOff(v) ? sunoIntro(v) : 0; return { parts: alignedParts(v), chords: norm(alignedChords(v)), locked: !!vOff(v), intro: it, sections: C.layoutOf(S.melody, S.lyrics, [], it, totalBars()).sections }; }
  return { parts: v.parts, chords: norm(v.chords), locked: false, intro: v.intro || 0, sections: v.sections };
}
function fullVoices(melody) {
  const { parts, chords, locked, intro, sections } = finalParts();
  const nVoc = S.arr.settings.ens.vocal || 1;
  const mv = SC.melodyVoice(melody, S.lyrics, chords, `노래${nVoc > 1 ? ` (${nVoc}명)` : ''}`, 'V1');
  const vdyn = []; let last = null; (sections || []).forEach(x => { if (/^Intro/.test(x.name)) return; const m = /^Chorus/.test(x.name) ? 'mf' : 'mp'; if (m !== last) { vdyn.push({ s: x.s, m }); last = m; } });
  const voices = [{ ...mv, sub: 'Voc.', notes: melody, editable: true, inst: 'melody', lyricsTarget: true, dyn: parts.length ? vdyn : [] }];
  const chSym = chords ? chords.map(c => ({ s: c.s, name: c.name })) : null;
  parts.forEach((p, i) => voices.push(partVoice(p, i, !locked, null, chSym)));
  return { voices, parts, chords, intro: intro || 0, sections: parts.length ? sections : null };
}
// 악보 머리: 제목·부제·지은이·빠르기 말·편성 줄
const STYLE = { pop: 'Pop', ballad: 'Ballad', rock: 'Rock', acoustic: 'Acoustic', dance: 'Dance', hiphop: 'Hip-hop' };
function scoreHeader(fv) {
  const t = S.tempo, pace = t < 76 ? 'Slow' : t < 112 ? 'Medium' : 'Up-tempo';
  const v = chosen(), names = fv.voices.map(x => x.name).filter(Boolean);
  const credit = [S.group && `${S.group} 작사·작곡`, S.roles.lyric && `작사 ${S.roles.lyric}`, S.roles.compose && `작곡 ${S.roles.compose}`, v && (v.source === 'suno' ? 'AI 편곡 협업' : `편곡 ${S.roles.arrange || 'LIVE SCORE'}`)].filter(Boolean).join(' · ');
  const secs = (fv.sections || []).map((x, i, a) => `${x.name} ${((a[i + 1] ? a[i + 1].bar : totalBars()) - x.bar)}마디`).join(' – ');
  return { subtitle: fv.parts.length ? (fv.parts.length >= 4 ? '밴드 편곡' : '합주 편곡') + ' · 중학교 음악 수업' : '', credit, style: `${pace} ${STYLE[S.arr.settings.genre] || 'Pop'}`, info: names.join(' · ') + (secs ? ' | ' + secs : '') };
}
const ed8 = createEditor($('#ed8'), {
  model: () => { const fv = fullVoices(S.melody); return { title: S.title || '우리 노래', sub: '', header: scoreHeader(fv), tempo: S.tempo, key: S.key, bars: totalBars(), perLine: 4, showTitle: true, voices: fv.voices, intro: fv.intro, sections: fv.sections, start: scoreStart(fv) }; },
  onChange: () => { save(); $('#scoreInfo').textContent = info8(); },
  // 타이프 인 스코어: 내 선율에 글자를 바로 — 2단계 노랫말 줄과 5단계 글자 붙임이 함께 바뀐다
  lyric: { get: (v, n) => { const m = C.lyricFlow(S.melody, S.lyrics).map.get(n.id); return !m ? '' : m.kind === 'ext' ? '_' : m.text || ''; }, set: (v, n, t) => C.setNoteLyric(S.melody, S.lyrics, n.id, t), hyphen: false },
  state: { get: () => S.lyrics, set: x => { S.lyrics = x; } },
  onPlay: (at, btn, sp = 1) => { const { parts } = finalParts(); playWith(btn, verTracks({ parts }, S.melody), { from: at, tempo: S.tempo * sp }); },
  toast, staffwidth: 1000,
});
const info8 = () => `${totalBars()}마디 · 가사 · 코드 · 파트 ${fullVoices(S.melody).voices.length} · 음표를 눌러 바로 고쳐요`;
function r8() {
  ed8.render(); keyCtl($('#etKey8'), S.key);
  $('#scoreInfo').textContent = info8();
  const v = chosen();
  $$('.vlab').forEach(x => { x.textContent = vlab(v) === 'AI' ? 'AI' : '편곡'; });
  $('#playFirst').disabled = !v; stat('#stat8'); reflectUI();
}
const scoreStart = fv => (fv.intro ? -fv.intro * C.BAR : -(S.pickup || 0));
function exportParts() {
  const fv = fullVoices(S.melody), { parts, chords } = fv;
  const flow = C.lyricFlow(S.melody, S.lyrics);
  const list = [{ name: fv.voices[0].name, sub: 'Voc.', clef: 'treble', notes: S.melody, lyrics: flow, chords, program: 53, dyn: fv.voices[0].dyn }, ...parts.map(p => ({ name: p.name, sub: p.sub, clef: p.clef, notes: p.notes, drum: isDrum(p), disp: p.disp, trans: p.trans, slash: p.slash, chords: p.slash ? chords : undefined, group: p.group, band: true, dyn: p.dyn, tech: p.tech, program: p.gm ?? p.program ?? (C.INSTS[p.inst] || {}).gm }))];
  list.fv = fv; return list;
}
// MIDI·MP3는 악보 첫 자리(전주·못갖춘마디)를 0으로 옮겨 만든다
function fromZero(tracks, st) { return st ? tracks.map(t => ({ ...t, notes: t.notes.map(n => ({ ...n, s: n.s - st })) })) : tracks; }
$('#exXml').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const parts = exportParts(), fv = parts.fv;
  const xml = SC.buildMusicXML({ title: S.title, sub: S.group, tempo: S.tempo, key: S.key, bars: totalBars(), parts, intro: fv.intro, sections: fv.sections, header: scoreHeader(fv) });
  download(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), fileBase() + '.musicxml');
  toast('악보 파일을 받았어요 — 뮤즈스코어에서 열어요');
};
$('#exMid').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const ps = exportParts(), st = scoreStart(ps.fv);
  const tr = fromZero(ps.map(p => ({ name: p.name || p.sub || '키보드 왼손', program: p.program, channel: p.drum ? 9 : undefined, notes: p.notes })), st);
  download(MIDI.writeMidi(tr, S.tempo), fileBase() + '.mid');
};
$('#exPdf').onclick = () => { go(8); setTimeout(() => window.print(), 300); };
async function mp3(btn, tracks, name) {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  const b = btn.querySelector('b'), t = b.textContent; btn.disabled = true; b.textContent = 'MP3 만드는 중…';
  const st = Math.min(0, ...tracks.flatMap(t => t.notes.map(n => n.s)));
  try { download(await SND.renderMp3(fromZero(tracks, st), S.tempo, units() - st, p => { b.textContent = `MP3 만드는 중… ${Math.round(p * 100)}%`; }), fileBase() + name); toast('MP3를 받았어요'); }
  catch (x) { console.warn(x); toast('MP3를 만들지 못했어요'); }
  btn.disabled = false; b.textContent = t;
}
$('#exWav').onclick = e => mp3(e.currentTarget, [{ inst: 'voice', notes: S.melody, vol: .9 }], '_선율.mp3');
$('#exMp3All').onclick = e => mp3(e.currentTarget, verTracks({ parts: finalParts().parts }, S.melody), '_노래와반주.mp3');
$('#exMr').onclick = e => mp3(e.currentTarget, verTracks({ parts: finalParts().parts }, null), '_반주MR.mp3');
// 화면 악보(abcjs) → 따로 떼어 쓸 수 있는 SVG 글
function scoreSvg() {
  const svg = $('#ed8 .ed-score svg'); if (!svg) return '';
  const c = svg.cloneNode(true);
  c.removeAttribute('style'); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (c.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (vb.length === 4) { c.setAttribute('width', Math.round(vb[2])); c.setAttribute('height', Math.round(vb[3])); }
  c.querySelectorAll('.ed-on,.ed-play').forEach(x => x.classList.remove('ed-on', 'ed-play'));
  c.querySelectorAll('.ed-cursor').forEach(x => x.remove());
  return c.outerHTML;
}
$('#exSvg').onclick = () => {
  const svg = scoreSvg(); if (!svg) return toast('아직 악보가 없어요');
  download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg], { type: 'image/svg+xml' }), fileBase() + '_악보.svg');
  toast('악보 그림(SVG)을 받았어요');
};
// ── 노래방·발표 모드 ──
$('#karaBtn').onclick = () => {
  if (!S.melody.length) return toast('아직 선율이 없어요');
  stopPlay();
  PLUS.openKaraoke({
    title: S.title || '우리 노래', sub: [S.group, C.KEYS[S.key].name, '♩=' + S.tempo].filter(Boolean).join(' · '), tempo: S.tempo, bars: totalBars(),
    lines: PLUS.karaLines(C, S.melody, S.lyrics), SND, lineOf: C.lineOf,
    tracks: withVoice => verTracks({ parts: finalParts().parts }, withVoice ? S.melody : null).filter(t => withVoice || t.inst !== 'voice'),
  });
};
// ── 자기평가 · 과정 보고서 ──
function reflectUI() {
  const r = S.reflect || (S.reflect = { items: {}, good: '', next: '' });
  $('#rubric').innerHTML = PLUS.RUBRIC.map((t, i) => `<li><p>${esc(t)}</p><div class="seg2 sm" data-ri="${i}">${PLUS.LEVELS.map((l, k) => `<button type="button" data-lv="${k}" class="${r.items[i] === k ? 'on' : ''}">${l}</button>`).join('')}</div></li>`).join('');
  $('#refGood').value = r.good || ''; $('#refNext').value = r.next || '';
}
$('#rubric').addEventListener('click', e => {
  const b = e.target.closest('[data-lv]'); if (!b) return;
  const i = +b.closest('[data-ri]').dataset.ri; S.reflect.items[i] = +b.dataset.lv; save(); reflectUI();
});
$('#refGood').oninput = e => { S.reflect.good = e.target.value; save(); };
$('#refNext').oninput = e => { S.reflect.next = e.target.value; save(); };
$('#reportBtn').onclick = () => {
  const v = chosen(), svgHtml = scoreSvg();
  const ok = PLUS.openReport({
    title: S.title || '우리 노래', group: S.group, roles: S.roles, roleNames: ROLE, keyName: C.KEYS[S.key].name, tempo: S.tempo, bars: totalBars(),
    date: new Date().toLocaleDateString('ko-KR'), lyrics: S.lyrics, scene: S.arr.scene, why: S.arr.why, verName: v ? `${v.id} · ${v.name}` : '', prog: v ? progression(v) : '',
    syl: S.lyrics.reduce((a, l) => a + C.syllables(l.text).length, 0), notes: S.melody.length, counts: counts(), vlab: vlab(v),
    log: S.log.map(l => ({ ...l, who: l.who === 'all' ? '모둠 전체' : roleName(l.who) })), reflect: S.reflect || { items: {} }, svg: svgHtml,
  });
  if (!ok) toast('새 창이 막혔어요 — 주소창 오른쪽에서 팝업을 허용해 주세요');
};
$('#playFirst').onclick = e => { const v = chosen(); if (v) playWith(e.currentTarget, verTracks({ parts: alignedParts(v) }, alignedVocal(v))); };
$('#playFinal').onclick = e => {
  playWith(e.currentTarget, verTracks({ parts: finalParts().parts }, S.melody));
  if (SND.isPlaying()) ed8.follow();
};
$('#newVer').onclick = () => {
  const v = chosen(), box = $('#newVerBox'); box.hidden = false;
  if (!v) { box.innerHTML = '<p>6단계에서 편곡을 먼저 골라 주세요.</p>'; return; }
  if (v.source === 'auto') {
    const r = C.arrange(S.melody, S.lyrics, S.key, v.settings, v.variant, v.userChords ? v.chords : null);
    S.arr.nv = { of: v.id, parts: r.parts, chords: r.chords, intro: r.intro, sections: r.sections }; syncNv(); save(); r8();
    box.innerHTML = `<p><b>고친 선율에 맞춰 반주를 다시 만들었어요.</b> 위의 <b>▶ 고친 뒤 새 버전</b>과 <b>▶ 처음 버전</b>을 차례로 들어 보세요.</p>`;
  } else {
    box.innerHTML = `<ol class="howto"><li><b>노래 선율 MP3</b>로 고친 선율을 받아요.</li><li>수노 <b>Create → Upload Audio</b>에 올리고 <b>Cover</b>로 같은 장르·분위기의 새 버전을 만들어요.</li><li>새로 받은 음원을 여기에 올려 처음 버전과 비교해 들어요.</li></ol><label class="ctl file"><span>새 버전 음원</span><input type="file" accept="audio/*" id="nvAudio"></label><div id="nvPlayer"></div>`;
    $('#nvAudio').onchange = ev => { const f = ev.target.files[0]; if (!f) return; $('#nvPlayer').innerHTML = `<audio controls src="${URL.createObjectURL(f)}"></audio>`; };
  }
};

// ── 태블릿으로 보기(QR) ──
async function packShare() {
  const v = chosen();
  const o = { u: S.pickup || 0, t: S.title, g: S.group, k: S.key, b: S.tempo, l: S.lyrics.map(l => [l.text, l.chorus ? 1 : 0]), m: S.melody.map(n => [n.p, n.s, n.d, n.lx === 'n' ? 0 : n.lx]) };
  if (v && v.source === 'auto') { o.a = { s: v.settings, v: v.variant }; if (v.userChords) o.a.c = v.chords.map(c => [c.s, c.d, c.r, c.q]); }
  else if (v) o.c = v.chords.map(c => [c.s, c.d, c.r, c.q]);
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let out = bytes, z = '0';
  if (window.CompressionStream) { out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); z = '1'; }
  let bin = ''; out.forEach(x => { bin += String.fromCharCode(x); });
  return z + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackShare(s) {
  const z = s[0]; const b = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(b, c => c.charCodeAt(0));
  if (z === '1') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function share() {
  const d = $('#shareDlg');
  const base = location.href.split('#')[0].split('?')[0];
  const url = base + '#s=' + await packShare();
  U.shareUrl = url;
  $('#qrUrl').textContent = url.length > 90 ? url.slice(0, 60) + '…' : url;
  try {
    const q = qrcode(0, 'L'); q.addData(url); q.make();
    $('#qrBox').innerHTML = q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
    const dense = q.getModuleCount() > 57;
    $('#qrBox').classList.toggle('big', dense);
    $('#qrNote').textContent = dense ? '곡이 길어 QR이 촘촘해요. 태블릿을 화면 가까이 대고 찍거나, 메뉴의 프로젝트 파일로 옮겨 주세요.' : '';
  } catch (x) { $('#qrNote').textContent = ''; $('#qrBox').innerHTML = '<p class="w">곡이 길어 QR 하나에 다 담기지 않아요. 메뉴의 <b>프로젝트 파일로 저장</b>으로 옮겨 주세요.</p>'; }
  $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요'); } catch (x) { toast('복사하지 못했어요'); } };
  d.showModal();
}
$('#shareBtn').onclick = share;
async function viewer(hash) {
  let o;
  try { o = await unpackShare(hash); } catch (x) { toast('악보 주소를 읽지 못했어요'); return false; }
  C.METER.pickup = o.u || 0;
  const lyrics = o.l.map(([text, ch]) => ({ text, chorus: !!ch }));
  const melody = o.m.map(([p, s, d, lx]) => ({ id: C.uid(), p, s, d, lx: lx || 'n' }));
  const bars = Math.max(2, lyrics.length * 2, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / C.BAR));
  let parts = [], chords = null, ly = { intro: 0, sections: null };
  if (o.a) { const fx = o.a.c ? o.a.c.map(([s, d, r, q]) => ({ s, d, r, q })) : null; const r = C.arrange(melody, lyrics, o.k, o.a.s, o.a.v, fx); parts = r.parts; chords = r.chords; ly = r; }
  else if (o.c) chords = o.c.map(([s, d, r, q]) => ({ s, d, r, q, name: C.chordName({ r, q }, o.k) }));
  document.body.classList.add('viewer');
  const sec = document.createElement('section'); sec.className = 'step view'; sec.id = 'viewer';
  sec.innerHTML = `<div class="step-head"><p class="kicker">태블릿으로 보기 · 받은 악보</p><h1>${esc(o.t || '우리 노래')}</h1><p class="one">${esc(o.g || '')} · ♩=${o.b} · ${C.KEYS[o.k].name}</p></div>
    <div class="card"><div class="row"><button class="btn" type="button" id="vPlay">▶ 반주와 함께 듣기</button><button class="btn ghost" type="button" id="vSing">▶ 노래만 듣기</button><button class="btn ghost" type="button" id="vTake">이 기기에서 이어서 고치기</button></div>
    <ol class="vlyr">${lyrics.map(l => `<li class="${l.chorus ? 'chorus' : ''}">${esc(l.text)}</li>`).join('')}</ol>
    <div class="score full" id="vScore"></div></div>`;
  $('#main').prepend(sec);
  $$('.step:not(#viewer)').forEach(s => { s.hidden = true; });
  const voices = [SC.melodyVoice(melody, lyrics, chords)];
  parts.forEach((p, i) => voices.push(partVoice(p, i, false)));
  SC.renderAbc($('#vScore'), SC.buildAbc({ title: '', tempo: o.b, key: o.k, bars, perLine: 2, voices, intro: ly.intro || 0, sections: ly.sections }), { staffwidth: 700 });
  const tracks = [{ inst: 'voice', notes: melody, vol: .85 }, ...parts.map(p => ({ inst: SND.soundOf(p.inst), notes: p.notes, vol: p.inst === 'drums' ? .7 : .45 }))];
  $('#vPlay').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, tracks); };
  $('#vSing').onclick = e => { S.tempo = o.b; playWith(e.currentTarget, [tracks[0]]); };
  $('#vTake').onclick = () => ask('받은 악보를 이 기기의 작업 곡으로 가져올까요? 이 기기에 있던 곡은 작업 기록에 남겨 둡니다.', () => {
    autoSnap('받은 악보 가져오기 전'); S = blank(); Object.assign(S, { title: o.t, group: o.g, key: o.k, tempo: o.b, pickup: o.u || 0, lyrics, melody, made: true });
    if (o.a) S.arr.settings = { ...S.arr.settings, ...o.a.s };
    save(); history.replaceState(null, '', location.pathname); location.reload();
  }, '가져오기');
  return true;
}

// ── 시작 ──
buildKb();
fillSetup();
MIDI.connectMidi();
window.addEventListener('resize', () => drawStep());
window.addEventListener('beforeprint', () => { if (document.body.classList.contains('ls-printing')) return; if (U.step !== 8) go(8); }); // 악보 인쇄(총보·파트보)는 그 자리에서
(async () => {
  if (location.hash.startsWith('#s=') && await viewer(location.hash.slice(3))) { $('#pager').hidden = true; $('#steps').hidden = true; return; }
  go(U.step);
})();
// 시험용 고리
window.__ls = { S: () => S, U, go, C, SC, MIDI, SND, loadDemo: () => { loadDemo(); refresh(); } };
