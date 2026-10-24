/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Colours shared by the insight views so a severity or a tier looks the same everywhere.
 */

import { LAYER_BY_ID } from './classification';

export { severityHex, severityPastel, severityPastelEdge, severityInk } from './severity';

export const SEVERITY_LABEL = (severity: number): string => ['Clear', 'Indeterminate', 'Information', 'Warning', 'Minor', 'Major', 'Critical'][Math.min(6, Math.max(0, Math.round(severity || 0)))];

/** Tier accent colours (match the strata colours of the 3D scene). */
export const TIER_HEX: Record<number, string> = Object.fromEntries(Object.values(LAYER_BY_ID).map(l => [l.id, l.color]));

export const formatTime = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const formatDateTime = (ms: number): string => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

