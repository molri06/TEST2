import { load, save, newId } from './store.js';

const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const zoomLabel = document.getElementById('zoom');
const hint = document.getElementById('hint');
const panel = document.getElementById('search');
const query = document.getElementById('query');
const results = document.getElementById('results');
const status = document.getElementById('search-status');

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 48];
const DEFAULT_FONT = 14;

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
    searchable: true, // 기본은 검색 대상. 체크를 풀면 메모 전용이 된다.
    ...props,
  };
  state.notes.push(note);
  renderNote(note);
  save(state);
  return note;
}

function removeNote(note) {
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
    el.append(text);
  }

  world.append(el);
  els.set(note.id, el);
  return el;
}

function selectNote(el) {
  world.querySelectorAll('.note.selected').forEach((n) => n.classList.remove('selected'));
  el?.classList.add('selected');
}

const noteOf = (el) => state.notes.find((n) => n.id === el.dataset.id);

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
  if (e.target.closest('.tools')) return;

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
  dismissHint();
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
    selectNote(null);
    document.activeElement?.blur();
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
        dismissHint();
      };
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
});

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

/* --- 시작 ------------------------------------------------------------- */

function dismissHint() {
  hint.classList.add('gone');
}

state.notes.forEach(renderNote);
applyView();
if (state.notes.length) dismissHint();
