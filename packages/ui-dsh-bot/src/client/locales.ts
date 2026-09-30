/**
 * `dsh-bot` namespace dictionaries. The embedded workbench renders its own
 * copy; this namespace only names the plugin for slot registrations.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'tab.title': 'DSH Bot',
} satisfies Record<string, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'tab.title': 'DSH Bot',
} satisfies Record<keyof typeof zh, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-bot' as const
