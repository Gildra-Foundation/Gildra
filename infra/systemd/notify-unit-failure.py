#!/usr/bin/env python3
"""Record and forward the failure (or recovery) of a systemd unit.

Wired through ``OnFailure=gildra-notify@%p.service`` and
``OnSuccess=gildra-notify-ok@%p.service`` on the scheduled Gildra units.
Every failure is appended to a local JSON-lines alert log that the console can
read later; when ``/opt/gildra/notify.env`` names a channel the same record is
forwarded there. Channels are optional and independent:

* ``TELEGRAM_BOT_TOKEN`` and ``TELEGRAM_CHAT_ID`` send a Telegram message.
  A unit that keeps failing is reported once, then at most every
  ``NOTIFY_REPEAT_HOURS`` (default 6) with the number of failures in between;
  its next success sends one "recovered" message.
* ``SENTRY_DSN`` (optionally ``SENTRY_ENVIRONMENT``) records an event for every
  failure (GlitchTip/Sentry group them into one issue per unit).

The script never exits non-zero because of a delivery problem: a broken
channel must not hide the original failure behind a second one.
"""

from __future__ import annotations

import fcntl
import json
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterator

JOURNAL_LINES = 25
HTTP_TIMEOUT_SECONDS = 10.0
USER_AGENT = "gildra-notify/2.0"
DEFAULT_REPEAT_HOURS = 6.0
# systemd's own lines about the unit say nothing the header does not.
SYSTEMD_NOISE = (
    "Main process exited", "Failed with result", "Failed to start", "Triggering OnFailure",
    "Triggering OnSuccess", "Consumed ", "Deactivated successfully", "Starting ", "Finished ",
)


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


def now() -> datetime:
    override = os.environ.get("GILDRA_NOTIFY_NOW")
    return datetime.fromisoformat(override) if override else datetime.now(UTC)


def build_record(unit: str, offline: bool) -> dict[str, object]:
    state = {} if offline else unit_state(unit)
    excerpt = "" if offline else journal_excerpt(unit, state.get("InvocationID", ""))
    return {
        "at": now().isoformat(timespec="seconds"),
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


@contextmanager
def locked_state(path: Path) -> Iterator[dict[str, dict[str, object]]]:
    """Per-unit delivery state, shared by concurrent notifier runs under a file lock."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.seek(0)
        try:
            state = json.loads(handle.read() or "{}")
        except json.JSONDecodeError:
            state = {}
        yield state
        handle.seek(0)
        handle.truncate()
        handle.write(json.dumps(state, ensure_ascii=False, indent=1))


def meaningful_lines(excerpt: str, limit: int = 8) -> list[str]:
    lines = [line for line in excerpt.splitlines() if line.strip() and not any(noise in line for noise in SYSTEMD_NOISE)]
    return lines[-limit:]


def failure_text(record: dict[str, object], repeat: dict[str, object] | None) -> str:
    lines = [f"🔴 Gildra: сбой {record['unit']} на {record['host']}"]
    if repeat:
        lines[0] += f" — всё ещё падает, с прошлого сообщения ещё {repeat['suppressed']} сбоев (впервые {repeat['first_at']})"
    lines.append(f"result={record['result']} exit={record['exit_status'] or '?'} в {record['at']}")
    tail = meaningful_lines(str(record.get("excerpt") or ""))
    if tail:
        lines.append("")
        lines.extend(tail)
    return "\n".join(lines)


def recovery_text(unit: str, host: str, entry: dict[str, object]) -> str:
    return f"🟢 Gildra: {unit} на {host} снова работает (сбоев подряд: {entry['failures']}, первый {entry['first_at']})"


def post_json(url: str, payload: dict[str, object], headers: dict[str, str]) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("User-Agent", USER_AGENT)
    for key, value in headers.items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        response.read()


def send_telegram(token: str, chat_id: str, text: str) -> None:
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
            "fingerprint": ["systemd-unit-failure", str(record["unit"])],
            "tags": {"unit": record["unit"], "result": record["result"]},
            "extra": {"exit_status": record["exit_status"], "excerpt": record["excerpt"]},
        },
        {"X-Sentry-Auth": auth},
    )


def repeat_hours(channels: dict[str, str]) -> float:
    try:
        return max(0.0, float(channels.get("NOTIFY_REPEAT_HOURS", DEFAULT_REPEAT_HOURS)))
    except ValueError:
        return DEFAULT_REPEAT_HOURS


def telegram_decision(state: dict[str, dict[str, object]], record: dict[str, object], hours: float) -> tuple[bool, dict[str, object] | None]:
    """Update the unit's failure streak; say whether to message and with which repeat summary."""
    unit = str(record["unit"])
    at = str(record["at"])
    entry = state.get(unit)
    if entry is None:
        state[unit] = {"first_at": at, "last_sent_at": at, "failures": 1, "suppressed": 0}
        return True, None
    entry["failures"] = int(entry.get("failures", 0)) + 1
    last_sent = datetime.fromisoformat(str(entry.get("last_sent_at") or entry.get("first_at")))
    if datetime.fromisoformat(at) - last_sent < timedelta(hours=hours):
        entry["suppressed"] = int(entry.get("suppressed", 0)) + 1
        return False, None
    repeat = {"suppressed": int(entry.get("suppressed", 0)), "first_at": entry.get("first_at")}
    entry["last_sent_at"] = at
    entry["suppressed"] = 0
    return True, repeat


def report_failure(unit: str, offline: bool, log_path: Path, state_path: Path, channels: dict[str, str]) -> None:
    record = build_record(unit, offline)
    try:
        append_alert_log(log_path, record)
    except OSError as exc:
        print(f"notify: could not append {log_path}: {exc}", file=sys.stderr)

    telegram_token = channels.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat = channels.get("TELEGRAM_CHAT_ID", "")
    send, repeat = True, None
    try:
        with locked_state(state_path) as state:
            send, repeat = telegram_decision(state, record, repeat_hours(channels))
    except OSError as exc:
        print(f"notify: could not update {state_path}: {exc}", file=sys.stderr)
    text = failure_text(record, repeat)
    print(text if send else f"{text}\n(notify: repeat within {repeat_hours(channels)} h, Telegram skipped)")
    if offline:
        return
    if not telegram_token and not channels.get("SENTRY_DSN"):
        print("notify: no delivery channel configured; recorded locally only", file=sys.stderr)
        return
    if send and telegram_token and telegram_chat:
        try:
            send_telegram(telegram_token, telegram_chat, text)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            print(f"notify: delivery failed: telegram: {exc}", file=sys.stderr)
    if channels.get("SENTRY_DSN"):
        try:
            send_sentry(channels["SENTRY_DSN"], channels.get("SENTRY_ENVIRONMENT", ""), record)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            print(f"notify: delivery failed: sentry: {exc}", file=sys.stderr)


def report_recovery(unit: str, offline: bool, state_path: Path, channels: dict[str, str]) -> None:
    try:
        with locked_state(state_path) as state:
            entry = state.pop(unit, None)
    except OSError as exc:
        print(f"notify: could not update {state_path}: {exc}", file=sys.stderr)
        return
    if entry is None:
        return
    text = recovery_text(unit, socket.gethostname(), entry)
    print(text)
    token, chat = channels.get("TELEGRAM_BOT_TOKEN", ""), channels.get("TELEGRAM_CHAT_ID", "")
    if offline or not (token and chat):
        return
    try:
        send_telegram(token, chat, text)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"notify: delivery failed: telegram: {exc}", file=sys.stderr)


def main(argv: list[str]) -> int:
    args = argv[1:]
    recovered = bool(args) and args[0] == "--recovered"
    if recovered:
        args = args[1:]
    if len(args) != 1:
        print("usage: notify-unit-failure.py [--recovered] <unit-name>", file=sys.stderr)
        return 2
    unit = args[0]
    offline = os.environ.get("GILDRA_NOTIFY_OFFLINE") == "1"
    log_path = Path(os.environ.get("GILDRA_ALERT_LOG", "/opt/gildra/var/alerts/alerts.jsonl"))
    state_path = Path(os.environ.get("GILDRA_NOTIFY_STATE", str(log_path.with_name("notify-state.json"))))
    channels = load_env_file(Path(os.environ.get("GILDRA_NOTIFY_ENV_FILE", "/opt/gildra/notify.env")))
    if recovered:
        report_recovery(unit, offline, state_path, channels)
    else:
        report_failure(unit, offline, log_path, state_path, channels)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
