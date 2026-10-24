/**
 * Read-only proxy to the ASM topology service (its own OpenShift route, Basic auth, X-TenantID header).
 * Dashboards inside Concert Operate cannot call that route directly (other origin, no credentials), so Studio
 * holds the address and credentials and forwards a short allow-list of GET requests.
 *
 * Config precedence: environment (TOPO_HOST, TENANT, ASM_USER, ASM_PASS) over the saved file .studio/topology.json (mode 0600).
 * The password is never sent back to any page.
 */

import fs from 'fs';
import path from 'path';

export function createTopology({ rootDir, runTool }) {
  const dir = path.join(rootDir, '.studio'), file = path.join(dir, 'topology.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } };
  // Starting values taken from the Swagger page and the extract script you supplied; anything saved in Studio wins.
  const defaults = (() => { try { return JSON.parse(fs.readFileSync(new URL('./topology.defaults.json', import.meta.url), 'utf8')); } catch (e) { return {}; } })();
  const cfg = () => {
    const f = { ...defaults, ...read() };
    return {
      host: (process.env.TOPO_HOST || f.host || '').replace(/\/+$/, ''),
      tenant: process.env.TENANT || f.tenant || '',
      user: process.env.ASM_USER || f.user || '',
      pass: process.env.ASM_PASS || f.pass || '',
      origins: Array.isArray(f.origins) ? f.origins : []
    };
  };

  /** What a page may see: no password. */
  function publicConfig() {
    const c = cfg();
    return { host: c.host, tenant: c.tenant, user: c.user, hasPassword: !!c.pass, origins: c.origins, ready: !!(c.host && c.tenant && c.user && c.pass), file: path.relative(rootDir, file) };
  }

  function save(b) {
    const cur = read(), next = { ...cur };
    const clean = s => String(s == null ? '' : s).trim();
    if (b.host !== undefined) { const h = clean(b.host).replace(/\/+$/, '').replace(/\/1\.0\/topology$/, ''); if (h && !/^https?:\/\/[^\s/]+$/i.test(h)) throw new Error('Host must look like https://aiops-topology-topology.apps.<cluster> (no path).'); next.host = h; }
    if (b.tenant !== undefined) next.tenant = clean(b.tenant);
    if (b.user !== undefined) next.user = clean(b.user);
    if (b.pass) next.pass = String(b.pass);
    if (b.origins !== undefined) {
      next.origins = String(Array.isArray(b.origins) ? b.origins.join(',') : b.origins).split(/[,\s]+/).filter(Boolean).map(o => { try { const u = new URL(o); return u.origin; } catch (e) { throw new Error(`"${o}" is not an origin such as https://cpd-aiops.apps.example.com`); } });
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch (e) { /* windows */ }
    return publicConfig();
  }

  /** Reads the same secret the ASM tools use. Needs `oc` logged in. */
  async function fromOc(namespace = 'aiops') {
    const get = async k => (await runTool('oc', ['get', 'secret', 'aiops-topology-asm-credentials', '-n', namespace, '-o', `jsonpath={.data.${k}}`])).stdout.trim();
    const user = Buffer.from(await get('username'), 'base64').toString('utf8'), pass = Buffer.from(await get('password'), 'base64').toString('utf8');
    if (!user || !pass) throw new Error('The secret aiops-topology-asm-credentials has no username/password.');
    return save({ user, pass });
  }

  // Only these read-only GETs are forwarded.
  const ALLOWED = [/^\/resources$/, /^\/resources\/[A-Za-z0-9_\-,]+$/, /^\/resources\/[A-Za-z0-9_\-,]+\/(references|groups|history|origin)$/, /^\/resources\/[A-Za-z0-9_\-,]+\/references\/(in|out|both)(\/[A-Za-z0-9_.\-]+)?$/, /^\/topology\/[A-Za-z0-9_\-]+$/, /^\/types$/];
  const allowedPath = p => ALLOWED.some(r => r.test(p));

  async function get(p, search) {
    const c = cfg();
    if (!(c.host && c.tenant && c.user && c.pass)) return { status: 503, body: JSON.stringify({ error: 'The topology proxy is not configured. Open Studio, Bundled dashboards, Topology proxy.' }) };
    if (!allowedPath(p)) return { status: 403, body: JSON.stringify({ error: 'Path not allowed' }) };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(`${c.host}/1.0/topology${p}${search || ''}`, { signal: ctl.signal, headers: { 'X-TenantID': c.tenant, Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${c.user}:${c.pass}`).toString('base64') } });
      const text = await r.text();
      if (text.length > 20 * 1024 * 1024) return { status: 413, body: JSON.stringify({ error: 'Response too large; narrow the query with _limit / _field.' }) };
      return { status: r.status, body: text, type: r.headers.get('content-type') || 'application/json' };
    } catch (e) {
      return { status: 502, body: JSON.stringify({ error: `Could not reach the topology service: ${e && e.cause && e.cause.code ? e.cause.code : e.message}` }) };
    } finally { clearTimeout(t); }
  }

  async function test() {
    const r = await get('/resources', '?_limit=1&_field=_id&_field=name');
    let n; try { n = JSON.parse(r.body); } catch (e) { n = null; }
    return { status: r.status, ok: r.status === 200, sample: n && n._items ? n._items[0] : undefined, error: r.status === 200 ? undefined : (n && (n.error || (n._error && n._error.message) || n.message)) || r.body.slice(0, 200) };
  }

  return { publicConfig, save, fromOc, get, test, cfg, allowedPath };
}
