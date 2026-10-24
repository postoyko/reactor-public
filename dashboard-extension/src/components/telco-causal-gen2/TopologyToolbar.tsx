/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Control bar for the topology panel. One compact row replaces the wall of buttons:
 *   View (3D | 2D) · Lens ▾ · Layers ▾ · Layout ▾ (3D) · Camera ▾ (3D) · Trace route · Replay · Options ▾
 * Active filters show as chips on a second line. The whole bar collapses to a one-line summary
 * and remembers that choice in this browser (localStorage, optional).
 * Purely presentational: every value and handler comes from the dashboard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayerSchemeId, SCHEMES, SCHEME_IDS } from './classification';
import {
  ChevronDown, ChevronUp, Cube, Grid, ColorPalette, Layers, Video, Share, PlayOutline, Settings, Checkmark
} from '@carbon/icons-react';

export type LensId = 'deviceType' | 'severity' | 'centrality' | 'strata';
export type LayoutId = 'stratified' | 'constellation' | 'organic';
export type CameraPreset = 'iso' | 'profile' | 'top';

const LENSES: Array<{ id: LensId; label: string; hint: string }> = [
  { id: 'deviceType', label: 'Hardware', hint: 'Colour by device type' },
  { id: 'severity', label: 'Severity', hint: 'Colour by worst alert severity' },
  { id: 'centrality', label: 'Risk SPOF', hint: 'Colour by single-point-of-failure risk (needs topology links)' },
  { id: 'strata', label: 'Strata', hint: 'Colour by estimated tier' },
];
const LAYOUTS: Array<{ id: LayoutId; label: string }> = [
  { id: 'stratified', label: 'Strata 3D' },
  { id: 'constellation', label: 'Constellation' },
  { id: 'organic', label: 'Organic' },
];
const LAYERS: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Core' },
  { id: 2, label: 'Transport' },
  { id: 3, label: 'RAN' },
  { id: 4, label: 'Edge' },
];
const HOPS: Array<{ id: number; label: string }> = [
  { id: 0, label: 'Strata only' },
  { id: 1, label: '+1 hop' },
  { id: 2, label: '+2 hops' },
  { id: 3, label: '+3 hops' },
];

const STORE_KEY = 'telco-causal-mesh:toolbar-collapsed';
const readCollapsed = (): boolean => {
  try { return window.localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
};
const writeCollapsed = (v: boolean) => {
  try { window.localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch { /* storage unavailable: fine */ }
};

/** A button that opens a small floating panel; closes on outside click or Escape. */
function Menu({ icon, label, value, active, disabled, title, children }: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="tm-menu" ref={ref}>
      <button
        type="button"
        className={`tm-btn${open ? ' open' : ''}${active ? ' active' : ''}`}
        disabled={disabled}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        <span className="tm-btn-label">{label}</span>
        {value && <span className="tm-btn-value">{value}</span>}
        <ChevronDown size={12} className="tm-caret" />
      </button>
      {open && <div className="tm-pop" role="menu">{children(close)}</div>}
    </div>
  );
}

function Choice({ checked, onClick, children, hint, disabled }: {
  checked: boolean; onClick: () => void; children: React.ReactNode; hint?: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} disabled={disabled} title={hint} className={`tm-choice${checked ? ' checked' : ''}`} onClick={onClick}>
      <span className="tm-tick">{checked && <Checkmark size={14} />}</span>
      {children}
    </button>
  );
}

function Check({ checked, onClick, children, hint, danger }: {
  checked: boolean; onClick: () => void; children: React.ReactNode; hint?: string; danger?: boolean;
}) {
  return (
    <label className={`tm-check${danger && checked ? ' danger' : ''}`} title={hint}>
      <input type="checkbox" checked={checked} onChange={onClick} />
      <span>{children}</span>
    </label>
  );
}

export interface TopologyToolbarProps {
  view: '2d' | '3d';
  webglOk: boolean;
  webglReason?: string;
  onView: (v: '2d' | '3d') => void;

  lens: string;
  onLens: (l: LensId) => void;

  layout: string;
  onLayout: (l: LayoutId) => void;

  layerScheme: LayerSchemeId;
  onLayerScheme: (scheme: LayerSchemeId) => void;
  activeLayers: Record<number, boolean>;
  onToggleLayer: (layer: number) => void;
  topologyHops: number;
  onHops: (n: number) => void;

  hasTopology: boolean;
  /** Text for the route button, e.g. "Trace route" or "1. Click source". */
  routeLabel: string;
  routeActive: boolean;
  routeHasPath: boolean;
  onToggleRoute: () => void;

  replayOpen: boolean;
  replayActive: boolean;
  onToggleReplay: () => void;

  showIllustrative: boolean;
  onToggleIllustrative: () => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onCamera: (p: CameraPreset) => void;

  /** Active-filter chips (Tags) rendered on their own line. */
  chips?: React.ReactNode;
  chipCount: number;
}

export default function TopologyToolbar(p: TopologyToolbarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const toggleCollapsed = () => setCollapsed(c => { writeCollapsed(!c); return !c; });

  const lensLabel = LENSES.find(l => l.id === p.lens)?.label || p.lens;
  const layers = p.layerScheme === 'telco' ? LAYERS : SCHEMES[p.layerScheme].layers.map(l => ({ id: l.id, label: l.short }));
  const layersOn = layers.filter(l => p.activeLayers[l.id]).length;
  const is3d = p.view === '3d';
  const summary = [
    is3d ? '3D' : '2D',
    lensLabel,
    `${layersOn}/${layers.length} ${p.layerScheme === 'telco' ? 'strata' : p.layerScheme.toUpperCase()}`,
    p.topologyHops > 0 ? `+${p.topologyHops} hop${p.topologyHops > 1 ? 's' : ''}` : null,
    p.showIllustrative ? 'demo links ON' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`tm-toolbar${collapsed ? ' collapsed' : ''}`} role="toolbar" aria-label="Topology controls">
      <div className="tm-row">
        <button
          type="button"
          className="tm-collapse"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show controls' : 'Hide controls'}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          <span>Controls</span>
        </button>

        {collapsed ? (
          <>
            <span className="tm-summary">{summary}</span>
            {p.chipCount > 0 && <span className="tm-badge" title="Active filters">{p.chipCount} active</span>}
          </>
        ) : (
          <>
            <div className="tm-seg" role="group" aria-label="Topology view">
              <button
                type="button"
                className={is3d ? 'on' : ''}
                disabled={!p.webglOk}
                title={p.webglOk ? 'Interactive 3D mesh' : `3D is unavailable: ${p.webglReason || 'WebGL is not available.'}`}
                onClick={() => p.onView('3d')}
              >
                <Cube size={14} /> 3D
              </button>
              <button type="button" className={!is3d ? 'on' : ''} title="Structural 2D canvas" onClick={() => p.onView('2d')}>
                <Grid size={14} /> 2D
              </button>
            </div>

            <span className="tm-sep" />

            <Menu icon={<ColorPalette size={14} />} label="Lens" value={lensLabel}>
              {close => LENSES.map(l => (
                <Choice key={l.id} checked={p.lens === l.id} hint={l.hint} onClick={() => { p.onLens(l.id); close(); }}>{l.label}</Choice>
              ))}
            </Menu>

            <div className="tm-seg" role="group" aria-label="Layer view">
              {SCHEME_IDS.map(id => (
                <button key={id} type="button" className={p.layerScheme === id ? 'on' : ''} title={SCHEMES[id].label + ': ' + SCHEMES[id].description} aria-pressed={p.layerScheme === id} onClick={() => p.onLayerScheme(id)}>
                  {id === 'telco' ? 'Telco' : id.toUpperCase()}
                </button>
              ))}
            </div>

            <Menu icon={<Layers size={14} />} label="Layers" value={`${layersOn}/${layers.length}${p.topologyHops ? ` · +${p.topologyHops}` : ''}`}>
              {() => (
                <>
                  <div className="tm-group">Classification</div>
                  {SCHEME_IDS.map(id => (
                    <Choice key={id} checked={p.layerScheme === id} hint={SCHEMES[id].description} onClick={() => p.onLayerScheme(id)}>{SCHEMES[id].label}</Choice>
                  ))}
                  <div className="tm-group">{p.layerScheme === 'telco' ? 'Strata' : `${SCHEMES[p.layerScheme].label} layers`}</div>
                  {layers.map(l => (
                    <Check key={l.id} checked={Boolean(p.activeLayers[l.id])} onClick={() => p.onToggleLayer(l.id)}>{l.label}</Check>
                  ))}
                  <div className="tm-group">ASM topology expansion</div>
                  {HOPS.map(h => (
                    <Choice key={h.id} checked={p.topologyHops === h.id} onClick={() => p.onHops(h.id)}>{h.label}</Choice>
                  ))}
                </>
              )}
            </Menu>

            {is3d && (
              <Menu icon={<Cube size={14} />} label="Layout" value={LAYOUTS.find(l => l.id === p.layout)?.label}>
                {close => LAYOUTS.map(l => (
                  <Choice key={l.id} checked={p.layout === l.id} onClick={() => { p.onLayout(l.id); close(); }}>{l.label}</Choice>
                ))}
              </Menu>
            )}

            {is3d && (
              <Menu icon={<Video size={14} />} label="Camera">
                {close => (
                  <>
                    <Choice checked={false} onClick={() => { p.onCamera('iso'); close(); }}>Isometric</Choice>
                    <Choice checked={false} onClick={() => { p.onCamera('profile'); close(); }}>Profile</Choice>
                    <Choice checked={false} onClick={() => { p.onCamera('top'); close(); }}>Top-down</Choice>
                    <div className="tm-group">Motion</div>
                    <Check checked={p.autoRotate} onClick={p.onToggleAutoRotate}>Auto orbit</Check>
                  </>
                )}
              </Menu>
            )}

            <span className="tm-sep" />

            <button
              type="button"
              className={`tm-btn${p.routeActive ? ' danger' : p.routeHasPath ? ' active' : ''}`}
              disabled={!p.hasTopology}
              title={p.hasTopology ? 'Pick two elements to trace the shortest topology path' : 'Route tracing needs topology links'}
              onClick={p.onToggleRoute}
            >
              <Share size={14} />
              <span className="tm-btn-label">{p.routeLabel}</span>
            </button>

            <button
              type="button"
              className={`tm-btn${p.replayOpen || p.replayActive ? ' active' : ''}`}
              aria-pressed={p.replayOpen}
              title="Replay the incident timeline or a blast shockwave"
              onClick={p.onToggleReplay}
            >
              <PlayOutline size={14} />
              <span className="tm-btn-label">Replay</span>
            </button>

            <Menu icon={<Settings size={14} />} label="Options" active={p.showIllustrative}>
              {() => (
                <>
                  <Check
                    checked={p.showIllustrative}
                    danger
                    hint="Adds invented links between layers so the layout has something to show. Never use for real analysis."
                    onClick={p.onToggleIllustrative}
                  >
                    Demo links (invented, not real data)
                  </Check>
                </>
              )}
            </Menu>
          </>
        )}
      </div>

      {!collapsed && p.chipCount > 0 && <div className="tm-chips">{p.chips}</div>}
    </div>
  );
}
