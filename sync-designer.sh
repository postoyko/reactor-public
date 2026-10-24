#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Keeps the two copies of the Dashboard Designer identical.
#
#   scaffold/designer/            the master copy (Concert Workbench's "Install / Update Designer" copies it)
#   dashboards/dashboard-builder/ what deploy-dashboards.sh builds from
#
# Generated files are never copied: default-layout.ts, settings-schema.ts, tiles-extra.ts and published/ are
# written by Concert Workbench into dashboards/dashboard-builder/ only.
#
# Usage:  ./sync-designer.sh            scaffold/designer -> dashboards/dashboard-builder (the normal direction)
#         ./sync-designer.sh --back     dashboards/dashboard-builder -> scaffold/designer (after editing the deployed copy)
#         ./sync-designer.sh --check    list the files that differ; exit 1 if any do (used by deploy-dashboards.sh)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER="$ROOT_DIR/scaffold/designer"
BUILD="$ROOT_DIR/dashboards/dashboard-builder"
GENERATED="default-layout.ts settings-schema.ts tiles-extra.ts"

is_generated() { for g in $GENERATED; do [ "$1" = "$g" ] && return 0; done; return 1; }

differing() {
  for f in "$MASTER"/* "$BUILD"/*; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    is_generated "$b" && continue
    cmp -s "$MASTER/$b" "$BUILD/$b" 2>/dev/null || echo "$b"
  done | sort -u
}

mode="${1:-}"
if [ "$mode" = "--check" ]; then
  diffs="$(differing)"
  [ -z "$diffs" ] && exit 0
  echo "$diffs"
  exit 1
fi

from="$MASTER"; to="$BUILD"
[ "$mode" = "--back" ] && { from="$BUILD"; to="$MASTER"; }
mkdir -p "$to"
n=0
for f in "$from"/*; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  is_generated "$b" && continue
  if ! cmp -s "$f" "$to/$b" 2>/dev/null; then cp "$f" "$to/$b"; echo "  $b"; n=$((n + 1)); fi
done
echo "✅ $n file(s) copied from ${from#$ROOT_DIR/} to ${to#$ROOT_DIR/}"
