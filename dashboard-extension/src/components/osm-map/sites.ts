/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Where your sites are. Concert alerts carry no coordinates, so each alert is placed on the map by
 * matching its resource name against the `match` words of a site (first site that matches wins).
 *
 * Edit SITES, then deploy. The README explains the format.
 *
 * Example:
 *   { id: 'lon', name: 'London data centre', lat: 51.5072, lng: -0.1276, match: ['lon-', 'london'] }
 */

import { Site } from './logic';

export const SITES: Site[] = [];
