/**
 * Polls a predicate function until it returns true or the timeout expires.
 *
 * @param predicate - Function that returns true when the condition is met.
 * @param options - Timeout (ms, default 5000) and poll interval (ms, default 100).
 */
export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5_000;
  const interval = options?.interval ?? 100;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
}
