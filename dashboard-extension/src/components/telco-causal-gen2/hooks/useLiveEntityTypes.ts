/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { IDLE, QueryStatus } from '../types';
import { adaptTopologyResource, resourcesWithoutTypes } from '../logic';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';
import { useSessionState } from '../session/MeshSession';

/** Most resources asked about per refresh, and how many requests run at once. */
const MAX_RESOURCES = 300;
const PARALLEL = 6;

/**
 * Live entity types for the OSI and OPS layer schemes.
 *
 * The alert query only carries entity types when the topology insight has them. For every other resource this asks the
 * topology service (`getTopologyResource`, the query the inspector already uses) for the resource's real entity types, so
 * the layer comes from the live topology rather than from guessing at the name. Nothing is requested for the Telco scheme,
 * which does not use them, and each resource is asked about once per session. Runs in the host tile only.
 */
export function useLiveEntityTypes(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState>) {
  const { isHost, session, alerts, layerScheme, queryApi } = m;
  const [liveEntityTypes, setLiveEntityTypes] = useSessionState<Record<string, string[]>>(session, 'liveEntityTypes', {});
  const [liveTypesStatus, setLiveTypesStatus] = useSessionState<QueryStatus>(session, 'liveEntityTypesStatus', IDLE);
  const asked = session.ref('liveEntityTypes.asked', () => new Set<string>());
  const queryApiRef = useRef(queryApi);
  queryApiRef.current = queryApi;

  useEffect(() => {
    if (!isHost || layerScheme === 'telco') return undefined;
    const api = queryApiRef.current;
    if (!api) {
      setLiveTypesStatus({ state: 'unavailable', message: 'No query API is connected, so entity types come from the alert data only.' });
      return undefined;
    }
    const todo = resourcesWithoutTypes(alerts).filter(r => !asked.current.has(r.key)).slice(0, MAX_RESOURCES);
    if (todo.length === 0) return undefined;
    todo.forEach(r => asked.current.add(r.key));

    let live = true;
    let completed = false;
    let done = 0;
    let failed = 0;
    let firstError = '';
    setLiveTypesStatus({ state: 'loading', message: `Reading entity types from the topology service: 0 of ${todo.length}` });
    const found: Record<string, string[]> = {};

    const one = async (r: { key: string; resourceId: string }) => {
      try {
        const res = await api('getTopologyResource', { resourceId: r.resourceId });
        if (res && Array.isArray(res.errors) && res.errors.length > 0) throw new Error(String(res.errors[0]?.message || 'getTopologyResource returned an error'));
        const types = adaptTopologyResource(res)?.entityTypes || [];
        if (types.length > 0) found[r.key] = types;
        else failed++;
      } catch (e) {
        failed++;
        if (!firstError) firstError = e instanceof Error ? e.message : String(e);
      }
      done++;
    };

    (async () => {
      for (let i = 0; i < todo.length && live; i += PARALLEL) {
        await Promise.all(todo.slice(i, i + PARALLEL).map(one));
        if (!live) return;
        setLiveTypesStatus({ state: 'loading', message: `Reading entity types from the topology service: ${done} of ${todo.length}` });
      }
      if (!live) return;
      completed = true;
      if (Object.keys(found).length > 0) setLiveEntityTypes(prev => ({ ...prev, ...found }));
      const got = Object.keys(found).length;
      setLiveTypesStatus(got > 0
        ? { state: 'ok', message: `${got} of ${todo.length} resources typed by the topology service${failed ? `, ${failed} without a type${firstError ? ` (${firstError})` : ''}` : ''}` }
        : { state: failed ? 'error' : 'empty', message: firstError || 'The topology service returned no entity types for these resources.' });
    })();

    return () => {
      live = false;
      // A run that was cut short did not finish: let the next run ask about those resources again.
      if (!completed) todo.forEach(r => asked.current.delete(r.key));
    };
  }, [isHost, layerScheme, alerts]);

  return { liveEntityTypes, liveTypesStatus };
}
