/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DataHub } from './datahub';
import { Filter, QueryName, Row } from './types';
import { DrillRequest } from './drill';

export interface BuilderContext {
  hub: DataHub;
  filters: Filter[];
  /** Wiring by widget id: where its selections go (missing = every widget on the same query). */
  links?: Record<string, string[] | undefined>;
  /** What each value input holds right now (by widget id). */
  values?: Record<string, string>;
  /** Opens the drill-through panel. */
  drill?: (req: DrillRequest) => void;
  setValue?: (id: string, value: string) => void;
  /** Value inputs that are wired to widgets, with the value they hold when untouched. */
  binds?: Array<{ id: string; bind: { field: string; op: string; query: QueryName }; sendTo: string[]; def: string }>;
  /** The dashboard's filter bar: does this row pass? `key` changes whenever the answer could. */
  bar?: { key: string; pass: (query: QueryName, row: Row) => boolean };
  toggleFilter: (from: string, query: QueryName, field: string, value: string) => void;
  /** Replaces what widget `from` has selected on `field` with exactly `values` (safe to call twice with the same values). */
  setSelection: (from: string, query: QueryName, field: string, values: string[]) => void;
}

export const BuilderCtx = React.createContext<BuilderContext | null>(null);

export function useBuilder(): BuilderContext {
  const ctx = React.useContext(BuilderCtx);
  if (!ctx) throw new Error('Widgets must be rendered inside the dashboard builder.');
  return ctx;
}
