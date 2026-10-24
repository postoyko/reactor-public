#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# IBM Concert Operate / Cloud Pak for AIOps Dashboard Build & Deploy Script
# User: postoyko
#
# SOURCE OF TRUTH:  dashboards/<name>/        (edit and drop new versions HERE)
# GENERATED COPY:   dashboard-extension/src/components/<name>/   (overwritten on every run; ignored by git)
#
# Usage:  ./deploy-dashboards.sh            normal run
#         FORCE=1 ./deploy-dashboards.sh    overwrite even if the generated copy is newer
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$ROOT_DIR/dashboard-extension"
FORCE="${FORCE:-0}"

# Panel files that are NEVER overwritten in src/panels/ (space-separated file names).
# Where the list comes from, in this order:
#   1. the PROTECT_PANELS environment variable, if set (even to "" to protect nothing)
#   2. the file deploy.protect next to this script (one panel file name per line, # for comments).
#      Concert Workbench's "Protect" switch on the Active Routes Switchboard writes this file.
#   3. otherwise just incident-dashboard.panel.ts
# A protected panel that does not exist in src/panels/ yet is copied once so a fresh checkout still works; after that it is left alone.
PROTECT_FILE="$ROOT_DIR/deploy.protect"
if [ -n "${PROTECT_PANELS+x}" ]; then
  :
elif [ -f "$PROTECT_FILE" ]; then
  PROTECT_PANELS="$({ grep -v '^[[:space:]]*#' "$PROTECT_FILE" || true; } | tr -d '\r' | tr -s '[:space:]' ' ')"
else
  PROTECT_PANELS="incident-dashboard.panel.ts"
fi
[ -z "${PROTECT_PANELS// /}" ] || echo "🔒 Protected panel files (never overwritten): ${PROTECT_PANELS}"

is_protected() {
  case " $PROTECT_PANELS " in *" $1 "*) return 0 ;; esac
  return 1
}

echo "======================================================================"
echo "⚡ Building & Deploying Concert Operate Custom Dashboards"
echo "======================================================================"

[ -d "$EXT_DIR" ] || { echo "❌ $EXT_DIR not found. Run this script from the folder that contains dashboard-extension/ and dashboards/."; exit 1; }
mkdir -p "$EXT_DIR/src/panels"

# sync_dashboard <source dir name> <component dir name> <panel file name or "-">
#   Copies dashboards/<source>/ over src/components/<component>/ (nothing already there is deleted),
#   leaves out tests and the panel file, installs the panel file into src/panels/, then verifies the copy.
sync_dashboard() {
  local src_name="$1" comp_name="$2" panel="$3"
  local src="$ROOT_DIR/dashboards/$src_name"
  local dst="$EXT_DIR/src/components/$comp_name"

  [ -d "$src" ] || return 0

  # Warn before overwriting edits that were made in the generated copy instead of the source.
  if [ -d "$dst" ] && [ "$FORCE" != "1" ]; then
    local newer=""
    while IFS= read -r f; do
      rel="${f#"$dst"/}"
      if [ -f "$src/$rel" ] && [ "$f" -nt "$src/$rel" ] && ! cmp -s "$f" "$src/$rel"; then
        newer="$newer\n     - $rel"
      fi
    done < <(find "$dst" -type f)
    if [ -n "$newer" ]; then
      echo "❌ $comp_name: these files in src/components are NEWER than dashboards/$src_name and would be overwritten:"
      printf "%b\n" "$newer"
      echo "   Copy your changes into dashboards/$src_name/ first, or run with FORCE=1 to overwrite anyway."
      exit 1
    fi
  fi

  # Non-destructive: files that exist only in src/components are kept (and listed), never deleted.
  mkdir -p "$dst"
  # Copy everything except tests and the panel file; errors are NOT hidden.
  (cd "$src" && find . -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.panel.ts' ! -name '.DS_Store' -print0 \
    | while IFS= read -r -d '' f; do mkdir -p "$dst/$(dirname "$f")"; cp "$f" "$dst/$f"; done)

  if [ "$panel" != "-" ]; then
    if is_protected "$panel" && [ -f "$EXT_DIR/src/panels/$panel" ]; then
      echo "   🔒 $panel is protected: left exactly as it is in src/panels/"
    else
      [ -f "$src/$panel" ] || { echo "❌ $src_name: panel file $panel is missing from dashboards/$src_name/"; exit 1; }
      cp "$src/$panel" "$EXT_DIR/src/panels/$panel"
    fi
  fi

  # Verify: every source file (bar the excluded ones) must be identical in the destination.
  local bad=0
  while IFS= read -r -d '' f; do
    cmp -s "$src/$f" "$dst/$f" || { echo "❌ $comp_name: $f did not copy correctly"; bad=1; }
  done < <(cd "$src" && find . -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.panel.ts' ! -name '.DS_Store' -print0)
  [ "$bad" = "0" ] || exit 1

  # Tell the user about files that exist only in the generated copy (kept, but worth knowing about).
  local extras=""
  while IFS= read -r f; do
    rel="${f#"$dst"/}"
    [ -f "$src/$rel" ] || extras="$extras $rel"
  done < <(find "$dst" -type f ! -name '.DS_Store')
  [ -z "$extras" ] || echo "   ℹ️  $comp_name: kept files that are not in dashboards/$src_name:$extras"

  local count; count=$(find "$dst" -type f | wc -l | tr -d ' ')
  echo "   ✅ $comp_name: $count files synced"
}

# Step 1: Sync Standalone Dashboards into dashboard-extension
echo "📂 [1/3] Syncing dashboard source files into toolkit..."

sync_dashboard "telco-causal-gen2"        "telco-causal-gen2" "telco-causal-gen2.panel.ts"
sync_dashboard "telco-causal"             "telco-causal"      "telco-causal.panel.ts"
sync_dashboard "telco-command"            "telco-command"     "telco-command.panel.ts"
sync_dashboard "incident-alert-dashboard" "incident-dashboard" "incident-dashboard.panel.ts"
sync_dashboard "xeno-deep"                "xeno-deep"         "cognitive-deep-dive.panel.ts"
sync_dashboard "blast-radius"             "blast-radius"      "blast-radius.panel.ts"
sync_dashboard "incident-atlas"          "incident-atlas"    "incident-atlas.panel.ts"
sync_dashboard "dashboard-builder"        "dashboard-builder" "dashboard-builder.panel.ts"

# The two copies of the Dashboard Designer must match (scaffold/designer is the master; see sync-designer.sh).
if [ -x "$ROOT_DIR/sync-designer.sh" ] && [ -d "$ROOT_DIR/scaffold/designer" ] && [ -d "$ROOT_DIR/dashboards/dashboard-builder" ]; then
  if ! drift="$("$ROOT_DIR/sync-designer.sh" --check)"; then
    echo "❌ dashboard-builder: dashboards/dashboard-builder differs from scaffold/designer in:"
    echo "$drift" | sed 's/^/     /'
    echo "   Run ./sync-designer.sh (master -> build copy) or ./sync-designer.sh --back (keep the edits in the build copy), then deploy again."
    [ "${FORCE:-}" = "1" ] || exit 1
    echo "   FORCE=1: deploying the build copy as it is."
  fi
fi

# The Dashboard Designer must be registered and routed by hand (see its INSTALL.md); fail early instead of deploying a page nobody can reach.
if [ -d "$ROOT_DIR/dashboards/dashboard-builder" ]; then
  grep -q "dashboard-builder.panel" "$EXT_DIR/src/index.js" \
    || { echo "❌ dashboard-builder: src/index.js does not register the panel. See dashboards/dashboard-builder/INSTALL.md step 3."; exit 1; }
  grep -q '"/dashboard-builder"' "$EXT_DIR/config/routes.json" \
    || { echo "❌ dashboard-builder: config/routes.json has no /dashboard-builder route. See INSTALL.md step 4."; exit 1; }
  [ "$(grep -c '"/dashboard-builder"' "$EXT_DIR/config/routes.json")" -ge 2 ] \
    || echo "   ⚠️  dashboard-builder: the route exists but is not listed in menuRoutes, so it will not appear in the menu."
fi

# Sanity check for the Causal Mesh bundle: say which version is about to be built, and fail early if logic.ts is out of date.
GEN2="$EXT_DIR/src/components/telco-causal-gen2"
if [ -f "$GEN2/version.ts" ]; then
  echo "   ℹ️  Telco Causal Mesh version: $(grep -o "v[0-9][0-9.]*" "$GEN2/version.ts" | head -1)"
fi
if [ -d "$GEN2" ]; then
  # Every name imported from ./logic must exist as an export in logic.ts.
  # Checks every .ts/.tsx file (all subfolders) that imports from the logic module (./logic, ../logic, ../../logic ...).
  missing=$(cd "$GEN2" && node -e '
    const fs = require("fs"), path = require("path");
    const read = f => fs.readFileSync(f, "utf8");
    const logic = read("logic.ts");
    const exported = new Set([...logic.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|interface|type|class|enum)\s+([A-Za-z0-9_$]+)/g)].map(m => m[1]));
    for (const m of logic.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g))
      m[1].split(",").map(s => s.trim().replace(/^type\s+/, "")).filter(Boolean).forEach(s => exported.add(s.split(/\s+as\s+/).pop()));
    const hasStar = /export\s*\*\s*from/.test(logic);
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
    const missing = new Set();
    for (const f of walk(".").filter(x => /\.(ts|tsx)$/.test(x) && !/\.test\.tsx?$/.test(x))) {
      for (const m of read(f).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["\x27]([^"\x27]+)["\x27]/g)) {
        if (!m[2].startsWith(".") || path.resolve(path.dirname(f), m[2]) !== path.resolve("logic")) continue;
        m[1].split(",").map(s => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean)
          .forEach(n => { if (!exported.has(n) && !hasStar) missing.add(f + ": " + n); });
      }
    }
    console.log([...missing].join("\n"));
  ') || { echo "❌ telco-causal-gen2: the logic.ts consistency check itself crashed (see error above)."; exit 1; }
  if [ -n "$missing" ]; then
    echo "❌ telco-causal-gen2: logic.ts is out of date. These imports from ./logic do not exist:"
    echo "$missing" | sed 's/^/     - /'
    echo "   Replace dashboards/telco-causal-gen2/ with the latest files (all of them, not just some)."
    exit 1
  fi
fi

echo "   ✅ Sync complete."

# Panel files belong in src/panels/. A copy inside src/components/ cannot compile (its relative imports point at the wrong
# folder) and, because TypeScript checks every file under src/, it fails the whole build. Move any such file out of src/
# (into .stray-panels/ next to this script, with a .stray suffix so nothing compiles it). Nothing is deleted.
STRAY_LIST="$(find "$EXT_DIR/src/components" -type f -name '*.panel.ts' 2>/dev/null || true)"
if [ -n "$STRAY_LIST" ]; then
  echo "   ⚠️  Panel files were found inside src/components/ (they belong in src/panels/ and break the build there)."
  echo "      Moving them to $ROOT_DIR/.stray-panels/ :"
  while IFS= read -r f; do
    rel="${f#"$EXT_DIR/src/components/"}"
    mkdir -p "$ROOT_DIR/.stray-panels/$(dirname "$rel")"
    mv "$f" "$ROOT_DIR/.stray-panels/$rel.stray"
    echo "        - src/components/$rel"
  done <<< "$STRAY_LIST"
fi

# A dashboard you deleted leaves its panel file, its registration in src/index.js and its route behind, and TypeScript then fails the whole
# build ("Cannot find module ../components/<name>/..."). Move such panels aside and unregister them (backups in .stray-panels/, nothing deleted).
if [ -f "$ROOT_DIR/prune-orphan-panels.mjs" ]; then
  node "$ROOT_DIR/prune-orphan-panels.mjs" "$EXT_DIR" "$ROOT_DIR" || echo "   ⚠️  prune-orphan-panels.mjs failed; continuing (the build will show any remaining problem)."
fi

# Step 2: Production Webpack Build
echo "📦 [2/3] Building production webpack bundle..."
cd "$EXT_DIR"
# The build needs the extension's own dependencies (npm-run-all, webpack, ...). Install them if absent.
if [ ! -x node_modules/.bin/npm-run-all ] || [ ! -x node_modules/.bin/webpack ]; then
  echo "   📥 Extension dependencies are missing - running npm install (first time only, can take a few minutes)..."
  npm install || { echo "❌ npm install failed in $EXT_DIR. Fix the error above, then deploy again."; exit 1; }
fi
# Several dashboards (Telco Causal Mesh, Command Center, RAN Slicing, ARK) draw their 3D views with 'three', which the
# toolkit's package.json does not list. Install it (and its type declarations) if it is missing; npm records it in package.json.
if grep -rqE "from ['\"]three['\"]" src/components 2>/dev/null; then
  if [ ! -d node_modules/three ]; then
    echo "   📥 Installing 'three' (needed by the 3D dashboards)..."
    npm install --no-audit --no-fund three@0.160.0 || { echo "❌ npm install three failed. Fix the error above, then deploy again."; exit 1; }
  fi
  if [ ! -d node_modules/@types/three ]; then
    npm install --no-audit --no-fund -D @types/three@0.160.0 || { echo "❌ npm install @types/three failed. Fix the error above, then deploy again."; exit 1; }
  fi
fi
npm run build

# Step 3: Fast Upload & Cluster Synchronization
echo "🚀 [3/3] Uploading bundle and syncing OpenShift CR & ConfigMap..."
node fast-deploy.mjs

echo "======================================================================"
echo "✨ DONE! Refresh Concert Operate (Cmd+Shift+R or Ctrl+F5) to test."
echo "======================================================================"
