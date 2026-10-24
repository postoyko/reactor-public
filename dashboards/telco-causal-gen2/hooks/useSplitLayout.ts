/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

/** The right-hand cards whose heights can be changed. */
export type PaneId = 'alarms' | 'blast' | 'ingest' | 'remediation';

export interface SplitLayout {
  /** Width of the incident rail in px, or undefined for the default. */
  left?: number;
  /** Width of the inspector rail in px, or undefined for the default. */
  right?: number;
  /** Share (0..1) of the centre column given to the topology; the insight views get the rest. */
  split?: number;
  /** Heights (px) of the inspector cards; a missing card takes the height of its content. */
  heights?: Partial<Record<PaneId, number>>;
}

const KEY = 'telco-causal-mesh:layout';

const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

function read(): SplitLayout {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    const heights: SplitLayout['heights'] = {};
    for (const id of ['alarms', 'blast', 'ingest', 'remediation'] as PaneId[]) {
      const h = num(raw?.heights?.[id], 80, 4000);
      if (h !== undefined) heights[id] = h;
    }
    return { left: num(raw?.left, 160, 900), right: num(raw?.right, 200, 1100), split: num(raw?.split, 0.1, 0.9), heights };
  } catch {
    return { heights: {} };
  }
}

/** The sizes chosen with the dividers. They are remembered in this browser only (a convenience, never required). */
export function useSplitLayout() {
  const [layout, setLayout] = useState<SplitLayout>(read);
  const update = useCallback((patch: (prev: SplitLayout) => SplitLayout) => {
    setLayout(prev => {
      const next = patch(prev);
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it in memory */ }
      return next;
    });
  }, []);
  return { layout, update };
}
