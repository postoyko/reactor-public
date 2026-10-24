/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Triage insights, four views over the loaded alerts and incidents (buildTriageInsights in logic.ts):
 *  1. Recurring problems   what keeps happening, and where
 *  2. Correlation gaps     what is not being handled (no incident, unassigned, no probable cause, no runbook)
 *  3. Root causes          which resources are named as probable cause most often
 *  4. Sources              alerts per probe, split by severity
 * Counts only: nothing here is estimated.
 */

import React, { useState } from 'react';
import { Button } from '@carbon/react';
import { TriageModel, IncidentRef, RecurringProblem } from './logic';
import { severityHex, SEVERITY_LABEL } from './insight-utils';

type Tab = 'problems' | 'gaps' | 'roots' | 'sources';

interface Props {
  model: TriageModel;
  selectedProbe: string | null;
  onSelectProbe: (probe: string | null) => void;
  /** Label of the problem/gap filter currently applied to the mesh, if any. */
  activeFilter: string | null;
  onFilterNodes: (label: string, nodeIds: string[]) => void;
  onClearFilter: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectIncident: (incidentId: string) => void;
}

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Stat({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'bad' | 'ok' | 'neutral' }) {
  return (
    <div className={`triage-stat ${tone || 'neutral'}`}>
      <div className="triage-stat-title">{title}</div>
      <div className="triage-stat-value">{value}</div>
      {sub && <div className="triage-stat-sub">{sub}</div>}
    </div>
  );
}

function IncidentList({ title, items, empty, onSelect }: { title: string; items: IncidentRef[]; empty: string; onSelect: (id: string) => void }) {
  return (
    <div className="triage-list">
      <div className="triage-list-title">{title} <span className="triage-count">{items.length}</span></div>
      {items.length === 0 ? <div className="triage-empty">{empty}</div> : items.slice(0, 8).map(i => (
        <button key={i.id} type="button" className="triage-row" onClick={() => onSelect(i.id)} title="Select this incident">
          <span className={`prio p${i.priority}`}>P{i.priority}</span>
          <span className="triage-row-main">{clip(i.title, 60)}</span>
          <span className="triage-row-meta">{i.state}</span>
        </button>
      ))}
      {items.length > 8 && <div className="triage-more">+{items.length - 8} more</div>}
    </div>
  );
}

export default function TriageInsights({ model, selectedProbe, onSelectProbe, activeFilter, onFilterNodes, onClearFilter, onSelectNode, onSelectIncident }: Props) {
  const [tab, setTab] = useState<Tab>('problems');
  const { problems, gaps, rootCauses, sources } = model;

  const tabs: Array<[Tab, string, number]> = [
    ['problems', 'Recurring problems', problems.length],
    ['gaps', 'Correlation gaps', gaps.orphanAlertIds.length + gaps.unassigned.length + gaps.noProbableCause.length],
    ['roots', 'Root causes', rootCauses.length],
    ['sources', 'Sources', sources.length],
  ];

  const problemRow = (p: RecurringProblem, max: number) => {
    const label = `Problem: ${clip(p.label, 40)}`;
    const active = activeFilter === label;
    return (
      <button
        key={p.key}
        type="button"
        className={`triage-problem${active ? ' active' : ''}`}
        onClick={() => (active ? onClearFilter() : onFilterNodes(label, p.resourceIds))}
        title={p.resourceIds.length ? 'Click to show only the resources that raised this' : 'No resource names on these alerts'}
        disabled={p.resourceIds.length === 0}
      >
        <span className="triage-bar"><i style={{ width: `${Math.max((p.count / max) * 100, 3)}%`, background: severityHex(p.worstSeverity) }} /></span>
        <span className="triage-problem-label">{clip(p.label, 90)}</span>
        <span className="triage-problem-nums">
          <strong>{p.count}</strong> alerts · {plural(p.resourceIds.length, 'resource')} · {SEVERITY_LABEL(p.worstSeverity)}
          {p.probes.length > 0 && <> · {clip(p.probes.join(', '), 40)}</>}
        </span>
      </button>
    );
  };

  const body = () => {
    if (tab === 'problems') {
      if (problems.length === 0) return <div className="insight-empty">No alerts are loaded.</div>;
      const max = problems[0].count;
      const repeated = problems.filter(p => p.count > 1).length;
      return (
        <>
          <div className="insight-note neutral">
            Alerts with the same wording are grouped (numbers and IP addresses are ignored, so eth1 and eth2 count together). {repeated} of {problems.length} groups repeat. Click a row to filter the mesh.
          </div>
          <div className="triage-scroll">{problems.slice(0, 25).map(p => problemRow(p, max))}</div>
        </>
      );
    }

    if (tab === 'gaps') {
      const g = gaps;
      return (
        <div className="triage-scroll">
          <div className="triage-stats">
            <Stat title="Alerts in an incident" value={`${g.alertsInIncident} of ${g.alertCount}`} sub={`${pct(g.alertsInIncident, g.alertCount)} correlated`} tone={g.orphanAlertIds.length === 0 ? 'ok' : 'neutral'} />
            <Stat title="Alerts with no incident" value={String(g.orphanAlertIds.length)} sub={`${plural(g.orphanResourceIds.length, 'resource')}`} tone={g.orphanAlertIds.length > 0 ? 'bad' : 'ok'} />
            <Stat title="Unassigned incidents" value={`${g.unassigned.length} of ${g.incidentCount}`} tone={g.unassigned.length > 0 ? 'bad' : 'ok'} />
            <Stat title="No probable cause" value={`${g.noProbableCause.length} of ${g.incidentCount}`} tone={g.noProbableCause.length > 0 ? 'bad' : 'ok'} />
            <Stat title="Alerts with a runbook" value={`${g.alertsWithRunbook} of ${g.alertCount}`} sub={`${g.runbookAutomated} automated · ${g.runbookAssisted} assisted`} />
          </div>
          <div className="triage-gap-actions">
            <Button
              size="sm"
              kind="tertiary"
              disabled={g.orphanResourceIds.length === 0}
              onClick={() => (activeFilter === 'Alerts with no incident' ? onClearFilter() : onFilterNodes('Alerts with no incident', g.orphanResourceIds))}
            >
              {activeFilter === 'Alerts with no incident' ? 'Clear mesh filter' : `Show the ${plural(g.orphanResourceIds.length, 'resource')} with uncorrelated alerts in the mesh`}
            </Button>
          </div>
          <div className="triage-lists">
            <IncidentList title="Unassigned incidents" items={g.unassigned} empty="Every incident has an owner or team." onSelect={onSelectIncident} />
            <IncidentList title="Incidents with no probable cause" items={g.noProbableCause} empty="Every incident has a probable cause." onSelect={onSelectIncident} />
            <IncidentList title="Incidents with no runbook" items={g.incidentsWithoutRunbook} empty="Every incident has at least one runbook." onSelect={onSelectIncident} />
          </div>
        </div>
      );
    }

    if (tab === 'roots') {
      if (rootCauses.length === 0) return <div className="insight-empty">No incident has a probable-cause insight, so there is nothing to rank.</div>;
      return (
        <div className="triage-scroll">
          <table className="triage-table">
            <thead><tr><th>Resource</th><th>Incidents</th><th>Ranked #1</th><th>Confidence</th><th>Incident titles</th></tr></thead>
            <tbody>
              {rootCauses.slice(0, 20).map(r => (
                <tr key={r.resourceId} onClick={() => onSelectNode(r.resourceId)} title="Click to select in the mesh">
                  <td className="mono">{clip(r.resourceId, 34)}</td>
                  <td><strong>{r.incidents.length}</strong></td>
                  <td>{r.rankOne}</td>
                  <td>{r.maxConfidencePercent === null ? 'n/a' : `${r.maxConfidencePercent}%`}</td>
                  <td className="muted">{clip(r.incidents.map(i => i.title).join(' · '), 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="triage-more">Confidence is shown only when the service reports a 0 to 1 score.</div>
        </div>
      );
    }

    if (sources.length === 0) return <div className="insight-empty">No alerts are loaded.</div>;
    const max = sources[0].total;
    const parts: Array<[keyof typeof sources[number], number]> = [['critical', 6], ['major', 5], ['minor', 4], ['warning', 3], ['info', 2]];
    return (
      <div className="triage-scroll">
        <div className="insight-legend triage-legend">
          {parts.map(([k, sev]) => <span key={k} className="legend-chip"><i style={{ background: severityHex(sev) }} />{SEVERITY_LABEL(sev)}</span>)}
          <span className="insight-hint">Click a source to filter the mesh to its resources.</span>
        </div>
        {sources.map(s => (
          <button key={s.probe} type="button" className={`triage-source${selectedProbe === s.probe ? ' active' : ''}`} onClick={() => onSelectProbe(selectedProbe === s.probe ? null : s.probe)}>
            <span className="triage-source-name">{clip(s.probe, 28)}</span>
            <span className="triage-stack" style={{ width: `${Math.max((s.total / max) * 100, 4)}%` }}>
              {parts.map(([k, sev]) => (s[k] as number) > 0 && (
                <i key={k} style={{ flex: s[k] as number, background: severityHex(sev) }} title={`${SEVERITY_LABEL(sev)}: ${s[k]}`} />
              ))}
            </span>
            <span className="triage-source-total">{s.total}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="insight-view triage-insights">
      <div className="insight-toolbar">
        <div className="insight-switch" role="tablist" aria-label="Triage insights">
          {tabs.map(([id, label, n]) => (
            <Button key={id} size="sm" kind={tab === id ? 'primary' : 'ghost'} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label} <span className="triage-tab-count">{n}</span>
            </Button>
          ))}
        </div>
        {activeFilter && (
          <button type="button" className="triage-clear" onClick={onClearFilter}>Mesh filtered: {clip(activeFilter, 40)} ✕</button>
        )}
      </div>
      {body()}
    </div>
  );
}
