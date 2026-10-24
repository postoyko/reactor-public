/**
 * "Make splittable": turns a hand-written dashboard component into one that accepts a `part` prop, by reading its
 * source with the TypeScript compiler (taken from dashboard-extension/node_modules, so Studio needs no dependencies).
 *
 * What it changes in the component file (a backup is always made first, and "Undo" restores it):
 *   1. the original component is renamed <Name>__Inner and calls useSplit() as its first statement;
 *   2. its final `return (<Root> ...children... </Root>)` becomes a table of sections (one per direct child of Root,
 *      named from the {/* comment *\/} above it) plus a call to renderSplit();
 *   3. a small wrapper with the original name is added: with no `part` it renders the dashboard as before;
 *   4. split-runtime.tsx is copied next to the component (see that file for how the tiles share one live instance).
 * Everything else (hooks, data, state, styles) is untouched.
 */

import { makeTracer } from './trace.mjs';
import { hasField, sourceHints, severityNames } from './catalog.mjs';
import { readSettings } from './config.mjs';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

export const MARKER = '// scaffold-split:v1';

// ---------------------------------------------------------------------------------------------------------------
// Suggesting configurable Designer widgets for a section (heuristics on the section's JSX text; nothing is run).
// A section that looks like a table, donut, bar list or row of KPI cards gets an equivalent data widget whose query /
// field / filter are guessed from its wording. Anything unrecognised stays a real section. The user can change every
// guess in the Layout Editor, so a wrong guess costs one click, not a rebuild.
// ---------------------------------------------------------------------------------------------------------------
// What the converter knows besides the JSX: the real field catalog, and what the dashboard's own constants say (set by analyze()).
let CTX = { catalog: null, hints: {}, sev: {} };

const FIELD_GUESS = {
  getAlerts: [[/severity|\bsev\b/i, 'severityLabel'], [/source|sender|ingest|observer|probe|integration/i, 'sender'], [/resource|host|node|element|component/i, 'resource'], [/state|status/i, 'state'], [/type|class|categor/i, 'type'], [/team/i, 'team'], [/owner|assign/i, 'owner'], [/summary|alert|message|description/i, 'summary'], [/last.?seen|last.?occ|time/i, 'lastOccurrence'], [/first/i, 'firstOccurrence']],
  getStories: [[/priority|\bpri\b|\bp[1-5]\b/i, 'priority'], [/state|status/i, 'state'], [/team/i, 'team'], [/owner|assign/i, 'owner'], [/title|incident|summary|name/i, 'title'], [/alert|trigger|scope|count/i, 'alertCount'], [/created|date|time/i, 'created']]
};
const guessQuery = t => (/incident|stor(y|ies)|ticket|\bp[1-5]\b|priority/i.test(t) && !/alert/i.test(t) ? 'getStories' : /incident|stor(y|ies)|priority/i.test(t) && !/alert (stream|categor|source)/i.test(t) && !/sev/i.test(t) ? 'getStories' : 'getAlerts');
const okField = (q, k) => !CTX.catalog || !CTX.catalog.ok || hasField(CTX.catalog, q, k);
const guessField = (q, t) => { const m = FIELD_GUESS[q].find(([re, key]) => re.test(t) && okField(q, key)); return m ? m[1] : null; };
function guessWhere(q, t) {
  if (q !== 'getAlerts') return undefined;
  // the dashboard's own severity names (a constant like SEVERITY_INFO) decide which severity a label means
  const names = Object.keys(CTX.sev);
  if (names.length) {
    const hit = names.filter(n => new RegExp('\\b' + n + '\\b', 'i').test(t)).sort((x, y) => y.length - x.length)[0];
    if (hit) return { field: 'severity', value: String(CTX.sev[hit]) };
  }
  const w = /critical|sev(?:erity)?\s*6/i.test(t) ? 'Critical' : /major|sev(?:erity)?\s*5/i.test(t) ? 'Major' : /minor|sev(?:erity)?\s*4/i.test(t) ? 'Minor' : /warning|sev(?:erity)?\s*3/i.test(t) ? 'Warning' : null;
  return w ? { field: 'severityLabel', value: w } : undefined;
}
const plain = t => t.replace(/\{[^}]*\}/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const firstHeading = src => { const m = /<h[1-4][^>]*>([^<]*(?:<[^h/][^>]*>[^<]*)*)<\/h[1-4]>/.exec(src); return m ? plain(m[1].replace(/<[^>]+>/g, ' ')) : ''; };

/** Items for one piece of JSX source: [{type,title,cfg}] (empty = not recognised). */
function classifyText(src, label) {
  const title = firstHeading(src) || label;
  const lim = (/\.slice\(\s*0\s*,\s*(\d+)\s*\)/.exec(src) || [])[1];
  const ctx = `${title} ${label}`;
  // KPI cards: one number widget per kpi label
  const kpiLabels = [...src.matchAll(/className=["'`][^"'`]*kpi[-_]*label[^"'`]*["'`][^>]*>([^<{]+)</gi)].map(m => plain(m[1])).filter(Boolean);
  if (kpiLabels.length >= 2) {
    return kpiLabels.map(l => {
      const q = guessQuery(l);
      const cfg = { query: q, metric: 'count' };
      if (/max|largest|biggest|scope|most/i.test(l)) { cfg.metric = 'max'; cfg.valueField = q === 'getStories' ? 'alertCount' : 'severity'; }
      else if (/distinct|unique|sources?|resources?|ingestion/i.test(l)) { cfg.metric = 'distinct'; cfg.valueField = guessField(q, l) || (q === 'getAlerts' ? 'sender' : 'team'); }
      const wh = guessWhere(q, l); if (wh) cfg.where = wh;
      else if (q === 'getStories' && /p1\b/i.test(l)) cfg.where = { field: 'priority', value: '1' };
      return { type: 'kpi', title: l.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40), cfg };
    });
  }
  if (/<table\b/i.test(src)) {
    const heads = [...src.matchAll(/<th[^>]*>([^<{]*)</gi)].map(m => plain(m[1])).filter(Boolean);
    const q = guessQuery(`${ctx} ${heads.join(' ')}`);
    const cols = [];
    heads.forEach(h => { const f = guessField(q, h); if (f && !cols.includes(f)) cols.push(f); });
    const cfg = { query: q, limit: lim ? Math.min(Number(lim), 500) : 50 };
    if (cols.length >= 2) cfg.columns = cols;
    const wh = guessWhere(q, ctx); if (wh) cfg.where = wh;
    return [{ type: 'table', title: title.slice(0, 60) || 'Table', cfg }];
  }
  if (/donut|pie|strokeDasharray|<circle\b/i.test(src)) {
    const q = guessQuery(ctx);
    const cfg = { query: q, groupBy: guessField(q, ctx) || (q === 'getStories' ? 'priority' : 'severityLabel'), limit: lim ? Number(lim) : 6 };
    const wh = guessWhere(q, ctx); if (wh) cfg.where = wh;
    return [{ type: 'donut', title: title.slice(0, 60) || 'Donut', cfg }];
  }
  if (/bar[-_]*(row|fill|list|track)|BarChart|<rect\b/i.test(src)) {
    const q = guessQuery(ctx);
    const cfg = { query: q, groupBy: guessField(q, ctx) || (q === 'getStories' ? 'priority' : 'summary'), limit: lim ? Number(lim) : 8 };
    const wh = guessWhere(q, ctx); if (wh) { cfg.where = wh; if (cfg.groupBy === wh.field) cfg.groupBy = 'summary'; }
    return [{ type: 'bar', title: title.slice(0, 60) || 'Bar chart', cfg }];
  }
  const h1 = /<h1[^>]*>([^<{]+)</i.exec(src);
  if (h1 && !/<table|<select|<canvas|<svg/i.test(src) && /header|title|nav|banner/i.test(label + ' ' + src.slice(0, 200))) {
    return [{ type: 'text', title: plain(h1[1]).slice(0, 60), cfg: { text: plain(h1[1]) } }];
  }
  return [];
}

const tracers = new WeakMap();
/** Several 'uses X' notes become one line about interactive filters. */
function tidy(notes) {
  const names = [], rest = [];
  notes.forEach(n => { const m = /^filter has several steps and uses (\w+)/.exec(n); if (m) { if (!names.includes(m[1])) names.push(m[1]); } else if (!rest.includes(n)) rest.push(n); });
  if (names.length) rest.unshift(`the dashboard also filters by ${names.join(', ')} (set in the page); a widget has fixed filters instead`);
  return rest;
}
/** Drops fields that are not in the Designer's field list (and returns what was dropped). */
function checkFields(type, cfg) {
  const out = { ...cfg }, bad = [];
  const q = out.query;
  if (!CTX.catalog || !CTX.catalog.ok || !q) return { cfg: out, bad };
  const ok = k => hasField(CTX.catalog, q, k);
  if (out.groupBy && !ok(out.groupBy)) { bad.push(out.groupBy); delete out.groupBy; }
  if (out.valueField && !ok(out.valueField)) { bad.push(out.valueField); delete out.valueField; }
  if (out.where && !ok(out.where.field)) { bad.push(out.where.field); delete out.where; }
  if (Array.isArray(out.also)) out.also = out.also.filter(c => ok(c.field) || (bad.push(c.field), false));
  if (Array.isArray(out.columns)) { const keep = out.columns.filter(ok); out.columns.filter(c => !ok(c)).forEach(c => bad.push(c)); if (keep.length >= 2) out.columns = keep; else delete out.columns; }
  if ((type === 'bar' || type === 'donut') && !out.groupBy) bad.push('(group field)');
  return { cfg: out, bad };
}
/** The dashboard's own data path (a constant such as ALERTS_PATH) supplies the alert filter when the code did not. */
function hint(cfg, notes) {
  const h = CTX.hints[cfg.query];
  if (h && h.filter && cfg.filter === undefined) { cfg.filter = h.filter; notes.push(`filter \`${h.filter}\` taken from ${h.from}`); }
}

/** Replaces the label-based guess with what the dashboard's own code says (see trace.mjs); keeps the guess where tracing fails. */
function refine(ts, srcNode, items) {
  const sf = srcNode.getSourceFile();
  if (!tracers.has(sf)) tracers.set(sf, makeTracer(ts, sf, CTX.catalog));
  const T = tracers.get(sf);
  const cards = [];
  T.walkAll(srcNode, n => { if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && /kpi[-_]*label/i.test(T.classOf(n)) && n.parent && ts.isJsxElement(n.parent)) cards.push(n.parent); });
  let k = 0;
  return items.map(it => {
    let r;
    try { r = it.type === 'kpi' ? (cards[k++] ? T.traceKpi(cards[k - 1]) : { traced: false, notes: [] }) : it.type === 'text' ? { traced: true, cfg: it.cfg, notes: [] } : T.traceList(srcNode, it.type); }
    catch (e) { r = { traced: false, notes: ['tracing failed: ' + e.message] }; }
    if (!(r.traced && r.cfg) && it.type !== 'text') {
      // nothing in the code could be followed: keep the label-based guess only if every field it names really exists
      const g = checkFields(it.type, it.cfg);
      if (g.bad.length) return null;
    }
    if (r.traced && r.cfg) {
      const cfg = { ...r.cfg };
      if (it.type === 'table' && cfg.limit === undefined) cfg.limit = it.cfg.limit || 50;
      if ((it.type === 'bar' || it.type === 'donut') && cfg.limit === undefined) cfg.limit = it.cfg.limit || 8;
      const notes = tidy(r.notes || []);
      const chk = checkFields(it.type, cfg); chk.bad.forEach(b => { notes.push(`${b} is not a field a widget can use, so it was dropped`); });
      Object.assign(cfg, chk.cfg);
      hint(cfg, notes);
      return { ...it, cfg, meta: { traced: true, notes } };
    }
    const g = checkFields(it.type, it.cfg), notes = [...(r.notes || [])];
    hint(g.cfg, notes);
    return { ...it, cfg: g.cfg, meta: { traced: false, notes: [...notes, 'guessed from labels'] } };
  }).filter(Boolean);
}

/** Suggestion for a whole section: tries a row of blocks first (each child), then the section as one block. */
export function suggestFor(ts, node, text, label) {
  let items = [], note = '';
  if (ts.isJsxElement(node)) {
    let kids = node.children.filter(c => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
    if (kids.length === 1 && ts.isJsxElement(kids[0])) kids = kids[0].children.filter(c => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
    if (kids.length >= 2) {
      const per = kids.map(k => refine(ts, k, classifyText(text.slice(k.getStart(), k.getEnd()), label)));
      if (per.filter(x => x.length).length >= 2) {
        items = per.flat();
        if (per.some(x => !x.length)) note = 'Some blocks in this row have no equivalent and are left out.';
      }
    }
  }
  if (!items.length) items = refine(ts, node, classifyText(text.slice(node.getStart(), node.getEnd()), label));
  return items.length ? { note, items: items.map(i => [i.type, i.title, i.cfg, i.meta]) } : null;
}

export function loadTS(extDir) {
  const req = createRequire(path.join(extDir, 'package.json'));
  try { return req('typescript'); } catch (e) { return null; }
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function labelFromComment(text) {
  const m = /^\{\s*\/\*([\s\S]*?)\*\/\s*\}$/.exec(text.trim());
  if (!m) return '';
  return m[1].replace(/[─━—–\-=*#]{2,}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/^\s*\d+[.)]?\s*/, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
}

/** Finds the main component and its sections. Returns { ok:false, reason } or { ok:true, name, sections:[{id,label}], ... }. */
let catalogFn = null;
/** Lets the server say where the field catalog comes from: fn(ts) -> catalog (see catalog.mjs). */
export function setCatalogSource(fn) { catalogFn = fn; }

export function analyze(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) return { ok: false, status: 'split', reason: 'Already splittable (made by Studio).' };
  if (text.includes('// scaffold-config:v1')) return { ok: false, status: 'unsupported', reason: 'Already made configurable. Undo that first, make it splittable, then make it configurable again.' };
  if (/\bpart\b\s*[?:]|\{\s*part\s*[},]|props\.part\b/.test(text)) return { ok: false, status: 'native', reason: 'This dashboard already has its own `part` option.' };
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let consts = [];
  try { const st = readSettings(ts, file); if (st && st.ok) consts = st.constants; } catch (e) { /* no settings */ }
  CTX = { catalog: catalogFn ? catalogFn(ts) : null, hints: sourceHints(consts), sev: severityNames(consts) };

  const fnOf = init => {
    let n = init;
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n))) n = n.expression;
    if (n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return n;
    // React.memo(() => ...) / forwardRef are not handled
    return null;
  };

  const cands = [];
  let defaultName = null;
  sf.statements.forEach(st => {
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) defaultName = st.expression.text;
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      const mods = (ts.getModifiers ? ts.getModifiers(st) : st.modifiers) || [];
      cands.push({ kind: 'function', name: st.name.text, node: st, fn: st, exported: mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword), isDefault: mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) });
    }
    if (ts.isVariableStatement(st)) {
      const mods = (ts.getModifiers ? ts.getModifiers(st) : st.modifiers) || [];
      st.declarationList.declarations.forEach(d => {
        if (!ts.isIdentifier(d.name) || !d.initializer) return;
        const fn = fnOf(d.initializer);
        if (fn) cands.push({ kind: 'var', name: d.name.text, node: st, decl: d, fn, exported: mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword), isDefault: false });
      });
    }
  });

  const finalReturn = fn => {
    if (!fn.body || !ts.isBlock(fn.body)) return null;
    const rets = fn.body.statements.filter(s => ts.isReturnStatement(s) && s.expression);
    for (let i = rets.length - 1; i >= 0; i--) {
      let e = rets[i].expression;
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      if (ts.isJsxElement(e) || ts.isJsxFragment(e)) return { stmt: rets[i], root: e };
    }
    return null;
  };

  const pool = cands.filter(c => /^[A-Z]/.test(c.name) && finalReturn(c.fn));
  const main = pool.find(c => c.name === defaultName) || pool.find(c => c.isDefault) || pool.filter(c => c.exported).sort((a, b) => b.fn.getText().length - a.fn.getText().length)[0] || pool.sort((a, b) => b.fn.getText().length - a.fn.getText().length)[0];
  if (!main) return { ok: false, status: 'unsupported', reason: 'No component with a JSX `return (<Root>…</Root>)` was found.' };
  const fr = finalReturn(main.fn);
  const root = fr.root;
  const kids = root.children;
  const sections = [];
  let pending = '';
  const used = new Set();
  const uniq = (label, fallback) => {
    let id = slug(label) || fallback, n = 2, base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id); return id;
  };
  kids.forEach(k => {
    if (ts.isJsxText(k)) {
      if (!k.getText().trim()) return;
      sections.push({ id: uniq('text', 'text'), label: k.getText().trim().slice(0, 40), start: k.getStart(), end: k.getEnd(), raw: k.getText().trim(), isText: true });
      return;
    }
    if (ts.isJsxExpression(k) && !k.expression) { pending = labelFromComment(k.getText()) || pending; return; }
    let label = pending; pending = '';
    if (!label && (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k))) {
      const open = ts.isJsxElement(k) ? k.openingElement : k;
      const cls = open.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'className');
      const cm = cls && cls.initializer ? /["'`]([^"'`$]+)/.exec(cls.initializer.getText()) : null;
      label = cm ? cm[1].trim().split(/\s+/)[0].replace(/^[a-z0-9]+(?:-[a-z0-9]+)*__/i, '') : open.tagName.getText();
    }
    if (!label) label = 'section';
    // Overlays (Modal, Dialog, Drawer...) draw nothing in the page flow: keep them with the block before them, so a
    // button in that block can still open them even when the overlay's own "tile" is not on the page.
    const tag = (ts.isJsxElement(k) ? k.openingElement.tagName : ts.isJsxSelfClosingElement(k) ? k.tagName : null);
    if (tag && /^(Modal|Dialog|Drawer|ComposedModal|Toast|ToastNotification|Popover)\w*$/.test(tag.getText()) && sections.length) {
      const prev = sections[sections.length - 1];
      (prev.extra = prev.extra || []).push({ start: k.getStart(), end: k.getEnd() });
      return;
    }
    sections.push({ id: uniq(label, `section-${sections.length + 1}`), label: label.charAt(0).toUpperCase() + label.slice(1), start: k.getStart(), end: k.getEnd(), node: k });
  });
  sections.forEach(sec => { if (sec.node) sec.suggest = suggestFor(ts, sec.node, text, sec.label); });
  if (sections.length < 2) return { ok: false, status: 'unsupported', reason: 'The top-level layout has fewer than two blocks, so there is nothing to split.' };
  return { ok: true, status: 'candidate', name: main.name, main, sf, text, finalRet: fr, root, sections };
}

/** Applies the change; returns the new source text. */
export function transform(ts, a, file) {
  const { text, main, finalRet, root, sections, name } = a;
  const edits = []; // { start, end, text }
  const rootOpen = ts.isJsxFragment(root) ? '<>' : text.slice(root.openingElement.getStart(), root.openingElement.getEnd());
  const rootClose = ts.isJsxFragment(root) ? '</>' : text.slice(root.closingElement.getStart(), root.closingElement.getEnd());

  const table = sections.map(s => `    ${JSON.stringify(s.id)}: (<>${s.isText ? s.raw : [text.slice(s.start, s.end), ...(s.extra || []).map(x => text.slice(x.start, x.end))].join('\n')}</>),`).join('\n');
  const order = JSON.stringify(sections.map(s => s.id));
  const retText = `const __sections: Record<string, any> = {\n${table}\n  };\n  return renderSplit(__split, __sections, ${order}, (__c) => (${rootOpen}{__c}${rootClose}));`;
  edits.push({ start: finalRet.stmt.getStart(), end: finalRet.stmt.getEnd(), text: retText });

  // useSplit() as the first statement of the component body
  const body = main.fn.body;
  edits.push({ start: body.getStart() + 1, end: body.getStart() + 1, text: '\n  const __split = useSplit();' });

  // rename the component and add the wrapper after its statement
  const inner = `${name}__Inner`;
  const wrapper = `\n\n/** Shows one section (\`part\`) in a tile; without \`part\` it is the whole dashboard. Added by Concert Workbench (split-runtime.tsx). */\nexport const ${name}: React.FC<any> = (props) => (props && props.part\n  ? <SplitShell name=${JSON.stringify(name)} part={String(props.part)} Inner={${inner}} innerProps={props} />\n  : <${inner} {...props} />);\n`;
  if (main.kind === 'var') {
    const nm = main.decl.name;
    edits.push({ start: nm.getStart(), end: nm.getEnd(), text: inner });
    // the wrapper takes over the `export`; the inner one is no longer exported
    const mods = (ts.getModifiers ? ts.getModifiers(main.node) : main.node.modifiers) || [];
    const ex = mods.find(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ex) edits.push({ start: ex.getStart(), end: ex.getEnd() + 1, text: '' });
    edits.push({ start: main.node.getEnd(), end: main.node.getEnd(), text: wrapper });
  } else {
    edits.push({ start: main.fn.name.getStart(), end: main.fn.name.getEnd(), text: inner });
    const mods = (ts.getModifiers ? ts.getModifiers(main.node) : main.node.modifiers) || [];
    mods.filter(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword).forEach(m => edits.push({ start: m.getStart(), end: m.getEnd() + 1, text: '' }));
    edits.push({ start: main.node.getEnd(), end: main.node.getEnd(), text: wrapper + (main.isDefault ? `\nexport default ${name};\n` : '') });
  }

  // import of the runtime after the last import
  const imports = a.sf.statements.filter(s => ts.isImportDeclaration(s));
  const at = imports.length ? imports[imports.length - 1].getEnd() : 0;
  edits.push({ start: at, end: at, text: `\nimport { SplitShell, useSplit, renderSplit } from './split-runtime';` });

  edits.sort((x, y) => y.start - x.start || y.end - x.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return `${MARKER}\n${out}`;
}
