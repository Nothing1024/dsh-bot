#!/bin/sh
# Install profile `gb` under this directory (this folder is DSH_HOME).
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PLUGIN=$(CDPATH='' cd -- "$ROOT/.." && pwd)
GB="$ROOT/profiles/gb"
HEADLESS="$ROOT/profiles/headless"
NEIGHBOR_TOOL="$PLUGIN/../../session-tool/plugin/packages/tool-session"

if [ ! -d "$NEIGHBOR_TOOL/lib" ]; then
  echo "env/setup: neighbor tool-session is not built: $NEIGHBOR_TOOL" >&2
  echo "env/setup: (cd $PLUGIN/../../session-tool/plugin && pnpm run build)" >&2
  exit 1
fi

SHARED="$PLUGIN/../../.shared"
if [ -x "$SHARED/apply.sh" ]; then
  sh "$SHARED/apply.sh" --home "$ROOT" --no-install
else
  echo "env/setup: missing $SHARED/apply.sh" >&2
  exit 1
fi

cd "$GB"
pnpm install
if [ -d "$HEADLESS" ]; then
  cd "$HEADLESS"
  pnpm install
fi
echo "env/setup: ok"
echo "boot: $ROOT/boot.sh"
echo "or:   DSH_HOME=$ROOT node $GB/node_modules/@deepseek-ai/dsh/lib/bin.js --profile gb --port 3084 --no-open"
