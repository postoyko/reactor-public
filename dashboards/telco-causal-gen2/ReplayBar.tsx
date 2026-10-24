/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Replay controls for the topology view. Two modes, both driven by real data:
 *  - Incident timeline: elements appear in the order their first alert occurred.
 *  - Blast shockwave: from the selected element outward, one topology hop at a time.
 */

import React from 'react';
import { Button } from '@carbon/react';
import { Play, Pause, Reset } from '@carbon/icons-react';

export type ReplayMode = 'off' | 'time' | 'blast';

export interface ReplayState {
  mode: ReplayMode;
  /** 0..1 */
  pos: number;
  playing: boolean;
}

interface Props {
  state: ReplayState;
  onChange: (next: ReplayState) => void;
  /** Shown next to the slider, e.g. a clock time or "hop 2 of 4". */
  position?: string;
  /** e.g. "12 of 40 elements reporting". */
  summary?: string;
  /** Why a mode cannot be used right now (the button is disabled and shows this on hover). */
  timeDisabledReason?: string;
  blastDisabledReason?: string;
}

export default function ReplayBar({ state, onChange, position, summary, timeDisabledReason, blastDisabledReason }: Props) {
  const setMode = (mode: ReplayMode) => onChange({ mode, pos: 0, playing: false });
  const active = state.mode !== 'off';
  return (
    <div className={`replay-bar${active ? ' active' : ''}`}>
      <div className="replay-modes" role="group" aria-label="Replay mode">
        <span className="replay-label">Replay:</span>
        <Button size="sm" kind={state.mode === 'off' ? 'primary' : 'ghost'} onClick={() => setMode('off')}>Off</Button>
        <Button size="sm" kind={state.mode === 'time' ? 'primary' : 'ghost'} disabled={Boolean(timeDisabledReason)} title={timeDisabledReason || 'Elements appear in the order their first alert occurred'} onClick={() => setMode('time')}>
          Incident timeline
        </Button>
        <Button size="sm" kind={state.mode === 'blast' ? 'primary' : 'ghost'} disabled={Boolean(blastDisabledReason)} title={blastDisabledReason || 'Expand hop by hop from the selected element'} onClick={() => setMode('blast')}>
          Blast shockwave
        </Button>
      </div>

      {active && (
        <div className="replay-transport">
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={state.playing ? Pause : Play}
            iconDescription={state.playing ? 'Pause' : 'Play'}
            onClick={() => onChange({ ...state, pos: state.pos >= 1 ? 0 : state.pos, playing: !state.playing })}
          />
          <Button size="sm" kind="ghost" hasIconOnly renderIcon={Reset} iconDescription="Restart" onClick={() => onChange({ ...state, pos: 0, playing: false })} />
          <input
            className="replay-slider"
            type="range"
            min={0}
            max={1000}
            value={Math.round(state.pos * 1000)}
            aria-label="Replay position"
            onChange={e => onChange({ ...state, pos: Number(e.target.value) / 1000, playing: false })}
          />
          <span className="replay-position">{position}</span>
          <span className="replay-summary">{summary}</span>
        </div>
      )}
    </div>
  );
}
