/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity } from '@carbon/icons-react';
import { useMesh } from '../MeshContext';

export function IngestSection(): JSX.Element {
  const { sparklineRef, telemetryMetrics } = useMesh();
  return (
    <div className="hud-stack-card">
      <div className="hud-stack-header">
        <div className="hud-title">
          <Activity size={16} />
          <span>Live Ingest Velocity &amp; Deduplication Stream</span>
          <span className="live-pill">FROM LOADED ALERTS</span>
        </div>
        <div className="hud-metrics">
          <div className="metric-chip">
            <span className="chip-label">Velocity</span>
            <span className="chip-val highlight">{telemetryMetrics.ingestVelocity} <small>evt/m</small></span>
          </div>
          <div className="metric-chip">
            <span className="chip-label">Deduplication</span>
            <span className="chip-val">{telemetryMetrics.eventsAvailable ? <>{telemetryMetrics.dedupRate}% <small>({telemetryMetrics.compressionRatio}x)</small></> : 'n/a'}</span>
          </div>
          <div className="metric-chip">
            <span className="chip-label">Entropy</span>
            <span className="chip-val">{telemetryMetrics.shannonEntropy} <small>bit</small></span>
          </div>
          <div className="metric-chip">
            <span className="chip-label" title="10·log10(events at severity 4+ / events below severity 4)">Sev ratio</span>
            <span className="chip-val accent">{telemetryMetrics.snrDb >= 0 ? `+${telemetryMetrics.snrDb}` : telemetryMetrics.snrDb} <small>dB</small></span>
          </div>
        </div>
      </div>

      <div className="sparkline-container tc-fill-spark" style={{ marginTop: '4px' }}>
        <canvas ref={sparklineRef} height={28} className="sparkline-canvas" />
        <div className="sparkline-footer" style={{ marginTop: '2px', fontSize: '0.68rem' }}>
          <span className="time-label">{telemetryMetrics.sparklineBins[0]?.time || 't-60m'}</span>
          <span className="rate-info">
            Peak: <strong>{telemetryMetrics.peakVelocity} evts/bin</strong> | Ingest: <strong>{telemetryMetrics.rawEvents.toLocaleString()} raw</strong> → <strong>{telemetryMetrics.totalAlerts.toLocaleString()} alerts</strong>
          </span>
          <span className="time-label">Live</span>
        </div>
      </div>


    </div>
  );
}
