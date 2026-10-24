/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export interface ElementSize { w: number; h: number }

/**
 * Size (px) of an element, kept up to date while it is resized (for example when a divider is dragged). Charts that are
 * drawn with d3 or on a canvas use it as a dependency so they redraw to fill the space they are given.
 * `getEl` is called after each render of the owner whose `deps` changed, because the element may mount later.
 */
export function useElementSize(getEl: () => Element | null | undefined, deps: readonly unknown[]): ElementSize {
  const [size, setSize] = useState<ElementSize>({ w: 0, h: 0 });
  useEffect(() => {
    const el = getEl();
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const next = { w: Math.round(r.width), h: Math.round(r.height) };
      setSize(prev => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return size;
}
