/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */
if (typeof window !== 'undefined') {
  // Ensure process polyfill exists for browser micro-frontends
  if (typeof window.process === 'undefined') {
    window.process = { env: {}, emitWarning: () => {} };
  } else {
    window.process.env = window.process.env || {};
    window.process.emitWarning = window.process.emitWarning || (() => {});
  }

  const nonce = window.akoraConfig?.cspNonce ||
    document.querySelector('script[nonce]')?.getAttribute('nonce') ||
    document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');
  if (nonce) {
    __webpack_nonce__ = nonce;
  }
}
