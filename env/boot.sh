#!/bin/sh
# Boot profile `gb` from this env directory.
#   sh env/boot.sh              loopback :3084 (this warehouse; overlay webUrl)
#   sh env/boot.sh --lan        delegates to dsh-plugin-debug-env/scripts/boot-lan.sh
set -eu
# Prefer NVM's default Node. OMP PATH lists Homebrew /usr/local/bin first,
# and that Node's OpenSSL CA store is empty (LLM TLS Connection error).
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
_nvm_alias=$(tr -d '[:space:]' < "$NVM_DIR/alias/default" 2>/dev/null || true)
_nvm_root=$(ls -1d "$NVM_DIR/versions/node"/v${_nvm_alias#v}* 2>/dev/null | tail -1 || true)
if [ -n "${_nvm_root:-}" ] && [ -x "$_nvm_root/bin/node" ]; then
  PATH="$_nvm_root/bin:$PATH"
  export PATH
fi
unset _nvm_alias _nvm_root

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
  # Supervisors (no TTY) must not treat "already up" as a clean exit 0.
  if [ "${DSH_BOOT_ATTACH:-}" = "1" ] || [ ! -t 0 ]; then
    echo "env/boot: attaching; will start when pid $GW_PID exits"
    while kill -0 "$GW_PID" 2>/dev/null; do
      sleep 2
    done
    echo "env/boot: pid $GW_PID gone"
  else
    exit 0
  fi
fi
# Exec the Node entry so a supervisor watches the gateway, not `npm exec` / npx.
# `npx` leaves a wrapper that can exit 0 while the node child keeps :3084.
DSH_JS="$ROOT/profiles/gb/node_modules/@deepseek-ai/dsh/lib/bin.js"
if [ ! -f "$DSH_JS" ]; then
  DSH_JS=$(ls -1t "$HOME/.npm/_npx/"*/node_modules/@deepseek-ai/dsh/lib/bin.js 2>/dev/null | head -1 || true)
fi
if [ -n "${DSH_JS:-}" ] && [ -f "$DSH_JS" ]; then
  exec node "$DSH_JS" --profile gb --port "$GW_PORT" --no-open "$@"
fi
exec npx --yes @deepseek-ai/dsh@0.1.5-rc.1 --profile gb --port "$GW_PORT" --no-open "$@"
