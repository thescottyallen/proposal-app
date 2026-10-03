/** In-process cap for proposal send and follow-up. One process, one minute. */
export function createEmailRateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return function allowEmail(userId: string, now = Date.now()): boolean {
    const recent = (hits.get(userId) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    hits.set(userId, recent);
    return true;
  };
}

export const allowProposalEmail = createEmailRateLimit(10, 60_000);
