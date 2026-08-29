/**
 * 캔버스 상태를 브라우저 localStorage에 저장한다.
 * v1은 단일 캔버스, 단일 사용자만 다루므로 키 하나면 충분하다.
 */

const KEY = 'canvas-notes/v1';

export const emptyState = () => ({
  notes: [],
  view: { x: 0, y: 0, scale: 1 },
  bannerClosed: false,
  typingBest: { cpm: 0, accuracy: 0 },
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      // searchable·created는 나중에 생긴 필드다. 옛 노트는 검색 대상으로 보고,
      // 작성 시각은 id 앞부분(생성 시각을 36진수로 적어 둔 값)에서 되살린다.
      notes: (Array.isArray(parsed.notes) ? parsed.notes : [])
        .map((n) => ({ searchable: true, created: idTime(n.id), ...n })),
      view: { ...emptyState().view, ...parsed.view },
      bannerClosed: parsed.bannerClosed === true,
      typingBest: { ...emptyState().typingBest, ...parsed.typingBest },
    };
  } catch {
    // 손상된 데이터로 앱이 아예 안 뜨는 것보다 빈 캔버스가 낫다.
    return emptyState();
  }
}

let pending = null;

/** 잦은 드래그 중 쓰기를 줄이기 위해 한 프레임 뒤로 모아 저장한다. */
export function save(state) {
  pending = state;
  if (save.queued) return;
  save.queued = true;
  requestAnimationFrame(() => {
    save.queued = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(pending));
    } catch (err) {
      // 용량 초과(이미지 다수) 정도가 현실적인 실패 원인이다.
      console.warn('저장하지 못했습니다:', err);
    }
  });
}

/** newId가 심어 둔 생성 시각을 되읽는다. 못 읽으면 지금 시각으로 둔다. */
function idTime(id) {
  const ms = parseInt(String(id).slice(0, -5), 36);
  return Number.isFinite(ms) && ms > 0 ? ms : Date.now();
}

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
