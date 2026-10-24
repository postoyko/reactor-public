#!/bin/bash
# Regenerates public/designer-core.js from designer/*.ts (needs esbuild; only for developers of Studio).
cd "$(dirname "$0")/.." && npx esbuild tools/core-entry.ts --bundle --format=esm --platform=neutral --target=es2020 --outfile=public/designer-core.js
