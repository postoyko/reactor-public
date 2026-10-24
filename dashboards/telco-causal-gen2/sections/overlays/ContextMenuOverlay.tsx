/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ClampedMenu, Portal } from '../../Overlay';
import { CenterToFit, Launch, Play, Search } from '@carbon/icons-react';
import { useMesh } from '../../MeshContext';

export function ContextMenuOverlay(): JSX.Element {
  const { contextMenu, handleFocusNode, handleOpenDeepDive, handleOpenRemediationModal, netcoolWebGuiUrl, setContextMenu } = useMesh();
  return (
    <>
      {contextMenu && (
        <Portal>
        <ClampedMenu className="context-menu-popover" x={contextMenu.x} y={contextMenu.y}>
          <div className="menu-header">NE: {contextMenu.node.name}</div>
          <div className="menu-item" onClick={() => handleFocusNode(contextMenu.node)}>
            <CenterToFit size={14} /> Fly-To &amp; Focus 3D Node
          </div>
          <div className="menu-item" onClick={() => handleOpenDeepDive(contextMenu.node)}>
            <Search size={14} /> Open Deep Dive Diagnostics
          </div>
          {netcoolWebGuiUrl && (
            <div
              className="menu-item"
              onClick={() => {
                window.open(netcoolWebGuiUrl, '_blank', 'noopener,noreferrer');
                setContextMenu(null);
              }}
            >
              <Launch size={14} /> View in Netcool / WebGUI
            </div>
          )}
          <div
            className="menu-item"
            onClick={() => {
              if (contextMenu.node.alerts[0]) handleOpenRemediationModal(contextMenu.node.alerts[0]);
              setContextMenu(null);
            }}
          >
            <Play size={14} /> Open Remediation Console
          </div>
        </ClampedMenu>
        </Portal>
      )}
    </>
  );
}
