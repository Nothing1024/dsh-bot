#!/bin/sh
# Hub supervisor for profile `gb`. Never exit 0 while we can still adopt or
# start the gateway. If another session already holds :3084 with this DSH_HOME,
# wait on that pid instead of SIGTERM-racing it (that mint-churns LAN tokens).
set -eu
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
  echo "env/supervise: run $ROOT/setup.sh first" >&2
  exit 1
fi
export DSH_HOME="$ROOT"
GW_PORT=3084
EXPECTED_HOME="$ROOT"
# shellcheck disable=SC1091
. "$ROOT/gateway-id.sh"

DSH_JS="$ROOT/profiles/gb/node_modules/@deepseek-ai/dsh/lib/bin.js"
if [ ! -f "$DSH_JS" ]; then
  DSH_JS=$(ls -1t "$HOME/.npm/_npx/"*/node_modules/@deepseek-ai/dsh/lib/bin.js 2>/dev/null | head -1 || true)
fi
if [ -z "${DSH_JS:-}" ] || [ ! -f "$DSH_JS" ]; then
  echo "env/supervise: dsh bin.js not found" >&2
  exit 1
fi

lan_ip=$(ipconfig getifaddr en0 2>/dev/null || true)
announce() {
  if [ -n "${lan_ip:-}" ]; then
    echo "dsh web: http://127.0.0.1:${GW_PORT}/ (LAN: http://${lan_ip}:${GW_PORT}/) pid=$1"
  else
    echo "dsh web: http://127.0.0.1:${GW_PORT}/ pid=$1"
  fi
}

while true; do
  if gateway_refuse_foreign; then
    announce "$GW_PID"
    echo "env/supervise: adopting pid=$GW_PID"
    while kill -0 "$GW_PID" 2>/dev/null; do
      sleep 2
    done
    echo "env/supervise: pid $GW_PID gone"
    continue
  fi
  echo "env/supervise: starting $DSH_JS"
  node "$DSH_JS" --profile gb --port "$GW_PORT" --no-open "$@" || true
done
