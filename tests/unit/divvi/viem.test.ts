import { describe, it, expect, vi } from 'vitest';
import type { Hex } from 'viem';
import { sendDivviTransaction } from '@/lib/divvi/viem';

describe('sendDivviTransaction (viem/wagmi helper)', () => {
  it('appends tag and submits after confirmation (awaitConfirmation)', async () => {
    const calls: string[] = [];
    const walletClient = {
      getChainId: vi.fn(async () => {
        calls.push('getChainId');
        return 1;
      }),
      sendTransaction: vi.fn(async (req: any) => {
        calls.push('sendTransaction');
        expect(req.data).toBe('0x1234deadbeef');
        return '0xabc' as Hex;
      }),
    } as any;

    const publicClient = {
      waitForTransactionReceipt: vi.fn(async () => {
        calls.push('waitForReceipt');
        return { status: 'success' };
      }),
    } as any;

    const submitReferral = vi.fn(async () => {
      calls.push('submitReferral');
      return {};
    });

    const txHash = await sendDivviTransaction(
      walletClient,
      {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x1234',
      },
      {
        account: '0x1111111111111111111111111111111111111111',
        consumer: '0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb',
        publicClient,
        awaitConfirmation: true,
        sdk: {
          getReferralTag: () => '0xdeadbeef',
          submitReferral,
        } as any,
      }
    );

    expect(txHash).toBe('0xabc');
    expect(calls).toEqual(['getChainId', 'sendTransaction', 'waitForReceipt', 'submitReferral']);
    expect(submitReferral).toHaveBeenCalledWith({ txHash: '0xabc', chainId: 1 });
  });

  it('does not submit on reverted receipt', async () => {
    const submitReferral = vi.fn(async () => ({}));
    const onError = vi.fn();

    const walletClient = {
      getChainId: vi.fn(async () => 1),
      sendTransaction: vi.fn(async () => '0xabc' as Hex),
    } as any;

    const publicClient = {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'reverted' })),
    } as any;

    await sendDivviTransaction(
      walletClient,
      { to: '0x2222222222222222222222222222222222222222', data: '0x1234' },
      {
        account: '0x1111111111111111111111111111111111111111',
        consumer: '0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb',
        publicClient,
        awaitConfirmation: true,
        onError,
        sdk: {
          getReferralTag: () => '0xdeadbeef',
          submitReferral,
        } as any,
      }
    );

    expect(submitReferral).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('does not throw if submitReferral fails (best effort)', async () => {
    const walletClient = {
      getChainId: vi.fn(async () => 1),
      sendTransaction: vi.fn(async () => '0xabc' as Hex),
    } as any;

    const publicClient = {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
    } as any;

    const onError = vi.fn();

    await expect(
      sendDivviTransaction(
        walletClient,
        { to: '0x2222222222222222222222222222222222222222', data: '0x1234' },
        {
          account: '0x1111111111111111111111111111111111111111',
          consumer: '0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb',
          publicClient,
          awaitConfirmation: true,
          onError,
          sdk: {
            getReferralTag: () => '0xdeadbeef',
            submitReferral: vi.fn(async () => {
              throw new Error('boom');
            }),
          } as any,
        }
      )
    ).resolves.toBe('0xabc');

    expect(onError).toHaveBeenCalled();
  });

  it('skips tagging when calldata is empty', async () => {
    const walletClient = {
      getChainId: vi.fn(async () => 1),
      sendTransaction: vi.fn(async (req: any) => {
        expect(req.data).toBe('0x');
        return '0xabc' as Hex;
      }),
    } as any;

    const txHash = await sendDivviTransaction(
      walletClient,
      { to: '0x2222222222222222222222222222222222222222', data: '0x' },
      {
        account: '0x1111111111111111111111111111111111111111',
        consumer: '0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb',
        awaitConfirmation: false,
        submit: false,
        sdk: {
          getReferralTag: () => '0xdeadbeef',
          submitReferral: vi.fn(async () => ({})),
        } as any,
      }
    );

    expect(txHash).toBe('0xabc');
  });

  it('requires publicClient when submit is enabled', async () => {
    const walletClient = {
      getChainId: vi.fn(async () => 1),
      sendTransaction: vi.fn(async () => '0xabc' as Hex),
    } as any;

    await expect(
      sendDivviTransaction(
        walletClient,
        { to: '0x2222222222222222222222222222222222222222', data: '0x1234' },
        {
          account: '0x1111111111111111111111111111111111111111',
          consumer: '0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb',
          awaitConfirmation: true,
          sdk: {
            getReferralTag: () => '0xdeadbeef',
            submitReferral: vi.fn(async () => ({})),
          } as any,
        }
      )
    ).rejects.toThrow(/publicClient/);
  });
});
