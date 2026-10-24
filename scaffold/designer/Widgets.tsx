/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The data widgets. Each one reads its rows from the shared DataHub, applies its fixed condition and the
 * filters other widgets have set, and draws only what those rows contain.
 */

import ThresholdBell, { useThreshold } from './ThresholdBell';
import { LinkCtx } from './nest';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Widget, Row, Cond, QueryName } from './types';
import { useBuilder } from './context';
import { sourceKey, SourceState } from './datahub';
import {
  applyFilters, Bucket, cell, DEFAULT_GROUP, displayCell, DEFAULT_TIME, fieldLabel, fieldsOf, formatNumber, groupMetric,
  metricValue, NONE, orderSeverity, semanticColor, SEVERITY_COLORS, SEVERITY_LABELS, timeBins
} from './rows';
import { Tile } from './Tiles';
import { Slot } from './nest';
import { openAddress } from './drill';
import { shapeOf } from './sources';
import { tileDef } from './registry';
import { CarbonWidget } from './carbon-catalog';
import { useEmit } from './actions';

export interface WidgetData {
  rows: Row[];
  /** Rows after the fixed condition but before other widgets' filters. */
  base: Row[];
  state: SourceState;
  /** Values this widget has selected on a field (to highlight, since it does not filter itself). */
  selected: Set<string>;
  followed: number;
  /** For "Explain this" (right-click): what the rows are and where they show. */
  query?: QueryName;
  title?: string;
}

/** One `where` condition; numeric compare when both sides are numbers, otherwise text. */
export function matches(r: Row, c: Cond): boolean {
  const v = cell(r, c.field);
  const a = Number(v), b = Number(c.value);
  const num = v !== '' && c.value !== '' && Number.isFinite(a) && Number.isFinite(b);
  switch (c.op || '=') {
    case 'contains': return String(v).toLowerCase().includes(String(c.value).toLowerCase());
    case '!=': return num ? a !== b : v !== c.value;
    case '<': return num && a < b;
    case '<=': return num && a <= b;
    case '>': return num && a > b;
    case '>=': return num && a >= b;
    default: return num ? a === b : v === c.value;
  }
}

export function useWidgetData(w: Widget): WidgetData {
  const { hub, filters, links, values, binds, bar } = useBuilder();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const cfg = w.config;
  const refresh = cfg.refreshSeconds || 0;
  useEffect(() => hub.acquire(cfg.query, cfg.filter, refresh, bump), [hub, cfg.query, cfg.filter, refresh]);
  const state = hub.snapshot(sourceKey(cfg.query, cfg.filter));

  // Value inputs wired to this widget filter its rows too.
  const fromInputs: Cond[] = (binds || [])
    .filter(b => b.sendTo.includes(w.id) && b.bind.query === cfg.query)
    .map(b => ({ field: b.bind.field, op: b.bind.op as Cond['op'], value: values && values[b.id] !== undefined ? values[b.id] : b.def }));
  const conds = [cfg.where, ...(cfg.also || []), ...fromInputs].filter((c): c is Cond => !!c && !!c.field && c.value !== '');
  const condKey = JSON.stringify(conds);
  const gate = bar && cfg.followBar !== false ? bar : undefined;
  const base = useMemo(
    () => (conds.length || gate ? state.rows.filter(r => conds.every(c => matches(r, c)) && (!gate || gate.pass(cfg.query, r))) : state.rows),
    [state.rows, condKey, gate ? gate.key : '']
  );
  const mine = filters.filter(f => f.query === cfg.query);
  // Wiring: a widget with sendTo only reaches the widgets it lists.
  const reaches = (from: string) => { const t = links ? links[from] : undefined; return !t || t.includes(w.id); };
  const followed = cfg.listens === false ? [] : mine.filter(f => f.from !== w.id && reaches(f.from));
  const key = followed.map(f => `${f.field}=${f.value}`).join('&');
  const rows = useMemo(() => applyFilters(base, followed), [base, key]);
  const selected = new Set(mine.filter(f => f.from === w.id).map(f => f.value));
  return { rows, base, state, selected, followed: followed.length, query: cfg.query, title: w.title };
}

/** Drill-through for a widget, when it has one: what a click opens. */
export function useDrillAction(w: Widget) {
  const { drill } = useBuilder();
  const dr = w.config.drill;
  if (!dr) return null;
  return {
    mode: dr.mode,
    go: (title: string, rows: Row[], rec: Record<string, unknown>) => {
      if (dr.mode === 'link') { if (dr.url) openAddress(dr.url, rec, dr.newTab !== false); return; }
      if (drill) drill({ title, query: w.config.query, rows, columns: w.config.columns, url: dr.url, newTab: dr.newTab });
    }
  };
}

export function Status({ d, children }: { d: WidgetData; children: React.ReactNode }) {
  const { state } = d;
  const { drill } = useBuilder();
  if (state.error && state.rows.length === 0) {
    // a source still waiting for its incident id or filter is not a failure: say what it needs
    if (/^Enter the /.test(state.error)) return <div className="db-empty"><strong>Waiting for a value</strong><span>{state.error}</span></div>;
    return <div className="db-empty" role="alert"><strong>Query failed</strong><span>{state.error}</span></div>;
  }
  // Until the first answer arrives there is nothing true to show yet, not even a zero.
  if (state.updated === undefined) return <div className="db-empty">Loading…</div>;
  // Right-click on alerts or incidents: "Explain this" for everything the widget shows
  const explainable = Boolean(drill && d.query && d.rows.length && (shapeOf(d.query) === 'alerts' || shapeOf(d.query) === 'stories'));
  const onContext = explainable ? (e: React.MouseEvent) => {
    if (e.shiftKey) return; // Shift+right-click: the browser's own menu
    e.preventDefault();
    drill!({ title: `Explain: ${d.title || 'this widget'}`, query: d.query!, rows: d.rows, explain: true });
  } : undefined;
  return (
    <div className="db-explain-zone" onContextMenu={onContext}>
      {state.error && <div className="db-banner" role="alert">Refresh failed: {state.error}. Showing the last result.</div>}
      {state.truncated && <div className="db-banner">Showing the first {state.rows.length.toLocaleString()} of {state.truncated.toLocaleString()} rows. Narrow the source (a filter or a condition) to see the rest.</div>}
      {children}
    </div>
  );
}

export function Note({ d }: { d: WidgetData }) {
  if (d.followed === 0 && d.rows.length === d.base.length) return null;
  return <div className="db-note">{d.rows.length} of {d.base.length} after {d.followed} filter{d.followed === 1 ? '' : 's'}</div>;
}

/* ───────────── Number ───────────── */
/** A number that counts one severity or priority gets that colour as a stripe on its edge (unless the tile is already tinted). */
function stripe(c: Widget['config']): React.CSSProperties | undefined {
  const sem = !c.bg && c.where ? semanticColor(c.where.field, c.where.value) : undefined;
  return sem ? { borderLeft: `4px solid ${sem.fill}`, paddingLeft: 10 } : undefined;
}

export function KpiWidget({ w }: { w: Widget }) {
  const d = useWidgetData(w);
  const act = useDrillAction(w);
  const c = w.config;
  const metric = c.metric || 'count';
  const v = metricValue(d.rows, metric, c.valueField);
  const needsField = metric !== 'count';
  const view = React.useContext(LinkCtx);
  const th = useThreshold(w.id, v, w.title);
  return (
    <Status d={d}>
      <div className={`db-kpi${th.hit ? ' db-kpi-hit' : ''}`} style={stripe(c)}>
        {view && view.viewing && c.notify !== false && v !== undefined && <ThresholdBell rule={th.rule} hit={th.hit} setRule={th.setRule} />}
        {act ? (
          <button type="button" className="db-kpi-value db-kpi-click" title="Click for the rows behind this number" onClick={() => act.go(`${w.title}: ${v === undefined ? 'n/a' : formatNumber(v)}`, d.rows, { count: d.rows.length, value: v === undefined ? '' : v })}>{v === undefined ? 'n/a' : formatNumber(v)}</button>
        ) : (
          <div className="db-kpi-value" aria-live="polite">{v === undefined ? 'n/a' : formatNumber(v)}</div>
        )}
        <div className="db-kpi-sub">
          {needsField && !c.valueField ? 'Pick a field in settings.' : v === undefined ? 'No numeric values in the loaded rows.' : (c.text && c.text.trim()) || metricLabel(w)}
        </div>
        <Note d={d} />
      </div>
    </Status>
  );
}

function metricLabel(w: Widget): string {
  const c = w.config;
  const m = c.metric || 'count';
  const f = c.valueField ? fieldLabel(c.query, c.valueField).toLowerCase() : '';
  const all = [c.where, ...(c.also || [])].filter((x): x is Cond => !!x && !!x.field);
  const cond = all.length ? ` where ${all.map(x => `${fieldLabel(c.query, x.field).toLowerCase()} ${x.op && x.op !== '=' ? x.op : 'is'} ${x.value}`).join(' and ')}` : '';
  const what = m === 'count' ? 'rows' : m === 'distinct' ? `distinct ${f}` : `${m} of ${f}`;
  return `${what}${cond}`;
}

/* ───────────── Bar ───────────── */
function useBuckets(w: Widget, d: WidgetData): Bucket[] {
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  return useMemo(() => {
    const raw = groupMetric(d.rows, group, c.metric || 'count', c.valueField, c.limit || 8);
    return group === 'severityLabel' ? orderSeverity(raw) : raw;
  }, [d.rows, group, c.metric, c.valueField, c.limit]);
}

function colorFor(group: string, key: string, i: number): string {
  const sem = semanticColor(group, key);
  if (sem) return sem.fill;
  return d3.schemeTableau10[i % 10];
}

export function BarWidget({ w }: { w: Widget }) {
  const { toggleFilter } = useBuilder();
  const d = useWidgetData(w);
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  const buckets = useBuckets(w, d);
  const max = buckets.reduce((m, b) => Math.max(m, b.value), 0) || 1;
  const act = useDrillAction(w);
  const emits = c.emits !== false || !!act;
  const pick = (key: string, value: number) => {
    if (act) act.go(`${fieldLabel(c.query, group)}: ${key}`, d.rows.filter(r => cell(r, group) === key), { [group]: key, value: key, count: value });
    else toggleFilter(w.id, c.query, group, key);
  };
  return (
    <Status d={d}>
      {buckets.length === 0 ? <div className="db-empty">No rows{d.followed ? ' match the active filters' : ''}.</div> : (
        <ul className="db-bars">
          {buckets.map((b, i) => {
            const isOther = b.key.startsWith('Other (');
            const on = d.selected.has(b.key);
            const dim = d.selected.size > 0 && !on;
            return (
              <li key={b.key}>
                <button
                  type="button"
                  className={`db-bar${on ? ' on' : ''}${dim ? ' dim' : ''}`}
                  disabled={!emits || isOther}
                  aria-pressed={emits && !isOther ? on : undefined}
                  title={`${b.key}: ${formatNumber(b.value)}${emits && !isOther ? (act ? (act.mode === 'link' ? ' (click to open)' : ' (click for the rows)') : ' (click to filter)') : ''}`}
                  onClick={() => pick(b.key, b.value)}
                >
                  <span className="db-bar-label">{b.key}</span>
                  <span className="db-bar-track"><i style={{ width: `${Math.max((b.value / max) * 100, 2)}%`, background: colorFor(group, b.key, i) }} /></span>
                  <span className="db-bar-value">{formatNumber(b.value)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Note d={d} />
    </Status>
  );
}

/* ───────────── Donut ───────────── */
export function DonutWidget({ w }: { w: Widget }) {
  const { toggleFilter } = useBuilder();
  const d = useWidgetData(w);
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  const buckets = useBuckets(w, d);
  const total = buckets.reduce((a, b) => a + b.value, 0);
  const act = useDrillAction(w);
  const emits = c.emits !== false || !!act;
  const pick = (key: string, value: number) => {
    if (act) act.go(`${fieldLabel(c.query, group)}: ${key}`, d.rows.filter(r => cell(r, group) === key), { [group]: key, value: key, count: value });
    else toggleFilter(w.id, c.query, group, key);
  };
  const arcs = useMemo(() => {
    const pie = d3.pie<Bucket>().value(b => b.value).sort(null)(buckets);
    const arc = d3.arc<d3.PieArcDatum<Bucket>>().innerRadius(34).outerRadius(54).padAngle(0.02);
    return pie.map(p => ({ p, path: arc(p) || '' }));
  }, [buckets]);
  return (
    <Status d={d}>
      {total === 0 ? <div className="db-empty">No rows{d.followed ? ' match the active filters' : ''}.</div> : (
        <div className="db-donut">
          <svg viewBox="-60 -60 120 120" role="img" aria-label={`${fieldLabel(c.query, group)} share`}>
            {arcs.map(({ p, path }, i) => {
              const key = p.data.key;
              const on = d.selected.has(key);
              const dim = d.selected.size > 0 && !on;
              const isOther = key.startsWith('Other (');
              return (
                <path
                  key={key}
                  d={path}
                  fill={colorFor(group, key, i)}
                  opacity={dim ? 0.35 : 1}
                  stroke={on ? '#161616' : 'none'}
                  strokeWidth={on ? 1.5 : 0}
                  style={{ cursor: emits && !isOther ? 'pointer' : 'default' }}
                  onClick={() => { if (emits && !isOther) pick(key, p.data.value); }}
                >
                  <title>{key}: {formatNumber(p.data.value)} ({Math.round((p.data.value / total) * 100)}%)</title>
                </path>
              );
            })}
            <text textAnchor="middle" dy="0.1em" className="db-donut-total">{formatNumber(total)}</text>
          </svg>
          <ul className="db-legend">
            {buckets.map((b, i) => {
              const on = d.selected.has(b.key);
              const isOther = b.key.startsWith('Other (');
              return (
                <li key={b.key}>
                  <button
                    type="button"
                    className={`db-legend-item${on ? ' on' : ''}`}
                    disabled={!emits || isOther}
                    aria-pressed={emits && !isOther && !act ? on : undefined}
                    onClick={() => pick(b.key, b.value)}
                  >
                    <i style={{ background: colorFor(group, b.key, i) }} />
                    <span>{b.key}</span>
                    <b>{formatNumber(b.value)}</b>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Note d={d} />
    </Status>
  );
}

/* ───────────── Timeline ───────────── */
function useWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [w, setW] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0) setW(Math.round(width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return w;
}

export function TimeseriesWidget({ w }: { w: Widget }) {
  const d = useWidgetData(w);
  const c = w.config;
  const field = c.timeField || DEFAULT_TIME[c.query];
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const { bins, missing } = useMemo(() => timeBins(d.rows, field, 24), [d.rows, field]);
  const H = 150;
  const padL = 30;
  const padB = 20;
  const plotW = Math.max(width - padL - 8, 40);
  const plotH = H - padB - 8;
  const maxV = bins.reduce((m, b) => Math.max(m, b.value), 0) || 1;
  const x = bins.length ? d3.scaleTime().domain([new Date(bins[0].start), new Date(bins[bins.length - 1].end)]).range([0, plotW]) : null;
  const y = d3.scaleLinear().domain([0, maxV]).nice().range([plotH, 0]);
  const area = x ? d3.area<{ start: number; end: number; value: number }>()
    .x(b => (x as d3.ScaleTime<number, number>)(new Date((b.start + b.end) / 2))).y0(plotH).y1(b => y(b.value)).curve(d3.curveMonotoneX)(bins) : '';
  const ticks = x ? x.ticks(Math.max(Math.floor(plotW / 90), 2)) : [];
  return (
    <Status d={d}>
      {bins.length === 0 ? <div className="db-empty">No rows with a “{fieldLabel(c.query, field)}” time{missing ? ` (${missing} without one)` : ''}.</div> : (
        <div ref={ref} className="db-ts">
          <svg width={width} height={H} role="img" aria-label={`Rows over ${fieldLabel(c.query, field)}`}>
            <g transform={`translate(${padL},4)`}>
              {y.ticks(3).map(t => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x2={plotW} stroke="#e0e0e0" />
                  <text x={-4} dy="0.32em" textAnchor="end" className="db-axis">{formatNumber(t)}</text>
                </g>
              ))}
              <path d={area || ''} fill="#0f62fe" fillOpacity={0.18} stroke="#0f62fe" strokeWidth={1.5} />
              <g transform={`translate(0,${plotH})`}>
                {x && ticks.map(t => (
                  <text key={+t} x={x(t)} y={14} textAnchor="middle" className="db-axis">{d3.timeFormat('%H:%M')(t)}</text>
                ))}
              </g>
            </g>
          </svg>
          {missing > 0 && <div className="db-note">{missing} row{missing === 1 ? ' has' : 's have'} no time and {missing === 1 ? 'is' : 'are'} not shown.</div>}
          <Note d={d} />
        </div>
      )}
    </Status>
  );
}

/* ───────────── Table ───────────── */
export function TableWidget({ w }: { w: Widget }) {
  const d = useWidgetData(w);
  const act = useDrillAction(w);
  const c = w.config;
  const cols = (c.columns && c.columns.length ? c.columns : fieldsOf(c.query).slice(0, 4).map(f => f.key));
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(c.sortBy ? { key: c.sortBy, desc: Boolean(c.sortDesc) } : null);
  const limit = c.limit || 50;
  const sorted = useMemo(() => {
    if (!sort) return d.rows;
    const dir = sort.desc ? -1 : 1;
    return d.rows.slice().sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [d.rows, sort]);
  const shown = sorted.slice(0, limit);
  return (
    <Status d={d}>
      {d.rows.length === 0 ? <div className="db-empty">No rows{d.followed ? ' match the active filters' : ''}.</div> : (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                {cols.map(k => (
                  <th key={k} aria-sort={sort && sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" onClick={() => setSort(s => (s && s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: false }))}>
                      {fieldLabel(c.query, k)}{sort && sort.key === k ? (sort.desc ? ' ▼' : ' ▲') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.id}-${i}`} className={act ? 'db-row-click' : undefined} tabIndex={act ? 0 : undefined}
                  onClick={act ? () => act.go(`${cell(r, cols[0])}`, [r], r as Record<string, unknown>) : undefined}
                  onKeyDown={act ? e => { if (e.key === 'Enter') act.go(`${cell(r, cols[0])}`, [r], r as Record<string, unknown>); } : undefined}>
                  {cols.map(k => {
                    const shown = displayCell(c.query, k, r);
                    const sem = k === 'severityLabel' || k === 'severity' || k === 'priority' ? semanticColor(k, String(r[k] ?? '')) : undefined;
                    return (
                      <td key={k} title={cell(r, k)} className={`${r[k] === undefined ? 'none' : ''}${k === 'alertCount' || k === 'severity' ? ' num' : ''}`.trim()}>
                        {sem && k === 'priority' ? <span className="db-pri" style={{ background: sem.fill, color: sem.ink }}>{shown}</span>
                          : sem ? <span className="db-sev"><i style={{ background: sem.fill }} />{shown}</span> : shown}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="db-note">{shown.length < d.rows.length ? `Showing ${shown.length} of ${d.rows.length}. ` : ''}{d.followed ? `${d.rows.length} of ${d.base.length} after filters.` : ''}</div>
    </Status>
  );
}

/* ───────────── Note + dispatcher ───────────── */
export function TextWidget({ w }: { w: Widget }) {
  // A little structure: "# Heading" on its own line, "- item" for a bullet, anything else is a paragraph.
  const lines = String(w.config.text || '').split('\n');
  return (
    <div className="db-text">
      {lines.map((l, i) => l.startsWith('# ') ? <h2 key={i} className="db-text-h">{l.slice(2)}</h2>
        : l.startsWith('- ') ? <div key={i} className="db-text-li">{l.slice(2)}</div>
          : l.trim() === '' ? <div key={i} className="db-text-gap" /> : <p key={i} className="db-text-p">{l}</p>)}
    </div>
  );
}

export function ImageWidget({ w }: { w: Widget }) {
  const c = w.config;
  if (!c.src) return <div className="db-empty">No image yet. Open the settings and choose a file.</div>;
  return (
    <div className="db-image">
      <img src={c.src} alt={c.alt || w.title} style={{ objectFit: c.fit || 'contain' }} draggable={false} />
    </div>
  );
}

/** Every widget can raise "is clicked": the wrapper takes no space of its own. */
export function WidgetBody({ w }: { w: Widget }) {
  const emit = useEmit(w);
  const text = (e: React.SyntheticEvent): string => { const t = e.target as HTMLInputElement; return t && typeof t.value === 'string' ? t.value : ''; };
  const edge = (e: React.PointerEvent, ev: string): void => {
    const to = e.relatedTarget as HTMLElement | null;
    const mine = (e.currentTarget as HTMLElement).closest('[data-wid]');
    if (!mine || !to || !to.closest || to.closest('[data-wid]') !== mine) emit(ev);
  };
  return (
    <div style={{ display: 'contents' }} onClick={() => emit('click')} onDoubleClick={() => emit('dblclick')}
      onPointerOver={e => edge(e, 'hover')} onPointerOut={e => edge(e, 'leave')}
      onInput={e => emit('input', text(e))} onKeyDown={e => { if (e.key === 'Enter') emit('enter', text(e)); }}
      onFocus={() => emit('focus')} onBlur={() => emit('blur')}>{bodyOf(w)}</div>
  );
}

function bodyOf(w: Widget): React.ReactNode {
  switch (w.type) {
    case 'kpi': return <KpiWidget w={w} />;
    case 'bar': return <BarWidget w={w} />;
    case 'donut': return <DonutWidget w={w} />;
    case 'timeseries': return <TimeseriesWidget w={w} />;
    case 'table': return <TableWidget w={w} />;
    case 'text': return <TextWidget w={w} />;
    case 'image': return <ImageWidget w={w} />;
    case 'group': return <Slot id={`${w.id}#0`} />;
    default: {
      if (w.type.startsWith('carbon:')) return <CarbonWidget w={w} />;
      const t = tileDef(w.type);
      return t ? <Tile id={t.id} name={t.label} props={w.config.settings ? { ...(w.config.props || {}), settings: w.config.settings } : w.config.props} /> : <div className="db-empty">Unknown widget type “{w.type}”.</div>;
    }
  }
}

export { NONE };
