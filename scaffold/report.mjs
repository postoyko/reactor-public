/**
 * "Check this dashboard": a read-only report on how far a hand-written (or AI-written) dashboard can be taken apart
 * into components automatically, and what would need a person. Nothing is changed. Uses the same analysis as
 * "Make splittable" (split.mjs) plus plain source checks for the things that most often make a dashboard hard to reuse.
 */
import fs from 'fs';
import path from 'path';

const SRC = /\.(tsx?|jsx?|mjs)$/;
const walk = (dir, out = []) => {
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out); else if (SRC.test(n) && !/\.test\./.test(n) && n !== 'split-runtime.tsx') out.push(p);
  }
  return out;
};

export function buildReport(dir, inspect) {
  const files = walk(dir);
  const texts = files.map(f => [path.relative(dir, f), fs.readFileSync(f, 'utf8')]);
  const all = texts.map(t => t[1]).join('\n');
  const findings = [];
  const add = (level, title, detail, where) => findings.push({ level, title, detail, where: where || undefined });
  const hit = re => texts.filter(([, t]) => re.test(t)).map(([n]) => n);

  const tenant = hit(/tenant(Id)?['"]?\s*[:=]\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i);
  if (tenant.length) add('warn', 'A tenant ID is written into the code', 'It will only work on that one tenant. Read it from the page or a setting instead.', tenant.join(', '));
  const keys = hit(/process\.env\.\w*(KEY|TOKEN|SECRET|PASSWORD)\w*|['"](x-api-key|api[-_]?key|apikey)['"]\s*:/i);
  if (keys.length) add('bad', 'An API key or secret is used in the code', 'Keys written into a browser bundle can be read by anyone who opens the page. Use the signed-in session (window.akoraConfig API) instead, and rotate any key that was shipped.', keys.join(', '));
  const rest = hit(/fetch\(\s*[`'"][^`'"]*\/aiops\/api\//);
  if (rest.length) add('info', 'Calls Concert REST endpoints directly', 'Fine inside Concert Operate (the session cookie is used). It will not work in Studio preview without the sample stub.', rest.join(', '));
  const bridge = hit(/akoraConfig\??\.baseState/);
  if (bridge.length) add('good', 'Uses the signed-in session API', 'window.akoraConfig.baseState.API is the data path the Designer uses too.', bridge.join(', '));
  const hosts = hit(/https?:\/\/(?!www\.w3\.org|localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}\/(?!\*)/i).filter(n => !/\.(scss|css|md)$/.test(n));
  const abs = hosts.filter(n => /\b(fetch|axios|XMLHttpRequest)\b/.test(texts.find(t => t[0] === n)[1]) && /fetch\(\s*[`'"]https?:\/\//.test(texts.find(t => t[0] === n)[1]));
  if (abs.length) add('warn', 'Fetches from an absolute web address', 'A fixed host will not follow the cluster the dashboard is installed on.', abs.join(', '));
  const consoleLogs = (all.match(/console\.(log|debug)\(/g) || []).length;
  if (consoleLogs > 5) add('info', `${consoleLogs} console.log calls`, 'Worth removing before shipping.');

  const a = inspect && inspect.a;
  const main = a && a.ok ? a.main : null;
  let sections = [], mainInfo = null;
  if (a && a.ok) {
    const fnText = main.fn.getText();
    const hooks = (fnText.match(/\buse[A-Z]\w*\(/g) || []).length;
    const states = (fnText.match(/\buseState\b/g) || []).length;
    mainInfo = { name: a.name, lines: fnText.split('\n').length, hooks, states };
    sections = a.sections.map(s => ({ id: s.id, label: s.label, widget: s.suggest ? s.suggest.items.map(i => ({ type: i[0], title: i[1], query: i[2] && i[2].query, field: i[2] && (i[2].groupBy || i[2].valueField), note: i[3] && i[3].note })) : null, note: s.suggest && s.suggest.note || undefined }));
    if (hooks > 25) add('info', `The main component has ${hooks} hooks`, 'Everything shares one state. Splitting still works (one shared instance), but each tile mounts the whole thing.');
  }

  let verdict, next;
  const st = a && a.status;
  if (!a) { verdict = 'unknown'; next = 'No component file (.tsx) was found in this folder.'; }
  else if (st === 'split' || st === 'native') { verdict = 'ready'; next = 'It already supports parts. Open Design and drag its sections onto a page, or use "Convert to widgets" where offered.'; }
  else if (a.ok) {
    const withW = sections.filter(s => s.widget).length;
    if (withW >= Math.ceil(sections.length / 2)) { verdict = 'mostly-automatic'; next = `Make splittable turns it into ${sections.length} tiles. ${withW} of them can also be converted to editable widgets; check each guess in Design.`; }
    else { verdict = 'sections-only'; next = `Make splittable gives ${sections.length} tiles, but only ${withW} can be turned into editable widgets. The rest stay as fixed sections. Rebuilding the rest as components is manual work.`; }
  } else { verdict = 'manual'; next = 'It cannot be split automatically. Either restructure it to the authoring contract (DASHBOARD-CONTRACT.md) or ask for it to be rebuilt as components by hand.'; }

  return {
    dir: path.basename(dir), verdict, status: st || 'unsupported', reason: a && !a.ok ? a.reason : '', next,
    component: inspect && inspect.f, main: mainInfo, sections, findings,
    files: files.length, lines: all.split('\n').length
  };
}
