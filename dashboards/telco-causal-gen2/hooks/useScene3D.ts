/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import * as THREE from 'three';
import { SCHEMES, layerColorHex, layerDef, layerZ } from '../classification';
import { PARTICLE_COUNT, SceneHandle, clearGroup, createTextSprite, disposeMaterial, nodeColorHex, nodeRadius, stepPhysics } from '../scene3d';
import { Link3DGen2, Node3DGen2 } from '../logic';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';
import { useMeshAnalysis } from './useMeshAnalysis';
import { useMeshActions } from './useMeshActions';

export function useScene3D(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph> & ReturnType<typeof useMeshAnalysis> & ReturnType<typeof useMeshActions>) {
  const { layerScheme, activeLayers, activeRoutePath, canvasRef, colorMode, currentLookAtRef, effectiveActiveNodeIds, filterMode, glEpoch, graph, layerSpacing, layoutMode, links3D, live, nodes3D, positionCache, routeSourceId, routeTargetId, sankeyActiveNodeIds, sceneRef, selectedLink, selectedNodeId, setGlEpoch, setGlError, setGlLost, sphericalRef, spofAnalysis, targetLookAtRef, view, webgl, webglOk } = m;
  // ── WebGL scene: created once, updated in place ─────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webgl.ok || view !== '3d') return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      setGlError(e instanceof Error ? e.message : 'The WebGL renderer could not be created.');
      return undefined;
    }

    const host = canvas.parentElement as HTMLElement;
    const size = { w: host.clientWidth || 800, h: host.clientHeight || 540 };
    // Third argument false: the canvas is sized by CSS (100% of its container); three only sets the drawing buffer.
    renderer.setSize(size.w, size.h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf4f7fa, 0.0012);
    const camera = new THREE.PerspectiveCamera(50, size.w / size.h, 1, 2200);
    camera.position.set(0, 190, 440);

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const dir1 = new THREE.DirectionalLight(0x0f62fe, 1.2);
    dir1.position.set(220, 320, 220);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x8a3ffc, 0.8);
    dir2.position.set(-220, -220, -220);
    scene.add(dir2);
    const point = new THREE.PointLight(0x0f62fe, 1.2, 400);
    scene.add(point);

    const gridGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    const lineGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    [gridGroup, lineGroup, nodeGroup, overlayGroup].forEach(g => scene.add(g));

    const geoms = {
      octa: new THREE.OctahedronGeometry(1, 0),
      cyl: new THREE.CylinderGeometry(1, 1, 0.9, 8),
      cone: new THREE.ConeGeometry(1.1, 1.8, 4),
      icosa: new THREE.IcosahedronGeometry(1, 1),
      box: new THREE.BoxGeometry(1.5, 1.5, 1.5),
      dodeca: new THREE.DodecahedronGeometry(1, 0),
      tetra: new THREE.TetrahedronGeometry(1.2, 0),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      prism: new THREE.CylinderGeometry(1, 1, 1.2, 6),
      torus: new THREE.TorusGeometry(8, 0.85, 12, 32),
      spofTorus: new THREE.TorusGeometry(9.5, 1.2, 14, 32),
      selTorus: new THREE.TorusGeometry(11, 1.0, 14, 32),
      routeRing: new THREE.RingGeometry(8, 10, 24),
    };
    const wire = (color: number) => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.95 });
    const mats = {
      halo: wire(0x6929c4),
      spofHalo: wire(0xda1e28),
      selHalo: wire(0x0f62fe),
      routeSrc: wire(0x22c55e),
      routeTgt: wire(0xec4899),
      routeRing: new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    };
    const shared = new Set<unknown>([...Object.values(geoms), ...Object.values(mats)]);

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
    const particleMaterial = new THREE.PointsMaterial({ color: 0x0f62fe, size: 4.2, transparent: true, opacity: 0.92 });
    const particles = new THREE.Points(particleGeom, particleMaterial);
    particles.frustumCulled = false;
    scene.add(particles);

    const s: SceneHandle = {
      renderer, scene, camera, gridGroup, nodeGroup, lineGroup, overlayGroup, shared, geoms, mats,
      visuals: new Map(), visibleNodes: [], visibleLinks: [], lines: [], pickMeshes: [], route: null,
      particleGeom, particleMaterial,
      particleProgress: new Float32Array(PARTICLE_COUNT),
      particleLink: new Int32Array(PARTICLE_COUNT),
      alpha: 1, dirty: true, contextLost: false,
    };
    sceneRef.current = s;

    const raycaster = new THREE.Raycaster();
    (raycaster.params as any).Line = { threshold: 8 };
    const mouse = new THREE.Vector2(-1000, -1000);
    const spherical = sphericalRef.current;

    const setMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
      return rect;
    };
    const pickNode = (): Node3DGen2 | null => {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(s.pickMeshes, false);
      return hits.length ? ((hits[0].object as any).nodeData as Node3DGen2) : null;
    };
    const pickLink = (): Link3DGen2 | null => {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(s.lines, false);
      return hits.length ? ((hits[0].object as any).linkData as Link3DGen2) : null;
    };

    let dragging = false;
    let moved = 0;
    let prevX = 0;
    let prevY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = 0;
      prevX = e.clientX;
      prevY = e.clientY;
      if (live.current.autoRotate) live.current.setAutoRotate(false);
    };
    const onWindowMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      spherical.theta -= dx * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy * 0.005));
    };
    const onHover = (e: MouseEvent) => {
      if (dragging) return;
      const rect = setMouse(e);
      const node = pickNode();
      if (node) {
        live.current.setHovered({ node, x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 });
        canvas.style.cursor = 'pointer';
        return;
      }
      live.current.setHovered(null);
      canvas.style.cursor = pickLink() ? 'pointer' : 'grab';
    };
    const onLeave = () => live.current.setHovered(null);
    const onMouseUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(140, Math.min(850, spherical.radius + e.deltaY * 0.4));
    };
    const onClick = (e: MouseEvent) => {
      if (moved > 4) { moved = 0; return; }
      setMouse(e);
      const node = pickNode();
      const lv = live.current;
      if (node) {
        if (lv.isRoutingMode) {
          if (!lv.routeSourceId) lv.setRouteSourceId(node.id);
          else if (!lv.routeTargetId) lv.setRouteTargetId(node.id);
          else { lv.setRouteSourceId(node.id); lv.setRouteTargetId(null); }
        }
        lv.handleFocusNode(node);
        return;
      }
      const link = pickLink();
      if (link) lv.setSelectedLink(link);
    };
    const onDblClick = (e: MouseEvent) => {
      setMouse(e);
      const node = pickNode();
      if (node) {
        live.current.handleFocusNode(node);
        live.current.handleOpenDeepDive(node);
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setMouse(e);
      const node = pickNode();
      if (node) live.current.setContextMenu({ x: e.clientX, y: e.clientY, node });
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      s.contextLost = true;
      setGlLost(true);
    };
    const onContextRestored = () => {
      s.contextLost = false;
      setGlLost(false);
      setGlEpoch(v => v + 1);
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onHover);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h || (Math.abs(w - size.w) < 2 && Math.abs(h - size.h) < 2)) return;
      size.w = w;
      size.h = h;
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    const sync = () => {
      s.visuals.forEach(v => {
        const n = v.node;
        v.mesh.position.set(n.x, n.y, n.z);
        v.halo?.position.set(n.x, n.y, n.z);
        v.spofHalo?.position.set(n.x, n.y, n.z);
        v.selHalo?.position.set(n.x, n.y, n.z);
        v.routeRing?.position.set(n.x, n.y, n.z);
        v.label?.position.set(n.x, n.y + v.radius + 5.5, n.z);
      });
      s.visibleLinks.forEach((l, i) => {
        const line = s.lines[i];
        if (!line) return;
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, l.source.x, l.source.y, l.source.z);
        pos.setXYZ(1, l.target.x, l.target.y, l.target.z);
        pos.needsUpdate = true;
      });
      if (s.route) {
        const pos = s.route.line.geometry.attributes.position as THREE.BufferAttribute;
        s.route.nodes.forEach((n, i) => pos.setXYZ(i, n.x, n.y, n.z));
        pos.needsUpdate = true;
      }
    };

    let raf = 0;
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (s.contextLost) return;
      const lv = live.current;
      currentLookAtRef.current.lerp(targetLookAtRef.current, 0.08);

      if (s.alpha > 0.003 || s.dirty) {
        if (s.alpha > 0.003) stepPhysics(s, lv.layoutMode, lv.layerSpacing, positionCache.current);
        sync();
        s.dirty = false;
      }

      const posAttr = particleGeom.attributes.position as THREE.BufferAttribute;
      if (s.visibleLinks.length > 0) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const l = s.visibleLinks[s.particleLink[i]];
          if (!l) continue;
          s.particleProgress[i] += 0.009;
          if (s.particleProgress[i] > 1) s.particleProgress[i] = 0;
          const t = s.particleProgress[i];
          posAttr.setXYZ(i, l.source.x + (l.target.x - l.source.x) * t, l.source.y + (l.target.y - l.source.y) * t, l.source.z + (l.target.z - l.source.z) * t);
        }
        posAttr.needsUpdate = true;
      }

      const clock = performance.now() / 1000;
      s.visuals.forEach(v => {
        const pulse = v.mesh.userData.pulse as number | undefined;
        if (pulse && !reducedMotion) {
          (v.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = (v.mesh.userData.base as number) * (0.75 + 0.45 * Math.sin(clock * pulse));
        }
        if (v.halo?.visible) { v.halo.rotation.x += 0.016; v.halo.rotation.y += 0.022; }
        if (v.spofHalo?.visible) { v.spofHalo.rotation.z += 0.018; v.spofHalo.rotation.x -= 0.014; }
      });

      if (lv.autoRotate && !dragging) spherical.theta += 0.0022;
      camera.position.setFromSpherical(spherical);
      camera.position.add(currentLookAtRef.current);
      camera.lookAt(currentLookAtRef.current);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onHover);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      [gridGroup, nodeGroup, lineGroup, overlayGroup].forEach(g => clearGroup(g, shared));
      Object.values(geoms).forEach(g => g.dispose());
      Object.values(mats).forEach(m => m.dispose());
      particleGeom.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [webgl.ok, view]);
  // ── Rebuild scene objects when the graph or visibility changes ──────────────

  const spofIds = spofAnalysis.spofNodeIds;
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    clearGroup(s.gridGroup, s.shared);
    clearGroup(s.nodeGroup, s.shared);
    clearGroup(s.lineGroup, s.shared);
    s.visuals.clear();

    SCHEMES[layerScheme].layers.forEach(def => {
      const layerNum = def.id;
      if (!activeLayers[layerNum]) return;
      const zVal = layerZ(layerNum, layerSpacing);
      const planeHex = layerColorHex(layerNum);
      const grid = new THREE.GridHelper(400, 14, planeHex, 0xd0d7de);
      grid.position.set(0, 0, zVal);
      grid.rotation.x = Math.PI / 2;
      (grid.material as THREE.Material).opacity = 0.32;
      (grid.material as THREE.Material).transparent = true;
      s.gridGroup.add(grid);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(180, 184, 48),
        new THREE.MeshBasicMaterial({ color: planeHex, side: THREE.DoubleSide, transparent: true, opacity: 0.18 })
      );
      ring.position.set(0, 0, zVal);
      s.gridGroup.add(ring);
    });

    const visibleNodes = nodes3D.filter(n => {
      if (!activeLayers[n.layer]) return false;
      if (filterMode === 'critical') return n.severity === 6;
      if (filterMode === 'probable-cause') return n.isProbableCause;
      if (filterMode === 'spof') return spofIds.has(n.id);
      return true;
    });
    const visibleSet = new Set(visibleNodes.map(n => n.id));

    visibleNodes.forEach(n => {
      const geom = s.geoms[layerDef(n.layer).shape];
      const radius = nodeRadius(n);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.35, transparent: true }));
      mesh.scale.set(radius, radius, radius);
      mesh.position.set(n.x, n.y, n.z);
      (mesh as any).nodeData = n;
      s.nodeGroup.add(mesh);

      const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
        const o = new THREE.Mesh(g, m);
        o.visible = false;
        o.position.set(n.x, n.y, n.z);
        s.nodeGroup.add(o);
        return o;
      };
      s.visuals.set(n.id, {
        node: n,
        mesh,
        radius,
        halo: mk(s.geoms.torus, s.mats.halo),
        spofHalo: mk(s.geoms.spofTorus, s.mats.spofHalo),
        selHalo: mk(s.geoms.selTorus, s.mats.selHalo),
        routeRing: mk(s.geoms.routeRing, s.mats.routeRing),
      });
    });

    const visibleLinks = links3D.filter(l => visibleSet.has(l.source.id) && visibleSet.has(l.target.id));
    const lines = visibleLinks.map(l => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(l.source.x, l.source.y, l.source.z),
        new THREE.Vector3(l.target.x, l.target.y, l.target.z),
      ]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ transparent: true }));
      (line as any).linkData = l;
      s.lineGroup.add(line);
      return line;
    });

    s.visibleNodes = visibleNodes;
    s.visibleLinks = visibleLinks;
    s.lines = lines;
    s.pickMeshes = Array.from(s.visuals.values()).map(v => v.mesh);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      s.particleProgress[i] = Math.random();
      s.particleLink[i] = Math.floor(Math.random() * Math.max(1, visibleLinks.length));
    }
    s.particleGeom.setDrawRange(0, visibleLinks.length ? PARTICLE_COUNT : 0);

    // Reheat the layout, gently when most positions were restored from the previous build.
    const restored = graph.restoredPositions;
    s.alpha = layoutMode === 'constellation' ? 0 : restored > 0 && restored === graph.nodes.length ? 0.15 : 1;
    s.dirty = true;
  }, [graph, activeLayers, filterMode, spofIds, layerSpacing, layoutMode, glEpoch, webglOk, view, layerScheme]);
  // ── Restyle in place (selection, lens, dimming, route) without touching geometry ──

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    s.visuals.forEach((v, id) => {
      const n = v.node;
      const isSpof = spofIds.has(id);
      const isSelected = selectedNodeId === id || Boolean(sankeyActiveNodeIds && sankeyActiveNodeIds.has(id));
      const isRouteSrc = routeSourceId === id;
      const isRouteTgt = routeTargetId === id;
      const isRouteNode = Boolean(activeRoutePath && activeRoutePath.some(rn => rn.id === id));
      const dimmed = effectiveActiveNodeIds ? !effectiveActiveNodeIds.has(id) : false;

      const color = nodeColorHex(n, colorMode, isSpof);
      const mat = v.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(color);
      mat.emissive.setHex(color);
      mat.emissiveIntensity = dimmed ? 0.05 : n.isProbableCause ? 0.75 : isSpof ? 0.65 : n.severity >= 6 ? 0.55 : 0.3;
      mat.opacity = dimmed ? 0.12 : 1;
      // Severity pulse: the animate loop modulates around this base. Faster for worse severity; none when dimmed.
      v.mesh.userData.base = mat.emissiveIntensity;
      v.mesh.userData.pulse = dimmed ? 0 : n.severity >= 6 ? 3.2 : n.severity === 5 ? 2.2 : n.isProbableCause ? 1.6 : 0;

      if (v.halo) v.halo.visible = n.isProbableCause && !dimmed;
      if (v.spofHalo) v.spofHalo.visible = isSpof && !dimmed && (colorMode === 'centrality' || filterMode === 'spof' || isSelected);
      if (v.selHalo) {
        v.selHalo.visible = (isSelected || isRouteSrc || isRouteTgt) && !dimmed;
        v.selHalo.material = isRouteSrc ? s.mats.routeSrc : isRouteTgt ? s.mats.routeTgt : s.mats.selHalo;
      }
      if (v.routeRing) v.routeRing.visible = isRouteNode && !dimmed;

      // Labels are canvas textures, so they are only re-made when their content changes.
      const labelKey = `${n.name}|${n.layer}|${n.isProbableCause}|${isSpof}|${isSelected}`;
      if (dimmed) {
        if (v.label) { v.label.visible = false; }
      } else if (v.labelKey !== labelKey || !v.label) {
        if (v.label) {
          s.nodeGroup.remove(v.label);
          disposeMaterial(v.label.material);
        }
        const sprite = createTextSprite(n.name, n.layer, n.isProbableCause, isSpof, isSelected ? '#0f62fe' : '#161616');
        sprite.position.set(n.x, n.y + v.radius + 5.5, n.z);
        s.nodeGroup.add(sprite);
        v.label = sprite;
        v.labelKey = labelKey;
      } else {
        v.label.visible = true;
      }
    });

    s.visibleLinks.forEach((l, i) => {
      const line = s.lines[i];
      if (!line) return;
      const mat = line.material as THREE.LineBasicMaterial;
      const inFocus = effectiveActiveNodeIds ? effectiveActiveNodeIds.has(l.source.id) && effectiveActiveNodeIds.has(l.target.id) : true;
      const isSelectedLine = Boolean(selectedLink && selectedLink.source.id === l.source.id && selectedLink.target.id === l.target.id);
      let color = 0x8c959f;
      let opacity = inFocus ? 0.65 : 0.15;
      if (l.isCausal) { color = 0xda1e28; opacity = 0.95; }
      else if (l.relType === 'routesTo') { color = 0x0f62fe; opacity = 0.85; }
      else if (l.relType === 'dependsOn') { color = 0xba4e00; opacity = 0.8; }
      else if (l.relType === 'connectedTo') { color = 0x0043ce; opacity = 0.7; }
      else if (l.relType === 'hostedOn') { color = 0x6929c4; opacity = 0.75; }
      if (l.kind === 'illustrative') opacity = Math.min(opacity, 0.35);
      mat.color.setHex(isSelectedLine ? 0x0f62fe : color);
      mat.opacity = isSelectedLine ? 1 : effectiveActiveNodeIds && !inFocus ? 0.08 : opacity;
    });

    clearGroup(s.overlayGroup, s.shared);
    s.route = null;
    if (activeRoutePath && activeRoutePath.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(activeRoutePath.map(n => new THREE.Vector3(n.x, n.y, n.z)));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x0f62fe, transparent: true, opacity: 0.98 }));
      s.overlayGroup.add(line);
      s.route = { line, nodes: activeRoutePath };
    }
    s.dirty = true;
  }, [graph, activeLayers, filterMode, spofIds, layerSpacing, layoutMode, glEpoch, webglOk, view, colorMode, selectedNodeId, sankeyActiveNodeIds, effectiveActiveNodeIds, routeSourceId, routeTargetId, activeRoutePath, selectedLink]);

}
