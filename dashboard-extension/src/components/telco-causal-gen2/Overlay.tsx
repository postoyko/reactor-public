/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Floating UI (context menu, drawer, modals) is rendered into document.body instead of inside the panel.
 * Inside a host page, any ancestor with a transform / filter / contain makes `position: fixed` relative to that
 * ancestor instead of the window, which is what pushes popovers to the wrong place. A portal avoids that.
 * The wrapper keeps the panel's class so the scoped styles still apply, minus the panel's own padding/background.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="telco-causal-gen2-container tc-portal">{children}</div>, document.body);
}

/** A context menu that stays inside the window: flips left/up when it would run off the right/bottom edge. */
export function ClampedMenu({ x, y, className, children }: { x: number; y: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - height - margin));
    setPos({ left, top });
  }, [x, y]);

  return (
    <div ref={ref} className={className} style={{ left: pos.left, top: pos.top }} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}
