import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { keccak256, toUtf8Bytes } from 'ethers';
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  freezeRewardPool, unfreezeRewardPool, voidRewardAssignment, reassignRewardWinner,
  extendRewardClaimEnd, resolveRewardDisputeOnchain,
} from '@/utils/rewardControllerUtils';

interface AdminDispute {
  id: string;
  reward_pool_id: string;
  placement: number | null;
  disputer_address: string;
  category: string;
  reason_text: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
  pool: {
    pool_id: number;
    controller_address: string;
    chain_id: number;
    event_lock_address: string;
    status: string;
    frozen: boolean;
    position_count: number;
  } | null;
}

type ActionResult = { success: boolean; error?: string };

function DisputeRow({ d, wallet, onRefetch }: { d: AdminDispute; wallet: any; onRefetch: () => Promise<void> }) {
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [newWinner, setNewWinner] = useState('');
  const [newClaimEnd, setNewClaimEnd] = useState('');
  const [note, setNote] = useState('');

  const pool = d.pool;
  if (!pool) return null;
  const isStandings = d.category === 'standings';

  // Reconcile the DB mirror after an on-chain arbitrator action so the public event card doesn't
  // show stale status / frozen / claim_end / winners.
  const syncPool = async () => {
    try {
      const token = await getAccessToken?.();
      await callEdgeFunction('sync-reward-pool', { id: d.reward_pool_id }, { privyToken: token });
    } catch (err) {
      console.warn('[AdminRewardDisputes] pool sync failed', err);
    }
  };

  const run = async (fn: () => Promise<ActionResult>, successMsg: string) => {
    setBusy(true);
    const r = await fn();
    if (!r.success) { setBusy(false); toast.error(r.error || 'Action failed'); return; }
    await syncPool();
    setBusy(false);
    toast.success(successMsg);
    await onRefetch();
  };

  const resolve = async (upheld: boolean) => {
    const placement = d.placement ?? 0;
    const resolutionHash = keccak256(toUtf8Bytes(note || (upheld ? 'upheld' : 'rejected')));
    setBusy(true);
    let onchainTxHash: string | null = null;
    if (!isStandings) {
      const onchain = await resolveRewardDisputeOnchain(
        pool.controller_address, pool.pool_id, placement, upheld, resolutionHash, wallet, pool.chain_id,
      );
      if (!onchain.success) { setBusy(false); toast.error(onchain.error || 'On-chain resolution failed'); return; }
      onchainTxHash = onchain.transactionHash ?? null;
    }
    try {
      const token = await getAccessToken?.();
      await callEdgeFunction('resolve-reward-dispute', {
        dispute_id: d.id,
        status: upheld ? 'upheld' : 'rejected',
        resolution_note: note || null,
        resolution_hash: resolutionHash,
        onchain_tx_hash: onchainTxHash,
      }, { privyToken: token });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record resolution');
    }
    if (!isStandings) await syncPool();
    setBusy(false);
    toast.success(upheld ? 'Dispute upheld' : 'Dispute rejected');
    await onRefetch();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Pool #{pool.pool_id} · {d.category}{d.placement ? ` · placement #${d.placement}` : ''}
          </span>
          <Badge variant="outline">{d.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-muted-foreground">
          <div>Event lock: {pool.event_lock_address}</div>
          <div>Reporter: {d.disputer_address}</div>
          <div>Chain: {pool.chain_id} · Pool frozen: {String(pool.frozen)}</div>
          <div>Raised: {new Date(d.created_at).toLocaleString()}</div>
        </div>
        {d.reason_text && <p className="rounded bg-muted p-2">{d.reason_text}</p>}

        {!isStandings && (
          <div className="flex flex-wrap gap-2">
            {pool.frozen ? (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => run(() => unfreezeRewardPool(pool.controller_address, pool.pool_id, wallet, pool.chain_id), 'Pool unfrozen')}>
                Unfreeze
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => run(() => freezeRewardPool(pool.controller_address, pool.pool_id, wallet, pool.chain_id), 'Pool frozen')}>
                Freeze
              </Button>
            )}
            {d.placement != null && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => run(() => voidRewardAssignment(pool.controller_address, pool.pool_id, d.placement as number, wallet, pool.chain_id), 'Assignment voided')}>
                Void placement
              </Button>
            )}
          </div>
        )}

        {!isStandings && d.placement != null && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`reassign-${d.id}`}>Reassign winner</Label>
              <Input id={`reassign-${d.id}`} placeholder="0x… new winner" value={newWinner} onChange={(e) => setNewWinner(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" disabled={busy || !newWinner}
              onClick={() => run(() => reassignRewardWinner(pool.controller_address, pool.pool_id, d.placement as number, newWinner.trim(), wallet, pool.chain_id), 'Winner reassigned')}>
              Reassign
            </Button>
          </div>
        )}

        {!isStandings && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`extend-${d.id}`}>Extend claim end</Label>
              <Input id={`extend-${d.id}`} type="datetime-local" value={newClaimEnd} onChange={(e) => setNewClaimEnd(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" disabled={busy || !newClaimEnd}
              onClick={() => run(() => extendRewardClaimEnd(pool.controller_address, pool.pool_id, Math.floor(new Date(newClaimEnd).getTime() / 1000), wallet, pool.chain_id), 'Claim end extended')}>
              Extend
            </Button>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <Label htmlFor={`note-${d.id}`}>Resolution note</Label>
          <Textarea id={`note-${d.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was decided and why." />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => resolve(true)}>Uphold</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve(false)}>Reject</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRewardDisputes() {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken?.();
      const statuses = showResolved
        ? ['open', 'under_review', 'upheld', 'rejected']
        : ['open', 'under_review'];
      const data = await callEdgeFunction<{ disputes: AdminDispute[] }>(
        'admin-list-reward-disputes', { statuses }, { privyToken: token },
      );
      setDisputes(data.disputes ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, showResolved]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Admin
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <h1 className="text-xl font-semibold flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-red-500" /> Reward disputes
      </h1>

      {!wallet?.address && (
        <p className="text-sm text-amber-700">
          Connect the arbitrator wallet to take on-chain actions (freeze, void, reassign, extend, resolve).
        </p>
      )}

      {loading && disputes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : disputes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No disputes to review.</p>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <DisputeRow key={d.id} d={d} wallet={wallet} onRefetch={load} />
          ))}
        </div>
      )}
    </div>
  );
}
