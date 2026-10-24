/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LayerSchemeId } from './layers';

/*
 * Entity type -> OSI layer and OPS layer, from the unified entity-layer mappings (entity-layers.ts, generated from
 * entity-layer-mappings.js). Every entity type has exactly one OSI and one OPS layer there, so no derivation is needed:
 *
 *   OSI: L1..L7, plus ABSTRACT (organisations, people, tickets ... above L7).
 *   OPS: Business_User, Application_Services, Platform_Runtime, Network_Fabric, Physical_Infrastructure.
 */

import { ENTITY_TYPES, OPS_LAYER_OF, OSI_LAYER_OF, OpsKey, OsiKey } from './entity-layers';
export type { OpsKey, OsiKey } from './entity-layers';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** type (lower case, no punctuation) -> layer */
export const OSI_KEY_BY_TYPE: Map<string, OsiKey> = new Map(Object.entries(OSI_LAYER_OF).map(([t, k]) => [norm(t), k]));
export const OPS_KEY_BY_TYPE: Map<string, OpsKey> = new Map(Object.entries(OPS_LAYER_OF).map(([t, k]) => [norm(t), k]));
export const KNOWN_ENTITY_TYPES: Set<string> = new Set(ENTITY_TYPES.map(norm));

/**
 * The TSA seed gives each canonical type a generic entity type. For the generic types that are not in the mappings
 * (`networkgear`, `monitor`, `operations`) the seed's `network_layer` decides instead, through a representative type of
 * that layer. A network layer not listed here stays unresolved rather than guessed.
 */
export const NETWORK_LAYER_TO_TYPE: Record<string, string> = {
  optical: 'device', physical: 'device', sdh: 'device', wireless: 'device', fronthaul: 'device',
  ethernet: 'switch', access: 'switch', resilience: 'switch',
  ip: 'router', mpls: 'router', wan: 'router', security: 'firewall', transport: 'router'
};

/**
 * Your own corrections, applied before everything else. Key: a canonical telco type (`UPF`, upper case) or a generic
 * entity type (`router`, lower case). Value: the layer key of the scheme: `L1`..`L7` or `ABSTRACT` for OSI, `Business_User`,
 * `Application_Services`, `Platform_Runtime`, `Network_Fabric` or `Physical_Infrastructure` for OPS.
 * Example: `osi: { UPF: 'L7', AMF: 'L7' }` puts the 5G core functions on the application layer.
 */
export const LAYER_OVERRIDES: Record<Exclude<LayerSchemeId, 'telco'>, Record<string, string>> = {
  osi: {},
  ops: {}
};

/**
 * Wording that gives away what kind of entity an alert is about, used when neither the entity type nor the resource name
 * does (live resource names are often vendor or site codes such as `ALCATEL5520AMS`). Each rule names a generic entity
 * type, which the unified mappings turn into an OSI or OPS layer. They are searched in the alert summaries, the sender and
 * the alert type, after the canonical TSA patterns. The first rule that matches wins, so more specific rules come first.
 * These are heuristics, not part of the TSA seed: edit or remove any rule that places things wrongly for your network.
 */
export const TEXT_HINTS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\b(?:sdh|sonet|stm-?\d+|dwdm|otn|optical|fib(?:re|er)|laser|loss of (?:signal|frame)|tx power|rx power)\b/i, type: 'device' },
  { pattern: /\b(?:cpu|memory|disk|filesystem|fan|psu|power supply|battery|temperature|chassis)\b/i, type: 'server' },
  { pattern: /\b(?:firewall|acl)\b/i, type: 'firewall' },
  { pattern: /\b(?:bgp|ospf|is-?is|mpls|ldp|rsvp|routing|route|prefix|peering|tunnel)\b/i, type: 'router' },
  { pattern: /\b(?:link|port|interface|lag|ethernet|vlan|duplex|flapping)\b/i, type: 'networkinterface' },
  { pattern: /\b(?:pod|container|kubernetes|k8s|deployment|replicaset|daemonset|statefulset|crashloop(?:backoff)?|oomkilled|openshift)\b/i, type: 'pod' },
  { pattern: /\b(?:vm|virtual machine|hypervisor|vmware|esxi)\b/i, type: 'vm' },
  { pattern: /\b(?:queue manager|queue|kafka|broker|mq)\b/i, type: 'queue' },
  { pattern: /\b(?:database|sql|db2|oracle|postgres|mysql|mongo(?:db)?)\b/i, type: 'database' },
  { pattern: /\b(?:dns|fqdn)\b/i, type: 'fqdn' },
  { pattern: /\b(?:tcp|udp|socket)\b/i, type: 'tcp' },
  { pattern: /\b(?:https?|api|rest|endpoint|call rate|response time|error rate|latency)\b|\b(?:get|post|put|delete) \//i, type: 'api' }
];

/** Words too general to trust in a resource name or in alert text. They still count when they are an exact entity type. */
export const AMBIGUOUS_WORDS = new Set([
  'point', 'path', 'input', 'output', 'save', 'tool', 'status', 'event', 'group', 'product', 'project', 'report', 'command', 'template',
  'custom', 'security', 'person', 'location', 'organization', 'industry', 'forum', 'component', 'device', 'volume', 'house', 'gauge',
  'alarm', 'sector', 'slot', 'outlet', 'patch', 'operations', 'configure', 'credential', 'variable', 'directory', 'file', 'catalog',
  'os', 'network', 'domain', 'card', 'hub', 'fan', 'power', 'memory', 'disk', 'host', 'stack', 'swarm', 'process', 'tenant', 'subscription',
  'application', 'service', 'cluster', 'printer', 'keyboard', 'computer', 'interactions', 'chatmessage', 'addgroup', 'emailaddress', 'bypass',
  // common English in alert text and resource names, where the word rarely names the entity type
  'log', 'metric', 'trace', 'task', 'job', 'run', 'release', 'package', 'map', 'message', 'queue', 'stream', 'cache', 'user', 'team',
  'case', 'request', 'tier', 'pool', 'image', 'instance', 'node', 'schedule', 'account', 'contact', 'profile', 'issue', 'dashboard',
  'notification', 'registry', 'rule', 'policy', 'script', 'patch', 'client', 'customer', 'department', 'community', 'incident', 'ticket',
  'approval', 'sla', 'workflow', 'pipeline', 'endpoint', 'secret', 'identity', 'certificate', 'connection', 'backend', 'controller',
  'kernel', 'flavor', 'deployable', 'autoscaling', 'diagram', 'weather', 'fire', 'power', 'cell', 'sensor', 'temperature'
]);
