/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectWebGL, getQualityProfile } from './webgl';

const docWith = (getContext: (type: string) => any): Document =>
  ({ createElement: () => ({ getContext }) } as unknown as Document);

describe('detectWebGL', () => {
  it('prefers WebGL2', () => {
    const lose = jest.fn();
    const result = detectWebGL(docWith(type => (type === 'webgl2' ? { getExtension: (): any => ({ loseContext: lose }) } : null)));
    expect(result).toEqual({ supported: true, version: 2 });
    expect(lose).toHaveBeenCalled();
  });

  it('falls back to WebGL1', () => {
    const result = detectWebGL(docWith(type => (type === 'webgl' ? { getExtension: (): any => null } : null)));
    expect(result).toEqual({ supported: true, version: 1 });
  });

  it('reports unsupported when no context can be created', () => {
    const result = detectWebGL(docWith((): any => null));
    expect(result.supported).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('never throws', () => {
    const result = detectWebGL(docWith((): any => { throw new Error('blocked by policy'); }));
    expect(result).toMatchObject({ supported: false, reason: 'blocked by policy' });
  });
});

describe('getQualityProfile', () => {
  it('scales quality down as the graph grows', () => {
    const small = getQualityProfile(100, 150);
    const mid = getQualityProfile(2000, 3000);
    const big = getQualityProfile(10000, 15000);
    expect(small.tier).toBe('high');
    expect(mid.tier).toBe('balanced');
    expect(big.tier).toBe('performance');
    expect(small.nodeResolution).toBeGreaterThan(mid.nodeResolution);
    expect(mid.nodeResolution).toBeGreaterThan(big.nodeResolution);
    expect(small.linkParticlesAllowed).toBe(true);
    expect(big.linkParticlesAllowed).toBe(false);
  });
});
