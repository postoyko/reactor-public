/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings for the selected widget: what it is bound to (query, filter, field), how it is drawn, how often it
 * refreshes, and whether it takes part in cross-filtering.
 */

import { pivotChoices } from './pivot';
import React from 'react';
import { Button, Checkbox, Select, SelectItem, TextInput } from '@carbon/react';
import { ArrowRight, Close, ColorPalette, DataBase, Flash, Flow, Settings } from '@carbon/icons-react';
import { Glyph } from './Glyph';
import { typeLabel } from './meta';
import { COND_OPS, CondOp, Cond, Metric, QueryName, Widget, WidgetConfig } from './types';
import { DEFAULT_GROUP, DEFAULT_TIME, fieldLabel, fieldsOf } from './rows';
import { isNative, tileDef } from './registry';
import TileSettings from './TileSettings';
import { canSend, WireEditor } from './Wiring';
import { actionLabel, eventsOf } from './component-api';
import DrillEditor from './DrillEditor';
import MetricPicker from './MetricPicker';
import { SlotInfo } from './nesting';
import CarbonSettings from './CarbonSettings';
import SectionHead from './SectionHead';
import { carbonDef } from './carbon-catalog';
import { dataOn } from './carbon-specs';
import { describeImageError, IMAGE_ACCEPT, IMAGE_MAX_BYTES, imageMimeOk, isImageSrc } from './image';

interface Props {
  /** Every widget on the dashboard (for wiring and for choosing a container). */
  everyone?: Widget[];
  /** The dashboard has a filter bar, so a widget can opt out of it. */
  barOn?: boolean;
  /** Panels this widget could be moved into (containers, tabs, sections). */
  slots?: SlotInfo[];
  onMove?: (id: string, slot: string) => void;
  /** Opens the Action flows editor with this widget in focus. */
  onFlows?: (id: string) => void;
  /** Studio only: the sections a tile can show instead of the whole dashboard. */
  partsFor?: (tile: string) => { id: string; label: string }[];
  widget: Widget;
  onChange: (next: Widget, coalesceKey: string) => void;
  onClose: () => void;
}

const REFRESH = [
  { v: 0, t: 'Off (use Refresh)' },
  { v: 15, t: 'Every 15 seconds' },
  { v: 30, t: 'Every 30 seconds' },
  { v: 60, t: 'Every minute' },
  { v: 300, t: 'Every 5 minutes' }
];

type Tab = 'general' | 'data' | 'style' | 'interact';
/** The last tab used, so selecting another widget (or reselecting) opens the same one. */
let lastTab: Tab = 'general';

const METRICS: Array<{ v: Metric; t: string }> = [
  { v: 'count', t: 'Count of rows' },
  { v: 'distinct', t: 'Distinct values of…' },
  { v: 'max', t: 'Highest value of…' },
  { v: 'avg', t: 'Average of…' },
  { v: 'sum', t: 'Sum of…' }
];

export default function Inspector({ widget, onChange, onClose, partsFor, everyone, barOn, slots, onMove, onFlows }: Props) {
  const [imageError, setImageError] = React.useState('');
  const [tab, setTab] = React.useState<Tab>(lastTab);
  const pick = (k: Tab) => { lastTab = k; setTab(k); };
  const c = widget.config;
  const t = widget.type;
  const id = (s: string) => `db-${widget.id}-${s}`;
  const setCfg = (patch: Partial<WidgetConfig>, key: string) => onChange({ ...widget, config: { ...c, ...patch } }, `${widget.id}:${key}`);
  const setQuery = (q: QueryName) => {
    if (q === c.query) return;
    // Field names differ between alerts and incidents, so anything bound to a field is reset to a valid default.
    setCfg({
      query: q,
      where: undefined,
      also: undefined,
      groupBy: DEFAULT_GROUP[q],
      timeField: DEFAULT_TIME[q],
      valueField: undefined,
      sortBy: undefined,
      filter: q === 'getAlerts' ? c.filter : q === 'getMetricSeries' ? 'kubernetesNode|required_cpu_percentage|' : undefined,
      columns: fieldsOf(q).slice(0, 4).map(f => f.key)
    }, 'query');
  };

  const chooseImage = (file: File | undefined) => {
    setImageError('');
    if (!file) return;
    if (!imageMimeOk(file.type)) { setImageError(describeImageError(file.name, file.type)); return; }
    if (file.size > IMAGE_MAX_BYTES) { setImageError(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${IMAGE_MAX_BYTES / 1048576} MB: make it smaller first.`); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!isImageSrc(src)) { setImageError('That file could not be used as a picture.'); return; }
      setCfg({ src }, 'image');
    };
    reader.onerror = () => setImageError('The file could not be read.');
    reader.readAsDataURL(file);
  };

  const all = fieldsOf(c.query);
  const numeric = fieldsOf(c.query, 'number');
  const times = fieldsOf(c.query, 'time');
  const metric = c.metric || 'count';
  const needsField = metric !== 'count';
  const valueFields = metric === 'distinct' ? all : numeric;
  const tile = tileDef(t);
  const native = isNative(t);
  const cdef = carbonDef(t);
  const cprops = { ...(cdef ? Object.fromEntries(cdef.props.filter(x => x.def !== undefined).map(x => [x.key, x.def])) : {}), ...(c.props || {}) };
  const cdata = !!cdef && dataOn(cdef.data, cprops);
  const grouped = t === 'bar' || t === 'donut';
  const columns = c.columns || [];

  const hasData = (native && t !== 'text' && t !== 'image') || cdata;
  const dataWarn = Boolean(hasData && needsField && !c.valueField);
  const tabs: Array<{ key: Tab; label: string; icon: typeof Settings; warn?: boolean }> = [
    { key: 'general', label: 'General', icon: Settings },
    ...(hasData ? [{ key: 'data' as Tab, label: 'Data', icon: DataBase, warn: dataWarn }] : []),
    { key: 'style', label: 'Style', icon: ColorPalette },
    { key: 'interact', label: 'Interact', icon: Flash }
  ];
  const current: Tab = tabs.some(x => x.key === tab) ? tab : 'general';
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex(x => x.key === current);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const k = tabs[(next + tabs.length) % tabs.length].key;
    pick(k);
    const el = document.getElementById(id(`tab-${k}`));
    if (el) el.focus();
  };

  return (
    <div className="db-inspector" aria-label="Widget settings">
      <div className="db-inspector-top">
        <div className="db-inspector-head">
          <Glyph type={t} />
          <div className="db-inspector-title">
            <h2>{typeLabel(t)}</h2>
            <span>{widget.w} × {widget.h} cells at column {widget.x + 1}, row {widget.y + 1}</span>
          </div>
          <button type="button" className="db-iconbtn" title="Deselect (Esc)" aria-label="Close settings" onClick={onClose}><Close size={16} /></button>
        </div>

        <div className="db-itabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
          {tabs.map(x => {
            const Icon = x.icon;
            const on = x.key === current;
            return (
              <button
                key={x.key}
                id={id(`tab-${x.key}`)}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={id(`panel-${x.key}`)}
                tabIndex={on ? 0 : -1}
                className={`db-itab${on ? ' db-itab--on' : ''}`}
                onClick={() => pick(x.key)}
              >
                <Icon size={16} />
                <span>{x.label}</span>
                {x.warn && <i className="db-itab-warn" title="Something here needs a choice" aria-label="needs attention" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="db-ipanel" role="tabpanel" id={id(`panel-${current}`)} aria-labelledby={id(`tab-${current}`)}>
        {current === 'general' && (
          <>
            <TextInput id={id('title')} labelText="Title" value={widget.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...widget, title: e.target.value }, `${widget.id}:title`)} />

            {onMove && slots && (
              <Select id={id('place')} labelText="Place in" helperText="Move this widget into a container, tab or section, or back onto the dashboard." size="sm" value={widget.parent || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onMove(widget.id, e.target.value)}>
                <SelectItem value="" text="The dashboard" />
                {slots.map(s => <SelectItem key={s.slot} value={s.slot} text={s.label} />)}
                {widget.parent && !slots.some(s => s.slot === widget.parent) && <SelectItem value={widget.parent} text="(its current panel)" />}
              </Select>
            )}

            {tile && (
              <p className="db-help">
                This tile is the existing “{tile.label}” panel. It fetches its own data and does not take part in cross-filtering.
                Drag the corner to give it room.
              </p>
            )}
            {tile && partsFor && partsFor(tile.id).length > 0 && (() => {
              const parts = partsFor(tile.id);
              const cur = String(((c as any).props || {}).part || '');
              const pickPart = (v: string) => {
                const cfg: any = { ...c, props: { ...((c as any).props || {}) } };
                if (v) { const p = parts.find(x => x.id === v); cfg.props.part = v; cfg.part = p ? p.label : v; cfg.chromeless = true; }
                else { delete cfg.props.part; delete cfg.part; delete cfg.chromeless; if (!Object.keys(cfg.props).length) delete cfg.props; }
                onChange({ ...widget, config: cfg }, `${widget.id}:part`);
              };
              return (
                <Select id={id('part')} labelText="Show" helperText="One section of the dashboard, or all of it." size="sm" value={cur} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => pickPart(e.target.value)}>
                  <SelectItem value="" text="Whole dashboard" />
                  {parts.map(p => <SelectItem key={p.id} value={p.id} text={p.label} />)}
                  {cur && !parts.some(p => p.id === cur) && <SelectItem value={cur} text={`${cur} (missing)`} />}
                </Select>
              );
            })()}
            {tile && <TileSettings widget={widget} onChange={onChange} />}

            {cdef && <CarbonSettings widget={widget} onChange={onChange} partsFor={partsFor} />}
            {t === 'text' && (
              <div className="cds--form-item">
                <label className="cds--label" htmlFor={id('text')}>Text</label>
                <textarea id={id('text')} className="db-textarea" rows={5} value={c.text || ''} onChange={e => setCfg({ text: e.target.value }, 'text')} />
              </div>
            )}

            {t === 'kpi' && (
              <div className="cds--form-item">
                <label className="cds--label" htmlFor={id('cap')}>Caption under the number</label>
                <input id={id('cap')} className="cds--text-input" maxLength={120} placeholder="Leave empty for an automatic description" value={c.text || ''} onChange={e => setCfg({ text: e.target.value }, 'cap')} />
              </div>
            )}

            {t === 'image' && (
              <>
                <div className="cds--form-item">
                  <label className="cds--label" htmlFor={id('file')}>Picture (PNG, JPEG, GIF, WebP, SVG, BMP)</label>
                  <input id={id('file')} type="file" accept={IMAGE_ACCEPT} onChange={e => { chooseImage(e.target.files ? e.target.files[0] : undefined); e.target.value = ''; }} />
                </div>
                {imageError && <p className="db-help" role="alert">{imageError}</p>}
                {c.src && <Button size="sm" kind="ghost" onClick={() => setCfg({ src: undefined }, 'image')}>Remove picture</Button>}
                <TextInput id={id('alt')} labelText="Description (alt text)" value={c.alt || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfg({ alt: e.target.value }, 'alt')} />
                <Select id={id('fit')} labelText="Fit" value={c.fit || 'contain'} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ fit: e.target.value as WidgetConfig['fit'] }, 'fit')}>
                  <SelectItem value="contain" text="Whole picture (keep proportions)" />
                  <SelectItem value="cover" text="Fill the box (crop edges)" />
                  <SelectItem value="fill" text="Stretch to the box" />
                </Select>
              </>
            )}
          </>
        )}

        {current === 'data' && hasData && (
          <>
            <Select id={id('query')} labelText="Source" value={c.query} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setQuery(e.target.value as QueryName)}>
              <SelectItem value="getAlerts" text="Alerts (getAlerts)" />
              <SelectItem value="getStories" text="Incidents (getStories)" />
              <SelectItem value="getApplications" text="Applications (getImpactedApplications)" />
              <SelectItem value="getMetricSeries" text="Metric over time (getMetricManagerData)" />
            </Select>

            {c.query === 'getMetricSeries' && <MetricPicker id={id('metric')} spec={c.filter || ''} onChange={spec => setCfg({ filter: spec }, 'filter')} />}

            {c.query === 'getAlerts' && (
              <TextInput
                id={id('filter')}
                labelText="Alert filter (optional)"
                helperText="Sent to the server as-is. Empty means open alerts (state != 'clear'). Syntax is not checked here."
                value={c.filter || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfg({ filter: e.target.value }, 'filter')}
              />
            )}

            <div className="db-row2">
              <Select
                id={id('wf')}
                labelText="Only rows where"
                value={c.where ? c.where.field : ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ where: e.target.value ? { field: e.target.value, value: c.where ? c.where.value : '' } : undefined }, 'where')}
              >
                <SelectItem value="" text="(all rows)" />
                {all.filter(f => f.kind !== 'time').map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
              </Select>
              {c.where && (
                <Select id={id('wo')} labelText="is" value={c.where.op || '='} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ where: { ...(c.where as Cond), op: e.target.value as CondOp } }, 'where')}>
                  {COND_OPS.map(o => <SelectItem key={o} value={o} text={o} />)}
                </Select>
              )}
              {c.where && (
                <TextInput id={id('wv')} labelText="value" value={c.where.value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfg({ where: { ...(c.where as Cond), value: e.target.value } }, 'where')} />
              )}
            </div>
            {(c.also || []).map((x, i) => (
              <div className="db-row2" key={i}>
                <TextInput id={id('al' + i)} labelText={i === 0 ? 'and also' : ' '} readOnly value={`${fieldLabel(c.query, x.field)} ${x.op || '='} ${x.value}`} />
                <Button kind="ghost" size="sm" onClick={() => setCfg({ also: (c.also || []).filter((_, j) => j !== i) }, 'also')}>Remove</Button>
              </div>
            ))}

            <h3 className="db-section">Display</h3>
            {(t === 'kpi' || grouped || (cdef && (cdef.uses === 'measure' || cdef.uses === 'chart'))) && (
              <>
                <Select id={id('metric')} labelText="Measure" value={metric} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ metric: e.target.value as Metric, valueField: undefined }, 'metric')}>
                  {METRICS.map(m => <SelectItem key={m.v} value={m.v} text={m.t} />)}
                </Select>
                {needsField && (
                  <Select id={id('vf')} labelText="Field" value={c.valueField || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ valueField: e.target.value || undefined }, 'vf')}>
                    <SelectItem value="" text="Choose a field" />
                    {valueFields.map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
                  </Select>
                )}
              </>
            )}

            {(grouped || (cdef && (cdef.uses === 'values' || (cdef.chart && cdef.chart.group)))) && (
              <>
                <Select id={id('group')} labelText="Group by" value={c.groupBy || DEFAULT_GROUP[c.query]} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ groupBy: e.target.value }, 'group')}>
                  {all.filter(f => f.kind !== 'time' && f.key !== 'summary' && f.key !== 'id').map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
                </Select>
                {(grouped || (cdef && cdef.chart && cdef.chart.group)) && <TextInput id={id('limit')} labelText="Show up to (rest becomes “Other”)" type="number" min={2} max={30} value={String(c.limit || 8)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfg({ limit: Math.min(Math.max(Number(e.target.value) || 8, 2), 30) }, 'limit')} />}
              </>
            )}

            {cdef && cdef.chart && cdef.chart.series && (
              <Select id={id('series')} labelText={cdef.chart.group ? 'Series by (splits each group)' : 'Series by (one line per value)'} value={c.seriesBy || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ seriesBy: e.target.value || undefined }, 'series')}>
                <SelectItem value="" text="(none)" />
                {all.filter(f => f.kind !== 'time' && f.key !== 'summary' && f.key !== 'id' && f.key !== (c.groupBy || DEFAULT_GROUP[c.query])).map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
              </Select>
            )}

            {(t === 'timeseries' || (cdef && cdef.chart && cdef.chart.time)) && (
              <Select id={id('time')} labelText="Time field" value={c.timeField || DEFAULT_TIME[c.query]} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ timeField: e.target.value }, 'time')}>
                {times.map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
              </Select>
            )}

            {(t === 'table' || (cdef && cdef.uses === 'rows')) && (
              <>
                <fieldset className="db-checks">
                  <legend className="cds--label">Columns</legend>
                  {all.map(f => (
                    <Checkbox
                      key={f.key}
                      id={id(`col-${f.key}`)}
                      labelText={f.label}
                      checked={columns.includes(f.key)}
                      onChange={(_: unknown, state: { checked: boolean }) => {
                        const next = state.checked ? all.map(a => a.key).filter(k => columns.includes(k) || k === f.key) : columns.filter(k => k !== f.key);
                        setCfg({ columns: next }, 'columns');
                      }}
                    />
                  ))}
                </fieldset>
                <TextInput id={id('rows')} labelText="Rows to show" type="number" min={5} max={500} value={String(c.limit || 50)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfg({ limit: Math.min(Math.max(Number(e.target.value) || 50, 5), 500) }, 'rows')} />
              </>
            )}

            <h3 className="db-section">Refresh</h3>
            <Select id={id('refresh')} labelText="Reload data" value={String(c.refreshSeconds || 0)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCfg({ refreshSeconds: Number(e.target.value) }, 'refresh')}>
              {REFRESH.map(r => <SelectItem key={r.v} value={String(r.v)} text={r.t} />)}
            </Select>
          </>
        )}

        {current === 'style' && (
          <>
            <h3 className="db-section db-section--first">Colours</h3>
            <div className="cds--form-item db-colors">
              {([['bg', 'Background', '#ffffff'], ['fg', 'Text', '#161616']] as const).map(([k, label, fallback]) => (
                <div key={k} className="db-color-row">
                  <label htmlFor={id(`c-${k}`)}>{label}</label>
                  <input id={id(`c-${k}`)} type="color" value={c[k] || fallback} onChange={e => setCfg({ [k]: e.target.value } as Partial<WidgetConfig>, k)} />
                  <code>{c[k] || 'theme'}</code>
                  {c[k] && <button type="button" className="db-link" onClick={() => { const n = { ...c }; delete n[k]; onChange({ ...widget, config: n }, `${widget.id}:${k}`); }}>Reset</button>}
                </div>
              ))}
              <div className="db-swatches" role="group" aria-label="Quick colours">
                {[['#0f62fe', '#ffffff'], ['#161616', '#f4f4f4'], ['#defbe6', '#0e6027'], ['#fff1f1', '#a2191f'], ['#fcf4d6', '#684e00'], ['#f4f4f4', '#161616']].map(([b, f]) => (
                  <button key={b} type="button" className="db-swatch" style={{ background: b, color: f }} title={`${b} with ${f} text`} onClick={() => setCfg({ bg: b, fg: f }, 'bg')}>Aa</button>
                ))}
              </div>
            </div>

            <SectionHead title="Frame" hint={<p>“Float on top” lets this widget sit over another one (for example a logo on a dashboard). While viewing it has no frame and clicks pass through.</p>} />
            {cdef && (
              <div className="cds--form-item">
                <label className="db-check"><input type="checkbox" checked={Boolean(c.chromeless)} onChange={e => setCfg({ chromeless: e.target.checked }, 'chromeless')} />{' '}No frame or title bar while viewing</label>
              </div>
            )}

            <div className="cds--form-item">
              <label className="db-check">
                <input type="checkbox" checked={Boolean(c.overlay)} onChange={e => setCfg({ overlay: e.target.checked || undefined }, 'overlay')} />
                {' '}Float on top of other widgets
              </label>
            </div>
          </>
        )}

        {current === 'interact' && (
          <>
            <h3 className="db-section db-section--first">For viewers</h3>
            {barOn && widget.config.listens !== false && (native || cdef) && widget.type !== 'text' && widget.type !== 'image' && widget.type !== 'group' && (
              <div className="cds--form-item">
                <label className="db-check"><input type="checkbox" checked={c.followBar !== false} onChange={e => { const n = { ...c }; if (e.target.checked) delete n.followBar; else n.followBar = false; onChange({ ...widget, config: n }, `${widget.id}:followBar`); }} />{' '}Follows the dashboard filter bar</label>
              </div>
            )}

            <div className="cds--form-item">
              <label className="db-check"><input type="checkbox" checked={c.resize !== false} onChange={e => { const n = { ...c }; if (e.target.checked) delete n.resize; else n.resize = false; onChange({ ...widget, config: n }, `${widget.id}:resize`); }} />{' '}Viewers can move and resize this widget</label>
            </div>
            {pivotChoices(widget) && (
              <div className="cds--form-item">
                <label className="db-check"><input type="checkbox" checked={c.pivot !== false} onChange={e => { const n = { ...c }; if (e.target.checked) delete n.pivot; else n.pivot = false; onChange({ ...widget, config: n }, `${widget.id}:pivot`); }} />{' '}Viewers can regroup this chart (“by …” menu)</label>
              </div>
            )}
            {widget.type === 'kpi' && (
              <div className="cds--form-item">
                <label className="db-check"><input type="checkbox" checked={c.notify !== false} onChange={e => { const n = { ...c }; if (e.target.checked) delete n.notify; else n.notify = false; onChange({ ...widget, config: n }, `${widget.id}:notify`); }} />{' '}Viewers can set a notification (bell)</label>
              </div>
            )}

            {hasData && (
              <>
                {(grouped || t === 'table' || t === 'kpi' || (cdef && (cdef.uses === 'chart' || cdef.uses === 'measure'))) && <DrillEditor widget={widget} onChange={onChange} />}

                <SectionHead
                  title="Linking"
                  hint={(
                    <>
                      <p>Linking works between widgets that use the same source (alerts with alerts, incidents with incidents).</p>
                      {cdef && (cdef.uses === 'chart' || cdef.uses === 'measure') && (
                        <p>
                          <strong>Where its data comes from:</strong> the source on the Data tab, narrowed by the dashboard filter bar, the condition set there, and the filters other widgets send it (the switch below turns that off).{' '}
                          <strong>What a click does:</strong> {cdef.emits && c.emits !== false ? 'it sets a filter on every widget that uses the same source (choose which ones under Wiring), or opens the rows when a drill-through is set above.' : 'it opens the rows when a drill-through is set above.'}
                        </p>
                      )}
                    </>
                  )}
                />
                <div className="cds--form-item">
                  <label className="db-check"><input type="checkbox" checked={c.listens !== false} onChange={e => setCfg({ listens: e.target.checked }, 'listens')} />{' '}Follows filters from other widgets</label>
                </div>
              </>
            )}

            {everyone && (
              <>
                <SectionHead title="Actions" hint={<p>When something happens in this widget, change another one. Wires only run while a dashboard is being used (Preview), never while you design.</p>} />
                {(c.on || []).length > 0 && (
                  <ul className="db-act-sum">
                    {(c.on || []).map((l, i) => {
                      const to = everyone.find(x => x.id === l.to);
                      const ev = eventsOf(widget).find(e => e.id === l.event);
                      return (
                        <li key={i}>
                          <span>{ev ? ev.label : l.event}{l.when ? ` (“${l.when}”)` : ''}</span>
                          <ArrowRight size={12} />
                          <span><b>{to ? actionLabel(to, l.do) : 'missing widget'}</b>{to ? <> on <b>{to.title}</b></> : null}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(c.on || []).length === 0 && <p className="db-help">Nothing happens yet. Make another widget react when this one is clicked, changed or picked.</p>}
                {onFlows && (
                  <button type="button" className="db-flows-btn" onClick={() => onFlows(widget.id)}>
                    <Flow size={16} />{(c.on || []).length ? 'Edit in Action flows' : 'Add an action in Action flows'}
                  </button>
                )}
                <div className="cds--form-item">
                  <label className="db-check"><input type="checkbox" checked={c.hidden === true} onChange={e => { const cfg = { ...c }; if (e.target.checked) cfg.hidden = true; else delete cfg.hidden; onChange({ ...widget, config: cfg }, `${widget.id}:hidden`); }} /> Hidden at start (an action wire can show it)</label>
                </div>
              </>
            )}

            {everyone && canSend(widget) && (
              <>
                <SectionHead title="Wiring" hint={<p>Where this widget sends what you select in it.</p>} />
                <WireEditor widget={widget} all={everyone} onChange={onChange} />
              </>
            )}

          </>
        )}
      </div>
    </div>
  );
}
