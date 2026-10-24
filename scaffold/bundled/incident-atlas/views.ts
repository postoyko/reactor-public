/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Saved alert views ("Infrastructure" etc.), read the same way the Monitor Boxes component does:
 * the getFilters query returns tenant.filters [{name, conditionSet}], and conditionSetToAPIQuery turns each into a getAlerts filter.
 */

import { ALERT_QUERY_PARAMS } from '../constants';
import { conditionSetToAPIQuery } from '../shared/utils/filterUtils';
import { api } from './feed';

export interface SavedView { name: string; clause: string }

export async function loadViews(): Promise<SavedView[]> {
  const a: any = api();
  if (!a || typeof a.getFilters !== 'function') throw new Error('getFilters is not available in this API');
  const r = await a.getFilters({ tenantId: ALERT_QUERY_PARAMS.tenantId, condition: "type = 'alert'" });
  const list = r?.tenant?.filters || r?.data?.tenant?.filters || r?.filters || (Array.isArray(r) ? r : []);
  const out: SavedView[] = [];
  for (const f of list) {
    try { if (f?.name && f.conditionSet) out.push({ name: String(f.name), clause: conditionSetToAPIQuery(f.conditionSet) }); } catch (e) { /* skip a view that cannot be converted */ }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/** The view named in the page URL (?filtername=...), as the Alerts page uses. */
export function urlViewName(): string {
  try { return new URL(window.location.href).searchParams.get('filtername') || ''; } catch (e) { return ''; }
}
