import { useCallback, useState } from 'react';

/**
 * Draggable column width for sidebars. Call startResize from a handle's
 * pointerdown; dragging left/right resizes (clamped to [min, max]).
 * `side` is the edge being dragged: 'left' = handle on a panel's right edge,
 * 'right' = handle on a panel's left edge.
 */
export function useColumnWidth(initial: number, opts: { min?: number; max?: number } = {}) {
  const { min = 48, max = 480 } = opts;
  const [width, setWidth] = useState(initial);

  const startResize = useCallback(
    (side: 'left' | 'right', e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const base = width;
      const clamp = (n: number) => Math.min(max, Math.max(min, n));
      const move = (ev: PointerEvent) =>
        setWidth(clamp(base + (side === 'left' ? ev.clientX - startX : startX - ev.clientX)));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width, min, max],
  );

  return { width, setWidth, startResize };
}
