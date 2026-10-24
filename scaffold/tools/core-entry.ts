// Entry for public/designer-core.js: the Designer's own pure logic, shared with Studio's Layout Editor and server
// so layouts are validated by exactly the code that loads them in Concert Operate.
export { GRID_COLS } from '../designer/types';
export { compactTree, slotOwner, slotsOf } from '../designer/nesting';
export { compact, moveItem, resizeItem, findSpot, gridHeight, clampBox, overlaps } from '../designer/grid';
export { NATIVE, TILES, defaultConfig, defaultTitle, registerExtraTiles, minSize, isKnownType, nativeDef, tileDef } from '../designer/registry';
export { FIELDS, fieldsOf } from '../designer/rows';
export { sanitizeDashboard, sanitizeSettings, sanitizeTileProps, exportJson, importJson, newId, FILE_KIND } from '../designer/store';
export { isImageSrc, imageMimeOk, IMAGE_ACCEPT, IMAGE_MAX_BYTES, describeImageError } from '../designer/image';
export { TEMPLATES, availableTemplates } from '../designer/templates';
export { SPECS, GROUPS, carbonSpec, carbonDefaults, dataOn } from '../designer/carbon-specs';
