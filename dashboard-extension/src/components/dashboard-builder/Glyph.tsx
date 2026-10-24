/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small drawn icons for widget types, tinted by what kind of widget it is (live data, content, Carbon component,
 * embedded dashboard). Used by the library, the layers list, the widget title bars and the settings header.
 */

import React from 'react';

export type Kind = 'data' | 'content' | 'carbon' | 'tile';

export function kindOf(type: string): Kind {
  if (type.startsWith('carbon:')) return 'carbon';
  if (type.startsWith('tile:')) return 'tile';
  return type === 'text' || type === 'image' ? 'content' : 'data';
}

function shape(k: string): React.ReactNode {
  switch (k) {
    case 'kpi':
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 9.5h3.5M5 6.5h1.5" /></>);
    case 'bar':
      return (<><path d="M3.5 13V8M8 13V3.5M12.5 13V6" /></>);
    case 'donut':
      return (<><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="1.75" /></>);
    case 'timeseries':
      return (<path d="M2 12l3.5-4.5 3 2L14 3.5" />);
    case 'table':
      return (<><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6.5h12M6 6.5V13" /></>);
    case 'image':
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="5.75" cy="6.5" r="1" /><path d="M2.5 12l3.5-3 2.5 2 2-1.5 3 2.5" /></>);
    case 'text':
      return (<path d="M3 4.5h10M3 8h10M3 11.5h6" />);
    case 'carbon':
      return (<><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>);
    default:
      return (<><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 6h12M4 4.5h.01M6 4.5h.01" /></>);
  }
}

export function Glyph({ type, size = 24 }: { type: string; size?: number }) {
  const k = kindOf(type);
  const name = k === 'carbon' ? 'carbon' : k === 'tile' ? 'tile' : type;
  return (
    <span className="db-glyph" data-k={k} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 16 16" width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round">
        {shape(name)}
      </svg>
    </span>
  );
}
