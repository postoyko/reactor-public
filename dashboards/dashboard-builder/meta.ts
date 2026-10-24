/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { NATIVE, TILES } from './registry';
import { carbonSpec } from './carbon-specs';

/** The plain name of a widget type, as the library shows it ("Bar chart", "Tabs", "Incident Atlas"). */
export function typeLabel(type: string): string {
  const n = NATIVE.find(x => x.type === type);
  if (n) return n.label;
  if (type.startsWith('tile:')) {
    const t = TILES.find(x => `tile:${x.id}` === type);
    return t ? t.label : 'Dashboard tile';
  }
  if (type === 'platform') return 'Calls the platform';
  const c = carbonSpec(type);
  return c ? c.label : type;
}
