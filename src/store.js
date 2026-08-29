/**
 * 캔버스 상태를 브라우저 localStorage에 저장한다.
 * v1은 단일 캔버스, 단일 사용자만 다루므로 키 하나면 충분하다.
 */

const KEY = 'canvas-notes/v1';

export const emptyState = () => ({
  notes: [],
  view: { x: 0, y: 0, scale: 1 },
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      // searchable은 나중에 생긴 필드라, 옛 노트는 검색 대상으로 본다.
      notes: (Array.isArray(parsed.notes) ? parsed.notes : [])
        .map((n) => ({ searchable: true, ...n })),
      view: { ...emptyState().view, ...parsed.view },
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

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
