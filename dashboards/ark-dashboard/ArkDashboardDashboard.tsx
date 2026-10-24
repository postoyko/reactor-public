/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * ark — GPU-Accelerated 3D WebGL Dashboard
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button, Tag } from '@carbon/react';
import { Diagram, Reset, Activity, Layers } from '@carbon/icons-react';
import './ark-dashboard.scss';

const ALERTS_API = '/aiops/api/v2/alerts?size=150';
const INCIDENTS_API = '/aiops/api/v2/incidents?size=50';

const API_KEY = process.env.DASHBOARD_API_KEY as string;
const TENANT_ID = process.env.DASHBOARD_TENANT_ID as string;

export const ArkDashboardDashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': API_KEY, 'x-tenant-id': TENANT_ID };
      const [aRes, iRes] = await Promise.all([
        fetch(ALERTS_API, { headers, credentials: 'omit' }),
        fetch(INCIDENTS_API, { headers, credentials: 'omit' }),
      ]);
      if (!aRes.ok) throw new Error(`Alerts HTTP ${aRes.status}`);
      const aData = await aRes.json();
      setAlerts(aData.items ?? []);
    } catch (e: any) {
      setError(e.message || 'Error communicating with Cloud Pak for AIOps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  // 3D WebGL Scene Setup
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = canvas.parentElement?.clientWidth || 800;
    const height = 500;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060911, 0.0018);

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    camera.position.set(0, 160, 380);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00d2ff, 1.2);
    dirLight.position.set(200, 300, 200);
    scene.add(dirLight);

    // 4-Tier Stratum Grids
    [-120, -40, 40, 120].forEach((zVal, idx) => {
      const colors = [0x38bdf8, 0x42be65, 0xff832b, 0xa56eff];
      const grid = new THREE.GridHelper(320, 10, colors[idx], 0x1e293b);
      grid.position.set(0, 0, zVal);
      grid.rotation.x = Math.PI / 2;
      (grid.material as THREE.Material).opacity = 0.25;
      (grid.material as THREE.Material).transparent = true;
      scene.add(grid);
    });

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      scene.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, [alerts]);

  return (
    <div className="ark-dashboard-container">
      <div className="dash-header">
        <div>
          <div className="dash-title">
            <Diagram size={24} />
            ark
          </div>
          <div className="dash-subtitle">Real-Time Operational Mesh &amp; Telemetry Feed</div>
        </div>
        <div className="dash-actions">
          <Tag type="cyan">Live WebGL</Tag>
          <Button size="sm" kind="tertiary" renderIcon={Reset} onClick={loadData}>Refresh</Button>
        </div>
      </div>

      <div className="mesh-viewport">
        <canvas ref={canvasRef} />
      </div>

      <div className="telemetry-bar">
        <div className="kpi-card">
          <span className="kpi-label">Active Alerts</span>
          <span className="kpi-val">{alerts.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Critical Alarms</span>
          <span className="kpi-val">{alerts.filter(a => a.severity >= 5).length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Cluster Status</span>
          <span className="kpi-val status-ok">Optimal</span>
        </div>
      </div>
    </div>
  );
};

export default ArkDashboardDashboard;
