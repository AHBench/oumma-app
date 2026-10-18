import { useRef, useState, type ReactNode } from 'react';

const GRIP = 6;

/**
 * React port of lib/core/widgets/resizable_split.dart — a draggable grip bar
 * between two panes. `ResizableColumn` splits vertically (dossier/tasks),
 * `ResizableRow` horizontally. The first pane takes `initialRatio` of the
 * space (double-click the grip to reset); both panes are clamped to at least
 * `minRatio`.
 */

interface SplitProps {
  first: ReactNode;
  second: ReactNode;
  initialRatio?: number;
  minRatio?: number;
}

export function ResizableColumn(props: SplitProps) {
  return <Split isRow={false} {...props} />;
}

export function ResizableRow(props: SplitProps) {
  return <Split isRow={true} {...props} />;
}

function Split({ first, second, initialRatio = 0.5, minRatio = 0.15, isRow }: SplitProps & { isRow: boolean }) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startRatio: number; startPoint: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = { startRatio: ratio, startPoint: isRow ? e.clientX : e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = containerRef.current;
    if (!drag || !el) return;
    const rect = el.getBoundingClientRect();
    const total = isRow ? rect.width : rect.height;
    const extent = Math.max(0, total - GRIP);
    if (extent <= 0) return;
    const point = isRow ? e.clientX : e.clientY;
    const next = drag.startRatio + (point - drag.startPoint) / extent;
    setRatio(Math.min(1 - minRatio, Math.max(minRatio, next)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const reset = () => setRatio(initialRatio);

  const firstStyle: React.CSSProperties = isRow
    ? { width: `calc((100% - ${GRIP}px) * ${ratio})` }
    : { height: `calc((100% - ${GRIP}px) * ${ratio})` };

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full min-h-0 min-w-0 ${isRow ? 'flex-row' : 'flex-col'}`}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={firstStyle}>
        {first}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={reset}
        title="Drag to resize · double-click to reset"
        className={`group relative flex shrink-0 touch-none items-center justify-center bg-surface-secondary/70 transition-colors hover:bg-(--accent)/20 ${
          isRow ? 'w-[6px] cursor-col-resize' : 'h-[6px] cursor-row-resize'
        }`}
      >
        <span
          className={`flex items-center justify-center gap-[3px] rounded-full border border-separator bg-surface px-1.5 shadow-sm transition-colors group-hover:border-(--accent) ${
            isRow ? 'h-[24px] w-[10px] rotate-0' : 'h-[10px] w-[26px]'
          }`}
        >
          <i className="h-[3px] w-[3px] rounded-full bg-muted group-hover:bg-(--accent)" />
          <i className="h-[3px] w-[3px] rounded-full bg-muted group-hover:bg-(--accent)" />
          <i className="h-[3px] w-[3px] rounded-full bg-muted group-hover:bg-(--accent)" />
        </span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
