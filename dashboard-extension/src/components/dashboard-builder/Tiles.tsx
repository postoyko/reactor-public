/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Existing toolkit panels, embedded as they are. Each import is literal so webpack can resolve it
 * (the bundle is a single file, so these are not separate downloads).
 */

import React, { Suspense } from 'react';
import { EXTRA_LOADERS } from './tiles-extra';

type PanelModule = { default: React.ComponentType<any> };
/** Depending on the toolkit's tsconfig, TypeScript types import() of a panel as the module object rather than its
 *  default export, which fails to compile. The runtime value is always { default: Component }, so state that here. */
const panel = (m: Promise<unknown>) => m as Promise<PanelModule>;

const BUILTIN_LOADERS: Record<string, () => Promise<PanelModule>> = {
  'telco-causal-gen2': () => panel(import('../../panels/telco-causal-gen2.panel')),
  'telco-causal': () => panel(import('../../panels/telco-causal.panel')),
  'telco-command': () => panel(import('../../panels/telco-command.panel')),
  'incident-dashboard': () => panel(import('../../panels/incident-dashboard.panel')),
  'cognitive-deep-dive': () => panel(import('../../panels/cognitive-deep-dive.panel')),
  'top-n': () => panel(import('../../panels/top-n.panel')),
  'top-n-incidents': () => panel(import('../../panels/top-n-incidents.panel')),
  'application-heatmap': () => panel(import('../../panels/application-heatmap.panel')),
  'incidents-pie-chart': () => panel(import('../../panels/incidents-pie-chart.panel')),
  'monitor-boxes': () => panel(import('../../panels/monitor-boxes.panel')),
  'alerts-workflow': () => panel(import('../../panels/alerts-workflow.panel'))
};

const LOADERS: Record<string, () => Promise<PanelModule>> = { ...BUILTIN_LOADERS, ...EXTRA_LOADERS };

const cache = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

function lazyFor(id: string) {
  let c = cache.get(id);
  if (!c && LOADERS[id]) {
    c = React.lazy(LOADERS[id]);
    cache.set(id, c);
  }
  return c;
}

class TileBoundary extends React.Component<{ children: React.ReactNode; name: string }, { error?: string }> {
  state: { error?: string } = {};

  static getDerivedStateFromError(e: unknown) {
    return { error: e && (e as Error).message ? (e as Error).message : 'This tile failed to render.' };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="db-empty" role="alert">
          <strong>{this.props.name} could not be shown.</strong>
          <span>{this.state.error}</span>
          <button type="button" className="db-link" onClick={() => this.setState({ error: undefined })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Tile({ id, name, props }: { id: string; name: string; props?: Record<string, unknown> }) {
  const Comp = lazyFor(id);
  if (!Comp) return <div className="db-empty">No panel named “{id}” is registered in this build.</div>;
  return (
    <TileBoundary name={name}>
      <Suspense fallback={<div className="db-empty">Loading {name}…</div>}>
        <div className="db-tile-host"><Comp {...(props || {})} /></div>
      </Suspense>
    </TileBoundary>
  );
}
