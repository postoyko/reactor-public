/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import { DeepDiveDrawer } from './DeepDiveDrawer';
import { LinkModal } from './LinkModal';
import { AboutModal } from './AboutModal';
import { RemediationModal } from './RemediationModal';

/** The floating pieces: right-click menu, deep-dive drawer and the modals. Rendered once per session (by the host). */
export function MeshOverlays(): JSX.Element {
  return (
    <>
      <ContextMenuOverlay />
      <DeepDiveDrawer />
      <LinkModal />
      <AboutModal />
      <RemediationModal />
    </>
  );
}
