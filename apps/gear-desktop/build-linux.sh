#!/usr/bin/env bash
# Build the portable Windows x64 application on Linux.
set -euo pipefail
desktop=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$desktop/../.." && pwd)
: "${SIMC_DIR:?Set SIMC_DIR to the unpacked SimulationCraft source directory}"
: "${MINGW_CXX:?Set MINGW_CXX to the LLVM-MinGW x86_64 clang++ executable}"
: "${NODE_WIN_DIR:?Set NODE_WIN_DIR to the extracted official Node.js Windows x64 directory}"
: "${GEAR_DIST:?Set GEAR_DIST to a new output directory}"
: "${NUGET_PACKAGES:=$repo/apps/gear-desktop/windows/obj/nuget}"
export NUGET_PACKAGES
mkdir -p "$GEAR_DIST/runtime/profiles" "$GEAR_DIST/licenses"
out=$(realpath "$GEAR_DIST")
engine=$(realpath "$SIMC_DIR")
compiler=$(cd "$(dirname "$MINGW_CXX")" && pwd)/$(basename "$MINGW_CXX")
node_win=$(realpath "$NODE_WIN_DIR")
patches=("$repo/infra/simc/gear-metadata.patch" "$repo/infra/simc/batch-initialization.patch")
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
dotnet publish "$desktop/windows/Gildra.Gear.csproj" -r win-x64 -c Release --self-contained true -o "$out"
cp "$desktop/README-RU.txt" "$out/"
cp "$NUGET_PACKAGES/microsoft.web.webview2/1.0.4370.26/runtimes/win-x64/native/WebView2Loader.dll" "$out/"
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
for family in microsoft.netcore.app.runtime.win-x64 microsoft.windowsdesktop.app.runtime.win-x64 microsoft.web.webview2; do
  version=$(ls -v "$NUGET_PACKAGES/$family" | tail -1)
  for file in "$NUGET_PACKAGES/$family/$version"/{LICENSE*,License*,THIRD-PARTY-NOTICES*}; do
    if [[ -f "$file" ]]; then cp "$file" "$out/licenses/$family-$(basename "$file")"; fi
  done
done
