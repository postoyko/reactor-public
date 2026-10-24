/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reads alerts through the signed-in Concert session (no API key, no direct REST call).
 */

import { useCallback, useEffect, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';
import { Alert, adaptAlerts } from './logic';
import { SAMPLE_ALERTS } from './sample';

export interface Feed { alerts: Alert[]; status: 'loading' | 'ok' | 'error'; error?: string; updated: number }

export interface FeedControls { feed: Feed; sample: boolean; reload: () => void; setSample: (on: boolean) => void }

const COLUMNS: string[] = ['id', 'severity', 'state', 'summary', 'sender.name', 'resource.name', 'lastOccurrenceTime'];

const api = (): Record<string, (o: object) => Promise<any>> | undefined => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;

export function useFeed(refreshSeconds: number = 30): FeedControls {
  const [sample, setSampleOn] = useState<boolean>(false);
  const [feed, setFeed] = useState<Feed>({ alerts: [], status: 'loading', updated: 0 });

  const load = useCallback(async (): Promise<void> => {
    if (sample) { setFeed({ alerts: SAMPLE_ALERTS, status: 'ok', updated: Date.now() }); return; }
    const a = api();
    if (!a || typeof a.getAlerts !== 'function') {
      setFeed(f => ({ ...f, status: 'error', error: 'This page is not running inside Concert Operate, so there are no alerts to read. Use sample data to preview the map.' }));
      return;
    }
    try {
      const r = await a.getAlerts({ tenantId: ALERT_QUERY_PARAMS.tenantId, columns: COLUMNS, filter: ALERT_QUERY_PARAMS.filter, format: ALERT_QUERY_PARAMS.format });
      const err = r && r.errors && r.errors[0];
      if (err) throw new Error(String(err.message || 'The query returned an error'));
      setFeed({ alerts: adaptAlerts(r), status: 'ok', updated: Date.now() });
    } catch (e) {
      setFeed(f => ({ ...f, status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  }, [sample]);

  useEffect(() => {
    let off = false;
    const run = (): void => { if (!off) { load(); } };
    run();
    const id = window.setInterval(run, Math.max(5, refreshSeconds) * 1000);
    return () => { off = true; window.clearInterval(id); };
  }, [load, refreshSeconds]);

  const setSample = useCallback((on: boolean): void => {
    setFeed({ alerts: [], status: 'loading', updated: 0 });
    setSampleOn(on);
  }, []);

  return { feed, sample, reload: load, setSample };
}
