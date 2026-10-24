import { severityNum } from './severity';
/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { layerColorHex, layerDef, layerZ } from './classification';
import { LayoutMode, Link3DGen2, Node3DGen2 } from './logic';
import { ColorMode } from './types';

/** Telco plane colours (kept for compatibility). Other schemes: `layerColorHex(id)`. */
export const LAYER_GRID_COLORS = [0x6929c4, 0xba4e00, 0x198038, 0x0043ce];

export const PARTICLE_COUNT = 150;

// ── three.js helpers ──────────────────────────────────────────────────────────

export function detectWebGL(): { ok: boolean; reason?: string } {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl');
    if (!gl) return { ok: false, reason: 'The browser could not create a WebGL context.' };
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'WebGL probing failed.' };
  }
}

export function createTextSprite(text: string, layer: number, isProbableCause: boolean, isSpof: boolean, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 70;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const glyph = isProbableCause ? '★ ' : isSpof ? '⚠ ' : `${layerDef(layer).glyph} `;
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isProbableCause ? '#6929c4' : isSpof ? '#da1e28' : color;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowBlur = 6;
    const clean = text.length > 17 ? `${text.slice(0, 16)}…` : text;
    ctx.fillText(`${glyph}${clean}`, 8, 44);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(30, 7, 1);
  return sprite;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  (Array.isArray(material) ? material : [material]).forEach((m: any) => {
    m.map?.dispose?.();
    m.dispose();
  });
}

/** Removes and disposes everything in a group except the shared geometries/materials the scene owns. */
export function clearGroup(group: THREE.Object3D, shared: Set<unknown>) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i] as any;
    group.remove(child);
    if (child.geometry && !shared.has(child.geometry)) child.geometry.dispose();
    if (child.material && !shared.has(child.material)) disposeMaterial(child.material);
  }
}

export const LAYER_HEX: Record<number, number> = { 1: 0x6929c4, 2: 0xba4e00, 3: 0x198038, 4: 0x0043ce };
export const layerHex = (layer: number): number => LAYER_HEX[layer] ?? layerColorHex(layer);

export const ENTITY_HEX: Record<string, number> = { '5gCoreFunction': 0x6929c4, transportRouter: 0x0f62fe, ranCellTower: 0x198038, networkSlice: 0xd12771 };

export function nodeColorHex(node: Node3DGen2, mode: ColorMode, isSpof: boolean): number {
  if (mode === 'strata') return layerHex(node.layer);
  if (mode === 'deviceType') return ENTITY_HEX[node.entityType] ?? (layerDef(node.layer).scheme === 'telco' ? 0xd12771 : layerHex(node.layer));
  if (mode === 'centrality') {
    if (isSpof) return 0xda1e28;
    if (node.betweenness === null) return 0x8d8d8d;
    return node.betweenness >= 75 ? 0xba4e00 : node.betweenness >= 45 ? 0xb28600 : 0x0f62fe;
  }
  if (mode === 'neural' && node.isProbableCause) return 0x6929c4;
  return severityNum(node.severity);
}

export const nodeRadius = (n: Node3DGen2) => (n.isProbableCause ? 7.5 : Math.max(4.2, Math.min(8.5, 3.2 + n.alertCount)));

export interface NodeVisual {
  node: Node3DGen2;
  mesh: THREE.Mesh;
  radius: number;
  halo?: THREE.Mesh;
  spofHalo?: THREE.Mesh;
  selHalo?: THREE.Mesh;
  routeRing?: THREE.Mesh;
  label?: THREE.Sprite;
  labelKey?: string;
}

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  gridGroup: THREE.Group;
  nodeGroup: THREE.Group;
  lineGroup: THREE.Group;
  overlayGroup: THREE.Group;
  shared: Set<unknown>;
  geoms: Record<'octa' | 'cyl' | 'cone' | 'icosa' | 'box' | 'dodeca' | 'tetra' | 'sphere' | 'prism' | 'torus' | 'spofTorus' | 'selTorus' | 'routeRing', THREE.BufferGeometry>;
  mats: Record<'halo' | 'spofHalo' | 'selHalo' | 'routeSrc' | 'routeTgt' | 'routeRing', THREE.MeshBasicMaterial>;
  visuals: Map<string, NodeVisual>;
  visibleNodes: Node3DGen2[];
  visibleLinks: Link3DGen2[];
  lines: THREE.Line[];
  pickMeshes: THREE.Mesh[];
  route: { line: THREE.Line; nodes: Node3DGen2[] } | null;
  particleGeom: THREE.BufferGeometry;
  particleMaterial: THREE.PointsMaterial;
  particleProgress: Float32Array;
  particleLink: Int32Array;
  alpha: number;
  dirty: boolean;
  contextLost: boolean;
}

/** One physics step. Stratified: 2D forces with a pull to the layer plane. Organic: full 3D. Constellation: static rings. */
export function stepPhysics(s: SceneHandle, mode: LayoutMode, spacing: number, cache: Map<string, { x: number; y: number; z: number }>) {
  if (mode === 'constellation') {
    s.alpha = 0;
    return;
  }
  const nodes = s.visibleNodes;
  const threeD = mode === 'organic';
  s.alpha *= 0.985;
  const alpha = s.alpha;

  if (!threeD) {
    nodes.forEach(n => {
      n.z += (layerZ(n.layer, spacing) - n.z) * 0.2;
      n.vz = 0;
    });
  }
  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const n2 = nodes[j];
      const dx = n1.x - n2.x;
      const dy = n1.y - n2.y;
      const dz = threeD ? n1.z - n2.z : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 1.0);
      if (dist < 130) {
        const force = Math.min(2.0, (130 - dist) / Math.max(dist, 10)) * 0.12 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        n1.vx += fx; n1.vy += fy; n1.vz += fz;
        n2.vx -= fx; n2.vy -= fy; n2.vz -= fz;
      }
    }
    n1.vx -= n1.x * 0.003 * alpha;
    n1.vy -= n1.y * 0.003 * alpha;
    if (threeD) n1.vz -= n1.z * 0.003 * alpha;
  }
  s.visibleLinks.forEach(l => {
    const dx = l.target.x - l.source.x;
    const dy = l.target.y - l.source.y;
    const dz = threeD ? l.target.z - l.source.z : 0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 1.0);
    const spring = (dist - 65) * 0.025 * alpha;
    const fx = (dx / dist) * spring;
    const fy = (dy / dist) * spring;
    const fz = (dz / dist) * spring;
    l.source.vx += fx; l.source.vy += fy; l.source.vz += fz;
    l.target.vx -= fx; l.target.vy -= fy; l.target.vz -= fz;
  });
  nodes.forEach(n => {
    n.vx = Math.max(-5, Math.min(5, n.vx * 0.72));
    n.vy = Math.max(-5, Math.min(5, n.vy * 0.72));
    n.x += n.vx;
    n.y += n.vy;
    if (threeD) {
      n.vz = Math.max(-5, Math.min(5, n.vz * 0.72));
      n.z += n.vz;
    }
    cache.set(n.id, { x: n.x, y: n.y, z: n.z });
  });
}
