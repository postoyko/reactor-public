/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ForceGraph3DView from './ForceGraph3DView';
import mockAlerts from '../../mocks/alerts.json';
import generateSyntheticAlerts from '../../helpers/generateSyntheticAlerts';

export default {
  title: '3D force graph',
  component: ForceGraph3DView,
  argTypes: {
    maxNodes: { control: { type: 'number', min: 10, step: 100 } },
    linkBy: { control: 'check', options: ['sender.name', 'team', 'type.classification'] }
  }
};

const frame = (children: React.ReactNode) => <div style={{ height: '80vh' }}>{children}</div>;

export const Default = (args: any) => frame(<ForceGraph3DView {...args} data={mockAlerts.data} refetch={() => {}} />);
Default.args = { maxNodes: 1500, linkBy: ['sender.name', 'type.classification'] };

export const ByTeam = () => frame(<ForceGraph3DView data={mockAlerts.data} linkBy={['team']} refetch={() => {}} />);

/** ~1k resources: exercises the balanced quality tier. */
export const Medium = () => frame(<ForceGraph3DView data={generateSyntheticAlerts(1000)} refetch={() => {}} />);

/** ~8k resources: exercises the performance tier (no particles, low-poly nodes). */
export const Large = () => frame(<ForceGraph3DView data={generateSyntheticAlerts(8000)} maxNodes={8000} refetch={() => {}} />);

export const Loading = () => frame(<ForceGraph3DView loading refetch={() => {}} />);

export const ErrorState = () => frame(<ForceGraph3DView error={{ message: 'The alert query failed.' }} refetch={() => {}} />);

export const WebGLUnavailable = () => frame(<ForceGraph3DView data={mockAlerts.data} forceFallback refetch={() => {}} />);
