#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin")
PRESET = ROOT / "env/.agent-presets/dsh-bot--xiaodui-aning/agent.cordis.yml"
OUT = ROOT / "docs/dsh-bot-memory/evidence/phase-0"
RPC = Path.home() / ".agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh"
BOT = "xiaodui-aning"

def rpc(method, args=None):
    body = json.dumps({"args": args or {}}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:3084/dsh-bot/" + method,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())

def dsh_rpc(method, args="{}"):
    raw = subprocess.check_output([str(RPC), "3084", method, args], text=True)
    return json.loads(raw)

def wait_idle(session_id, timeout_s=90):
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        last = rpc("history", {"sessionId": session_id})
        if last.get("ok"):
            value = last.get("value") or {}
            items = value.get("items") or []
            if value.get("working") is False and any(
                row.get("role") == "assistant" and row.get("kind") == "message" for row in items
            ):
                return last
        time.sleep(2)
    return last

def assistant_text(hist):
    items = ((hist.get("value") or {}).get("items") or [])
    return "\n".join(
        row.get("text", "")
        for row in items
        if row.get("role") == "assistant" and row.get("kind") == "message"
    )

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    notes = {"when": datetime.now(timezone.utc).isoformat(), "gateway": "127.0.0.1:3084"}
    original = PRESET.read_text()
    (OUT / "aning-persona.bak.yml").write_text(original)

    patched = original.replace(
        "不要说你是 DSH Bot 或诗人。'",
        "不要说你是 DSH Bot 或诗人。你记得用户叫测试甲。'",
    )
    if patched == original:
        raise SystemExit("ASM-801: persona line not found")
    PRESET.write_text(patched)
    created = rpc("createBotSession", {"botId": BOT})
    notes["asm801_create"] = created
    if not created.get("ok"):
        PRESET.write_text(original)
        raise SystemExit("ASM-801 create failed: %s" % created)
    sid = created["value"]["sessionId"]
    t0 = time.time()
    prompted = rpc("prompt", {"sessionId": sid, "text": "我叫什么"})
    hist = wait_idle(sid)
    notes["asm801"] = {
        "sessionId": sid,
        "prompt": prompted,
        "seconds": round(time.time() - t0, 2),
        "answer": assistant_text(hist),
        "working": (hist.get("value") or {}).get("working"),
    }
    PRESET.write_text(original)
    notes["asm801"]["answered_test_jia"] = "测试甲" in notes["asm801"]["answer"]
    (OUT / "asm801.json").write_text(json.dumps(notes["asm801"], ensure_ascii=False, indent=2) + "\n")

    created2 = rpc("createBotSession", {"botId": BOT})
    sid2 = created2["value"]["sessionId"]
    turns = [
        "请只输出 JSON：{\"profile\":[\"用户喜欢短句\"],\"log\":[],\"remove\":[]}",
        "请只输出 JSON：{\"profile\":[\"术语保留英文\"],\"log\":[\"改了 README\"],\"remove\":[]}",
        "请只输出 JSON：{\"profile\":[],\"log\":[\"约了下午校对\"],\"remove\":[]}",
    ]
    rows = []
    for text in turns:
        t0 = time.time()
        rpc("prompt", {"sessionId": sid2, "text": text})
        hist = wait_idle(sid2, 90)
        answer = assistant_text(hist)
        elapsed = round(time.time() - t0, 2)
        rows.append({"seconds": elapsed, "looks_json": "{" in answer and "}" in answer, "answer_tail": answer[-400:]})
    notes["asm802"] = {"sessionId": sid2, "turns": rows}
    (OUT / "asm802.json").write_text(json.dumps(notes["asm802"], ensure_ascii=False, indent=2) + "\n")

    listed_before = rpc("listBotSessions", {"botId": BOT, "includeHidden": True})
    created_gui = None
    gui_error = None
    for method, args in [
        ("session.create", json.dumps({"title": "asm-803-gui", "agentPreset": "dsh-bot--xiaodui-aning"})),
        ("session/create", json.dumps({"title": "asm-803-gui", "agentPreset": "dsh-bot--xiaodui-aning"})),
    ]:
        try:
            created_gui = dsh_rpc(method, args)
            break
        except Exception as exc:
            gui_error = str(exc)
    rec = rpc("reconcile", {})
    listed_after = rpc("listBotSessions", {"botId": BOT, "includeHidden": True})
    notes["asm803"] = {
        "session_create": created_gui,
        "session_create_error": gui_error,
        "reconcile": rec,
        "list_before_n": len(((listed_before.get("value") or {}).get("sessions") or [])),
        "list_after_n": len(((listed_after.get("value") or {}).get("sessions") or [])),
        "list_after_titles": [row.get("title") for row in ((listed_after.get("value") or {}).get("sessions") or [])][:12],
    }
    (OUT / "asm803.json").write_text(json.dumps(notes["asm803"], ensure_ascii=False, indent=2) + "\n")

    long_persona = ("你是校对阿宁。" + ("校对校准。" * 400))[:4000]
    write_js = ROOT / "docs/dsh-bot-memory/evidence/phase-0/write-long-persona.mts"
    write_js.write_text(
        "import { readFileSync, writeFileSync } from 'node:fs'\\n"
        "import { replacePersonaText } from '../../../../packages/dsh-bot-host/src/bots.ts'\\n"
        "const path = process.argv[2]\\n"
        "const persona = process.argv[3]\\n"
        "writeFileSync(path, replacePersonaText(readFileSync(path, 'utf8'), persona))\\n"
    )
    try:
        subprocess.check_call([str(ROOT / "node_modules/.bin/tsx"), str(write_js), str(PRESET), long_persona])
        listed = None
        list_error = None
        method_used = None
        for method in ("agentPresets/list", "agentPreset/list"):
            try:
                listed = dsh_rpc(method)
                method_used = method
                break
            except Exception as exc:
                list_error = str(exc)
        presets = []
        if isinstance(listed, dict):
            result = listed.get("result") or listed
            value = (result.get("value") if isinstance(result, dict) else None) or listed.get("value")
            if isinstance(value, dict):
                presets = value.get("presets") or value.get("items") or []
            elif isinstance(value, list):
                presets = value
        hit = next((row for row in presets if isinstance(row, dict) and row.get("id") == "dsh-bot--xiaodui-aning"), None)
        notes["asm804"] = {
            "persona_chars": len(long_persona),
            "method": method_used,
            "list_error": list_error,
            "hit": hit,
            "broken": None if hit is None else (hit.get("broken") or ""),
            "preset_count": len(presets) if isinstance(presets, list) else 0,
        }
        (OUT / "asm804-list.json").write_text(json.dumps(listed, ensure_ascii=False, indent=2)[:20000] + "\n")
    finally:
        PRESET.write_text(original)
        if write_js.exists():
            write_js.unlink()

    (OUT / "raw.json").write_text(json.dumps(notes, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: notes.get(k) for k in ("asm801", "asm802", "asm803", "asm804")}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
