/*
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Widgets for the Concert Operate queries that are more than rows: incident insights (probable cause and similar
 * incidents), runbook activity, a people and teams picker, and application cards. Their settings live in carbon-specs.ts.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { MultiSelect, Select, SelectItem, Tag } from '@carbon/react';
import { useBuilder } from './context';
import { Status, WidgetData } from './Widgets';
import { Row, Widget } from './types';
import { ago, cell, semanticColor } from './rows';
import IncidentInsights from './IncidentInsights';
import { ALERT_QUERY_PARAMS } from '../constants';

type Props = Record<string, any>;
interface Arg { p: Props; w: Widget; d?: WidgetData }

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Incident insights: choose an incident from the (filtered) list; see its probable cause and similar earlier incidents. */
export function IncidentInsightsWidget({ p, w, d }: Arg) {
  const rows = useMemo(() => (d ? [...d.rows].sort((a, b) => num(a.priority, 9) - num(b.priority, 9)) : []), [d]);
  const [pick, setPick] = useState('');
  const cur = rows.find(r => String(r.id) === pick) || rows[0];
  return (
    <Status d={d as WidgetData}>
      {!cur ? <div className="db-note">No incident matches the current filters.</div> : (
        <div className="db-insight-widget">
          <Select id={`ii-${w.id}`} labelText={p.labelText || 'Incident'} size="sm" value={String(cur.id)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPick(e.target.value)}>
            {rows.slice(0, 100).map(r => <SelectItem key={String(r.id)} value={String(r.id)} text={`${cell(r, 'priority')} · ${String(r.title || r.id)}`} />)}
          </Select>
          <IncidentInsights storyId={String(cur.id)} title={String(cur.title || '')} show={p.show === 'probable cause' ? 'probable' : p.show === 'similar incidents' ? 'similar' : 'both'} />
        </div>
      )}
    </Status>
  );
}

interface Run { id: string; runbook: string; status: string; updated?: number; alert?: string }
const STATUS_KIND: Record<string, string> = { success: 'green', failure: 'red', cancel: 'gray', inprogress: 'blue' };

/** Runbook activity: recent runs of the runbooks attached to the alerts in view (getRunbooksAndPolicy). */
export function RunbookActivityWidget({ p, w, d }: Arg) {
  const ids = useMemo(() => {
    const s = new Set<string>();
    (d ? d.rows : []).forEach(r => { if (typeof r.runbookIds === 'string') r.runbookIds.split(',').forEach(i => { if (i) s.add(i); }); });
    return Array.from(s).sort().slice(0, 30);
  }, [d]);
  const key = ids.join(',');
  const [state, setState] = useState<{ runs?: Run[]; error?: string }>({});
  const byAlert = useMemo(() => { const m = new Map<string, Row>(); (d ? d.rows : []).forEach(r => m.set(String(r.id), r)); return m; }, [d]);
  useEffect(() => {
    let on = true;
    if (!key) { setState({ runs: [] }); return () => { on = false; }; }
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getRunbooksAndPolicy;
    if (typeof fn !== 'function') { setState({ error: 'Runbook activity is not available in this environment.' }); return () => { on = false; }; }
    Promise.resolve().then(() => fn({ tenantId: ALERT_QUERY_PARAMS.tenantId, runbookIds: key.split(','), policyId: '', policyIds: '', context: '', includePolicy: false, includePolicies: false, includeRunbooks: true })).then(
      (res: any) => {
        if (!on) return;
        const t = (res && res.tenant) || {};
        const names = new Map<string, string>(((t.runbooks || []) as any[]).map(r => [String(r.id), String(r.name || r.id)]));
        const runs: Run[] = ((t.runbookInstances || []) as any[]).map(x => {
          const m = /alert:([^,\s]+)/.exec(String(x.context || ''));
          const u = Date.parse(String(x.lastUpdated || ''));
          return { id: String(x.id), runbook: names.get(String(x.runbookId)) || String(x.runbookId), status: String(x.status || ''), updated: Number.isFinite(u) ? u : undefined, alert: m ? m[1] : undefined };
        }).sort((a, b) => (b.updated || 0) - (a.updated || 0));
        setState({ runs });
      },
      (e: any) => { if (on) setState({ error: e && e.message ? String(e.message) : 'Runbook runs could not be read.' }); }
    );
    return () => { on = false; };
  }, [key]);
  const runs = state.runs || [];
  const counts = new Map<string, number>();
  runs.forEach(r => counts.set(r.status, (counts.get(r.status) || 0) + 1));
  const limit = num(p.rows, 10);
  return (
    <Status d={d as WidgetData}>
      {state.error ? <div className="db-note">{state.error}</div> : !state.runs ? <div className="db-note">Reading runbook runs…</div> : ids.length === 0 ? <div className="db-note">None of these alerts has a runbook.</div> : (
        <div className="db-runs">
          {p.statusTags !== false && <div className="db-runs-tags">{Array.from(counts.entries()).map(([s, n]) => <Tag key={s} size="sm" type={(STATUS_KIND[s] || 'gray') as any}>{s} {n}</Tag>)}</div>}
          <table>
            <thead><tr><th>Runbook</th><th>Status</th><th>When</th><th>Alert</th></tr></thead>
            <tbody>{runs.slice(0, limit).map(r => {
              const a = r.alert ? byAlert.get(r.alert) : undefined;
              return <tr key={r.id}><td>{r.runbook}</td><td><Tag size="sm" type={(STATUS_KIND[r.status] || 'gray') as any}>{r.status}</Tag></td><td>{r.updated ? ago(r.updated) : '-'}</td><td>{a ? `${cell(a, 'resource')}` : r.alert ? r.alert.slice(0, 8) : '-'}</td></tr>;
            })}</tbody>
          </table>
          {runs.length === 0 && <div className="db-note">No runs recorded for these runbooks.</div>}
        </div>
      )}
    </Status>
  );
}

/** People and teams: the tenant's real users or groups (getUsersAndGroups), plus values already on the rows. Choosing filters other widgets. */
export function PeoplePickerWidget({ p, w, d }: Arg) {
  const { hub, setSelection } = useBuilder();
  const [, bump] = useState(0);
  useEffect(() => { let on = true; hub.directory().then(() => { if (on) bump(n => n + 1); }); return () => { on = false; }; }, [hub]);
  const field = w.config.groupBy || 'owner';
  const real = hub.directoryNames(field);
  const seen = d ? Array.from(new Set(d.base.map(r => cell(r, field)).filter(v => v && v !== '(none)'))) : [];
  const items = Array.from(new Set([...real, ...seen])).sort();
  const selected = d ? Array.from(d.selected) : [];
  return (
    <>
      <MultiSelect id={`pp-${w.id}`} titleText={p.titleText || 'Owner'} label={p.placeholder || 'Anyone'} size={p.size || 'md'} items={items}
        itemToString={(i: string) => String(i)} key={`${items.length}`}
        initialSelectedItems={selected}
        onChange={(e: any) => setSelection(w.id, w.config.query, field, (e.selectedItems || []) as string[])} />
      {items.length === 0 && <div className="db-note">No users or groups were returned for this tenant.</div>}
    </>
  );
}

/** Application cards: one per business application, coloured by its worst severity. */
export function ApplicationCardsWidget({ p, w, d }: Arg) {
  const { toggleFilter } = useBuilder();
  const rows = d ? [...d.rows].sort((a, b) => num(b.criticalityValue, 0) - num(a.criticalityValue, 0) || num(b.critical, 0) - num(a.critical, 0) || num(b.alerts, 0) - num(a.alerts, 0)) : [];
  const emits = w.config.emits !== false;
  return (
    <Status d={d as WidgetData}>
      <div className="db-appcards" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${num(p.minWidth, 190)}px, 1fr))` }}>
        {rows.map(r => {
          const sev = String(r.severityLabel || 'Healthy');
          const col = semanticColor('severityLabel', sev);
          const on = d ? d.selected.has(String(r.name)) : false;
          return (
            <button type="button" key={String(r.id)} className={`db-appcard${on ? ' on' : ''}`} disabled={!emits}
              onClick={() => toggleFilter(w.id, w.config.query, 'name', String(r.name))}
              title={`${r.name}: ${r.alerts} alerts, ${r.incidents} open incidents`}>
              <span className="db-appcard-band" style={col ? { background: col.fill, color: col.ink } : { background: '#198038', color: '#fff' }}>{sev}</span>
              <span className="db-appcard-name">{String(r.name)}</span>
              <span className="db-appcard-type">{String(r.type || 'application')}{r.criticality ? ` · ${r.criticality}` : ''}</span>
              <span className="db-appcard-nums">
                <span><b>{num(r.critical, 0)}</b> critical</span>
                <span><b>{num(r.major, 0)}</b> major</span>
                <span><b>{num(r.incidents, 0)}</b> incidents</span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <div className="db-note">No applications.</div>}
      </div>
    </Status>
  );
}
