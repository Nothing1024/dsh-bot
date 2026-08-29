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

cd "$GB"
pnpm install
if [ -d "$HEADLESS" ]; then
  cd "$HEADLESS"
  pnpm install
fi
echo "env/setup: ok"
echo "boot: $ROOT/boot.sh"
echo "or:   DSH_HOME=$ROOT npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile gb --port 3084 --no-open"
