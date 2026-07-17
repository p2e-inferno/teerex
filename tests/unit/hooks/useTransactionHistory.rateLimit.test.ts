import { describe, expect, it, vi } from 'vitest';
import {
  getTransactionLogRanges,
  queryWithRateLimitRetry,
  TRANSACTION_LOG_CHUNK_SIZE,
} from '@/hooks/useTransactionHistory';

describe('transaction history RPC limits', () => {
  it('never creates a log range larger than the provider ten-block limit', () => {
    const ranges = getTransactionLogRanges(1_000, 1_024);

    expect(TRANSACTION_LOG_CHUNK_SIZE).toBe(10);
    expect(ranges).toEqual([
      { start: 1_000, end: 1_009 },
      { start: 1_010, end: 1_019 },
      { start: 1_020, end: 1_024 },
    ]);
  });

  it('retries a rate-limited query once after the bounded delay', async () => {
    const query = vi.fn()
      .mockRejectedValueOnce({ code: 429 })
      .mockResolvedValueOnce(['ok']);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(queryWithRateLimitRetry(query, wait)).resolves.toEqual(['ok']);
    expect(query).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1_000);
  });

  it('propagates a second rate limit and does not retry non-rate-limit failures', async () => {
    const rateLimited = vi.fn().mockRejectedValue({ code: 429 });
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(queryWithRateLimitRetry(rateLimited, wait)).rejects.toEqual({ code: 429 });
    expect(rateLimited).toHaveBeenCalledTimes(2);

    const networkFailure = vi.fn().mockRejectedValue({ code: 'NETWORK_ERROR' });
    await expect(queryWithRateLimitRetry(networkFailure, wait)).rejects.toEqual({ code: 'NETWORK_ERROR' });
    expect(networkFailure).toHaveBeenCalledTimes(1);
  });
});
