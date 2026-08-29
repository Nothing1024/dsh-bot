/**
 * Required client services. betterSidebar is requested via ctx.inject inside
 * apply so a missing package never leaves this fiber PENDING (BR-008).
 */
export const inject = ['sessions', 'locale'] as const
