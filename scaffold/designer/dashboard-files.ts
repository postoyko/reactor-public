/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Export a dashboard as a JSON file, and read one back. Checking what is read is store.ts's job (importJson).
 */

import { exportJson, importJson } from './store';
import { Dashboard } from './types';

/** Downloads the dashboard as `<name>.json`. Throws when the browser blocks the download. */
export function downloadDashboard(d: Dashboard): void {
  const blob = new Blob([exportJson(d)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'dashboard'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a dashboard file; `done` gets what importJson made of it, or an error when the file cannot be read. */
export function readDashboardFile(file: File, done: (r: ReturnType<typeof importJson>) => void): void {
  const reader = new FileReader();
  reader.onload = () => done(importJson(String(reader.result || '')));
  reader.onerror = () => done({ error: 'The file could not be read.' });
  reader.readAsText(file);
}
