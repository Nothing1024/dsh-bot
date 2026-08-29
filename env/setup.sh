#!/bin/sh
# Install profile `gb` under this directory (this folder is DSH_HOME).
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PLUGIN=$(CDPATH='' cd -- "$ROOT/.." && pwd)
GB="$ROOT/profiles/gb"
HEADLESS="$ROOT/profiles/headless"
NEIGHBOR_TOOL="$PLUGIN/../../session-tool/plugin/packages/tool-session"
NEIGHBOR_SETTINGS="$PLUGIN/../../session-tool/plugin/env/settings.yaml"

if [ ! -d "$NEIGHBOR_TOOL/lib" ]; then
  echo "env/setup: neighbor tool-session is not built: $NEIGHBOR_TOOL" >&2
  echo "env/setup: (cd $PLUGIN/../../session-tool/plugin && pnpm run build)" >&2
  exit 1
fi

# Models 页读 $DSH_HOME/.credentials.yaml（优先于 .env）。没有就从本机 ~/.dsh/.env 拷。
# 不拷 ~/.dsh/.credentials.yaml：那边可能是另一套 baseURL 的 key。
if [ ! -f "$ROOT/.env" ] && [ -f "$HOME/.dsh/.env" ]; then
  cp "$HOME/.dsh/.env" "$ROOT/.env"
  chmod 600 "$ROOT/.env"
  echo "env/setup: seeded .env from ~/.dsh/.env"
fi
if [ ! -f "$ROOT/.credentials.yaml" ] && [ -f "$ROOT/.env" ]; then
  KEY=$(awk -F= '/^DEEPSEEK_API_KEY=/{print substr($0,index($0,"=")+1); exit}' "$ROOT/.env")
  if [ -n "$KEY" ]; then
    umask 077
    printf 'DEEPSEEK_API_KEY: %s\n' "$KEY" >"$ROOT/.credentials.yaml"
    chmod 600 "$ROOT/.credentials.yaml"
    echo "env/setup: wrote .credentials.yaml from .env"
  fi
fi
if [ ! -f "$ROOT/.env" ] && [ ! -f "$ROOT/.credentials.yaml" ]; then
  echo "env/setup: 没有 API key。把 DEEPSEEK_API_KEY 写进 $ROOT/.env 或 $ROOT/.credentials.yaml" >&2
fi

# settings.yaml is gitignored. Prefer the live session-tool copy (same model
# routing the user already uses); otherwise seed from the committed example.
# Neighbor settings have no agent-presets.default — stamp BR-002 after seed
# so clone + setup.sh still boots new sessions as dsh-bot, not standard.
ensure_dsh_bot_preset_default() {
  python3 - "$1" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
lines = text.splitlines()
out = []
i = 0
found = False
changed = False
while i < len(lines):
    line = lines[i]
    if line.startswith("agent-presets:"):
        found = True
        out.append(line)
        i += 1
        saw_default = False
        while i < len(lines):
            cur = lines[i]
            if cur and not cur[0].isspace() and not cur.lstrip().startswith("#"):
                break
            stripped = cur.strip()
            if stripped.startswith("default:"):
                indent = cur[: len(cur) - len(cur.lstrip())] or "  "
                if stripped.split(":", 1)[1].strip() != "dsh-bot":
                    out.append("%sdefault: dsh-bot" % indent)
                    changed = True
                else:
                    out.append(cur)
                saw_default = True
                i += 1
                continue
            out.append(cur)
            i += 1
        if not saw_default:
            out.append("  default: dsh-bot")
            changed = True
        continue
    out.append(line)
    i += 1
if not found:
    block = ["agent-presets:", "  default: dsh-bot"]
    inserted = False
    rebuilt = []
    i = 0
    while i < len(out):
        rebuilt.append(out[i])
        if out[i].startswith("agent-default-model:"):
            i += 1
            while i < len(out) and (not out[i] or out[i][0].isspace() or out[i].lstrip().startswith("#")):
                rebuilt.append(out[i])
                i += 1
            rebuilt.extend(block)
            inserted = True
            continue
        i += 1
    if not inserted:
        if rebuilt and rebuilt[-1] != "":
            rebuilt.append("")
        rebuilt.extend(block)
    out = rebuilt
    changed = True
if changed:
    path.write_text("\n".join(out) + "\n")
    print("env/setup: set agent-presets.default: dsh-bot in", path)
else:
    print("env/setup: agent-presets.default already dsh-bot")
PY
}

if [ ! -f "$ROOT/settings.yaml" ]; then
  if [ -f "$NEIGHBOR_SETTINGS" ]; then
    cp "$NEIGHBOR_SETTINGS" "$ROOT/settings.yaml"
    chmod 600 "$ROOT/settings.yaml"
    echo "env/setup: copied settings.yaml from session-tool env"
  elif [ -f "$ROOT/settings.example.yaml" ]; then
    cp "$ROOT/settings.example.yaml" "$ROOT/settings.yaml"
    echo "env/setup: copied settings.yaml from settings.example.yaml"
  fi
fi
if [ -f "$ROOT/settings.yaml" ]; then
  ensure_dsh_bot_preset_default "$ROOT/settings.yaml"
  chmod 600 "$ROOT/settings.yaml"
fi

cd "$GB"
pnpm install
if [ -d "$HEADLESS" ]; then
  cd "$HEADLESS"
  pnpm install
fi
echo "env/setup: ok"
echo "boot: $ROOT/boot.sh"
echo "or:   DSH_HOME=$ROOT npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile gb --port 3084 --no-open"
