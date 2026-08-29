#!/bin/sh
# Boot profile `gb` from this env directory.
#   sh env/boot.sh              loopback :3084 (this warehouse; overlay webUrl)
#   sh env/boot.sh --lan        delegates to dsh-plugin-debug-env/scripts/boot-lan.sh
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
if [ ! -d "$ROOT/profiles/gb/node_modules/@deepseek-ai/dsh-base" ]; then
  echo "env/boot: run $ROOT/setup.sh first" >&2
  exit 1
fi
export DSH_HOME="$ROOT"
GW_PORT=3084
EXPECTED_HOME="$ROOT"
# shellcheck disable=SC1091
. "$ROOT/gateway-id.sh"

find_skill() {
  if [ -n "${DSH_PLUGIN_DEBUG_ENV:-}" ] && [ -x "$DSH_PLUGIN_DEBUG_ENV/scripts/boot-lan.sh" ]; then
    echo "$DSH_PLUGIN_DEBUG_ENV"
    return
  fi
  rel="$ROOT/../../../../.agents/skills/dsh-plugin-debug-env"
  if [ -x "$rel/scripts/boot-lan.sh" ]; then
    CDPATH='' cd -- "$rel" && pwd
    return
  fi
  if [ -x "$HOME/.agents/skills/dsh-plugin-debug-env/scripts/boot-lan.sh" ]; then
    echo "$HOME/.agents/skills/dsh-plugin-debug-env"
    return
  fi
  echo "env/boot: dsh-plugin-debug-env skill not found" >&2
  exit 1
}

if [ "${1:-}" = "--lan" ]; then
  shift
  SKILL=$(find_skill)
  exec "$SKILL/scripts/boot-lan.sh" --home "$ROOT" --profile gb --overlay "$ROOT/lan.patch.yml" "$@"
fi

if gateway_refuse_foreign; then
  echo "env/boot: already up pid=$GW_PID http://127.0.0.1:${GW_PORT}"
  exit 0
fi
exec npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile gb --port "$GW_PORT" --no-open "$@"
