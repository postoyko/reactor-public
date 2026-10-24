/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './layers';
export * from './telco';
export * from './types-map';
export { CANONICAL_TYPES, classifyResource, findCanonical, relaxBoundaries, resetClassificationCache } from './engine';
export type { CanonicalType } from './engine';
