/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenStreetMap: open alerts placed on a map by site. See README.md and DASHBOARD-CONTRACT.md.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag, Toggle } from '@carbon/react';
import { Map as MapIcon, Renew } from '@carbon/icons-react';
import MapView from './MapView';
import { useFeed } from './feed';
import { SiteMarker, locate, severityLabel } from './logic';
import { SAMPLE_SITES } from './sample';
import { SITES } from './sites';
import { sevColor, useIsDark } from './theme';
import { VERSION } from './version';
import './osm-map.scss';

const MAX_TABLE_ROWS = 25;
const REFRESH_SECONDS = 30;
const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function OsmMapDashboard(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const dark = useIsDark(rootRef);
  const { feed, sample, reload, setSample } = useFeed(REFRESH_SECONDS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sites = sample ? SAMPLE_SITES : SITES;
  const located = useMemo(() => locate(feed.alerts, sites), [feed.alerts, sites]);
  const markers: SiteMarker[] = located.markers;
  const onMap = markers.reduce((n, m) => n + m.alerts.length, 0);
  const shownRows = markers.slice(0, MAX_TABLE_ROWS);
  const loading = feed.status === 'loading';
  const noSites = sites.length === 0;

  return (
    <div ref={rootRef} className={`osm-map${dark ? ' osm-map--dark' : ''}`}>
      {/* Header */}
      <section className="osm-map__header">
        <div>
          <h2 className="osm-map__title"><MapIcon size={24} /> Alerts map</h2>
          <p className="osm-map__subtitle">Open alerts by site, on OpenStreetMap &bull; {VERSION}</p>
        </div>
        <div className="osm-map__actions">
          <Toggle id="osm-map-sample" size="sm" labelText="Sample data" labelA="Off" labelB="On" toggled={sample} onToggle={(on: boolean): void => setSample(on)} />
          <Button size="sm" kind="tertiary" renderIcon={Renew} disabled={loading} onClick={(): void => { reload(); }}>Refresh</Button>
        </div>
      </section>

      {/* Data status */}
      <section className="osm-map__status" aria-live="polite">
        {loading && <InlineLoading description="Reading alerts" />}
        {feed.status === 'error' && <InlineNotification kind="error" title="Alert query failed" subtitle={feed.error} lowContrast hideCloseButton />}
        {feed.status === 'ok' && noSites && (
          <InlineNotification kind="info" title="No sites configured" subtitle="Add your sites to sites.ts, or turn on sample data to preview the map." lowContrast hideCloseButton />
        )}
        {feed.status === 'ok' && !noSites && feed.alerts.length === 0 && (
          <InlineNotification kind="info" title="No open alerts" subtitle="Nothing to place on the map right now." lowContrast hideCloseButton />
        )}
        {feed.status === 'ok' && !noSites && feed.alerts.length > 0 && (
          <Tag type="cyan">{sample ? 'Sample data' : `Updated ${clock(feed.updated)}, every ${REFRESH_SECONDS}s`}</Tag>
        )}
      </section>

      {/* Summary numbers */}
      <section className="osm-map__kpis" aria-label="Summary numbers">
        <div className="osm-map__kpi"><span className="osm-map__kpi-label">Open alerts</span><span className="osm-map__kpi-value">{feed.alerts.length}</span></div>
        <div className="osm-map__kpi"><span className="osm-map__kpi-label">Alerts on the map</span><span className="osm-map__kpi-value">{onMap}</span></div>
        <div className="osm-map__kpi"><span className="osm-map__kpi-label">Sites with alerts</span><span className="osm-map__kpi-value">{markers.length}</span></div>
        <div className="osm-map__kpi"><span className="osm-map__kpi-label">Not placed on a site</span><span className="osm-map__kpi-value">{located.unlocated}</span></div>
      </section>

      {/* Map */}
      <section className="osm-map__map" aria-label="Map of sites with open alerts">
        <MapView markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
      </section>

      {/* Sites with alerts */}
      <section className="osm-map__sites">
        <h3 className="osm-map__section-title">Sites with alerts</h3>
        {markers.length === 0 ? (
          <p className="osm-map__empty">{loading ? 'Loading…' : noSites ? 'No sites configured.' : 'No alerts matched a site.'}</p>
        ) : (
          <>
            <Table size="sm" aria-label="Sites with open alerts">
              <TableHead>
                <TableRow>
                  <TableHeader>Site</TableHeader>
                  <TableHeader>Worst severity</TableHeader>
                  <TableHeader>Open alerts</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {shownRows.map(m => (
                  <TableRow key={m.site.id} className={m.site.id === selectedId ? 'osm-map__row--selected' : undefined}>
                    <TableCell>
                      <button type="button" className="osm-map__link" onClick={(): void => setSelectedId(m.site.id)} aria-label={`Show ${m.site.name} on the map`}>{m.site.name}</button>
                    </TableCell>
                    <TableCell><span className="osm-map__dot" style={{ background: sevColor(m.severity) }} aria-hidden="true" />{severityLabel(m.severity)}</TableCell>
                    <TableCell>{m.alerts.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {markers.length > MAX_TABLE_ROWS && <p className="osm-map__note">Showing {MAX_TABLE_ROWS} of {markers.length} sites</p>}
          </>
        )}
      </section>
    </div>
  );
}
