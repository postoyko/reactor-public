/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Tag,
  Modal,
} from '@carbon/react';
import {
  Network_4,
  Activity,
  Play,
  Filter,
  Reset,
  Analytics,
  Layers,
  Flash,
  Terminal,
  Information,
} from '@carbon/icons-react';
import './telco-command.scss';

// ── Types & Interfaces ────────────────────────────────────────────────────────

interface AlertInsight {
  id?: string;
  type?: string;
  source?: string;
  details?: Record<string, any>;
}

interface AlertItem {
  id: string;
  mr_id?: string;
  signature?: string;
  summary: string;
  severity: number;
  state: string;
  firstOccurrenceTime: string;
  lastOccurrenceTime: string;
  eventCount: number;
  sender?: {
    name?: string;
    component?: string;
    connectorType?: string;
  };
  resource?: {
    name?: string;
    hostname?: string;
    node?: string;
    metric?: string;
    type?: string;
  };
  insights?: AlertInsight[];
}

interface IncidentItem {
  id: string;
  title: string;
  description?: string;
  priority: number;
  state: string;
  owner: string;
  team: string;
  createdTime: string;
  alertIds: string[];
  contextualAlertIds?: string[];
  insights?: AlertInsight[];
}

interface TopologyNode3D {
  id: string;
  name: string;
  type: 'core' | 'ran' | 'transport' | 'edge' | 'cloud';
  layer: number;
  maxSeverity: number;
  alertCount: number;
  isProbableCause: boolean;
  alerts: AlertItem[];
  runbooks: any[];
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mesh?: THREE.Mesh;
  haloMesh?: THREE.Mesh;
  labelSprite?: THREE.Sprite;
}

interface TopologyLink3D {
  source: TopologyNode3D;
  target: TopologyNode3D;
  value: number;
  isCausal: boolean;
}

// ── Text Sprite Generator for 3D Node Labels ──────────────────────────────────

function createTextSprite(text: string, color = '#cbd5e1'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 6;
    const cleanText = text.length > 16 ? text.slice(0, 15) + '…' : text;
    ctx.fillText(cleanText, 8, 40);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(28, 7, 1);
  return sprite;
}

// ── API Credentials & Endpoints ──────────────────────────────────────────────

const API_KEY = process.env.DASHBOARD_API_KEY as string;
const TENANT_ID = process.env.DASHBOARD_TENANT_ID as string;
const ALERTS_API = '/aiops/api/v2/alerts?size=500';
const INCIDENTS_API = '/aiops/api/v2/incidents?size=100';

export default function TelcoCommandCenterDashboard() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Cross-Filter States
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<number | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  // Runbook Execution Simulator Modal
  const [activeRunbook, setActiveRunbook] = useState<any | null>(null);
  const [runbookLogs, setRunbookLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // 3D Canvas Ref & Controls
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sphericalRef = useRef(new THREE.Spherical(420, Math.PI / 3, Math.PI / 4));
  const autoRotateRef = useRef(true);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = {
        'Authorization': API_KEY,
        'x-tenant-id': TENANT_ID,
      };

      const [alertsRes, incsRes] = await Promise.all([
        fetch(ALERTS_API, { headers, credentials: 'omit' }),
        fetch(INCIDENTS_API, { headers, credentials: 'omit' }),
      ]);

      if (!alertsRes.ok) throw new Error(`Alerts query returned HTTP ${alertsRes.status}`);
      if (!incsRes.ok) throw new Error(`Incidents query returned HTTP ${incsRes.status}`);

      const alertsData = await alertsRes.json();
      const incsData = await incsRes.json();

      setAlerts(alertsData.items ?? []);
      setIncidents(incsData.items ?? []);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || 'Error communicating with Cloud Pak for AIOps endpoints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  // ── Derived Topology Graph Computation ─────────────────────────────────────

  const { nodes, links, senderCounts, goldenSignalCounts } = useMemo(() => {
    const nodeMap = new Map<string, TopologyNode3D>();
    const senders = new Map<string, number>();
    const signals = new Map<string, number>();

    alerts.forEach((alert) => {
      // Aggregate Senders
      const senderName = alert.sender?.name || alert.sender?.component || 'Netcool/OMNIbus';
      senders.set(senderName, (senders.get(senderName) || 0) + 1);

      // Aggregate Golden Signals & Insights
      alert.insights?.forEach((ins) => {
        if (ins.type === 'aiops.ibm.com/insight-type/golden-signal') {
          const sig = ins.details?.goldenSignal || 'other';
          signals.set(sig, (signals.get(sig) || 0) + 1);
        }
      });

      // Extract Node / Resource
      const rawRes = alert.resource?.name || alert.resource?.hostname || alert.resource?.node || 'unknown-ne';
      const cleanName = rawRes.split('/').pop()?.split(':::')[0] || rawRes;

      // Classify Network Element Layer
      let type: TopologyNode3D['type'] = 'cloud';
      let layer = 4;
      const lower = (cleanName + ' ' + alert.summary + ' ' + (alert.sender?.name || '')).toLowerCase();

      if (
        lower.includes('core') ||
        lower.includes('upf') ||
        lower.includes('amf') ||
        lower.includes('smf') ||
        lower.includes('service:') ||
        lower.includes('app:') ||
        lower.includes('pod') ||
        lower.includes('auth') ||
        lower.includes('mq') ||
        lower.includes('db') ||
        lower.includes('ace')
      ) {
        type = 'core';
        layer = 1;
      } else if (
        lower.includes('router') ||
        lower.includes('trans') ||
        lower.includes('agg') ||
        lower.includes('lag') ||
        lower.includes('switch') ||
        lower.includes('cr') ||
        lower.includes('rchmd') ||
        lower.includes('storage') ||
        lower.includes('ceph') ||
        lower.includes('multus') ||
        lower.includes('dns') ||
        lower.includes('tuned')
      ) {
        type = 'transport';
        layer = 2;
      } else if (
        lower.includes('ran') ||
        lower.includes('cell') ||
        lower.includes('enb') ||
        lower.includes('gnb') ||
        lower.includes('radio') ||
        lower.includes('site') ||
        lower.includes('antenna') ||
        lower.includes('tower') ||
        lower.includes('ape') ||
        lower.includes('cisco') ||
        lower.includes('vran')
      ) {
        type = 'ran';
        layer = 3;
      } else if (lower.includes('edge') || lower.includes('olt') || lower.includes('slice')) {
        type = 'edge';
        layer = 4;
      }

      // Check Probable Cause & Runbooks
      let isProbableCause = false;
      const runbooks: any[] = [];
      alert.insights?.forEach((ins) => {
        if (ins.type?.includes('probable-cause')) {
          const rank = ins.details?.rank;
          const score = ins.details?.score || 0;
          if (rank === 1 || score >= 170) {
            isProbableCause = true;
          }
        }
        if (ins.type?.includes('runbook')) {
          runbooks.push(ins.details);
        }
      });

      if (!nodeMap.has(cleanName)) {
        const zLayerPos = (2.5 - layer) * 75;
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 80;

        nodeMap.set(cleanName, {
          id: cleanName,
          name: cleanName,
          type,
          layer,
          maxSeverity: alert.severity,
          alertCount: 1,
          isProbableCause,
          alerts: [alert],
          runbooks,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: zLayerPos + (Math.random() - 0.5) * 10,
          vx: 0,
          vy: 0,
          vz: 0,
        });
      } else {
        const existing = nodeMap.get(cleanName)!;
        existing.maxSeverity = Math.max(existing.maxSeverity, alert.severity);
        existing.alertCount += 1;
        if (isProbableCause) existing.isProbableCause = true;
        existing.alerts.push(alert);
        existing.runbooks.push(...runbooks);
      }
    });

    const nodeList = Array.from(nodeMap.values());
    const linkList: TopologyLink3D[] = [];
    const linkKeySet = new Set<string>();

    const alertById = new Map<string, AlertItem>();
    alerts.forEach((a) => alertById.set(a.id, a));

    // Star-Topology Incident Causal Streams
    incidents.forEach((inc) => {
      const aIds = (inc.alertIds || []).filter((id) => alertById.has(id));
      if (aIds.length === 0) return;

      let rootAlert = alertById.get(aIds[0])!;
      let bestScore = -1;
      aIds.forEach((id) => {
        const a = alertById.get(id)!;
        a.insights?.forEach((ins) => {
          if (ins.type?.includes('probable-cause')) {
            const sc = ins.details?.score || 0;
            if (sc > bestScore) {
              bestScore = sc;
              rootAlert = a;
            }
          }
        });
      });

      const rootRes = rootAlert.resource?.name || rootAlert.resource?.hostname || 'Root';
      const rootClean = rootRes.split('/').pop()?.split(':::')[0] || rootRes;
      const rootNode = nodeMap.get(rootClean);
      if (!rootNode) return;

      aIds.forEach((id) => {
        const a = alertById.get(id)!;
        const res = a.resource?.name || a.resource?.hostname || 'Node';
        const clean = res.split('/').pop()?.split(':::')[0] || res;
        const targetNode = nodeMap.get(clean);
        if (targetNode && targetNode.id !== rootNode.id) {
          const key = `causal_${targetNode.id}_${rootNode.id}`;
          if (!linkKeySet.has(key)) {
            linkKeySet.add(key);
            linkList.push({
              source: targetNode,
              target: rootNode,
              isCausal: true,
              value: 3,
            });
          }
        }
      });
    });

    // Inter-Layer Structural Links
    nodeList.forEach((n1, idx) => {
      if (idx % 3 === 0) {
        const n2 = nodeList.find((n) => n.layer === n1.layer + 1 && n.id !== n1.id);
        if (n2) {
          const key = `inter_${n1.id}_${n2.id}`;
          if (!linkKeySet.has(key)) {
            linkKeySet.add(key);
            linkList.push({
              source: n1,
              target: n2,
              isCausal: false,
              value: 1,
            });
          }
        }
      }
    });

    return {
      nodes: nodeList,
      links: linkList,
      senderCounts: Array.from(senders.entries()).map(([name, count]) => ({ name, count })),
      goldenSignalCounts: Array.from(signals.entries()).map(([name, count]) => ({ name, count })),
    };
  }, [alerts, incidents]);

  // ── Filtered Alerts Computation ───────────────────────────────────────────

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (selectedNode) {
        const res = alert.resource?.name || alert.resource?.hostname || '';
        if (!res.includes(selectedNode)) return false;
      }
      if (selectedSender) {
        const s = alert.sender?.name || alert.sender?.component || '';
        if (s !== selectedSender) return false;
      }
      if (selectedSeverity !== null) {
        if (alert.severity !== selectedSeverity) return false;
      }
      if (selectedIncident) {
        if (!selectedIncident.alertIds.includes(alert.id)) return false;
      }
      return true;
    });
  }, [alerts, selectedNode, selectedSender, selectedSeverity, selectedIncident]);

  // ── 3D WebGL GPU-Accelerated Topology Mesh ─────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const width = canvas.parentElement?.clientWidth || 600;
    const height = 480;

    // 1. Three.js Scene, Camera & WebGL Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0d18, 0.002);

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    camera.position.set(0, 160, 380);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00d2ff, 1.2);
    dirLight1.position.set(200, 300, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa56eff, 0.8);
    dirLight2.position.set(-200, -200, -200);
    scene.add(dirLight2);

    // 3. Multi-Layer Reference Grid Planes
    const layerIndices = [1, 2, 3, 4];
    const layerGridColors = [0xa56eff, 0xff832b, 0x42be65, 0x38bdf8];
    layerIndices.forEach((layerNum, idx) => {
      const zVal = (2.5 - layerNum) * 75;
      const grid = new THREE.GridHelper(320, 10, layerGridColors[idx], 0x1e293b);
      grid.position.set(0, 0, zVal);
      grid.rotation.x = Math.PI / 2;
      (grid.material as THREE.Material).opacity = 0.22;
      (grid.material as THREE.Material).transparent = true;
      scene.add(grid);
    });

    // 4. Node Geometry, Text Labels & Mesh Construction
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    const sphereGeom = new THREE.SphereGeometry(1, 20, 20);
    const torusGeom = new THREE.TorusGeometry(8, 0.7, 12, 28);
    const selectedTorusGeom = new THREE.TorusGeometry(10, 0.8, 12, 28);

    const getSeverityColor = (sev: number): number => {
      switch (sev) {
        case 6: return 0xfa4d56; // Critical (Red)
        case 5: return 0xff832b; // Major (Orange)
        case 4: return 0xf1c21b; // Minor (Yellow)
        case 3: return 0x4589ff; // Warning (Blue)
        case 2: return 0x08bdba; // Indeterminate
        default: return 0x24a148; // Clear (Green)
      }
    };

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xa56eff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });

    const selectedHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    nodes.forEach((n) => {
      const color = getSeverityColor(n.maxSeverity);
      const isSelected = selectedNode === n.id;
      const radius = n.isProbableCause ? 6.5 : Math.max(3.5, Math.min(6.5, 3 + n.alertCount));

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: color,
        emissiveIntensity: n.maxSeverity === 6 ? 0.45 : 0.25,
      });

      const mesh = new THREE.Mesh(sphereGeom, mat);
      mesh.scale.set(radius, radius, radius);
      mesh.position.set(n.x, n.y, n.z);
      (mesh as any).nodeData = n;
      n.mesh = mesh;
      nodeGroup.add(mesh);

      // AI Probable Cause Torus Halo
      if (n.isProbableCause) {
        const halo = new THREE.Mesh(torusGeom, haloMaterial);
        halo.position.set(n.x, n.y, n.z);
        n.haloMesh = halo;
        nodeGroup.add(halo);
      }

      // Selected Node Active Glow Ring
      if (isSelected) {
        const selHalo = new THREE.Mesh(selectedTorusGeom, selectedHaloMaterial);
        selHalo.position.set(n.x, n.y, n.z);
        nodeGroup.add(selHalo);
      }

      // Billboard Text Label Sprite
      const sprite = createTextSprite(n.name, isSelected ? '#00d2ff' : '#cbd5e1');
      sprite.position.set(n.x, n.y + radius + 5, n.z);
      n.labelSprite = sprite;
      nodeGroup.add(sprite);
    });

    // 5. 3D Line Links & Animated Signal Photons
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.55,
    });

    const causalLineMaterial = new THREE.LineBasicMaterial({
      color: 0xfa4d56,
      transparent: true,
      opacity: 0.85,
    });

    const lineGeometries: THREE.BufferGeometry[] = [];
    links.forEach((l) => {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l.source.x, l.source.y, l.source.z),
        new THREE.Vector3(l.target.x, l.target.y, l.target.z),
      ]);
      const line = new THREE.Line(geom, l.isCausal ? causalLineMaterial : lineMaterial);
      scene.add(line);
      lineGeometries.push(geom);
    });

    // Animated Photons along links
    const particleCount = 80;
    const particleGeom = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleProgress = new Float32Array(particleCount);
    const particleLinkIndex = new Int32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particleProgress[i] = Math.random();
      particleLinkIndex[i] = Math.floor(Math.random() * Math.max(1, links.length));
    }

    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00d2ff,
      size: 3.5,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeom, particleMaterial);
    scene.add(particleSystem);

    // 6. Interactive 3D Camera Controls & Raycaster
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const spherical = sphericalRef.current;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1000, -1000);

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      autoRotateRef.current = false;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        spherical.theta -= deltaX * 0.005;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - deltaY * 0.005));
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoRotateRef.current = false;
      spherical.radius = Math.max(140, Math.min(750, spherical.radius + e.deltaY * 0.35));
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeGroup.children);
      if (intersects.length > 0) {
        const hitData = (intersects[0].object as any).nodeData as TopologyNode3D;
        if (hitData) {
          setSelectedNode((prev) => (prev === hitData.id ? null : hitData.id));
        }
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    // 7. 3D Force Simulation Loop (Annealed Cooling Schedule)
    let animationFrameId: number;
    let alpha = 1.0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (alpha > 0.003) {
        alpha *= 0.985;

        // A. Planar Z Stratum Alignment
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const targetZ = (2.5 - n.layer) * 75;
          n.z += (targetZ - n.z) * 0.2;
          n.vz = 0;
        }

        // B. Node-to-Node Repulsion
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const distSq = dx * dx + dy * dy + 1.0;
            const dist = Math.sqrt(distSq);

            if (dist < 110) {
              const forceMag = Math.min(2.0, (110 - dist) / Math.max(dist, 10)) * 0.12 * alpha;
              const fx = (dx / dist) * forceMag;
              const fy = (dy / dist) * forceMag;
              n1.vx += fx;
              n1.vy += fy;
              n2.vx -= fx;
              n2.vy -= fy;
            }
          }

          // C. Gravity & Friction Damping
          n1.vx -= n1.x * 0.003 * alpha;
          n1.vy -= n1.y * 0.003 * alpha;
          n1.vx *= 0.72;
          n1.vy *= 0.72;
          n1.vx = Math.max(-5, Math.min(5, n1.vx));
          n1.vy = Math.max(-5, Math.min(5, n1.vy));

          n1.x += n1.vx;
          n1.y += n1.vy;
        }

        // D. Link Spring Forces
        links.forEach((l) => {
          const dx = l.target.x - l.source.x;
          const dy = l.target.y - l.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy + 1.0);
          const desiredDist = 55;
          const springForce = (dist - desiredDist) * 0.025 * alpha;

          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;

          l.source.vx += fx;
          l.source.vy += fy;
          l.target.vx -= fx;
          l.target.vy -= fy;
        });

        // Update Link Geometries
        links.forEach((l, idx) => {
          if (lineGeometries[idx]) {
            const positions = lineGeometries[idx].attributes.position as THREE.BufferAttribute;
            positions.setXYZ(0, l.source.x, l.source.y, l.source.z);
            positions.setXYZ(1, l.target.x, l.target.y, l.target.z);
            positions.needsUpdate = true;
          }
        });
      }

      // Update Node Meshes & Text Label Sprites
      nodes.forEach((n) => {
        if (n.mesh) {
          n.mesh.position.set(n.x, n.y, n.z);
        }
        if (n.haloMesh) {
          n.haloMesh.position.set(n.x, n.y, n.z);
          n.haloMesh.rotation.x += 0.015;
          n.haloMesh.rotation.y += 0.02;
        }
        if (n.labelSprite) {
          const r = n.isProbableCause ? 6.5 : Math.max(3.5, Math.min(6.5, 3 + n.alertCount));
          n.labelSprite.position.set(n.x, n.y + r + 5, n.z);
        }
      });

      // Update Signal Photons
      const posAttr = particleGeom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const lIdx = particleLinkIndex[i];
        if (links[lIdx]) {
          particleProgress[i] += 0.008;
          if (particleProgress[i] > 1) particleProgress[i] = 0;

          const t = particleProgress[i];
          const l = links[lIdx];
          const px = l.source.x + (l.target.x - l.source.x) * t;
          const py = l.source.y + (l.target.y - l.source.y) * t;
          const pz = l.source.z + (l.target.z - l.source.z) * t;
          posAttr.setXYZ(i, px, py, pz);
        }
      }
      posAttr.needsUpdate = true;

      // Camera Orbiting
      if (!isDragging && autoRotateRef.current) {
        spherical.theta += 0.002;
      }
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      renderer.dispose();
    };
  }, [nodes, links, selectedNode]);

  // ── Runbook Execution Simulator ───────────────────────────────────────────

  const handleTriggerRunbook = (rb: any) => {
    setActiveRunbook(rb);
    setRunbookLogs([
      `[${new Date().toISOString()}] Initializing remediation automation for Policy: ${rb.policyId}`,
      `[${new Date().toISOString()}] Target Resource: ${selectedAlert?.resource?.name || 'Selected Element'}`,
      `[${new Date().toISOString()}] Resolved Runbook ID: ${rb.runbookId}`,
    ]);
  };

  const executeRunbookSimulation = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setRunbookLogs((prev) => [
        ...prev,
        `[${new Date().toISOString()}] Connecting to Netcool / Ansible Automation Bridge...`,
        `[${new Date().toISOString()}] Executing diagnostic healthcheck routine...`,
      ]);
    }, 800);

    setTimeout(() => {
      setRunbookLogs((prev) => [
        ...prev,
        `[${new Date().toISOString()}] Applied traffic re-route to standby slice. Node state stabilized.`,
        `[${new Date().toISOString()}] SUCCESS: Runbook execution completed with exit code 0.`,
      ]);
      setIsExecuting(false);
    }, 2200);
  };

  // ── Render Component ──────────────────────────────────────────────────────

  const criticalCount = alerts.filter((a) => a.severity === 6).length;
  const majorCount = alerts.filter((a) => a.severity === 5).length;
  const probableCauseCount = nodes.filter((n) => n.isProbableCause).length;
  const automatedRunbooksCount = alerts.reduce((acc, a) => {
    return acc + (a.insights?.some((i) => i.type?.includes('runbook')) ? 1 : 0);
  }, 0);

  const tableHeaders = [
    { key: 'severity', header: 'Severity' },
    { key: 'sender', header: 'Ingest Probe / Source' },
    { key: 'resource', header: 'Network Element' },
    { key: 'summary', header: 'Alarm Summary' },
    { key: 'actions', header: 'Automation / Action' },
  ];

  const tableRows = filteredAlerts.slice(0, 50).map((a) => {
    const rb = a.insights?.find((i) => i.type?.includes('runbook'))?.details;
    return {
      id: a.id,
      severity: (
        <span className={`sev-badge sev-${a.severity}`}>
          Sev {a.severity}
        </span>
      ),
      sender: a.sender?.name || a.sender?.component || 'Netcool',
      resource: a.resource?.name || a.resource?.hostname || '-',
      summary: a.summary,
      actions: (
        <div style={{ display: 'flex', gap: '6px' }}>
          {rb ? (
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Play}
              onClick={() => {
                setSelectedAlert(a);
                handleTriggerRunbook(rb);
              }}
            >
              Runbook
            </Button>
          ) : (
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Analytics}
              onClick={() => setSelectedAlert(a)}
            >
              Inspect
            </Button>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="telco-command-container">
      {/* ── Header ── */}
      <div className="telco-header">
        <div className="telco-title-group">
          <div className="telco-main-title">
            <Network_4 size={28} />
            Telco NOC 360° Operations Command Center
          </div>
          <div className="telco-subtitle">
            Next-Gen Observability: Multi-Probe Ingest, 3D Topology Mesh, AI Probable Cause &amp; Automated Remediation
          </div>
        </div>

        <div className="telco-controls-group">
          <div className="live-badge">
            <div className="live-dot" />
            LIVE TELEMETRY ({lastRefreshed || 'Syncing...'})
          </div>
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Information}
            onClick={() => setIsAboutOpen(true)}
          >
            About
          </Button>
          <Button
            size="sm"
            kind="tertiary"
            renderIcon={Reset}
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Active Filters Breadcrumb ── */}
      {(selectedNode || selectedSender || selectedSeverity !== null || selectedIncident) && (
        <div className="telco-filter-breadcrumb">
          <Filter size={16} />
          <span>Active Context:</span>
          {selectedNode && <span className="filter-tag">Node: {selectedNode}</span>}
          {selectedSender && <span className="filter-tag">Source: {selectedSender}</span>}
          {selectedSeverity !== null && <span className="filter-tag">Severity: {selectedSeverity}</span>}
          {selectedIncident && <span className="filter-tag">Incident: {selectedIncident.title}</span>}
          <span
            className="clear-filter-btn"
            onClick={() => {
              setSelectedNode(null);
              setSelectedSender(null);
              setSelectedSeverity(null);
              setSelectedIncident(null);
            }}
          >
            Clear All Filters
          </span>
        </div>
      )}

      {/* ── Top KPIs ── */}
      <div className="telco-kpi-grid">
        <div className="kpi-card kpi-nodes">
          <span className="kpi-label">Monitored Network Elements</span>
          <span className="kpi-value">{nodes.length}</span>
          <span className="kpi-meta">RAN, Core, Transport &amp; Cloud</span>
        </div>

        <div className="kpi-card kpi-critical">
          <span className="kpi-label">Sev 6 Critical Alarms</span>
          <span className="kpi-value">{criticalCount}</span>
          <span className="kpi-meta">Immediate service impact</span>
        </div>

        <div className="kpi-card kpi-major">
          <span className="kpi-label">Sev 5 Major Alarms</span>
          <span className="kpi-value">{majorCount}</span>
          <span className="kpi-meta">Degraded operational state</span>
        </div>

        <div className="kpi-card kpi-ai">
          <span className="kpi-label">AI Root Causes Identified</span>
          <span className="kpi-value">{probableCauseCount}</span>
          <span className="kpi-meta">Neural ranking &gt; 85%</span>
        </div>

        <div className="kpi-card kpi-auto">
          <span className="kpi-label">Automated Runbooks Ready</span>
          <span className="kpi-value">{automatedRunbooksCount}</span>
          <span className="kpi-meta">Executable policy actions</span>
        </div>
      </div>

      {/* ── Main Operations Grid ── */}
      <div className="telco-main-grid">
        {/* Left: 3D Force-Directed WebGL Topology Mesh */}
        <div className="telco-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Layers size={18} />
              Interactive Multi-Layer Topology Mesh (3D GPU)
            </div>
            <span className="panel-badge">{nodes.length} Elements | {links.length} Relations</span>
          </div>

          <div className="topology-canvas-wrapper">
            <canvas ref={canvasRef} style={{ width: '100%', height: '480px', display: 'block' }} />
            
            <div className="topo-controls">
              <button
                type="button"
                onClick={() => {
                  sphericalRef.current.set(420, Math.PI / 3, Math.PI / 4);
                  autoRotateRef.current = true;
                }}
              >
                3D Isometric
              </button>
              <button
                type="button"
                onClick={() => {
                  sphericalRef.current.set(400, 0.05, 0);
                  autoRotateRef.current = false;
                }}
              >
                Top View
              </button>
              <button
                type="button"
                onClick={() => {
                  sphericalRef.current.set(450, Math.PI / 2, Math.PI / 2);
                  autoRotateRef.current = false;
                }}
              >
                Layer View
              </button>
            </div>

            <div className="topo-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: '#fa4d56' }} /> Critical (Sev 6)
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: '#ff832b' }} /> Major (Sev 5)
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: '#a56eff', border: '1px solid #fff' }} /> AI Probable Cause
              </div>
            </div>
          </div>
        </div>

        {/* Right: Incidents Flight Deck & Probable Cause Insights */}
        <div className="telco-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Activity size={18} />
              Correlated Telco Incidents &amp; Probable Cause
            </div>
            <span className="panel-badge">{incidents.length} Active Stories</span>
          </div>

          <div className="incidents-queue">
            {incidents.length === 0 ? (
              <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>
                No active incident stories currently open.
              </div>
            ) : (
              incidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`incident-item ${selectedIncident?.id === inc.id ? 'active' : ''}`}
                  onClick={() => setSelectedIncident((prev) => (prev?.id === inc.id ? null : inc))}
                >
                  <div className="incident-top">
                    <span className={`incident-priority p${inc.priority}`}>
                      Priority {inc.priority}
                    </span>
                    <span className="incident-score">
                      {inc.alertIds.length} Linked Alarms
                    </span>
                  </div>
                  <div className="incident-title">{inc.title}</div>
                  <div className="incident-meta">
                    <span>Team: {inc.team || 'NOC Operations'}</span>
                    <span>State: {inc.state}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Multi-Source Telemetry Ingest Breakdown ── */}
      <div className="telco-panel" style={{ marginBottom: '24px' }}>
        <div className="panel-header">
          <div className="panel-title">
            <Analytics size={18} />
            Multi-Probe Telemetry Ingest Matrix (Click to Filter)
          </div>
          <span className="panel-badge">{senderCounts.length} Ingest Channels</span>
        </div>

        <div className="sources-grid">
          {senderCounts.map((sc) => (
            <div
              key={sc.name}
              className={`source-chip ${selectedSender === sc.name ? 'active' : ''}`}
              onClick={() => setSelectedSender((prev) => (prev === sc.name ? null : sc.name))}
            >
              <span className="source-name">{sc.name}</span>
              <span className="source-count">{sc.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detailed Alerts Table ── */}
      <div className="telco-table-wrapper">
        <DataTable rows={tableRows} headers={tableHeaders}>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
            <TableContainer title="Live Network Alarms &amp; Execution Queue">
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow {...getRowProps({ row })}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </div>

      {/* ── Automated Runbook Execution Modal ── */}
      {activeRunbook && (
        <Modal
          open
          modalHeading="Automated Remediation &amp; Policy Console"
          primaryButtonText={isExecuting ? 'Executing...' : 'Trigger Automated Remediation'}
          secondaryButtonText="Close"
          onRequestSubmit={executeRunbookSimulation}
          onRequestClose={() => setActiveRunbook(null)}
          primaryButtonDisabled={isExecuting}
        >
          <div style={{ padding: '12px 0' }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>Policy ID:</strong> {activeRunbook.policyId}
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong>Runbook ID:</strong> {activeRunbook.runbookId}
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong>Execution Mode:</strong>{' '}
              <Tag type={activeRunbook.isAutomated ? 'green' : 'blue'}>
                {activeRunbook.isAutomated ? 'Fully Automated' : 'Operator Assisted'}
              </Tag>
            </p>

            <div className="runbook-simulator-box">
              {runbookLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`log-line ${log.includes('SUCCESS') ? 'success' : log.includes('Connecting') ? 'info' : ''}`}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Alert Insights Modal ── */}
      {selectedAlert && !activeRunbook && (
        <Modal
          open
          modalHeading="Alarm Cognitive Deep-Dive"
          secondaryButtonText="Close"
          onRequestClose={() => setSelectedAlert(null)}
          passiveModal
        >
          <div style={{ padding: '12px 0' }}>
            <h5 style={{ color: '#f1f5f9', marginBottom: '8px' }}>{selectedAlert.summary}</h5>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '16px' }}>
              Resource: {selectedAlert.resource?.name || '-'} | Severity: {selectedAlert.severity} | State: {selectedAlert.state}
            </p>

            <h6 style={{ color: '#00d2ff', marginBottom: '8px' }}>Attached AI Insights:</h6>
            <div style={{ background: '#0b0f19', padding: '12px', borderRadius: '4px', maxHeight: '250px', overflowY: 'auto' }}>
              <pre style={{ color: '#7ee787', fontSize: '0.75rem' }}>
                {JSON.stringify(selectedAlert.insights, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* ── About Dashboard Modal ── */}
      <Modal
        open={isAboutOpen}
        modalHeading="About: Telco NOC 360° Operations Command Center"
        passiveModal
        onRequestClose={() => setIsAboutOpen(false)}
        size="lg"
      >
        <div className="about-modal-wrapper">
          <div className="about-guide-container">
            {/* Card 1: What It Shows */}
            <div className="about-card">
              <div className="card-header-badge">
                <Layers size={16} /> 1. What It Shows
              </div>
              <p className="card-body-text">
                A consolidated single-pane-of-glass operations cockpit for telecommunication Network Operations Centers. It features a <strong>GPU-accelerated 3D WebGL Topology Mesh</strong> with 4 stratified Z-planes:
                <span className="highlight-pill">5G Core</span>
                <span className="highlight-pill">Transport Fabric</span>
                <span className="highlight-pill">RAN Edge</span>
                <span className="highlight-pill">Cloud &amp; Edge</span>,
                a <strong>Multi-Probe Ingestion Matrix</strong> (SevOne, Instana, Netcool, Prometheus, Nokia NetAct), a <strong>Correlated Incidents Flight Deck</strong>, and an interactive <strong>Live Alarm Remediation Table</strong>.
              </p>
            </div>

            {/* Card 2: What It Provides */}
            <div className="about-card">
              <div className="card-header-badge">
                <Flash size={16} /> 2. What It Provides
              </div>
              <ul className="capabilities-list">
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Multi-Probe Cross-Correlation:</strong> Aggregates disparate alarm feeds across multi-vendor telecom infrastructure into unified incident stories.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>AI Probable Cause Halos:</strong> Highlights top-ranked root causes with wireframe torus halos and causal trajectory lines.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Live Signal Photons:</strong> Visualizes real-time telemetry throughput and anomaly propagation across network links.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Automated Remediation Trigger:</strong> Direct execution of Ansible and Netcool automated runbooks with live simulation logs.
                  </div>
                </li>
              </ul>
            </div>

            {/* Card 3: How To Use It */}
            <div className="about-card">
              <div className="card-header-badge">
                <Terminal size={16} /> 3. How To Use It
              </div>
              <div className="usage-steps-list">
                <div className="step-item">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <div className="step-title">3D Mesh Navigation &amp; Element Filtering</div>
                    <div className="step-desc">
                      Left-drag to orbit the topology, scroll to zoom, click any node sphere to filter the entire dashboard by that network element.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <div className="step-title">Camera Presets &amp; Strata Inspection</div>
                    <div className="step-desc">
                      Use the <strong>3D Isometric</strong>, <strong>Top View</strong>, and <strong>Layer View</strong> buttons on the 3D canvas to inspect strata.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <div className="step-title">Cross-Filtering &amp; Triage</div>
                    <div className="step-desc">
                      Click any source chip in the <strong>Multi-Probe Matrix</strong> or any incident story in the <strong>Flight Deck</strong> to filter alarms.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <div className="step-title">Actionable Runbook Execution</div>
                    <div className="step-desc">
                      Click <strong>Runbook</strong> in the Alarm table to open the remediation simulator modal.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
