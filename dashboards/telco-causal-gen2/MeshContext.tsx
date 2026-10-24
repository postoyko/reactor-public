/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';
import { useMeshController } from './hooks/useMeshController';

/** Everything the sections read: resolved props, UI state, derived models, handlers and DOM refs. */
export type MeshCtx = ReturnType<typeof useMeshController>;

const MeshContext = createContext<MeshCtx | null>(null);

export const MeshProvider = MeshContext.Provider;

export function useMesh(): MeshCtx {
  const ctx = useContext(MeshContext);
  if (!ctx) throw new Error('useMesh() must be called inside <MeshProvider>.');
  return ctx;
}
