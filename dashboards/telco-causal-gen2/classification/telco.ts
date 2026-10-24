/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { TELCO_LAYER_ENTITY, TELCO_LAYER_NAMES } from './layers';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when any term appears as a whole word (digits may follow: `gnb12`, `upf-01`), never inside another word. */
export const hasTerm = (text: string, terms: string[]): boolean => (
  terms.some(t => new RegExp(`(^|[^a-z])${escapeRe(t)}(?![a-z])`).test(text))
);

const CORE_TYPES = ['upf', 'pod', 'wasapplication'];
const TRANSPORT_TYPES = ['router', 'switch', 'lag'];
const RAN_TYPES = ['gnb', 'enb', 'cell'];
const CORE_TERMS = ['core', 'upf', 'amf', 'smf', 'service', 'app', 'pod', 'auth', 'mq', 'db', 'ace'];
const TRANSPORT_TERMS = ['router', 'trans', 'transport', 'agg', 'lag', 'switch', 'cr', 'rchmd', 'storage', 'ceph', 'multus', 'dns', 'tuned'];
const RAN_TERMS = ['ran', 'cell', 'enb', 'gnb', 'radio', 'site', 'antenna', 'tower', 'ape', 'cisco', 'vran'];

/** What the classifier decided for one resource, and why. */
export interface LayerGuess {
  layer: number;
  layerName: string;
  entityType: string;
  /** `type` when a topology entity type decided it, `name` for the resource name, `text` for summary/sender, `default` otherwise. */
  basis: 'type' | 'name' | 'text' | 'default';
  /** Canonical telco type (`UPF`, `OLT` ...) recognised by the classification module, when that is what decided it. */
  canonical?: string;
  /** The word, entity type or pattern that matched. */
  matched?: string;
}

export interface ClassifyInput { name: string; summary?: string; sender?: string; entityTypes?: string[] }

const guess = (layer: number, basis: LayerGuess['basis']): LayerGuess => ({
  layer, layerName: TELCO_LAYER_NAMES[layer], entityType: TELCO_LAYER_ENTITY[layer], basis
});

/**
 * Best-effort layer guess for the Telco scheme (4 strata). This is a heuristic, not topology: topology entity types win,
 * then the resource name, then the alert text. Words are matched whole (so "interface" is not "ace" and "critical" is
 * not "cr").
 */
export function classifyLayer(input: ClassifyInput): LayerGuess {
  const types = (input.entityTypes || []).map(t => t.toLowerCase());
  const hasType = (list: string[]) => types.some(t => list.some(x => t.includes(x)));
  if (hasType(CORE_TYPES)) return guess(1, 'type');
  if (hasType(TRANSPORT_TYPES)) return guess(2, 'type');
  if (hasType(RAN_TYPES)) return guess(3, 'type');

  const stages: Array<[string, LayerGuess['basis']]> = [
    [input.name.toLowerCase(), 'name'],
    [`${input.summary || ''} ${input.sender || ''}`.toLowerCase(), 'text']
  ];
  for (const [text, basis] of stages) {
    if (hasTerm(text, CORE_TERMS)) return guess(1, basis);
    if (hasTerm(text, TRANSPORT_TERMS)) return guess(2, basis);
    if (hasTerm(text, RAN_TERMS)) return guess(3, basis);
  }
  return guess(4, 'default');
}
