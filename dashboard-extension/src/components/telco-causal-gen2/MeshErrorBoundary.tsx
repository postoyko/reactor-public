/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, InlineNotification } from '@carbon/react';

// ── Error boundary ────────────────────────────────────────────────────────────

export interface BoundaryState {
  error: Error | null;
}

export class MeshErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="telco-causal-gen2-container">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Telco Causal Mesh could not be displayed"
            subtitle={this.state.error.message}
          />
          <Button size="sm" kind="tertiary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
