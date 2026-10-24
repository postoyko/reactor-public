/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { AlertItem, LayoutMode, alertTime, buildGraph, probeOf } from '../logic';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';
import { useLiveEntityTypes } from './useLiveEntityTypes';

export function useMeshGraph(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState> & ReturnType<typeof useLiveEntityTypes>) {
  const { session, alerts, hasEventCounts, incidents, layerSpacing, layoutMode, layerScheme, liveEntityTypes, positionCache, setLayoutMode, showIllustrative, topologyLinks } = m;
  // ── Graph ───────────────────────────────────────────────────────────────────

  const graph = session.memo('graph', [alerts, incidents, layoutMode, layerSpacing, topologyLinks, showIllustrative, layerScheme, liveEntityTypes], () => buildGraph(alerts, incidents, {
      layoutMode,
      layerScheme,
      liveEntityTypes,
      layerSpacing,
      topologyLinks,
      illustrativeLinks: showIllustrative,
      positionCache: positionCache.current,
    }));
  const nodes3D = graph.nodes;
  const links3D = graph.links;
  const topoLinks = useMemo(() => links3D.filter(l => l.kind !== 'causal'), [links3D]);
  const hasTopology = topoLinks.length > 0;
  const changeLayout = (mode: LayoutMode) => {
    positionCache.current = new Map();
    setLayoutMode(mode);
  };
  // ── Telemetry (ingest velocity, deduplication, severity ratio, source entropy) ──

  const telemetryMetrics = session.memo('telemetry', [alerts, hasEventCounts], () => {
    const empty = {
      totalAlerts: 0,
      rawEvents: 0,
      eventsAvailable: hasEventCounts,
      dedupRate: 0,
      compressionRatio: 1,
      snrDb: 0,
      signalRatio: 0,
      shannonEntropy: 0,
      sourceCount: 0,
      ingestVelocity: 0,
      sparklineBins: [] as { time: string; count: number; rawCount: number }[],
      peakVelocity: 0,
    };
    if (alerts.length === 0) return empty;

    const countOf = (a: AlertItem) => (hasEventCounts ? Math.max(a.eventCount || 1, 1) : 1);
    let rawEvents = 0;
    let highSevEvents = 0;
    let lowSevEvents = 0;
    const senderCounts = new Map<string, number>();
    const timestamps: number[] = [];

    alerts.forEach(alert => {
      const count = countOf(alert);
      rawEvents += count;
      if (alert.severity >= 4) highSevEvents += count;
      else lowSevEvents += count;
      const sender = probeOf(alert);
      senderCounts.set(sender, (senderCounts.get(sender) || 0) + count);
      const ts = alertTime(alert);
      if (ts !== null) timestamps.push(ts);
    });

    const totalAlerts = alerts.length;
    const dedupRate = rawEvents > totalAlerts ? ((rawEvents - totalAlerts) / rawEvents) * 100 : 0;
    const compressionRatio = rawEvents / Math.max(totalAlerts, 1);
    const snrDb = Math.round(10 * Math.log10(Math.max(highSevEvents, 1) / Math.max(lowSevEvents, 1)) * 10) / 10;
    const signalRatio = Math.round((highSevEvents / Math.max(rawEvents, 1)) * 1000) / 10;

    let shannonEntropy = 0;
    senderCounts.forEach(count => {
      const p = count / rawEvents;
      if (p > 0) shannonEntropy -= p * Math.log2(p);
    });
    shannonEntropy = Math.round(shannonEntropy * 100) / 100;

    const BIN_COUNT = 36;
    let minTime = timestamps.length ? Math.min(...timestamps) : Date.now() - 3600000;
    const maxTime = timestamps.length ? Math.max(...timestamps) : Date.now();
    if (maxTime - minTime < 60000) minTime = maxTime - 3600000;
    const binDuration = (maxTime - minTime) / BIN_COUNT;
    const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({
      time: new Date(minTime + i * binDuration).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      count: 0,
      rawCount: 0,
    }));
    alerts.forEach(alert => {
      const ts = alertTime(alert);
      if (ts !== null && ts >= minTime && ts <= maxTime) {
        const idx = Math.min(Math.floor((ts - minTime) / binDuration), BIN_COUNT - 1);
        bins[idx].count += 1;
        bins[idx].rawCount += countOf(alert);
      }
    });

    const peakVelocity = Math.max(...bins.map(b => b.rawCount), 1);
    const timeSpanMinutes = Math.max((maxTime - minTime) / 60000, 1);
    return {
      totalAlerts,
      rawEvents,
      eventsAvailable: hasEventCounts,
      dedupRate: Math.round(dedupRate * 10) / 10,
      compressionRatio: Math.round(compressionRatio * 10) / 10,
      snrDb,
      signalRatio,
      shannonEntropy,
      sourceCount: senderCounts.size,
      ingestVelocity: Math.round((rawEvents / timeSpanMinutes) * 10) / 10,
      sparklineBins: bins,
      peakVelocity,
    };
  });

  return { changeLayout, graph, hasTopology, links3D, nodes3D, telemetryMetrics, topoLinks };
}
