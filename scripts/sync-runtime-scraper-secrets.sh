#!/usr/bin/env bash
set -euo pipefail

umask 077

source_file="${1:?source .env path is required}"
target_file="${2:?runtime .env path is required}"
keys=(
  SCRAPE_DO_TOKEN
  ZYTE_API_KEY
  BRIGHTDATA_API_KEY
  ZENROWS_API_KEY
  FIRECRAWL_API_KEY
)

[[ -r "${source_file}" ]] || { printf 'source environment is not readable\n' >&2; exit 1; }
[[ -r "${target_file}" ]] || { printf 'target environment is not readable\n' >&2; exit 1; }

for wanted_key in "${keys[@]}"; do
  secret_value=""
  while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
    if [[ "${key}" == "${wanted_key}" ]]; then
      secret_value="${value}"
      break
    fi
  done <"${source_file}"
  if [[ -z "${secret_value}" ]]; then
    printf 'required source key is empty: %s\n' "${wanted_key}" >&2
    exit 1
  fi

  temporary_file="$(mktemp "${target_file}.tmp.XXXXXX")"
  found=0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${wanted_key}="* ]]; then
      printf '%s=%s\n' "${wanted_key}" "${secret_value}" >>"${temporary_file}"
      found=1
    else
      printf '%s\n' "${line}" >>"${temporary_file}"
    fi
  done <"${target_file}"
  if [[ "${found}" -eq 0 ]]; then
    printf '%s=%s\n' "${wanted_key}" "${secret_value}" >>"${temporary_file}"
  fi
  chmod --reference="${target_file}" "${temporary_file}"
  chown --reference="${target_file}" "${temporary_file}"
  mv "${temporary_file}" "${target_file}"
  unset secret_value
done

printf 'runtime scraper secrets synchronized: %d keys\n' "${#keys[@]}"
