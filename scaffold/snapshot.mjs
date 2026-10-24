/**
 * Real data for Design: a data snapshot recorded inside Concert Operate (Designer › ⋮ › Check the Concert Operate
 * API › Record and download) and uploaded here. The Design tab's preview then answers from it instead of sample data
 * (public/preview-stub.js). Only answers of read functions are accepted; nothing is ever sent to Concert Operate.
 *
 * The file holds the tenant's real data, so it stays in .studio/ (ignored by git, readable only by this user).
 */

import fs from 'fs';
import path from 'path';

export const SNAPSHOT_KIND = 'reactor-data-snapshot';
/** Large tenants: 5,000 alerts with their columns and the incidents' alerts fit well under this. */
export const MAX_SNAPSHOT_BYTES = 80 * 1024 * 1024;
const READ_FN = /^get[A-Za-z0-9]{1,80}$/;

/** Checks an uploaded snapshot. Returns the cleaned snapshot or throws with a reason a person can act on. */
export function validateSnapshot(o) {
  if (!o || typeof o !== 'object' || o.kind !== SNAPSHOT_KIND) throw new Error('That is not a data snapshot. Record one in Concert Operate: Dashboard Designer › ⋮ › Check the Concert Operate API › Record and download.');
  if (o.version !== 1) throw new Error(`This Workbench reads snapshot version 1, not ${o.version}. Update the Workbench.`);
  if (!Array.isArray(o.calls) || !o.calls.length) throw new Error('The snapshot has no recorded answers.');
  const calls = [];
  for (const c of o.calls) {
    if (!c || typeof c.fn !== 'string' || !READ_FN.test(c.fn)) throw new Error(`The snapshot contains a call that is not a read: ${c && c.fn}`);
    if (typeof c.key !== 'string' || c.key.length > 20000) throw new Error(`The snapshot contains a bad key for ${c.fn}.`);
    calls.push({ fn: c.fn, key: c.key, data: c.data === undefined ? null : c.data });
  }
  const taken = typeof o.taken === 'string' && !Number.isNaN(Date.parse(o.taken)) ? o.taken : null;
  return { kind: SNAPSHOT_KIND, version: 1, taken, designer: typeof o.designer === 'string' ? o.designer.slice(0, 20) : '', calls };
}

/** What the Setup card shows: when it was taken and how many answers per function. */
export function describeSnapshot(s, bytes) {
  const counts = {};
  s.calls.forEach(c => { counts[c.fn] = (counts[c.fn] || 0) + 1; });
  return { present: true, taken: s.taken, designer: s.designer, answers: s.calls.length, functions: counts, bytes };
}

export function createSnapshotStore({ rootDir }) {
  const file = path.join(rootDir, '.studio', 'data-snapshot.json');
  let cache = null; // { mtimeMs, text, snap }

  function load() {
    let st;
    try { st = fs.statSync(file); } catch (e) { cache = null; return null; }
    if (cache && cache.mtimeMs === st.mtimeMs) return cache;
    try {
      const text = fs.readFileSync(file, 'utf8');
      cache = { mtimeMs: st.mtimeMs, text, snap: validateSnapshot(JSON.parse(text)), bytes: st.size };
    } catch (e) { cache = null; }
    return cache;
  }

  return {
    info() { const c = load(); return c ? describeSnapshot(c.snap, c.bytes) : { present: false }; },
    /** The script the preview loads before preview-stub.js. */
    script() { const c = load(); return `window.__reactorSnapshot = ${c ? c.text.replace(/<\/script/gi, '<\\/script') : 'null'};\n`; },
    save(raw) {
      const snap = validateSnapshot(raw);
      const text = JSON.stringify(snap);
      if (text.length > MAX_SNAPSHOT_BYTES) throw new Error('The snapshot is too large.');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, text, { mode: 0o600 });
      fs.renameSync(tmp, file);
      cache = null;
      return this.info();
    },
    remove() { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } cache = null; return { present: false }; }
  };
}
