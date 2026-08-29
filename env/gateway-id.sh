# Probe the loopback listener on $GW_PORT. Source this file (POSIX sh).
# Sets GW_PID and GW_HOME. EXPECTED_HOME defaults to $DSH_HOME.
#
#   gateway_probe            # fill GW_PID / GW_HOME (empty if nobody listens)
#   gateway_require          # fail if down or DSH_HOME mismatch
#   gateway_refuse_foreign   # fail if foreign; return 0 if ours; return 1 if free

gateway_probe() {
  GW_PID=''
  GW_HOME=''
  _gw_out=$(
    GW_PORT="$GW_PORT" python3 -c '
import os, subprocess, sys
port = os.environ["GW_PORT"]
try:
    raw = subprocess.check_output(
        ["lsof", "-nP", "-iTCP:%s" % port, "-sTCP:LISTEN", "-t"],
        text=True, stderr=subprocess.DEVNULL,
    )
except (subprocess.CalledProcessError, FileNotFoundError):
    sys.exit(0)
seen = []
for tok in raw.split():
    if tok.isdigit() and tok not in seen:
        seen.append(tok)
for pid in seen:
    try:
        env = subprocess.check_output(
            ["ps", "eww", "-p", pid],
            text=True, stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        continue
    home = ""
    for part in env.split():
        if part.startswith("DSH_HOME="):
            home = part.split("=", 1)[1]
            break
    if home:
        sys.stdout.write("%s\n%s\n" % (pid, home))
        sys.exit(0)
if seen:
    sys.stdout.write("%s\n\n" % seen[0])
'
  ) || true
  if [ -n "$_gw_out" ]; then
    GW_PID=$(printf '%s\n' "$_gw_out" | sed -n '1p')
    GW_HOME=$(printf '%s\n' "$_gw_out" | sed -n '2p')
  fi
}

gateway_require() {
  gateway_probe
  _want=${EXPECTED_HOME:-$DSH_HOME}
  if [ -z "$GW_PID" ]; then
    echo "网关 http://127.0.0.1:${GW_PORT} 没起来。先：sh env/boot.sh" >&2
    exit 1
  fi
  if [ "$GW_HOME" != "$_want" ]; then
    echo "网关 :${GW_PORT} (pid ${GW_PID}) 的 DSH_HOME=${GW_HOME:-空} 不是本仓 ${_want}。那是别人的实例，不要打。" >&2
    exit 1
  fi
}

# 0 = already ours, 1 = port free, 2 = foreign (also prints and exits 1)
gateway_refuse_foreign() {
  gateway_probe
  _want=${EXPECTED_HOME:-$DSH_HOME}
  if [ -z "$GW_PID" ]; then
    return 1
  fi
  if [ "$GW_HOME" = "$_want" ]; then
    return 0
  fi
  echo "env/boot: :${GW_PORT} (pid ${GW_PID}) DSH_HOME=${GW_HOME:-空} 不是本仓 ${_want}" >&2
  exit 1
}
