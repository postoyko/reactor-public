/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EventIncident, Flash, Group, Launch } from '@carbon/icons-react';
import { Tag } from '@carbon/react';
import { ALERT_QUERY_PARAMS } from '../../constants';
import { MAX_INCIDENT_CARDS } from '../incident-helpers';
import IncidentMiniGraph from '../IncidentMiniGraph';
import { useMesh } from '../MeshContext';

/** Concert Operate's own page for an incident (same address the Incidents list uses). */
const incidentUrl = (id: string): string => `${window.location.origin}/aiops/${ALERT_QUERY_PARAMS.tenantId}/resolution-hub/incidents/all/${id}/overview`;

export function IncidentsSection(): JSX.Element {
  const { activeIncidentId, activeStoryInsights, alerts, filteredIncidents, handleSelectIncident, incidentFilter, incidentMini, incidents, setActiveIncidentId, setIncidentFilter, setSelectedSankeyNodeId } = useMesh();
  return (
    <div className="incident-war-room">
      <div className="war-room-header">
        <div className="war-room-title">
          <EventIncident size={20} style={{ color: '#da1e28' }} />
          <span>Incident triage</span>
          <span className="live-pulse" />
          <Tag type={incidents.filter((i) => i.priority === 1).length > 0 ? 'red' : 'gray'} size="sm">
            {incidentFilter === 'all'
              ? `${incidents.length} Total Incidents${incidents.filter((i) => i.priority === 1).length > 0 ? ` (${incidents.filter((i) => i.priority === 1).length} P1 Critical)` : ''}`
              : incidentFilter === 'p1'
                ? `${incidents.filter((i) => i.priority === 1).length} P1 Critical Incidents`
                : incidentFilter === 'p2'
                  ? `${incidents.filter((i) => i.priority === 2).length} P2 Major Incidents`
                  : `${incidents.filter((i) => i.state === 'inProgress' || i.state === 'investigating').length} Active Incidents`}
          </Tag>
          {incidentFilter !== 'all' && (
            <Tag
              filter
              type="cool-gray"
              size="sm"
              title="Click to clear incident filter"
              style={{ cursor: 'pointer' }}
              onClick={() => setIncidentFilter('all')}
              onClose={() => setIncidentFilter('all')}
            >
              Filtered: {incidentFilter === 'p1' ? 'P1 Critical' : incidentFilter === 'p2' ? 'P2 Major' : 'Active'} (✕ Clear)
            </Tag>
          )}
          {activeIncidentId && (
            <Tag
              filter
              type="cyan"
              size="sm"
              title="Click to clear incident blast isolation"
              style={{ cursor: 'pointer' }}
              onClick={() => { setActiveIncidentId(null); setSelectedSankeyNodeId(null); }}
              onClose={() => { setActiveIncidentId(null); setSelectedSankeyNodeId(null); }}
            >
              Incident Blast Active: {activeIncidentId.slice(0, 8)}... (✕ Clear Blast)
            </Tag>
          )}
        </div>

        <div className="tc-seg-bar" role="toolbar" aria-label="Filter incidents">
          {([
            ['all', 'All', incidents.length, ''],
            ['p1', 'P1', incidents.filter((i) => i.priority === 1).length, 'P1 Critical'],
            ['p2', 'P2', incidents.filter((i) => i.priority === 2).length, 'P2 Major'],
            ['inProgress', 'Active', incidents.filter((i) => i.state === 'inProgress' || i.state === 'investigating').length, 'In progress or investigating'],
          ] as Array<['all' | 'p1' | 'p2' | 'inProgress', string, number, string]>).map(([id, label, count, hint]) => (
            <button
              key={id}
              type="button"
              className={`tc-seg-btn${incidentFilter === id ? ' on' : ''}${id === 'p1' && count > 0 ? ' alert' : ''}`}
              aria-pressed={incidentFilter === id}
              title={hint || 'All incidents'}
              onClick={() => setIncidentFilter(id === 'all' ? 'all' : (prev) => (prev === id ? 'all' : id))}
            >
              {label}<span className="tc-seg-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="incident-cards-scroll">
        {filteredIncidents.length === 0 ? (
          <div style={{ color: '#525252', padding: '16px 20px', fontSize: '0.85rem' }}>
            No incidents matching filter &ldquo;{incidentFilter}&rdquo;. Click &ldquo;All Incidents&rdquo; or{' '}
            <button
              type="button"
              onClick={() => setIncidentFilter('all')}
              style={{ background: 'none', border: 'none', color: '#0f62fe', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Clear Filter
            </button>
          </div>
        ) : (
          filteredIncidents.slice(0, MAX_INCIDENT_CARDS).map((inc) => {
            const isActive = activeIncidentId === inc.id;
            const pClass = inc.priority === 1 ? 'p1' : inc.priority === 2 ? 'p2' : inc.priority === 3 ? 'p3' : 'p4';
            let rootAlertId: string | null = null;
            inc.insights?.forEach((ins) => {
              if (ins.type?.includes('probable-cause') && ins.details?.id) {
                if (!rootAlertId || ins.details.rank === 1) rootAlertId = ins.details.id;
              }
            });
            const rAlert = rootAlertId ? alerts.find((a) => a.id === rootAlertId) : null;
            const rootName = rAlert?.resource?.name || rAlert?.resource?.hostname || 'n/a';
            const cleanRoot = rootName.split('/').pop()?.split(':::')[0] || rootName;

            return (
              <div
                key={inc.id}
                className={`incident-card ${isActive ? 'active-incident active-story' : ''}`}
                onClick={() => handleSelectIncident(inc)}
              >
                <div className="incident-card-top">
                  <span className={`priority-pill ${pClass}`}>
                    P{inc.priority} {inc.priority === 1 ? 'Critical' : inc.priority === 2 ? 'Major' : 'Medium'}
                  </span>
                  <span className="state-pill">
                    <span style={{ color: inc.state === 'inProgress' ? '#0f62fe' : '#525252' }}>
                      ● {inc.state}
                    </span>
                  </span>
                </div>

                <div className="incident-card-title">{inc.title}</div>
                <IncidentMiniGraph graph={incidentMini.get(inc.id)} />

                <div className="probable-cause-badge">
                  <Flash size={12} style={{ color: '#0f62fe' }} />
                  <span>AI Root: <strong>{cleanRoot.slice(0, 15)}</strong></span>
                  {isActive && activeStoryInsights && (activeStoryInsights.confidencePercent !== undefined || activeStoryInsights.probableCauseScore !== undefined) && (
                    <span style={{ marginLeft: 'auto', color: '#6929c4', fontWeight: 700 }}>
                      {activeStoryInsights.confidencePercent !== undefined ? `${activeStoryInsights.confidencePercent}%` : `score ${activeStoryInsights.probableCauseScore}`}
                    </span>
                  )}
                </div>

                <div className="incident-card-meta">
                  <span className="team-tag">
                    <Group size={12} /> {inc.team || 'Unassigned'}
                  </span>
                  <span className="alert-count-tag">
                    {inc.alertIds.length} Alarms
                  </span>
                  <button
                    type="button"
                    className="incident-open-btn"
                    title="Open this incident in Concert Operate (new tab)"
                    onClick={(e) => { e.stopPropagation(); window.open(incidentUrl(inc.id), '_blank', 'noopener,noreferrer'); }}
                  >
                    <Launch size={12} /> Open in Concert Operate
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
