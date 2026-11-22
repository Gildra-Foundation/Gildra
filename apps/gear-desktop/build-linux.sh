#!/usr/bin/env bash
# Build the portable Windows x64 application on Linux.
set -euo pipefail
desktop=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$desktop/../.." && pwd)
: "${SIMC_DIR:?Set SIMC_DIR to the unpacked SimulationCraft source directory}"
: "${MINGW_CXX:?Set MINGW_CXX to the LLVM-MinGW x86_64 clang++ executable}"
: "${NODE_WIN_DIR:?Set NODE_WIN_DIR to the extracted official Node.js Windows x64 directory}"
: "${GEAR_DIST:?Set GEAR_DIST to a new output directory}"
: "${ELECTRON_ZIP:?Set ELECTRON_ZIP to the Electron 45.4.1 Windows x64 ZIP}"
mkdir -p "$GEAR_DIST/runtime/profiles" "$GEAR_DIST/licenses"
out=$(realpath "$GEAR_DIST")
engine=$(realpath "$SIMC_DIR")
compiler=$(cd "$(dirname "$MINGW_CXX")" && pwd)/$(basename "$MINGW_CXX")
node_win=$(realpath "$NODE_WIN_DIR")
patches=("$repo/infra/simc/gear-metadata.patch" "$repo/infra/simc/batch-initialization.patch" "$repo/infra/simc/auction-armor-reads.patch")
if ! (cd "$engine" && git apply --reverse --check "${patches[@]}") 2>/dev/null; then
  (cd "$engine" && git apply --check "${patches[@]}" && git apply "${patches[@]}")
fi
# libc++ requires vector to be explicitly included by the pinned source tree.
make -C "$engine/engine" -j"${JOBS:-4}" release OS=WINDOWS PATHSEP=/ CXX="$compiler" SC_NO_NETWORKING=1 \
    'OPTS=-O1 -include vector -DSC_GIT_REV=\"18428cd\" -DSC_GIT_BRANCH=\"HEAD\"'
cp "$engine/engine/simc.exe" "$node_win/node.exe" "$out/runtime/"
"$(dirname "$compiler")/llvm-strip" "$out/runtime/simc.exe"
cp -R "$engine/profiles/MID2/." "$out/runtime/profiles/"
(cd "$repo/backend" && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$out/runtime/gear-engine.exe" ./cmd/gear-desktop-engine)
(cd "$desktop/runtime" && npm ci --workspaces=false --no-audit --no-fund && node build.mjs "$out/runtime/planner.mjs")
echo "2ba6223afa9121f42831fefe92c434334907540165294fc56697449d12e7cfe9  $ELECTRON_ZIP" | sha256sum -c -
unzip -qo "$ELECTRON_ZIP" -d "$out"
mv "$out/electron.exe" "$out/Gildra Gear.exe"
(cd "$repo" && npm ci --ignore-scripts --no-audit --no-fund)
(cd "$desktop/runtime" && node build-ui.mjs "$out/resources/app")
cp "$desktop/README-RU.txt" "$out/"
cp "$repo/LICENSE" "$out/licenses/Gildra.txt"
cp "$repo/NOTICE" "$out/licenses/Gildra-NOTICE.txt"
cp "$(go env GOROOT)/LICENSE" "$out/licenses/Go-runtime.txt"
(cd "$repo/backend" && go list -deps -f '{{if .Module}}{{if not .Module.Main}}{{.Module.Path}} {{.Module.Dir}}{{end}}{{end}}' ./cmd/gear-desktop-engine) |
  sort -u | while read -r module path; do
    if [[ -z "$module" ]]; then continue; fi
    for file in "$path"/{LICENSE*,COPYING*,NOTICE*}; do
      if [[ -f "$file" ]]; then cp "$file" "$out/licenses/${module//\//-}-$(basename "$file")"; fi
    done
  done
cp "$node_win/LICENSE" "$out/licenses/Node.txt"
cp "$engine/COPYING" "$out/licenses/SimulationCraft.txt"
for license in "$engine"/LICENSE.*; do cp "$license" "$out/licenses/SimulationCraft-${license##*.}.txt"; done
