/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WebGLSupport {
  supported: boolean;
  version: 0 | 1 | 2;
  reason?: string;
}

export interface QualityProfile {
  nodeResolution: number;
  warmupTicks: number;
  cooldownTicks: number;
  alphaDecay: number;
  linkParticlesAllowed: boolean;
  tier: 'high' | 'balanced' | 'performance';
}

/** Probes for a usable WebGL context without keeping it alive. */
export function detectWebGL(doc: Document = document): WebGLSupport {
  try {
    const canvas = doc.createElement('canvas');
    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl2) {
      gl2.getExtension('WEBGL_lose_context')?.loseContext();
      return { supported: true, version: 2 };
    }
    const gl1 = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl1) {
      gl1.getExtension('WEBGL_lose_context')?.loseContext();
      return { supported: true, version: 1 };
    }
    return { supported: false, version: 0, reason: 'The browser could not create a WebGL context.' };
  } catch (e) {
    return { supported: false, version: 0, reason: e instanceof Error ? e.message : 'WebGL probing failed.' };
  }
}

/**
 * Scales render cost to graph size so large estates stay interactive on integrated GPUs:
 * fewer sphere segments, a shorter layout run and no link particles as counts grow.
 */
export function getQualityProfile(nodeCount: number, linkCount: number): QualityProfile {
  const load = nodeCount + linkCount * 0.5;
  if (load > 6000) {
    return { nodeResolution: 4, warmupTicks: 20, cooldownTicks: 120, alphaDecay: 0.06, linkParticlesAllowed: false, tier: 'performance' };
  }
  if (load > 1500) {
    return { nodeResolution: 6, warmupTicks: 40, cooldownTicks: 200, alphaDecay: 0.04, linkParticlesAllowed: false, tier: 'balanced' };
  }
  return { nodeResolution: 12, warmupTicks: 0, cooldownTicks: 300, alphaDecay: 0.0228, linkParticlesAllowed: true, tier: 'high' };
}
