#!/usr/bin/env python3
"""Record and forward the failure of a systemd unit.

Wired through ``OnFailure=gildra-notify@%n.service`` on the scheduled catalog
units. Every failure is appended to a local JSON-lines alert log that the
console can read later; when ``/opt/gildra/notify.env`` names a channel the
same record is forwarded there. Channels are optional and independent:

* ``TELEGRAM_BOT_TOKEN`` and ``TELEGRAM_CHAT_ID`` send a Telegram message.
* ``SENTRY_DSN`` (optionally ``SENTRY_ENVIRONMENT``) records a Sentry event.

The script never exits non-zero because of a delivery problem: a broken
channel must not hide the original failure behind a second one.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

JOURNAL_LINES = 25
HTTP_TIMEOUT_SECONDS = 10.0
USER_AGENT = "gildra-notify/1.0"


def _run(command: list[str]) -> str:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"<{command[0]} unavailable: {exc}>"
    return completed.stdout


def unit_state(unit: str) -> dict[str, str]:
    output = _run(["systemctl", "show", unit, "-p", "Result", "-p", "ExecMainStatus", "-p", "InvocationID", "-p", "InactiveEnterTimestamp"])
    state: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            state[key.strip()] = value.strip()
    return state


def journal_excerpt(unit: str, invocation_id: str) -> str:
    command = ["journalctl", "--no-pager", "-o", "cat", "-n", str(JOURNAL_LINES)]
    if invocation_id:
        command.append(f"_SYSTEMD_INVOCATION_ID={invocation_id}")
    else:
        command.extend(["-u", unit])
    return _run(command).strip()


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator:
            continue
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def build_record(unit: str, offline: bool) -> dict[str, object]:
    state = {} if offline else unit_state(unit)
    excerpt = "" if offline else journal_excerpt(unit, state.get("InvocationID", ""))
    return {
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
        "host": socket.gethostname(),
        "unit": unit,
        "result": state.get("Result", "unknown"),
        "exit_status": state.get("ExecMainStatus", ""),
        "invocation_id": state.get("InvocationID", ""),
        "excerpt": excerpt[-4000:],
    }


def append_alert_log(path: Path, record: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def summary_text(record: dict[str, object]) -> str:
    lines = [
        f"Gildra: {record['unit']} failed on {record['host']}",
        f"result={record['result']} exit={record['exit_status'] or '?'} at {record['at']}",
    ]
    excerpt = str(record.get("excerpt") or "").strip()
    if excerpt:
        tail = excerpt.splitlines()[-8:]
        lines.append("")
        lines.extend(tail)
    return "\n".join(lines)


def post_json(url: str, payload: dict[str, object], headers: dict[str, str]) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("User-Agent", USER_AGENT)
    for key, value in headers.items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        response.read()


def send_telegram(token: str, chat_id: str, record: dict[str, object]) -> None:
    text = summary_text(record)
    post_json(
        f"https://api.telegram.org/bot{token}/sendMessage",
        {"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True},
        {},
    )


def send_sentry(dsn: str, environment: str, record: dict[str, object]) -> None:
    parts = urllib.parse.urlsplit(dsn)
    if not parts.username or not parts.hostname:
        raise ValueError("SENTRY_DSN must look like https://key@host/project")
    project = parts.path.rstrip("/").rsplit("/", 1)[-1]
    if not project:
        raise ValueError("SENTRY_DSN is missing the project id")
    port = f":{parts.port}" if parts.port else ""
    url = f"{parts.scheme}://{parts.hostname}{port}/api/{project}/store/"
    auth = f"Sentry sentry_version=7, sentry_key={parts.username}, sentry_client={USER_AGENT}"
    post_json(
        url,
        {
            "event_id": uuid.uuid4().hex,
            "timestamp": record["at"],
            "platform": "other",
            "level": "error",
            "logger": "systemd",
            "environment": environment or "production",
            "server_name": record["host"],
            "message": f"{record['unit']} failed ({record['result']})",
            "tags": {"unit": record["unit"], "result": record["result"]},
            "extra": {"exit_status": record["exit_status"], "excerpt": record["excerpt"]},
        },
        {"X-Sentry-Auth": auth},
    )


def forward(record: dict[str, object], channels: dict[str, str]) -> list[str]:
    problems: list[str] = []
    telegram_token = channels.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat = channels.get("TELEGRAM_CHAT_ID", "")
    if telegram_token and telegram_chat:
        try:
            send_telegram(telegram_token, telegram_chat, record)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            problems.append(f"telegram: {exc}")
    sentry_dsn = channels.get("SENTRY_DSN", "")
    if sentry_dsn:
        try:
            send_sentry(sentry_dsn, channels.get("SENTRY_ENVIRONMENT", ""), record)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            problems.append(f"sentry: {exc}")
    return problems


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: notify-unit-failure.py <unit-name>", file=sys.stderr)
        return 2
    unit = argv[1]
    offline = os.environ.get("GILDRA_NOTIFY_OFFLINE") == "1"
    record = build_record(unit, offline)

    log_path = Path(os.environ.get("GILDRA_ALERT_LOG", "/opt/gildra/var/alerts/alerts.jsonl"))
    try:
        append_alert_log(log_path, record)
    except OSError as exc:
        print(f"notify: could not append {log_path}: {exc}", file=sys.stderr)

    print(summary_text(record))

    channels = load_env_file(Path(os.environ.get("GILDRA_NOTIFY_ENV_FILE", "/opt/gildra/notify.env")))
    if offline:
        return 0
    if not any(channels.get(key) for key in ("TELEGRAM_BOT_TOKEN", "SENTRY_DSN")):
        print("notify: no delivery channel configured; recorded locally only", file=sys.stderr)
        return 0
    for problem in forward(record, channels):
        print(f"notify: delivery failed: {problem}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
