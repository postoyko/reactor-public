/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import ForceGraph3DView from '../force-graph-3d/ForceGraph3DView';
import { LinkDimension, severityColor, severityLabel } from '../force-graph-3d/graph';
import './3df-sample.scss';

export interface ThreeDForceSampleDashboardProps {
  alertsData?: any;
  storiesData?: any;
  loading?: boolean;
  error?: any;
  refetch?: () => void;
  initialLinkBy?: LinkDimension[];
  maxNodes?: number;
  refreshSeconds?: number;
}

const PRESETS: Array<{ id: string; label: string; dims: LinkDimension[] }> = [
  { id: 'source_type', label: 'Source & Type', dims: ['sender.name', 'type.classification'] },
  { id: 'team_source', label: 'Team & Source', dims: ['team', 'sender.name'] },
  { id: 'full_mesh', label: 'Full 3D Mesh', dims: ['sender.name', 'team', 'type.classification'] }
];

export const ThreeDForceSampleDashboard: React.FC<ThreeDForceSampleDashboardProps> = ({
  alertsData,
  storiesData,
  loading = false,
  error = null,
  refetch,
  initialLinkBy = ['sender.name', 'type.classification'],
  maxNodes = 1500,
  refreshSeconds = 0
}) => {
  const [activePreset, setActivePreset] = useState<string>('source_type');
  const [linkBy, setLinkBy] = useState<LinkDimension[]>(initialLinkBy);
  const [activeTab, setActiveTab] = useState<'hubs' | 'resources' | 'incidents' | 'alerts'>('hubs');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handlePresetChange = (preset: { id: string; dims: LinkDimension[] }) => {
    setActivePreset(preset.id);
    setLinkBy(preset.dims);
  };

  // Extract alerts safely
  const alerts: any[] = useMemo(() => {
    const raw = alertsData?.tenant?.alerts?.rows;
    return Array.isArray(raw) ? raw : [];
  }, [alertsData]);

  // Extract stories safely
  const stories: any[] = useMemo(() => {
    const raw = storiesData?.tenant?.stories?.rows || storiesData?.tenant?.stories;
    return Array.isArray(raw) ? raw : [];
  }, [storiesData]);

  // Compute summary KPI statistics
  const stats = useMemo(() => {
    let critical = 0;
    let major = 0;
    const resourceSet = new Set<string>();
    const senderMap = new Map<string, number>();
    const teamMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const resourceMap = new Map<string, { count: number; maxSev: number; name: string }>();

    for (const a of alerts) {
      const sev = Number(a.severity) || 0;
      if (sev >= 5) critical++;
      else if (sev === 4) major++;

      const resName = a.resource?.name || 'Unknown';
      resourceSet.add(resName);

      const existing = resourceMap.get(resName) || { count: 0, maxSev: 0, name: resName };
      existing.count++;
      if (sev > existing.maxSev) existing.maxSev = sev;
      resourceMap.set(resName, existing);

      if (a.sender?.name) {
        senderMap.set(a.sender.name, (senderMap.get(a.sender.name) || 0) + 1);
      }
      if (a.team) {
        teamMap.set(a.team, (teamMap.get(a.team) || 0) + 1);
      }
      if (a.type?.classification) {
        typeMap.set(a.type.classification, (typeMap.get(a.type.classification) || 0) + 1);
      }
    }

    const topResources = Array.from(resourceMap.values()).sort((a, b) => b.maxSev - a.maxSev || b.count - a.count);
    const topSenders = Array.from(senderMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const topTeams = Array.from(teamMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const topTypes = Array.from(typeMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return {
      totalAlerts: alerts.length,
      critical,
      major,
      uniqueResources: resourceSet.size,
      totalStories: stories.length,
      topResources,
      topSenders,
      topTeams,
      topTypes
    };
  }, [alerts, stories]);

  // Filtered alerts for the list tab
  const filteredAlerts = useMemo(() => {
    if (!searchQuery.trim()) return alerts.slice(0, 50);
    const q = searchQuery.toLowerCase();
    return alerts
      .filter(
        a =>
          a.resource?.name?.toLowerCase().includes(q) ||
          a.summary?.toLowerCase().includes(q) ||
          a.sender?.name?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [alerts, searchQuery]);

  return (
    <div className="three-d-force-sample-dashboard" data-testid="3df-sample-dashboard">
      {/* Top Header */}
      <header className="dashboard-header">
        <div className="header-title-group">
          <span className="header-badge">3D Force Graph</span>
          <div>
            <h1>3D Force Directed Alert Topology Dashboard</h1>
            <p className="header-subtitle">
              Interactive 3D correlation mesh clustering alerts by sender sources, team domains, and classifications.
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="preset-btn-group" role="group" aria-label="Clustering presets">
            {PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                className={activePreset === p.id ? 'active' : ''}
                onClick={() => handlePresetChange(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {refetch && (
            <button type="button" className="refresh-btn" onClick={() => refetch()}>
              ↻ Refetch
            </button>
          )}
        </div>
      </header>

      {/* KPI Cards Banner */}
      <section className="kpi-banner">
        <div className="kpi-card">
          <span className="kpi-label">Active Alerts</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{stats.totalAlerts}</span>
            {stats.critical > 0 && (
              <span className="kpi-tag tag-critical">{stats.critical} Critical</span>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Impacted Resources</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{stats.uniqueResources}</span>
            <span className="kpi-tag tag-info">Nodes</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Major Incidents</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{stats.major}</span>
            <span className="kpi-tag tag-major">Major</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Correlated Stories</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{stats.totalStories}</span>
            <span className="kpi-tag tag-success">Stories</span>
          </div>
        </div>
      </section>

      {/* Main 2-Column Split Workspace */}
      <main className="dashboard-content-grid">
        {/* Left Stage: 3D Force Graph */}
        <section className="graph-stage-panel">
          <div className="panel-header">
            <h2 className="panel-title">3D Spatial Topology Visualizer</h2>
            <span className="panel-hint">Left drag: Orbit | Right drag: Pan | Scroll: Zoom</span>
          </div>
          <div className="graph-container">
            <ForceGraph3DView
              data={alertsData}
              loading={loading}
              error={error}
              refetch={refetch}
              linkBy={linkBy}
              maxNodes={maxNodes}
              refreshSeconds={refreshSeconds}
            />
          </div>
        </section>

        {/* Right Stage: Inspector / Telemetry Tabs */}
        <aside className="inspector-stage-panel">
          <div className="tabs-header">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'hubs' ? 'active' : ''}`}
              onClick={() => setActiveTab('hubs')}
            >
              Cluster Hubs
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
              onClick={() => setActiveTab('resources')}
            >
              Resources
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'incidents' ? 'active' : ''}`}
              onClick={() => setActiveTab('incidents')}
            >
              Incidents ({stats.totalStories})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setActiveTab('alerts')}
            >
              Alerts
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'hubs' && (
              <div>
                <h3 className="section-heading">Top Source Senders</h3>
                <div className="item-list">
                  {stats.topSenders.slice(0, 5).map(s => (
                    <div key={s.name} className="list-item-card">
                      <div className="item-main">
                        <span className="item-name">{s.name}</span>
                        <span className="item-sub">Alert Source</span>
                      </div>
                      <div className="item-stat">
                        <span className="count-pill">{s.count} alerts</span>
                      </div>
                    </div>
                  ))}
                  {stats.topSenders.length === 0 && <div className="empty-state">No source senders active</div>}
                </div>

                <h3 className="section-heading" style={{ marginTop: '1.25rem' }}>
                  Classification Hubs
                </h3>
                <div className="item-list">
                  {stats.topTypes.slice(0, 5).map(t => (
                    <div key={t.name} className="list-item-card">
                      <div className="item-main">
                        <span className="item-name">{t.name}</span>
                        <span className="item-sub">Type Classification</span>
                      </div>
                      <div className="item-stat">
                        <span className="count-pill">{t.count} alerts</span>
                      </div>
                    </div>
                  ))}
                  {stats.topTypes.length === 0 && <div className="empty-state">No classification hubs active</div>}
                </div>
              </div>
            )}

            {activeTab === 'resources' && (
              <div>
                <h3 className="section-heading">Impacted Resources ({stats.topResources.length})</h3>
                <div className="item-list">
                  {stats.topResources.slice(0, 15).map(r => (
                    <div key={r.name} className="list-item-card">
                      <div className="item-main">
                        <span className="item-name">{r.name}</span>
                        <span className="item-sub">
                          Highest Severity:{' '}
                          <span style={{ color: severityColor(r.maxSev) || '#f4f4f4', fontWeight: 600 }}>
                            {severityLabel(r.maxSev)}
                          </span>
                        </span>
                      </div>
                      <div className="item-stat">
                        <span className="count-pill">{r.count} alerts</span>
                      </div>
                    </div>
                  ))}
                  {stats.topResources.length === 0 && <div className="empty-state">No impacted resources</div>}
                </div>
              </div>
            )}

            {activeTab === 'incidents' && (
              <div>
                <h3 className="section-heading">Correlated Stories ({stories.length})</h3>
                {stories.slice(0, 10).map((story, idx) => {
                  const title = story.title || story.description || `Story #${story.id || idx + 1}`;
                  const priority = Number(story.priority) || 3;
                  const sevClass = priority <= 1 ? 'severity-critical' : priority === 2 ? 'severity-major' : '';
                  return (
                    <div key={story.id || idx} className={`incident-card ${sevClass}`}>
                      <div className="incident-title">{title}</div>
                      <div className="incident-meta">
                        <span>Status: {story.state || 'In Progress'}</span>
                        <span>Priority: {priority}</span>
                      </div>
                    </div>
                  );
                })}
                {stories.length === 0 && <div className="empty-state">No correlated stories found</div>}
              </div>
            )}

            {activeTab === 'alerts' && (
              <div>
                <input
                  type="text"
                  placeholder="Filter alerts by resource / summary..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    marginBottom: '0.75rem',
                    background: '#161616',
                    border: '1px solid #393939',
                    color: '#ffffff',
                    borderRadius: '2px',
                    fontSize: '0.8125rem'
                  }}
                />
                <div className="item-list">
                  {filteredAlerts.map((a, i) => (
                    <div key={a.id || i} className="list-item-card">
                      <div className="item-main">
                        <span className="item-name">{a.resource?.name || 'Resource'}</span>
                        <span className="item-sub">{a.summary || 'Alert description'}</span>
                      </div>
                      <div className="item-stat">
                        <span
                          className="count-pill"
                          style={{
                            background: severityColor(Number(a.severity) || 0) || '#393939',
                            color: Number(a.severity) >= 4 ? '#ffffff' : '#000000'
                          }}
                        >
                          {severityLabel(Number(a.severity) || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {filteredAlerts.length === 0 && <div className="empty-state">No alerts match search</div>}
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default ThreeDForceSampleDashboard;
