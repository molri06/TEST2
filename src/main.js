import { load, save, newId } from './store.js';

const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const zoomLabel = document.getElementById('zoom');
const banner = document.getElementById('banner');
const panel = document.getElementById('search');
const query = document.getElementById('query');
const results = document.getElementById('results');
const status = document.getElementById('search-status');

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 48];
const DEFAULT_FONT = 14;

/** 주신 돋보기 그림을 그대로 옮긴 배지(보라 테, 옅은 렌즈, 노란 이음쇠, 주황 손잡이). */
const MAGNIFIER = `<svg viewBox="0 0 28 28" aria-hidden="true">
  <path d="M11.5 16.5 5 23" stroke="#d5852a" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M12.8 15.2 11 17" stroke="#f3c93f" stroke-width="6" stroke-linecap="round"/>
  <circle cx="17" cy="11" r="7.6" fill="#e7effb" stroke="#6f6ab8" stroke-width="3.6"/>
  <path d="M13.2 8.2a5 5 0 0 1 2.6-2.5" stroke="#fff" stroke-width="1.3"
        stroke-linecap="round" fill="none"/>
</svg>`;

/** 카드에서 바로 열 검색 엔진. 새 탭(크롬)에서 열린다. */
const ENGINES = [
  { name: '구글', host: 'google.com', url: (q) => `https://www.google.com/search?q=${q}` },
  { name: '네이버', host: 'naver.com', url: (q) => `https://search.naver.com/search.naver?query=${q}` },
  { name: '유튜브', host: 'youtube.com', url: (q) => `https://www.youtube.com/results?search_query=${q}` },
];

const state = load();
const els = new Map(); // note.id -> element

/* --- 좌표 변환 --------------------------------------------------------- */

const toWorld = (clientX, clientY) => ({
  x: (clientX - state.view.x) / state.view.scale,
  y: (clientY - state.view.y) / state.view.scale,
});

function applyView() {
  const { x, y, scale } = state.view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  viewport.style.backgroundSize = `${24 * scale}px ${24 * scale}px`;
  viewport.style.backgroundPosition = `${x}px ${y}px`;
  zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  save(state);
}

/* --- 노트 ------------------------------------------------------------- */

function createNote(props) {
  const note = {
    id: newId(),
    x: 0,
    y: 0,
    text: '',
    src: null,
    width: null,
    fontSize: DEFAULT_FONT,
    created: Date.now(),
    searchable: true, // 기본은 검색 대상. 체크를 풀면 메모 전용이 된다.
    ...props,
  };
  state.notes.push(note);
  renderNote(note);
  save(state);
  return note;
}

function removeNote(note) {
  if (card?.note === note) closeCard();
  state.notes = state.notes.filter((n) => n !== note);
  els.get(note.id)?.remove();
  els.delete(note.id);
  save(state);
  if (!panel.hidden) runSearch();
}

function renderNote(note) {
  const el = document.createElement('div');
  el.className = 'note' + (note.src ? ' image' : '') + (note.searchable ? '' : ' private');
  el.dataset.id = note.id;
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;

  const tools = document.createElement('div');
  tools.className = 'tools';

  const flag = document.createElement('label');
  flag.className = 'flag';
  flag.title = '체크를 켜면 검색 결과에 나오고, 끄면 메모 전용이 됩니다';
  flag.innerHTML = '<input type="checkbox"><span>검색</span>';
  flag.querySelector('input').checked = note.searchable;
  flag.querySelector('input').addEventListener('change', (e) => {
    note.searchable = e.target.checked;
    el.classList.toggle('private', !note.searchable);
    if (!note.searchable && card?.note === note) closeCard();
    save(state);
    if (!panel.hidden) runSearch();
  });
  tools.append(flag, Object.assign(document.createElement('span'), { className: 'sep' }));

  const buttons = document.createElement('span');
  buttons.innerHTML = note.src
    ? '<button data-act="del" class="danger" title="삭제">✕</button>'
    : '<button data-act="smaller" title="글자 작게">A−</button>' +
      '<button data-act="bigger" title="글자 크게">A+</button>' +
      '<button data-act="del" class="danger" title="삭제">✕</button>';
  tools.append(...buttons.children);
  el.append(tools);

  if (!note.src) {
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'badge';
    badge.title = '이 노트 내용으로 웹 검색';
    badge.innerHTML = MAGNIFIER;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCard(note);
    });
    el.append(badge);
  }

  if (note.src) {
    const img = document.createElement('img');
    img.src = note.src;
    img.alt = '';
    if (note.width) img.style.width = `${note.width}px`;
    el.append(img);
  } else {
    const text = document.createElement('p');
    text.className = 'text';
    text.contentEditable = 'plaintext-only';
    text.dataset.placeholder = '무엇이든 적어보세요';
    text.textContent = note.text;
    text.style.fontSize = `${note.fontSize}px`;
    text.addEventListener('input', () => {
      note.text = text.textContent;
      save(state);
    });
    // 편집 중에는 캔버스 단축키가 아니라 글자 입력이 우선이다.
    text.addEventListener('keydown', (e) => e.stopPropagation());
    // 내용 없이 벗어난 노트는 실수로 만든 것으로 보고 지운다.
    // 같은 노트의 툴바를 누른 것뿐이라면 아직 작성 중이므로 남겨 둔다.
    text.addEventListener('blur', () => {
      setTimeout(() => {
        if (!note.text.trim() && !el.contains(document.activeElement)) removeNote(note);
      });
    });
    el.append(text);
  }

  const stamp = document.createElement('time');
  stamp.className = 'stamp';
  stamp.dateTime = new Date(note.created).toISOString();
  stamp.textContent = formatStamp(note.created);
  el.append(stamp);

  world.append(el);
  els.set(note.id, el);
  return el;
}

function selectNote(el) {
  purgeEmpty(el);
  world.querySelectorAll('.note.selected').forEach((n) => n.classList.remove('selected'));
  el?.classList.add('selected');
}

/** 내용 없이 방치된 노트는 남기지 않는다. 지금 다루는 노트(keep)는 예외. */
function purgeEmpty(keep) {
  for (const note of [...state.notes]) {
    if (note.src || note.text.trim()) continue;
    const el = els.get(note.id);
    if (el === keep || el.contains(document.activeElement)) continue;
    removeNote(note);
  }
}

const noteOf = (el) => state.notes.find((n) => n.id === el.dataset.id);

/** 2026.08.29 14:03 형식. */
function formatStamp(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setFontSize(note, delta) {
  const i = FONT_SIZES.indexOf(note.fontSize);
  const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + delta))];
  note.fontSize = next;
  els.get(note.id).querySelector('.text').style.fontSize = `${next}px`;
  save(state);
}

/* --- 패닝 / 줌 --------------------------------------------------------- */

let pan = null;

viewport.addEventListener('pointerdown', (e) => {
  const noteEl = e.target.closest('.note');

  if (!noteEl) {
    selectNote(null);
    pan = { px: e.clientX, py: e.clientY };
    viewport.classList.add('panning');
    viewport.setPointerCapture(e.pointerId);
    return;
  }

  selectNote(noteEl);
  // 툴바와 돋보기 배지는 눌러야 하므로 드래그를 시작하지 않는다.
  // (포인터를 노트에 캡처해 버리면 그쪽 click 이벤트가 사라진다.)
  if (e.target.closest('.tools, .badge')) return;

  // 텍스트를 직접 클릭했다면 편집이 목적이므로 드래그하지 않는다.
  if (e.target.classList.contains('text')) return;

  const note = noteOf(noteEl);
  const start = toWorld(e.clientX, e.clientY);
  const origin = { x: note.x, y: note.y };
  noteEl.classList.add('dragging');
  noteEl.setPointerCapture(e.pointerId);

  const move = (ev) => {
    const p = toWorld(ev.clientX, ev.clientY);
    note.x = Math.round(origin.x + p.x - start.x);
    note.y = Math.round(origin.y + p.y - start.y);
    noteEl.style.left = `${note.x}px`;
    noteEl.style.top = `${note.y}px`;
    if (card?.note === note) placeCard();
  };
  const up = () => {
    noteEl.classList.remove('dragging');
    noteEl.removeEventListener('pointermove', move);
    noteEl.removeEventListener('pointerup', up);
    noteEl.removeEventListener('pointercancel', up);
    save(state);
  };
  noteEl.addEventListener('pointermove', move);
  noteEl.addEventListener('pointerup', up);
  noteEl.addEventListener('pointercancel', up);
});

viewport.addEventListener('pointermove', (e) => {
  if (!pan) return;
  state.view.x += e.clientX - pan.px;
  state.view.y += e.clientY - pan.py;
  pan = { px: e.clientX, py: e.clientY };
  applyView();
});

const endPan = () => {
  pan = null;
  viewport.classList.remove('panning');
};
viewport.addEventListener('pointerup', endPan);
viewport.addEventListener('pointercancel', endPan);

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();

  // 트랙패드 두 손가락 스크롤은 이동, 핀치(ctrlKey)와 휠은 확대/축소.
  if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    state.view.x -= e.deltaX;
    state.view.y -= e.deltaY;
    applyView();
    return;
  }

  const factor = Math.exp(-e.deltaY * 0.002);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale * factor));
  // 커서 아래 지점이 제자리에 머무르도록 원점을 보정한다.
  const k = scale / state.view.scale;
  state.view.x = e.clientX - (e.clientX - state.view.x) * k;
  state.view.y = e.clientY - (e.clientY - state.view.y) * k;
  state.view.scale = scale;
  applyView();
}, { passive: false });

/* --- 노트 생성 / 조작 -------------------------------------------------- */

viewport.addEventListener('dblclick', (e) => {
  if (e.target.closest('.note')) return;
  const p = toWorld(e.clientX, e.clientY);
  const note = createNote({ x: Math.round(p.x), y: Math.round(p.y) });
  const el = els.get(note.id);
  selectNote(el);
  el.querySelector('.text').focus();
});

world.addEventListener('click', (e) => {
  const button = e.target.closest('.tools button');
  if (!button) return;
  const note = noteOf(e.target.closest('.note'));
  if (button.dataset.act === 'del') removeNote(note);
  else setFontSize(note, button.dataset.act === 'bigger' ? 1 : -1);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openSearch();
    return;
  }

  const selected = world.querySelector('.note.selected');
  if ((e.key === 'Backspace' || e.key === 'Delete') && selected) {
    e.preventDefault();
    removeNote(noteOf(selected));
  } else if (e.key === 'Escape') {
    if (!panel.hidden) closeSearch();
    if (!game.hidden) closeTyping();
    closeCard();
    document.activeElement?.blur();
    selectNote(null); // 빈 노트는 여기서 정리된다
  }
});

/* --- 이미지 드래그 앤 드롭 --------------------------------------------- */

viewport.addEventListener('dragover', (e) => {
  e.preventDefault();
  viewport.classList.add('dropping');
});
viewport.addEventListener('dragleave', () => viewport.classList.remove('dropping'));

viewport.addEventListener('drop', (e) => {
  e.preventDefault();
  viewport.classList.remove('dropping');
  const p = toWorld(e.clientX, e.clientY);
  let offset = 0;

  for (const file of e.dataTransfer.files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    const at = { x: Math.round(p.x + offset), y: Math.round(p.y + offset) };
    offset += 24;
    reader.onload = () => {
      const probe = new Image();
      probe.onload = () => {
        createNote({ ...at, src: reader.result, width: Math.min(320, probe.width) });
      };
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
});

/* --- 웹 검색 카드 ------------------------------------------------------- */

let card = null; // { note, box, line }

function toggleCard(note) {
  const open = card?.note === note;
  closeCard();
  if (open) return;

  const query = note.text.trim();
  if (!query) return;
  const encoded = encodeURIComponent(query);

  const box = document.createElement('div');
  box.className = 'card';

  const label = document.createElement('span');
  label.className = 'q';
  label.append('검색어 ', Object.assign(document.createElement('b'), { textContent: query }));
  box.append(label);

  for (const engine of ENGINES) {
    const a = document.createElement('a');
    a.href = engine.url(encoded);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(
      `${engine.name}에서 검색`,
      Object.assign(document.createElement('span'), { textContent: engine.host }),
    );
    box.append(a);
  }

  const line = document.createElement('div');
  line.className = 'link';

  world.append(line, box);
  card = { note, box, line };
  placeCard();
}

function closeCard() {
  card?.box.remove();
  card?.line.remove();
  card = null;
}

/** 노트 왼쪽 아래에서 'ㄴ' 자로 내려와 카드로 이어지도록 위치를 잡는다. */
function placeCard() {
  const { note, box, line } = card;
  const el = els.get(note.id);
  const drop = 34;   // 아래로 내려오는 길이
  const reach = 22;  // 오른쪽으로 뻗는 길이

  line.style.left = `${note.x + 14}px`;
  line.style.top = `${note.y + el.offsetHeight}px`;
  line.style.width = `${reach}px`;
  line.style.height = `${drop}px`;

  box.style.left = `${note.x + 14 + reach}px`;
  box.style.top = `${note.y + el.offsetHeight + drop - 18}px`;
}

/* --- 검색 -------------------------------------------------------------- */

function openSearch() {
  panel.hidden = false;
  query.select();
  query.focus();
  runSearch();
}

function closeSearch() {
  panel.hidden = true;
  world.querySelectorAll('.note.found').forEach((n) => n.classList.remove('found'));
}

/** 검색은 '검색' 체크가 켜진 텍스트 노트만 대상으로 한다. */
function runSearch() {
  const q = query.value.trim().toLowerCase();
  const pool = state.notes.filter((n) => n.searchable && !n.src);
  const skipped = state.notes.filter((n) => !n.searchable && !n.src).length;

  results.replaceChildren();
  world.querySelectorAll('.note.found').forEach((n) => n.classList.remove('found'));

  if (!q) {
    status.textContent = skipped
      ? `검색 대상 ${pool.length}개 · 메모 전용 ${skipped}개는 제외됩니다`
      : `검색 대상 ${pool.length}개`;
    return;
  }

  const hits = pool.filter((n) => n.text.toLowerCase().includes(q));
  status.textContent = hits.length
    ? `${hits.length}개 찾음${skipped ? ` · 메모 전용 ${skipped}개 제외` : ''}`
    : '결과가 없습니다';

  for (const note of hits) {
    els.get(note.id).classList.add('found');

    const button = document.createElement('button');
    button.type = 'button';
    button.append(...highlight(note.text, q));
    button.addEventListener('click', () => focusNote(note));

    const li = document.createElement('li');
    li.append(button);
    results.append(li);
  }
}

/** 일치 구간만 <mark>로 감싼다. 사용자 입력이므로 innerHTML은 쓰지 않는다. */
function highlight(text, q) {
  const nodes = [];
  const lower = text.toLowerCase();
  let from = 0;

  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) nodes.push(document.createTextNode(text.slice(from, at)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + q.length);
    nodes.push(mark);
    from = at + q.length;
  }
  nodes.push(document.createTextNode(text.slice(from)));
  return nodes;
}

/** 검색 결과를 누르면 해당 노트를 화면 가운데로 데려온다. */
function focusNote(note) {
  const el = els.get(note.id);
  const scale = Math.max(state.view.scale, 1);
  state.view.scale = scale;
  state.view.x = innerWidth / 2 - (note.x + el.offsetWidth / 2) * scale;
  state.view.y = innerHeight / 2 - (note.y + el.offsetHeight / 2) * scale;
  applyView();
  selectNote(el);
}

document.getElementById('search-open').addEventListener('click', openSearch);
document.getElementById('search-close').addEventListener('click', closeSearch);
query.addEventListener('input', runSearch);
query.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeSearch();
  if (e.key === 'Enter') results.querySelector('button')?.click();
});

/* --- 타자 연습 ---------------------------------------------------------- */

const game = document.getElementById('typing');
const target = document.getElementById('typing-target');
const input = document.getElementById('typing-input');
const sourceLabel = document.getElementById('typing-source');
const resultLine = document.getElementById('typing-result');
const statCpm = document.getElementById('stat-cpm');
const statAcc = document.getElementById('stat-acc');
const statProgress = document.getElementById('stat-progress');
const statBest = document.getElementById('stat-best');

const MAX_LINES = 8;

/** 노트가 하나도 없을 때 쓰는 기본 문장. */
const SAMPLE_LINES = [
  '생각은 흩어져 있을 때 가장 자유롭다.',
  '떠오른 것을 먼저 적고 정리는 나중에 한다.',
  '캔버스는 넓고 노트는 가볍다.',
];

let play = null; // { lines, at, wrong, correct, missed, startedAt, timer }

/** 연습할 문장을 내 노트에서 뽑는다. 짧은 조각과 중복은 버린다. */
function collectLines() {
  const seen = new Set();
  const lines = [];

  for (const note of state.notes) {
    if (note.src) continue;
    for (const raw of note.text.split('\n')) {
      const line = raw.trim();
      if (line.length < 2 || seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }

  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return { lines: lines.slice(0, MAX_LINES), fromNotes: lines.length > 0 };
}

function openTyping() {
  game.hidden = false;
  startGame();
}

function closeTyping() {
  clearInterval(play?.timer);
  play = null;
  game.hidden = true;
}

function startGame() {
  const { lines, fromNotes } = collectLines();
  clearInterval(play?.timer);
  play = {
    lines: fromNotes ? lines : SAMPLE_LINES.slice(),
    at: 0,
    wrong: new Set(),
    correct: 0,
    missed: 0,
    startedAt: null,
    timer: null,
  };

  sourceLabel.textContent = fromNotes
    ? `내 노트 ${play.lines.length}줄로 연습합니다`
    : '노트가 아직 없어 기본 문장으로 연습합니다';
  resultLine.hidden = true;
  input.disabled = false;
  input.value = '';
  input.focus();

  showBest();
  renderLine();
  updateStats();
}

function renderLine() {
  const line = play.lines[play.at] ?? '';
  const typed = input.value;
  target.replaceChildren();

  for (let i = 0; i < line.length; i++) {
    const span = document.createElement('span');
    span.textContent = line[i];
    if (i < typed.length) span.className = typed[i] === line[i] ? 'ok' : 'bad';
    else if (i === typed.length) span.className = 'now';
    target.append(span);
  }
  statProgress.textContent = `${Math.min(play.at + 1, play.lines.length)} / ${play.lines.length}`;
}

function elapsedMinutes() {
  return play.startedAt ? (Date.now() - play.startedAt) / 60000 : 0;
}

function updateStats() {
  const minutes = elapsedMinutes();
  const typedSoFar = play.correct + [...input.value].filter((c, i) => c === play.lines[play.at]?.[i]).length;
  statCpm.textContent = minutes > 0 ? Math.round(typedSoFar / minutes) : 0;

  const attempts = play.correct + play.missed;
  statAcc.textContent = attempts ? `${Math.round((play.correct / attempts) * 100)}%` : '100%';
}

function showBest() {
  const best = state.typingBest;
  statBest.textContent = best.cpm ? `${best.cpm}타 · ${best.accuracy}%` : '—';
}

function finishGame() {
  clearInterval(play.timer);
  input.disabled = true;

  const minutes = elapsedMinutes();
  const cpm = minutes > 0 ? Math.round(play.correct / minutes) : 0;
  const attempts = play.correct + play.missed;
  const accuracy = attempts ? Math.round((play.correct / attempts) * 100) : 100;
  const seconds = Math.max(1, Math.round(minutes * 60));

  const record = cpm > state.typingBest.cpm;
  if (record) {
    state.typingBest = { cpm, accuracy };
    save(state);
    showBest();
  }

  resultLine.textContent = `${play.lines.length}줄을 ${seconds}초에 마쳤습니다. `
    + `분당 ${cpm}타, 정확도 ${accuracy}%.`
    + (record ? ' 최고 기록입니다.' : '');
  resultLine.hidden = false;
  statCpm.textContent = cpm;
  statAcc.textContent = `${accuracy}%`;
}

input.addEventListener('input', () => {
  if (!play || input.disabled) return;

  if (!play.startedAt) {
    play.startedAt = Date.now();
    play.timer = setInterval(updateStats, 500);
  }

  const line = play.lines[play.at];
  const typed = input.value;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== line[i]) play.wrong.add(i);
  }

  renderLine();
  updateStats();

  if (typed === line) {
    play.correct += line.length;
    play.missed += play.wrong.size;
    play.wrong.clear();
    play.at += 1;
    input.value = '';

    if (play.at >= play.lines.length) finishGame();
    else { renderLine(); updateStats(); }
  }
});

// 붙여넣기로 문장을 통째로 넣으면 기록이 의미를 잃는다.
input.addEventListener('paste', (e) => e.preventDefault());

// 연습 중에는 캔버스 단축키가 아니라 타자가 우선이다.
input.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeTyping();
});

document.getElementById('typing-open').addEventListener('click', openTyping);
document.getElementById('typing-close').addEventListener('click', closeTyping);
document.getElementById('typing-restart').addEventListener('click', startGame);
game.addEventListener('pointerdown', (e) => {
  if (e.target === game) closeTyping(); // 바깥을 누르면 닫는다
});

/* --- 시작 ------------------------------------------------------------- */

function showBanner(show) {
  banner.hidden = !show;
  state.bannerClosed = !show;
  save(state);
}

document.getElementById('banner-close').addEventListener('click', () => showBanner(false));
document.getElementById('help').addEventListener('click', () => showBanner(banner.hidden));

banner.hidden = state.bannerClosed;
state.notes.forEach(renderNote);
applyView();
