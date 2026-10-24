/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { InlineNotification } from '@carbon/react';
import { useMesh } from '../MeshContext';

export function StatusBanners(): JSX.Element {
  const { alerts, error, graph, loading } = useMesh();
  return (
    <>
      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Unable to load alerts"
          subtitle={String((error as any)?.message || 'The alert query failed. Check your session and the panel configuration.')}
        />
      ) : null}
      {loading && alerts.length === 0 ? (
        <InlineNotification kind="info" lowContrast hideCloseButton title="Loading alerts…" subtitle="" />
      ) : null}
      {!loading && !error && alerts.length === 0 ? (
        <InlineNotification kind="info" lowContrast hideCloseButton title="No open alerts" subtitle="There is nothing to draw until alerts are available." />
      ) : null}
      {graph.skippedAlerts > 0 ? (
        <InlineNotification kind="warning" lowContrast hideCloseButton title={`${graph.skippedAlerts} alert(s) have no resource name and are not drawn`} subtitle="" />
      ) : null}
    </>
  );
}
