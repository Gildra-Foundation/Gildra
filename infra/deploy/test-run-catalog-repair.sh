#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

deployment_directory=$test_directory/deployment
fake_bin=$test_directory/bin
log_file=$test_directory/docker.log
mkdir -p "$deployment_directory" "$fake_bin"

for compose_file in compose.yml compose.prod.yml compose.runtime.yml; do
  : > "$deployment_directory/$compose_file"
done
{
  printf 'CATALOG_ACCESS_MODE=private\n'
  printf 'CATALOG_RECOVERY_POLICY=verified_same_host\n'
} > "$deployment_directory/.env"
: > "$deployment_directory/current-release.env"

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/bin/sh
set -eu
[ "${1:-}" = compose ] || exit 64
shift
printf '%s\n' "$*" > "$FAKE_DOCKER_LOG"
FAKE_DOCKER
chmod +x "$fake_bin/docker"

run_case() {
  edition=$1
  expected_profile=$2
  expected_product=$3
  expected_sources=$4
  : > "$log_file"
  PATH="$fake_bin:$PATH" \
    FAKE_DOCKER_LOG="$log_file" \
    GILDRA_DEPLOY_DIR="$deployment_directory" \
    CATALOG_REPAIR_EDITION="$edition" \
    CATALOG_REPAIR_BUILD_VERSION=12.1.0.69497 \
    "$script_directory/run-catalog-repair.sh" >/dev/null 2>&1
  grep -Fq -- "-profile $expected_profile" "$log_file"
  grep -Fq -- "-product $expected_product" "$log_file"
  grep -Fq -- "-sources $expected_sources" "$log_file"
}

run_case retail retail-foundation wow wago,db2,battlenet,listfile
run_case classic classic-foundation wow_classic db2,listfile
run_case classic-era classic-era-foundation wow_classic_era db2,listfile
run_case hardcore classic-hardcore-foundation wow_classic_hardcore db2,listfile

if PATH="$fake_bin:$PATH" \
  FAKE_DOCKER_LOG="$log_file" \
  GILDRA_DEPLOY_DIR="$deployment_directory" \
  CATALOG_REPAIR_EDITION=unknown \
  CATALOG_REPAIR_BUILD_VERSION=12.1.0.69497 \
  "$script_directory/run-catalog-repair.sh" >/dev/null 2>&1; then
  printf 'test: unknown edition must be rejected\n' >&2
  exit 1
fi

printf 'test: catalog repair edition mapping is explicit and isolated\n'
