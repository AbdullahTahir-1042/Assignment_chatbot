/**
 * One place for every query key.
 *
 * Keys are built from parts rather than written inline so a mutation can
 * invalidate the list it changed without a typo silently matching nothing --
 * which is the usual way "the list did not refresh" happens.
 */
export const queryKeys = {
  currentUser: ["auth", "me"] as const,
  appointments: (cursor?: string) => ["appointments", { cursor: cursor ?? null }] as const,
  allAppointments: ["appointments"] as const,
  chatHistory: (sessionId: string) => ["chat", sessionId] as const,
};
