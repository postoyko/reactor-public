/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Added by Scaffold Studio ("Make configurable"). Lets the values that are written into a dashboard's code (service
 * domains, KPI lists, thresholds, refresh options, ...) be replaced from outside, through the `settings` prop that the
 * Designer and Layout Editor pass to a tile.
 *
 * How it works: Studio registers each chosen module-level constant here. On every render of the exported component,
 * apply() compares the incoming `settings` with the last ones and, when they differ, rewrites the constant IN PLACE
 * (arrays and records keep their identity, so helper functions elsewhere in the file see the change). Values that are
 * not in `settings` go back to the defaults written in the code. Regular expressions travel as { $re, flags } or as
 * "/source/flags" text and are turned back into RegExp objects using the default value as the template.
 */

type Slot = { get: () => any; set: (v: any) => void };

function clone(v: any): any {
  if (v instanceof RegExp) return new RegExp(v.source, v.flags);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o: any = {}; Object.keys(v).forEach(k => { o[k] = clone(v[k]); }); return o; }
  return v;
}

function toRegExp(v: any, fallback: RegExp): RegExp {
  try {
    if (v && typeof v === 'object' && typeof v.$re === 'string') return new RegExp(v.$re, typeof v.flags === 'string' ? v.flags : '');
    if (typeof v === 'string') { const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(v); return m ? new RegExp(m[1], m[2]) : new RegExp(v, fallback.flags); }
  } catch (e) { /* invalid pattern: keep the default */ }
  return fallback;
}

/** Turns a JSON value from the settings into the shape of `tpl` (the default): regexes revived, wrong types ignored. */
function coerce(tpl: any, v: any): any {
  if (tpl instanceof RegExp) return toRegExp(v, tpl);
  if (Array.isArray(tpl)) {
    if (!Array.isArray(v)) return clone(tpl);
    const item = tpl.length ? tpl[0] : undefined;
    return v.map(x => (item === undefined ? x : coerce(item, x)));
  }
  if (tpl && typeof tpl === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return clone(tpl);
    const keys = Object.keys(tpl), vals = Object.keys(v);
    const keyed = keys.length > 0 && keys.every(k => tpl[k] && typeof tpl[k] === 'object' && !(tpl[k] instanceof RegExp)) && vals.some(k => !(k in tpl));
    const o: any = {};
    vals.forEach(k => { o[k] = coerce(k in tpl ? tpl[k] : keyed ? tpl[keys[0]] : v[k], v[k]); });
    return o;
  }
  if (typeof tpl === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : tpl;
  if (typeof tpl === 'boolean') return typeof v === 'boolean' ? v : tpl;
  if (typeof tpl === 'string') return typeof v === 'string' ? v : tpl;
  return v;
}

function replaceInPlace(target: any, next: any) {
  if (Array.isArray(target) && Array.isArray(next)) { target.splice(0, target.length, ...next); return true; }
  if (target && next && typeof target === 'object' && typeof next === 'object' && !Array.isArray(target) && !Array.isArray(next)) {
    Object.keys(target).forEach(k => { delete target[k]; });
    Object.keys(next).forEach(k => { target[k] = next[k]; });
    return true;
  }
  return false;
}

export function makeConfig(slots: Record<string, Slot>) {
  const defaults: Record<string, any> = {};
  Object.keys(slots).forEach(k => { defaults[k] = clone(slots[k].get()); });
  let last = '\u0000';
  return {
    names: Object.keys(slots),
    /** Applies `settings` (name -> JSON value). Cheap when nothing changed. */
    apply(settings?: Record<string, unknown> | null) {
      const s = settings && typeof settings === 'object' ? settings : {};
      const sig = JSON.stringify(Object.keys(slots).map(k => (k in s ? [k, s[k]] : null)));
      if (sig === last) return;
      last = sig;
      Object.keys(slots).forEach(k => {
        const next = k in s ? coerce(defaults[k], s[k]) : clone(defaults[k]);
        const cur = slots[k].get();
        if (!replaceInPlace(cur, next)) slots[k].set(next);
      });
    }
  };
}
