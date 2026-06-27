import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublishedEvent } from '@/types/event';
import { useRewardPools } from '@/hooks/useRewardPools';
import { useTicketBalance } from '@/hooks/useTicketBalance';
import type { RewardPoolCreationGate } from '@/lib/events/refundStatus';
import { RewardPoolCard } from './RewardPoolCard';
import { RewardPoolCreationDialog } from './RewardPoolCreationDialog';

const READY_GATE: RewardPoolCreationGate = {
  kind: 'ready',
  buttonLabel: 'Create prize pool',
  helperText: null,
  disabled: false,
};

/**
 * Reward-pool section on the event details page. Visible to everyone when a pool exists (prize terms
 * and declared winners are public), plus a create affordance for the event creator. Claim and
 * dispute actions inside each card are gated to winners / ticket holders respectively.
 */
export function EventRewardPools({
  event,
  creationGate = READY_GATE,
  protectedActionBusy = false,
  onReleaseProtectedEvent,
  onRefundProtectedEvent,
}: {
  event: Pick<
    PublishedEvent,
    'lock_address' | 'chain_id' | 'creator_id' | 'creator_address' | 'refund_protection_enabled' | 'refund_controller_address' | 'ends_at'
  >;
  creationGate?: RewardPoolCreationGate;
  protectedActionBusy?: boolean;
  onReleaseProtectedEvent?: () => Promise<boolean>;
  onRefundProtectedEvent?: () => Promise<void>;
}) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const viewerAddress = wallets?.[0]?.address ?? null;
  const chainId = event.chain_id;

  const { data: pools = [] } = useRewardPools(event.lock_address, chainId);
  const { data: balance = 0 } = useTicketBalance({
    lockAddress: event.lock_address,
    chainId,
    userAddress: viewerAddress ?? undefined,
  });
  const isTicketHolder = (balance ?? 0) > 0;
  // Creator identity is the Privy DID (creator_id), not a wallet address — a user may have several
  // linked wallets and wallets[0] need not be the deploying wallet.
  const isCreator = !!user?.id && !!event.creator_id && user.id === event.creator_id;

  const [createOpen, setCreateOpen] = useState(false);

  const handleCreateClick = async () => {
    if (creationGate.kind === 'ready') {
      setCreateOpen(true);
      return;
    }

    if (creationGate.kind === 'release_required') {
      const released = await onReleaseProtectedEvent?.();
      if (released) setCreateOpen(true);
      return;
    }

    if (creationGate.kind === 'refund_required') {
      await onRefundProtectedEvent?.();
    }
  };

  const creationDisabled =
    creationGate.disabled ||
    protectedActionBusy ||
    (creationGate.kind === 'release_required' && !onReleaseProtectedEvent) ||
    (creationGate.kind === 'refund_required' && !onRefundProtectedEvent);

  // For protected events, link the attendance controller so the pool gains the early-exit path
  // (creator can reclaim once the event is cancelled and refunds complete). Non-protected = null.
  const attendanceController = event.refund_protection_enabled
    ? event.refund_controller_address ?? null
    : null;

  if (!pools.length && !isCreator) return null;

  return (
    <section className="space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" /> Prizes
      </h3>

      {pools.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No prize pools yet. Fund one to guarantee prizes for your tournament.
        </p>
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => (
            <RewardPoolCard
              key={pool.id}
              pool={pool}
              viewerAddress={viewerAddress}
              isTicketHolder={isTicketHolder}
              eventEndsAt={event.ends_at ?? null}
            />
          ))}
        </div>
      )}

      {isCreator && (
        <div className="space-y-2">
          <Button
            className={
              creationGate.kind === 'refund_required'
                ? 'w-full shadow-sm'
                : creationGate.kind === 'ready' || creationGate.kind === 'release_required'
                    ? 'w-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                    : 'w-full'
            }
            variant={creationGate.kind === 'refund_required' ? 'destructive' : creationGate.kind === 'pending_resolution' ? 'outline' : 'default'}
            onClick={handleCreateClick}
            disabled={creationDisabled}
          >
            {protectedActionBusy ? 'Processing...' : creationGate.buttonLabel}
          </Button>
          {creationGate.helperText && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {creationGate.helperText}
            </p>
          )}
        </div>
      )}

      {isCreator && (
        <RewardPoolCreationDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          eventLockAddress={event.lock_address}
          chainId={chainId}
          creatorAddress={event.creator_address ?? null}
          attendanceControllerAddress={attendanceController}
          eventEndsAt={event.ends_at ?? null}
        />
      )}
    </section>
  );
}
