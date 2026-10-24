/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The real fields behind Designer widgets, read from source (nothing is typed in here twice):
 *   - the Designer's own field list and column mapping (dashboards/dashboard-builder/rows.ts), which is what a
 *     widget can actually group, filter and show;
 *   - the columns the toolkit itself asks getAlerts / getStories for (dashboard-extension/src/components/constants.ts).
 * "Convert to widgets" uses this to turn what a dashboard's code reads (a.resource?.name, s.createdTime, ...) into a
 * widget field, and to say plainly when a field has no widget equivalent instead of guessing one.
 */

import fs from 'fs';
import path from 'path';
import { literal } from './config.mjs';

/** Value of a top-level `const NAME = <literal>` in a file, or undefined. */
function constLiteral(ts, file, name) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return undefined; }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) { try { return literal(ts, d.initializer); } catch (e) { return undefined; } }
    }
  }
  return undefined;
}

// How the Designer turns a toolkit incident into a row (incidentRows in rows.ts): property in the data -> field key.
const STORY_PROPS = { priority: 'priority', state: 'state', team: 'team', owner: 'owner', title: 'title', description: 'description', createdTime: 'created', 'alertIds.length': 'alertCount', id: 'id' };

const cache = new Map();

/** { fields, alias, hostColumns, source } for the Designer in `designerDir`; `extDir` is optional. */
export function readCatalog(ts, designerDir, extDir) {
  const rows = path.join(designerDir, 'rows.ts');
  let mt = 0; try { mt = fs.statSync(rows).mtimeMs; } catch (e) { /* none */ }
  const ck = designerDir + '|' + mt + '|' + (extDir || '');
  if (cache.has(ck)) return cache.get(ck);

  const FIELDS = constLiteral(ts, rows, 'FIELDS');
  const MAP = constLiteral(ts, rows, 'ALERT_FIELD_MAP');
  const out = { ok: !!(FIELDS && MAP), fields: { getAlerts: [], getStories: [] }, alias: { getAlerts: {}, getStories: {} }, hostColumns: { getAlerts: [], getStories: [] }, source: 'dashboard-builder/rows.ts' };
  if (out.ok) {
    out.fields = { getAlerts: FIELDS.getAlerts || [], getStories: FIELDS.getStories || [] };
    const alerts = {};
    MAP.forEach(([col, key]) => { alerts[col] = key; });
    out.alias.getAlerts = alerts;
    const stories = {};
    Object.keys(STORY_PROPS).forEach(p => { if (out.fields.getStories.some(f => f.key === STORY_PROPS[p])) stories[p] = STORY_PROPS[p]; });
    out.alias.getStories = stories;
  }
  if (extDir) {
    const c = path.join(extDir, 'src', 'components', 'constants.ts');
    const q = constLiteral(ts, c, 'ALERT_QUERY_PARAMS');
    if (q && Array.isArray(q.columns)) out.hostColumns.getAlerts = q.columns.filter(x => typeof x === 'string' && !x.startsWith('@insights'));
    const ic = constLiteral(ts, c, 'INCIDENT_COLUMNS');
    if (Array.isArray(ic)) out.hostColumns.getStories = ic.filter(x => typeof x === 'string');
  }
  cache.set(ck, out);
  return out;
}

export const hasField = (cat, query, key) => !!cat && !!cat.fields[query] && cat.fields[query].some(f => f.key === key);

/**
 * What a dashboard's own constants say about where its data comes from: a path such as
 * '/aiops/api/v2/alerts?size=1000&filter=state%20%3D%20%27open%27' gives the alert filter and the row count.
 * `constants` is the `constants` list from readSettings().
 */
export function sourceHints(constants) {
  const hints = {};
  (constants || []).forEach(c => {
    if (c.kind !== 'string' || typeof c.value !== 'string') return;
    const m = /\/(alerts|incidents|stories)\b[^?]*\?(.*)$/i.exec(c.value);
    if (!m) return;
    const q = /alerts/i.test(m[1]) ? 'getAlerts' : 'getStories';
    let p; try { p = new URLSearchParams(m[2]); } catch (e) { return; }
    const h = hints[q] || (hints[q] = { from: c.name });
    if (p.get('filter')) h.filter = p.get('filter');
    if (p.get('size') && Number.isFinite(Number(p.get('size')))) h.size = Number(p.get('size'));
  });
  return hints;
}

/** Severity names a dashboard defines in its own constants ({6: {label:'Critical'}} or {6:'Critical'} ...): name (lowercase) -> number. */
export function severityNames(constants) {
  const out = {};
  (constants || []).forEach(c => {
    if (c.kind !== 'record' || !c.value || typeof c.value !== 'object') return;
    const ent = Object.entries(c.value);
    const lab = v => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.label || v.name : undefined);
    const named = ent.filter(([k, v]) => /^\d+$/.test(k) && typeof lab(v) === 'string');
    if (named.length >= 3 && named.some(([, v]) => /critical|major|minor|warning/i.test(lab(v)))) named.forEach(([k, v]) => { out[String(lab(v)).toLowerCase()] = Number(k); });
  });
  return out;
}
