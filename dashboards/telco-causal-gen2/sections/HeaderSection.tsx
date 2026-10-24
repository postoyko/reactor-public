/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, Diagram, Information, Reset } from '@carbon/icons-react';
import { PANEL_VERSION } from '../version';
import { Button } from '@carbon/react';
import { useMesh } from '../MeshContext';

export function HeaderSection(): JSX.Element {
  const { alerts, incidents, leftOpen, loading, nodes3D, refetch, rightOpen, setIsAboutOpen, toggleRail } = useMesh();
  return (
    <div className="causal-header">
      <div>
        <div className="causal-title">
          <Diagram size={28} />
          Telco Causal Mesh
        </div>
        <div className="causal-subtitle">
          {alerts.length} alert{alerts.length === 1 ? '' : 's'} · {alerts.filter(a => a.severity >= 6).length} critical · {nodes3D.length} resources · {incidents.length} incident{incidents.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="header-actions">
        <div className="gpu-badge">
          <Activity size={16} />
          Concert Operate
        </div>
        <span className="version-tag" title="Panel version (see CHANGES.md)">{PANEL_VERSION}</span>
        <div className="rail-toggles" role="group" aria-label="Show or hide side panels">
          <Button size="sm" kind={leftOpen ? 'secondary' : 'ghost'} aria-pressed={leftOpen} onClick={() => toggleRail('left')}>
            Incidents
          </Button>
          <Button size="sm" kind={rightOpen ? 'secondary' : 'ghost'} aria-pressed={rightOpen} onClick={() => toggleRail('right')}>
            Inspector
          </Button>
        </div>
        <Button size="sm" kind="ghost" renderIcon={Information} onClick={() => setIsAboutOpen(true)}>
          About
        </Button>
        <Button size="sm" kind="tertiary" renderIcon={Reset} disabled={!refetch || Boolean(loading)} onClick={() => refetch?.()}>
          Refresh Mesh
        </Button>
      </div>
    </div>
  );
}
