import { describe, expect, it } from 'vitest';
import {
  decodeRewardError,
  hasReclaimableRewardPosition,
  isLegacyRewardPositionShapeError,
  REWARD_MIN_CLAIM_DURATION_SECS,
  rewardErrorName,
} from '@/utils/rewardControllerUtils';

describe('reward controller errors', () => {
  const nothingToPayData = '0x4d63c252';

  it('decodes custom errors nested in a wallet RPC response', () => {
    const error = {
      code: 'UNKNOWN_ERROR',
      info: { error: { code: 3, data: nothingToPayData } },
    };

    expect(rewardErrorName(error)).toBe('NothingToPay');
    expect(decodeRewardError(error, 'Failed to reclaim funds')).toBe('There is nothing left to reclaim.');
  });

  it('decodes custom-error data retained only in an opaque provider message', () => {
    const error = new Error(`could not coalesce error (error={ "code": 3, "data": "${nothingToPayData}" })`);

    expect(rewardErrorName(error)).toBe('NothingToPay');
    expect(decodeRewardError(error, 'Failed to reclaim funds')).toBe('There is nothing left to reclaim.');
  });
});

describe('reclaim eligibility', () => {
  const nowSecs = 1_000;

  it('rejects pools whose positions are already settled', () => {
    expect(hasReclaimableRewardPosition([
      { claimed: true, reclaimed: false, closesAt: 900 },
      { claimed: false, reclaimed: true, closesAt: 900 },
    ], nowSecs)).toBe(false);
  });

  it('accepts an unsettled position only after its own claim deadline', () => {
    expect(hasReclaimableRewardPosition([
      { claimed: false, reclaimed: false, closesAt: 999 },
    ], nowSecs)).toBe(true);

    expect(hasReclaimableRewardPosition([
      { claimed: false, reclaimed: false, closesAt: 1_000 },
      { claimed: false, reclaimed: false, closesAt: 1_001 },
    ], nowSecs)).toBe(false);
  });
});

describe('reward timing compatibility', () => {
  it('uses the contract seven-day minimum claim duration', () => {
    expect(REWARD_MIN_CLAIM_DURATION_SECS).toBe(7 * 24 * 60 * 60);
  });

  it('falls back to the legacy position ABI only for a result-shape mismatch', () => {
    expect(isLegacyRewardPositionShapeError({ code: 'BAD_DATA' })).toBe(true);
    expect(isLegacyRewardPositionShapeError({ code: 429 })).toBe(false);
    expect(isLegacyRewardPositionShapeError({ code: 'NETWORK_ERROR' })).toBe(false);
  });
});
