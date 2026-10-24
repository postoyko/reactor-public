/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Status indicators, the count badge, the breakdown popover and the combo button.
 *
 * Data: each one reads rows like every other widget (filter bar, own condition, filters from other widgets).
 * Status: "fixed", "live" (the measure crosses the warning / critical numbers) or "severity" (the worst severity of the rows).
 * Wiring: the popover lists the groups of the data and clicking one sets a filter other widgets follow; the combo button
 * can set or clear filters from its menu; clicking an indicator or badge opens the drill-through when it has one.
 */

import React, { useState } from 'react';
import * as CR from '@carbon/react';
import { Button, ComboButton, MenuItem, Popover, PopoverContent } from '@carbon/react';
import { Widget } from './types';
import { useBuilder } from './context';
import { cell, fieldLabel, formatNumber, groupMetric, metricValue, PRIORITY_COLORS, semanticColor, SEVERITY_COLORS, SEVERITY_LABELS } from './rows';
import { DEFAULT_GROUP } from './rows';
import { Note, useDrillAction, WidgetData } from './Widgets';
import { SemCell } from './Sem';
import { shapeOf } from './sources';

type Props = Record<string, any>;

/**
 * Carbon ships the status shape, status icon and badge as preview / unstable exports (and the badge not at all from the
 * package root in some releases). Use Carbon's own when this install has it, otherwise draw the same thing with Carbon's
 * colours, so the widget works on every version.
 */
const lib = CR as unknown as Record<string, React.ComponentType<any> | undefined>;
const OfficialShape = lib.preview__ShapeIndicator || lib.unstable__ShapeIndicator || lib.ShapeIndicator;
const OfficialIcon = lib.preview__IconIndicator || lib.unstable__IconIndicator || lib.IconIndicator;
const OfficialBadge = lib.preview__BadgeIndicator || lib.unstable__BadgeIndicator || lib.BadgeIndicator;

const TONE: Record<string, string> = {
  critical: '#da1e28', failed: '#da1e28', high: '#ff832b', 'caution-major': '#ff832b', medium: '#f1c21b', 'caution-minor': '#f1c21b', cautious: '#f1c21b', low: '#4589ff',
  stable: '#24a148', succeeded: '#24a148', normal: '#24a148', informative: '#4589ff', 'in-progress': '#4589ff', pending: '#8d8d8d', undefined: '#8d8d8d', unknown: '#8d8d8d', incomplete: '#8d8d8d', 'not-started': '#8d8d8d', draft: '#8d8d8d'
};
function Mark({ kind, size, round, color }: { kind: string; size: number; round?: boolean; color?: string }) {
  const c = color || TONE[kind] || '#8d8d8d';
  const r = size / 2;
  const shape = round || !/^(critical|failed|high|medium|cautious|caution-major|caution-minor)$/.test(kind) ? <circle cx={r} cy={r} r={r - 1} fill={c} />
    : /^(critical|failed)$/.test(kind) ? <polygon points={`${r},1 ${size - 1},${r} ${r},${size - 1} 1,${r}`} fill={c} />
    : <polygon points={`${r},1 ${size - 1},${size - 1} 1,${size - 1}`} fill={c} />;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">{shape}</svg>;
}
function Fallback({ kind, label, size, round, compact, color }: { kind: string; label: string; size: number; round?: boolean; compact?: boolean; color?: string }) {
  return <span className="db-mark" title={compact ? label : undefined} role="img" aria-label={`${kind}: ${label}`}><Mark kind={kind} size={size} round={round} color={color} />{!compact && <span>{label}</span>}</span>;
}

export interface Thresholds { warnAt?: unknown; critAt?: unknown; direction?: unknown }
export type Level = 'ok' | 'warn' | 'crit';

/** Warning / critical rule shared by the indicators, the gauge and the meter. A blank threshold is ignored. */
export function levelOf(v: number, t: Thresholds): Level {
  const w = Number(t.warnAt), c = Number(t.critAt);
  const hasW = t.warnAt !== undefined && t.warnAt !== '' && Number.isFinite(w);
  const hasC = t.critAt !== undefined && t.critAt !== '' && Number.isFinite(c);
  if (t.direction === 'lower') return hasC && v <= c ? 'crit' : hasW && v <= w ? 'warn' : 'ok';
  return hasC && v >= c ? 'crit' : hasW && v >= w ? 'warn' : 'ok';
}

interface Pick { shape: string; icon: string; text: string; /** The severity or priority colour, when the status is a severity or priority (so it matches every chart and table). */ color?: string }
const SEV_SHAPE = ['stable', 'stable', 'informative', 'cautious', 'medium', 'high', 'critical'];
const SEV_ICON = ['succeeded', 'succeeded', 'informative', 'informative', 'caution-minor', 'caution-major', 'failed'];

/** What to show: the fixed kind, the level of the measure, or the worst severity (alerts) / priority (incidents) of the rows. */
function pick(p: Props, w: Widget, d: WidgetData | undefined): Pick & { value?: number } {
  const c = w.config;
  if (!d || p.source === 'fixed') return { shape: p.kind || 'stable', icon: p.kind || 'succeeded', text: '' };
  if (p.source === 'severity') {
    if (shapeOf(c.query) === 'alerts') {
      const sev = d.rows.map(r => Number(r.severity)).filter(n => Number.isFinite(n));
      if (sev.length === 0) return { shape: 'stable', icon: 'succeeded', text: 'None' };
      const worst = Math.min(Math.max(Math.max(...sev), 0), 6);
      return { shape: SEV_SHAPE[worst], icon: SEV_ICON[worst], text: SEVERITY_LABELS[worst], color: SEVERITY_COLORS[worst] };
    }
    const pr = d.rows.map(r => Number(r.priority)).filter(n => Number.isFinite(n) && n > 0);
    if (pr.length === 0) return { shape: 'stable', icon: 'succeeded', text: 'None' };
    const top = Math.min(...pr);
    const k = top <= 1 ? 6 : top === 2 ? 5 : top === 3 ? 4 : top === 4 ? 3 : 2;
    return { shape: SEV_SHAPE[k], icon: SEV_ICON[k], text: `Priority ${top}`, color: PRIORITY_COLORS[Math.min(Math.max(Math.round(top), 1), 5) - 1] };
  }
  const v = metricValue(d.rows, c.metric || 'count', c.valueField);
  if (v === undefined) return { shape: 'undefined', icon: 'unknown', text: 'n/a' };
  const l = levelOf(v, p);
  // Counting one severity or priority: keep that colour (the shape still says how bad the count is).
  const sem = c.where ? semanticColor(c.where.field, c.where.value) : undefined;
  return { shape: l === 'crit' ? 'critical' : l === 'warn' ? 'cautious' : 'stable', icon: l === 'crit' ? 'failed' : l === 'warn' ? 'caution-major' : 'succeeded', text: formatNumber(v), value: v, ...(sem ? { color: sem.fill } : {}) };
}

const fill = (tpl: string, p: Pick, d: WidgetData | undefined) => String(tpl || '').split('{value}').join(p.text || '').split('{count}').join(d ? String(d.rows.length) : '');

function Clickable({ w, d, children }: { w: Widget; d?: WidgetData; children: React.ReactNode }) {
  const act = useDrillAction(w);
  if (!act || !d) return <>{children}</>;
  return <button type="button" className="db-ind-click" title="Click for the rows behind this" onClick={() => act.go(w.title, d.rows, { count: d.rows.length })}>{children}</button>;
}

export function ShapeStatus({ p, w, d }: { p: Props; w: Widget; d?: WidgetData }) {
  const k = pick(p, w, d);
  return (
    <div className="db-ind">
      <Clickable w={w} d={d}>
        {OfficialShape && !k.color
          ? <OfficialShape kind={k.shape} label={fill(p.label, k, d) || ' '} textSize={p.textSize === '14' ? 14 : 12} compact={!!p.compact} />
          : <Fallback kind={k.shape} label={fill(p.label, k, d)} size={p.textSize === '14' ? 16 : 14} compact={!!p.compact} color={k.color} />}
      </Clickable>
      {d && <Note d={d} />}
    </div>
  );
}

export function IconStatus({ p, w, d }: { p: Props; w: Widget; d?: WidgetData }) {
  const k = pick(p, w, d);
  return (
    <div className="db-ind">
      <Clickable w={w} d={d}>
        {OfficialIcon && !k.color
          ? <OfficialIcon kind={k.icon} label={fill(p.label, k, d) || ' '} size={p.size === '20' ? 20 : 16} compact={!!p.compact} />
          : <Fallback kind={k.icon} label={fill(p.label, k, d)} size={p.size === '20' ? 20 : 16} round compact={!!p.compact} color={k.color} />}
      </Clickable>
      {d && <Note d={d} />}
    </div>
  );
}

/** A badge counting one severity or priority wears that colour. */
function badgeColor(c: Widget['config']): React.CSSProperties | undefined {
  const sem = c.where ? semanticColor(c.where.field, c.where.value) : undefined;
  return sem ? { background: sem.fill, color: sem.ink } : undefined;
}

export function CountBadge({ p, w, d }: { p: Props; w: Widget; d?: WidgetData }) {
  const c = w.config;
  const live = p.source !== 'fixed' && !!d;
  const v = live ? metricValue((d as WidgetData).rows, c.metric || 'count', c.valueField) : Number(p.count) || 0;
  const hidden = v === undefined || (p.hideZero !== false && v === 0 && p.display !== 'dot') || (p.display === 'dot' && !v);
  return (
    <div className="db-ind">
      <Clickable w={w} d={d}>
        <span className="db-badge-row">
          <span>{p.label}</span>
          {hidden ? <span className="db-badge-none" aria-label="none">0</span> : OfficialBadge ? (p.display === 'dot' ? <OfficialBadge /> : <OfficialBadge count={Math.round(v as number)} />) : <span className={`db-badge${p.display === 'dot' ? ' dot' : ''}`} role="status" style={badgeColor(c)}>{p.display === 'dot' ? '' : (v as number) > 99 ? '99+' : Math.round(v as number)}</span>}
        </span>
      </Clickable>
      {d && <Note d={d} />}
    </div>
  );
}

export function BreakdownPopover({ p, w, d }: { p: Props; w: Widget; d: WidgetData }) {
  const { toggleFilter } = useBuilder();
  const [open, setOpen] = useState(false);
  const c = w.config;
  const group = c.groupBy || DEFAULT_GROUP[c.query];
  const act = useDrillAction(w);
  const emits = c.emits !== false || !!act;
  const rows = groupMetric(d.rows, group, c.metric || 'count', c.valueField, Math.min(Math.max(Number(p.limit) || 8, 2), 30));
  const choose = (key: string, value: number) => {
    if (act) act.go(`${fieldLabel(c.query, group)}: ${key}`, d.rows.filter(r => cell(r, group) === key), { [group]: key, value: key, count: value });
    else toggleFilter(w.id, c.query, group, key);
  };
  const label = `${p.text || 'Breakdown'}${p.showCount !== false ? ` (${formatNumber(metricValue(d.rows, c.metric || 'count', c.valueField) || 0)})` : ''}`;
  return (
    <div className="db-ind">
      <Popover open={open} align={p.align || 'bottom'} onRequestClose={() => setOpen(false)} autoAlign>
        <Button kind="tertiary" size="md" onClick={() => setOpen(o => !o)} aria-expanded={open}>{label}</Button>
        <PopoverContent className="db-pop-content">
          {p.content && <p className="db-pop-text">{p.content}</p>}
          {p.breakdown !== false && (
            <ul className="db-pop-list">
              {rows.length === 0 && <li className="db-pop-none">No rows{d.followed ? ' match the active filters' : ''}.</li>}
              {rows.map(r => (
                <li key={r.key}>
                  <button type="button" className={`db-pop-row${d.selected.has(r.key) ? ' on' : ''}`} disabled={!emits || /^Other \(/.test(r.key)} aria-pressed={emits ? d.selected.has(r.key) : undefined} onClick={() => choose(r.key, r.value)}>
                    <span><SemCell field={group} value={r.key} shown={r.key} /></span><b>{formatNumber(r.value)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <Note d={d} />
    </div>
  );
}

/** Lines: "Label :: target". Target = address, filter:field=value, or clear. */
export function ActionCombo({ p, w }: { p: Props; w: Widget }) {
  const { toggleFilter, setSelection } = useBuilder();
  const c = w.config;
  const items = (Array.isArray(p.items) ? p.items.map(String) : String(p.items || '').split('\n')).filter(x => x.trim());
  const rows = items.map(x => { const i = x.indexOf('::'); return { label: (i < 0 ? x : x.slice(0, i)).trim(), target: i < 0 ? '' : x.slice(i + 2).trim() }; });
  const fields = Array.from(new Set(rows.filter(r => r.target.startsWith('filter:')).map(r => r.target.slice(7).split('=')[0].trim()).filter(Boolean)));
  const run = (target: string) => {
    if (target.startsWith('filter:')) {
      const rest = target.slice(7); const i = rest.indexOf('=');
      if (i > 0) toggleFilter(w.id, c.query, rest.slice(0, i).trim(), rest.slice(i + 1).trim());
    } else if (target === 'clear') fields.forEach(f => setSelection(w.id, c.query, f, []));
    else if (/^(https?:\/\/|\/|#)/i.test(target)) window.open(target, '_blank', 'noopener');
  };
  if (rows.length === 0) return <div className="db-empty">Add actions in the settings.</div>;
  const [first, ...rest] = rows;
  return (
    <ComboButton label={first.label} size={p.size || 'md'} onClick={() => run(first.target)}>
      {rest.map((r, i) => <MenuItem key={i} label={r.label} onClick={() => run(r.target)} />)}
    </ComboButton>
  );
}
