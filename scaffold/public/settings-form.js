// Typed settings forms for a dashboard tile in the Layout Editor.
// Two kinds of settings, both read from the dashboard's source by Studio (scaffold/config.mjs):
//   - options  = the component's props (booleans, choices, numbers, text, lists): saved in widget.config.props
//   - content  = values written in the code (service domains, KPI lists, thresholds, refresh options): saved in widget.config.settings,
//                editable once the dashboard has been made configurable (scaffold/config-runtime.ts).
// Nothing here talks to the dashboard itself: the forms only edit the saved layout.

const cache = new Map(); // tile id -> Promise<schema>

export function forgetSchema(tile) { cache.delete(tile); }
function schemaOf(api, tile) {
  if (!cache.has(tile)) cache.set(tile, api(`/api/settings?tile=${encodeURIComponent(tile)}`).catch(e => { cache.delete(tile); throw e; }));
  return cache.get(tile);
}

// props the Designer cannot supply: data and callbacks that the host or the dashboard fills in itself
const HOST_PROPS = new Set(['alerts', 'incidents', 'loading', 'error', 'refetch', 'queryApi', 'part', 'settings', 'children', 'className', 'style']);

const isRe = v => v && typeof v === 'object' && typeof v.$re === 'string';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = v => (isRe(v) ? `/${v.$re}/${v.flags || ''}` : v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function parseRe(t) {
  const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(t.trim());
  const src = m ? m[1] : t, flags = m ? m[2] : 'i';
  try { new RegExp(src, flags); } catch (e) { return null; }
  return { $re: src, flags };
}
function parseCell(kind, text, was) {
  const t = String(text);
  if (kind === 'number') { const n = Number(t); return t.trim() !== '' && Number.isFinite(n) ? n : was; }
  if (kind === 'boolean') return t === 'true';
  if (kind === 'regex') return parseRe(t) || was;
  return t;
}
const blank = kind => (kind === 'number' ? 0 : kind === 'boolean' ? false : kind === 'regex' ? { $re: '', flags: 'i' } : '');

/**
 * ctx: { h, put, api, say, w, set(fn, structural), rerender() }
 * Returns an element; it fills in once Studio has read the dashboard's source.
 */
export function settingsEditor(ctx) {
  const { h, w } = ctx;
  const tile = w.type.slice(5);
  const box = h('div', { class: 'le-set' }, h('div', { class: 'le-hint' }, 'Reading this dashboard’s settings…'));

  const upd = (kind, name, value) => ctx.set(x => {
    const cfg = { ...x.config }, o = { ...(cfg[kind] || {}) };
    if (value === undefined) delete o[name]; else o[name] = value;
    if (Object.keys(o).length) cfg[kind] = o; else delete cfg[kind];
    return { ...x, config: cfg };
  }, true);

  const jsonBox = (value, onValue, rows = 4) => {
    const t = h('textarea', { class: 'form-input', rows, style: 'font-family:monospace;font-size:.75rem', spellcheck: 'false' });
    t.value = value === undefined ? '' : JSON.stringify(value, null, 1);
    t.addEventListener('change', () => {
      const s = t.value.trim();
      if (!s) { onValue(undefined); return; }
      try { onValue(JSON.parse(s)); t.style.borderColor = ''; } catch (e) { t.style.borderColor = '#da1e28'; ctx.say('That is not valid JSON, so it was not saved.', false); }
    });
    return t;
  };

  // ---- options (props) ----
  function propRow(p) {
    const cur = (w.config.props || {})[p.name];
    const def = p.default;
    const reset = cur !== undefined && h('button', { class: 'btn btn-secondary btn-sm', title: 'Back to the default', onclick: () => upd('props', p.name, undefined) }, '×');
    let ctl;
    const label = h('span', { title: p.doc || p.type }, p.name);
    if (p.kind === 'boolean') {
      ctl = h('select', { class: 'form-select', onchange: e => upd('props', p.name, e.target.value === '' ? undefined : e.target.value === 'true') },
        h('option', { value: '', selected: cur === undefined }, `default${def !== undefined ? ` (${def})` : ''}`),
        h('option', { value: 'true', selected: cur === true }, 'on'), h('option', { value: 'false', selected: cur === false }, 'off'));
    } else if (p.kind === 'enum') {
      ctl = h('select', { class: 'form-select', onchange: e => upd('props', p.name, e.target.value === '' ? undefined : (p.numeric ? Number(e.target.value) : e.target.value)) },
        h('option', { value: '', selected: cur === undefined }, `default${def !== undefined ? ` (${def})` : ''}`),
        (p.options || []).map(o => h('option', { value: o, selected: cur === o }, String(o))));
    } else if (p.kind === 'number') {
      ctl = h('input', { class: 'form-input', type: 'number', value: cur === undefined ? '' : cur, placeholder: def !== undefined ? String(def) : '', onchange: e => upd('props', p.name, e.target.value === '' ? undefined : Number(e.target.value)) });
    } else if (p.kind === 'string') {
      ctl = h('input', { class: 'form-input', value: cur === undefined ? '' : cur, placeholder: def !== undefined ? String(def) : '', onchange: e => upd('props', p.name, e.target.value === '' ? undefined : e.target.value.slice(0, 500)) });
    } else {
      ctl = jsonBox(cur, v => upd('props', p.name, v), 3);
    }
    return h('div', { class: 'le-f' }, h('div', { style: 'display:flex;gap:6px;align-items:center;justify-content:space-between' }, label, reset), ctl, p.doc && h('div', { class: 'le-hint' }, p.doc));
  }

  // ---- content (constants) ----
  const valueOf = c => ((w.config.settings || {})[c.name] !== undefined ? w.config.settings[c.name] : c.value);
  const save = (c, v) => upd('settings', c.name, same(v, c.value) ? undefined : v);

  function table(c, rows, cols, onRows, keyed) {
    const t = h('table', { class: 'le-tbl' });
    t.append(h('thead', {}, h('tr', {}, cols.map(k => h('th', {}, k.key)), h('th', {}, ''))));
    const body = h('tbody', {});
    rows.forEach((row, i) => {
      const tr = h('tr', {});
      cols.forEach(k => {
        const v = row[k.key];
        let cell;
        if (k.kind === 'boolean') cell = h('select', { class: 'form-select', onchange: e => { const next = rows.map(r => ({ ...r })); next[i][k.key] = e.target.value === 'true'; onRows(next); } }, h('option', { value: 'true', selected: v === true }, 'yes'), h('option', { value: 'false', selected: v !== true }, 'no'));
        else cell = h('input', { class: 'form-input', value: show(v), title: k.kind === 'regex' ? 'Pattern: /text/flags (flags default to i)' : '', type: k.kind === 'number' ? 'number' : 'text', onchange: e => { const next = rows.map(r => ({ ...r })); next[i][k.key] = parseCell(k.kind, e.target.value, v); if (k.kind === 'regex' && next[i][k.key] === v && e.target.value.trim() !== show(v)) ctx.say('That pattern is not a valid regular expression, so it was not saved.', false); onRows(next); } });
        tr.append(h('td', {}, cell));
      });
      tr.append(h('td', { style: 'white-space:nowrap' },
        !keyed && i > 0 && h('button', { class: 'btn btn-secondary btn-sm', title: 'Move up', onclick: () => { const n = rows.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; onRows(n); } }, '↑'),
        h('button', { class: 'btn btn-secondary btn-sm', title: 'Remove this row', onclick: () => onRows(rows.filter((_, j) => j !== i)) }, '×')));
      body.append(tr);
    });
    t.append(body);
    return h('div', { class: 'le-tblwrap' }, t, h('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:4px', onclick: () => { const nr = {}; cols.forEach(k => { nr[k.key] = blank(k.kind); }); onRows([...rows, nr]); } }, 'Add row'));
  }

  function constEditor(c) {
    const v = valueOf(c);
    const changed = (w.config.settings || {})[c.name] !== undefined;
    let ed;
    if (c.kind === 'string' || c.kind === 'number') {
      ed = h('input', { class: 'form-input', type: c.kind === 'number' ? 'number' : 'text', value: show(v), onchange: e => save(c, c.kind === 'number' ? (e.target.value === '' ? c.value : Number(e.target.value)) : e.target.value.slice(0, 1000)) });
    } else if (c.kind === 'boolean') {
      ed = h('select', { class: 'form-select', onchange: e => save(c, e.target.value === 'true') }, h('option', { value: 'true', selected: v === true }, 'yes'), h('option', { value: 'false', selected: v !== true }, 'no'));
    } else if (c.kind === 'regex') {
      ed = h('input', { class: 'form-input', value: show(v), onchange: e => { const r = parseRe(e.target.value); if (r) save(c, r); else ctx.say('That pattern is not a valid regular expression, so it was not saved.', false); } });
    } else if (c.kind === 'array' && c.shape && c.of === 'record') {
      ed = table(c, Array.isArray(v) ? v : [], c.shape, rows => save(c, rows), false);
    } else if (c.kind === 'array' && c.of !== 'record' && (Array.isArray(v) ? v : []).every(x => typeof x !== 'object')) {
      const t = h('textarea', { class: 'form-input', rows: Math.min(8, Math.max(3, (Array.isArray(v) ? v.length : 3) + 1)) });
      t.value = (Array.isArray(v) ? v : []).map(show).join('\n');
      t.addEventListener('change', () => { const num = c.of === 'number'; const lines = t.value.split('\n').map(s => s.trim()).filter(Boolean); save(c, num ? lines.map(Number).filter(Number.isFinite) : lines); });
      ed = h('div', {}, t, h('div', { class: 'le-hint' }, 'One per line.'));
    } else if (c.kind === 'record' && c.of !== 'record') {
      const entries = Object.keys(v || {}).map(k => ({ key: k, value: v[k] }));
      const kind = c.of === 'number' || c.of === 'boolean' ? c.of : 'string';
      ed = table(c, entries, [{ key: 'key', kind: 'string' }, { key: 'value', kind }], rows => { const o = {}; rows.forEach(r => { if (String(r.key).trim()) o[String(r.key).trim()] = r.value; }); save(c, o); }, true);
    } else {
      ed = jsonBox(v, nv => { if (nv === undefined) upd('settings', c.name, undefined); else save(c, nv); }, 6);
    }
    const count = Array.isArray(v) ? ` · ${v.length}` : c.kind === 'record' ? ` · ${Object.keys(v || {}).length}` : '';
    return h('details', { class: 'le-det', open: changed }, h('summary', {}, h('code', {}, c.name), count, changed && h('b', { style: 'color:var(--blue,#0f62fe)' }, ' · edited')),
      c.doc && h('div', { class: 'le-hint' }, c.doc), ed,
      changed && h('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:6px', onclick: () => upd('settings', c.name, undefined) }, 'Reset to the value in the code'));
  }

  schemaOf(ctx.api, tile).then(sc => {
    box.replaceChildren();
    const ps = (sc.props || []).filter(p => !HOST_PROPS.has(p.name) && p.kind !== 'function' && p.kind !== 'node');
    if (ps.length) {
      const g = h('details', { class: 'le-det', open: true }, h('summary', {}, `Options (${ps.length})`), ps.map(propRow));
      ctx.put(box, g);
    } else if ((sc.stateKeys || []).length) {
      ctx.put(box, h('div', { class: 'le-hint' }, `This dashboard takes its settings from the route’s own state (${sc.stateKeys.join(', ')}), not from props. Edit the route in Active Routes Switchboard.`));
    } else if (!(sc.constants || []).length) {
      ctx.put(box, h('div', { class: 'le-hint' }, 'No options or editable values were found in this dashboard’s source.'));
    }
    const cs = sc.constants || [];
    if (sc.configurable) {
      const edit = cs.filter(c => !c.derived);
      ctx.put(box, h('div', { class: 'le-h', style: 'margin-top:10px' }, 'Content written in the dashboard'),
        edit.map(constEditor),
        h('div', { class: 'le-hint' }, 'Edits are saved in this layout and applied when the layout runs inside Concert Operate. They do not change the dashboard’s code.'),
        h('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:6px', onclick: () => ctx.api('/api/config/undo', { tile }).then(r => { forgetSchema(tile); window.dispatchEvent(new Event('le-code-changed')); ctx.say(`Restored ${r.restored} from its backup. Build & Deploy to apply.`); ctx.rerender(); }).catch(e => ctx.say(e.message, false)) }, 'Undo “make configurable”'));
    } else if (cs.length) {
      const checks = cs.map(c => h('label', { class: 'le-chk', title: c.derived ? 'Another value is computed from this one when the file loads, so it cannot be changed live.' : (c.doc || '') },
        h('input', { type: 'checkbox', checked: !c.derived, disabled: !!c.derived, 'data-name': c.name }), ' ', h('code', {}, c.name), ` ${c.kind}${Array.isArray(c.value) ? ` · ${c.value.length}` : ''}${c.derived ? ' (computed at load)' : ''}`));
      const go = h('button', { class: 'btn btn-sm', style: 'margin-top:6px', disabled: !!sc.problem, onclick: () => {
        const names = checks.map(l => l.querySelector('input')).filter(i => i.checked && !i.disabled).map(i => i.getAttribute('data-name'));
        ctx.api('/api/config/apply', { tile, names }).then(r => { forgetSchema(tile); window.dispatchEvent(new Event('le-code-changed')); ctx.say(`${r.constants.length} value(s) of ${r.file} are now editable. Backup: ${r.backup}. Build & Deploy to apply.`); ctx.rerender(); }).catch(e => ctx.say(e.message, false));
      } }, 'Make these editable');
      ctx.put(box, h('div', { class: 'le-h', style: 'margin-top:10px' }, 'Content written in the dashboard'),
        h('div', { class: 'le-hint' }, `${cs.length} value(s) are written into this dashboard’s code (service domains, lists, thresholds…). Make them editable to change them here. Studio rewrites the file (a backup is made first, and Undo restores it).`),
        h('div', { class: 'le-checks' }, checks), sc.problem ? h('div', { class: 'le-hint', style: 'color:#da1e28' }, sc.problem) : go);
    }
  }).catch(e => { box.replaceChildren(h('div', { class: 'le-hint' }, `Could not read this dashboard’s settings: ${e.message}`)); });

  return box;
}
