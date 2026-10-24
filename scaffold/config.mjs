/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Settings" of a dashboard component, read from its source with the TypeScript compiler (nothing is run):
 *   - props:     the fields of the component's props type (name, type, kind, default, doc comment, allowed values);
 *   - constants: module-level `const`s whose value is a plain literal (numbers, strings, booleans, regular
 *                expressions, arrays and records of those): service domains, KPI lists, column lists, thresholds,
 *                refresh options. These are the things that are normally baked into the code.
 * The Layout Editor turns this into typed forms; config-runtime.ts applies the edited values at run time.
 */

import fs from 'fs';
import path from 'path';

const KINDS = { string: 'string', number: 'number', boolean: 'boolean' };

/** Evaluates a literal expression to JSON-able data. Regular expressions become { $re, flags }. Throws on anything else. */
export function literal(ts, n) {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression?.(n) || ts.isSatisfiesExpression?.(n)) n = n.expression;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (n.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
  if (ts.isRegularExpressionLiteral(n)) { const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(n.text); if (m) return { $re: m[1], flags: m[2] }; }
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(e => literal(ts, e));
  if (ts.isObjectLiteralExpression(n)) {
    const o = {};
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p)) throw new Error('not literal');
      const k = ts.isIdentifier(p.name) ? p.name.text : ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? p.name.text : null;
      if (k === null) throw new Error('not literal');
      o[k] = literal(ts, p.initializer);
    }
    return o;
  }
  throw new Error('not literal');
}

const isRe = v => v && typeof v === 'object' && typeof v.$re === 'string';
const kindOfValue = v => (isRe(v) ? 'regex' : Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'object' ? 'record' : typeof v);

/** Field shapes of an array of records, or of a record's values: [{ key, kind }]. */
function shapeOf(items) {
  const keys = new Map();
  items.forEach(it => { if (it && typeof it === 'object' && !Array.isArray(it) && !isRe(it)) Object.keys(it).forEach(k => { if (!keys.has(k)) keys.set(k, kindOfValue(it[k])); }); });
  return Array.from(keys, ([key, kind]) => ({ key, kind }));
}

const docOf = (ts, node) => {
  const d = node.jsDoc && node.jsDoc[node.jsDoc.length - 1];
  if (d && d.comment) return (typeof d.comment === 'string' ? d.comment : d.comment.map(c => c.text).join('')).trim().slice(0, 300);
  // a `// comment` line directly above
  const text = node.getSourceFile().text;
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  const last = ranges[ranges.length - 1];
  return last ? text.slice(last.pos, last.end).replace(/^\/\*+|\*+\/$/g, '').replace(/^\s*\/\/\s?/gm, '').replace(/^\s*\*\s?/gm, '').replace(/[─━=\-*#]{3,}/g, '').trim().slice(0, 300) : '';
};

/** Kind and allowed values of a props member from its type node. */
function typeInfo(ts, tn, sf, defs) {
  if (!tn) return { kind: 'unknown', type: '' };
  const type = tn.getText().replace(/\s+/g, ' ').slice(0, 120);
  const k = tn.kind, S = ts.SyntaxKind;
  if (k === S.StringKeyword) return { kind: 'string', type };
  if (k === S.NumberKeyword) return { kind: 'number', type };
  if (k === S.BooleanKeyword) return { kind: 'boolean', type };
  if (ts.isFunctionTypeNode(tn)) return { kind: 'function', type };
  if (ts.isArrayTypeNode(tn)) { const e = typeInfo(ts, tn.elementType, sf, defs); return { kind: 'array', type, of: e.kind }; }
  if (ts.isTypeReferenceNode(tn)) {
    const nm = tn.typeName.getText();
    if (/^(ReactNode|ReactElement|JSX\.Element)$/.test(nm.replace(/^React\./, ''))) return { kind: 'node', type };
    if (/^(Array|ReadonlyArray)$/.test(nm) && tn.typeArguments && tn.typeArguments[0]) { const e = typeInfo(ts, tn.typeArguments[0], sf, defs); return { kind: 'array', type, of: e.kind }; }
    if (/^Record$/.test(nm)) return { kind: 'record', type };
    const al = defs && defs.get(nm);
    if (al && al.alias && !al.seen) { al.seen = true; const r = typeInfo(ts, al.alias, al.sf, defs); al.seen = false; return { ...r, type: nm }; }
    return { kind: 'unknown', type };
  }
  if (ts.isUnionTypeNode(tn)) {
    const lits = tn.types.filter(t => ts.isLiteralTypeNode(t));
    const others = tn.types.filter(t => !ts.isLiteralTypeNode(t) && t.kind !== S.UndefinedKeyword && t.kind !== S.NullKeyword);
    if (lits.length && !others.length) {
      const options = lits.map(t => (ts.isStringLiteral(t.literal) ? t.literal.text : ts.isNumericLiteral(t.literal) ? Number(t.literal.text) : t.literal.kind === S.TrueKeyword ? true : t.literal.kind === S.FalseKeyword ? false : null)).filter(v => v !== null);
      if (options.length && options.every(o => typeof o === 'string')) return { kind: 'enum', type, options };
      if (options.length && options.every(o => typeof o === 'number')) return { kind: 'enum', type, options, numeric: true };
      if (options.length && options.every(o => typeof o === 'boolean')) return { kind: 'boolean', type };
    }
    if (others.length === 1) return typeInfo(ts, others[0], sf, defs);
  }
  if (ts.isTypeLiteralNode(tn)) return { kind: 'record', type: 'object' };
  return { kind: 'unknown', type };
}

/** Props of the main component: [{ name, optional, kind, type, doc, options?, default? }]. */
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (fs.existsSync(c)) return c;
  return null;
}
/** Interfaces and type aliases of this file and (one level of) its relative imports. */
function collectTypes(ts, sf, ifaces, defs, depth) {
  sf.statements.forEach(st => {
    if (ts.isInterfaceDeclaration(st)) ifaces.set(st.name.text, st);
    if (ts.isTypeAliasDeclaration(st)) {
      if (ts.isTypeLiteralNode(st.type)) ifaces.set(st.name.text, { members: st.type.members, name: st.name });
      defs.set(st.name.text, { alias: st.type, sf });
    }
    if (depth < 2 && ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const f = resolveImport(sf.fileName, st.moduleSpecifier.text);
      if (f) { try { collectTypes(ts, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS), ifaces, defs, depth + 1); } catch (e) { /* unreadable import */ } }
    }
  });
}
function readProps(ts, sf) {
  const ifaces = new Map(), defs = new Map();
  collectTypes(ts, sf, ifaces, defs, 0);
  const comps = [];
  const consider = (name, fn, extraTypeArg) => {
    if (!/^[A-Z]/.test(name) || !fn || !fn.body) return;
    const txt = fn.getText();
    if (!/<[A-Za-z][\s\S]*>|jsx|React\.createElement/i.test(txt) && !/return\s*\(?\s*</.test(txt)) return;
    comps.push({ name, fn, extraTypeArg, size: txt.length });
  };
  let defaultName = null;
  sf.statements.forEach(st => {
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) defaultName = st.expression.text;
    if (ts.isFunctionDeclaration(st) && st.name) consider(st.name.text, st);
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => {
      if (!ts.isIdentifier(d.name) || !d.initializer) return;
      let f = d.initializer; while (ts.isParenthesizedExpression(f) || ts.isAsExpression(f)) f = f.expression;
      if (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) consider(d.name.text, f, d.type && ts.isTypeReferenceNode(d.type) && d.type.typeArguments ? d.type.typeArguments[0] : null);
    });
  });
  const main = comps.find(c => c.name === defaultName) || comps.sort((a, b) => b.size - a.size)[0];
  if (!main) return { component: null, props: [], stateKeys: [] };
  const p0 = main.fn.parameters[0];
  let typeNode = (p0 && p0.type) || main.extraTypeArg;
  let members = null;
  if (typeNode && ts.isTypeLiteralNode(typeNode)) members = typeNode.members;
  else if (typeNode && ts.isTypeReferenceNode(typeNode)) { const d = ifaces.get(typeNode.typeName.getText()); if (d) members = d.members; }
  const defaults = {};
  if (p0 && ts.isObjectBindingPattern(p0.name)) p0.name.elements.forEach(e => {
    const nm = (e.propertyName || e.name).getText();
    if (e.initializer) { try { defaults[nm] = literal(ts, e.initializer); } catch (er) { /* not a literal default */ } }
  });
  const props = [];
  (members || []).forEach(m => {
    if (!ts.isPropertySignature(m) || !m.name) return;
    const name = m.name.getText();
    const ti = typeInfo(ts, m.type, sf, defs);
    if (ti.kind === 'unknown' && /^on[A-Z]/.test(name)) ti.kind = 'function';
    const o = { name, optional: !!m.questionToken, kind: ti.kind, type: ti.type, doc: docOf(ts, m) };
    if (ti.options) o.options = ti.options;
    if (ti.numeric) o.numeric = true;
    if (ti.of) o.of = ti.of;
    if (name in defaults) o.default = defaults[name];
    props.push(o);
  });
  // interface X extends Y: members of the base too
  const extra = [];
  if (typeNode && ts.isTypeReferenceNode(typeNode)) {
    const d = ifaces.get(typeNode.typeName.getText());
    if (d && d.heritageClauses) d.heritageClauses.forEach(h => h.types.forEach(t => { const b = ifaces.get(t.expression.getText()); if (b && b.members) extra.push(...b.members); }));
  }
  extra.forEach(m => {
    if (!ts.isPropertySignature(m) || !m.name) return;
    const name = m.name.getText(); if (props.some(p => p.name === name)) return;
    const ti = typeInfo(ts, m.type, sf, defs);
    props.push({ name, optional: !!m.questionToken, kind: ti.kind, type: ti.type, doc: docOf(ts, m), ...(ti.options ? { options: ti.options } : {}), ...(name in defaults ? { default: defaults[name] } : {}) });
  });
  // components that take their settings from the route's `state` (useAkoraState) instead of props
  const stateKeys = new Map();
  const txtFn = main.fn;
  const walk = n => {
    if ((ts.isPropertyAccessExpression(n)) && ts.isIdentifier(n.expression) && n.expression.text === 'state') stateKeys.set(n.name.text, (stateKeys.get(n.name.text) || 0) + 1);
    ts.forEachChild(n, walk);
  };
  walk(txtFn);
  return { component: main.name, props, stateKeys: Array.from(stateKeys.keys()) };
}

/** Module-level literal constants. */
function readConstants(ts, sf) {
  const out = [];
  const tops = sf.statements;
  const names = [];
  const decls = [];
  tops.forEach(st => {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) return;
    st.declarationList.declarations.forEach(d => {
      if (!ts.isIdentifier(d.name) || !d.initializer) return;
      let v;
      try { v = literal(ts, d.initializer); } catch (e) { return; }
      const kind = kindOfValue(v);
      if (kind === 'null') return;
      const upper = /^[A-Z][A-Z0-9_]*$/.test(d.name.text);
      const collection = kind === 'array' || kind === 'record';
      if (!upper && !(collection && JSON.stringify(v).length > 20)) return; // plain lowercase scalars are usually local plumbing
      if (kind === 'array' && v.length === 0) return;
      decls.push({ st, d, v, kind });
      names.push(d.name.text);
    });
  });
  // derived: used by another top-level initializer that is not a function (so it is computed once, at load)
  const derivedOf = new Set();
  tops.forEach(st => {
    if (ts.isFunctionDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isImportDeclaration(st)) return;
    const scan = (n, inFn) => {
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) return;
      if (ts.isIdentifier(n) && names.includes(n.text)) {
        const own = decls.find(x => x.st === st && x.d.name.text === n.text);
        if (!own && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)) derivedOf.add(n.text);
      }
      ts.forEachChild(n, c => scan(c, inFn));
    };
    scan(st, false);
  });
  decls.forEach(({ d, v, kind, st }) => {
    const name = d.name.text;
    const c = { name, kind, value: v, line: sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1, doc: docOf(ts, st), type: d.type ? d.type.getText().replace(/\s+/g, ' ').slice(0, 80) : '', derived: derivedOf.has(name) };
    if (kind === 'array') { const sh = shapeOf(v); if (sh.length) c.shape = sh; c.of = v.length && !sh.length ? kindOfValue(v[0]) : sh.length ? 'record' : 'string'; }
    if (kind === 'record') { const vals = Object.values(v); const sh = shapeOf(vals); if (sh.length) c.shape = sh; c.of = sh.length ? 'record' : vals.length ? kindOfValue(vals[0]) : 'string'; c.keyed = true; }
    out.push(c);
  });
  return out;
}

/** Everything a form needs: { ok, component, props, constants, bytes }. */
export function readSettings(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const { component, props, stateKeys } = readProps(ts, sf);
  const constants = readConstants(ts, sf);
  return { ok: true, component, props, stateKeys, constants };
}

export const CONFIG_MARKER = '// scaffold-config:v1';

const modsOf = (ts, n) => (ts.getModifiers ? ts.getModifiers(n) : n.modifiers) || [];

/** The component the file exports: { name, node, kind, decl?, fn, exported, isDefault } or null. */
function findMain(ts, sf) {
  const cands = [];
  let defaultName = null;
  const fnOf = init => { let n = init; while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n))) n = n.expression; return n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) ? n : null; };
  sf.statements.forEach(st => {
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) defaultName = st.expression.text;
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      const m = modsOf(ts, st);
      cands.push({ name: st.name.text, node: st, kind: 'function', fn: st, exported: m.some(x => x.kind === ts.SyntaxKind.ExportKeyword), isDefault: m.some(x => x.kind === ts.SyntaxKind.DefaultKeyword) });
    }
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => {
      if (!ts.isIdentifier(d.name) || !d.initializer) return;
      const fn = fnOf(d.initializer);
      if (fn) cands.push({ name: d.name.text, node: st, kind: 'var', decl: d, fn, exported: modsOf(ts, st).some(x => x.kind === ts.SyntaxKind.ExportKeyword), isDefault: false });
    });
  });
  cands.forEach(c => { if (c.name === defaultName) c.exported = true; });
  const pool = cands.filter(c => /^[A-Z]/.test(c.name) && /<[A-Za-z>]|createElement/.test(c.fn.getText()));
  return pool.find(c => c.name === defaultName) || pool.find(c => c.isDefault) || pool.filter(c => c.exported).sort((a, b) => b.fn.getText().length - a.fn.getText().length)[0] || null;
}

/** Why this file cannot be made configurable, or '' when it can. */
export function configProblem(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(CONFIG_MARKER)) return 'Already configurable (made by Studio).';
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const m = findMain(ts, sf);
  if (!m) return 'No exported component was found.';
  if (!m.exported) return 'The main component is not exported.';
  return '';
}

/** New source text with the chosen constants (names) made editable through the `settings` prop. */
export function configTransform(ts, file, names) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const main = findMain(ts, sf);
  if (!main || !main.exported) throw new Error('No exported component was found.');
  const all = readConstants(ts, sf).filter(c => names.includes(c.name));
  if (!all.length) throw new Error('None of those constants can be made editable.');
  const edits = [];
  const slots = [];
  all.forEach(c => {
    let decl = null, stmt = null;
    sf.statements.forEach(st => { if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => { if (ts.isIdentifier(d.name) && d.name.text === c.name) { decl = d; stmt = st; } }); });
    if (!decl) return;
    if (c.kind === 'array' || c.kind === 'record') { slots.push(`  ${JSON.stringify(c.name)}: { get: () => ${c.name}, set: () => {} },`); return; }
    if (stmt.declarationList.declarations.length !== 1) return; // `const A = 1, B = 2`: leave alone
    const kw = stmt.declarationList.getChildren().find(ch => ch.kind === ts.SyntaxKind.ConstKeyword);
    if (!kw) return;
    edits.push({ start: kw.getStart(), end: kw.getEnd(), text: 'let' });
    slots.push(`  ${JSON.stringify(c.name)}: { get: () => ${c.name}, set: (v: any) => { ${c.name} = v; } },`);
  });
  if (!slots.length) throw new Error('None of those constants can be made editable.');

  const base = `${main.name}__Base`;
  if (main.kind === 'var') {
    const nm = main.decl.name;
    edits.push({ start: nm.getStart(), end: nm.getEnd(), text: base });
    const ex = modsOf(ts, main.node).find(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ex) edits.push({ start: ex.getStart(), end: ex.getEnd() + 1, text: '' });
  } else {
    edits.push({ start: main.fn.name.getStart(), end: main.fn.name.getEnd(), text: base });
    modsOf(ts, main.node).filter(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword).forEach(m => edits.push({ start: m.getStart(), end: m.getEnd() + 1, text: '' }));
  }
  // A separate `export default Name;` would run before the wrapper exists: move it to the end.
  const ea = sf.statements.find(st => ts.isExportAssignment(st) && ts.isIdentifier(st.expression) && st.expression.text === main.name);
  if (ea) edits.push({ start: ea.getStart(), end: ea.getEnd(), text: '' });
  const imports = sf.statements.filter(s => ts.isImportDeclaration(s));
  const at = imports.length ? imports[imports.length - 1].getEnd() : 0;
  const hasReact = imports.some(s => s.importClause && s.importClause.name && s.importClause.name.text === 'React') || /import\s+\*\s+as\s+React\b/.test(text);
  edits.push({ start: at, end: at, text: `\n${hasReact ? '' : "import React from 'react';\n"}import { makeConfig } from './config-runtime';` });

  const tail = `\n\n${CONFIG_MARKER}\n/** Values written in this file that the Designer / Layout Editor may replace through the \`settings\` prop. Added by Concert Workbench (config-runtime.ts). */\nconst __cfg = makeConfig({\n${slots.join('\n')}\n});\n\nexport const ${main.name}: React.FC<any> = (props) => {\n  __cfg.apply(props && props.settings);\n  return React.createElement(${base}, props);\n};\n${main.isDefault || ea ? `export default ${main.name};\n` : ''}`;
  edits.push({ start: text.length, end: text.length, text: tail });

  edits.sort((x, y) => y.start - x.start || y.end - x.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
