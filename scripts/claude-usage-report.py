#!/usr/bin/env python3
"""Where do Claude Code subscription tokens go? (read-only, streams the JSONL transcripts)

Usage:
  python3 scripts/claude-usage-report.py [--root ~/.claude/projects] [--match gildra] [--json out.json] [--top 12]

Cost model (relative to 1 uncached input token = 1.0 "base-input equivalent", BIU):
  input 1.0 | cache_read 0.1 | cache_write 5m 1.25, 1h 2.0 | output 5.0
Per-model prices differ; the report also keeps raw token counts per model.

Attribution of context to content types:
  every tool result / prompt / attachment is carried in the prompt of all later
  API calls until the next compaction. Carried cost of an item =
  tokens * (cache_write_weight + 0.1 * later_calls_before_compaction).
Text tokens are estimated as chars / 3.4, images as w*h/750 (long edge capped at 1568).
"""
import argparse, base64, collections, glob, json, os, re, struct, sys

W_IN, W_CR, W_CC5, W_CC1, W_OUT = 1.0, 0.1, 1.25, 2.0, 5.0
CHARS_PER_TOKEN = 3.4


def text_tokens(s):
    return len(s) / CHARS_PER_TOKEN


def image_dims(b64):
    try:
        raw = base64.b64decode(b64[:200000] if len(b64) > 200000 else b64, validate=False)
    except Exception:
        return None
    if raw[:8] == b"\x89PNG\r\n\x1a\n" and len(raw) >= 24:
        return struct.unpack(">II", raw[16:24])
    if raw[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(raw):
            if raw[i] != 0xFF:
                i += 1
                continue
            m = raw[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", raw[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", raw[i + 2:i + 4])[0]
    return None


def image_tokens(block):
    src = block.get("source") or {}
    data = src.get("data") or ""
    d = image_dims(data)
    if not d:
        return min(1600.0, len(data) * 0.75 / 1500)
    w, h = d
    scale = min(1.0, 1568 / max(w, h))
    return min(1600.0, w * scale * h * scale / 750)


def block_tokens(content):
    """Return (text_tokens, image_tokens, n_images) of a tool_result content."""
    if isinstance(content, str):
        return text_tokens(content), 0.0, 0
    t = im = n = 0
    for b in content or []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text":
            t += text_tokens(b.get("text", ""))
        elif b.get("type") == "image":
            im += image_tokens(b)
            n += 1
        elif b.get("type") == "tool_reference":
            t += 20
    return t, im, n


def bash_class(cmd):
    c = cmd.strip()
    if re.search(r"next build|npm run build|build:quiet", c):
        return "build"
    if re.search(r"typecheck|tsc\b", c):
        return "typecheck"
    if re.search(r"design:capture|capture-design|screenshot", c):
        return "screenshots"
    if re.search(r"go (test|vet|build)", c):
        return "go-test/vet"
    if re.search(r"playwright|smoke:|qa:|test:|node --test|vitest|jest", c):
        return "qa/tests"
    if re.search(r"^(cd [^;&]+(&&|;)\s*)?git\b", c):
        return "git"
    if re.search(r"\b(ssh|scp|rsync|docker|compose|systemctl|journalctl|curl)\b", c):
        return "ops/ssh/docker/curl"
    if re.search(r"\b(grep|rg|find|ls|cat|head|tail|wc|sed|awk|du)\b", c):
        return "shell-read (grep/find/cat…)"
    if re.search(r"npm (i|install|ci)\b", c):
        return "npm-install"
    return "other-bash"


def read_class(path):
    p = path or ""
    if p.endswith(".md"):
        base = os.path.basename(p)
        if base in ("design.md", "brand.md", "design-qa.md", "HANDOFF.md", "CLAUDE.md", "AGENTS.md", "README.md"):
            return "Read: guidance docs (design/brand/HANDOFF/…)"
        return "Read: other .md (docs, skills)"
    if re.search(r"\.(png|jpe?g|webp|gif)$", p):
        return "Read: image files"
    if p.endswith(".css"):
        return "Read: css"
    if re.search(r"\.(ts|tsx|js|mjs|go|py|json|yml|yaml|sql)$", p):
        return "Read: code/config"
    return "Read: other"


def tool_class(name, inp):
    if name == "Bash":
        return "Bash: " + bash_class((inp or {}).get("command", ""))
    if name == "Read":
        return read_class((inp or {}).get("file_path", ""))
    if name in ("Agent", "Task"):
        return "Agent (subagent result)"
    if name.startswith("mcp__playwright"):
        return "MCP playwright: " + name.split("__", 2)[2]
    if name.startswith("mcp__"):
        parts = name.split("__")
        return "MCP " + (parts[1][:24] if len(parts) > 1 else "?")
    return name


def analyse(files, args):
    sessions = {}
    for path in files:
        parts = path.split(os.sep)
        sub = "subagents" in parts
        proj = parts[-3] if sub and False else None
        if sub:
            sid_key = os.path.join(*parts[:-2])  # <proj>/<session>
            sid_key = path[: path.index("/subagents/")]
        else:
            sid_key = path[:-6]
        s = sessions.setdefault(sid_key, {
            "project": path.split("/projects/")[1].split("/")[0] if "/projects/" in path else "?",
            "models": collections.Counter(), "tok": collections.Counter(), "tok_sub": collections.Counter(),
            "biu": 0.0, "biu_sub": 0.0, "calls": 0, "calls_sub": 0, "compactions": 0,
            "first_ctx": None, "ctx_max": 0, "day": None, "bytes": 0,
            "by_model": collections.defaultdict(collections.Counter),
        })
        s["bytes"] += os.path.getsize(path)
        yield_state = process_file(path, sub, s, args)
    return sessions


ITEMS = collections.defaultdict(lambda: collections.Counter())  # class -> counters (global)
HABITS = collections.Counter()
READ_DUP = collections.Counter()
BIG_RESULTS = []  # (carried_biu, tokens, class, session, snippet)


def process_file(path, sub, s, args):
    calls = []  # per unique assistant message: dict(ctx, biu)
    seen_ids = {}
    tool_use = {}  # id -> (name, input)
    items = []  # (class, tokens_text, tokens_img, call_index_at_creation, extra)
    read_paths = collections.Counter()
    asst_done = set()
    with open(path, errors="replace") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except Exception:
                continue
            t = d.get("type")
            if t == "assistant":
                m = d.get("message") or {}
                u = m.get("usage") or {}
                mid = m.get("id") or d.get("uuid")
                cc = u.get("cache_creation") or {}
                cc1 = cc.get("ephemeral_1h_input_tokens", 0)
                cc5 = cc.get("ephemeral_5m_input_tokens", 0)
                tot_cc = u.get("cache_creation_input_tokens", 0)
                if cc1 + cc5 == 0 and tot_cc:
                    cc5 = tot_cc
                rec = dict(i=u.get("input_tokens", 0), o=u.get("output_tokens", 0),
                           cr=u.get("cache_read_input_tokens", 0), cc1=cc1, cc5=cc5,
                           model=m.get("model", "?"), ts=d.get("timestamp", ""))
                if mid in seen_ids:
                    r0 = calls[seen_ids[mid]]
                    for k in ("i", "o", "cr", "cc1", "cc5"):
                        r0[k] = max(r0[k], rec[k])
                else:
                    seen_ids[mid] = len(calls)
                    calls.append(rec)
                if mid not in asst_done:
                    asst_done.add(mid)
                    th = (u.get("output_tokens_details") or {}).get("thinking_tokens", 0)
                    if th:
                        items.append(("assistant: thinking", float(th), 0.0, len(calls), 0, ""))
                for b in (m.get("content") or []):
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        tool_use[b["id"]] = (b.get("name", "?"), b.get("input") or {})
                        if b.get("name") == "Read":
                            read_paths[(b.get("input") or {}).get("file_path", "")] += 1
                        nm = b.get("name", "?")
                        grp = nm if not nm.startswith("mcp__") else "mcp"
                        if nm in ("Bash", "Write", "Edit", "Read", "Agent", "Artifact", "Grep"):
                            items.append(("assistant: tool input " + grp, text_tokens(json.dumps(b.get("input") or {}, ensure_ascii=False)), 0.0, len(calls), 0, ""))
                    elif isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
                        items.append(("assistant: text to user", text_tokens(b["text"]), 0.0, len(calls), 0, ""))
            elif t == "user":
                m = d.get("message") or {}
                c = m.get("content")
                idx = len(calls)
                if isinstance(c, str):
                    kind = "user: compaction summary" if d.get("isCompactSummary") else "user: prompt text"
                    items.append((kind, text_tokens(c), 0.0, idx, 0, c[:80]))
                elif isinstance(c, list):
                    for b in c:
                        if not isinstance(b, dict):
                            continue
                        if b.get("type") == "tool_result":
                            name, inp = tool_use.get(b.get("tool_use_id"), ("?", {}))
                            tt, it, n = block_tokens(b.get("content"))
                            cls = tool_class(name, inp)
                            if name == "Read" and it > 0:
                                cls = "Read: image files"
                            extra = (inp.get("command") or inp.get("file_path") or inp.get("description") or "")[:90]
                            items.append((cls, tt, it, idx, n, extra))
                        elif b.get("type") == "text":
                            tx = b.get("text", "")
                            kind = "user: system-reminder/context" if tx.lstrip().startswith("<system-reminder") else "user: prompt text"
                            items.append((kind, text_tokens(tx), 0.0, idx, 0, tx[:80]))
                        elif b.get("type") == "image":
                            items.append(("user: pasted image", 0.0, image_tokens(b), idx, 1, ""))
            elif t == "attachment":
                a = d.get("attachment") or {}
                if a.get("type") == "prompt_snapshot":
                    continue  # logging record of the initial prompt (= the floor), not extra context
                r = d.get("rendered")
                if isinstance(r, (dict, list)):
                    txt = json.dumps(r, ensure_ascii=False)
                else:
                    txt = r if isinstance(r, str) else json.dumps(a, ensure_ascii=False)
                items.append(("attachment: " + str(a.get("type", "?")), text_tokens(txt), 0.0, len(calls), 0, ""))

    # per-call cost, compaction detection
    n = len(calls)
    ctx = [c["i"] + c["cr"] + c["cc1"] + c["cc5"] for c in calls]
    comp_points = [0]
    for k in range(1, n):
        if ctx[k - 1] > 60000 and ctx[k] < 0.55 * ctx[k - 1]:
            comp_points.append(k)
    boundaries = comp_points + [n]
    if not sub:
        s["compactions"] += len(comp_points) - 1

    def next_boundary(k):
        for b in boundaries:
            if b > k:
                return b
        return n

    tgt = "tok_sub" if sub else "tok"
    for k, c in enumerate(calls):
        biu = c["i"] * W_IN + c["cr"] * W_CR + c["cc5"] * W_CC5 + c["cc1"] * W_CC1 + c["o"] * W_OUT
        s["biu_sub" if sub else "biu"] += biu
        s["calls_sub" if sub else "calls"] += 1
        for key, val in (("input", c["i"]), ("output", c["o"]), ("cache_read", c["cr"]),
                         ("cache_write", c["cc1"] + c["cc5"])):
            s[tgt][key] += val
            s["by_model"][c["model"]][key] += val
        s["by_model"][c["model"]]["biu"] += biu
        s["by_model"][c["model"]]["calls"] += 1
        s["models"][c["model"]] += 1
        if not s["day"] and c["ts"]:
            s["day"] = c["ts"][:10]
    if not sub and n:
        s["first_ctx"] = ctx[0]
        s["ctx_max"] = max(s["ctx_max"], max(ctx))
    # the fixed floor (system prompt + tools + CLAUDE.md + skill list ...) = first call context
    if n:
        fl = ctx[0] if not sub else ctx[0]
        c = ITEMS[("[subagent] " if sub else "") + "FLOOR: system+tools+CLAUDE.md+skills (first call)"]
        c["n"] += 1; c["tokens"] += fl
        c["carried_biu"] += fl * (W_CC1 + W_CR * (n - 1))
    # carried cost of items
    for cls, tt, it, idx, ni, extra in items:
        toks = tt + it
        if toks <= 0:
            continue
        later = max(0, next_boundary(idx) - idx - 1) if idx < n else 0
        carried = toks * (W_CC1 + W_CR * later)
        key = ("[subagent] " if sub else "") + cls
        c = ITEMS[key]
        c["n"] += 1
        c["tokens"] += toks
        c["img_tokens"] += it
        c["images"] += ni
        c["carried_biu"] += carried
        if carried > 2e5:
            BIG_RESULTS.append((carried, toks, key, os.path.basename(path)[:8], extra))
        if cls == "Bash: build":
            HABITS["build_runs"] += 1
            HABITS["build_tokens"] += toks
    for p, cnt in read_paths.items():
        if cnt > 1:
            HABITS["rereads_same_file"] += cnt - 1
            READ_DUP[p] += cnt - 1


def fmt(n):
    n = float(n)
    for u, v in (("B", 1e9), ("M", 1e6), ("k", 1e3)):
        if abs(n) >= v:
            return f"{n / v:.1f}{u}"
    return f"{n:.0f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--match", default="gildra", help="substring of project dir name (empty = all)")
    ap.add_argument("--json")
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(args.root, "*", "**", "*.jsonl"), recursive=True))
    files = [f for f in files if args.match in f.split("/projects/")[1].split("/")[0]]
    sessions = analyse(files, args)

    tot = collections.Counter()
    tot_sub = collections.Counter()
    biu = biu_sub = 0
    by_model = collections.defaultdict(collections.Counter)
    for s in sessions.values():
        tot.update(s["tok"]); tot_sub.update(s["tok_sub"]); biu += s["biu"]; biu_sub += s["biu_sub"]
        for m, c in s["by_model"].items():
            by_model[m].update(c)
    print(f"files={len(files)} sessions={len(sessions)}")
    print("\n== Totals (tokens) ==")
    for name, c, b in (("main sessions", tot, biu), ("subagents", tot_sub, biu_sub)):
        print(f"{name:14} input={fmt(c['input'])} output={fmt(c['output'])} cache_read={fmt(c['cache_read'])} "
              f"cache_write={fmt(c['cache_write'])}  BIU={fmt(b)}")
    allbiu = biu + biu_sub
    print("\n== By model ==")
    for m, c in sorted(by_model.items(), key=lambda x: -x[1]["biu"]):
        print(f"{m:22} calls={c['calls']:5} BIU={fmt(c['biu']):>7} ({100 * c['biu'] / allbiu:4.1f}%) in={fmt(c['input'])} "
              f"out={fmt(c['output'])} cr={fmt(c['cache_read'])} cw={fmt(c['cache_write'])}")
    cr_all = tot["cache_read"] + tot_sub["cache_read"]
    cw_all = tot["cache_write"] + tot_sub["cache_write"]
    out_all = tot["output"] + tot_sub["output"]
    in_all = tot["input"] + tot_sub["input"]
    print("\n== Where BIU goes (by token kind) ==")
    parts = [("cache read (re-reading context every turn)", cr_all * W_CR),
             ("cache write (new context)", cw_all * 1.6),
             ("output", out_all * W_OUT), ("uncached input", in_all * W_IN)]
    for n_, v in parts:
        print(f"{n_:46} {fmt(v):>8}  {100 * v / allbiu:4.1f}%")

    print("\n== Sessions (main), sorted by BIU incl. subagents ==")
    rows = sorted(sessions.items(), key=lambda kv: -(kv[1]["biu"] + kv[1]["biu_sub"]))
    for k, s in rows[:args.top]:
        proj = s["project"].replace("-home-zulut-gildra-redesign--claude-worktrees-", "wt:").replace("-home-zulut", "coordinator")
        print(f"{proj[:40]:40} {s['day']} calls={s['calls']:4}+{s['calls_sub']:<4} BIU={fmt(s['biu'])}+{fmt(s['biu_sub'])} "
              f"firstctx={fmt(s['first_ctx'] or 0)} maxctx={fmt(s['ctx_max'])} compact={s['compactions']} "
              f"models={dict(s['models'])}")
    fc = [s["first_ctx"] for s in sessions.values() if s["first_ctx"]]
    if fc:
        fc.sort()
        print(f"\nfirst-turn context (system+tools+CLAUDE.md+skills): min={fmt(fc[0])} median={fmt(fc[len(fc)//2])} max={fmt(fc[-1])}  "
              f"-> paid (cache read) on every one of {sum(s['calls'] for s in sessions.values())} main calls")
        med = fc[len(fc) // 2]
        calls_main = sum(s['calls'] for s in sessions.values())
        print(f"   floor cost = median*calls*0.1 ≈ {fmt(med * calls_main * W_CR)} BIU ({100 * med * calls_main * W_CR / allbiu:.1f}% of all BIU)")

    print("\n== Carried cost by content class (tool results etc.) ==")
    tot_items = sum(c["carried_biu"] for c in ITEMS.values()) or 1
    for k, c in sorted(ITEMS.items(), key=lambda kv: -kv[1]["carried_biu"])[:args.top * 3]:
        print(f"{k[:52]:52} n={c['n']:5} tok={fmt(c['tokens']):>7} img={fmt(c['img_tokens']):>6} "
              f"carriedBIU={fmt(c['carried_biu']):>7} {100 * c['carried_biu'] / allbiu:4.1f}% of all")
    print(f"(sum of attributable items: {fmt(tot_items)} BIU = {100 * tot_items / allbiu:.1f}% of all BIU; rest = system/tools floor + output)")

    print("\n== Habits ==")
    print({k: fmt(v) for k, v in HABITS.items()})
    print("most re-read files:", READ_DUP.most_common(8))
    print("\n== Biggest single items by carried BIU ==")
    for carried, toks, key, sid, extra in sorted(BIG_RESULTS, reverse=True)[:15]:
        print(f"{fmt(carried):>7} BIU  {fmt(toks):>6} tok  {key[:34]:34} {sid} {extra}")

    if args.json:
        out = dict(totals=dict(main=dict(tot), sub=dict(tot_sub), biu=biu, biu_sub=biu_sub),
                   by_model={m: dict(c) for m, c in by_model.items()},
                   items={k: dict(c) for k, c in ITEMS.items()}, habits=dict(HABITS),
                   sessions={k: dict(project=s["project"], day=s["day"], calls=s["calls"], calls_sub=s["calls_sub"],
                                     biu=s["biu"], biu_sub=s["biu_sub"], first_ctx=s["first_ctx"], ctx_max=s["ctx_max"],
                                     compactions=s["compactions"]) for k, s in sessions.items()})
        json.dump(out, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
