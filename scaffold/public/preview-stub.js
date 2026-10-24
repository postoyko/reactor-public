/**
 * Sample data for the Layout Editor's live preview. Loaded inside the preview frame before the dashboard code.
 *
 * It stands in for Concert Operate: window.akoraConfig.baseState.API.contentAnalyticsAPI (getAlerts, getStories,
 * getFilters, ...) and the REST paths /aiops/api/v2/alerts and /incidents. The answers are built from the columns the
 * dashboard asks for, so a dashboard that adds a column gets a value for it. Everything here is invented, and the
 * preview says so.
 */
(function () {
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  // The tenant's teams and people. Alerts and incidents take their team and owner from here, and getUsersAndGroups returns the same lists.
  var GROUPS = ['SRE', 'Platform', 'Payments'];
  var USERS = ['alex', 'sam'];
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  var NOW = Date.now(), H = 3600e3;
  var SERVICES = [['payments', 'Digital Microservices'], ['orders', 'Digital Microservices'], ['postgres', 'Database & Storage'], ['kafka', 'Messaging'], ['ingress', 'Platform'], ['openshift-node', 'Platform'], ['checkout-ui', 'Digital Microservices'], ['redis', 'Database & Storage']];
  var SENDERS = ['Prometheus', 'Instana', 'Netcool Probe', 'Dynatrace', 'Nagios', 'Log analysis'];
  var TYPES = ['Resource utilization', 'Availability', 'Latency', 'Error rate', 'Saturation', 'Configuration'];
  var SUMMARIES = ['CPU usage above threshold', 'Pod restarting repeatedly', 'Request latency p95 high', 'Connection pool exhausted', 'Disk usage at 91%', 'Consumer lag growing', '5xx rate above baseline', 'Health probe failing', 'Memory working set near limit'];
  var STATES = ['open', 'open', 'open', 'open', 'clear'];
  var N_INC = 9, N_ALERT = 140, TENANT = 'sample-tenant';

  var incidents = [];
  for (var i = 0; i < N_INC; i++) {
    var svc = SERVICES[i % SERVICES.length];
    incidents.push({ id: 'inc-' + (1000 + i), title: svc[0] + ': ' + pick(SUMMARIES).toLowerCase(), description: 'Sample incident ' + (i + 1), priority: 1 + (i % 5), state: pick(['inProgress', 'inProgress', 'open', 'resolved']), owner: pick([''].concat(USERS)), team: pick(GROUPS), createdTime: new Date(NOW - (2 + i * 2.2) * H).toISOString(), alertIds: [], insights: [] });
  }
  var alerts = [];
  for (var j = 0; j < N_ALERT; j++) {
    var s = SERVICES[Math.floor(rnd() * SERVICES.length)];
    var inc = rnd() < 0.7 ? incidents[Math.floor(rnd() * incidents.length)] : null;
    var first = NOW - rnd() * 23 * H;
    var a = { id: 'alert-' + (5000 + j), severity: pick([6, 5, 5, 4, 4, 4, 3, 3, 2, 1]), state: pick(STATES), summary: pick(SUMMARIES) + ' (' + s[0] + ')', 'type.classification': pick(TYPES), 'sender.name': pick(SENDERS), 'resource.name': s[0] + '-' + (1 + Math.floor(rnd() * 4)), firstOccurrenceTime: new Date(first).toISOString(), lastOccurrenceTime: new Date(first + rnd() * 3 * H).toISOString(), closedTime: '', owner: '', team: pick(GROUPS), acknowledged: rnd() < 0.2 ? 'true' : 'false', suppressed: 'false', runbook: rnd() < 0.3, inc: inc };
    if (a.state === 'clear') a.closedTime = a.lastOccurrenceTime;
    if (inc) inc.alertIds.push(a.id);
    alerts.push(a);
  }
  incidents.forEach(function (x) { if (!x.alertIds.length) { x.alertIds.push(alerts[0].id); } });

  function insightFor(col, a) {
    var t = (/type='([^']+)'/.exec(col) || [])[1] || '';
    var P = 'aiops.ibm.com/insight-type/';
    if (/relationship\/causal-union|relationship$/.test(t) || t === P + 'relationship') {
      var out = [];
      if (a.inc) { out.push({ type: P + 'relationship/causal-union', id: a.inc.id }); out.push({ type: P + 'relationship/causal', id: 'tmp-' + a.inc.id.slice(-2), source: P + 'causal/temporal' }); }
      return JSON.stringify(out);
    }
    var n = parseInt(a.id.replace(/\D/g, ''), 10);
    if (t === P + 'anomaly') return JSON.stringify(n % 5 === 0 ? [{ type: t, details: { metric: 'cpu' } }] : []);
    if (t === P + 'seasonal-occurrence') return JSON.stringify(n % 4 === 0 ? [{ type: t, details: {} }] : []);
    if (t === P + 'golden-signal') return JSON.stringify(n % 3 === 0 ? [{ type: t, details: { signal: ['latency', 'traffic', 'errors', 'saturation'][n % 4] } }] : []);
    if (t === P + 'lad/resolutions') return JSON.stringify(n % 6 === 0 ? [{ type: t, details: {} }] : []);
    if (t === P + 'lad/templates') return JSON.stringify(n % 6 === 0 ? [{ type: t, details: {} }] : []);
    if (t === P + 'topology/group') return JSON.stringify([{ type: t, details: { name: a['resource.name'].split('-')[0] + ' group' } }]);
    if (t === P + 'runbook') return JSON.stringify(a.runbook ? [{ id: 'rb-' + (n % 4), type: t, details: { name: 'Restart ' + a['resource.name'], url: 'https://example.invalid/runbook', runbookId: 'rb-' + (n % 4), policyId: 'pol-1', isAutomated: n % 2 === 0, mappings: [] } }] : []);
    if (t === P + 'topology/resource') return JSON.stringify([{ type: t, details: { uniqueId: 'sample-' + a['resource.name'], entityTypes: ['pod'] } }]);
    if (t === P + 'business/criticality') return JSON.stringify([{ type: t, details: { criticality: 1 + (a.severity % 3) } }]);
    if (/probable-cause/.test(t)) return JSON.stringify(a.inc ? [{ type: t, details: { id: a.id, rank: 1 + (a.severity % 3) } }] : []);
    return '[]';
  }

  function alertsResponse(opts) {
    var cols = (opts && opts.columns) || ['id'];
    var filter = String((opts && opts.filter) || '');
    var list = alerts.filter(function (a) {
      if (/state\s*!=\s*'clear'/.test(filter) || /state\s*=\s*'open'/.test(filter)) { if (a.state === 'clear') return false; }
      var m = /firstOccurrenceTime\s*>=\s*'([^']+)'/.exec(filter);
      if (m) { var cut = Date.parse(m[1]); if (Date.parse(a.firstOccurrenceTime) < cut && Date.parse(a.lastOccurrenceTime) < cut) return false; }
      return true;
    });
    var names = cols.indexOf('id') < 0 ? ['id'].concat(cols) : cols;
    return { tenant: { alerts: {
      columns: names.map(function (n) { return { name: n }; }),
      rows: list.map(function (a) {
        return { fields: names.map(function (n) {
          if (n.indexOf('@insights.type=') === 0) return insightFor(n, a);
          if (n === 'relatedStoryIds') return JSON.stringify(a.inc ? [a.inc.id] : []);
          if (n === 'relatedContextualStoryIds') return '[]';
          if (n === 'signature') return 'sig-' + a.summary.split(' (')[0].toLowerCase().replace(/\W+/g, '-') + '-' + a['resource.name'].split('-')[0];
          if (n === 'eventCount') return String(1 + parseInt(a.id.replace(/\D/g, ''), 10) % 7);
          var v = a[n]; return v === undefined || v === '' ? null : String(v);
        }) };
      })
    } } };
  }
  function storiesResponse() {
    return { tenant: { stories: { stories: incidents.map(function (x) {
      return { id: x.id, title: x.title, description: x.description, priority: x.priority, state: x.state, owner: x.owner || null, team: x.team, createdTime: x.createdTime, alertIds: x.alertIds, contextualAlertIds: [], insights: [] };
    }) } } };
  }
  var later = function (v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 120); }); };
  var api = {
    getAlerts: function (o) {
      var r = alertsResponse(o);
      if (o && o.storyId) { var inc = incidents.filter(function (x) { return x.id === o.storyId; })[0]; var ids = inc ? inc.alertIds : []; var at = r.tenant.alerts.columns.findIndex(function (c) { return c.name === 'id'; }); r.tenant.alerts.rows = r.tenant.alerts.rows.filter(function (row) { return ids.indexOf(row.fields[at]) >= 0; }); }
      return later(r);
    },
    getStories: function () { return later(storiesResponse()); },
    getImpactedApplications: function () {
      var APPS = [['Banking & Payments', 'application', 'Tier 1', 100], ['Digital Microservices', 'service', 'Tier 2', 70], ['Mainframe & IBM MQ', 'service', 'Tier 1', 100], ['OpenShift & Ingress', 'service', 'Tier 3', 40], ['Database & Storage', 'service', 'Tier 2', 70]];
      var items = APPS.map(function (ap, k) {
        var mine = alerts.filter(function (a) { return a.state !== 'clear' && (parseInt(a.id.replace(/\D/g, ''), 10) % APPS.length) === k; });
        var c = function (sv) { return mine.filter(function (a) { return a.severity === sv; }).length || null; };
        var pr = {}; incidents.forEach(function (x, i) { if (i % APPS.length === k && x.state !== 'resolved') pr[x.priority] = (pr[x.priority] || 0) + 1; });
        return { id: 'app-' + k, name: ap[0], iconId: ap[1], count: mine.length, highestPriorityStory: null, severityCounts: { critical: c(6), major: c(5), minor: c(4), warning: c(3) }, storyPriorityCounts: pr, businessCriticality: { name: ap[2], businessCriticalityValue: ap[3] } };
      });
      return later({ tenant: { impactedApplications: { items: items } } });
    },
    getRunbook: function (o) { var names = ['Restart the service', 'Clear the cache', 'Scale the deployment', 'Set default alert expiry']; var i = parseInt(String(o.runbookId).replace(/\D/g, ''), 10) || 0; return later({ tenant: { runbook: { id: o.runbookId, name: names[i % 4], description: '', canBeAutomated: true } } }); },
    getMetricGroups: function () { return later({ tenant: { metricGroups: { mIds: ['host', 'kafka', 'kubernetesNode', 'network'], available: 4, filtered: 4 } } }); },
    getMetrics: function () { return later({ tenant: { metrics: { mIds: ['required_cpu', 'required_cpu_percentage', 'required_mem_percentage'], available: 3, filtered: 3 } } }); },
    getMetricResources: function () { return later({ tenant: { resources: { mIds: ['worker0:::aaa', 'worker1:::bbb', 'master0:::ccc'], available: 3, filtered: 3 } } }); },
    getMetricManagerData: function (o) {
      var pts = []; var end = Math.floor(Date.now() / 300000) * 300000; var seed = String(o.resource).length;
      for (var i = 72; i >= 0; i--) { var ts = end - i * 300000; var base = 0.55 + 0.18 * Math.sin((ts / 3600000 + seed) * 1.3); var spike = i === 9 || i === 8; var v = base + (spike ? 0.35 : 0.02 * Math.sin(i)); pts.push({ timestamp: new Date(ts).toISOString(), value: v, min: base - 0.12, max: base + 0.12, expected: String(base), anomalous: spike, anomalyEndTimestamp: null }); }
      return later({ tenant: { metricManager: pts } });
    },
    getMetricForecastData: function (o) {
      var pts = []; var end = Math.floor(Date.now() / 300000) * 300000; var seed = String(o.resource).length;
      for (var i = 1; i <= 24; i++) { var ts = end + i * 300000; var base = 0.55 + 0.18 * Math.sin((ts / 3600000 + seed) * 1.3); pts.push({ timestamp: new Date(ts).toISOString(), value: null, min: base - 0.1, max: base + 0.1, expected: String(base), anomalous: null }); }
      return later({ tenant: { metricForecast: pts } });
    },
    getStoryAlertsInsights: function (o) {
      var inc = incidents.filter(function (x) { return x.id === o.storyId; })[0];
      var mine = inc ? inc.alertIds : [];
      return later({ tenant: { storyAlerts: mine.map(function (id, k) {
        var ins = [{ type: 'aiops.ibm.com/insight-type/deduplication-details', details: {} }];
        if (k < 3) ins.push({ type: 'aiops.ibm.com/insight-type/probable-cause', source: 'aiops.ibm.com/insight-source/probable-cause', details: { id: id, rank: k + 1, score: 90 - k * 15, severityScore: 60, classification: k === 0 ? 'cause' : 'unknown' } });
        return { id: id, insights: ins };
      }) } });
    },
    getSimilarIncidents: function (o) {
      return later({ tenant: { similarIncidents: { similar_incidents: [
        { incident_id: 'old-1', title: 'worker5 - High CPU', explanation: 'Based on similarity from query and incidents', url: 'https://example.invalid/INC0011820', score: 1.09, actions: [], resolution: 'Restarted the pod', started_at: '2026-05-02T10:00:00Z' },
        { incident_id: 'old-2', title: 'Subsystem interface error', explanation: 'Based on similarity from query and incidents', url: 'https://example.invalid/INC0010365', score: 0.96, actions: [], resolution: 'Closed after the queue was drained', started_at: '2026-04-11T09:30:00Z' }
      ] } } });
    },
    getRunbooksAndPolicy: function (o) {
      var names = ['Restart the service', 'Clear the cache', 'Scale the deployment', 'Set default alert expiry'];
      var ids = o.runbookIds || [];
      var runs = []; var k = 0;
      alerts.forEach(function (a) { if (a.runbook && k < 24) { var n = parseInt(a.id.replace(/\D/g, ''), 10); runs.push({ id: 'run-' + k, runbookId: 'rb-' + (n % 4), status: ['success', 'success', 'success', 'failure', 'inprogress'][k % 5], lastUpdated: new Date(Date.now() - k * 17 * 60000).toISOString(), context: 'alert:' + a.id + ',policy:pol-1' }); k++; } });
      return later({ tenant: { runbooks: ids.map(function (id) { return { id: id, name: names[(parseInt(String(id).replace(/\D/g, ''), 10) || 0) % 4], description: '', canBeAutomated: true }; }), runbookInstances: runs } });
    },
    runRunbook: function (o) { return later({ tenant: { runRunbook: { ok: true, runbookId: o.runbookId, alertId: o.alertId } } }); },
    getUsersAndGroups: function () { return later({ tenant: { groups: GROUPS.map(function (g) { return { id: 'grp-' + g.toLowerCase(), name: g }; }), users: USERS.map(function (u) { return { id: 'usr-' + u, name: u }; }) } }); },
    // Detail and configuration queries (Designer data sources). Shapes follow the toolkit's query list; values are invented.
    getIncidentAlerts: function (o) { var inc = incidents.filter(function (x) { return x.id === o.incidentId; })[0]; var r = alertsResponse({ columns: o.columns }); var ids = inc ? inc.alertIds : []; r.tenant.alerts.rows = r.tenant.alerts.rows.filter(function (row) { return ids.indexOf(row.fields[r.tenant.alerts.columns.findIndex(function (c) { return c.name === 'id'; })]) >= 0; }); return later({ tenant: { incident: r.tenant } }); },
    getStoryAlertsGroups: function (o) { return api.getIncidentAlerts({ incidentId: o.storyId, columns: o.columns }); },
    getRawAlerts: function (o) { return later({ tenant: { rawAlerts: alerts.slice(0, 60).map(function (a) { return { id: a.id, severity: a.severity, state: a.state, summary: a.summary, type: { classification: a['type.classification'] }, sender: { name: a['sender.name'] }, resource: { name: a['resource.name'] }, firstOccurrenceTime: a.firstOccurrenceTime, lastOccurrenceTime: a.lastOccurrenceTime }; }) } }); },
    getStoriesByAlerts: function () { return later({ tenant: { storiesByAlerts: storiesResponse().tenant.stories.stories.slice(0, 5) } }); },
    getRelatedStories: function (o) { return later({ tenant: { relatedStories: storiesResponse().tenant.stories.stories.filter(function (x) { return x.id !== o.storyId; }).slice(0, 3) } }); },
    getTopologyResource: function (o) { return later({ tenant: { topologyResource: { uniqueId: o.resourceId, name: String(o.resourceId).split(':')[0], entityTypes: ['pod'], tags: ['prod', 'eu-de'], matchTokens: [o.resourceId], vertexType: 'resource', createTime: new Date(NOW - 40 * H).toISOString() } } }); },
    getGroups: function () { return later({ tenant: { groups: [{ id: 'g-pay', name: 'Payments services', type: 'application', members: 12 }, { id: 'g-plat', name: 'Platform nodes', type: 'resourceGroup', members: 30 }, { id: 'g-db', name: 'Databases', type: 'resourceGroup', members: 6 }] } }); },
    getActions: function () { return later({ tenant: { actions: [{ id: 'act-1', name: 'Restart pod', type: 'script', target: 'kubernetes', enabled: true }, { id: 'act-2', name: 'Open ticket', type: 'integration', target: 'ServiceNow', enabled: true }, { id: 'act-3', name: 'Page on-call', type: 'notification', target: 'PagerDuty', enabled: false }] } }); },
    getTools: function () { return later({ tenant: { tools: [{ id: 't-1', name: 'Grafana', type: 'url', url: 'https://example.invalid/grafana' }, { id: 't-2', name: 'Kibana logs', type: 'url', url: 'https://example.invalid/kibana' }, { id: 't-3', name: 'Ping', type: 'script' }] } }); },
    getFiltersViews: function () { return later({ tenant: { filtersViews: [{ id: 'v-1', name: 'Critical only', viewType: 'alert', owner: 'alex', shared: true }, { id: 'v-2', name: 'My incidents', viewType: 'story', owner: 'sam', shared: false }] } }); },
    getPoliciesMetadata: function () { var names = ['Default alert repeat create guard policy', 'Close incidents when all alerts clear', 'Promote critical alerts to incidents', 'Suppress maintenance windows', 'Restart pod runbook policy']; return later({ tenant: { aiopsPolicies: names.map(function (n, i) { return { __typename: 'AIopsPolicy', id: 'pol-' + (i + 1), metadata: { __typename: 'AIopsPolicyMetadata', name: n } }; }) } }); },
    getStandingAlertCount: function () { return later({ tenant: { alertCount: { __typename: 'AlertCount', quantity: alerts.filter(function (a) { return a.state !== 'clear'; }).length } } }); },
    getStandingStoryCount: function () { return later({ tenant: { storyCount: { __typename: 'StoryCount', quantity: incidents.length } } }); },
    // Mutations: the preview changes nothing, it only answers.
    createIncidentMutation: function (o) { return later({ tenant: { createIncident: { id: 'inc-new-' + (o.alertIds || []).length } } }); },
    updateIncidentMutation: function () { return later({ tenant: { updateIncident: { ok: true } } }); },
    activatePolicy: function () { return later({ ok: true }); },
    setPolicyLock: function () { return later({ ok: true }); },
    setPolicyDeployed: function () { return later({ ok: true }); },
    rejectPolicy: function () { return later({ ok: true }); },
    restorePolicy: function () { return later({ ok: true }); },
    renamePolicy: function () { return later({ ok: true }); },
    getFilters: function () { return later({ tenant: { filters: [{ name: 'Sample: critical only', conditionSet: { operator: 'and', conditions: [] } }, { name: 'Sample: platform', conditionSet: { operator: 'and', conditions: [] } }] } }); }
  };
  // Like the real server: a request whose tenant id is not an id is refused before it runs, naming what is missing.
  var REQUIRED = { createIncidentMutation: ['alertIds: [String]!', 'priority: Int!'], updateIncidentMutation: ['alertIds: [String]!'], activatePolicy: ['policyIds: [ID!]!'], setPolicyLock: ['policyIds: [ID!]!'], setPolicyDeployed: ['policyId: ID!', 'deployed: Boolean!'], rejectPolicy: ['policyIds: [ID!]!'], restorePolicy: ['policyIds: [ID!]!'], renamePolicy: ['policyId: ID!', 'name: String!'] };
  Object.keys(REQUIRED).forEach(function (k) {
    var real = api[k];
    api[k] = function (o) {
      if (o && typeof o.tenantId === 'object') {
        var errors = [{ message: 'Variable "$tenantId" got invalid value; ID cannot represent value' }].concat(REQUIRED[k].filter(function (r) { return !(r.split(':')[0] in o); }).map(function (r) { var p = r.split(': '); return { message: 'Variable "$' + p[0] + '" of required type "' + p[1] + '" was not provided.' }; }));
        return Promise.reject(Object.assign(new Error('Response not successful: Received status code 400'), { networkError: { result: { errors: errors } } }));
      }
      return real(o);
    };
  });
  window.akoraConfig = window.akoraConfig || {};
  window.akoraConfig.baseState = window.akoraConfig.baseState || {};
  window.akoraConfig.baseState.API = window.akoraConfig.baseState.API || {};
  api.__sample = true;
  window.akoraConfig.baseState.API.contentAnalyticsAPI = api;
  window.__previewSample = { tenant: TENANT, alerts: alerts.length, incidents: incidents.length };

  // REST paths used by older dashboards
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var json = function (o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
    if (/\/aiops\/api\/v2\/incidents/.test(url)) return json({ items: incidents.map(function (x) { return { id: x.id, title: x.title, priority: x.priority, state: x.state, createdTime: x.createdTime, alertIds: x.alertIds, contextualAlertIds: [], runbookCount: 0 }; }) });
    if (/\/aiops\/api\/v2\/alerts/.test(url)) {
      return json({ items: alerts.filter(function (a) { return a.state !== 'clear'; }).map(function (a) {
        return { id: a.id, summary: a.summary, severity: a.severity, state: a.state, type: { classification: a['type.classification'] }, resource: { name: a['resource.name'] }, sender: { name: a['sender.name'] }, firstOccurrenceTime: a.firstOccurrenceTime, lastOccurrenceTime: a.lastOccurrenceTime, eventCount: 1 + Math.floor(rnd() * 5), insights: a.runbook ? [{ type: 'aiops.ibm.com/insight-type/runbook', details: { runbooks: [{}, {}].slice(0, 1 + (parseInt(a.id.replace(/\D/g, ''), 10) % 2)) } }] : [] };
      }) });
    }
    if (/^https?:\/\/127\.0\.0\.1:\d+\/api\/panel-version/.test(url)) return json({ version: '0.0.0' });
    return realFetch ? realFetch(input, init) : Promise.reject(new Error('no network'));
  };
})();
