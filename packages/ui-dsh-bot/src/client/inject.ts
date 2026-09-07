/**
 * Required client services. slots is the official slot ledger (ASM-601).
 * betterSidebar is requested via ctx.inject inside apply so a missing
 * package never leaves this fiber PENDING (BR-008).
 */
export const inject = ['sessions', 'locale', 'slots'] as const
