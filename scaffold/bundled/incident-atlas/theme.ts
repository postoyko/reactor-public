/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reads the host's Carbon theme so the canvas matches the page.
 */

export interface Theme { bg: string; layer: string; ink: string; dim: string; line: string; ok: string; crit: string; major: string; minor: string; warn: string; ai: string; dark: boolean }
export const LIGHT: Theme = { bg: '#ffffff', layer: '#f4f4f4', ink: '#161616', dim: '#525252', line: '#e0e0e0', ok: '#24a148', crit: '#da1e28', major: '#ff832b', minor: '#f1c21b', warn: '#4589ff', ai: '#8a3ffc', dark: false };
export const DARK: Theme = { bg: '#161616', layer: '#262626', ink: '#f4f4f4', dim: '#c6c6c6', line: '#393939', ok: '#42be65', crit: '#fa4d56', major: '#ff832b', minor: '#f1c21b', warn: '#78a9ff', ai: '#be95ff', dark: true };
/** Reads the host's Carbon theme (g10 / white / g90 / g100) so the canvas matches the page. */
export function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el), v = (n: string) => cs.getPropertyValue(n).trim();
  const bg = v('--cds-background') || v('--cds-layer-01');
  let dark = false;
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.replace('#', '#'));
  if (m) { const n = parseInt(m[1], 16); dark = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 128; }
  else { const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(bg); if (r) dark = (0.299 * +r[1] + 0.587 * +r[2] + 0.114 * +r[3]) < 128; }
  const base = dark ? DARK : LIGHT;
  return { ...base, bg: bg || base.bg, layer: v('--cds-layer-01') || base.layer, ink: v('--cds-text-primary') || base.ink, dim: v('--cds-text-secondary') || base.dim, line: v('--cds-border-subtle-01') || base.line };
}
export const sevColor = (t: Theme, s: number) => (s >= 6 ? t.crit : ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b'][Math.min(5, Math.max(0, Math.round(s)))]);
export const withAlpha = (hex: string, a: number) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/** Concert Operate / Netcool severity palette, index = severity 0..6. */
export const SEVERITY_COLORS = ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b', '#da1e28'];
