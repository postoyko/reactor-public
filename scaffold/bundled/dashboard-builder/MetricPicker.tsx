/*
 * Chooses the series a metric widget shows: a metric group, a metric, and (optionally) one resource.
 * The choice is stored in the widget's filter as "group|metric|resource"; an empty resource means the first one.
 */
import React, { useEffect, useState } from 'react';
import { Select, SelectItem } from '@carbon/react';
import { listMetricGroups, listMetricResources, listMetrics, parseMetricSpec } from './datahub';
import { ALERT_QUERY_PARAMS } from '../constants';

interface Props { id: string; spec: string; onChange: (spec: string) => void }

export default function MetricPicker({ id, spec, onChange }: Props) {
  const cur = parseMetricSpec(spec);
  const tenant = ALERT_QUERY_PARAMS.tenantId;
  const [groups, setGroups] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  useEffect(() => { let on = true; listMetricGroups(tenant).then(g => { if (on) setGroups(g); }); return () => { on = false; }; }, [tenant]);
  useEffect(() => { let on = true; listMetrics(tenant, cur.group).then(m => { if (on) setMetrics(m); }); return () => { on = false; }; }, [tenant, cur.group]);
  useEffect(() => { let on = true; listMetricResources(tenant, cur.group, cur.metric).then(r => { if (on) setResources(r); }); return () => { on = false; }; }, [tenant, cur.group, cur.metric]);
  const set = (g: string, m: string, r: string) => onChange(`${g}|${m}|${r}`);
  const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list);
  return (
    <>
      <Select id={`${id}-g`} labelText="Metric group" size="sm" value={cur.group} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set(e.target.value, '', '')}>
        <SelectItem value="" text="Choose a group" />
        {withCurrent(groups, cur.group).map(g => <SelectItem key={g} value={g} text={g} />)}
      </Select>
      <Select id={`${id}-m`} labelText="Metric" size="sm" value={cur.metric} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set(cur.group, e.target.value, '')}>
        <SelectItem value="" text="Choose a metric" />
        {withCurrent(metrics, cur.metric).map(m => <SelectItem key={m} value={m} text={m} />)}
      </Select>
      <Select id={`${id}-r`} labelText="Resource" size="sm" helperText="The first resource is used when none is chosen." value={cur.resource} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set(cur.group, cur.metric, e.target.value)}>
        <SelectItem value="" text="First resource" />
        {withCurrent(resources, cur.resource).map(x => <SelectItem key={x} value={x} text={x.split(':::')[0]} />)}
      </Select>
    </>
  );
}
