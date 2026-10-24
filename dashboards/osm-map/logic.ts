/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure data logic: turn the getAlerts result into alerts, and place alerts on sites.
 */

export interface Alert { id: string; severity: number; state: string; summary: string; resource: string; sender: string }
export interface Site { id: string; name: string; lat: number; lng: number; match: string[] }
export interface SiteMarker { site: Site; alerts: Alert[]; severity: number }
export interface Located { markers: SiteMarker[]; unlocated: number }

export const SEVERITY_LABELS = ['Clear', 'Indeterminate', 'Information', 'Warning', 'Minor', 'Major', 'Critical'];
export const severityLabel = (s: number): string => SEVERITY_LABELS[Math.min(6, Math.max(0, Math.round(s)))];

/** Concert writes "-" where a value is missing. */
const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '' || v === '-';

export const validCoord = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** getAlerts returns { columns, rows[].fields[] }; turn it into plain alerts. */
export function adaptAlerts(data: any): Alert[] {
  const src = data?.tenant?.alerts;
  const cols: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const rows: any[] = Array.isArray(src?.rows) ? src.rows : [];
  const idx = new Map<string, number>();
  cols.forEach((c, i) => { if (c && c.name) idx.set(c.name, i); });
  const out: Alert[] = [];
  rows.forEach((r: any) => {
    const f: unknown[] = (r && r.fields) || [];
    const get = (n: string): string => {
      const i = idx.get(n);
      const v = i === undefined ? undefined : f[i];
      return isEmpty(v) ? '' : String(v);
    };
    const id = get('id');
    if (!id) return;
    out.push({ id, severity: Number(get('severity')) || 0, state: get('state'), summary: get('summary'), resource: get('resource.name'), sender: get('sender.name') });
  });
  return out;
}

/** Puts each alert on the first site whose `match` word appears in the resource name (not case sensitive). */
export function locate(alerts: Alert[], sites: Site[]): Located {
  const usable = sites.filter(s => validCoord(s.lat, s.lng));
  const bySite = new Map<string, SiteMarker>();
  let unlocated = 0;
  alerts.forEach(a => {
    const name = a.resource.toLowerCase();
    const site = name ? usable.find(s => s.match.some(w => w && name.includes(w.toLowerCase()))) : undefined;
    if (!site) { unlocated += 1; return; }
    const m = bySite.get(site.id) || { site, alerts: [], severity: 0 };
    m.alerts.push(a);
    m.severity = Math.max(m.severity, a.severity);
    bySite.set(site.id, m);
  });
  const markers = Array.from(bySite.values());
  markers.forEach(m => m.alerts.sort((x, y) => y.severity - x.severity));
  markers.sort((x, y) => y.severity - x.severity || y.alerts.length - x.alerts.length);
  return { markers, unlocated };
}
