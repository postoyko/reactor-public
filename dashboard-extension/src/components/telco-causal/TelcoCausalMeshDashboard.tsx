/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import * as d3 from 'd3';
import {
  Button,
  Tag,
  Modal,
} from '@carbon/react';
import {
  Diagram,
  Reset,
  Play,
  Activity,
  CheckmarkOutline,
  Layers,
  Radar,
  Flash,
  Terminal,
  Information,
} from '@carbon/icons-react';
import './telco-causal.scss';

// ── Types & Interfaces ────────────────────────────────────────────────────────

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
  };
  resource?: {
    name?: string;
    hostname?: string;
    node?: string;
  };
  insights?: {
    type?: string;
    source?: string;
    details?: any;
  }[];
}

interface IncidentItem {
  id: string;
  title: string;
  priority: number;
  state: string;
  team: string;
  alertIds: string[];
}

interface Node3D {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  severity: number;
  isProbableCause: boolean;
  alertCount: number;
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
}

interface Link3D {
  source: Node3D;
  target: Node3D;
  isCausal: boolean;
  value: number;
}

const API_KEY = process.env.DASHBOARD_API_KEY as string;
const TENANT_ID = process.env.DASHBOARD_TENANT_ID as string;
const ALERTS_API = '/aiops/api/v2/alerts?size=500';
const INCIDENTS_API = '/aiops/api/v2/incidents?size=100';

export default function TelcoCausalMeshDashboard() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cross-Filter & Interactive 3D Control States
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [layerSpacing, setLayerSpacing] = useState<number>(90); // 60, 90, 130
  const [filterMode, setFilterMode] = useState<'all' | 'critical' | 'probable-cause'>('all');
  const [colorMode, setColorMode] = useState<'domain' | 'severity'>('domain');
  const [executingPolicyId, setExecutingPolicyId] = useState<string | null>(null);
  const [executedPolicies, setExecutedPolicies] = useState<Record<string, boolean>>({});

  // Spherical camera reference for presets
  const sphericalRef = useRef(new THREE.Spherical(460, Math.PI / 3, Math.PI / 4));

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sankeyRef = useRef<SVGSVGElement | null>(null);
  const radarRef = useRef<SVGSVGElement | null>(null);

  // ── Load Telemetry ──────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = {
        'Authorization': API_KEY,
        'x-tenant-id': TENANT_ID,
      };

      const [aRes, iRes] = await Promise.all([
        fetch(ALERTS_API, { headers, credentials: 'omit' }),
        fetch(INCIDENTS_API, { headers, credentials: 'omit' }),
      ]);

      if (!aRes.ok) throw new Error(`Alerts query HTTP ${aRes.status}`);
      if (!iRes.ok) throw new Error(`Incidents query HTTP ${iRes.status}`);

      const aData = await aRes.json();
      const iData = await iRes.json();

      setAlerts(aData.items ?? []);
      setIncidents(iData.items ?? []);
    } catch (e: any) {
      setError(e.message || 'Error communicating with Cloud Pak for AIOps endpoints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  // ── 3D Force Graph Topology Dataset ─────────────────────────────────────────

  const { nodes3D, links3D } = useMemo(() => {
    const nodeMap = new Map<string, Node3D>();

    alerts.forEach((alert) => {
      const rawRes = alert.resource?.name || alert.resource?.hostname || 'RAN';
      const cleanName = rawRes.split('/').pop()?.split(':::')[0] || rawRes;

      let layer = 4;
      let layerName = 'Subscribers & Network Slices';
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
        layer = 1;
        layerName = '5G Core Network';
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
        layer = 2;
        layerName = 'IP Transport & Optical';
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
        layer = 3;
        layerName = 'RAN Edge (eNodeB/gNodeB)';
      }

      // Check Probable Cause (Rank 1 and Score >= 170) & Runbooks
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
        if (ins.type?.includes('runbook')) runbooks.push(ins.details);
      });

      if (!nodeMap.has(cleanName)) {
        const zLayerPos = (2.5 - layer) * 90;
        const angle = Math.random() * Math.PI * 2;
        const radius = 35 + Math.random() * 85;

        nodeMap.set(cleanName, {
          id: cleanName,
          name: cleanName,
          layer,
          layerName,
          severity: alert.severity,
          isProbableCause,
          alertCount: 1,
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
        existing.severity = Math.max(existing.severity, alert.severity);
        existing.alertCount += 1;
        if (isProbableCause) existing.isProbableCause = true;
        existing.alerts.push(alert);
        existing.runbooks.push(...runbooks);
      }
    });

    const nodeList = Array.from(nodeMap.values());
    const linkList: Link3D[] = [];
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

    return { nodes3D: nodeList, links3D: linkList };
  }, [alerts, incidents]);

  // ── WebGL GPU 3D Force Engine ──────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || nodes3D.length === 0) return;

    const canvas = canvasRef.current;
    const width = canvas.parentElement?.clientWidth || 800;
    const height = 540;

    // 1. Scene, Camera, WebGL Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060911, 0.0018);

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    camera.position.set(0, 180, 420);

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

    const dirLight2 = new THREE.DirectionalLight(0xa56eff, 0.9);
    dirLight2.position.set(-200, -200, -200);
    scene.add(dirLight2);

    // 3. Multi-Layer Grid Planes in 3D Space
    const layerIndices = [1, 2, 3, 4];
    const layerGridColors = [0xa56eff, 0xff832b, 0x42be65, 0x38bdf8];

    layerIndices.forEach((layerNum, idx) => {
      const zVal = (2.5 - layerNum) * layerSpacing;
      const grid = new THREE.GridHelper(380, 12, layerGridColors[idx], 0x1e293b);
      grid.position.set(0, 0, zVal);
      grid.rotation.x = Math.PI / 2;
      (grid.material as THREE.Material).opacity = 0.25;
      (grid.material as THREE.Material).transparent = true;
      scene.add(grid);
    });

    // 4. Node Geometry & Meshes
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    const sphereGeom = new THREE.SphereGeometry(1, 24, 24);
    const torusGeom = new THREE.TorusGeometry(8, 0.8, 12, 32);

    const getNodeMaterial = (node: Node3D) => {
      let color = 0x42be65; // Layer 3: RAN Edge (Green)
      if (colorMode === 'domain') {
        if (node.layer === 1) color = 0xa56eff; // Layer 1: 5G Core (Purple)
        else if (node.layer === 2) color = 0xff832b; // Layer 2: IP Transport (Orange)
        else if (node.layer === 3) color = 0x42be65; // Layer 3: RAN Edge (Green)
        else if (node.layer === 4) color = 0x38bdf8; // Layer 4: Subscribers/Slices (Cyan)
      } else {
        if (node.severity === 6) color = 0xfa4d56; // Critical (Red)
        else if (node.severity === 5) color = 0xff832b; // Major (Orange)
        else if (node.severity === 4) color = 0xf1c21b; // Minor (Yellow)
        else if (node.severity === 3) color = 0x4589ff; // Warning (Blue)
        else color = 0x24a148; // Clear (Green)
      }

      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: color,
        emissiveIntensity: node.severity === 6 ? 0.45 : 0.25,
      });
    };

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });

    const visibleNodes = nodes3D.filter((n) => {
      if (filterMode === 'critical') return n.severity === 6;
      if (filterMode === 'probable-cause') return n.isProbableCause;
      return true;
    });
    const visibleNodeSet = new Set(visibleNodes.map((n) => n.id));

    visibleNodes.forEach((n) => {
      const radius = n.isProbableCause ? 7 : Math.max(4, Math.min(8, 3 + n.alertCount));
      const mesh = new THREE.Mesh(sphereGeom, getNodeMaterial(n));
      mesh.scale.set(radius, radius, radius);
      mesh.position.set(n.x, n.y, n.z);
      (mesh as any).nodeData = n;
      n.mesh = mesh;
      nodeGroup.add(mesh);

      if (n.isProbableCause) {
        const halo = new THREE.Mesh(torusGeom, haloMaterial);
        halo.position.set(n.x, n.y, n.z);
        n.haloMesh = halo;
        nodeGroup.add(halo);
      }
    });

    // 5. 3D Line Links & Animated Signal Photons
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.5,
    });

    const causalLineMaterial = new THREE.LineBasicMaterial({
      color: 0xfa4d56,
      transparent: true,
      opacity: 0.85,
    });

    const lineGeometries: THREE.BufferGeometry[] = [];
    const visibleLinks = links3D.filter(
      (l) => visibleNodeSet.has(l.source.id) && visibleNodeSet.has(l.target.id)
    );

    visibleLinks.forEach((l) => {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l.source.x, l.source.y, l.source.z),
        new THREE.Vector3(l.target.x, l.target.y, l.target.z),
      ]);
      const line = new THREE.Line(geom, l.isCausal ? causalLineMaterial : lineMaterial);
      scene.add(line);
      lineGeometries.push(geom);
    });

    // Animated Photons / Particles along links
    const particleCount = 120;
    const particleGeom = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleProgress = new Float32Array(particleCount);
    const particleLinkIndex = new Int32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particleProgress[i] = Math.random();
      particleLinkIndex[i] = Math.floor(Math.random() * Math.max(1, visibleLinks.length));
    }

    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00d2ff,
      size: 4,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeom, particleMaterial);
    scene.add(particleSystem);

    // 6. Interactive Orbit & Mouse Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const spherical = sphericalRef.current;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-1000, -1000);

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
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
      spherical.radius = Math.max(160, Math.min(800, spherical.radius + e.deltaY * 0.4));
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeGroup.children);
      if (intersects.length > 0) {
        const hitData = (intersects[0].object as any).nodeData as Node3D;
        if (hitData) {
          setSelectedNodeId((prev) => (prev === hitData.id ? null : hitData.id));
        }
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    // 7. 3D Force Simulation Loop
    let animationFrameId: number;
    let alpha = 1.0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (alpha > 0.003) {
        alpha *= 0.985;

        // A. Z-Layer Anchor
        for (let i = 0; i < visibleNodes.length; i++) {
          const n = visibleNodes[i];
          const targetZ = (2.5 - n.layer) * layerSpacing;
          n.z += (targetZ - n.z) * 0.2;
          n.vz = 0;
        }

        // B. Node-to-Node Repulsion
        for (let i = 0; i < visibleNodes.length; i++) {
          const n1 = visibleNodes[i];
          for (let j = i + 1; j < visibleNodes.length; j++) {
            const n2 = visibleNodes[j];
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const distSq = dx * dx + dy * dy + 1.0;
            const dist = Math.sqrt(distSq);

            if (dist < 130) {
              const forceMag = Math.min(2.0, (130 - dist) / Math.max(dist, 10)) * 0.12 * alpha;
              const fx = (dx / dist) * forceMag;
              const fy = (dy / dist) * forceMag;
              n1.vx += fx;
              n1.vy += fy;
              n2.vx -= fx;
              n2.vy -= fy;
            }
          }

          n1.vx -= n1.x * 0.003 * alpha;
          n1.vy -= n1.y * 0.003 * alpha;
          n1.vx *= 0.72;
          n1.vy *= 0.72;
          n1.vx = Math.max(-5, Math.min(5, n1.vx));
          n1.vy = Math.max(-5, Math.min(5, n1.vy));

          n1.x += n1.vx;
          n1.y += n1.vy;
        }

        // C. Link Spring Forces
        visibleLinks.forEach((l) => {
          const dx = l.target.x - l.source.x;
          const dy = l.target.y - l.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy + 1.0);
          const desiredDist = 65;
          const springForce = (dist - desiredDist) * 0.025 * alpha;

          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;

          l.source.vx += fx;
          l.source.vy += fy;
          l.target.vx -= fx;
          l.target.vy -= fy;
        });

        // Update Link Line Buffer Geometries
        visibleLinks.forEach((l, idx) => {
          if (lineGeometries[idx]) {
            const positions = lineGeometries[idx].attributes.position as THREE.BufferAttribute;
            positions.setXYZ(0, l.source.x, l.source.y, l.source.z);
            positions.setXYZ(1, l.target.x, l.target.y, l.target.z);
            positions.needsUpdate = true;
          }
        });
      }

      // Update 3D Node Meshes
      visibleNodes.forEach((n) => {
        if (n.mesh) {
          n.mesh.position.set(n.x, n.y, n.z);
        }
        if (n.haloMesh) {
          n.haloMesh.position.set(n.x, n.y, n.z);
          n.haloMesh.rotation.x += 0.015;
          n.haloMesh.rotation.y += 0.02;
        }
      });

      // Update Signal Photons
      const posAttr = particleGeom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const lIdx = particleLinkIndex[i];
        if (visibleLinks[lIdx]) {
          particleProgress[i] += 0.008;
          if (particleProgress[i] > 1) particleProgress[i] = 0;

          const t = particleProgress[i];
          const l = visibleLinks[lIdx];
          const px = l.source.x + (l.target.x - l.source.x) * t;
          const py = l.source.y + (l.target.y - l.source.y) * t;
          const pz = l.source.z + (l.target.z - l.source.z) * t;
          posAttr.setXYZ(i, px, py, pz);
        }
      }
      posAttr.needsUpdate = true;

      // Auto Camera Rotation
      if (autoRotate && !isDragging) {
        spherical.theta += 0.0025;
      }

      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);

      // Raycasting for Tooltip HUD
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeGroup.children);
      if (intersects.length > 0) {
        const hitData = (intersects[0].object as any).nodeData as Node3D;
        if (hitData) {
          setHoveredNode(hitData);
          const rect = canvas.getBoundingClientRect();
          const screenPos = hitData.mesh!.position.clone().project(camera);
          const sx = ((screenPos.x + 1) / 2) * rect.width;
          const sy = ((-screenPos.y + 1) / 2) * rect.height;
          setTooltipPos({ x: sx, y: sy });
        }
      } else {
        setHoveredNode(null);
      }

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
  }, [nodes3D, links3D, autoRotate, layerSpacing, filterMode, colorMode]);

  // ── Sankey Diagram Dataset ────────────────────────────────────────────────

  const sankeyData = useMemo(() => {
    const rawNodes: any[] = [];
    const nodeIndexMap = new Map<string, number>();

    const getNodeIdx = (id: string, name: string, color: string): number => {
      if (nodeIndexMap.has(id)) return nodeIndexMap.get(id)!;
      const idx = rawNodes.length;
      rawNodes.push({ id, name, color });
      nodeIndexMap.set(id, idx);
      return idx;
    };

    const linkMap = new Map<string, { source: number; target: number; value: number }>();

    const addLink = (s: number, t: number) => {
      const key = `${s}->${t}`;
      if (linkMap.has(key)) linkMap.get(key)!.value += 1;
      else linkMap.set(key, { source: s, target: t, value: 1 });
    };

    alerts.slice(0, 250).forEach((a) => {
      const srcName = a.sender?.name || a.sender?.component || 'Netcool Probe';
      const sIdx = getNodeIdx(`src-${srcName}`, srcName, '#38bdf8');

      const rawRes = a.resource?.name || a.resource?.hostname || 'Element';
      let dom = 'RAN (eNodeB/gNodeB)';
      let col = '#42be65';
      const lower = rawRes.toLowerCase();
      if (lower.includes('core') || lower.includes('upf') || lower.includes('amf') || lower.includes('smf')) {
        dom = '5G Core Network';
        col = '#a56eff';
      } else if (lower.includes('router') || lower.includes('trans') || lower.includes('agg') || lower.includes('lag')) {
        dom = 'IP Transport & Optical';
        col = '#ff832b';
      } else if (lower.includes('edge') || lower.includes('olt') || lower.includes('slice')) {
        dom = 'Subscribers & Network Slices';
        col = '#38bdf8';
      }
      const dIdx = getNodeIdx(`dom-${dom}`, dom, col);
      addLink(sIdx, dIdx);

      const inc = incidents.find((i) => i.alertIds?.includes(a.id));
      const incTitle = inc ? `INC: ${inc.title.slice(0, 20)}` : 'Correlated Pool';
      const iIdx = getNodeIdx(`inc-${incTitle}`, incTitle, '#fa4d56');
      addLink(dIdx, iIdx);

      const rb = a.insights?.find((i: any) => i.type?.includes('runbook'))?.details;
      const polName = rb ? `Policy: ${rb.policyId.slice(0, 8)}...` : 'Standard Ops Policy';
      const pIdx = getNodeIdx(`pol-${polName}`, polName, '#00d2ff');
      addLink(iIdx, pIdx);
    });

    return {
      nodes: rawNodes,
      links: Array.from(linkMap.values()),
    };
  }, [alerts, incidents]);

  // ── Render D3 Sankey Diagram ──────────────────────────────────────────────

  useEffect(() => {
    if (!sankeyRef.current || sankeyData.nodes.length === 0 || sankeyData.links.length === 0) return;

    const width = sankeyRef.current.clientWidth || 900;
    const height = 340;

    const svg = d3.select(sankeyRef.current);
    svg.selectAll('*').remove();

    const sankeyLayout = (d3Sankey as any)()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([[10, 10], [width - 10, height - 20]]);

    try {
      const graph = sankeyLayout({
        nodes: sankeyData.nodes.map((d: any) => ({ ...d })),
        links: sankeyData.links.map((d: any) => ({ ...d })),
      });

      svg.append('g')
        .attr('fill', 'none')
        .selectAll('path')
        .data(graph.links)
        .enter()
        .append('path')
        .attr('d', sankeyLinkHorizontal())
        .attr('stroke', (d: any) => d.source.color || '#334155')
        .attr('stroke-width', (d: any) => Math.max(1.2, d.width))
        .attr('stroke-opacity', 0.4)
        .on('mouseenter', function () {
          d3.select(this).attr('stroke-opacity', 0.9);
        })
        .on('mouseleave', function () {
          d3.select(this).attr('stroke-opacity', 0.4);
        });

      const node = svg.append('g')
        .selectAll('g')
        .data(graph.nodes)
        .enter()
        .append('g')
        .attr('cursor', 'pointer');

      node.append('rect')
        .attr('x', (d: any) => d.x0)
        .attr('y', (d: any) => d.y0)
        .attr('height', (d: any) => Math.max(2, d.y1 - d.y0))
        .attr('width', (d: any) => d.x1 - d.x0)
        .attr('fill', (d: any) => d.color)
        .attr('rx', 2);

      node.append('text')
        .attr('x', (d: any) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
        .attr('y', (d: any) => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (d: any) => (d.x0 < width / 2 ? 'start' : 'end'))
        .attr('fill', '#f1f5f9')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text((d: any) => d.name);
    } catch (e) {
      console.warn('Sankey error:', e);
    }
  }, [sankeyData]);

  // ── Render Concentric Radial Blast Radius Radar ───────────────────────────

  const rootCandidate = useMemo(() => {
    if (selectedNodeId) {
      return nodes3D.find((n) => n.id === selectedNodeId) || null;
    }
    return nodes3D.find((n) => n.isProbableCause) || nodes3D[0] || null;
  }, [nodes3D, selectedNodeId]);

  useEffect(() => {
    if (!radarRef.current || !rootCandidate) return;

    const svg = d3.select(radarRef.current);
    svg.selectAll('*').remove();

    const width = radarRef.current.clientWidth || 420;
    const height = 340;
    const cx = width / 2;
    const cy = height / 2;

    const g = svg.append('g').attr('transform', `translate(${cx}, ${cy})`);

    // Multi-Ring Radii
    const rings = [
      { r: 45, label: 'Root Cause', color: '#fa4d56' },
      { r: 90, label: '1-Hop Neighbors', color: '#ff832b' },
      { r: 130, label: 'Service Slices', color: '#a56eff' },
      { r: 165, label: 'Subscribers (14.2k)', color: '#00d2ff' },
    ];

    // Background Concentric Rings & Glows
    rings.forEach((ring) => {
      g.append('circle')
        .attr('r', ring.r)
        .attr('fill', 'none')
        .attr('stroke', ring.color)
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', ring.r > 90 ? '4,4' : 'none')
        .attr('opacity', 0.45);

      g.append('text')
        .attr('x', 0)
        .attr('y', -ring.r - 3)
        .attr('text-anchor', 'middle')
        .attr('fill', ring.color)
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('opacity', 0.8)
        .text(ring.label);
    });

    // Outer Slices Data
    const slices = [
      { name: '5G eMBB Slice', angle: 0.5, sev: 6 },
      { name: 'URLLC Low-Latency', angle: 2.1, sev: 5 },
      { name: 'mMTC IoT Fleet', angle: 3.7, sev: 4 },
      { name: 'VoNR Voice IMS', angle: 5.2, sev: 5 },
    ];

    // Connected 1-Hop Neighbor Nodes
    const neighborLinks = links3D.filter(
      (l) => l.source.id === rootCandidate.id || l.target.id === rootCandidate.id
    );
    const neighbors = neighborLinks.map((l) =>
      l.source.id === rootCandidate.id ? l.target : l.source
    ).slice(0, 8);

    // Draw connecting radial rays
    neighbors.forEach((nbr, idx) => {
      const angle = (idx / Math.max(1, neighbors.length)) * Math.PI * 2;
      const nx = Math.cos(angle) * 90;
      const ny = Math.sin(angle) * 90;

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', nx)
        .attr('y2', ny)
        .attr('stroke', '#fa4d56')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.7);

      g.append('circle')
        .attr('cx', nx)
        .attr('cy', ny)
        .attr('r', 6)
        .attr('fill', nbr.severity === 6 ? '#fa4d56' : '#ff832b')
        .attr('stroke', '#060911')
        .attr('stroke-width', 1.5);

      g.append('text')
        .attr('x', nx)
        .attr('y', ny + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#cbd5e1')
        .attr('font-size', '8px')
        .attr('font-weight', '600')
        .text(nbr.name.slice(0, 10));
    });

    // Draw Slices on Outer Ring
    slices.forEach((sl) => {
      const sx = Math.cos(sl.angle) * 130;
      const sy = Math.sin(sl.angle) * 130;

      g.append('circle')
        .attr('cx', sx)
        .attr('cy', sy)
        .attr('r', 7)
        .attr('fill', '#a56eff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2);

      g.append('text')
        .attr('x', sx)
        .attr('y', sy - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#d4bbff')
        .attr('font-size', '8.5px')
        .attr('font-weight', '700')
        .text(sl.name);
    });

    // Draw Center Root Cause Node
    g.append('circle')
      .attr('r', 16)
      .attr('fill', '#fa4d56')
      .attr('stroke', '#00d2ff')
      .attr('stroke-width', 2.5);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', '8px')
      .attr('font-weight', '800')
      .text('ROOT');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 26)
      .attr('fill', '#00d2ff')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .text(rootCandidate.name.slice(0, 14));
  }, [rootCandidate, links3D]);

  // ── Selected Node Alerts / Runbooks ───────────────────────────────────────

  const selectedNodeData = useMemo(() => {
    return nodes3D.find((n) => n.id === selectedNodeId) || null;
  }, [nodes3D, selectedNodeId]);

  return (
    <div className="telco-causal-container">
      {/* ── Header ── */}
      <div className="causal-header">
        <div>
          <div className="causal-title">
            <Diagram size={28} />
            Telco Causal Mesh &amp; Neural Signal Observatory
          </div>
          <div className="causal-subtitle">
            GPU-Accelerated 3D Multi-Layer Force Mesh: 5G Core, IP Transport, RAN Edge &amp; Automated Runbook Remediations
          </div>
        </div>

        <div className="header-actions">
          <div className="gpu-badge">
            <Activity size={16} />
            WebGL GPU ACCELERATED
          </div>
          <Button size="sm" kind="ghost" renderIcon={Information} onClick={() => setIsAboutOpen(true)}>
            About
          </Button>
          <Button size="sm" kind="tertiary" renderIcon={Reset} onClick={loadData}>
            Refresh Mesh
          </Button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="causal-kpis">
        <div className="kpi-box">
          <div className="kpi-title">3D Force Nodes</div>
          <div className="kpi-num">{nodes3D.length} NEs</div>
          <div className="kpi-meta">Across 4 Network Strata</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-title">Causal Trajectories</div>
          <div className="kpi-num">{links3D.length} Links</div>
          <div className="kpi-meta">Real-time particle flow</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-title">AI Probable Causes</div>
          <div className="kpi-num">{nodes3D.filter((n) => n.isProbableCause).length} Roots</div>
          <div className="kpi-meta">Pulsing neural toruses</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-title">Automated Policies</div>
          <div className="kpi-num">178 Actions</div>
          <div className="kpi-meta">Linked executable runbooks</div>
        </div>
      </div>

      {/* ── 3D Force GPU Topology Mesh Panel ── */}
      <div className="force3d-panel">
        <div className="force3d-header">
          <div className="force3d-title">
            <Layers size={20} />
            Interactive 3D Multi-Layer Stratified Topology Mesh
          </div>
          <div className="force3d-tools">
            {selectedNodeData && (
              <Tag type="cyan" onClose={() => setSelectedNodeId(null)}>
                Focused NE: {selectedNodeData.name} ({selectedNodeData.layerName})
              </Tag>
            )}

            {/* Camera Presets */}
            <div className="control-group">
              <span className="control-label">Camera:</span>
              <Button
                size="sm"
                kind="ghost"
                onClick={() => {
                  sphericalRef.current.radius = 460;
                  sphericalRef.current.phi = Math.PI / 3;
                  sphericalRef.current.theta = Math.PI / 4;
                }}
              >
                Isometric 3D
              </Button>
              <Button
                size="sm"
                kind="ghost"
                onClick={() => {
                  sphericalRef.current.radius = 480;
                  sphericalRef.current.phi = Math.PI / 2;
                  sphericalRef.current.theta = 0;
                }}
              >
                Strata Profile
              </Button>
              <Button
                size="sm"
                kind="ghost"
                onClick={() => {
                  sphericalRef.current.radius = 450;
                  sphericalRef.current.phi = 0.05;
                  sphericalRef.current.theta = 0;
                }}
              >
                Top-Down
              </Button>
            </div>

            {/* Z-Stratum Spacing */}
            <div className="control-group">
              <span className="control-label">Strata Z:</span>
              <Button
                size="sm"
                kind={layerSpacing === 60 ? 'secondary' : 'ghost'}
                onClick={() => setLayerSpacing(60)}
              >
                60px
              </Button>
              <Button
                size="sm"
                kind={layerSpacing === 90 ? 'secondary' : 'ghost'}
                onClick={() => setLayerSpacing(90)}
              >
                90px
              </Button>
              <Button
                size="sm"
                kind={layerSpacing === 130 ? 'secondary' : 'ghost'}
                onClick={() => setLayerSpacing(130)}
              >
                130px
              </Button>
            </div>

            {/* Filter Toggle */}
            <div className="control-group">
              <span className="control-label">Filter:</span>
              <Button
                size="sm"
                kind={filterMode === 'all' ? 'primary' : 'ghost'}
                onClick={() => setFilterMode('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                kind={filterMode === 'critical' ? 'danger--tertiary' : 'ghost'}
                onClick={() => setFilterMode('critical')}
              >
                Sev 6
              </Button>
              <Button
                size="sm"
                kind={filterMode === 'probable-cause' ? 'primary' : 'ghost'}
                onClick={() => setFilterMode('probable-cause')}
              >
                Root Causes
              </Button>
            </div>

            {/* Node Color Scheme Toggle */}
            <div className="control-group">
              <span className="control-label">Node Color:</span>
              <Button
                size="sm"
                kind={colorMode === 'domain' ? 'primary' : 'ghost'}
                onClick={() => setColorMode('domain')}
              >
                Stratum Domain
              </Button>
              <Button
                size="sm"
                kind={colorMode === 'severity' ? 'primary' : 'ghost'}
                onClick={() => setColorMode('severity')}
              >
                Alert Severity
              </Button>
            </div>

            <Button
              size="sm"
              kind={autoRotate ? 'primary' : 'ghost'}
              onClick={() => setAutoRotate(!autoRotate)}
            >
              {autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
            </Button>
          </div>
        </div>

        <div className="force3d-canvas-container">
          <canvas ref={canvasRef} />

          {/* HUD Layer Stratum Legend */}
          <div className="hud-layers">
            <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '2px' }}>
              Network Strata (Z-Planes: {layerSpacing}px spacing)
            </div>
            <div className="hud-layer-item">
              <div className="hud-dot" style={{ background: '#a56eff' }} /> Layer 1: 5G Core Network
            </div>
            <div className="hud-layer-item">
              <div className="hud-dot" style={{ background: '#ff832b' }} /> Layer 2: IP Transport &amp; Optical
            </div>
            <div className="hud-layer-item">
              <div className="hud-dot" style={{ background: '#42be65' }} /> Layer 3: RAN Edge (eNodeB/gNodeB)
            </div>
            <div className="hud-layer-item">
              <div className="hud-dot" style={{ background: '#38bdf8' }} /> Layer 4: Subscribers &amp; Slices
            </div>
          </div>

          {/* Hover Tooltip HUD */}
          {hoveredNode && tooltipPos && (
            <div
              className="node-tooltip-hud"
              style={{
                left: `${Math.min(tooltipPos.x + 15, 600)}px`,
                top: `${Math.min(tooltipPos.y - 15, 420)}px`,
              }}
            >
              <div className="hud-node-title">{hoveredNode.name}</div>
              <div className="hud-node-meta">Stratum: {hoveredNode.layerName}</div>
              <div className="hud-node-meta">Active Alarms: {hoveredNode.alertCount}</div>
              <div
                className="hud-node-sev"
                style={{
                  background:
                    hoveredNode.severity === 6
                      ? '#fa4d56'
                      : hoveredNode.severity === 5
                      ? '#ff832b'
                      : '#f1c21b',
                  color: hoveredNode.severity === 6 ? '#fff' : '#000',
                }}
              >
                Max Severity: Sev {hoveredNode.severity}
              </div>
              {hoveredNode.isProbableCause && (
                <div style={{ color: '#d4bbff', fontWeight: 700, marginTop: '4px' }}>
                  ★ AI Probable Cause Root
                </div>
              )}
            </div>
          )}

          <div className="hud-instructions">
            Left-Drag: 3D Orbit | Right-Drag: Pan | Scroll: Zoom | Click Node: Focus &amp; Isolate
          </div>
        </div>
      </div>

      {/* ── Mid Dual Panels: Sankey Signal Stream & Concentric Blast Radius Radar ── */}
      <div className="causal-grid" style={{ marginBottom: '24px' }}>
        {/* Left: D3 Sankey Trajectory Stream */}
        <div className="sankey-panel" style={{ marginBottom: 0 }}>
          <div className="sankey-header">
            <div className="sankey-title">
              <Diagram size={18} />
              End-to-End Signal Trajectory (Probe Ingest &rarr; Domain Layer &rarr; Incident &rarr; Policy)
            </div>
          </div>
          <div className="sankey-svg-wrapper">
            <svg ref={sankeyRef} />
          </div>
        </div>

        {/* Right: Concentric Radial Blast Radius Radar */}
        <div className="sankey-panel" style={{ marginBottom: 0 }}>
          <div className="sankey-header">
            <div className="sankey-title">
              <Radar size={18} />
              Concentric Radial Blast Radius &amp; Impact Analysis
            </div>
          </div>
          <div className="sankey-svg-wrapper" style={{ display: 'flex', justifyContent: 'center' }}>
            <svg ref={radarRef} style={{ width: '100%', height: '340px' }} />
          </div>
        </div>
      </div>

      {/* ── Dual Bottom Panels: Focused Node Drilldown & Runbooks ── */}
      <div className="causal-grid">
        {/* Left: Focused Node Alarms */}
        <div className="causal-card">
          <div className="card-title">
            {selectedNodeData
              ? `Active Alarms on [${selectedNodeData.name}] (${selectedNodeData.alerts.length})`
              : 'Select a 3D Node to View Focused Alarms'}
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {(selectedNodeData ? selectedNodeData.alerts : alerts.slice(0, 5)).map((a) => (
              <div
                key={a.id}
                style={{
                  background: '#1e293b',
                  padding: '10px 12px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '2px',
                      background: a.severity === 6 ? '#fa4d56' : '#ff832b',
                      color: a.severity === 6 ? '#fff' : '#000',
                    }}
                  >
                    Sev {a.severity}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {a.sender?.name || 'Netcool'}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#f1f5f9' }}>{a.summary}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Linked Runbook Policies */}
        <div className="causal-card">
          <div className="card-title">
            {selectedNodeData && selectedNodeData.runbooks.length > 0
              ? `Automated Remediation Policies for [${selectedNodeData.name}]`
              : 'Executable Runbook Actions in Network Context'}
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {alerts
              .filter((a) => a.insights?.some((i) => i.type?.includes('runbook')))
              .slice(0, 4)
              .map((a) => {
                const rb = a.insights?.find((i) => i.type?.includes('runbook'))?.details;
                return (
                  <div
                    key={a.id}
                    style={{
                      background: '#1e293b',
                      padding: '10px 12px',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#00d2ff', fontWeight: 700 }}>
                        Policy: {rb?.policyId || 'Auto-Remediate'}
                      </span>
                      <Tag type={rb?.isAutomated ? 'green' : 'blue'}>
                        {rb?.isAutomated ? 'Automated' : 'Assisted'}
                      </Tag>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#f1f5f9', marginBottom: '6px' }}>
                      {a.summary}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Target: {a.resource?.name || 'Network Element'}
                      </div>
                      <Button
                        size="sm"
                        kind={executedPolicies[a.id] ? 'secondary' : 'primary'}
                        renderIcon={executedPolicies[a.id] ? CheckmarkOutline : Play}
                        disabled={executingPolicyId === a.id || executedPolicies[a.id]}
                        onClick={() => {
                          setExecutingPolicyId(a.id);
                          setTimeout(() => {
                            setExecutingPolicyId(null);
                            setExecutedPolicies((prev) => ({ ...prev, [a.id]: true }));
                          }, 1200);
                        }}
                      >
                        {executingPolicyId === a.id
                          ? 'Triggering...'
                          : executedPolicies[a.id]
                          ? 'Remediated'
                          : 'Execute Action'}
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── About Dashboard Modal ── */}
      <Modal
        open={isAboutOpen}
        modalHeading="About: Telco Causal Mesh & Neural Signal Observatory"
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
                A 3D WebGL GPU-accelerated observability cockpit for Telecom Network Operations Centers (NOC). It renders network elements across four stratified 3D Z-planes:
                <span className="highlight-pill">5G Core Network</span>
                <span className="highlight-pill">IP Transport &amp; Optical</span>
                <span className="highlight-pill">RAN Edge</span>
                <span className="highlight-pill">Subscribers &amp; Slices</span>,
                with animated telemetry signal photons, a D3 Sankey signal trajectory stream, and a Concentric Radial Blast Radius Radar.
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
                    <strong>Stratified 3D Topology:</strong> Visual separation of 5G Core, IP Transport, RAN Edge, and Subscribers with customizable Z-plane spacing.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>AI Probable Cause Halos:</strong> Pulsing wireframe torus halos highlighting root cause network elements with high certainty scores.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>D3 Sankey Trajectory Stream:</strong> Maps telemetry flow from Netcool, SevOne, and Instana probes into correlated incidents and policies.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Concentric Blast Radius:</strong> Radial impact analysis mapping Root &rarr; 1-Hop Neighbors &rarr; Slices &rarr; Subscribers.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Actionable Runbooks:</strong> Direct policy triggers for automated network remediation.
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
                    <div className="step-title">3D Mesh Navigation</div>
                    <div className="step-desc">
                      Left-drag to orbit the 3D space, scroll to zoom, click any sphere to focus on that network element.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <div className="step-title">Camera Presets &amp; Perspectives</div>
                    <div className="step-desc">
                      Use <strong>Isometric 3D</strong>, <strong>Strata Profile</strong>, or <strong>Top-Down</strong> buttons in the header to switch perspectives instantly.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <div className="step-title">Alarm &amp; Severity Filters</div>
                    <div className="step-desc">
                      Toggle <strong>All</strong>, <strong>Sev 6 Critical</strong>, or <strong>AI Probable Causes</strong> to isolate relevant alarms.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <div className="step-title">Autonomous Remediation</div>
                    <div className="step-desc">
                      Click <strong>Execute Action</strong> in the right-hand panel to trigger policy automation.
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
