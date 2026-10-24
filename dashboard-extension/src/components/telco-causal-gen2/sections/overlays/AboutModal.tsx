/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Portal } from '../../Overlay';
import { Modal } from '@carbon/react';
import { PANEL_VERSION } from '../../version';
import { Flash, Information, Layers, Terminal } from '@carbon/icons-react';
import { useMesh } from '../../MeshContext';

export function AboutModal(): JSX.Element {
  const { isAboutOpen, setIsAboutOpen } = useMesh();
  return (
    <>
      {isAboutOpen && (
      <Portal>
      <Modal
        open={isAboutOpen}
        modalHeading={`About: Telco Causal Mesh ${PANEL_VERSION}`}
        passiveModal
        onRequestClose={() => setIsAboutOpen(false)}
        size="lg"
      >
        <div className="about-modal-wrapper">
          <div className="about-guide-container">
            <div className="about-card">
              <div className="card-header-badge">
                <Layers size={16} /> 1. What it shows
              </div>
              <p className="card-body-text">
                The alerts and incidents already loaded from Cloud Pak for AIOps, drawn as a topology of resources in four tiers. Tiers are <strong>estimated</strong> from entity types, resource names and alert text, so they are marked &ldquo;(est.)&rdquo; wherever they appear:
                <span className="highlight-pill">5G Core Network</span>
                <span className="highlight-pill">IP Transport Fabric</span>
                <span className="highlight-pill">RAN Edge (eNodeB/gNodeB)</span>
                <span className="highlight-pill">Subscribers &amp; Slices</span>.
                Everything is computed from that live data. Nothing is invented: when something cannot be known, it says <strong>n/a</strong> and what it needs.
              </p>
            </div>

            <div className="about-card">
              <div className="card-header-badge">
                <Flash size={16} /> 2. What is on the page
              </div>
              <ul className="capabilities-list">
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Incident triage (left rail):</strong> the incidents, filtered by All / P1 / P2 / Active, each with a small picture of the resources and links behind it and its AI probable cause. Click one to isolate its blast in the topology.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Topology (centre):</strong> a <strong>3D</strong> mesh and a structural <strong>2D</strong> canvas (Tiers, Radial and Pods layouts) with a control bar: Lens (Hardware, Severity, Risk SPOF, Strata), Layers (tiers and ASM hop expansion), 3D Layout and Camera, Trace route, Replay and Options. Critical and major resources pulse in 3D.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Insight views (under the topology):</strong>
                    <strong> Sankey Lineage</strong> (probes to tiers to incidents to runbook policies);
                    <strong> Triage Insights</strong> (recurring problems, correlation gaps, root causes, sources);
                    <strong> Sunburst / Treemap</strong> (where the alerts are, by tier, group and resource);
                    <strong> Alert Timeline</strong> (one lane per resource, with the probe that saw it first);
                    <strong> Link Explorer</strong> (a flow or matrix of how resources connect).
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Inspector (right rail):</strong> the alarms on the selected resource, a blast-radius radar with the single-point-of-failure island, ingest velocity from the loaded alerts, and remediation policies. The remediation console is a labelled simulation unless the host connects a real action.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Deep-dive drawer:</strong> alert timeline, topology and SPOF, golden-signal metrics and remediation log for one resource.
                  </div>
                </li>
              </ul>
            </div>

            <div className="about-card">
              <div className="card-header-badge">
                <Terminal size={16} /> 3. How to use it
              </div>
              <div className="usage-steps-list">
                <div className="step-item">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <div className="step-title">Find what matters</div>
                    <div className="step-desc">
                      Open <strong>Triage Insights</strong> and start with <strong>Recurring problems</strong>: click a row to show only the resources that raised it. <strong>Correlation gaps</strong> lists what is not being handled, and <strong>Sources</strong> filters by probe. Use <strong>Sunburst / Treemap</strong> to see where the alerts are concentrated. Each filter appears as a chip above the topology and clears with one click.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <div className="step-title">Narrow by time</div>
                    <div className="step-desc">
                      In <strong>Alert Timeline</strong>, drag across the time axis to keep only the resources with an alert in that window; click once to clear it. Use <strong>Replay</strong> in the control bar to watch resources appear in the order of their first alert (<strong>Incident timeline</strong>), or to expand hop by hop from a selected resource (<strong>Blast shockwave</strong>).
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <div className="step-title">Explore the topology</div>
                    <div className="step-desc">
                      Click a resource to focus it and its neighbours. Right-click (or double-click in 2D) for the context menu and deep dive. Switch 3D / 2D in the control bar. The <strong>Risk SPOF</strong> lens marks cut-vertices when topology links are supplied. Click <strong>Trace route</strong>, then a source and a target, for the shortest path; <strong>Trace Detour</strong> in the drawer computes a path that avoids SPOF nodes.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <div className="step-title">Make room</div>
                    <div className="step-desc">
                      <strong>Controls</strong> collapses the control bar to a one-line summary. <strong>Incidents</strong> and <strong>Inspector</strong> in the header hide the side rails. These choices are remembered in this browser.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="about-card">
              <div className="card-header-badge">
                <Information size={16} /> 4. What needs what
              </div>
              <ul className="capabilities-list">
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Topology links</strong> (supplied by the host): single-point-of-failure analysis, blast islands, route tracing, the Topology filter in Link Explorer and blast shockwave replay. Without them these show n/a and only incident (causal) links are drawn.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Event counts</strong> (the eventCount column): the deduplication ratio. <strong>Subscriber inventory:</strong> subscriber counts for blast islands. <strong>Measured values on links:</strong> latency. <strong>Alert times:</strong> the timeline, time window and incident replay (at least two different times).
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Options &rarr; Demo links</strong> adds invented links so the layout has something to show. They are labelled and must never be used for real analysis. Probable-cause confidence is shown only when the service reports a score.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>
      </Portal>
      )}
    </>
  );
}
