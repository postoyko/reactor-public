/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Portal } from '../../Overlay';
import { Activity, Close, Play } from '@carbon/icons-react';
import { Button, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react';
import { alertTime, probeOf } from '../../logic';
import { formatOffset } from '../../incident-helpers';
import { useMesh } from '../../MeshContext';
import { RawJsonTab } from '../../RawJsonTab';
import { severityHex, severityInk } from '../../severity';

export function DeepDiveDrawer(): JSX.Element {
  const { queryApi, activeDrawerTab, drawerMetrics, drawerNode, drawerNodeSpofReport, drawerRunbookPolicies, drawerTopologyDetails, handleOpenRemediationModal, handleTraverseNeighbor, hasEventCounts, hasTopology, isDrawerOpen, links3D, metricsStatus, setActiveDrawerTab, setIsDrawerOpen, setIsRoutingMode, setRouteSourceId, setRouteTargetId, spofAnalysis, topologyStatus } = useMesh();
  return (
    <>
      {isDrawerOpen && drawerNode && (
        <Portal>
        <div className="deep-dive-drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="deep-dive-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="drawer-title">
                  <Activity size={20} />
                  Deep-Dive Diagnostic Cockpit: {drawerNode.name}
                </div>
                <div className="drawer-subtitle">
                  Stratum: {drawerNode.layerName} | Severity: Sev {drawerNode.severity} | Probable-cause rank: {drawerNode.probableCauseRank ?? 'none'}
                </div>
              </div>
              <Button
                hasIconOnly
                renderIcon={Close}
                iconDescription="Close"
                kind="ghost"
                size="sm"
                onClick={() => setIsDrawerOpen(false)}
              />
            </div>

            <div className="drawer-content">
              <Tabs selectedIndex={activeDrawerTab} onChange={({ selectedIndex }) => setActiveDrawerTab(selectedIndex)}>
                <TabList aria-label="Diagnostic Tabs">
                  <Tab>Alert Timeline</Tab>
                  <Tab>Topology &amp; SPOF</Tab>
                  <Tab>Golden Signals</Tab>
                  <Tab>Remediation Log</Tab>
                  <Tab>Raw JSON</Tab>
                </TabList>

                <TabPanels>
                  {/* Tab 1: real alerts on this resource */}
                  <TabPanel>
                    <div className="tab-pane">
                      <div className="section-title">Alerts on this resource (chronological precursor sequence)</div>
                      <div className="precursor-timeline">
                        {(() => {
                          const list = drawerNode.alerts
                            .map(a => ({ a, t: alertTime(a) }))
                            .sort((x, y) => (x.t ?? 0) - (y.t ?? 0));
                          const latest = Math.max(...list.map(x => x.t ?? 0));
                          return list.map(({ a, t }, idx) => {
                            const isPrecursor = idx === 0 || (t !== null && t < latest);
                            return (
                              <div key={a.id} className={`timeline-event ${a.severity >= 6 ? 'critical' : ''}`}>
                                <div className="time-badge">{t === null ? 'time n/a' : formatOffset(latest - t)}</div>
                                <div className="event-body">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {isPrecursor && <Tag type="magenta" size="sm">PRECURSOR</Tag>}
                                    <span className="event-title">{a.summary || '(no summary)'}</span>
                                  </div>
                                  <span className="event-meta">
                                    Source: <strong>{probeOf(a)}</strong> | Severity: Sev {a.severity} | State: {a.state || 'n/a'}
                                    {a.signature ? ` | Sig: ${a.signature.slice(0, 16)}...` : ''}
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </TabPanel>

                  {/* Tab 2: ASM Physical & L2/L3 Topology Service & SPOF Cut-Vertex Engine */}
                  <TabPanel>
                    <div className="tab-pane">
                      {/* SPOF Resilience Card */}
                      <div className="spof-resilience-card" style={{
                        background: !hasTopology ? 'rgba(141, 141, 141, 0.12)' : drawerNodeSpofReport?.isCutVertex ? 'rgba(250, 77, 86, 0.12)' : 'rgba(66, 190, 101, 0.1)',
                        border: `1px solid ${!hasTopology ? '#8d8d8d' : drawerNodeSpofReport?.isCutVertex ? '#fa4d56' : '#42be65'}`,
                        borderRadius: '6px',
                        padding: '12px 14px',
                        marginBottom: '16px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: !hasTopology ? '#525252' : drawerNodeSpofReport?.isCutVertex ? '#fa4d56' : '#42be65' }}>
                            {!hasTopology
                              ? 'RESILIENCE UNKNOWN (no topology links supplied)'
                              : drawerNodeSpofReport?.isCutVertex
                                ? '⚠️ SINGLE POINT OF FAILURE (cut vertex)'
                                : '✓ Not a cut vertex in the supplied topology'}
                          </span>
                          <Tag type={!hasTopology ? 'gray' : drawerNodeSpofReport?.isCutVertex ? 'red' : 'green'} size="sm">
                            {!hasTopology ? 'Unknown' : drawerNodeSpofReport?.isCutVertex ? 'SPOF' : 'Has alternate paths'}
                          </Tag>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#525252', lineHeight: 1.5 }}>
                          {!hasTopology ? (
                            <>No topology links were supplied, so redundancy and blast islands cannot be computed.</>
                          ) : drawerNodeSpofReport?.isCutVertex ? (
                            <>
                              If [<strong>{drawerNode.name}</strong>] fails, <strong>{drawerNodeSpofReport.blastNodeCount} other resource(s)</strong>
                              {drawerNodeSpofReport.blastPartitionIds.length > 0 && <> ({drawerNodeSpofReport.blastPartitionIds.slice(0, 4).join(', ')}{drawerNodeSpofReport.blastPartitionIds.length > 4 ? '…' : ''})</>} lose their path to the core layer
                              {drawerNodeSpofReport.severedSubscribers !== null && <>, affecting <strong>{drawerNodeSpofReport.severedSubscribers.toLocaleString()} subscribers</strong></>}.
                              {!spofAnalysis.blastAvailable && ' Blast island unavailable: no core-layer resource in the data.'}
                            </>
                          ) : (
                            <>Removing this resource does not disconnect any other resource from the core layer in the supplied topology.</>
                          )}
                        </div>
                        {drawerNodeSpofReport?.detourPath && (
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: '#0f62fe' }}>
                              Detour Path: {drawerNodeSpofReport.detourPath.map(n => n.name).join(' ➔ ')}
                            </span>
                            <Button
                              size="sm"
                              kind="ghost"
                              onClick={() => {
                                if (drawerNodeSpofReport.detourPath && drawerNodeSpofReport.detourPath.length >= 2) {
                                  setRouteSourceId(drawerNodeSpofReport.detourPath[0].id);
                                  setRouteTargetId(drawerNodeSpofReport.detourPath[drawerNodeSpofReport.detourPath.length - 1].id);
                                  setIsRoutingMode(true);
                                  setIsDrawerOpen(false);
                                }
                              }}
                            >
                              Trace Detour in 3D
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>ASM Topology Service Resource Metadata</span>
                        {topologyStatus.state === 'ok' ? (
                          <Tag type="blue" size="sm">From topology service</Tag>
                        ) : topologyStatus.state === 'loading' ? (
                          <Tag type="cool-gray" size="sm">Querying…</Tag>
                        ) : topologyStatus.state === 'error' ? (
                          <Tag type="red" size="sm" title={topologyStatus.message}>Query failed</Tag>
                        ) : (
                          <Tag type="gray" size="sm">{topologyStatus.state === 'unavailable' ? 'Not connected' : 'No data'}</Tag>
                        )}
                      </div>
                      <div className="topology-props-grid">
                        <div className="prop-item"><span className="p-key">Resource:</span><span className="p-val">{drawerNode.name}</span></div>
                        <div className="prop-item"><span className="p-key">Entity types:</span><span className="p-val">{drawerTopologyDetails?.entityTypes?.length ? drawerTopologyDetails.entityTypes.join(', ') : (drawerNode.entityTypes.length ? drawerNode.entityTypes.join(', ') : 'n/a')}</span></div>
                        <div className="prop-item"><span className="p-key">IP Address:</span><span className="p-val">{drawerTopologyDetails?.properties?.ipAddress || drawerTopologyDetails?.properties?.ipAddresses?.join(', ') || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">MAC Address:</span><span className="p-val">{drawerTopologyDetails?.properties?.macAddress || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">Firmware / OS:</span><span className="p-val">{drawerTopologyDetails?.properties?.firmwareVersion || drawerTopologyDetails?.properties?.osVersion || drawerTopologyDetails?.properties?.version || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">Location:</span><span className="p-val">{drawerTopologyDetails?.properties?.location || drawerTopologyDetails?.properties?.dataCenter || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">Tier (classification):</span><span className="p-val">{drawerNode.layerName}</span></div>
                        <div className="prop-item"><span className="p-key">Max severity:</span><span className="p-val" style={{ color: severityHex(drawerNode.severity) }}>Sev {drawerNode.severity} ({drawerNode.alertCount} alarm(s))</span></div>
                        <div className="prop-item"><span className="p-key">Betweenness:</span><span className="p-val">{drawerNode.betweenness === null ? 'n/a (no topology links)' : `${Math.round(drawerNode.betweenness)}% (${drawerNode.degree} links)`}</span></div>
                        <div className="prop-item"><span className="p-key">ASM unique ID:</span><span className="p-val">{drawerTopologyDetails?.uniqueId || drawerNode.uniqueId || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">Composite ID:</span><span className="p-val">{drawerNode.compositeId || 'n/a'}</span></div>
                        <div className="prop-item"><span className="p-key">Probable-cause rank:</span><span className="p-val" style={{ color: drawerNode.isProbableCause ? '#6929c4' : '#525252' }}>{drawerNode.probableCauseRank ?? 'none'}</span></div>
                      </div>

                      <div className="section-title" style={{ marginTop: '20px' }}>Topological Dependencies &amp; 1-Hop Neighbors</div>
                      <div className="neighbor-dependencies-list">
                        {links3D
                          .filter((l) => l.source.id === drawerNode.id || l.target.id === drawerNode.id)
                          .slice(0, 6)
                          .map((l, i) => {
                            const neighbor = l.source.id === drawerNode.id ? l.target : l.source;
                            return (
                              <div key={i} className="neighbor-card" onClick={() => handleTraverseNeighbor(neighbor)}>
                                <div className="neighbor-info" style={{ cursor: 'pointer' }}>
                                  <div className="neighbor-title" title={neighbor.name}>{neighbor.name}</div>
                                  <div className="neighbor-meta">
                                    rel: <strong style={{ color: '#0f62fe' }}>{l.relType}</strong> ({neighbor.layerName}) &bull; {l.kind} &bull; Latency: {l.latencyMs === undefined ? 'n/a' : `${l.latencyMs} ms`}
                                  </div>
                                </div>
                                <div className="neighbor-actions">
                                  <Tag type="gray" size="sm" style={{ background: severityHex(neighbor.severity), color: severityInk(neighbor.severity) }}>
                                    Sev {neighbor.severity}
                                  </Tag>
                                  <Button
                                    size="sm"
                                    kind="tertiary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTraverseNeighbor(neighbor);
                                    }}
                                  >
                                    Traverse ➔
                                  </Button>
                                  <Button
                                    size="sm"
                                    kind="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRouteSourceId(drawerNode.id);
                                      setRouteTargetId(neighbor.id);
                                      setIsRoutingMode(true);
                                      setIsDrawerOpen(false);
                                    }}
                                  >
                                    Trace Route
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </TabPanel>

                  {/* Tab 3: metrics need a metrics source */}
                  <TabPanel>
                    <div className="tab-pane">
                      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Golden Signals &amp; Telemetry (Metric Manager / Instana)</span>
                        {metricsStatus.state === 'ok' ? (
                          <Tag type="green" size="sm">Last hour</Tag>
                        ) : metricsStatus.state === 'loading' ? (
                          <Tag type="cool-gray" size="sm">Querying…</Tag>
                        ) : metricsStatus.state === 'error' ? (
                          <Tag type="red" size="sm">Query failed</Tag>
                        ) : (
                          <Tag type="gray" size="sm">{metricsStatus.state === 'empty' ? 'No data' : 'Not configured'}</Tag>
                        )}
                      </div>

                      {drawerMetrics.length > 0 ? (
                        <div className="metrics-series-list" style={{ marginTop: '12px' }}>
                          {drawerMetrics.map((series, idx) => (
                            <div key={idx} className="metric-series-card" style={{ background: '#f4f4f4', padding: '10px 12px', borderRadius: '4px', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{series.metricName}</span>
                                <span style={{ fontWeight: 700, color: '#0f62fe' }}>{series.currentValue ?? 'n/a'} {series.unit || ''}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: '#525252', marginTop: '4px' }}>
                                <span>Min: {series.min ?? 'n/a'}</span>
                                <span>Max: {series.max ?? 'n/a'}</span>
                                <span>Avg: {series.avg ?? 'n/a'}</span>
                                <span>Points: {series.points.length}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ background: '#f4f4f4', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '12px', margin: '12px 0', fontSize: '0.8rem', color: '#525252', lineHeight: 1.4 }}>
                          {metricsStatus.state === 'loading' && 'Querying the metric manager…'}
                          {metricsStatus.state === 'error' && `The metric query failed: ${metricsStatus.message}`}
                          {metricsStatus.state !== 'loading' && metricsStatus.state !== 'error' && (metricsStatus.message || 'No metric data.')}
                        </div>
                      )}
                      {metricsStatus.state === 'ok' && metricsStatus.message && (
                        <div style={{ fontSize: '0.75rem', color: '#8a3800' }}>{metricsStatus.message}</div>
                      )}

                      <div className="topology-props-grid" style={{ marginTop: '12px' }}>
                        <div className="prop-item"><span className="p-key">Alarms on resource:</span><span className="p-val">{drawerNode.alertCount}</span></div>
                        <div className="prop-item"><span className="p-key">Events (deduplicated):</span><span className="p-val">{hasEventCounts ? drawerNode.alerts.reduce((sum, a) => sum + Math.max(a.eventCount || 1, 1), 0) : 'n/a (eventCount column not requested)'}</span></div>
                      </div>
                    </div>
                  </TabPanel>

                  {/* Tab 4: real runbooks attached to this resource's alerts */}
                  <TabPanel>
                    <div className="tab-pane">
                      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Runbook policies &amp; Actions attached to this resource</span>
                        {drawerRunbookPolicies.length > 0 && <Tag type="teal" size="sm">AIOps Runbook API</Tag>}
                      </div>
                      <div className="terminal-box">
                        {drawerNode.runbooks.length === 0 && drawerRunbookPolicies.length === 0 ? (
                          <div className="t-line">[none] No runbook is attached to the alerts on this resource.</div>
                        ) : drawerRunbookPolicies.length > 0 ? (
                          drawerRunbookPolicies.map((pol, i) => (
                            <div className="t-line" key={i}>
                              [POLICY] {pol.policyName || pol.policyId || 'Unnamed Policy'} {pol.isAutomated ? '(Automated)' : '(Assisted)'}
                              {pol.runbookName ? ` ➔ Runbook: ${pol.runbookName}` : pol.runbookId ? ` ➔ Runbook ID: ${pol.runbookId}` : ''}
                              {pol.description ? ` | ${pol.description}` : ''}
                            </div>
                          ))
                        ) : (
                          drawerNode.runbooks.map((r: any, i: number) => (
                            <div className="t-line" key={i}>
                              [POLICY] {r?.policyId || '(no policy id)'} | {r?.isAutomated ? 'automated' : 'assisted'}{r?.runbookId ? ` | runbook ${r.runbookId}` : ''}
                            </div>
                          ))
                        )}
                      </div>
                      <Button
                        size="sm"
                        kind="primary"
                        renderIcon={Play}
                        style={{ marginTop: '12px' }}
                        disabled={drawerNode.alerts.length === 0}
                        onClick={() => {
                          const withRunbook = drawerNode.alerts.find(a => a.insights?.some(i => i.type?.includes('runbook'))) || drawerNode.alerts[0];
                          if (withRunbook) handleOpenRemediationModal(withRunbook);
                        }}
                      >
                        Open Remediation Console
                      </Button>
                    </div>
                  </TabPanel>
                  {/* Tab 5: the alert and the topology entity exactly as the APIs return them */}
                  <TabPanel>
                    <div className="tab-pane">
                      {activeDrawerTab === 4 && (
                        <RawJsonTab
                          query={queryApi || null}
                          alerts={drawerNode.alerts.map(a => ({ id: a.id, summary: a.summary, severity: a.severity }))}
                          uniqueId={drawerNode.uniqueId}
                          entityName={drawerNode.name}
                          sampleAlert={id => drawerNode.alerts.find(a => a.id === id)}
                        />
                      )}
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
