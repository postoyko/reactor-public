/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useMeshUiState } from './useMeshUiState';
import { useMeshAnalysis } from './useMeshAnalysis';

export function useReplayDriver(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshAnalysis>) {
  const { isHost, blastDistances, replay, replayTimeDomain, setReplay } = m;
  // Play: advance the replay position until the end.
  // Only the host drives the replay, so several tiles do not each start a timer.
  useEffect(() => {
    if (!isHost || !replay.playing) return undefined;
    const timer = window.setInterval(() => {
      setReplay(r => {
        if (!r.playing) return r;
        const pos = Math.min(1, r.pos + 0.006);
        return { ...r, pos, playing: pos < 1 };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [isHost, replay.playing]);
  // A replay mode whose data disappeared (selection cleared, data refreshed) switches itself off.
  useEffect(() => {
    if (!isHost) return;
    if ((replay.mode === 'time' && !replayTimeDomain) || (replay.mode === 'blast' && !blastDistances)) {
      setReplay({ mode: 'off', pos: 0, playing: false });
    }
  }, [isHost, replay.mode, replayTimeDomain, blastDistances]);

}
