#!/usr/bin/env bash
# dsh-bot 半自动 CLI 矩阵：先 gateway_require(:3084)，再 UF-001 建会话冒烟、
# UF-002 插件创建（--write 才走模型委托）、UF-006 override 开关核 header、
# UF-004 marks 查询。记录写 env/manual-test-last.txt。
#
# 需要 :3084 上本仓网关已起（sh env/boot.sh）。不要再 boot --profile gb。
# 先核监听进程的 DSH_HOME 是本仓 env/，再打；别人的 :3084 直接失败。
#
#   bash scripts/manual-test.sh              # 含 session.prompt（走模型）
#   bash scripts/manual-test.sh --no-write   # 只建会话 / 设 override / 查 marks
#   bash scripts/manual-test.sh --out PATH
#
# 前台：http://127.0.0.1:3084
set -u

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
DSH_HOME="${DSH_HOME:-$ROOT/env}"
CLI_REL='../../session-tool/plugin/packages/session-tool-cli/lib/bin.js'
CLI_BIN="$ROOT/$CLI_REL"
PATCH="$DSH_HOME/cli.patch.yml"
WHO="$HOME/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh"
RPC="$HOME/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh"
STAMP=$(date +%Y%m%d-%H%M%S)
PREFIX="dsh-bot-manual-${STAMP}"
OUT="$DSH_HOME/manual-test-last.txt"
WITH_WRITE=1
GW_PORT=3084

while [ $# -gt 0 ]; do
  case "$1" in
    --write) WITH_WRITE=1; shift ;;
    --no-write) WITH_WRITE=0; shift ;;
    --out) OUT=$2; shift 2 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      printf '未知参数: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

PASS=0
FAIL=0
LAST_EXIT=0
LAST_STDOUT=''
LAST_STDERR=''
LAST_JSON_FILE=$(mktemp)
RESTORE_OVERRIDE=0
SAVED_OVERRIDE_JSON=''
UF001=''
UF002=''
UF006_ON=''
UF006_OFF=''
UF006_GUI=''
GLOBAL_PROVIDER=''
GLOBAL_MODEL=''
OVERRIDE_PROVIDER=''
OVERRIDE_MODEL=''

say() {
  printf '%s\n' "$*" | tee -a "$OUT"
}

quote_args() {
  local out='' a
  for a in "$@"; do
    if [ -z "$a" ]; then
      out="$out ''"
    elif printf '%s' "$a" | grep -Eq '[[:space:]|&;<>()\$`"'"'"'\\]'; then
      out="$out '$(printf '%s' "$a" | sed "s/'/'\\\\''/g")'"
    else
      out="$out $a"
    fi
  done
  printf '%s' "${out# }"
}

json_eval() {
  local code=$1
  shift
  node --input-type=module -e "$code" "$@" <"$LAST_JSON_FILE"
}

rpc_ok() {
  json_eval 'const j=JSON.parse(await new Response(process.stdin).text()); const ok=j.result?j.result.ok:j.ok; process.exit(ok===true?0:1)'
}

rpc_value() {
  json_eval '
    const j=JSON.parse(await new Response(process.stdin).text());
    const v=j.result&&Object.prototype.hasOwnProperty.call(j.result,"value")?j.result.value:j.value;
    const path=process.argv.slice(1);
    let cur=v;
    for (const p of path) {
      if (cur==null) { process.stdout.write(""); process.exit(0); }
      cur=cur[p];
    }
    if (cur===undefined||cur===null) process.stdout.write("");
    else if (typeof cur==="string"||typeof cur==="number"||typeof cur==="boolean") process.stdout.write(String(cur));
    else process.stdout.write(JSON.stringify(cur));
  ' "$@"
}

run_capture() {
  local heading=$1
  shift
  local stdout_f stderr_f display
  stdout_f=$(mktemp)
  stderr_f=$(mktemp)
  display=$(quote_args "$@")
  say ''
  say "## $heading"
  say "\$ $display"
  "$@" >"$stdout_f" 2>"$stderr_f"
  LAST_EXIT=$?
  LAST_STDOUT=$(cat "$stdout_f")
  LAST_STDERR=$(cat "$stderr_f")
  printf '%s' "$LAST_STDOUT" >"$LAST_JSON_FILE"
  rm -f "$stdout_f" "$stderr_f"
  say "退出码 $LAST_EXIT"
  say '--- 标准输出 ---'
  if [ -n "$LAST_STDOUT" ]; then say "$LAST_STDOUT"; else say '（空）'; fi
  say '--- 标准错误 ---'
  if [ -n "$LAST_STDERR" ]; then say "$LAST_STDERR"; else say '（空）'; fi
  say ''
}

run_rpc() {
  local heading=$1
  local method=$2
  local args=${3:-'{}'}
  run_capture "$heading" "$RPC" "$GW_PORT" "$method" "$args"
}

run_http() {
  local heading=$1
  local method=$2
  local args=${3:-'{}'}
  local body
  body=$(node --input-type=module -e 'const args=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify({args}))' "$args")
  run_capture "$heading" curl -sS -X POST "http://127.0.0.1:${GW_PORT}/dsh-bot/${method}" \
    -H 'Content-Type: application/json' \
    -d "$body"
}

run_cli() {
  local heading=$1
  shift
  run_capture "$heading" env DSH_HOME="$DSH_HOME" node "$CLI_BIN" "$@"
}

marks() {
  local heading=$1
  shift
  run_cli "$heading" "$@"
}

check() {
  local name=$1
  shift
  if "$@"; then
    say "核对 ${name}：通过"
    PASS=$((PASS + 1))
  else
    say "核对 ${name}：失败"
    FAIL=$((FAIL + 1))
  fi
}

eq() { [ "$1" = "$2" ]; }
nonzero() { [ "$1" -ne 0 ]; }
nempty() { [ -n "$1" ]; }

stderr_has() {
  case "$LAST_STDERR" in *"$1"*) return 0 ;; *) return 1 ;; esac
}

stdout_has() {
  case "$LAST_STDOUT" in *"$1"*) return 0 ;; *) return 1 ;; esac
}

inventory_active() {
  local id=$1
  LAST_JSON_FILE="$LAST_JSON_FILE" ID="$id" node --input-type=module -e '
    const fs=await import("node:fs");
    const j=JSON.parse(fs.readFileSync(process.env.LAST_JSON_FILE,"utf8"));
    const entries=j.result?.value?.entries||[];
    const hit=entries.find((e)=>e.entryId===process.env.ID);
    process.exit(hit&&hit.fiberPhase==="active"?0:1);
  '
}

pick_override() {
  json_eval '
    const j=JSON.parse(await new Response(process.stdin).text());
    const v=j.result.value;
    const cur=v.current||{};
    const groups=v.groups||[];
    let alt=null;
    for (const g of groups) {
      for (const m of g.models||[]) {
        if (g.id!==cur.provider || m.id!==cur.model) { alt={provider:g.id,model:m.id}; break; }
      }
      if (alt) break;
    }
    process.stdout.write(JSON.stringify({
      provider: cur.provider||"",
      model: cur.model||"",
      overrideProvider: (alt||cur).provider||"",
      overrideModel: (alt||cur).model||"",
      distinct: Boolean(alt),
    }));
  '
}

describe_ns() {
  local ns=$1
  json_eval '
    const j=JSON.parse(await new Response(process.stdin).text());
    const ns=process.argv[1];
    const row=(j.result?.value?.namespaces||[]).find((n)=>n.ns===ns);
    process.stdout.write(row?JSON.stringify(row):"");
  ' "$ns"
}

restore_override() {
  if [ "$RESTORE_OVERRIDE" -ne 1 ]; then
    return 0
  fi
  if [ -z "$SAVED_OVERRIDE_JSON" ]; then
    run_rpc "恢复：清空 dsh-bot.model" settings.update '{"ns":"dsh-bot","patch":{"model":{"provider":"","model":""}}}'
    return 0
  fi
  local patch
  patch=$(SAVED="$SAVED_OVERRIDE_JSON" node --input-type=module -e '
    const row=JSON.parse(process.env.SAVED);
    const model=row.value&&row.value.model?row.value.model:{provider:"",model:""};
    process.stdout.write(JSON.stringify({ns:"dsh-bot",patch:{model}}));
  ')
  run_rpc "恢复：写回原 dsh-bot.model" settings.update "$patch"
}

cleanup() {
  restore_override
  rm -f "$LAST_JSON_FILE"
}

trap cleanup EXIT

mkdir -p "$(dirname -- "$OUT")"
: >"$OUT"

if [ ! -f "$CLI_BIN" ]; then
  echo "缺少 ${CLI_REL}，先在邻仓 session-tool 跑 pnpm run build" >&2
  exit 1
fi
if [ ! -f "$PATCH" ]; then
  echo "缺少 $PATCH" >&2
  exit 1
fi
if [ ! -d "$DSH_HOME/profiles/gb/node_modules/@deepseek-ai/dsh-base" ]; then
  echo "还没跑 env/setup.sh" >&2
  exit 1
fi
if [ ! -x "$WHO" ] || [ ! -x "$RPC" ]; then
  echo "缺少 dsh-plugin-debug scripts（dsh-rpc-who.sh / dsh-rpc.sh）" >&2
  exit 1
fi

EXPECTED_HOME="$DSH_HOME"
# shellcheck disable=SC1091
. "$DSH_HOME/gateway-id.sh"
gateway_require

say "# dsh-bot 一键 CLI 矩阵"
say "时间：$STAMP"
say "ROOT：$ROOT"
say "DSH_HOME：$DSH_HOME"
say "网关：http://127.0.0.1:${GW_PORT} pid=$GW_PID home=$GW_HOME"
say "CLI：node $CLI_BIN"
say "write：$WITH_WRITE"
say "本轮标题前缀：$PREFIX"
say "说明：不要再 boot --profile gb。须本仓 DSH_HOME。先 who 再 RPC。"
run_capture "who :${GW_PORT}" "$WHO" "$GW_PORT"
check who-本仓 stdout_has "$DSH_HOME"
GW=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "http://127.0.0.1:${GW_PORT}/" || true)
if [ "$GW" != 200 ]; then
  echo "网关 http://127.0.0.1:${GW_PORT} 身份对但 HTTP=${GW}。先：sh env/boot.sh" >&2
  exit 1
fi
say "监听："
(lsof -nP -iTCP:"$GW_PORT" -sTCP:LISTEN || true) | tee -a "$OUT"
say ''

say '=== 装配：pluginInventory 本仓行 active ==='
run_rpc "pluginInventory/list" pluginInventory/list
check 库存-退出码 eq "$LAST_EXIT" 0
check 库存-dsh-bot-host inventory_active include:dsh-bot-host
check 库存-tool-dsh-bot inventory_active include:tool-dsh-bot
check 库存-ui-dsh-bot inventory_active include:ui-dsh-bot

say '=== UF-001 建会话冒烟（session.create 吃默认 preset=dsh-bot） ==='
CREATE_PAYLOAD=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({cwd:process.argv[1]}))' "$ROOT")
run_rpc "UF-001 session.create" session.create "$CREATE_PAYLOAD"
check UF-001-退出码 eq "$LAST_EXIT" 0
check UF-001-rpc-ok rpc_ok
UF001=$(rpc_value sessionId)
check UF-001-有id nempty "$UF001"
check UF-001-preset eq "$(rpc_value agentPreset)" dsh-bot

run_rpc "UF-001 session.models（全局默认）" session.models "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1]}))' "$UF001")"
PICK=$(pick_override)
GLOBAL_PROVIDER=$(PICK="$PICK" node --input-type=module -e 'process.stdout.write(JSON.parse(process.env.PICK).provider)')
GLOBAL_MODEL=$(PICK="$PICK" node --input-type=module -e 'process.stdout.write(JSON.parse(process.env.PICK).model)')
OVERRIDE_PROVIDER=$(PICK="$PICK" node --input-type=module -e 'process.stdout.write(JSON.parse(process.env.PICK).overrideProvider)')
OVERRIDE_MODEL=$(PICK="$PICK" node --input-type=module -e 'process.stdout.write(JSON.parse(process.env.PICK).overrideModel)')
DISTINCT=$(PICK="$PICK" node --input-type=module -e 'process.stdout.write(String(JSON.parse(process.env.PICK).distinct))')
say "全局模型：${GLOBAL_PROVIDER}/${GLOBAL_MODEL}"
say "override 候选：${OVERRIDE_PROVIDER}/${OVERRIDE_MODEL} distinct=${DISTINCT}"
check UF-001-有全局模型 nempty "$GLOBAL_PROVIDER"

if [ "$WITH_WRITE" -eq 1 ]; then
  say '=== UF-001 --write：prompt 你是谁? ==='
  PROMPT=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1],mode:"queue",content:[{type:"text",text:process.argv[2]}]}))' "$UF001" '你是谁?')
  run_rpc "UF-001 session.prompt" session.prompt "$PROMPT"
  check UF-001-prompt-ok rpc_ok
  i=0
  while [ "$i" -lt 60 ]; do
    sleep 3
    run_rpc "UF-001 轮询 history ($i)" session.history "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1],maxMessages:40}))' "$UF001")"
    if stdout_has '"role":"assistant"' || stdout_has 'assistant/message'; then
      break
    fi
    i=$((i + 1))
  done
  check UF-001-有assistant stdout_has 'assistant'
fi

say '=== UF-002 CLI 驱动委托（--no-write 走 /dsh-bot/createSession；--write 另打 dsh_bot_ask） ==='
HTTP_CREATE=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({title:process.argv[1],cwd:process.argv[2]}))' "${PREFIX}-plugin" "$ROOT")
run_http "UF-002 /dsh-bot/createSession" createSession "$HTTP_CREATE"
check UF-002-http-ok rpc_ok
UF002=$(rpc_value sessionId)
check UF-002-有id nempty "$UF002"

if [ "$WITH_WRITE" -eq 1 ]; then
  ASK=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1],mode:"queue",content:[{type:"text",text:process.argv[2]}]}))' "$UF001" "Use the dsh_bot_ask tool exactly once. prompt: Reply with exactly: dsh bot pong. title: ${PREFIX}. After the tool returns, quote the answer and stop.")
  run_rpc "UF-002 session.prompt → dsh_bot_ask" session.prompt "$ASK"
  check UF-002-prompt-ok rpc_ok
  i=0
  while [ "$i" -lt 80 ]; do
    sleep 3
    run_rpc "UF-002 轮询 history ($i)" session.history "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1],maxMessages:80}))' "$UF001")"
    if stdout_has 'dsh_bot_ask' && stdout_has 'tool'; then
      break
    fi
    i=$((i + 1))
  done
  check UF-002-工具名 stdout_has 'dsh_bot_ask'
fi

say '=== UF-006 override 设置 / 清空，经插件创建并核 session.models ==='
run_rpc "settings.describe 快照" settings.describe '{}'
SAVED_OVERRIDE_JSON=$(describe_ns dsh-bot)
RESTORE_OVERRIDE=1

OV_PATCH=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({ns:"dsh-bot",patch:{model:{provider:process.argv[1],model:process.argv[2]}}}))' "$OVERRIDE_PROVIDER" "$OVERRIDE_MODEL")
run_rpc "UF-006 写入 override" settings.update "$OV_PATCH"
check UF-006-update-ok rpc_ok

run_http "UF-006 listSessions（override 开）" listSessions '{"includeHidden":true}'
check UF-006-list-ok rpc_ok
check UF-006-botModel-source eq "$(rpc_value botModel source)" override
check UF-006-botModel-provider eq "$(rpc_value botModel provider)" "$OVERRIDE_PROVIDER"
check UF-006-botModel-model eq "$(rpc_value botModel model)" "$OVERRIDE_MODEL"

HTTP_ON=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({title:process.argv[1],cwd:process.argv[2]}))' "${PREFIX}-override-on" "$ROOT")
run_http "UF-006 插件新建（override 开）" createSession "$HTTP_ON"
check UF-006-on-ok rpc_ok
UF006_ON=$(rpc_value sessionId)
check UF-006-on-id nempty "$UF006_ON"
run_rpc "UF-006 session.models 插件会话" session.models "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1]}))' "$UF006_ON")"
check UF-006-on-provider eq "$(rpc_value current provider)" "$OVERRIDE_PROVIDER"
check UF-006-on-model eq "$(rpc_value current model)" "$OVERRIDE_MODEL"

GUI_PAYLOAD=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({cwd:process.argv[1]}))' "$ROOT")
run_rpc "UF-006 GUI 直建（应不受 override）" session.create "$GUI_PAYLOAD"
UF006_GUI=$(rpc_value sessionId)
check UF-006-gui-id nempty "$UF006_GUI"
run_rpc "UF-006 session.models GUI 直建" session.models "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1]}))' "$UF006_GUI")"
check UF-006-gui-provider eq "$(rpc_value current provider)" "$GLOBAL_PROVIDER"
check UF-006-gui-model eq "$(rpc_value current model)" "$GLOBAL_MODEL"

OFF_PATCH='{"ns":"dsh-bot","patch":{"model":{"provider":"","model":""}}}'
run_rpc "UF-006 清空 override" settings.update "$OFF_PATCH"
check UF-006-clear-ok rpc_ok

run_http "UF-006 listSessions（override 关）" listSessions '{}'
check UF-006-off-source eq "$(rpc_value botModel source)" global-default

HTTP_OFF=$(node --input-type=module -e 'process.stdout.write(JSON.stringify({title:process.argv[1],cwd:process.argv[2]}))' "${PREFIX}-override-off" "$ROOT")
run_http "UF-006 插件新建（override 关）" createSession "$HTTP_OFF"
UF006_OFF=$(rpc_value sessionId)
check UF-006-off-id nempty "$UF006_OFF"
run_rpc "UF-006 session.models 清空后插件会话" session.models "$(node --input-type=module -e 'process.stdout.write(JSON.stringify({sessionId:process.argv[1]}))' "$UF006_OFF")"
check UF-006-off-provider eq "$(rpc_value current provider)" "$GLOBAL_PROVIDER"
check UF-006-off-model eq "$(rpc_value current model)" "$GLOBAL_MODEL"

RESTORE_OVERRIDE=0

say '=== UF-004 marks list --kind kind:dsh-bot ==='
marks "UF-004 marks list kind:dsh-bot" marks list --kind kind:dsh-bot
check UF-004-退出码 eq "$LAST_EXIT" 0
check UF-004-有插件会话 stdout_has "$UF002"
check UF-004-含kind stdout_has 'kind:dsh-bot'

marks "UF-004 空 kind" marks list --kind kind:dsh-bot-no-such
check UF-004-空-退出码 eq "$LAST_EXIT" 0
check UF-004-空提示 stdout_has '(no marks)'

say ''
say '=== 本轮会话对照 ==='
say "打开 http://127.0.0.1:${GW_PORT}"
say "UF-001 GUI/默认 preset  $UF001"
say "UF-002 插件新建         $UF002"
say "UF-006 override 开      $UF006_ON"
say "UF-006 GUI 直建         $UF006_GUI"
say "UF-006 override 关      $UF006_OFF"
say ''
say "核对 $PASS 通过 / $FAIL 失败"
say "完整记录：$OUT"

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
