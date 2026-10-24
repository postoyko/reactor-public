/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carbon Charts as dashboard widgets. A chart reads its rows exactly like the Bar chart and Number do: from the shared
 * DataHub, narrowed by the dashboard filter bar, the widget's own condition and the filters other widgets have set.
 * Clicking a bar, slice, cell or node sets a filter (or opens the drill-through when the widget has one), so every
 * chart takes part in the wiring: it can send to chosen widgets and it follows filters sent to it.
 *
 * Settings: Data > Group by (what the bars / slices / columns are), Series by (a second split), Time field (line and
 * area), Measure (what is counted or averaged). Thresholds on the gauge and meter use the same warning / critical rule
 * as the status indicators (see carbon-status.tsx).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as CC from '@carbon/charts-react';
import { Row, Widget } from './types';
import { useBuilder } from './context';
import { cell, DEFAULT_GROUP, DEFAULT_TIME, fieldLabel, formatNumber, groupMetric, metricValue, orderSeverity, semanticColor, SEVERITY_COLORS, SEVERITY_LABELS } from './rows';
import { Note, Status, useDrillAction, WidgetData } from './Widgets';
import { levelOf, Thresholds } from './carbon-status';

type Props = Record<string, any>;

const PALETTE = ['#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56', '#570408', '#198038', '#002d9c', '#ee538b', '#b28600', '#009d9a', '#012749', '#8a3800', '#a56eff'];
const DIM = '#c6c6c6';
const OTHER = /^Other \(/;

const COMPONENTS: Record<string, React.ComponentType<any>> = {
  SimpleBarChart: CC.SimpleBarChart, GroupedBarChart: CC.GroupedBarChart, StackedBarChart: CC.StackedBarChart, LollipopChart: CC.LollipopChart,
  LineChart: CC.LineChart, AreaChart: CC.AreaChart, StackedAreaChart: CC.StackedAreaChart, ScatterChart: CC.ScatterChart,
  PieChart: CC.PieChart, DonutChart: CC.DonutChart, GaugeChart: CC.GaugeChart, MeterChart: CC.MeterChart,
  HeatmapChart: CC.HeatmapChart, TreemapChart: CC.TreemapChart, RadarChart: CC.RadarChart, WordCloudChart: CC.WordCloudChart, AlluvialChart: CC.AlluvialChart
};

/** The chart event each kind reports clicks on. */
const CLICK: Record<string, string> = {
  SimpleBarChart: 'bar-click', GroupedBarChart: 'bar-click', StackedBarChart: 'bar-click', LollipopChart: 'scatter-click',
  LineChart: 'scatter-click', AreaChart: 'scatter-click', StackedAreaChart: 'scatter-click', ScatterChart: 'scatter-click',
  PieChart: 'pie-slice-click', DonutChart: 'pie-slice-click', GaugeChart: 'gauge-arc-click', MeterChart: 'meter-click',
  HeatmapChart: 'heatmap-click', TreemapChart: 'leaf-click', RadarChart: 'radar-x-axis-click', WordCloudChart: 'wordcloud-word-click', AlluvialChart: 'alluvial-node-click'
};

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

function colorOf(field: string, key: string, i: number): string {
  const sem = semanticColor(field, key);
  if (sem) return sem.fill;
  return PALETTE[i % PALETTE.length];
}
function scaleFor(field: string, keys: string[], selected?: Set<string>): Record<string, string> {
  const o: Record<string, string> = {};
  keys.forEach((k, i) => { o[k] = selected && selected.size > 0 && !selected.has(k) ? DIM : colorOf(field, k, i); });
  return o;
}

interface Built { data: any; options: Record<string, any>; empty?: string; rowsOf?: (e: any) => { title: string; pairs: Array<[string, string]> } | null }

function metricName(c: Widget['config']): string {
  const m = c.metric || 'count';
  const f = c.valueField ? fieldLabel(c.query, c.valueField) : '';
  return m === 'count' ? 'Rows' : m === 'distinct' ? `Distinct ${f}` : `${m === 'avg' ? 'Average' : m === 'sum' ? 'Total' : 'Highest'} ${f}`;
}

/** Group x series table: categories (top by the measure), series (top few), one value per pair. */
function crossTab(rows: Row[], c: Widget['config'], groupBy: string, limit: number) {
  const metric = c.metric || 'count';
  let cats = groupMetric(rows, groupBy, metric, c.valueField, limit + 1).filter(b => !OTHER.test(b.key));
  if (groupBy === 'severityLabel') cats = orderSeverity(cats);
  cats = cats.slice(0, limit);
  const catSet = new Set(cats.map(b => b.key));
  const inCats = rows.filter(r => catSet.has(cell(r, groupBy)));
  let sers: string[];
  if (c.seriesBy) {
    sers = groupMetric(inCats, c.seriesBy, 'count', undefined, 9).filter(b => !OTHER.test(b.key)).slice(0, 8).map(b => b.key);
    if (c.seriesBy === 'severityLabel') sers = orderSeverity(sers.map(k => ({ key: k, value: 0 }))).map(b => b.key);
  } else sers = [metricName(c)];
  const cells: Array<{ cat: string; ser: string; value: number }> = [];
  cats.forEach(cat => {
    const mine = inCats.filter(r => cell(r, groupBy) === cat.key);
    sers.forEach(ser => {
      const part = c.seriesBy ? mine.filter(r => cell(r, c.seriesBy as string) === ser) : mine;
      const v = metricValue(part, metric, c.valueField);
      cells.push({ cat: cat.key, ser, value: v === undefined ? 0 : v });
    });
  });
  return { cats: cats.map(b => b.key), sers, cells };
}

function toTime(v: unknown): number { return v === undefined ? NaN : typeof v === 'number' ? v : Date.parse(String(v)); }

/** The measure per time slot, one line per series value. */
function timeTab(rows: Row[], c: Widget['config'], field: string, bins: number) {
  const metric = c.metric || 'count';
  const stamped = rows.map(r => ({ r, t: toTime(r[field]) })).filter(x => Number.isFinite(x.t));
  if (stamped.length === 0) return { data: [] as any[], missing: rows.length };
  let lo = Infinity, hi = -Infinity;
  stamped.forEach(x => { if (x.t < lo) lo = x.t; if (x.t > hi) hi = x.t; });
  if (hi === lo) { lo -= 30000; hi += 30000; }
  const n = Math.min(Math.max(bins, 4), 96);
  const step = (hi - lo) / n;
  const sers = c.seriesBy ? groupMetric(stamped.map(x => x.r), c.seriesBy, 'count', undefined, 7).filter(b => !OTHER.test(b.key)).slice(0, 6).map(b => b.key) : [metricName(c)];
  const data: any[] = [];
  sers.forEach(ser => {
    const mine = c.seriesBy ? stamped.filter(x => cell(x.r, c.seriesBy as string) === ser) : stamped;
    const slots: Row[][] = Array.from({ length: n }, (): Row[] => []);
    mine.forEach(x => { slots[Math.min(Math.floor((x.t - lo) / step), n - 1)].push(x.r); });
    slots.forEach((rs, i) => {
      const v = metricValue(rs, metric, c.valueField);
      if (v === undefined && metric !== 'count' && metric !== 'sum' && metric !== 'distinct') return; // an average or maximum of nothing is a gap, not zero
      data.push({ group: ser, date: new Date(lo + (i + 0.5) * step), value: v === undefined ? 0 : v });
    });
  });
  return { data, missing: rows.length - stamped.length };
}

function build(name: string, p: Props, w: Widget, d: WidgetData, selected: Set<string>): Built {
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  const metric = c.metric || 'count';
  const limit = Math.min(Math.max(num(c.limit, 8), 2), 30);
  const rows = d.rows;
  const lab = fieldLabel(c.query, group);
  const none = 'No rows' + (d.followed ? ' match the active filters' : '') + '.';
  const base: Record<string, any> = {};

  switch (name) {
    case 'SimpleBarChart': case 'LollipopChart': case 'PieChart': case 'DonutChart': case 'TreemapChart': case 'WordCloudChart': {
      let b = groupMetric(rows, group, metric, c.valueField, name === 'WordCloudChart' ? Math.min(num(p.limit, 30), 60) : limit);
      b = b.filter(x => !OTHER.test(x.key) || name === 'PieChart' || name === 'DonutChart' || name === 'SimpleBarChart');
      if (group === 'severityLabel' && name !== 'WordCloudChart') b = orderSeverity(b).slice().reverse();
      if (b.length === 0) return { data: [], options: base, empty: none };
      const keys = b.map(x => x.key);
      const color = { scale: scaleFor(group, keys, selected) };
      if (name === 'SimpleBarChart') {
        const h = !!p.horizontal;
        return { data: b.map(x => ({ group: x.key, value: x.value })), empty: undefined,
          options: { ...base, color, axes: h ? { left: { mapsTo: 'group', scaleType: 'labels' }, bottom: { mapsTo: 'value' } } : { bottom: { mapsTo: 'group', scaleType: 'labels' }, left: { mapsTo: 'value' } } } };
      }
      if (name === 'LollipopChart') {
        const ser = metricName(c);
        return { data: b.map(x => ({ group: semanticColor(group, x.key) ? x.key : ser, key: x.key, value: x.value })), options: { ...base, axes: { bottom: { mapsTo: 'key', scaleType: 'labels' }, left: { mapsTo: 'value' } }, color: { scale: semanticColor(group, b[0].key) ? scaleFor(group, keys, selected) : { [ser]: PALETTE[0] } } } };
      }
      if (name === 'TreemapChart') return { data: b.map(x => ({ name: x.key, children: [{ name: x.key, value: x.value, showLabel: true }] })), options: { ...base, color } };
      if (name === 'WordCloudChart') return { data: b.map(x => ({ word: x.key, value: x.value, group: x.key })), options: { ...base, color, wordCloud: { fontSizeMapsTo: 'value', wordMapsTo: 'word' } } };
      const total = b.reduce((a, x) => a + x.value, 0);
      return { data: b.map(x => ({ group: x.key, value: x.value })), options: name === 'DonutChart'
        ? { ...base, color, donut: { center: { label: lab, number: total, numberFormatter: (n: number) => formatNumber(n) }, alignment: 'center' } }
        : { ...base, color, pie: { alignment: 'center' } } };
    }
    case 'GroupedBarChart': case 'StackedBarChart': case 'RadarChart': case 'HeatmapChart': {
      const t = crossTab(rows, c, group, limit);
      if (t.cats.length === 0) return { data: [], options: base, empty: none };
      const serField = c.seriesBy || '';
      // A heatmap or radar compares two things against each other; with one value on either side there is nothing to compare.
      if (name === 'HeatmapChart' || name === 'RadarChart') {
        const one = t.cats.length < 2 ? [group, t.cats[0]] : (c.seriesBy && t.sers.length < 2) ? [serField, t.sers[0]] : null;
        if (one || (name === 'HeatmapChart' && !c.seriesBy)) {
          const f = one ? fieldLabel(c.query, one[0]) : 'Series by';
          return { data: [], options: base, empty: one
            ? `Every row has the same ${f} (“${one[1]}”), so there is nothing to compare. Choose a different field under Data, or fill in ${f.toLowerCase()} on your alerts.`
            : 'Pick “Series by” under Data: the second field to compare against.' };
        }
      }
      const color = { scale: scaleFor(serField, t.sers) };
      if (name === 'RadarChart') return { data: t.cells.map(x => ({ group: x.ser, key: x.cat, value: x.value })), options: { ...base, color, radar: { axes: { angle: 'key', value: 'value' } } } };
      if (name === 'HeatmapChart') {
        const ys = c.seriesBy ? t.sers : [metricName(c)];
        return { data: t.cells.map(x => ({ x: x.cat, y: x.ser, value: x.value })), options: { ...base, axes: { bottom: { mapsTo: 'x', scaleType: 'labels' }, left: { mapsTo: 'y', scaleType: 'labels', domain: ys.slice().reverse() } }, heatmap: { colorLegend: { type: 'linear' } }, color: { gradient: { enabled: true, colors: ['#d9fbfb', '#08bdba', '#005d5d'] } } } };
      }
      const stacked = name === 'StackedBarChart';
      const h = !!p.horizontal;
      // With one series (or none) the colour has to come from the category, so Critical is red and Major orange even then.
      const byCat = t.sers.length <= 1 && !!semanticColor(group, t.cats[0]);
      const rowsOut = t.cells.map(x => ({ group: byCat ? x.cat : x.ser, key: x.cat, value: x.value }));
      const colorOut = byCat ? { scale: scaleFor(group, t.cats, selected) } : color;
      const val = { mapsTo: 'value', ...(stacked ? { stacked: true, ...(p.percent ? { percentage: true } : {}) } : {}) };
      const cat = { mapsTo: 'key', scaleType: 'labels' };
      return { data: rowsOut, options: { ...base, color: colorOut, axes: h ? { left: cat, bottom: val } : { bottom: cat, left: val } } };
    }
    case 'LineChart': case 'AreaChart': case 'StackedAreaChart': {
      const field = c.timeField || DEFAULT_TIME[c.query];
      const t = timeTab(rows, c, field, num(p.bins, 24));
      if (t.data.length === 0) return { data: [], options: base, empty: `No rows with a “${fieldLabel(c.query, field)}” time${t.missing ? ` (${t.missing} without one)` : ''}.` };
      const sers = Array.from(new Set(t.data.map(x => x.group)));
      const curve = p.curve === 'straight' ? 'curveLinear' : p.curve === 'step' ? 'curveStepAfter' : 'curveMonotoneX';
      return { data: t.data, options: { ...base, curve, color: { scale: scaleFor(c.seriesBy || '', sers) }, axes: { bottom: { mapsTo: 'date', scaleType: 'time' }, left: { mapsTo: 'value', ...(name === 'StackedAreaChart' ? { stacked: true } : {}) } } } };
    }
    case 'ScatterChart': {
      const field = c.timeField || DEFAULT_TIME[c.query];
      const yf = c.valueField || (c.query === 'getAlerts' ? 'severity' : 'alertCount');
      const pts: any[] = [];
      rows.forEach(r => {
        const t = toTime(r[field]); const y = Number(r[yf]);
        if (Number.isFinite(t) && Number.isFinite(y)) pts.push({ group: c.seriesBy ? cell(r, c.seriesBy) : fieldLabel(c.query, yf), date: new Date(t), value: y });
      });
      if (pts.length === 0) return { data: [], options: base, empty: `No rows with both a “${fieldLabel(c.query, field)}” time and a number in “${fieldLabel(c.query, yf)}”. Pick a numeric field under Data.` };
      const data = pts.slice(0, Math.min(Math.max(num(p.maxPoints, 400), 20), 2000));
      const sers = Array.from(new Set(data.map(x => x.group)));
      return { data, options: { ...base, color: { scale: scaleFor(c.seriesBy || '', sers) }, axes: { bottom: { mapsTo: 'date', scaleType: 'time' }, left: { mapsTo: 'value', title: fieldLabel(c.query, yf) } } } };
    }
    case 'AlluvialChart': {
      const to = c.seriesBy;
      if (!to) return { data: [], options: base, empty: 'Pick “Series by” under Data: the field the flow goes to.' };
      const cats = new Set(groupMetric(rows, group, 'count', undefined, limit + 1).filter(b => !OTHER.test(b.key)).slice(0, limit).map(b => b.key));
      const tos = new Set(groupMetric(rows, to, 'count', undefined, limit + 1).filter(b => !OTHER.test(b.key)).slice(0, limit).map(b => b.key));
      const flow = new Map<string, number>();
      rows.forEach(r => {
        const a = cell(r, group), b = cell(r, to);
        if (!cats.has(a) || !tos.has(b)) return;
        const k = `${a}\u0000${b}`;
        flow.set(k, (flow.get(k) || 0) + 1);
      });
      if (flow.size === 0) return { data: [], options: base, empty: none };
      const data: any[] = [];
      flow.forEach((v, k) => { const [a, b] = k.split('\u0000'); data.push({ source: a, target: cats.has(b) ? `${b}\u200b` : b, value: v }); });
      const nodes: Array<{ name: string; category: string }> = [];
      const seen = new Set<string>();
      data.forEach(x => {
        if (!seen.has(`s${x.source}`)) { seen.add(`s${x.source}`); nodes.push({ name: x.source, category: fieldLabel(c.query, group) }); }
        if (!seen.has(`t${x.target}`)) { seen.add(`t${x.target}`); nodes.push({ name: x.target, category: fieldLabel(c.query, to) }); }
      });
      return { data, options: { ...base, alluvial: { nodes, nodeAlignment: 'center' }, color: { scale: { ...scaleFor(group, Array.from(cats)), ...scaleFor(to, Array.from(tos).map(x => (cats.has(x) ? `${x}\u200b` : x))) } } } };
    }
    case 'GaugeChart': case 'MeterChart': {
      const v = metricValue(rows, metric, c.valueField);
      const max = Math.max(num(p.max, 100), 1);
      if (v === undefined) return { data: [], options: base, empty: metric === 'count' ? none : 'Pick a field under Data.' };
      const pct = Math.min(Math.max((v / max) * 100, 0), 100);
      const th: Thresholds = { warnAt: p.warnAt, critAt: p.critAt, direction: p.direction };
      const lvl = levelOf(v, th);
      // A gauge or meter that counts one severity or priority keeps that colour; otherwise green, yellow, red say how it is against its limits.
      const sem = c.where ? semanticColor(c.where.field, c.where.value) : undefined;
      const tone = sem ? sem.fill : lvl === 'crit' ? '#da1e28' : lvl === 'warn' ? '#f1c21b' : '#24a148';
      const shown = `${formatNumber(v)}${p.unit ? ` ${p.unit}` : ''}`;
      const hasT = !!sem || [p.warnAt, p.critAt].some(x => x !== undefined && x !== '' && Number.isFinite(Number(x)));
      if (name === 'GaugeChart') return { data: [{ group: 'value', value: pct }], options: { ...base, ...(hasT ? { color: { scale: { value: tone } } } : {}), gauge: { type: p.type === 'full' ? 'full' : 'semi', numberFormatter: () => shown, showPercentageSymbol: false } } };
      const grp = p.label || 'Value';
      return { data: [{ group: grp, value: Math.min(v, max) }], options: { ...base, ...(hasT ? { color: { scale: { [grp]: tone } } } : {}), meter: { showLabels: true, proportional: { total: max, unit: p.unit || '', totalFormatter: () => `${shown} of ${formatNumber(max)}` } } } };
    }
    default: return { data: [], options: base, empty: `Unknown chart “${name}”.` };
  }
}

/** Which field/value a click means, for each kind of chart. */
function clicked(name: string, e: any, group: string, series: string): Array<[string, string]> {
  const d = e && e.datum !== undefined ? e.datum : e;
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  switch (name) {
    case 'SimpleBarChart': return d && s(d.group) ? [[group, s(d.group)]] : [];
    case 'GroupedBarChart': case 'StackedBarChart': case 'LollipopChart': return d && s(d.key) ? [[group, s(d.key)]] : [];
    case 'PieChart': case 'DonutChart': { const x = d && d.data ? d.data : d; return x && s(x.group) ? [[group, s(x.group)]] : []; }
    case 'TreemapChart': { const x = d && (d.group || d.name) ? d : null; return x ? [[group, s(x.group || x.name)]] : []; }
    case 'WordCloudChart': { const x = d && (d.word || d.group) ? d : null; return x ? [[group, s(x.word || x.group)]] : []; }
    case 'HeatmapChart': { const out: Array<[string, string]> = []; if (d && s(d.x)) out.push([group, s(d.x)]); if (d && s(d.y) && series) out.push([series, s(d.y)]); return out; }
    case 'RadarChart': { const k = typeof d === 'string' ? d : d && (d.key || d.name); return k ? [[group, s(k)]] : []; }
    case 'AlluvialChart': { const nm = s(d && (d.name || d.id || (typeof d === 'string' ? d : ''))).split('\u200b').join('').trim(); return nm ? [['', nm]] : []; }
    case 'LineChart': case 'AreaChart': case 'StackedAreaChart': case 'ScatterChart': return series && d && s(d.group) ? [[series, s(d.group)]] : [];
    default: return [];
  }
}

function useSize(ref: React.RefObject<HTMLDivElement>): { w: number; h: number } {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(es => {
      const r = es[0].contentRect;
      setSz(o => (Math.abs(o.w - r.width) > 1 || Math.abs(o.h - r.height) > 1 ? { w: Math.round(r.width), h: Math.round(r.height) } : o));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return sz;
}

/** White on light backgrounds, g100 when the widget's text is light (dark dashboards, tinted widgets). */
function useChartTheme(ref: React.RefObject<HTMLElement>): string {
  const [t, setT] = useState('white');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(el).color);
    const next = m && 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] > 150 ? 'g100' : 'white';
    if (next !== t) setT(next);
  });
  return t;
}

function ChartView({ name, p, w, d }: { name: string; p: Props; w: Widget; d: WidgetData }) {
  const { toggleFilter } = useBuilder();
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  const series = c.seriesBy || '';
  const act = useDrillAction(w);
  const emits = c.emits !== false || !!act;
  const hold = useRef<HTMLDivElement>(null);
  const size = useSize(hold);
  const theme = useChartTheme(hold);
  const selKey = Array.from(d.selected).sort().join('\u0001');
  const built = useMemo(() => build(name, p, w, d, d.selected), [name, JSON.stringify(p), JSON.stringify(c), d.rows, selKey]);
  const options = useMemo(() => ({
    title: p.title || undefined,
    theme,
    width: '100%',
    height: `${Math.max(size.h, 120)}px`,
    resizable: true,
    animations: false,
    toolbar: { enabled: false },
    legend: { enabled: p.legend !== 'none' && (!!w.config.seriesBy || /^(Pie|Donut|SimpleBar)Chart$/.test(name)) && name !== 'TreemapChart' && name !== 'WordCloudChart' && name !== 'GaugeChart' && name !== 'MeterChart', position: p.legend && p.legend !== 'none' ? p.legend : 'bottom', clickable: true },
    ...built.options
  }), [built.options, theme, size.h, p.title, p.legend, name]);

  // Carbon builds its legend and title parts when the chart is created, so a change to them starts a fresh chart.
  const chartKey = `${name}|${options.legend.enabled}|${options.legend.position}|${!!p.title}`;
  const ref = useRef<any>(null);
  const on = useRef<(e: any) => void>(() => undefined);
  on.current = (e: any) => {
    if (!emits) return;
    let pairs = clicked(name, e, group, series);
    if (name === 'AlluvialChart') {
      const nm = pairs.length ? pairs[0][1] : '';
      const inFrom = d.rows.some(r => cell(r, group) === nm);
      pairs = nm ? [[inFrom || !series ? group : series, nm]] : [];
    }
    if (name === 'GaugeChart' || name === 'MeterChart') { if (act) act.go(w.title, d.rows, { count: d.rows.length }); return; }
    pairs = pairs.filter(([f, v]) => f && v && !OTHER.test(v));
    if (pairs.length === 0) return;
    if (act) {
      act.go(`${w.title}: ${pairs.map(([f, v]) => `${fieldLabel(c.query, f)} ${v}`).join(', ')}`, d.rows.filter(r => pairs.every(([f, v]) => cell(r, f) === v)), { ...Object.fromEntries(pairs), value: pairs[0][1], count: d.rows.filter(r => pairs.every(([f, v]) => cell(r, f) === v)).length });
      return;
    }
    pairs.forEach(([f, v]) => toggleFilter(w.id, c.query, f, v));
  };
  useEffect(() => {
    const chart = ref.current && ref.current.chart;
    const ev = chart && chart.services && chart.services.events;
    const evName = CLICK[name];
    if (!ev || !evName) return undefined;
    const fn = (e: any) => on.current(e && e.detail !== undefined ? e.detail : e);
    ev.addEventListener(evName, fn);
    return () => { try { ev.removeEventListener(evName, fn); } catch (x) { /* chart already gone */ } };
  }, [chartKey, size.h > 0 && !built.empty]);

  const Chart = COMPONENTS[name];
  return (
    <div className="db-chart">
      <div className="db-chart-hold" ref={hold} data-chart={name}>
        {built.empty || !Chart ? <div className="db-empty">{built.empty || 'This chart is not available.'}</div> : size.h > 0 && <Chart key={chartKey} ref={ref} data={built.data} options={options} />}
      </div>
      <Note d={d} />
    </div>
  );
}

/** A chart that cannot draw (odd data or a settings combination) says so in its own box instead of taking the dashboard down. */
class ChartBoundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: '' }); }
  render() {
    return this.state.error ? <div className="db-empty" role="alert"><strong>This chart cannot be drawn</strong><span>{this.state.error}. Check Group by and Series by under Data.</span></div> : this.props.children;
  }
}

export function CarbonChart({ name, p, w, d }: { name: string; p: Props; w: Widget; d: WidgetData }) {
  return <Status d={d}><ChartBoundary resetKey={JSON.stringify([p, w.config.groupBy, w.config.seriesBy, w.config.metric, w.config.valueField, d.rows.length])}><ChartView name={name} p={p} w={w} d={d} /></ChartBoundary></Status>;
}
