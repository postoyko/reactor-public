/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Severity colours (Concert Operate / Netcool palette, index = severity 0..6) and light / dark detection.
 */

import { RefObject, useEffect, useState } from 'react';

export const SEVERITY_COLORS = ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b', '#da1e28'];
export const sevColor = (s: number): string => SEVERITY_COLORS[Math.min(6, Math.max(0, Math.round(s)))];

/** True when the host's Carbon theme is dark (g90 / g100). Re-checked when the page theme changes. */
export function useIsDark(ref: RefObject<HTMLElement>): boolean {
  const [dark, setDark] = useState<boolean>(false);
  useEffect(() => {
    const check = (): void => {
      if (!ref.current) return;
      const bg = getComputedStyle(ref.current).getPropertyValue('--cds-background').trim();
      const m = /^#?([0-9a-f]{6})$/i.exec(bg);
      if (m) { const n = parseInt(m[1], 16); setDark((0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 128); return; }
      const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(bg);
      if (r) setDark((0.299 * +r[1] + 0.587 * +r[2] + 0.114 * +r[3]) < 128);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true });
    obs.observe(document.body, { attributes: true });
    return () => obs.disconnect();
  }, [ref]);
  return dark;
}
