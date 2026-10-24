/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Severity and priority wherever they show up as text: a colour dot for severity, a coloured P-tag for priority, from the one
 * palette (semanticColor in rows.ts). Anything else is returned unchanged.
 */

import React from 'react';
import { semanticColor } from './rows';

export function SemCell({ field, value, shown }: { field: string; value: unknown; shown?: string }): React.ReactElement {
  const text = value === undefined || value === null ? '' : String(value);
  const sem = field === 'severityLabel' || field === 'severity' || field === 'priority' ? semanticColor(field, text) : undefined;
  if (!sem) return <>{shown !== undefined ? shown : text}</>;
  if (field === 'priority') return <span className="db-pri" style={{ background: sem.fill, color: sem.ink }}>{shown !== undefined ? shown : `P${text}`}</span>;
  return <span className="db-sev"><i style={{ background: sem.fill }} />{shown !== undefined ? shown : text}</span>;
}
