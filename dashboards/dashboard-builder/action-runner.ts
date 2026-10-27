/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs action wires while a dashboard is being used (never while designing): a widget emits an event ("click",
 * "select", "enter"), and every wire that starts there for that event does its action on its target widget, or calls
 * Concert Operate (platform-actions.ts) after the person confirms. What the wires change is kept in ActState.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { ActionApi, coerce } from './actions';
import { inputDefault } from './bindings';
import { carbonDefaults, carbonSpec } from './carbon-specs';
import { viewAsByName } from './chart-kinds';
import { argKind, fill } from './component-api';
import { DataHub, sourceKey } from './datahub';
import { ActState } from './overrides';
import { partValues, platformAction } from './platform-actions';
import { applyFilters } from './rows';
import { PLATFORM_ID } from './sources';
import { ActionLink, Cond, Filter, QueryName, Row, Widget } from './types';
import { matches } from './Widgets';

export type Notice = { kind: 'info' | 'error' | 'warning'; text: string };

interface RunnerDeps {
  hub: DataHub;
  /** The saved widgets of the dashboard (wires are read from these). */
  widgets: Widget[];
  viewing: boolean;
  act: ActState;
  setAct: React.Dispatch<React.SetStateAction<ActState>>;
  values: Record<string, string>;
  setValue: (id: string, v: string) => void;
  setSelectionRaw: (from: string, query: QueryName, field: string, values: string[]) => void;
  filtersRef: React.MutableRefObject<Filter[]>;
  /** The filter bar's test, when the dashboard has a bar. */
  barRef: React.MutableRefObject<{ pass: (q: QueryName, r: Row) => boolean } | undefined>;
  /** Filled in here, so code above (toggleFilter) can emit before this hook runs. */
  emitRef: React.MutableRefObject<ActionApi['emit']>;
  setNotice: (n: Notice) => void;
}

/** A chain of wires (A sets B, B emits, ...) stops after this many steps. */
const MAX_CHAIN = 3;

export function useActionRunner(d: RunnerDeps): ActionApi {
  // refs, so the callbacks below stay the same while still seeing the latest state
  const widgetsRef = useRef(d.widgets); widgetsRef.current = d.widgets;
  const valuesRef = useRef(d.values); valuesRef.current = d.values;
  const viewingRef = useRef(d.viewing); viewingRef.current = d.viewing;
  const actRef = useRef(d.act); actRef.current = d.act;
  const depsRef = useRef(d); depsRef.current = d;
  const cmdN = useRef(0);
  const depth = useRef(0);

  /** Calls Concert Operate (create an incident, add alerts to one), only after the person using the dashboard confirms. */
  const runPlatform = (l: ActionLink, value: string, t?: Widget) => {
    const { hub, filtersRef, barRef, setNotice } = depsRef.current;
    const spec = platformAction(l.do);
    if (!spec) return;
    if (spec.unsupported) { setNotice({ kind: 'warning', text: `${spec.label}: ${spec.unsupported} Remove or change this action in Flows.` }); return; }
    const v = partValues(spec.parts, l.arg);
    Object.keys(v).forEach(k => { v[k] = fill(v[k], value); });
    let alertIds: string[] = [];
    if (spec.fromRows && t) {
      // the alerts the widget shows: its source, its own condition, and what other widgets filter it by
      const cfg = { ...t.config, ...((actRef.current[t.id] || {}).cfg || {}) };
      let rows = hub.snapshot(sourceKey(cfg.query, cfg.filter)).rows;
      const conds = [cfg.where, ...(cfg.also || [])].filter((x): x is Cond => !!x && !!x.field && x.value !== '');
      const gate = cfg.followBar !== false ? barRef.current : undefined;
      rows = rows.filter(r => conds.every(x => matches(r, x)) && (!gate || gate.pass(cfg.query, r)));
      if (cfg.listens !== false) rows = applyFilters(rows, filtersRef.current.filter(f => f.from !== t.id && f.query === cfg.query));
      alertIds = rows.map(r => String(r.id)).filter(Boolean).slice(0, 1000);
      if (!alertIds.length) { setNotice({ kind: 'warning', text: `“${t.title}” shows no alerts, so nothing was sent.` }); return; }
    }
    const c = spec.call(v, alertIds);
    if (!window.confirm(`${c.summary}?\n\nThis changes data in Concert Operate.`)) return;
    hub.call(c.name, c.params).then(
      () => setNotice({ kind: 'info', text: `${c.summary}: done.` }),
      (err: any) => setNotice({ kind: 'error', text: `${c.summary} failed: ${err && err.message ? err.message : 'the server refused it'}` })
    );
  };

  /** One wire: what `l.do` means for its target (see component-api.ts for the list). */
  const runAction = useCallback((l: ActionLink, value: string) => {
    const { setAct, setValue, setSelectionRaw, emitRef } = depsRef.current;
    if (l.to === PLATFORM_ID) { runPlatform(l, value); return; }
    const t = widgetsRef.current.find(x => x.id === l.to);
    if (!t) return;
    if (l.do.startsWith('api:')) { runPlatform(l, value, t); return; }
    const arg = fill(l.arg, value);
    const dd = l.do, id = t.id;
    const patch = (fn: (cur: ActState[string]) => ActState[string]) => setAct(a => ({ ...a, [id]: fn(a[id] || {}) }));
    if (dd === 'show' || dd === 'hide') patch(c => ({ ...c, hidden: dd === 'hide' }));
    else if (dd === 'toggleVisible') patch(c => ({ ...c, hidden: !(c.hidden !== undefined ? c.hidden : t.config.hidden === true) }));
    else if (dd === 'title') patch(c => ({ ...c, title: arg }));
    else if (dd === 'set:text' && t.type === 'text') patch(c => ({ ...c, text: arg }));
    else if (dd.startsWith('cfg:')) {
      const k = dd.slice(4);
      if (k === 'where') {
        const i = arg.indexOf('=');
        patch(c => ({ ...c, cfg: { ...(c.cfg || {}), where: i > 0 ? { field: arg.slice(0, i).trim(), value: arg.slice(i + 1).trim() } : undefined } }));
      } else patch(c => ({ ...c, cfg: { ...(c.cfg || {}), [k]: coerce(argKind(t, dd), arg) } }));
    }
    else if (dd.startsWith('add:')) {
      const k = dd.slice(4), spec = carbonSpec(t.type), base: Record<string, any> = { ...(spec ? carbonDefaults(spec) : {}), ...(t.config.props || {}) };
      patch(c => {
        const cur = Number(c.props && c.props[k] !== undefined ? c.props[k] : base[k]) || 0;
        let n = cur + (Number(arg) || 0);
        const mx = Number(c.props && c.props.max !== undefined ? c.props.max : base.max);
        if (k === 'value' && Number.isFinite(mx) && mx > 0) n = Math.min(n, mx);
        return { ...c, props: { ...(c.props || {}), [k]: Math.max(n, 0) } };
      });
    }
    else if (dd === 'addValue') setValue(id, String((Number(valuesRef.current[id] !== undefined ? valuesRef.current[id] : inputDefault(t)) || 0) + (Number(arg) || 0)));
    else if (dd.startsWith('set:')) { const k = dd.slice(4), kind = argKind(t, dd); patch(c => ({ ...c, props: { ...(c.props || {}), [k]: coerce(kind, arg) } })); }
    else if (dd === 'viewAs') { const type = viewAsByName(t, arg); if (type) patch(c => ({ ...c, type: type === t.type ? undefined : type })); }
    else if (dd.startsWith('cmd:')) { const n = ++cmdN.current; patch(c => ({ ...c, props: { ...(c.props || {}), __cmd: { name: dd.slice(4), arg, n } } })); }
    else if (dd === 'value') setValue(id, arg);
    else if (dd === 'clear' || dd === 'off') setValue(id, '');
    else if (dd === 'on') setValue(id, 'true');
    else if (dd === 'flip') setValue(id, valuesRef.current[id] === 'true' ? '' : 'true');
    else if ((dd === 'pick' || dd === 'clearPick') && t.config.groupBy) {
      const picked = dd === 'pick' && arg ? [arg] : [];
      setSelectionRaw(id, t.config.query, t.config.groupBy, picked);
      emitRef.current(id, 'select', picked.join(', '));
    }
  }, []);

  /** Runs the wires that start at `from` for `event`. Only while a dashboard is being used, never while designing. */
  const emit = useCallback((from: string, event: string, value = '') => {
    if (!viewingRef.current || depth.current > MAX_CHAIN) return;
    const src = widgetsRef.current.find(x => x.id === from);
    if (!src || !src.config.on) return;
    const v = String(value);
    depth.current += 1;
    try {
      src.config.on.filter(l => l.event === event && (!l.when || l.when.trim().toLowerCase() === v.trim().toLowerCase())).forEach(l => runAction(l, v));
    } finally { depth.current -= 1; }
  }, [runAction]);
  d.emitRef.current = emit;
  return useMemo<ActionApi>(() => ({ emit }), [emit]);
}
