/**
 * User-facing copy for `/dsh-bot/*` wire errors.
 *
 * The host answers `{ok:false, error:{code, message}}`; `message` is developer
 * prose - service names, provider ids, host paths, JSON guts - and stays
 * verbatim so a bug report keeps its evidence. This module adds the two things
 * a user needs in front of it: a headline naming what failed, and, when the
 * cause is known, the one action that resolves it.
 *
 * Unknown codes keep the raw message and get a generic headline; nothing is
 * dropped, rewritten, or hidden behind a friendly-only string.
 */

import type { WorkbenchWireError } from './types.ts'

/** One rendered error: headline, optional next step, and the untouched detail. */
export interface WireErrorCopy {
  /** Wire code as sent; `internal` when the host sent none. */
  readonly code: string
  /** What failed, in user terms. */
  readonly title: string
  /** The action that resolves it, when the cause is known. */
  readonly hint?: string
  /** Host message verbatim. */
  readonly detail: string
}

interface Copy {
  readonly title: string
  readonly hint?: string
}

/**
 * Codes the Bot host actually raises plus the session-tool codes that travel
 * through it. Keep the wording action-shaped: what the user can do next, not
 * what the code means internally.
 */
const COPY: Record<string, Copy> = {
  'invalid-mention': {
    title: '点名成员未确认，消息尚未发送',
    hint: '从 @ 候选列表重新选择；要让全员回应请使用 @all。',
  },
  'invalid-input': {
    title: '输入不合法',
    hint: '检查名字、人设等字段后重试。',
  },
  'empty-prompt': {
    title: '消息为空',
    hint: '输入内容后再发送。',
  },
  'not-found': {
    title: '目标不存在',
    hint: '列表可能已过期，刷新后重试。',
  },
  'bot-not-found': {
    title: '人设不存在或已被删除',
    hint: '刷新人设列表后重新选择。',
  },
  'group-not-found': {
    title: '小组不存在或成员不足',
    hint: '刷新小组列表后重新选择。',
  },
  'bot-protected': {
    title: '这是受保护的内置人设',
    hint: '直接使用它，或新建一份人设再改。',
  },
  'forbidden': {
    title: '无权修改这个对象',
    hint: '只有创建者或同工作区的调用方可以改。',
  },
  'override-invalid': {
    title: '该人设指定的模型不可用',
    hint: '在「编辑人设 → 模型」里换成已配置的 provider/model，或留空跟随全局。',
  },
  'override-unavailable': {
    title: '模型网关暂时不可用',
    hint: '稍后重试；持续失败时检查网关设置里的提供方配置。',
  },
  'override-restore-failed': {
    title: '恢复默认模型失败',
    hint: '清空该人设的模型覆盖后重试。',
  },
  'preset-broken': {
    title: '人设预设文件损坏',
    hint: '重新创建该人设，或修复 $DSH_HOME/dsh-bot 下的预设文件。',
  },
  'registry-corrupt': {
    title: 'Bot 注册表读写失败',
    hint: '确认 $DSH_HOME/dsh-bot/*.json 存在且可写。',
  },
  'web-unreachable': {
    title: '连不上 DSH 网关',
    hint: '网关可能已退出或换了端口，重启 env/boot.sh 后重试。',
  },
  'session-failed': {
    title: '会话创建失败',
    hint: '重试；仍失败时看网关终端里的报错。',
  },
  'respond-unavailable': {
    title: '该成员暂时无法回应',
    hint: '重试，或先在 1:1 对话里让它回答一次。',
  },
  'cancel-unavailable': {
    title: '当前没有可停止的生成',
  },
  'update-queue-unavailable': {
    title: '排队消息不可修改',
  },
  'unavailable': {
    title: '网关尚未就绪',
    hint: '等侧栏恢复「已连接」后重试。',
  },
  'timeout': {
    title: '请求超时',
    hint: '网关 20 秒内没有回应：确认它还开着，然后重试。',
  },
  'unauthorized': {
    title: '登录凭据已失效',
    hint: '网关重启会让旧标签页的凭据失效：刷新页面后重试。',
  },
  'internal': {
    title: '内部错误',
    hint: '可以重试；反复出现时带上下面的原始信息反馈。',
  },
}

const FALLBACK: Copy = {
  title: '操作失败',
  hint: '可以重试；反复出现时带上下面的原始信息反馈。',
}

/**
 * Split one wire error into headline, next step, and untouched detail.
 * @param error - host error; `code` may be absent.
 * @returns copy safe to render directly.
 */
export function describeWireError(error: WorkbenchWireError): WireErrorCopy {
  const code = error.code !== undefined && error.code !== '' ? error.code : 'internal'
  const copy = COPY[code] ?? FALLBACK
  return {
    code,
    title: copy.title,
    ...copy.hint === undefined ? {} : { hint: copy.hint },
    detail: error.message,
  }
}

/**
 * One-line form for dense surfaces (list/transcript bars, form error rows):
 * headline, the untouched detail, and the wire code.
 * @param error - host error; `code` may be absent.
 * @returns single-line text naming both the user-facing cause and the raw wire facts.
 */
export function formatWireError(error: WorkbenchWireError): string {
  const copy = describeWireError(error)
  const detail = copy.detail.trim()
  return detail === ''
    ? `${copy.title}（${copy.code}）`
    : `${copy.title}：${detail}（${copy.code}）`
}
