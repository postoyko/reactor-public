/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A short guided tour: spotlights one part of the Designer at a time with a sentence about it.
 * Elements are found by data-tour="…"; a step whose element is not on screen is skipped.
 */

import React, { useEffect, useLayoutEffect, useState } from 'react';

interface Step { target?: string; title: string; text: string; key?: boolean }
const STEPS: Step[] = [
  { title: 'Welcome', text: 'This takes a minute. You will see where everything is, then you can build.' },
  { target: 'templates', title: 'Start from a template', text: 'Nineteen starters built like real operations screens: a title band, headline figures, charts, and a work queue. Pick one and change anything. Open this any time to start again (Undo brings your old canvas back).' },
  { target: 'library', title: '1. Add widgets', text: 'Click a widget to add it, or drag it onto the canvas, or straight into a tab, section or container. Search finds anything (press /).' },
  { target: 'canvas', title: '2. Arrange', text: 'Drag a widget by its title bar, resize from the corner. Containers (Tabs, Accordion, Split pane, Carousel, Scroll pane, Toolbar) hold other widgets: drop onto them.' },
  { target: 'settings', title: '3. Make it yours', text: 'Select a widget and this panel shows its data, look, colours and what happens when you click it (filter others, show rows, open an address).' },
  { target: 'filters', key: true, title: 'Filter bar and time range', text: 'This is the most important control on a dashboard. One strip at the top narrows every widget at once: pick the fields people filter by (severity, team, type…), a time range and auto-refresh. Without it, people cannot slice what they see. Turn it on for every dashboard you share; a widget can opt out in its own settings.' },
  { target: 'wire', title: '4. Wire it up', text: 'Wire mode shows a port on every widget that can filter others. Drag from it to the widgets it should drive. Click a line for its menu.' },
  { target: 'mode', title: '5. Preview', text: 'Preview shows exactly what your users will see. Switch back to Edit any time.' },
  { title: 'You are set', text: 'Reopen this tour from the ⋯ menu whenever you like.' }
];

const KEY = 'db-tour-v1';
export const tourSeen = (): boolean => { try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
const markSeen = () => { try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* no storage */ } };

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const find = (s: Step) => (s.target ? document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`) : null);
  const step = STEPS[i];

  const finish = () => { markSeen(); onClose(); };
  const go = (d: number) => {
    let n = i + d;
    while (n > 0 && n < STEPS.length - 1 && STEPS[n].target && !find(STEPS[n])) n += d;
    if (n < 0) return;
    if (n >= STEPS.length) { finish(); return; }
    setI(n);
  };

  useLayoutEffect(() => {
    const measure = () => {
      const el = find(step);
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox({ l: r.left, t: r.top, w: r.width, h: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 400);
    return () => { window.removeEventListener('resize', measure); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = 340;
  let left = vw / 2 - cardW / 2, top = vh / 2 - 90;
  if (box) {
    const right = box.l + box.w + 16;
    left = right + cardW < vw ? right : Math.max(box.l - cardW - 16, 16);
    if (box.w > vw * 0.6 || left < 16) { left = Math.min(Math.max(box.l + box.w / 2 - cardW / 2, 16), vw - cardW - 16); top = Math.min(box.t + 80, vh - 240); } else top = Math.min(Math.max(box.t + 16, 16), vh - 240);
  }
  const last = i === STEPS.length - 1;
  return (
    <div className="db-tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      {box ? <div className="db-tour-spot" style={{ left: box.l - 4, top: box.t - 4, width: box.w + 8, height: box.h + 8 }} /> : <div className="db-tour-dim" />}
      <div className={`db-tour-card${step.key ? ' is-key' : ''}`} style={{ left, top, width: cardW }}>
        <div className="db-tour-n">{i + 1} of {STEPS.length}{step.key && <span className="db-tour-key">Key feature</span>}</div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="db-tour-b">
          <button type="button" className="db-link" onClick={finish}>{last ? 'Close' : 'Skip'}</button>
          <span>
            {i > 0 && <button type="button" className="db-tb" onClick={() => go(-1)}>Back</button>}
            <button type="button" className="db-tb db-tb-primary" onClick={() => (last ? finish() : go(1))} autoFocus>{last ? 'Start building' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
