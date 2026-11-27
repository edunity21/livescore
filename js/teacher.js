// LIVE SCORE · 교사용 모아보기 — 모둠 프로젝트 파일(.json) 여러 개를 이 브라우저 안에서만 읽어 한눈에
import * as C from './core.js?v=9';
import * as SC from './score.js?v=9';
import * as SND from './sound.js?v=9';
import { RUBRIC, LEVELS } from './plus.js?v=9';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE = { lyric: '작사', compose: '작곡', arrange: '편곡', record: '기록', present: '발표' };
const STEPN = ['', '연결', '가사', '선율', '박', '가사 붙이기', '편곡', '비교·수정', '완성'];
const KEEP = 'livescore-teacher-v1';
let list = [];
let sel = null;

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }

// 학생 화면과 같은 기준으로 단계 완료 여부
function analyze(S) {
  C.METER.pickup = S.pickup || 0;
  const melody = S.melody || [], lyrics = S.lyrics || [];
  const vers = (S.arr && S.arr.versions) || [];
  const chosen = vers.find(v => v.id === S.arr.chosen) || null;
  const bars = Math.max(2, lyrics.length * 2, Math.ceil(Math.max(0, ...melody.map(n => n.s + n.d)) / C.BAR));
  const flow = C.lyricFlow(melody, lyrics).report;
  let diffs = [];
  if (chosen && S.base) {
    const off = chosen.source === 'suno' ? (chosen.vstart || 0) * C.BAR : 0;
    const voc = (chosen.vocal || []).map(n => ({ ...n, s: n.s - off })).filter(n => n.s >= 0);
    diffs = C.diffBars(S.base, voc, bars);
  }
  const done = [
    !!S.made,
    lyrics.some(l => C.syllables(l.text).length),
    melody.length > 0,
    melody.length > 0 && (S.mode === 'mouse' || !!S.take),
    melody.length > 0 && flow.length > 0 && flow.every(x => x.ok),
    !!chosen,
    !!chosen && !!S.base && diffs.every(d => (S.decisions || {})[d.bar]),
    false,
  ];
  done[7] = done.slice(0, 7).every(Boolean);
  const decs = Object.values(S.decisions || {});
  const items = (S.reflect && S.reflect.items) || {};
  const vals = Object.values(items).filter(x => x != null);
  return {
    bars, chosen, diffs, done,
    syl: lyrics.reduce((a, l) => a + C.syllables(l.text).length, 0),
    badLines: flow.filter(x => !x.ok).length,
    mine: decs.filter(d => d.choice === 'mine').length, ai: decs.filter(d => d.choice === 'ai').length,
    rub: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, rubN: vals.length,
  };
}

function add(files) {
  const fs = [...files].filter(f => /\.json$/i.test(f.name) || f.type.includes('json'));
  if (!fs.length) return toast('.json 프로젝트 파일을 넣어 주세요');
  Promise.all(fs.map(f => f.text().then(t => { try { const j = JSON.parse(t); return j && j.v === 1 ? { file: f.name, S: j } : null; } catch (e) { return null; } }))).then(rs => {
    let ok = 0, bad = 0;
    rs.forEach(r => {
      if (!r) { bad++; return; }
      const S = Object.assign({ title: '', group: '', roles: {}, lyrics: [], melody: [], arr: { versions: [] }, decisions: {}, log: [] }, r.S);
      const key = (S.group || '') + '|' + (S.title || r.file);
      list = list.filter(x => x.key !== key);
      list.push({ key, file: r.file, S, A: analyze(S), at: Date.now() });
      ok++;
    });
    list.sort((a, b) => (a.S.group || '').localeCompare(b.S.group || '', 'ko', { numeric: true }));
    keep(); render();
    toast(`${ok}개 모둠 파일을 읽었어요${bad ? ` · ${bad}개는 LIVE SCORE 파일이 아니에요` : ''}`);
  });
}
function keep() { try { sessionStorage.setItem(KEEP, JSON.stringify(list.map(x => ({ file: x.file, S: x.S })))); } catch (e) { } }
function restore() {
  try { const j = JSON.parse(sessionStorage.getItem(KEEP) || '[]'); list = j.map(r => ({ key: (r.S.group || '') + '|' + (r.S.title || r.file), file: r.file, S: r.S, A: analyze(r.S) })); } catch (e) { list = []; }
}

function render() {
  const has = list.length > 0;
  $('#tableWrap').hidden = !has; $('#stats').hidden = !has; $('#csvBtn').disabled = !has;
  if (!has) { $('#detail').hidden = true; return; }
  const fin = list.filter(x => x.A.done[7]).length;
  const avgStep = list.reduce((a, x) => a + x.A.done.filter(Boolean).length, 0) / list.length;
  const decs = list.reduce((a, x) => a + (x.S.log || []).length, 0);
  const mine = list.reduce((a, x) => a + x.A.mine, 0), ai = list.reduce((a, x) => a + x.A.ai, 0);
  $('#stats').innerHTML = `<div><b>${list.length}</b><span>모둠</span></div><div><b>${fin}</b><span>8단계까지 마친 모둠</span></div><div><b>${avgStep.toFixed(1)} / 8</b><span>평균 진행 단계</span></div><div><b>${decs}</b><span>비교·수정 결정 (내 것 ${mine} : 편곡 ${ai})</span></div>`;
  $('#rows').innerHTML = list.map((x, i) => {
    const S = x.S, A = x.A, v = A.chosen;
    return `<tr data-i="${i}" class="${sel === i ? 'on' : ''}"><td><b>${esc(S.group || '—')}</b></td><td>${esc(S.title || '(제목 없음)')}</td>
      <td><div class="dots">${A.done.map((d, k) => `<i class="${d ? 'd' : ''}" title="${k + 1}. ${STEPN[k + 1]}">${k + 1}</i>`).join('')}</div></td>
      <td>${(S.lyrics || []).length}줄 · ${A.syl}음절${A.badLines ? ` <span class="pill warn">${A.badLines}줄 어긋남</span>` : ''}</td>
      <td>${(S.melody || []).length}음 · ${A.bars}마디</td><td>${esc((C.KEYS[S.key] || C.KEYS.C).name)} · ♩=${S.tempo || 92}</td>
      <td>${v ? `<span class="pill">${esc(v.id)}</span> ${esc(v.name)}` : '<span class="sub">—</span>'}</td>
      <td>${(S.log || []).length}회 <small>${A.mine} : ${A.ai}</small></td>
      <td>${A.rub == null ? '<span class="sub">—</span>' : `${A.rub.toFixed(1)} <small>/ 2 · ${A.rubN}문항</small>`}</td></tr>`;
  }).join('');
  if (sel != null && list[sel]) detail(sel);
}

function detail(i) {
  sel = i; const x = list[i]; if (!x) return;
  const S = x.S, A = x.A, v = A.chosen, el = $('#detail');
  document.querySelectorAll('#rows tr').forEach(r => r.classList.toggle('on', +r.dataset.i === i));
  const roles = Object.entries(S.roles || {}).filter(([, n]) => n).map(([k, n]) => `<span class="pill">${ROLE[k] || k} ${esc(n)}</span>`).join(' ') || '<span class="sub">역할 기록 없음</span>';
  const items = (S.reflect && S.reflect.items) || {};
  el.hidden = false;
  el.innerHTML = `<div class="card"><div class="h2row"><h2>${esc(S.group || '')} · ${esc(S.title || '')}</h2><div class="row" style="margin:0"><button class="btn ghost sm" type="button" id="dPlay">▶ 선율 듣기</button><button class="btn ghost sm" type="button" id="dClose">닫기</button></div></div>
    <p style="margin:6px 0 14px">${roles}</p>
    <div class="two"><div><h3 class="h3">노랫말</h3><ol class="lyr">${(S.lyrics || []).map(l => `<li class="${l.chorus ? 'ch' : ''}">${esc(l.text) || '<span class="sub">(빈 줄)</span>'}</li>`).join('')}</ol>
      <h3 class="h3">장면 · 편곡을 고른 이유</h3><p>${esc(S.arr && S.arr.scene) || '<span class="sub">—</span>'}</p><p style="margin-top:6px">${esc(S.arr && S.arr.why) || '<span class="sub">—</span>'}</p></div>
    <div><h3 class="h3">비교·수정 기록</h3><ol class="t-log">${(S.log || []).length ? S.log.map(l => `<li><b>${l.bar + 1}마디</b>${l.choice === 'mine' ? '내 선율 유지' : '편곡 쓰기'} <span class="sub">${esc(l.kind || '')}</span><p>${esc(l.why)}</p><small>${esc(l.who === 'all' ? '모둠 전체' : (ROLE[l.who] || '') + (S.roles && S.roles[l.who] ? ' ' + S.roles[l.who] : ''))} · ${new Date(l.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></li>`).join('') : '<li class="sub">아직 기록이 없어요.</li>'}</ol>
      <h3 class="h3">자기평가</h3><ul class="t-rub">${RUBRIC.map((r, k) => `<li><span>${esc(r)}</span><b>${items[k] != null ? LEVELS[items[k]] : '—'}</b></li>`).join('')}</ul>
      <p style="margin-top:8px"><b>잘된 점</b> ${esc(S.reflect && S.reflect.good) || '—'}<br><b>바꾸고 싶은 점</b> ${esc(S.reflect && S.reflect.next) || '—'}</p></div></div>
    <h3 class="h3">노래 악보 <small>${esc(x.file)}</small></h3><div class="score" id="dScore"></div></div>`;
  const chords = v && v.chords ? v.chords.filter(c => c.s >= 0).map(c => ({ s: c.s, name: c.name })) : null;
  C.METER.pickup = S.pickup || 0;
  SC.renderAbc($('#dScore'), SC.buildAbc({ tempo: S.tempo || 92, key: S.key || 'C', bars: A.bars, perLine: 4, showTitle: false, voices: [SC.melodyVoice(S.melody || [], S.lyrics || [], chords)] }), { staffwidth: 980 });
  $('#dClose').onclick = () => { sel = null; el.hidden = true; render(); };
  $('#dPlay').onclick = e => {
    const b = e.currentTarget;
    if (SND.isPlaying()) { SND.stop(); return; }
    b.textContent = '■ 멈춤';
    SND.play([{ inst: 'voice', notes: S.melody || [], vol: .85 }], S.tempo || 92, { onend: () => { b.textContent = '▶ 선율 듣기'; } });
  };
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function csv() {
  const head = ['모둠', '곡 제목', '작사', '작곡', '편곡', '기록', '발표', '진행 단계', '완료 단계', '가사 줄', '음절', '어긋난 줄', '선율 음표', '마디', '조', '빠르기', '고른 편곡', '장면', '고른 이유', '수정 결정', '내 선율 유지', '편곡 채택', '결정 이유 모음', ...RUBRIC.map((_, k) => `자기평가${k + 1}`), '잘된 점', '바꾸고 싶은 점'];
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = list.map(({ S, A }) => {
    const r = S.roles || {}, it = (S.reflect && S.reflect.items) || {};
    return [S.group, S.title, r.lyric, r.compose, r.arrange, r.record, r.present, S.step, A.done.map((d, k) => (d ? k + 1 : '')).filter(Boolean).join(' '), (S.lyrics || []).length, A.syl, A.badLines, (S.melody || []).length, A.bars, (C.KEYS[S.key] || C.KEYS.C).name, S.tempo,
      A.chosen ? `${A.chosen.id} ${A.chosen.name}` : '', S.arr && S.arr.scene, S.arr && S.arr.why, (S.log || []).length, A.mine, A.ai, (S.log || []).map(l => `${l.bar + 1}마디: ${l.why}`).join(' / '),
      ...RUBRIC.map((_, k) => (it[k] != null ? LEVELS[it[k]] : '')), S.reflect && S.reflect.good, S.reflect && S.reflect.next].map(q).join(',');
  });
  const blob = new Blob(['﻿' + [head.map(q).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `LIVE_SCORE_모둠_모아보기_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => add(e.dataTransfer.files));
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!e.target.closest('#drop')) { e.preventDefault(); add(e.dataTransfer.files); } });
$('#files').onchange = e => { add(e.target.files); e.target.value = ''; };
$('#rows').addEventListener('click', e => { const r = e.target.closest('tr[data-i]'); if (r) detail(+r.dataset.i); });
$('#csvBtn').onclick = csv;
$('#printBtn').onclick = () => window.print();
$('#clearBtn').onclick = () => { list = []; sel = null; keep(); render(); toast('목록을 비웠어요'); };
restore(); render();
window.__t = { add, list: () => list };
