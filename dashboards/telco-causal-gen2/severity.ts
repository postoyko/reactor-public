/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The one severity palette, the same as Concert Operate / Netcool (SEVERITY_COLORS in the host's constants/rows):
 * 0 clear grey, 1 indeterminate purple, 2 information light blue, 3 warning blue, 4 minor yellow, 5 major orange, 6 critical red.
 */
export const SEVERITY_COLORS = ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b', '#da1e28'];
const clampSev = (s: number) => Math.min(6, Math.max(0, Math.round(Number.isFinite(s) ? s : 0)));
export const severityHex = (severity: number): string => SEVERITY_COLORS[clampSev(severity)];
export const severityNum = (severity: number): number => parseInt(severityHex(severity).slice(1), 16);
const mix = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
export const severityPastel = (severity: number): string => mix(severityHex(severity), 0.6);
export const severityPastelEdge = (severity: number): string => mix(severityHex(severity), 0.3);
/** Text colour that reads on top of a severity fill. */
export const severityInk = (severity: number): string => ([2, 4, 5, 0].includes(clampSev(severity)) ? '#161616' : '#ffffff');
