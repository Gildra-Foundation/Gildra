#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
migration_dir="$repository_root/backend/migrations/postgres"
baseline="$migration_dir/production-baseline.sha256"

if [ ! -f "$baseline" ]; then
    echo "production migration baseline is missing" >&2
    exit 1
fi

(cd "$migration_dir" && sha256sum --check --strict "$(basename "$baseline")")

expected=1
for migration in $(find "$migration_dir" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9][0-9]_*.sql' -printf '%f\n' | sort); do
    version=${migration%%_*}
    numeric_version=$(printf '%s' "$version" | sed 's/^0*//')
    if [ -z "$numeric_version" ]; then
        numeric_version=0
    fi
    if [ "$numeric_version" -ne "$expected" ]; then
        echo "migration sequence drift: expected $(printf '%05d' "$expected"), found $migration" >&2
        exit 1
    fi
    expected=$((expected + 1))
done

if [ "$expected" -le 16 ]; then
    echo "migration sequence does not continue beyond the production baseline" >&2
    exit 1
fi

echo "production migration baseline and sequence verified through $(printf '%05d' $((expected - 1)))"
