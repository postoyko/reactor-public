/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef } from 'react';

export type SplitPhase = 'start' | 'move' | 'end';

interface SplitterProps {
  /** `col` is a vertical bar that changes widths; `row` is a horizontal bar that changes heights. */
  direction: 'col' | 'row';
  label: string;
  /** Called with the distance (px) moved since the drag began. `start` and `end` carry 0. */
  onResize: (delta: number, phase: SplitPhase) => void;
  /** Double click: back to the default size. */
  onReset?: () => void;
  className?: string;
}

const KEY_STEP = 24;

/**
 * A draggable divider with keyboard support (arrow keys, Home / double click to reset). It reports a pixel distance and
 * leaves it to the caller to decide what that means for the panes either side.
 */
export function Splitter({ direction, label, onResize, onReset, className }: SplitterProps): JSX.Element {
  const drag = useRef<{ from: number; stop: () => void } | null>(null);
  const cb = useRef(onResize);
  cb.current = onResize;

  useEffect(() => () => drag.current?.stop(), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const axis = direction === 'col' ? 'clientX' : 'clientY';
    const from = e[axis];
    const move = (ev: PointerEvent) => cb.current(ev[axis] - from, 'move');
    const body = document.body;
    const prevCursor = body.style.cursor, prevSelect = body.style.userSelect;
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      body.style.cursor = prevCursor; body.style.userSelect = prevSelect;
      drag.current = null;
    };
    const up = () => { stop(); cb.current(0, 'end'); };
    body.style.cursor = direction === 'col' ? 'col-resize' : 'row-resize';
    body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    drag.current = { from, stop };
    cb.current(0, 'start');
  }, [direction]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const back = direction === 'col' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = direction === 'col' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === 'Home' || e.key === 'Escape') { if (onReset) { e.preventDefault(); onReset(); } return; }
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    cb.current(0, 'start');
    cb.current(e.key === back ? -KEY_STEP : KEY_STEP, 'move');
    cb.current(0, 'end');
  };

  return (
    <div
      role="separator"
      aria-orientation={direction === 'col' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={`${label} (drag, arrow keys; double-click to reset)`}
      tabIndex={0}
      className={`tc-splitter tc-splitter--${direction}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      onClick={e => e.stopPropagation()}
    >
      <span className="tc-splitter-grip" aria-hidden="true" />
    </div>
  );
}
