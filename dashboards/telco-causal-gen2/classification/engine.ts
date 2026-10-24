/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { CANONICAL_ROWS, PATTERN_ROWS } from './seed';
import { LayerDef, LayerSchemeId, SCHEMES, layerDef } from './layers';
import { AMBIGUOUS_WORDS, KNOWN_ENTITY_TYPES, LAYER_OVERRIDES, NETWORK_LAYER_TO_TYPE, OPS_KEY_BY_TYPE, OSI_KEY_BY_TYPE, TEXT_HINTS } from './types-map';
import { ClassifyInput, LayerGuess, classifyLayer } from './telco';

/*
 * The classification pipeline.
 *
 *   Telco   unchanged: classifyLayer() in telco.ts.
 *   OSI/OPS resource -> entity type -> layer, with these steps in order, stopping at the first that gives a layer:
 *
 *     1. Topology entity types reported for the resource (exact type, or a canonical type key such as `olt`)     basis "type"
 *     2. The resource name: canonical telco type patterns (the TSA seed), then whole words that are entity types     basis "name"
 *     3. The alert summaries, sender and alert type: the same patterns and words, then the wording hints (TEXT_HINTS)     basis "text"
 *     4. The scheme's "Unclassified" layer                                                                            basis "default"
 *
 *   A recognised canonical type (`UPF`, `OLT`, `PE` ...) carries a generic entity type (`server`, `switch`, `router` ...),
 *   and that is what the unified entity-layer mappings (entity-layers.ts) turn into an OSI or an OPS layer.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// ── Canonical types and their patterns ──────────────────────────────────────

export interface CanonicalType { key: string; tier: number; networkLayer: string; generic: string; label: string }

export const CANONICAL_TYPES: CanonicalType[] = CANONICAL_ROWS.map(([key, tier, networkLayer, generic, label]) => ({ key, tier, networkLayer, generic, label }));
const CANONICAL_BY_KEY = new Map(CANONICAL_TYPES.map(c => [c.key.toLowerCase(), c]));

/**
 * The seed writes boundaries as `\b`, which counts digits as letters and so misses `LONDON01OLT1`. As elsewhere in the
 * dashboard, a term may touch digits and punctuation but never another letter: `\b` at the start of a group becomes
 * `(?<![a-z])`, anywhere else `(?![a-z])`.
 */
export function relaxBoundaries(source: string): string {
  return source.replace(/\\b/g, (_m, offset: number, whole: string) => {
    const prev = whole.slice(0, offset).replace(/\\\\/g, '');
    const startsGroup = offset === 0 || /[(|]$/.test(prev) || /\(\?:$/.test(prev);
    return startsGroup ? '(?<![a-z])' : '(?![a-z])';
  });
}

interface CompiledPattern { re: RegExp; canonical: CanonicalType; source: string }
let compiled: CompiledPattern[] | null = null;

function patterns(): CompiledPattern[] {
  if (compiled) return compiled;
  compiled = [];
  PATTERN_ROWS.forEach(([source, key]) => {
    const canonical = CANONICAL_BY_KEY.get(key.toLowerCase());
    if (!canonical) return;
    try {
      compiled!.push({ re: new RegExp(relaxBoundaries(source), 'i'), canonical, source });
    } catch {
      try { compiled!.push({ re: new RegExp(source, 'i'), canonical, source }); } catch { /* an unusable pattern is skipped */ }
    }
  });
  return compiled;
}

/** The first canonical type whose pattern appears in the text. */
export function findCanonical(text: string): { canonical: CanonicalType; source: string } | null {
  if (!text) return null;
  for (const p of patterns()) if (p.re.test(text)) return { canonical: p.canonical, source: p.source };
  return null;
}

// ── Whole-word entity types in names and text ───────────────────────────────

let wordRe: RegExp | null = null;
const WORDS = Array.from(KNOWN_ENTITY_TYPES).filter(w => w.length >= 3 && !AMBIGUOUS_WORDS.has(w));

function findWord(text: string): string | null {
  if (!text) return null;
  if (!wordRe) wordRe = new RegExp(`(?:^|[^a-z])(${WORDS.sort((a, b) => b.length - a.length).join('|')})(?![a-z])`, 'i');
  const m = wordRe.exec(text);
  return m ? m[1].toLowerCase() : null;
}

// ── Type -> layer ───────────────────────────────────────────────────────────

const layerByKey = (scheme: Exclude<LayerSchemeId, 'telco'>, key: string): LayerDef | undefined =>
  SCHEMES[scheme].layers.find(l => l.key.toLowerCase() === key.toLowerCase());

/** Layer of a generic entity type (and, as a hint, the network layer of the canonical type it came from). */
function layerForType(scheme: Exclude<LayerSchemeId, 'telco'>, type: string, networkLayer?: string): LayerDef | undefined {
  const lookup = (t: string) => (scheme === 'osi' ? OSI_KEY_BY_TYPE.get(t) : OPS_KEY_BY_TYPE.get(t));
  let key = lookup(norm(type));
  if (!key && networkLayer && NETWORK_LAYER_TO_TYPE[networkLayer]) key = lookup(NETWORK_LAYER_TO_TYPE[networkLayer]);
  return key ? layerByKey(scheme, key) : undefined;
}

const finish = (scheme: Exclude<LayerSchemeId, 'telco'>, layer: LayerDef, basis: LayerGuess['basis'], extra: { canonical?: string; generic?: string; matched?: string }): LayerGuess => ({
  layer: layer.id,
  layerName: layer.name,
  entityType: extra.generic || layer.entityType,
  basis,
  canonical: extra.canonical,
  matched: extra.matched
});

/** Looks for a layer in one piece of text: canonical patterns first, then whole-word entity types. */
function fromText(scheme: Exclude<LayerSchemeId, 'telco'>, text: string, basis: LayerGuess['basis']): LayerGuess | null {
  const hit = findCanonical(text);
  if (hit) {
    const { canonical } = hit;
    const override = LAYER_OVERRIDES[scheme][canonical.key] ?? LAYER_OVERRIDES[scheme][canonical.generic];
    const layer = (override && layerByKey(scheme, override)) || layerForType(scheme, canonical.generic, canonical.networkLayer);
    if (layer) return finish(scheme, layer, basis, { canonical: canonical.key, generic: canonical.generic, matched: hit.source });
  }
  const word = findWord(text);
  if (word) {
    const override = LAYER_OVERRIDES[scheme][word];
    const layer = (override && layerByKey(scheme, override)) || layerForType(scheme, word);
    if (layer) return finish(scheme, layer, basis, { generic: word, matched: word });
  }
  if (basis === 'text') {
    for (const hint of TEXT_HINTS) {
      const m = hint.pattern.exec(text);
      if (!m) continue;
      const override = LAYER_OVERRIDES[scheme][hint.type];
      const layer = (override && layerByKey(scheme, override)) || layerForType(scheme, hint.type);
      if (layer) return finish(scheme, layer, basis, { generic: hint.type, matched: m[0] });
    }
  }
  return null;
}

/** One topology entity type: an exact entity type, a canonical key, or a type made of known words (`kubernetesPod`). */
function fromEntityType(scheme: Exclude<LayerSchemeId, 'telco'>, raw: string): LayerGuess | null {
  const whole = norm(raw);
  const candidates = [whole, ...tokens(raw).reverse()];
  for (const c of candidates) {
    const override = LAYER_OVERRIDES[scheme][c] ?? LAYER_OVERRIDES[scheme][c.toUpperCase()];
    const o = override && layerByKey(scheme, override);
    if (o) return finish(scheme, o, 'type', { generic: c, matched: raw });
    const canon = CANONICAL_BY_KEY.get(c);
    if (canon) {
      const layer = layerForType(scheme, canon.generic, canon.networkLayer);
      if (layer) return finish(scheme, layer, 'type', { canonical: canon.key, generic: canon.generic, matched: raw });
    }
    const layer = layerForType(scheme, c);
    if (layer) return finish(scheme, layer, 'type', { generic: c, matched: raw });
  }
  return null;
}

const cache = new Map<string, LayerGuess>();

/** Forget remembered results; call after changing LAYER_OVERRIDES at run time. */
export function resetClassificationCache(): void { cache.clear(); }

/**
 * Classifies one resource under a scheme. `entityTypes` are the raw types reported by topology insights; `name` is the
 * cleaned resource name; `summary` and `sender` come from the first alert of the resource.
 */
export function classifyResource(scheme: LayerSchemeId, input: ClassifyInput): LayerGuess {
  if (scheme === 'telco') return classifyLayer(input);
  const key = `${scheme}|${input.name}|${input.summary || ''}|${input.sender || ''}|${(input.entityTypes || []).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let result: LayerGuess | null = null;
  for (const t of input.entityTypes || []) {
    result = fromEntityType(scheme, t);
    if (result) break;
  }
  if (!result) result = fromText(scheme, input.name, 'name');
  if (!result) result = fromText(scheme, `${input.summary || ''} ${input.sender || ''}`, 'text');
  if (!result) {
    const fallback = layerDef(SCHEMES[scheme].fallback);
    result = { layer: fallback.id, layerName: fallback.name, entityType: fallback.entityType, basis: 'default' };
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}
