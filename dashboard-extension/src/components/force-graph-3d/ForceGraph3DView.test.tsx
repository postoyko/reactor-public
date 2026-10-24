/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { fireEvent, render, screen } from '@testing-library/react';
import mockAlerts from '../../mocks/alerts.json';
import ForceGraph3DView from './ForceGraph3DView';
import * as webgl from './webgl';

// @ts-ignore
import getReactRenderer from '@ibm/akora-renderer-react';

// WebGL is unavailable in jsdom, so the library is replaced with a stub that exposes its props.
const mockLibProps: { current: any } = { current: null };
const mockCanvas: { current: any } = { current: null };
jest.mock('react-force-graph-3d', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      mockLibProps.current = props;
      const canvas = React.useMemo(() => {
        mockCanvas.current = document.createElement('canvas');
        return mockCanvas.current;
      }, []);
      React.useImperativeHandle(ref, () => ({
        pauseAnimation: jest.fn(),
        resumeAnimation: jest.fn(),
        zoomToFit: jest.fn(),
        d3Force: (): any => null,
        d3ReheatSimulation: jest.fn(),
        renderer: () => ({ setPixelRatio: jest.fn(), dispose: jest.fn(), forceContextLoss: jest.fn(), domElement: canvas })
      }));
      return <div data-testid='lib-stub' />;
    })
  };
});

// @ts-ignore
const { AkoraStateProvider } = getReactRenderer(React, ReactDOM).components;

const replaceRoute = jest.fn();
const withAkora = (component: React.ReactElement) => (
  <AkoraStateProvider
    value={{
      app: { replaceRoute, resolvePathExpression: (p: string) => p, getStateForPath: () => ({ title: 'Graph' }) },
      state: { clientConfiguration: { publicurl: 'https://someurl.com' }, fullPath: '/somepath', path: '/somepath' }
    }}>
    {component}
  </AkoraStateProvider>
);

describe('ForceGraph3DView', () => {
  beforeEach(() => {
    replaceRoute.mockClear();
    mockLibProps.current = null;
    jest.spyOn(webgl, 'detectWebGL').mockReturnValue({ supported: true, version: 2 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders graph stats and hands nodes and links to the WebGL renderer', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    expect(screen.getByTestId('lib-stub')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/resources/);
    expect(screen.getByRole('status')).toHaveTextContent('WebGL 2');
    const { graphData, rendererConfig } = mockLibProps.current;
    expect(graphData.nodes.length).toBeGreaterThan(0);
    expect(graphData.links.length).toBeGreaterThan(0);
    expect(rendererConfig.powerPreference).toBe('high-performance');
  });

  it('applies an alert-list filter when a node is clicked and clears it on second click', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const node = mockLibProps.current.graphData.nodes.find((n: any) => n.kind === 'resource');
    React.act(() => mockLibProps.current.onNodeClick(node));
    expect(replaceRoute).toHaveBeenCalledTimes(1);
    expect(replaceRoute.mock.calls[0][0]).toContain('filterwhereclause');
    expect(screen.getByRole('region', { name: 'Selected node' })).toHaveTextContent(node.name);
    React.act(() => mockLibProps.current.onNodeClick(node));
    expect(screen.queryByRole('region', { name: 'Selected node' })).not.toBeInTheDocument();
  });

  it('lifts the alert-list filter when the background is clicked or the selection is cleared', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const node = mockLibProps.current.graphData.nodes.find((n: any) => n.kind === 'resource');
    React.act(() => mockLibProps.current.onNodeClick(node));
    expect(replaceRoute).toHaveBeenCalledTimes(1);
    React.act(() => mockLibProps.current.onBackgroundClick());
    expect(replaceRoute).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('region', { name: 'Selected node' })).not.toBeInTheDocument();
    // a background click with nothing selected must not touch the route
    React.act(() => mockLibProps.current.onBackgroundClick());
    expect(replaceRoute).toHaveBeenCalledTimes(2);
  });

  it('keeps the canvas mounted and the camera live when the layout is frozen', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const before = mockLibProps.current.cooldownTicks;
    expect(before).toBeGreaterThan(0);
    fireEvent.click(document.getElementById('force-graph-3d-pause') as HTMLElement);
    expect(screen.getByTestId('lib-stub')).toBeInTheDocument();
    expect(mockLibProps.current.cooldownTicks).toBe(0);
  });

  it('keeps node layout across a data refresh', () => {
    const { rerender } = render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const first = mockLibProps.current.graphData.nodes;
    first.forEach((n: any, i: number) => Object.assign(n, { x: i + 1, y: i + 2, z: i + 3 }));
    rerender(withAkora(<ForceGraph3DView data={{ tenant: { alerts: { ...mockAlerts.data.tenant.alerts } } }} refetch={() => {}} />));
    const next = mockLibProps.current.graphData.nodes;
    expect(next).not.toBe(first);
    expect(next[0].x).toBe(first[0].x);
    expect(next[0].z).toBe(first[0].z);
  });

  it('survives a GPU context loss without unmounting the canvas and rebuilds on restore', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const canvas = mockCanvas.current;
    const lost = new Event('webglcontextlost', { cancelable: true });
    React.act(() => { canvas.dispatchEvent(lost); });
    // preventDefault is what allows the browser to restore the context later
    expect(lost.defaultPrevented).toBe(true);
    expect(screen.getByText(/GPU context was lost/)).toBeInTheDocument();
    // the canvas has to stay mounted, otherwise a restored event could never fire
    expect(screen.getByTestId('lib-stub')).toBeInTheDocument();
    expect(mockCanvas.current).toBe(canvas);

    React.act(() => { canvas.dispatchEvent(new Event('webglcontextrestored')); });
    expect(screen.queryByText(/GPU context was lost/)).not.toBeInTheDocument();
    expect(mockCanvas.current).not.toBe(canvas); // remounted with a fresh renderer
  });

  it('filters by search text', () => {
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    const before = mockLibProps.current.graphData.nodes.length;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'generated-1' } });
    expect(mockLibProps.current.graphData.nodes.length).toBeLessThan(before);
  });

  it('shows a ranked list instead of the canvas when WebGL is unavailable', () => {
    jest.spyOn(webgl, 'detectWebGL').mockReturnValue({ supported: false, version: 0, reason: 'No GPU' });
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={() => {}} />));
    expect(screen.queryByTestId('lib-stub')).not.toBeInTheDocument();
    expect(screen.getByText('3D view unavailable')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows loading, error and empty states', () => {
    const { rerender } = render(withAkora(<ForceGraph3DView loading refetch={() => {}} />));
    expect(screen.queryByTestId('lib-stub')).not.toBeInTheDocument();

    rerender(withAkora(<ForceGraph3DView error={{ message: 'boom' }} refetch={() => {}} />));
    expect(screen.getByText('Unable to load alerts')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();

    rerender(withAkora(<ForceGraph3DView data={{ tenant: { alerts: { rows: [], columns: [] } } }} refetch={() => {}} />));
    expect(screen.getByText('No open alerts to graph.')).toBeInTheDocument();
  });

  it('refetches when the console posts an alerts refresh message', () => {
    const refetch = jest.fn();
    render(withAkora(<ForceGraph3DView data={mockAlerts.data} refetch={refetch} />));
    window.dispatchEvent(new MessageEvent('message', { data: 'alertsrefresh', origin: 'https://someurl.com' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new MessageEvent('message', { data: 'alertsrefresh', origin: 'https://evil.example' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
