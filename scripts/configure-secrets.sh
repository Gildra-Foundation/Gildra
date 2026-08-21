#!/usr/bin/env bash
set -euo pipefail

umask 077

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${1:-${project_dir}/.env}"
env_example="${project_dir}/.env.example"

if [[ ! -e "${env_file}" ]]; then
  cp "${env_example}" "${env_file}"
fi
chmod 600 "${env_file}"

set_env_value() {
  local key="$1"
  local value="$2"
  local line
  local found=0
  local tmp_file

  tmp_file="$(mktemp "${env_file}.tmp.XXXXXX")"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s=%s\n' "${key}" "${value}" >>"${tmp_file}"
      found=1
    else
      printf '%s\n' "${line}" >>"${tmp_file}"
    fi
  done <"${env_file}"

  if [[ "${found}" -eq 0 ]]; then
    printf '%s=%s\n' "${key}" "${value}" >>"${tmp_file}"
  fi

  chmod 600 "${tmp_file}"
  mv "${tmp_file}" "${env_file}"
}

prompt_value() {
  local key="$1"
  local label="$2"
  local value

  read -r -s -p "${label}: " value
  printf '\n'
  if [[ -z "${value}" ]]; then
    printf 'Значение %s не может быть пустым.\n' "${key}" >&2
    exit 1
  fi
  set_env_value "${key}" "${value}"
  unset value
}

read -r -p "Cloudflare email: " cloudflare_email
if [[ -z "${cloudflare_email}" ]]; then
  printf 'Cloudflare email не может быть пустым.\n' >&2
  exit 1
fi
set_env_value "CLOUDFLARE_API_EMAIL" "${cloudflare_email}"
unset cloudflare_email

prompt_value "CLOUDFLARE_GLOBAL_API_KEY" "Cloudflare Global API Key"
prompt_value "ZYTE_API_KEY" "Zyte API Key"
prompt_value "BRIGHTDATA_API_KEY" "Web Unlocker API Key"
prompt_value "ZENROWS_API_KEY" "ZenRows API Key"
prompt_value "SCRAPE_DO_TOKEN" "Scrape.do token"
prompt_value "FIRECRAWL_API_KEY" "Firecrawl API Key"

printf 'Секреты сохранены в %s (права 600).\n' "${env_file}"
