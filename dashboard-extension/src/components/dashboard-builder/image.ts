/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Image widgets keep the picture inside the dashboard as a data URI, so there is no file to host and nothing is
 * fetched from another site. Only formats a browser can show are accepted; anything else must be converted first
 * (Concert Workbench's Layout Editor converts TIFF). SVG is allowed because an <img> never runs scripts in it.
 */

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
/** Largest file accepted, in bytes (the base64 text is about a third bigger). */
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const IMAGE_MAX_CHARS = Math.ceil(IMAGE_MAX_BYTES * 4 / 3) + 200;

const SRC_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isImageSrc(v: unknown): v is string {
  return typeof v === 'string' && v.length <= IMAGE_MAX_CHARS && SRC_RE.test(v);
}

export function imageMimeOk(mime: string): boolean {
  return IMAGE_MIME.includes(mime);
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp';

export function describeImageError(name: string, mime: string): string {
  if (/tiff?$/i.test(name) || mime === 'image/tiff') {
    return 'TIFF cannot be shown in a browser. Convert it to PNG or JPEG first (Concert Workbench’s Layout Editor does this for you).';
  }
  return `“${name}” is not a supported picture. Use PNG, JPEG, GIF, WebP, SVG or BMP.`;
}
