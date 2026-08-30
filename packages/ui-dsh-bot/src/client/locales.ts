/**
 * `dsh-bot` namespace dictionaries for the sidebar tab.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'tab.title': 'DSH Bot',
  'tab.loading': '加载工作台…',
  'tab.error': '无法加载工作台',
  'tab.retry': '重试',
  'list.loading': '加载中…',
  'list.empty': '还没有 DSH Bot 会话',
  'list.emptyHint': '新建一个即可开始对话。',
  'list.error': '无法加载会话列表',
  'list.retry': '重试',
  'list.includeHidden': '包含隐藏',
  'list.new': '新建 DSH Bot 会话',
  'list.creating': '创建中…',
  'list.jumpFailed': '无法打开会话',
  'footer.model': '当前 bot 模型：{model}',
  'footer.source.override': 'override',
  'footer.source.global': '全局',
} satisfies Record<string, string>

/** The dsh-bot tab namespace key union. */
export type DshBotLocaleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'tab.title': 'DSH Bot',
  'tab.loading': 'Loading workbench…',
  'tab.error': 'Could not load the workbench',
  'tab.retry': 'Retry',
  'list.loading': 'Loading…',
  'list.empty': 'No DSH Bot sessions yet',
  'list.emptyHint': 'Create one to start chatting.',
  'list.error': 'Could not load the session list',
  'list.retry': 'Retry',
  'list.includeHidden': 'Include hidden',
  'list.new': 'New DSH Bot session',
  'list.creating': 'Creating…',
  'list.jumpFailed': 'Could not open the session',
  'footer.model': 'Current bot model: {model}',
  'footer.source.override': 'override',
  'footer.source.global': 'global',
} satisfies Record<DshBotLocaleKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-bot' as const
