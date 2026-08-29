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
const picker = document.getElementById('typing-song');
const iceA = makeIce(document.getElementById('ice'));

const MAX_LINES = 8;

/**
 * 연습할 노랫말. 저작권이 소멸한 것만 싣는다 —
 * 국가, 작자 미상의 전통 민요, 수백 년 된 옛 시조.
 * 요즘 가요 가사는 저작권이 살아 있어 넣지 않는다. 그런 곡은 노트에 적어 두고
 * '내 노트'로 연습하면 된다.
 */
const SONGS = [
  {
    key: 'anthem',
    title: '애국가 (1절·후렴)',
    note: '대한민국 국가 · 작자 미상',
    lines: [
      '동해물과 백두산이 마르고 닳도록',
      '하느님이 보우하사 우리나라 만세',
      '무궁화 삼천리 화려강산',
      '대한사람 대한으로 길이 보전하세',
    ],
  },
  {
    key: 'arirang',
    title: '아리랑',
    note: '전통 민요 · 작자 미상',
    lines: [
      '아리랑 아리랑 아라리요',
      '아리랑 고개로 넘어간다',
    ],
  },
  {
    key: 'bluebird',
    title: '새야 새야 파랑새야',
    note: '전통 민요 · 작자 미상',
    lines: [
      '새야 새야 파랑새야',
      '녹두밭에 앉지 마라',
    ],
  },
  {
    key: 'doraji',
    title: '도라지 타령',
    note: '전통 민요 · 작자 미상',
    lines: [
      '도라지 도라지 백도라지',
      '심심산천에 백도라지',
    ],
  },
  {
    key: 'sijo',
    title: '옛 시조',
    note: '정몽주·황진이 · 14~16세기',
    lines: [
      '이 몸이 죽고 죽어 일백 번 고쳐 죽어',
      '백골이 진토되어 넋이라도 있고 없고',
      '청산리 벽계수야 수이 감을 자랑 마라',
      '일도창해하면 다시 오기 어려워라',
    ],
  },
  {
    key: 'notes',
    title: '내 노트',
    note: '캔버스에 적어 둔 내 문장',
    lines: null, // 열 때마다 노트에서 모은다
  },
];

let play = null; // { lines, at, wrong, correct, missed, startedAt, timer }

/** '내 노트' 모드에서 쓸 문장. 짧은 조각과 중복은 버리고 섞는다. */
function collectNoteLines() {
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
  return lines;
}

const songOf = (key) => SONGS.find((s) => s.key === key) ?? SONGS[0];

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
  const song = songOf(picker.value);
  const lines = song.lines ?? collectNoteLines();

  clearInterval(play?.timer);
  play = {
    lines: lines.slice(0, MAX_LINES),
    at: 0,
    total: 0,
    wrong: new Set(),
    correct: 0,
    missed: 0,
    startedAt: null,
    timer: null,
  };

  if (!play.lines.length) {
    // '내 노트'인데 적어 둔 문장이 없는 경우.
    sourceLabel.textContent = '노트에 적어 둔 문장이 없어 애국가로 바꿉니다';
    picker.value = 'anthem';
    startGame();
    return;
  }

  play.total = play.lines.reduce((sum, line) => sum + line.length, 0);
  iceA.fresh();
  sourceLabel.textContent = `${song.note} · ${play.lines.length}줄`;
  resultLine.hidden = true;
  input.disabled = false;
  input.value = '';
  input.focus();

  showBest();
  renderLine();
  updateStats();
  updateMelt();
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

/** 틀린 자리 하나당 0.6글자만큼 다시 언다. 정확할수록 빨리 녹는다. */
const WRONG_COST = 0.6;

/** 얼음 윗면을 몇 개의 기둥으로 나눠 각각 다른 속도로 녹인다. */
const MELT_COLUMNS = 11;

/**
 * 기둥 하나가 녹은 높이(0~1).
 * 양 끝(0, 1)에서는 어긋남이 0이 되므로, 시작할 때는 평평하게 얼어 있고
 * 다 녹으면 남김없이 사라지되 중간에는 자리마다 들쭉날쭉해진다.
 */
function columnDepth(m, { rate, wobble }) {
  const spread = (rate - 1) * 2 * m * (1 - m);
  const ripple = wobble * 0.05 * Math.sin(2 * Math.PI * m);
  return Math.min(1, Math.max(0, m + spread + ripple));
}

/**
 * 얼음 한 덩이를 맡는다. 두 타자 연습이 같은 장면을 따로 하나씩 쓴다.
 * fresh()는 판마다 다른 얼음결을 뽑고, show(melt)는 그만큼 깎아 낸다.
 */
function makeIce(root) {
  const cube = root.querySelector('.cube');
  const label = root.querySelector('.ice-label');
  const drops = [...root.querySelectorAll('.drop')];
  let profile = [];

  const fresh = () => {
    profile = Array.from({ length: MELT_COLUMNS }, () => ({
      rate: 0.7 + Math.random() * 0.6,   // 어떤 자리는 빨리, 어떤 자리는 더디게
      wobble: Math.random() * 2 - 1,     // 녹는 도중 오르내리는 결
    }));
  };

  /** 녹은 경계를 다각형으로 그리고, 물방울을 그 자리 높이에 매단다. */
  function shape(melt) {
    if (!profile.length) fresh();

    const depths = profile.map((column) => columnDepth(melt, column));
    const points = depths.map((depth, i) => {
      const x = (i / (MELT_COLUMNS - 1)) * 100;
      return `${x.toFixed(1)}% ${(depth * 100).toFixed(1)}%`;
    });
    cube.style.clipPath = `polygon(${points.join(', ')}, 100% 100%, 0% 100%)`;

    for (const drop of drops) {
      const at = Number(drop.dataset.at); // 0~1, 물방울이 매달린 가로 위치
      const slot = at * (MELT_COLUMNS - 1);
      const low = Math.floor(slot);
      const high = Math.min(MELT_COLUMNS - 1, low + 1);
      const depth = depths[low] + (depths[high] - depths[low]) * (slot - low);
      drop.style.top = `${(depth * 100).toFixed(1)}%`;
    }
  }

  return {
    root,
    fresh,
    show(melt) {
      root.style.setProperty('--melt', melt.toFixed(3));
      shape(melt);
      root.dataset.stage = melt >= 0.99 ? 'open'
        : melt >= 0.5 ? 'melting'
        : melt >= 0.15 ? 'cracking' : 'frozen';
      root.classList.toggle('open', melt >= 0.99);
      label.textContent = melt >= 0.99
        ? '보물이 드러났습니다'
        : `얼음 ${Math.round(melt * 100)}% 녹음`;
      return melt;
    },
  };
}

function meltRatio() {
  const line = play.lines[play.at] ?? '';
  const typed = input.value;
  let prefix = 0;
  while (prefix < typed.length && typed[prefix] === line[prefix]) prefix += 1;

  const gained = play.correct + prefix;
  const lost = (play.missed + play.wrong.size) * WRONG_COST;
  if (!play.total) return 0;
  return Math.min(1, Math.max(0, (gained - lost) / play.total));
}

function updateMelt() {
  return iceA.show(meltRatio());
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

  const melt = updateMelt();
  const treasure = melt >= 0.99;

  resultLine.textContent = `${play.lines.length}줄을 ${seconds}초에 마쳤습니다. `
    + `분당 ${cpm}타, 정확도 ${accuracy}%. `
    + (treasure
        ? '얼음이 다 녹아 보물을 찾았습니다.'
        : `얼음이 ${Math.round(melt * 100)}%까지 녹았습니다. 조금 더 정확하면 보물이 나옵니다.`)
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
  updateMelt();

  if (typed === line) {
    play.correct += line.length;
    play.missed += play.wrong.size;
    play.wrong.clear();
    play.at += 1;
    input.value = '';

    if (play.at >= play.lines.length) finishGame();
    else { renderLine(); updateStats(); updateMelt(); }
  }
});

// 붙여넣기로 문장을 통째로 넣으면 기록이 의미를 잃는다.
input.addEventListener('paste', (e) => e.preventDefault());

// 연습 중에는 캔버스 단축키가 아니라 타자가 우선이다.
input.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeTyping();
});

for (const song of SONGS) {
  const option = document.createElement('option');
  option.value = song.key;
  option.textContent = song.title;
  picker.append(option);
}
picker.value = songOf(state.typingSong).key;

picker.addEventListener('change', () => {
  state.typingSong = picker.value;
  save(state);
  startGame();
});

document.getElementById('typing-open').addEventListener('click', openTyping);
document.getElementById('typing-close').addEventListener('click', closeTyping);
document.getElementById('typing-restart').addEventListener('click', startGame);
game.addEventListener('pointerdown', (e) => {
  if (e.target === game) closeTyping(); // 바깥을 누르면 닫는다
});


/* --- 타자 연습 2 · 떨어지는 낱말 ---------------------------------------- */

/*
 * 같은 노랫말을 낱말로 쪼개 하늘에서 떨어뜨린다. 자리도 속도도 매번 다르다.
 * 물에 닿기 전에 그대로 입력하면 낱말이 사라지고 그만큼 얼음이 녹는다.
 * 놓친 낱말은 다시 얼린다.
 */

const drop = document.getElementById('drop');
const sky = document.getElementById('sky');
const dropInput = document.getElementById('drop-input');
const dropSource = document.getElementById('drop-source');
const dropResult = document.getElementById('drop-result');
const dropPicker = document.getElementById('drop-song');
const dropCpm = document.getElementById('drop-cpm');
const dropAcc = document.getElementById('drop-acc');
const dropLeft = document.getElementById('drop-left');
const dropBest = document.getElementById('drop-best');

const iceB = makeIce(mountIce(document.getElementById('drop-ice')));

const WORD_COUNT = 18;       // 한 판에 떨어지는 낱말 수
const SPAWN_MIN = 1100;      // 낱말 사이 간격(ms)
const SPAWN_MAX = 1900;
const FALL_MIN = 5.5;        // 하늘 끝에서 물까지 걸리는 시간(초)
const FALL_MAX = 9.5;

let fall = null; // { words, queue, spawned, correct, missed, total, startedAt, raf, next }
let lastFrame = 0;

/**
 * 얼음 장면은 SVG가 길어 두 번 적기 아깝다. 첫 번째 창의 것을 복제하되
 * 안쪽 id는 겹치지 않게 바꾼다(그러지 않으면 그러데이션을 서로 뺏는다).
 */
function mountIce(host) {
  const copy = document.getElementById('ice').cloneNode(true);
  copy.removeAttribute('id');

  const renamed = new Map();
  for (const el of copy.querySelectorAll('[id]')) {
    renamed.set(el.id, `${el.id}-b`);
    el.id = `${el.id}-b`;
  }
  for (const el of copy.querySelectorAll('[fill], [stroke]')) {
    for (const attr of ['fill', 'stroke']) {
      const value = el.getAttribute(attr);
      const key = value?.startsWith('url(#') ? value.slice(5, -1) : null;
      if (key && renamed.has(key)) el.setAttribute(attr, `url(#${renamed.get(key)})`);
    }
  }

  host.replaceWith(copy);
  return copy;
}

/** 노랫말을 낱말로 쪼개 섞는다. */
function wordsOf(song) {
  const lines = song.lines ?? collectNoteLines();
  const words = lines.flatMap((line) => line.split(/\s+/)).filter((w) => w.length > 0);

  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}

function openDrop() {
  drop.hidden = false;
  startFall();
}

function closeDrop() {
  stopFall();
  fall = null;
  drop.hidden = true;
}

function stopFall() {
  if (!fall) return;
  cancelAnimationFrame(fall.raf);
  clearTimeout(fall.next);
  fall.raf = 0;
  fall.next = 0;
}

function startFall() {
  const song = songOf(dropPicker.value);
  const queue = wordsOf(song).slice(0, WORD_COUNT);

  stopFall();
  sky.querySelectorAll('.word').forEach((el) => el.remove());

  if (!queue.length) {
    dropSource.textContent = '노트에 적어 둔 문장이 없어 애국가로 바꿉니다';
    dropPicker.value = 'anthem';
    startFall();
    return;
  }

  fall = {
    words: [],                                  // 지금 떨어지는 중인 낱말
    queue,
    spawned: 0,
    correct: 0,
    missed: 0,
    total: queue.reduce((sum, w) => sum + w.length, 0),
    startedAt: Date.now(),
    raf: 0,
    next: 0,
  };

  iceB.fresh();
  lastFrame = 0;
  dropSource.textContent = `${song.note} · 낱말 ${queue.length}개`;
  dropResult.hidden = true;
  dropInput.disabled = false;
  dropInput.value = '';
  dropInput.focus();

  showDropBest();
  updateDropStats();
  iceB.show(0);
  spawnNext();
  fall.raf = requestAnimationFrame(stepFall);
}

function spawnNext() {
  if (!fall || fall.spawned >= fall.queue.length) return;

  const text = fall.queue[fall.spawned];
  fall.spawned += 1;

  const el = document.createElement('span');
  el.className = 'word';
  el.textContent = text;
  sky.append(el);

  // 가로 자리는 낱말 폭을 뺀 범위 안에서 무작위로 고른다.
  const margin = (el.offsetWidth / 2 / sky.clientWidth) * 100 + 2;
  const left = margin + Math.random() * Math.max(0, 100 - margin * 2);
  el.style.left = `${left.toFixed(1)}%`;
  el.style.top = '0px';

  const reach = Math.max(20, sky.clientHeight - el.offsetHeight - 10);
  fall.words.push({
    text,
    el,
    y: 0,
    speed: reach / (FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN)), // px/초
    reach,
  });

  fall.next = setTimeout(spawnNext, SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN));
}

function stepFall(now) {
  if (!fall) return;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;

  for (const word of [...fall.words]) {
    word.y += word.speed * dt;
    word.el.style.top = `${word.y.toFixed(1)}px`;
    if (word.y >= word.reach) sinkWord(word);
  }

  updateDropStats();
  if (fall.spawned >= fall.queue.length && !fall.words.length) finishFall();
  else fall.raf = requestAnimationFrame(stepFall);
}

/** 물에 닿은 낱말. 그만큼 다시 언다. */
function sinkWord(word) {
  fall.missed += word.text.length;
  removeWord(word, 'lost');
  meltFall();
}

function removeWord(word, how) {
  fall.words = fall.words.filter((w) => w !== word);
  word.el.classList.add(how);
  word.el.addEventListener('animationend', () => word.el.remove());
  setTimeout(() => word.el.remove(), 400); // 애니메이션을 끈 환경까지 챙긴다
}

function meltFall() {
  const gained = fall.correct;
  const lost = fall.missed * WRONG_COST;
  const melt = fall.total ? Math.min(1, Math.max(0, (gained - lost) / fall.total)) : 0;
  return iceB.show(melt);
}

function updateDropStats() {
  const minutes = (Date.now() - fall.startedAt) / 60000;
  dropCpm.textContent = minutes > 0 ? Math.round(fall.correct / minutes) : 0;

  const attempts = fall.correct + fall.missed;
  dropAcc.textContent = attempts ? `${Math.round((fall.correct / attempts) * 100)}%` : '100%';
  dropLeft.textContent = `${fall.queue.length - fall.spawned + fall.words.length}`;
}

function showDropBest() {
  const best = state.dropBest;
  dropBest.textContent = best.cpm ? `${best.cpm}타 · ${best.accuracy}%` : '—';
}

function finishFall() {
  stopFall();
  dropInput.disabled = true;

  const minutes = (Date.now() - fall.startedAt) / 60000;
  const cpm = minutes > 0 ? Math.round(fall.correct / minutes) : 0;
  const attempts = fall.correct + fall.missed;
  const accuracy = attempts ? Math.round((fall.correct / attempts) * 100) : 100;
  const record = cpm > state.dropBest.cpm;
  if (record) {
    state.dropBest = { cpm, accuracy };
    save(state);
    showDropBest();
  }

  const melt = meltFall();
  dropResult.textContent = `낱말 ${fall.queue.length}개 중 놓친 글자 ${fall.missed}자. `
    + `분당 ${cpm}타, 정확도 ${accuracy}%. `
    + (melt >= 0.99
        ? '얼음이 다 녹아 보물을 찾았습니다.'
        : `얼음이 ${Math.round(melt * 100)}%까지 녹았습니다. 더 많이 받아 내면 보물이 나옵니다.`)
    + (record ? ' 최고 기록입니다.' : '');
  dropResult.hidden = false;
  dropCpm.textContent = cpm;
  dropAcc.textContent = `${accuracy}%`;
}

/** 입력과 앞이 맞는 낱말을 짚어 주고, 똑같아지면 받아 낸다. */
dropInput.addEventListener('input', () => {
  if (!fall || dropInput.disabled) return;
  const typed = dropInput.value.trim();

  const hit = fall.words.find((w) => w.text === typed);
  if (hit) {
    fall.correct += hit.text.length;
    removeWord(hit, 'hit');
    dropInput.value = '';
    meltFall();
    updateDropStats();
    return;
  }

  // 가장 아래(가장 급한) 낱말부터 짚는다.
  const aiming = typed
    ? [...fall.words].sort((a, b) => b.y - a.y).find((w) => w.text.startsWith(typed))
    : null;
  for (const word of fall.words) word.el.classList.toggle('aim', word === aiming);
});

dropInput.addEventListener('paste', (e) => e.preventDefault());

dropInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeDrop();
});

for (const song of SONGS) {
  const option = document.createElement('option');
  option.value = song.key;
  option.textContent = song.title;
  dropPicker.append(option);
}
dropPicker.value = songOf(state.dropSong).key;

dropPicker.addEventListener('change', () => {
  state.dropSong = dropPicker.value;
  save(state);
  startFall();
});

document.getElementById('drop-open').addEventListener('click', openDrop);
document.getElementById('drop-close').addEventListener('click', closeDrop);
document.getElementById('drop-restart').addEventListener('click', startFall);
drop.addEventListener('pointerdown', (e) => {
  if (e.target === drop) closeDrop(); // 바깥을 누르면 닫는다
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
