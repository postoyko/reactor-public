// Traces what a dashboard section really shows, using the component's own source: which query the rows come from
// (the fetch URL), which filters were applied on the way (.filter predicates, the URL's filter=), which fields a table
// shows, what a KPI counts, what a helper groups by. Static analysis of one file; nothing is run. Anything it cannot
// follow is reported in `notes` rather than guessed silently.

// Field names used by the dashboard's REST data -> Designer field keys. `null` = computed in the dashboard, not a data field.
const ALIAS = {
  getAlerts: {
    severity: 'severity', state: 'state', summary: 'summary', id: 'id', 'resource.name': 'resource', resource: 'resource',
    'sender.name': 'sender', sender: 'sender', 'type.classification': 'type', 'type.eventType': 'type', type: 'type',
    firstOccurrenceTime: 'firstOccurrence', lastOccurrenceTime: 'lastOccurrence', acknowledged: 'acknowledged', team: 'team', owner: 'owner'
  },
  getStories: {
    priority: 'priority', state: 'state', title: 'title', description: 'description', id: 'id', team: 'team', owner: 'owner',
    createdTime: 'created', 'alertIds.length': 'alertCount', alertCount: 'alertCount'
  }
};

import fs from 'node:fs';
import path from 'node:path';

export function makeTracer(ts, sf, catalog) {
  const ALIASES = catalog && catalog.ok ? catalog.alias : ALIAS;
  const fileCache = new Map();
  const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  function loadFile(from, spec) {
    if (!spec.startsWith('.')) return null; // packages are not followed
    const base = path.resolve(path.dirname(from), spec);
    for (const e of EXTS) {
      const f = base + e;
      try { if (fs.statSync(f).isFile()) {
        if (!fileCache.has(f)) fileCache.set(f, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
        return fileCache.get(f);
      } } catch (err) { /* try next */ }
    }
    return null;
  }
  /** A name imported from a relative file -> its declaration there. */
  function fromImport(name, file) {
    for (const st of file.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const ic = st.importClause;
      let want = null;
      if (ic.name && ic.name.text === name) want = 'default';
      if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) ic.namedBindings.elements.forEach(e => { if (e.name.text === name) want = e.propertyName ? e.propertyName.text : e.name.text; });
      if (!want) continue;
      const target = loadFile(file.fileName, st.moduleSpecifier.text);
      if (!target) return null;
      if (want !== 'default') return declsOf(target).get(want) || reexport(want, target);
      for (const t of target.statements) {
        if (ts.isExportAssignment(t) && ts.isIdentifier(t.expression)) return declsOf(target).get(t.expression.text) || null;
        if (ts.isFunctionDeclaration(t) && t.name && t.modifiers && t.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) return { fn: t };
      }
      return null;
    }
    return null;
  }
  function reexport(name, file) { // export { x } from './y'
    for (const st of file.statements) {
      if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const t = loadFile(file.fileName, st.moduleSpecifier.text);
        if (t) { const d = declsOf(t).get(name); if (d) return d; }
      }
    }
    return null;
  }
  const text = sf.text;
  const unwrap = n => { while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression?.(n))) n = n.expression; return n; };
  const unknown = why => ({ t: 'unknown', why });
  const isFn = n => n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n));

  // ---- scopes: name -> declaration, per function / file ----
  const scopeCache = new Map();
  function declsOf(container) {
    if (scopeCache.has(container)) return scopeCache.get(container);
    const m = new Map();
    const addBinding = (b, init, path) => {
      if (ts.isIdentifier(b)) { m.set(b.text, { init, path }); return; }
      if (ts.isObjectBindingPattern(b)) b.elements.forEach(e => {
        const key = e.propertyName ? e.propertyName.getText() : e.name.getText();
        if (ts.isIdentifier(e.name)) m.set(e.name.text, { init, path: [...path, key] });
      });
      if (ts.isArrayBindingPattern(b)) b.elements.forEach((e, i) => { if (ts.isBindingElement(e) && ts.isIdentifier(e.name)) m.set(e.name.text, { init, path: [...path, i] }); });
    };
    const visit = n => {
      if (n !== container && isFn(n) && !ts.isFunctionDeclaration(n)) { /* nested arrow: own scope */ return; }
      if (ts.isVariableDeclaration(n) && n.initializer) addBinding(n.name, n.initializer, []);
      if (ts.isFunctionDeclaration(n) && n !== container && n.name) m.set(n.name.text, { fn: n });
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(container, visit);
    if (isFn(container)) container.parameters.forEach((p, i) => { if (ts.isIdentifier(p.name)) m.set(p.name.text, { param: container, index: i }); });
    scopeCache.set(container, m);
    return m;
  }
  function lookup(name, from) {
    for (let n = from; n; n = n.parent) {
      if (isFn(n) || ts.isSourceFile(n)) {
        const d = declsOf(n).get(name); if (d) return d;
        if (ts.isSourceFile(n)) { const i = fromImport(name, n); if (i) return i; }
      }
    }
    return null;
  }

  // ---- helpers ----
  const strOf = (n, depth = 0) => {
    n = unwrap(n);
    if (!n || depth > 6) return null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(s => (strOf(s.expression, depth + 1) ?? '') + s.literal.text).join('');
    if (ts.isIdentifier(n)) { const d = lookup(n.text, n); return d && d.init ? strOf(d.init, depth + 1) : null; }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) { const a = strOf(n.left, depth + 1), b = strOf(n.right, depth + 1); return a !== null && b !== null ? a + b : null; }
    return null;
  };
  const queryOfUrl = u => (/incident|stor(y|ies)/i.test(u) ? 'getStories' : /alert/i.test(u) ? 'getAlerts' : null);
  const alertFilterOfUrl = u => { const m = /[?&]filter=([^&]+)/.exec(u); try { return m ? decodeURIComponent(m[1]) : undefined; } catch (e) { return undefined; } };

  function pathOf(expr, param) { // `a.sender?.name` -> ['sender','name'] when rooted at identifier `param`
    const parts = [];
    let n = unwrap(expr);
    while (n && (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))) {
      if (ts.isPropertyAccessExpression(n)) parts.unshift(n.name.text); else return null;
      n = unwrap(n.expression);
    }
    return n && ts.isIdentifier(n) && n.text === param && parts.length ? parts : null;
  }
  function aliasField(q, parts) {
    // Exact path only (a.resource.name -> resource). A path the Designer has no field for (a.resource.type, a.sender.hostname,
    // a.eventCount ...) returns null, so the caller reports it instead of mapping it onto a similar-looking field.
    const A = ALIASES[q] || {};
    const full = parts.join('.');
    return full in A ? A[full] : null;
  }
  const litOf = n => {
    n = unwrap(n);
    if (!n) return undefined;
    if (ts.isNumericLiteral(n)) return n.text;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (n.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    if (n.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return '-' + n.operand.text;
    return undefined;
  };
  const OPS = new Map([[ts.SyntaxKind.EqualsEqualsEqualsToken, '='], [ts.SyntaxKind.EqualsEqualsToken, '='], [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!='], [ts.SyntaxKind.ExclamationEqualsToken, '!='], [ts.SyntaxKind.LessThanToken, '<'], [ts.SyntaxKind.LessThanEqualsToken, '<='], [ts.SyntaxKind.GreaterThanToken, '>'], [ts.SyntaxKind.GreaterThanEqualsToken, '>=']]);
  const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '!=': '!=' };

  /** Arrow predicate -> { conds, notes } (AND terms only). */
  function parsePred(fn, q) {
    const out = { conds: [], notes: [] };
    if (!fn || !isFn(fn)) { out.notes.push('filter is not a simple function'); return out; }
    const p = fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name) ? fn.parameters[0].name.text : null;
    let body = fn.body;
    if (ts.isBlock(body)) {
      const rets = body.statements.filter(s => ts.isReturnStatement(s));
      if (body.statements.length === 1 && rets.length === 1 && rets[0].expression) body = rets[0].expression;
      else {
        const names = new Set();
        const walk = n => { if (ts.isIdentifier(n) && lookupIsState(n)) names.add(n.text); ts.forEachChild(n, walk); };
        walk(body);
        out.notes.push(`filter has several steps${names.size ? ` and uses ${[...names].join(', ')}` : ''}, so it is not applied`);
        return out;
      }
    }
    const terms = [];
    const split = n => { n = unwrap(n); if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { split(n.left); split(n.right); } else terms.push(n); };
    split(body);
    terms.forEach(t => {
      if (ts.isBinaryExpression(t) && OPS.has(t.operatorToken.kind)) {
        let op = OPS.get(t.operatorToken.kind), pa = pathOf(t.left, p), lv = litOf(t.right);
        if (!pa) { pa = pathOf(t.right, p); lv = litOf(t.left); if (pa) op = FLIP[op]; }
        if (pa && lv !== undefined) {
          const f = aliasField(q, pa);
          if (f) out.conds.push({ field: f, op, value: lv });
          else out.notes.push(`\`${pa.join('.')}\` is worked out inside the dashboard, so that condition is not applied`);
          return;
        }
      }
      out.notes.push(`condition \`${t.getText().slice(0, 60)}\` is not applied`);
    });
    return out;
  }
  function lookupIsState(id) { const d = lookup(id.text, id); return !!(d && d.init && /useState/.test(d.init.getText())); }

  // ---- value evaluation ----
  const merge = (a, b) => ({ ...a, notes: [...(a.notes || []), ...(b.notes || [])] });
  const withConds = (v, pr) => ({ ...v, conds: [...v.conds, ...pr.conds], notes: [...(v.notes || []), ...pr.notes] });
  const CONTAINER_KEYS = new Set(['items', 'alerts', 'incidents', 'stories', 'data', 'results', 'rows']);

  function ev(node, env = new Map(), depth = 0) {
    node = unwrap(node);
    if (!node || depth > 40) return unknown('too deep');
    const go = n => ev(n, env, depth + 1);

    if (ts.isIdentifier(node)) {
      if (env.has(node.text)) return env.get(node.text);
      const d = lookup(node.text, node);
      if (!d) return unknown(`${node.text} not found`);
      if (d.init) {
        let init = unwrap(d.init);
        // useState: first element is whatever gets passed to the setter
        if (init && ts.isCallExpression(init) && /^(React\.)?useState$/.test(init.expression.getText()) && d.path[0] === 0) {
          const setter = ts.isArrayBindingPattern(d.init.parent.name) && d.init.parent.name.elements[1] && d.init.parent.name.elements[1].name && d.init.parent.name.elements[1].name.text;
          return setter ? viaSetter(setter, node, env, depth) : unknown('state');
        }
        // useMemo(() => expr)
        if (init && ts.isCallExpression(init) && /^(React\.)?useMemo$/.test(init.expression.getText()) && isFn(init.arguments[0])) return pick(retOf(init.arguments[0], env, depth), d.path, env, depth);
        return pick(go(init), d.path, env, depth, init);
      }
      if (d.fn) return { t: 'fn', fn: d.fn };
      if (d.param) { // `.then(d => ...)`: the receiver's value
        const c = d.param.parent;
        if (c && ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'then') return go(c.expression.expression);
        return unknown(`${node.text} is a parameter`);
      }
      return unknown(node.text);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const base = go(node.expression);
      return getProp(base, node.name.text, env, depth);
    }
    if (ts.isElementAccessExpression(node)) return unknown('indexed');
    if (ts.isObjectLiteralExpression(node)) {
      const props = {};
      node.properties.forEach(p => {
        if (ts.isShorthandPropertyAssignment(p)) props[p.name.text] = p.name;
        else if (ts.isPropertyAssignment(p) && p.name) props[p.name.getText()] = p.initializer;
      });
      return { t: 'obj', props, env };
    }
    if (ts.isArrayLiteralExpression(node)) {
      if (node.elements.length === 1 && ts.isSpreadElement(node.elements[0])) return go(node.elements[0].expression);
      return { t: 'tuple', items: [...node.elements] };
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const a = go(node.left);
      return a.t !== 'unknown' ? a : go(node.right);
    }
    if (ts.isConditionalExpression(node)) { const a = go(node.whenTrue); return a.t !== 'unknown' ? a : go(node.whenFalse); }
    if (ts.isCallExpression(node)) return evCall(node, env, depth);
    return unknown(node.getText().slice(0, 40));
  }

  function pick(v, path, env, depth, initNode) {
    let cur = v;
    for (const k of path || []) {
      if (typeof k === 'number') {
        if (cur.t === 'tuple' && cur.items[k]) cur = ev(cur.items[k], env, depth + 1);
        else if (cur.t === 'tuple') cur = unknown('missing');
        else cur = unknown('destructured'); // e.g. const [a,b] = await Promise.all([...]) handled via tuple
      } else cur = getProp(cur, k, env, depth);
    }
    return cur;
  }
  function getProp(base, name, env, depth) {
    if (!base) return unknown(name);
    if (base.t === 'obj') return base.props[name] ? ev(base.props[name], base.env, depth + 1) : unknown(name);
    if (base.t === 'rows' || base.t === 'group') return name === 'length' ? { t: 'count', of: base } : CONTAINER_KEYS.has(name) ? base : unknown(name);
    if (base.t === 'resp') return name === 'length' ? { t: 'count', of: asRows(base) } : base; // response body -> rows
    return unknown(name);
  }
  function retOf(fn, env, depth) {
    if (!fn.body) return unknown('no body');
    if (!ts.isBlock(fn.body)) return ev(fn.body, env, depth + 1);
    const rets = [];
    const walk = n => { if (n !== fn && isFn(n)) return; if (ts.isReturnStatement(n) && n.expression) rets.push(n.expression); ts.forEachChild(n, walk); };
    ts.forEachChild(fn.body, walk);
    return rets.length ? ev(rets[rets.length - 1], env, depth + 1) : unknown('no return');
  }
  function viaSetter(setter, from, env, depth) {
    let found = null;
    const walk = n => {
      if (found) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === setter && n.arguments[0]) found = n.arguments[0];
      else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'then' && n.arguments[0] && ts.isIdentifier(n.arguments[0]) && n.arguments[0].text === setter) found = n.expression.expression;
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return found ? ev(found, env, depth + 1) : unknown('state never set');
  }

  function evCall(node, env, depth) {
    const go = n => ev(n, env, depth + 1);
    const callee = unwrap(node.expression);
    const argc = node.arguments;
    // fetch(url)
    if (ts.isIdentifier(callee) && callee.text === 'fetch' && argc[0]) {
      const u = strOf(argc[0]);
      const q = u ? queryOfUrl(u) : null;
      return q ? { t: 'resp', q, conds: [], notes: [], filter: q === 'getAlerts' ? alertFilterOfUrl(u) : undefined, exact: true } : unknown('fetch of an unknown URL');
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const m = callee.name.text, recv = () => go(callee.expression);
      if (callee.expression.getText() === 'Promise' && m === 'all' && argc[0] && ts.isArrayLiteralExpression(unwrap(argc[0]))) return { t: 'tuple', items: [...unwrap(argc[0]).elements] };
      if (m === 'json' || m === 'text') return recv();
      if (m === 'then' && isFn(argc[0])) return unknown('then');
      if (m === 'filter' && argc[0]) {
        const r = recv();
        if (r.t !== 'rows' && r.t !== 'resp') return r.t === 'group' ? { ...r, notes: [...(r.notes || []), 'filtered after grouping (not applied)'] } : r;
        return withConds(asRows(r), parsePred(unwrap(argc[0]), r.q));
      }
      if (m === 'slice' && argc.length) { const r = recv(), a = litOf(argc[0]), b = argc[1] ? litOf(argc[1]) : undefined; return a === '0' && b !== undefined && (r.t === 'rows' || r.t === 'group' || r.t === 'resp') ? { ...(r.t === 'group' ? r : asRows(r)), limit: Number(b) } : r; }
      if (m === 'map' || m === 'sort' || m === 'reverse' || m === 'concat') { const r = recv(); return r.t === 'group' ? r : r.t === 'resp' || r.t === 'rows' ? asRows(r) : r; }
      if (m === 'reduce' || m === 'forEach' || m === 'some' || m === 'every' || m === 'find') return unknown(m);
      if (callee.expression.getText() === 'Math' && (m === 'max' || m === 'min') && argc[0] && ts.isSpreadElement(argc[0]) && !argc[1]) {
        const inner = unwrap(argc[0].expression);
        if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'map' && isFn(unwrap(inner.arguments[0]))) {
          const r = ev(inner.expression.expression, env, depth + 1);
          const fn = unwrap(inner.arguments[0]);
          const p = fn.parameters[0] && fn.parameters[0].name.text;
          const body = ts.isBlock(fn.body) ? null : fn.body;
          const f = body && r.q ? aliasField(r.q, pathOf(body, p) || []) : null;
          if ((r.t === 'rows' || r.t === 'resp') && f) return { t: m === 'max' ? 'max' : 'min', of: asRows(r), field: f };
        }
      }
    }
    // local helper function: f(args)
    if (ts.isIdentifier(callee)) {
      const d = lookup(callee.text, callee);
      let fn = d && (d.fn || (d.init && isFn(unwrap(d.init)) ? unwrap(d.init) : null));
      if (fn && fn.body) {
        const args = argc.map(a => go(a));
        const sole = ts.isBlock(fn.body) ? null : fn.body;
        const bodyText = fn.body.getText();
        const arg0 = args[0];
        // helper over rows that returns grouped buckets
        if (arg0 && (arg0.t === 'rows' || arg0.t === 'resp') && /count/i.test(bodyText) && !sole) {
          const g = groupFieldOf(fn, arg0.q);
          if (g) {
            const kw = /\/[^/\n]+\/[gimsuy]*\.test|\.includes\(|keyword|pattern|match\(/i.test(bodyText);
            return { t: 'group', of: asRows(arg0), field: g, q: arg0.q, exact: !kw, notes: kw ? [`${callee.text}() buckets by keywords in the dashboard's code; the widget groups by ${g} instead`] : [] };
          }
        }
        // plain wrapper: bind parameters and evaluate the return
        const env2 = new Map(env);
        fn.parameters.forEach((p, i) => { if (ts.isIdentifier(p.name) && args[i]) env2.set(p.name.text, args[i]); });
        return retOf(fn, env2, depth + 1);
      }
    }
    return unknown(node.getText().slice(0, 40));
  }
  const asRows = r => (r.t === 'resp' ? { t: 'rows', q: r.q, conds: r.conds || [], notes: r.notes || [], filter: r.filter, exact: true } : r.t === 'group' ? { t: 'rows', q: r.q || (r.of && r.of.q), conds: (r.of && r.of.conds) || [], notes: r.notes || [], exact: false } : r);

  /** Which field a grouping helper counts by: the first aliasable property read from its loop / callback variable. */
  function groupFieldOf(fn, q) {
    const p = fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name) ? fn.parameters[0].name.text : null;
    if (!p) return null;
    const vars = new Set();
    const walk = n => {
      if (ts.isForOfStatement(n) && unwrap(n.expression).getText() === p && ts.isVariableDeclarationList(n.initializer)) { const d = n.initializer.declarations[0]; if (ts.isIdentifier(d.name)) vars.add(d.name.text); }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && unwrap(n.expression.expression).getText() === p && isFn(unwrap(n.arguments[0] || {}))) {
        const cb = unwrap(n.arguments[0]); if (cb.parameters[0] && ts.isIdentifier(cb.parameters[0].name)) vars.add(cb.parameters[0].name.text);
      }
      ts.forEachChild(n, walk);
    };
    walk(fn.body);
    let f = null;
    const scan = n => {
      if (f) return;
      if (ts.isPropertyAccessExpression(n)) for (const v of vars) { const pa = pathOf(n, v); if (pa) { const a = aliasField(q, pa); if (a) { f = a; return; } } }
      ts.forEachChild(n, scan);
    };
    scan(fn.body);
    return f;
  }

  // ---- reading a section's JSX ----
  const jsxTag = n => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null);
  const classOf = n => { const t = jsxTag(n); if (!t) return ''; const a = t.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.text === 'className'); return a && a.initializer ? a.initializer.getText() : ''; };
  const walkAll = (n, f) => { f(n); ts.forEachChild(n, c => walkAll(c, f)); };
  const exprChild = n => (ts.isJsxElement(n) ? n.children.find(c => ts.isJsxExpression(c) && c.expression) : null);

  function describe(v) {
    if (v.t === 'rows') {
      const [first, ...rest] = v.conds;
      const cfg = { query: v.q };
      if (first) cfg.where = { field: first.field, value: first.value, ...(first.op && first.op !== '=' ? { op: first.op } : {}) };
      if (rest.length) cfg.also = rest.map(c => ({ field: c.field, value: c.value, ...(c.op && c.op !== '=' ? { op: c.op } : {}) }));
      if (v.filter) cfg.filter = v.filter;
      if (v.limit) cfg.limit = v.limit;
      return cfg;
    }
    return null;
  }

  /** KPI card: label + the value expression next to it. */
  function traceKpi(card) {
    let valueExpr = null;
    walkAll(card, n => { if (!valueExpr && /value/.test(classOf(n))) { const e = exprChild(n); if (e) valueExpr = e.expression; } });
    if (!valueExpr) return { traced: false, notes: ['no value expression found'] };
    const v = ev(valueExpr);
    if (v.t === 'count' && v.of.t === 'rows') { const c = describe(v.of); delete c.limit; return { traced: true, cfg: { ...c, metric: 'count' }, notes: v.of.notes || [] }; }
    if ((v.t === 'max' || v.t === 'min') && v.of.t === 'rows' && v.t === 'max') { const c = describe(v.of); delete c.limit; return { traced: true, cfg: { ...c, metric: 'max', valueField: v.field }, notes: v.of.notes || [] }; }
    if (v.t === 'count' && v.of.t === 'group') return { traced: false, notes: [`${valueExpr.getText().slice(0, 40)} is computed by the dashboard's code`] };
    return { traced: false, notes: [`could not trace \`${valueExpr.getText().slice(0, 40)}\` to a query`] };
  }

  /** Table / bar / donut: the first `.map` over data inside the block. */
  function traceList(block, type) {
    let found = null;
    const cands = [];
    walkAll(block, n => {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || n.expression.name.text !== 'map') return;
      const cb = unwrap(n.arguments[0] || {});
      if (!isFn(cb) || !cb.body) return;
      let hasJsx = false; walkAll(cb.body, x => { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x)) hasJsx = true; });
      if (hasJsx) cands.push({ call: n, cb, tr: /<tr\b/.test(cb.body.getText()) });
    });
    found = (type === 'table' && cands.find(c => c.tr)) || cands[0] || null;
    if (!found) return { traced: false, notes: ['no data list found in this block'] };
    const v = ev(found.call.expression.expression);
    const p = found.cb.parameters[0] && ts.isIdentifier(found.cb.parameters[0].name) ? found.cb.parameters[0].name.text : null;
    if (v.t === 'group') {
      const cfg = { ...(describe(v.of) || {}), groupBy: v.field, metric: 'count' };
      if (v.limit) cfg.limit = v.limit; else delete cfg.limit;
      return { traced: !!cfg.query, cfg, notes: [...(v.notes || []), ...((v.of && v.of.notes) || [])] };
    }
    if (v.t === 'rows') {
      const cfg = describe(v) || {};
      if (type === 'table' && p) {
        const cols = [], noField = [];
        walkAll(found.cb.body, n => {
          if (!ts.isPropertyAccessExpression(n)) return;
          // a.resource.name is seen as a.resource and then as a.resource.name: only the outermost access counts
          if (n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n) return;
          const pa = pathOf(n, p); if (!pa) return;
          const f = aliasField(v.q, pa);
          if (f) { if (!cols.includes(f)) cols.push(f); } else if (!/^(length|map|filter|slice|join)$/.test(pa[pa.length - 1]) && !noField.includes(pa.join('.'))) noField.push(pa.join('.'));
        });
        if (cols.length >= 2) cfg.columns = cols;
        if (noField.length) v.notes = [...(v.notes || []), `the table also reads ${noField.slice(0, 6).join(', ')}, which have no widget field`];
      }
      if (type !== 'table' && p) { // bar/donut over raw rows: group by the first aliasable field it reads
        let f = null; walkAll(found.cb.body, n => { if (!f && ts.isPropertyAccessExpression(n)) { const pa = pathOf(n, p); if (pa) f = aliasField(v.q, pa); } });
        if (f) { cfg.groupBy = f; cfg.metric = 'count'; }
      }
      return { traced: !!cfg.query, cfg, notes: v.notes || [] };
    }
    return { traced: false, notes: [`could not trace \`${found.call.expression.expression.getText().slice(0, 40)}\` to a query`] };
  }

  return { traceKpi, traceList, ev, classOf, walkAll, jsxTag };
}
