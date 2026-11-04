export type ClockSample = { clientSend: number; clientReceive: number; coordinatorTime: number };

/** Local wall-clock time in ms since the Unix epoch, with sub-millisecond precision. */
export const localNow = () => performance.timeOrigin + performance.now();

/**
 * NTP-style estimate: trust the sample with the shortest round trip, assuming the
 * Coordinator stamped it halfway. Returns Coordinator clock minus local clock.
 */
export function estimateOffset(samples: ClockSample[]): { offsetMs: number; rttMs: number } {
  if (samples.length === 0) throw new Error("no clock samples");
  const best = samples.reduce((a, b) =>
    b.clientReceive - b.clientSend < a.clientReceive - a.clientSend ? b : a,
  );
  const rttMs = best.clientReceive - best.clientSend;
  return { offsetMs: best.coordinatorTime - (best.clientSend + rttMs / 2), rttMs };
}
