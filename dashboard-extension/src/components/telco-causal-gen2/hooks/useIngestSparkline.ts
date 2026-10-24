/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useElementSize } from './useElementSize';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';

export function useIngestSparkline(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph>) {
  const { rightOpen, sparklineRef, telemetryMetrics } = m;
  // ── Live Ingest Velocity Sparkline Renderer (32px High-DPI) ─────────────────

  const box = useElementSize(() => sparklineRef.current, [rightOpen]);
  useEffect(() => {
    if (!sparklineRef.current) return;
    const canvas = sparklineRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.width || 600;
    // Fills its box when the card has been given extra height (dividers, section tiles); otherwise the usual 32px.
    const h = canvas.closest('.tc-fill-spark') ? Math.max(Math.round(rect.height) || 32, 32) : 32;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const bins = telemetryMetrics.sparklineBins;
    if (!bins || bins.length === 0) return;

    const maxVal = Math.max(...bins.map((b) => b.rawCount), 1);
    const stepX = (w - 16) / Math.max(bins.length - 1, 1);
    const startX = 8;
    const padY = 4;
    const usableH = h - padY * 2;

    const avgCount = bins.reduce((acc, b) => acc + b.rawCount, 0) / bins.length;
    const avgY = h - padY - (avgCount / maxVal) * usableH;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(0, avgY);
    ctx.lineTo(w, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    const points = bins.map((b, i) => {
      const x = startX + i * stepX;
      const y = h - padY - (b.rawCount / maxVal) * usableH;
      return { x, y, rawCount: b.rawCount, count: b.count, time: b.time };
    });

    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0, 'rgba(15, 98, 254, 0.22)');
    fillGrad.addColorStop(0.6, 'rgba(105, 41, 196, 0.08)');
    fillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + pt.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, pt.y, pt.x, pt.y);
      }
    });
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.lineTo(points[0].x, h);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    const strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
    strokeGrad.addColorStop(0, '#0f62fe');
    strokeGrad.addColorStop(0.5, '#0043ce');
    strokeGrad.addColorStop(1, '#6929c4');

    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + pt.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, pt.y, pt.x, pt.y);
      }
    });
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    let peakIdx = 0;
    let peakVal = -1;
    bins.forEach((b, i) => {
      if (b.rawCount > peakVal) {
        peakVal = b.rawCount;
        peakIdx = i;
      }
    });

    const peakPt = points[peakIdx];
    if (peakPt) {
      ctx.beginPath();
      ctx.arc(peakPt.x, peakPt.y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = '#da1e28';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [telemetryMetrics, rightOpen, box.w, box.h]);

}
