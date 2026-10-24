/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carbon React components as dashboard widgets. Each entry names the component, lists the settings the Designer
 * shows for it, and draws it. A widget's settings live in `config.props`; list-like settings are one entry per line.
 *
 * Some components can take their items or their value from live data instead of typed text:
 *   - choosers (Dropdown, Select, Combo box, Multi-select, Radio buttons, Content switcher) can list the values of a
 *     field and set a filter that other widgets follow;
 *   - Tag, Progress bar and the notifications can show a count / measure of the rows;
 *   - Data table and Structured list show the rows themselves.
 * "Tabs", "Content switcher" and "Accordion" content can also be a whole dashboard or one of its sections:
 * write `tile:incident-atlas` or `tile:incident-atlas#graph` after the `::`.
 */

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionItem, ActionableNotification, Breadcrumb, BreadcrumbItem, Button, ButtonSet, Checkbox, CheckboxGroup,
  ClickableTile, CodeSnippet, ComboBox, ContainedList, ContainedListItem, ContentSwitcher, CopyButton, DataTable,
  DatePicker, DatePickerInput, DefinitionTooltip, Dropdown, ExpandableTile, FileUploader, Heading, InlineLoading,
  InlineNotification, Link, ListItem, Loading, MenuButton, MenuItem, Modal, MultiSelect, NumberInput, OrderedList, OverflowMenu,
  OverflowMenuItem, Pagination, PaginationNav, PasswordInput, ProgressBar, ProgressIndicator, ProgressStep, RadioButton,
  RadioButtonGroup, RadioTile, Search, Section, Select, SelectItem, SelectableTile, SkeletonPlaceholder, SkeletonText, Slider,
  StructuredListBody, StructuredListCell, StructuredListHead, StructuredListRow, StructuredListWrapper, Switch, Tab, TabList,
  TabPanel, TabPanels, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TableToolbar,
  TableToolbarContent, TableToolbarSearch, Tabs, Tag, TextArea, TextInput, Tile, TileAboveTheFoldContent,
  TileBelowTheFoldContent, TileGroup, TimePicker, Toggle, ToastNotification, Toggletip, ToggletipButton, ToggletipContent,
  Tooltip, TreeNode, TreeView, UnorderedList
} from '@carbon/react';
import { Widget, WidgetType, Row } from './types';
import { CarbonSpec, carbonDefaults as specDefaults, dataOn, GROUPS, SPECS } from './carbon-specs';
import { SemCell } from './Sem';
import { cell, fieldLabel, fieldsOf, formatNumber, groupMetric, metricValue, semanticColor } from './rows';
import { useBuilder } from './context';
import { Tile as EmbeddedTile } from './Tiles';
import { NestCtx, Slot } from './nest';
import { inputDefault } from './bindings';
import { indexOf, useCommand, useEmit } from './actions';
import { Note, Status, useWidgetData, WidgetData } from './Widgets';
import { ActionCombo, BreakdownPopover, CountBadge, IconStatus, ShapeStatus } from './carbon-status';
import { CarbonChart } from './carbon-charts';
import { ApplicationCardsWidget, IncidentInsightsWidget, PeoplePickerWidget, RunbookActivityWidget } from './carbon-concert';

export type Props = Record<string, any>;

export { GROUPS };
export interface Arg { p: Props; w: Widget; d?: WidgetData }
export interface CarbonDef extends CarbonSpec {
  render: (a: Arg) => React.ReactNode;
}

const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)) : typeof v === 'string' ? v.split('\n') : []).filter(x => x.trim() !== '');
const pair = (s: string): [string, string] => { const i = s.indexOf('::'); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 2).trim()]; };
const uid = (w: Widget, s = '') => `cw-${w.id}${s ? '-' + s : ''}`;
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const usesField = (p: Props) => p.source === 'field';

/** Content for a tab / switch: text, or an embedded dashboard / section written as tile:id or tile:id#part. */
function Content({ text, slot }: { text: string; slot?: string }) {
  if (slot && text.trim() === 'widgets') return <Slot id={slot} />;
  const m = /^tile:([a-z0-9-]+)(?:#([A-Za-z0-9_-]+))?$/.exec(text.trim());
  if (m) return <div style={{ height: '100%', minHeight: 200, position: 'relative' }}><EmbeddedTile id={m[1]} name={m[1]} props={m[2] ? { part: m[2] } : undefined} /></div>;
  return <div style={{ padding: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{text}</div>;
}

/** What an input holds: kept by the dashboard (so other widgets can use it), or here when there is no dashboard around it. */
function useValue(w: Widget): [string, (v: string) => void] {
  const { values, setValue } = useBuilder();
  const [local, setLocal] = useState<string | undefined>(undefined);
  const emit = useEmit(w);
  const stored = setValue ? (values ? values[w.id] : undefined) : local;
  return [stored !== undefined ? stored : inputDefault(w), (v: string) => { if (setValue) setValue(w.id, v); else setLocal(v); emit('change', v); }];
}

/** Choosers: items from typed lines, or from a field of the live rows (selecting sets a filter). */
function useChoices(a: Arg): { items: string[]; selected: string[]; set: (v: string[]) => void; live: boolean; counts: Record<string, number> } {
  const { setSelection } = useBuilder();
  const { p, w, d } = a;
  const live = usesField(p) && !!d;
  const counts: Record<string, number> = {};
  let items = lines(p.items);
  if (live && d) {
    const g = w.config.groupBy || '';
    const b = g ? groupMetric(d.base, g, 'count', undefined, 30).filter(x => !x.key.startsWith('Other (')) : [];
    b.forEach(x => { counts[x.key] = x.value; });
    items = b.map(x => x.key);
  }
  const [held, hold] = useValue(w);
  const selected = live && d ? Array.from(d.selected) : held ? [held] : [];
  const set = (vals: string[]) => {
    if (!live || !d) { hold(vals[0] || ''); return; }
    const g = w.config.groupBy || '';
    if (!g) return;
    setSelection(w.id, w.config.query, g, vals);
  };
  return { items, selected, set, live, counts };
}
const label = (c: ReturnType<typeof useChoices>, v: string) => (c.live && c.counts[v] !== undefined ? `${v} (${formatNumber(c.counts[v])})` : v);


// Inputs that hold a value other widgets can be filtered by (see bindings.ts).
type InArg = { p: Props; w: Widget };
function InText({ p, w, search }: InArg & { search?: boolean }) {
  const [v, set] = useValue(w);
  return search
    ? <Search id={uid(w)} labelText={p.labelText} placeholder={p.placeholder} size={p.size || 'md'} value={v} onChange={(e: any) => set(e.target.value)} onClear={() => set('')} />
    : <TextInput id={uid(w)} labelText={p.labelText} placeholder={p.placeholder} helperText={p.helperText} size={p.size || 'md'} value={v} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)} />;
}
function InNumber({ p, w }: InArg) {
  const [v, set] = useValue(w);
  return <NumberInput id={uid(w)} label={p.label} value={v === '' ? '' : Number(v)} min={num(p.min, 0)} max={num(p.max, 100)} step={num(p.step, 1)} size={p.size || 'md'} onChange={(e: any, s: any) => set(String(s && s.value !== undefined ? s.value : e.target.value))} />;
}
function InSlider({ p, w }: InArg) {
  const [v, set] = useValue(w);
  return <Slider id={uid(w)} labelText={p.labelText} value={Number(v)} min={num(p.min, 0)} max={num(p.max, 100)} step={num(p.step, 1)} onChange={(e: { value: number }) => set(String(e.value))} />;
}
function InToggle({ p, w }: InArg) {
  const [v, set] = useValue(w);
  return <Toggle id={uid(w)} labelText={p.labelText} labelA={p.labelA} labelB={p.labelB} size={p.size || 'md'} toggled={v === 'true'} onToggle={(on: boolean) => set(on ? 'true' : '')} />;
}
function InCheck({ p, w }: InArg) {
  const [v, set] = useValue(w);
  return <Checkbox id={uid(w)} labelText={p.labelText} helperText={p.helperText} checked={v === 'true'} onChange={(_e: any, s: { checked: boolean }) => set(s.checked ? 'true' : '')} />;
}

function NeedsField({ a }: { a: Arg }) {
  return !a.w.config.groupBy && usesField(a.p) ? <div className="db-note">Pick “Values of field” under Data.</div> : null;
}

function ChooserDropdown(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  const items = ['', ...c.items];
  return (
    <>
      <Dropdown id={uid(w)} titleText={p.titleText || ''} label={p.placeholder || 'Choose'} size={p.size || 'md'} items={items}
        itemToString={(i: string) => (i ? label(c, i) : '(all)')}
        selectedItem={c.selected[0] || ''}
        onChange={(e: any) => c.set(e.selectedItem ? [e.selectedItem] : [])} />
      <NeedsField a={a} />
    </>
  );
}
function ChooserSelect(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  return (
    <>
      <Select id={uid(w)} labelText={p.labelText || ''} size={p.size || 'md'}
        value={c.selected[0] || ''}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => c.set(e.target.value ? [e.target.value] : [])}>
        <SelectItem value="" text={c.live ? '(all)' : 'Choose an option'} />
        {c.items.map(i => <SelectItem key={i} value={i} text={label(c, i)} />)}
      </Select>
      <NeedsField a={a} />
    </>
  );
}
function ChooserCombo(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  return (
    <>
      <ComboBox id={uid(w)} titleText={p.titleText || ''} placeholder={p.placeholder || 'Type or choose'} size={p.size || 'md'} items={c.items}
        itemToString={(i: string | null) => (i ? label(c, i) : '')}
        selectedItem={c.selected[0] || null}
        onChange={(e: any) => c.set(e.selectedItem ? [e.selectedItem] : [])} />
      <NeedsField a={a} />
    </>
  );
}
function ChooserMulti(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  return (
    <>
      <MultiSelect id={uid(w)} titleText={p.titleText || ''} label={p.placeholder || 'Choose options'} size={p.size || 'md'} items={c.items}
        itemToString={(i: string) => label(c, i)}
        initialSelectedItems={c.live ? c.selected : undefined}
        onChange={(e: any) => c.live && c.set((e.selectedItems || []) as string[])} />
      <NeedsField a={a} />
    </>
  );
}
function ChooserRadio(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  return (
    <>
      <RadioButtonGroup name={uid(w)} legendText={p.legendText || ''} orientation={p.orientation || 'vertical'}
        valueSelected={c.selected[0] || ''}
        onChange={(v: any) => c.set(v ? [String(v)] : [])}>
        {c.live && <RadioButton id={uid(w, 'all')} labelText="(all)" value="" />}
        {c.items.map((i, k) => <RadioButton key={i} id={uid(w, String(k))} labelText={label(c, i)} value={i} />)}
      </RadioButtonGroup>
      <NeedsField a={a} />
    </>
  );
}
function ChooserSwitch(a: Arg) {
  const c = useChoices(a); const { p, w } = a;
  const [i, setI] = useState(0);
  const pairs = c.live ? c.items.map(x => [x, ''] as [string, string]) : c.items.map(pair);
  const sel = c.live ? Math.max(c.items.indexOf(c.selected[0]), -1) : c.selected[0] ? Math.max(pairs.findIndex(x => x[0] === c.selected[0]), 0) : i;
  void setI;
  return (
    <>
      <ContentSwitcher size={p.size || 'md'} selectedIndex={Math.max(sel, 0)} onChange={(e: any) => { if (c.live) c.set([pairs[e.index][0]]); else { setI(e.index); c.set([pairs[e.index][0]]); } }}>
        {pairs.map(([l], k) => <Switch key={k} name={String(k)} text={c.live ? label(c, l) : l} />)}
      </ContentSwitcher>
      {!c.live && pairs[i] && pairs[i][1] && <Content text={pairs[i][1]} />}
      <NeedsField a={a} />
    </>
  );
}

function Rows({ a, kind }: { a: Arg; kind: 'table' | 'list' }) {
  const { p, w } = a; const d = a.d as WidgetData; const c = w.config;
  const cols = c.columns && c.columns.length ? c.columns : fieldsOf(c.query).slice(0, 4).map(f => f.key);
  const limit = c.limit || 50;
  const [q, setQ] = useState('');
  const [page, setPage] = useState({ page: 1, pageSize: Math.min(num(p.pageSize, 10), 100) });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? d.rows.filter(r => cols.some(k => cell(r, k).toLowerCase().includes(s))) : d.rows).slice(0, limit);
  }, [d.rows, q, cols.join('|'), limit]);
  if (d.rows.length === 0) return <div className="db-empty">No rows{d.followed ? ' match the active filters' : ''}.</div>;
  if (kind === 'list') {
    return (
      <>
        <StructuredListWrapper isCondensed={!!p.condensed} isFlush={!!p.flush}>
          <StructuredListHead><StructuredListRow head>{cols.map(k => <StructuredListCell head key={k}>{fieldLabel(c.query, k)}</StructuredListCell>)}</StructuredListRow></StructuredListHead>
          <StructuredListBody>{rows.map((r, i) => <StructuredListRow key={`${r.id}-${i}`}>{cols.map(k => <StructuredListCell key={k}>{decorate(k, cell(r, k))}</StructuredListCell>)}</StructuredListRow>)}</StructuredListBody>
        </StructuredListWrapper>
        <Note d={d} />
      </>
    );
  }
  const headers = cols.map(k => ({ key: k, header: fieldLabel(c.query, k) }));
  const data = rows.map((r: Row, i) => ({ id: `${r.id ?? 'r'}-${i}`, ...Object.fromEntries(cols.map(k => [k, cell(r, k)])) }));
  const paged = p.pagination ? data.slice((page.page - 1) * page.pageSize, page.page * page.pageSize) : data;
  return (
    <>
      <DataTable rows={paged} headers={headers} size={p.size || 'md'} useZebraStyles={!!p.zebra} isSortable={!!p.sortable}>
        {({ rows: rs, headers: hs, getTableProps, getHeaderProps, getRowProps }: any) => (
          <TableContainer>
            {p.search && <TableToolbar><TableToolbarContent><TableToolbarSearch persistent onChange={(e: any) => setQ(e.target ? e.target.value : '')} /></TableToolbarContent></TableToolbar>}
            <Table {...getTableProps()}>
              <TableHead><TableRow>{hs.map((h: any) => { const { key, ...rest } = getHeaderProps({ header: h }); return <TableHeader key={key} {...rest}>{h.header}</TableHeader>; })}</TableRow></TableHead>
              <TableBody>{rs.map((r: any) => { const { key, ...rest } = getRowProps({ row: r }); return <TableRow key={key} {...rest}>{r.cells.map((c2: any) => <TableCell key={c2.id}>{decorate(c2.info && c2.info.header, c2.value)}</TableCell>)}</TableRow>; })}</TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      {p.pagination && <Pagination page={page.page} pageSize={page.pageSize} pageSizes={[5, 10, 25, 50]} totalItems={data.length} onChange={(e: any) => setPage({ page: e.page, pageSize: e.pageSize })} />}
      <Note d={d} />
    </>
  );
}

const decorate = (field: string, value: unknown): React.ReactNode => <SemCell field={field} value={value} shown={value === undefined || value === null ? '' : String(value)} />;

/** The measure shown by Tag / Progress bar / notifications: count of rows, or the metric set under Data. */
function measure(a: Arg): number | undefined {
  const c = a.w.config;
  return a.d ? metricValue(a.d.rows, c.metric || 'count', c.valueField) : undefined;
}

function Tree({ items, label: l }: { items: string[]; label: string }) {
  type N = { text: string; kids: N[] };
  const root: N = { text: '', kids: [] };
  const stack: Array<{ n: N; depth: number }> = [{ n: root, depth: -1 }];
  items.forEach(raw => {
    const depth = Math.floor((raw.length - raw.trimStart().length) / 2);
    const n: N = { text: raw.trim(), kids: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].n.kids.push(n);
    stack.push({ n, depth });
  });
  const draw = (n: N, k: string): React.ReactNode => <TreeNode key={k} id={k} label={n.text}>{n.kids.map((x, i) => draw(x, `${k}.${i}`))}</TreeNode>;
  return <TreeView label={l || 'Tree'} hideLabel={!l}>{root.kids.map((x, i) => draw(x, String(i)))}</TreeView>;
}

/** Two panels with a draggable divider (pointer, arrow keys, double-click to reset). The ratio is remembered per widget in this browser. */
function SplitPane({ a }: { a: Arg }) {
  const { p, w } = a;
  const key = `db-split-${w.id}`;
  const horiz = (p.direction || 'horizontal') === 'horizontal';
  const min = Math.min(Math.max(num(p.min, 15), 5), 45);
  const start = Math.min(Math.max(num(p.size, 50), min), 100 - min);
  const [pct, setPct] = useState(() => { try { const v = Number(window.localStorage.getItem(key)); if (v >= min && v <= 100 - min) return v; } catch (e) { /* no storage */ } return start; });
  const ref = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(Math.max(v, min), 100 - min);
  const keep = (v: number) => { try { window.localStorage.setItem(key, String(v)); } catch (e) { /* no storage */ } };
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPct(clamp(((horiz ? e.clientX - r.left : e.clientY - r.top) / Math.max(1, horiz ? r.width : r.height)) * 100));
  };
  const pane: React.CSSProperties = { minWidth: 0, minHeight: 0, overflow: 'auto', position: 'relative' };
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: horiz ? 'row' : 'column', height: '100%', minHeight: 200 }}>
      <div style={{ ...pane, flex: `0 0 ${pct}%` }}><Content text={String(p.first || '')} slot={`${w.id}#0`} /></div>
      <div role="separator" tabIndex={0} aria-orientation={horiz ? 'vertical' : 'horizontal'} aria-label="Drag to resize the two panels" aria-valuenow={Math.round(pct)}
        style={{ flex: '0 0 8px', cursor: horiz ? 'col-resize' : 'row-resize', background: 'var(--cds-border-subtle-01, #c6c6c6)', touchAction: 'none' }}
        onPointerDown={e => (e.target as HTMLElement).setPointerCapture(e.pointerId)}
        onPointerMove={e => { if ((e.buttons & 1) === 1) move(e); }}
        onPointerUp={() => keep(pct)}
        onKeyDown={e => {
          const back = horiz ? 'ArrowLeft' : 'ArrowUp', fwd = horiz ? 'ArrowRight' : 'ArrowDown';
          if (e.key === back || e.key === fwd) { e.preventDefault(); const n = clamp(pct + (e.key === back ? -4 : 4)); setPct(n); keep(n); }
        }}
        onDoubleClick={() => { setPct(start); keep(start); }} />
      <div style={{ ...pane, flex: '1 1 0' }}><Content text={String(p.second || '')} slot={`${w.id}#1`} /></div>
    </div>
  );
}

function ModalWidget({ a }: { a: Arg }) {
  const { p, w } = a; const [open, setOpen] = useState(false);
  const emit = useEmit(w);
  const show = (o: boolean) => { setOpen(o); emit(o ? 'open' : 'close'); };
  useCommand(p, name => { if (name === 'open') show(true); else if (name === 'close') show(false); });
  return (
    <>
      <Button kind={p.kind || 'primary'} onClick={() => show(true)}>{p.buttonLabel || 'Open'}</Button>
      <Modal open={open} passiveModal={!!p.passive} size={p.size || 'sm'} modalHeading={p.heading} modalLabel={p.modalLabel}
        primaryButtonText={p.primaryText || 'OK'} secondaryButtonText={p.secondaryText || 'Cancel'}
        onRequestClose={() => show(false)} onRequestSubmit={() => { emit('submit'); show(false); }} onSecondarySubmit={() => show(false)} id={uid(w)}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p>
      </Modal>
    </>
  );
}

function ExpandWidget({ p }: { p: Props }) {
  return (
    <ExpandableTile>
      <TileAboveTheFoldContent><div style={{ height: 64 }}>{p.above}</div></TileAboveTheFoldContent>
      <TileBelowTheFoldContent><div style={{ minHeight: 64 }}>{p.below}</div></TileBelowTheFoldContent>
    </ExpandableTile>
  );
}

function Notice({ a, kind }: { a: Arg; kind: 'inline' | 'toast' | 'action' }) {
  const { p } = a;
  const emit = useEmit(a.w);
  const v = measure(a);
  const when = p.when || 'always';
  if (when !== 'always') {
    if (v === undefined) return <div className="db-empty">Loading…</div>;
    const t = num(p.threshold, 0);
    const show = when === 'above' ? v > t : when === 'below' ? v < t : v === t;
    if (!show) return <div className="db-note">Hidden: the value is {formatNumber(v)} ({when === 'equals' ? 'equals' : when} {t} needed).</div>;
  }
  const common = { kind: p.kind || 'info', title: p.title, subtitle: (p.subtitle || '') + (p.showValue && v !== undefined ? ` ${formatNumber(v)}` : ''), lowContrast: !!p.lowContrast, hideCloseButton: !!p.hideClose, onClose: (): boolean => { emit('close'); return true; } };
  if (kind === 'toast') return <ToastNotification {...common} timeout={0} />;
  if (kind === 'action') return <ActionableNotification {...common} actionButtonLabel={p.actionLabel || 'Action'} inline />;
  return <InlineNotification {...common} />;
}

/** A panel that scrolls. Sideways scrolling makes the inside wider than the pane. */
function ScrollPane({ a }: { a: Arg }) {
  const { p, w } = a;
  const dir = String(p.direction || 'vertical');
  const side = dir !== 'vertical';
  const wide = Math.min(Math.max(num(p.width, 200), 100), 600);
  return (
    <div style={{ height: '100%', overflowX: side ? 'scroll' : 'hidden', overflowY: dir === 'horizontal' ? 'hidden' : 'scroll', position: 'relative' }}>
      <div style={{ width: side ? `${wide}%` : '100%', height: dir === 'horizontal' ? '100%' : undefined }}><Content text={String(p.content ?? 'widgets')} slot={`${w.id}#0`} /></div>
    </div>
  );
}

/** A strip for inputs. */
function ToolbarStrip({ a }: { a: Arg }) {
  const { p, w } = a;
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'stretch', gap: 12, background: 'var(--cds-layer-01, #f4f4f4)', borderBottom: '1px solid var(--cds-border-subtle-01, #c6c6c6)', padding: '0 8px', overflow: 'auto' }}>
      {p.label ? <strong style={{ alignSelf: 'center', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{String(p.label)}</strong> : null}
      <div style={{ flex: 1, minWidth: 0 }}><Content text={String(p.content ?? 'widgets')} slot={`${w.id}#0`} /></div>
    </div>
  );
}

/** Slides with arrows and dots; can advance by itself while viewing. */
function Carousel({ a }: { a: Arg }) {
  const { p, w } = a;
  const rows = lines(p.items).map(pair);
  const n = Math.max(rows.length, 1);
  const [i, setI] = useState(0);
  const nest = useContext(NestCtx);
  const editing = !!(nest && nest.editing);
  const auto = num(p.auto, 0);
  const loop = p.loop !== false;
  const at = Math.min(i, n - 1);
  useCommand(p, (name, arg) => { if (name === 'go') { const k = indexOf(arg, rows.map(r => r[0])); if (k >= 0) setI(k); } });
  const go = (d: number) => setI(cur => { const x = Math.min(cur, n - 1) + d; return loop ? (x + n) % n : Math.min(Math.max(x, 0), n - 1); });
  useEffect(() => {
    if (!auto || auto < 1 || editing || n < 2) return undefined;
    const t = window.setInterval(() => go(1), auto * 1000);
    return () => window.clearInterval(t);
  }, [auto, editing, n, loop]);
  const btn: React.CSSProperties = { border: 0, background: 'var(--cds-layer-accent-01, #e0e0e0)', width: 32, height: 32, cursor: 'pointer', fontSize: 18, lineHeight: '32px', color: 'inherit' };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 160 }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}><Content text={(rows[at] || ['', ''])[1]} slot={`${w.id}#${at}`} /></div>
      <div className="db-pe" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 0' }}>
        <button type="button" style={btn} aria-label="Previous slide" disabled={!loop && at === 0} onClick={() => go(-1)}>‹</button>
        {p.dots !== false && rows.map(([t], k) => (
          <button key={k} type="button" aria-label={`Slide ${k + 1}: ${t}`} aria-current={k === at} title={t} onClick={() => setI(k)}
            style={{ width: 10, height: 10, borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer', background: k === at ? 'var(--cds-interactive, #0f62fe)' : 'var(--cds-border-strong-01, #8d8d8d)' }} />
        ))}
        <span style={{ fontSize: 12, opacity: 0.7 }}>{at + 1} / {n}</span>
        <button type="button" style={btn} aria-label="Next slide" disabled={!loop && at === n - 1} onClick={() => go(1)}>›</button>
      </div>
    </div>
  );
}

function TabsBlock({ p, w }: { p: Props; w: Widget }) {
  const rows = lines(p.items).map(pair);
  const [sel, setSel] = useState(0);
  const emit = useEmit(w);
  useCommand(p, (name, arg) => { if (name === 'select') { const i = indexOf(arg, rows.map(r => r[0])); if (i >= 0) setSel(i); } });
  return (
    <Tabs selectedIndex={Math.min(sel, Math.max(rows.length - 1, 0))} onChange={(e: { selectedIndex: number }) => { setSel(e.selectedIndex); emit('tab', rows[e.selectedIndex] ? rows[e.selectedIndex][0] : ''); }}>
      <TabList aria-label="Tabs" contained={!!p.contained}>{rows.map(([t], i) => <Tab key={i}>{t}</Tab>)}</TabList>
      <TabPanels>{rows.map(([, c], i) => <TabPanel key={i}><Content text={c} slot={`${w.id}#${i}`} /></TabPanel>)}</TabPanels>
    </Tabs>
  );
}

function AccordionBlock({ p, w }: { p: Record<string, any>; w: Widget }) {
  const [open, setOpen] = useState<number[]>(() => (p.startOpen ? lines(p.items).map((_, i) => i) : []));
  const [shut, setShut] = useState<number[]>([]);
  const editing = !!useContext(NestCtx)?.editing;
  const single = !!p.single;
  const emit = useEmit(w);
  const titles = lines(p.items).map(x => pair(x)[0]);
  useCommand(p, (name, arg) => {
    if (name === 'expand') setOpen(titles.map((_, i) => i));
    else if (name === 'collapse') setOpen([]);
    else if (name === 'open') { const i = indexOf(arg, titles); if (i >= 0) setOpen(cur => (single ? [i] : cur.includes(i) ? cur : [...cur, i])); }
  });
  return (
    <Accordion align={p.align || 'end'} size={p.size || 'md'} isFlush={!!p.flush}>
      {lines(p.items).map((x, i) => {
        const [t, c] = pair(x);
        return (
          <AccordionItem key={i} title={t} {...(editing ? { open: !shut.includes(i), onHeadingClick: ({ isOpen }: { isOpen: boolean }) => setShut(cur => (isOpen ? cur.filter(x => x !== i) : [...cur, i])) } : { open: open.includes(i), onHeadingClick: ({ isOpen }: { isOpen: boolean }) => { emit('toggle', t); setOpen(cur => (isOpen ? (single ? [i] : [...cur, i]) : cur.filter(x => x !== i))); } })}>
            <Content text={c} slot={`${w.id}#${i}`} />
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function PageWidget({ p, w }: Arg) {
  const emit = useEmit(w);
  return <Pagination totalItems={num(p.totalItems, 100)} pageSize={num(p.pageSize, 10)} pageSizes={[5, 10, 25, 50]} onChange={(e: { page: number }) => emit('page', String(e.page))} />;
}

const CHART_NAMES = SPECS.filter(x => x.group === 'Charts').map(x => x.name);
const RENDER: Record<string, (a: Arg) => React.ReactNode> = {
  SplitPane: a => <SplitPane a={a} />,
  ScrollPane: a => <ScrollPane a={a} />,
  Toolbar: a => <ToolbarStrip a={a} />,
  Carousel: a => <Carousel a={a} />,
  Heading: ({ p }) => <Section level={num(p.level, 2)}><Heading>{p.text}</Heading></Section>,
  Link: ({ p }) => <Link href={p.href} inline={!!p.inline} size={p.size || 'md'} target="_blank" rel="noopener noreferrer">{p.text}</Link>,
  UnorderedList: ({ p }) => <UnorderedList isExpressive={!!p.expressive}>{lines(p.items).map((x, i) => <ListItem key={i}>{x}</ListItem>)}</UnorderedList>,
  OrderedList: ({ p }) => <OrderedList isExpressive={!!p.expressive}>{lines(p.items).map((x, i) => <ListItem key={i}>{x}</ListItem>)}</OrderedList>,
  CodeSnippet: ({ p }) => <CodeSnippet type={p.type || 'multi'} feedback="Copied">{p.text}</CodeSnippet>,
  Tile: ({ p }) => <Tile style={{ height: '100%' }}><h4>{p.title}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p></Tile>,
  ClickableTile: ({ p }) => <ClickableTile href={p.href} {...({ target: '_blank', rel: 'noopener noreferrer' } as any)} style={{ height: '100%' }}>{p.text}</ClickableTile>,
  SelectableTile: ({ p, w }) => <SelectableTile id={uid(w)} title={p.text} style={{ height: '100%' }}>{p.text}</SelectableTile>,
  ExpandableTile: ({ p }) => <ExpandWidget p={p} />,
  TileGroup: ({ p, w }) => <TileGroup legend={p.legend} name={uid(w)}>{lines(p.items).map((x, i) => <RadioTile key={i} id={uid(w, String(i))} value={x}>{x}</RadioTile>)}</TileGroup>,
  Accordion: ({ p, w }) => <AccordionBlock p={p} w={w} />,
  Tabs: ({ p, w }) => <TabsBlock p={p} w={w} />,
  Breadcrumb: ({ p }) => <Breadcrumb noTrailingSlash={!!p.noTrailingSlash}>{lines(p.items).map((x, i, arr) => { const [t, h] = pair(x); return <BreadcrumbItem key={i} href={h || undefined} isCurrentPage={i === arr.length - 1 && !h}>{t}</BreadcrumbItem>; })}</Breadcrumb>,
  ContainedList: ({ p }) => <ContainedList label={p.label} kind={p.kind || 'on-page'} size={p.size || 'md'}>{lines(p.items).map((x, i) => <ContainedListItem key={i}>{x}</ContainedListItem>)}</ContainedList>,
  TreeView: ({ p }) => <Tree items={Array.isArray(p.items) ? p.items.map(String).filter((x: string) => x.trim()) : []} label={p.label} />,
  DataTable: a => <Status d={a.d as WidgetData}><Rows a={a} kind="table" /></Status>,
  StructuredList: a => <Status d={a.d as WidgetData}><Rows a={a} kind="list" /></Status>,
  Tag: a => {
    const v = measure(a);
    const wh = a.w.config.where;
    const sem = (!a.p.type || a.p.type === 'auto') && wh ? semanticColor(wh.field, wh.value) : undefined;
    if (sem) return <Tag type="gray" size={a.p.size || 'md'} style={{ background: sem.fill, color: sem.ink }}>{a.p.text}{a.p.showValue ? `: ${v === undefined ? '…' : formatNumber(v)}` : ''}</Tag>;
    return <Tag type={!a.p.type || a.p.type === 'auto' ? 'gray' : a.p.type} size={a.p.size || 'md'}>{a.p.text}{a.p.showValue ? `: ${v === undefined ? '…' : formatNumber(v)}` : ''}</Tag>; },
  ProgressBar: a => { const v = a.p.source === 'live' ? measure(a) : num(a.p.value, 0); const wh = a.w.config.where; const sem = wh ? semanticColor(wh.field, wh.value) : undefined; return <div className="db-pbar" style={sem ? ({ '--db-bar': sem.fill } as React.CSSProperties) : undefined}><ProgressBar label={a.p.label || ''} helperText={a.p.helperText} max={num(a.p.max, 100)} value={v === undefined ? undefined : Math.min(v, num(a.p.max, 100))} status={a.p.status || 'active'} size={a.p.size || 'big'} /></div>; },
  ProgressIndicator: ({ p }) => <ProgressIndicator currentIndex={num(p.current, 0)} vertical={!!p.vertical} spaceEqually={!!p.spaceEqually}>{lines(p.items).map((x, i) => <ProgressStep key={i} label={x} />)}</ProgressIndicator>,
  InlineNotification: a => <Notice a={a} kind="inline" />,
  ToastNotification: a => <Notice a={a} kind="toast" />,
  ActionableNotification: a => <Notice a={a} kind="action" />,
  InlineLoading: ({ p }) => <InlineLoading description={p.description} status={p.status || 'active'} />,
  Loading: ({ p }) => <Loading withOverlay={false} small={!!p.small} description={p.description} />,
  SkeletonText: ({ p }) => <SkeletonText lineCount={num(p.lineCount, 3)} heading={!!p.heading} paragraph={!!p.paragraph} />,
  SkeletonPlaceholder: () => <SkeletonPlaceholder style={{ width: '100%', height: '100%' }} />,
  Button: ({ p }) => <Button kind={p.kind || 'primary'} size={p.size || 'md'} href={p.href || undefined} target={p.href ? '_blank' : undefined} disabled={!!p.disabled}>{p.text}</Button>,
  ButtonSet: ({ p }) => { const r = lines(p.items).map(pair); return <ButtonSet stacked={!!p.stacked}>{r.map(([t, h], i) => <Button key={i} kind={i === r.length - 1 ? 'primary' : 'secondary'} href={h || undefined}>{t}</Button>)}</ButtonSet>; },
  CopyButton: ({ p }) => <CopyButton iconDescription="Copy" feedback={p.feedback || 'Copied'} onClick={() => { try { navigator.clipboard.writeText(String(p.text || '')); } catch (e) { /* clipboard not available */ } }} />,
  OverflowMenu: ({ p }) => <OverflowMenu flipped={!!p.flipped} size={p.size || 'md'} aria-label="More">{lines(p.items).map((x, i) => { const [t, h] = pair(x); return <OverflowMenuItem key={i} itemText={t} href={h || undefined} />; })}</OverflowMenu>,
  MenuButton: ({ p }) => <MenuButton label={p.text} kind={p.kind || 'primary'}>{lines(p.items).map((x, i) => { const [t, h] = pair(x); return <MenuItem key={i} label={t} onClick={() => { if (h) window.open(h, '_blank', 'noopener'); }} />; })}</MenuButton>,
  Modal: a => <ModalWidget a={a} />,
  Tooltip: ({ p }) => <Tooltip label={p.content} align={p.align || 'bottom'}><Button kind="ghost">{p.text}</Button></Tooltip>,
  Toggletip: ({ p }) => <Toggletip align={p.align || 'bottom'}><ToggletipButton label={p.text}><span>{p.text}</span></ToggletipButton><ToggletipContent><p>{p.content}</p></ToggletipContent></Toggletip>,
  DefinitionTooltip: ({ p }) => <DefinitionTooltip definition={p.definition}>{p.text}</DefinitionTooltip>,
  Dropdown: a => <ChooserDropdown {...a} />,
  Select: a => <ChooserSelect {...a} />,
  ComboBox: a => <ChooserCombo {...a} />,
  MultiSelect: a => <ChooserMulti {...a} />,
  RadioButtonGroup: a => <ChooserRadio {...a} />,
  ContentSwitcher: a => <ChooserSwitch {...a} />,
  Toggle: ({ p, w }) => <InToggle p={p} w={w} />,
  Checkbox: ({ p, w }) => <InCheck p={p} w={w} />,
  CheckboxGroup: ({ p, w }) => <CheckboxGroup legendText={p.legendText} orientation={p.orientation || 'vertical'}>{lines(p.items).map((x, i) => <Checkbox key={i} id={uid(w, String(i))} labelText={x} />)}</CheckboxGroup>,
  Search: ({ p, w }) => <InText p={p} w={w} search />,
  TextInput: ({ p, w }) => <InText p={p} w={w} />,
  PasswordInput: ({ p, w }) => <PasswordInput id={uid(w)} labelText={p.labelText} size={p.size || 'md'} />,
  TextArea: ({ p, w }) => <TextArea id={uid(w)} labelText={p.labelText} placeholder={p.placeholder} rows={num(p.rows, 4)} maxCount={num(p.maxCount, 0) || undefined} enableCounter={num(p.maxCount, 0) > 0} />,
  NumberInput: ({ p, w }) => <InNumber p={p} w={w} />,
  Slider: ({ p, w }) => <InSlider p={p} w={w} />,
  DatePicker: ({ p, w }) => <DatePicker datePickerType={p.type || 'single'}><DatePickerInput id={uid(w, 'a')} labelText={p.labelText} placeholder={p.placeholder} />{p.type === 'range' && <DatePickerInput id={uid(w, 'b')} labelText="End" placeholder={p.placeholder} />}</DatePicker>,
  TimePicker: ({ p, w }) => <TimePicker id={uid(w)} labelText={p.labelText} placeholder={p.placeholder} />,
  FileUploader: ({ p }) => <FileUploader labelTitle={p.title} labelDescription={p.description} buttonLabel={p.buttonLabel} multiple={!!p.multiple} filenameStatus="edit" />,
  Pagination: a => <PageWidget {...a} />,
  PaginationNav: ({ p }) => <PaginationNav totalItems={num(p.totalItems, 10)} itemsShown={num(p.itemsShown, 5)} />,
  IncidentInsights: a => <IncidentInsightsWidget {...a} />,
  RunbookActivity: a => <RunbookActivityWidget {...a} />,
  PeoplePicker: a => <PeoplePickerWidget {...a} />,
  ApplicationCards: a => <ApplicationCardsWidget {...a} />,
  ShapeIndicator: ({ p, w, d }) => <ShapeStatus p={p} w={w} d={d} />,
  IconIndicator: ({ p, w, d }) => <IconStatus p={p} w={w} d={d} />,
  BadgeIndicator: ({ p, w, d }) => <CountBadge p={p} w={w} d={d} />,
  Popover: ({ p, w, d }) => (d ? <BreakdownPopover p={p} w={w} d={d} /> : null),
  ComboButton: ({ p, w }) => <ActionCombo p={p} w={w} />,
  ...Object.fromEntries(CHART_NAMES.map(n => [n, (a: Arg) => (a.d ? <CarbonChart name={n} p={a.p} w={a.w} d={a.d} /> : null)]))
};

export const CARBON: CarbonDef[] = SPECS.map(s => ({ ...s, render: RENDER[s.name] }));
const BY_NAME = new Map(CARBON.map(d => [d.name, d]));

export function carbonDef(type: WidgetType | string): CarbonDef | undefined {
  return type.startsWith('carbon:') ? BY_NAME.get(type.slice(7)) : undefined;
}

const carbonDefaults = specDefaults;

/** The widget on the grid. */
export function CarbonWidget({ w }: { w: Widget }) {
  const def = carbonDef(w.type);
  if (!def) return <div className="db-empty">Unknown component “{w.type}”.</div>;
  const p = { ...carbonDefaults(def), ...(w.config.props || {}) };
  return dataOn(def.data, p) ? <Bound w={w} def={def} p={p} /> : <div className="db-carbon">{def.render({ p, w })}</div>;
}

function Bound({ w, def, p }: { w: Widget; def: CarbonDef; p: Props }) {
  const d = useWidgetData(w);
  // Rows widgets draw their own status; the others show a figure only once data has arrived.
  return <div className="db-carbon">{def.uses === 'rows' ? def.render({ p, w, d }) : <>{def.render({ p, w, d })}{d.state.error && d.state.rows.length === 0 && (/^Enter the /.test(d.state.error) ? <div className="db-note">{d.state.error}</div> : <div className="db-note" role="alert">Query failed: {d.state.error}</div>)}</>}</div>;
}
