/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreeDForceSampleDashboard } from './ThreeDForceSampleDashboard';

// Mock ForceGraph3DView to isolate dashboard logic tests
jest.mock('../force-graph-3d/ForceGraph3DView', () => {
  return function MockForceGraph3DView() {
    return <div data-testid="mock-force-graph-3d-view">Mock 3D Force Graph</div>;
  };
});

describe('ThreeDForceSampleDashboard', () => {
  const mockAlertsData = {
    tenant: {
      alerts: {
        rows: [
          {
            id: 'alert-1',
            severity: 5,
            resource: { name: 'core-router-01' },
            sender: { name: 'Netcool-Probe' },
            team: 'NetworkOps',
            type: { classification: 'LinkDown' },
            summary: 'BGP Peer Session dropped'
          },
          {
            id: 'alert-2',
            severity: 4,
            resource: { name: 'db-server-02' },
            sender: { name: 'Instana-Agent' },
            team: 'DatabaseOps',
            type: { classification: 'HighLatency' },
            summary: 'DB Query latency > 500ms'
          }
        ]
      }
    }
  };

  const mockStoriesData = {
    tenant: {
      stories: {
        rows: [
          {
            id: 'story-1',
            title: 'Critical Outage on Core Backbone',
            priority: 1,
            state: 'In Progress'
          }
        ]
      }
    }
  };

  it('renders dashboard with header, KPIs, and embedded 3D force graph', () => {
    render(
      <ThreeDForceSampleDashboard
        alertsData={mockAlertsData}
        storiesData={mockStoriesData}
      />
    );

    expect(screen.getByText('3D Force Directed Alert Topology Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 Critical')).toBeInTheDocument();
    expect(screen.getByTestId('mock-force-graph-3d-view')).toBeInTheDocument();
  });

  it('switches tabs between Cluster Hubs, Resources, Incidents, and Alerts', () => {
    render(
      <ThreeDForceSampleDashboard
        alertsData={mockAlertsData}
        storiesData={mockStoriesData}
      />
    );

    // Initial tab: Hubs
    expect(screen.getByText('Netcool-Probe')).toBeInTheDocument();
    expect(screen.getByText('Instana-Agent')).toBeInTheDocument();

    // Switch to Resources tab
    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
    expect(screen.getByText('core-router-01')).toBeInTheDocument();
    expect(screen.getByText('db-server-02')).toBeInTheDocument();

    // Switch to Incidents tab
    fireEvent.click(screen.getByRole('button', { name: /Incidents/ }));
    expect(screen.getByText('Critical Outage on Core Backbone')).toBeInTheDocument();

    // Switch to Alerts tab
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('BGP Peer Session dropped')).toBeInTheDocument();
  });

  it('allows switching clustering presets', () => {
    render(
      <ThreeDForceSampleDashboard
        alertsData={mockAlertsData}
        storiesData={mockStoriesData}
      />
    );

    const teamSourceBtn = screen.getByText('Team & Source');
    fireEvent.click(teamSourceBtn);
    expect(teamSourceBtn).toHaveClass('active');
  });
});
