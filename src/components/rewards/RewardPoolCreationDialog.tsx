import { useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TransactionStepList, type TransactionStep, type TransactionStepStatus } from '@/components/ticket-pass/TransactionStepList';
import { useToast } from '@/hooks/use-toast';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { getNetworkConfigByChainId, getTokenAddressAsync, ZERO_ADDRESS } from '@/lib/config/network-config';
import {
  approveRewardPoolFunding,
  computeRulesHash,
  fundRewardPool,
  preflightCreateRewardPool,
  type CreateRewardPoolConfig,
} from '@/utils/rewardControllerUtils';

const MIN_CHALLENGE_HOURS = 30;
const MIN_CLAIM_DURATION_HOURS = 72;
const MAX_POSITIONS = 200; // mirrors the contract's MAX_POSITIONS cap.
const PENDING_POOL_VERSION = 1;
const REWARD_POOL_DIALOG_DEBUG = true;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventLockAddress: string;
  chainId: number;
  creatorAddress?: string | null;
  attendanceControllerAddress?: string | null;
  eventEndsAt?: string | null;
}

type Asset = 'ETH' | 'USDC' | 'DG' | 'G' | 'UP';

interface PendingRewardPoolMirror {
  version: typeof PENDING_POOL_VERSION;
  chainId: number;
  eventLockAddress: string;
  poolId: number;
  controllerAddress: string;
  creatorAddress: string;
  payoutTokenSymbol: string | null;
  tokenDecimals: number | null;
  rulesUri: string | null;
  txHash: string | null;
  initialManagers: string[];
  createdAt: number;
}

interface RunData {
  config: CreateRewardPoolConfig;
  symbol: Asset;
  decimals: number;
  isEth: boolean;
  initialManagers: string[];
}

const TOKEN_ASSETS: { asset: Exclude<Asset, 'ETH'>; field: 'usdc_token_address' | 'dg_token_address' | 'g_token_address' | 'up_token_address' }[] = [
  { asset: 'USDC', field: 'usdc_token_address' },
  { asset: 'DG', field: 'dg_token_address' },
  { asset: 'G', field: 'g_token_address' },
  { asset: 'UP', field: 'up_token_address' },
];

function debugRewardPoolDialog(label: string, details?: Record<string, unknown>) {
  if (!REWARD_POOL_DIALOG_DEBUG) return;
  console.debug(`[reward-pool-debug][temporary] dialog:${label}`, details ?? {});
}

function summarizeDialogError(err: unknown): Record<string, unknown> {
  const errorLike = err as any;
  return {
    name: errorLike?.name,
    code: errorLike?.code ?? errorLike?.error?.code,
    reason: errorLike?.reason,
    shortMessage: errorLike?.shortMessage,
    message: err instanceof Error ? err.message : errorLike?.message,
    revert: errorLike?.revert,
    data: errorLike?.data ?? errorLike?.error?.data,
    info: errorLike?.info,
  };
}

function debugRewardPoolDialogError(label: string, err: unknown, details?: Record<string, unknown>) {
  if (!REWARD_POOL_DIALOG_DEBUG) return;
  console.error(`[reward-pool-debug][temporary] dialog:${label}`, {
    ...details,
    errorSummary: summarizeDialogError(err),
  }, err);
}

async function resolveAsset(chainId: number, asset: Asset): Promise<{ address: string | null; decimals: number; symbol: Asset }> {
  if (asset === 'ETH') return { address: null, decimals: 18, symbol: 'ETH' };
  const address = await getTokenAddressAsync(chainId, asset);
  if (!address || address === ZERO_ADDRESS) throw new Error(`${asset} is not configured for this network.`);
  const cfg = await getNetworkConfigByChainId(chainId);
  if (!cfg?.rpc_url) throw new Error('RPC is not configured for this network.');
  const provider = new ethers.JsonRpcProvider(cfg.rpc_url);
  const decimals = Number(await new ethers.Contract(address, ['function decimals() view returns (uint8)'], provider).decimals());
  return { address, decimals, symbol: asset };
}

function pendingPoolStorageKey(chainId: number, eventLockAddress: string) {
  return `teerex:pending-reward-pool:${chainId}:${eventLockAddress.toLowerCase()}`;
}

function isPendingRewardPoolMirror(value: unknown): value is PendingRewardPoolMirror {
  const pending = value as PendingRewardPoolMirror;
  return (
    pending?.version === PENDING_POOL_VERSION &&
    Number.isInteger(pending.chainId) &&
    Number.isInteger(pending.poolId) &&
    typeof pending.eventLockAddress === 'string' &&
    ethers.isAddress(pending.eventLockAddress) &&
    typeof pending.controllerAddress === 'string' &&
    ethers.isAddress(pending.controllerAddress) &&
    typeof pending.creatorAddress === 'string' &&
    ethers.isAddress(pending.creatorAddress) &&
    Array.isArray(pending.initialManagers)
  );
}

export function RewardPoolCreationDialog({ open, onOpenChange, eventLockAddress, chainId, creatorAddress, attendanceControllerAddress, eventEndsAt }: Props) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  // Sign with the active wallet, exactly like every other creator on-chain flow (event deploy,
  // publish, release). Privy returns the live wallet (embedded or injected) first; a linked-but-
  // inactive wallet can't actually sign as itself, so selecting one by address only breaks signing.
  // creatorAddress is passed through as a switch-wallet hint when the active wallet isn't the manager.
  const wallet = wallets?.[0];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [asset, setAsset] = useState<Asset>('ETH');
  const [availableAssets, setAvailableAssets] = useState<Asset[]>(['ETH']);
  const [amounts, setAmounts] = useState<string[]>(['', '', '']);
  const [claimStart, setClaimStart] = useState('');
  const [claimEnd, setClaimEnd] = useState('');
  const [challengeHours, setChallengeHours] = useState(String(MIN_CHALLENGE_HOURS));
  const [managers, setManagers] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [pendingPool, setPendingPool] = useState<PendingRewardPoolMirror | null>(null);

  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [steps, setSteps] = useState<TransactionStep[]>([]);
  const runDataRef = useRef<RunData | null>(null);
  const fundedRef = useRef<PendingRewardPoolMirror | null>(null);

  const storageKey = pendingPoolStorageKey(chainId, eventLockAddress);

  useEffect(() => {
    if (!open) return;
    setPhase('form');
    setSteps([]);
    runDataRef.current = null;
    fundedRef.current = null;

    let restoredPending: PendingRewardPoolMirror | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (
        isPendingRewardPoolMirror(parsed) &&
        parsed.chainId === chainId &&
        parsed.eventLockAddress.toLowerCase() === eventLockAddress.toLowerCase()
      ) {
        restoredPending = parsed;
      }
    } catch {
      // Ignore stale local recovery state.
    }
    setPendingPool(restoredPending);

    let cancelled = false;
    (async () => {
      const cfg = await getNetworkConfigByChainId(chainId);
      const assets: Asset[] = ['ETH'];
      for (const { asset: a, field } of TOKEN_ASSETS) {
        if (cfg?.[field]) assets.push(a);
      }
      if (!cancelled) {
        setAvailableAssets(assets);
        setAsset((prev) => (assets.includes(prev) ? prev : 'ETH'));
      }
    })();
    return () => { cancelled = true; };
  }, [open, chainId, eventLockAddress, storageKey]);

  const setAmount = (i: number, v: string) => setAmounts((prev) => prev.map((a, idx) => (idx === i ? v : a)));
  const addPlacement = () => setAmounts((prev) => [...prev, '']);
  const removePlacement = (i: number) => setAmounts((prev) => prev.filter((_, idx) => idx !== i));

  const totalDisplay = amounts.reduce((sum, a) => sum + (Number(a) || 0), 0);
  const fieldsLocked = phase !== 'form' || Boolean(pendingPool);
  const hasError = steps.some((s) => s.status === 'error');

  const rememberPendingPool = (pending: PendingRewardPoolMirror) => {
    setPendingPool(pending);
    fundedRef.current = pending;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      // The in-memory retry state still protects the current session.
    }
  };

  const clearPendingPool = () => {
    setPendingPool(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Best-effort cleanup only.
    }
  };

  const saveRewardPoolMirror = async (pending: PendingRewardPoolMirror) => {
    const token = await getAccessToken?.();
    if (!token) throw new Error('Authentication session expired. Please reconnect and try again.');

    await callEdgeFunction<{ already_exists?: boolean }>('create-reward-pool', {
      chain_id: pending.chainId,
      pool_id: pending.poolId,
      controller_address: pending.controllerAddress,
      creator_address: pending.creatorAddress,
      payout_token_symbol: pending.payoutTokenSymbol,
      token_decimals: pending.tokenDecimals,
      rules_uri: pending.rulesUri,
      tx_hash: pending.txHash,
      initial_managers: pending.initialManagers,
    }, { privyToken: token });

    clearPendingPool();
    queryClient.invalidateQueries({ queryKey: ['reward-pools'] });
  };

  const runFrom = async (startSteps?: TransactionStep[]) => {
    let working = startSteps ?? steps;
    const has = (id: string) => working.some((s) => s.id === id);
    const statusOf = (id: string) => working.find((s) => s.id === id)?.status;
    const mark = (id: string, status: TransactionStepStatus, error?: string) => {
      working = working.map((s) => (s.id === id ? { ...s, status, error } : s));
      setSteps(working);
    };
    const fail = (id: string, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      debugRewardPoolDialogError('step-failed', err, {
        stepId: id,
        userFacingMessage: message,
        chainId,
        walletAddress: wallet?.address,
        steps: working.map(({ id: stepId, status }) => ({ id: stepId, status })),
        config: runDataRef.current
          ? {
              ...runDataRef.current.config,
              positionAmountsWei: runDataRef.current.config.positionAmountsWei.map((amount) => amount.toString()),
            }
          : null,
      });
      mark(id, 'error', message);
    };

    const data = runDataRef.current;
    debugRewardPoolDialog('run-start', {
      chainId,
      walletAddress: wallet?.address,
      startSteps: working.map(({ id, status }) => ({ id, status })),
      hasRunData: Boolean(data),
    });

    if (has('preflight') && statusOf('preflight') !== 'success') {
      mark('preflight', 'executing');
      try {
        await preflightCreateRewardPool(data!.config, wallet, chainId);
        mark('preflight', 'success');
      } catch (err) {
        fail('preflight', err);
        return;
      }
    }

    if (has('approve') && statusOf('approve') !== 'success') {
      mark('approve', 'executing');
      try {
        await approveRewardPoolFunding(data!.config, wallet, chainId);
        mark('approve', 'success');
      } catch (err) {
        fail('approve', err);
        return;
      }
    }

    if (has('fund') && statusOf('fund') !== 'success') {
      mark('fund', 'executing');
      try {
        const result = await fundRewardPool(data!.config, wallet, chainId);
        if (!result.success || result.poolId == null || !result.controllerAddress || !result.transactionHash) {
          throw new Error(result.error || 'Funding did not return complete transaction details.');
        }
        rememberPendingPool({
          version: PENDING_POOL_VERSION,
          chainId,
          eventLockAddress: eventLockAddress.toLowerCase(),
          poolId: result.poolId,
          controllerAddress: result.controllerAddress,
          creatorAddress: wallet!.address.toLowerCase(),
          payoutTokenSymbol: data!.isEth ? null : data!.symbol,
          tokenDecimals: data!.isEth ? null : data!.decimals,
          rulesUri: null,
          txHash: result.transactionHash,
          initialManagers: data!.initialManagers,
          createdAt: Date.now(),
        });
        mark('fund', 'success');
      } catch (err) {
        fail('fund', err);
        return;
      }
    }

    if (has('save') && statusOf('save') !== 'success') {
      mark('save', 'executing');
      const pending = fundedRef.current ?? pendingPool;
      if (!pending) {
        mark('save', 'error', 'The funded pool details were lost. Check your wallet history before retrying.');
        return;
      }
      try {
        await saveRewardPoolMirror(pending);
        mark('save', 'success');
      } catch (err) {
        fail('save', err);
        return;
      }
    }

    setPhase('done');
    toast({ title: 'Prize pool created', description: 'The prize pool is saved and visible on the event.' });
  };

  const startCreate = async () => {
    if (!wallet?.address) {
      toast({ title: 'Connect a wallet', description: 'Connect the event creator wallet to fund a prize pool.', variant: 'destructive' });
      return;
    }
    if (!ethers.isAddress(eventLockAddress)) {
      toast({ title: 'Invalid event', description: 'This event is missing a valid on-chain address.', variant: 'destructive' });
      return;
    }
    if (attendanceControllerAddress && !ethers.isAddress(attendanceControllerAddress)) {
      toast({ title: 'Invalid attendance controller', description: 'The linked attendance controller address is malformed.', variant: 'destructive' });
      return;
    }
    const cleanAmounts = amounts.map((a) => a.trim()).filter((a) => a !== '');
    if (cleanAmounts.length === 0 || cleanAmounts.some((a) => !(Number(a) > 0))) {
      toast({ title: 'Invalid prizes', description: 'Every placement needs a prize amount greater than zero.', variant: 'destructive' });
      return;
    }
    if (cleanAmounts.length > MAX_POSITIONS) {
      toast({ title: 'Too many placements', description: `A pool can have at most ${MAX_POSITIONS} placements.`, variant: 'destructive' });
      return;
    }
    if (!claimStart || !claimEnd) {
      toast({ title: 'Missing dates', description: 'Set both a claim start and a claim end.', variant: 'destructive' });
      return;
    }
    const claimStartEpoch = Math.floor(new Date(claimStart).getTime() / 1000);
    const claimEndEpoch = Math.floor(new Date(claimEnd).getTime() / 1000);
    const challengeHoursValue = Number(challengeHours);
    if (!Number.isFinite(claimStartEpoch) || !Number.isFinite(claimEndEpoch)) {
      toast({ title: 'Invalid dates', description: 'Check the claim start and claim end dates.', variant: 'destructive' });
      return;
    }
    if (claimStartEpoch <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Claim start must be future', description: 'Set the claim start to a future time.', variant: 'destructive' });
      return;
    }
    if (claimEndEpoch < claimStartEpoch + MIN_CLAIM_DURATION_HOURS * 3600) {
      toast({ title: 'Claim window too short', description: 'The claim window must stay open for at least 3 days.', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(challengeHoursValue) || challengeHoursValue < MIN_CHALLENGE_HOURS) {
      toast({ title: 'Challenge window too short', description: `Set the challenge window to at least ${MIN_CHALLENGE_HOURS} hours.`, variant: 'destructive' });
      return;
    }
    const challengeWindowSecs = Math.floor(challengeHoursValue * 3600);

    // The contract can't read the event's end time, so the UI enforces that claims open after it.
    if (eventEndsAt) {
      const eventEndEpoch = Math.floor(new Date(eventEndsAt).getTime() / 1000);
      if (Number.isFinite(eventEndEpoch) && claimStartEpoch < eventEndEpoch) {
        toast({ title: 'Claims open too early', description: 'Set the claim start to after the event ends.', variant: 'destructive' });
        return;
      }
    }

    let resolved: { address: string | null; decimals: number; symbol: Asset };
    try {
      resolved = await resolveAsset(chainId, asset);
    } catch (err) {
      toast({ title: 'Asset unavailable', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      return;
    }

    const initialManagers = managers
      .split(/[\s,]+/)
      .map((m) => m.trim())
      .filter((m) => ethers.isAddress(m));

    let positionAmountsWei: bigint[];
    try {
      positionAmountsWei = cleanAmounts.map((a) => ethers.parseUnits(a, resolved.decimals));
    } catch {
      toast({ title: 'Invalid amount', description: `Prize amounts can have at most ${resolved.decimals} decimal places for ${asset}.`, variant: 'destructive' });
      return;
    }

    const config: CreateRewardPoolConfig = {
      eventLockAddress,
      attendanceControllerAddress: attendanceControllerAddress ?? null,
      payoutTokenAddress: resolved.address,
      positionAmountsWei,
      claimStart: claimStartEpoch,
      claimEnd: claimEndEpoch,
      challengeWindowSecs,
      rulesHash: computeRulesHash(rulesText),
      initialManagers,
      expectedManagerAddress: creatorAddress ?? null,
    };

    const isEth = asset === 'ETH';
    runDataRef.current = { config, symbol: resolved.symbol, decimals: resolved.decimals, isEth, initialManagers };
    debugRewardPoolDialog('start-create-config-built', {
      chainId,
      walletAddress: wallet.address,
      eventLockAddress,
      creatorAddress: creatorAddress ?? null,
      attendanceControllerAddress: attendanceControllerAddress ?? null,
      eventEndsAt: eventEndsAt ?? null,
      asset,
      resolvedAsset: resolved,
      amounts: cleanAmounts,
      positionAmountsWei: positionAmountsWei.map((amount) => amount.toString()),
      totalDisplay,
      claimStart,
      claimEnd,
      claimStartEpoch,
      claimEndEpoch,
      challengeWindowSecs,
      rulesHash: config.rulesHash,
      initialManagers,
    });

    const initialSteps: TransactionStep[] = [
      { id: 'preflight', label: 'Check pool requirements', status: 'idle' },
      ...(isEth ? [] : [{ id: 'approve', label: `Approve ${asset} for escrow`, status: 'idle' as TransactionStepStatus }]),
      { id: 'fund', label: `Fund ${totalDisplay} ${asset}`, status: 'idle' },
      { id: 'save', label: 'Save prize pool', status: 'idle' },
    ];
    setSteps(initialSteps);
    setPhase('running');
    await runFrom(initialSteps);
  };

  const startSavePending = async () => {
    if (!pendingPool) return;
    fundedRef.current = pendingPool;
    const saveSteps: TransactionStep[] = [{ id: 'save', label: `Save prize pool #${pendingPool.poolId}`, status: 'idle' }];
    setSteps(saveSteps);
    setPhase('running');
    await runFrom(saveSteps);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a prize pool</DialogTitle>
          <DialogDescription>
            Prefund the full prize. Funds are locked on-chain and pay out to your declared winners
            during the claim window. You can only reclaim unclaimed funds after the window ends.
          </DialogDescription>
        </DialogHeader>

        {phase === 'form' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prize asset</Label>
              <Select value={asset} onValueChange={(v) => setAsset(v as Asset)} disabled={fieldsLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableAssets.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prizes by placement</Label>
              {amounts.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 text-sm text-muted-foreground">#{i + 1}</span>
                  <Input
                    type="number" min="0" step="any" placeholder={`Prize for #${i + 1}`}
                    value={a} onChange={(e) => setAmount(i, e.target.value)} disabled={fieldsLocked}
                  />
                  {amounts.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removePlacement(i)} disabled={fieldsLocked}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPlacement} disabled={fieldsLocked}>
                <Plus className="w-4 h-4 mr-1" /> Add placement
              </Button>
              <p className="text-sm text-muted-foreground">Total to fund: {totalDisplay} {asset}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="claim-start">Claim opens</Label>
                <Input id="claim-start" type="datetime-local" value={claimStart} onChange={(e) => setClaimStart(e.target.value)} disabled={fieldsLocked} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-end">Claim closes</Label>
                <Input id="claim-end" type="datetime-local" value={claimEnd} onChange={(e) => setClaimEnd(e.target.value)} disabled={fieldsLocked} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="challenge">Challenge window (hours)</Label>
              <Input
                id="challenge" type="number" min={MIN_CHALLENGE_HOURS}
                value={challengeHours} onChange={(e) => setChallengeHours(e.target.value)}
                disabled={fieldsLocked}
              />
              <p className="text-xs text-muted-foreground">Minimum {MIN_CHALLENGE_HOURS}h review period before a placement can be claimed.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="managers">Reward managers (optional)</Label>
              <Textarea
                id="managers" rows={2} placeholder="0x… addresses, comma or space separated"
                value={managers} onChange={(e) => setManagers(e.target.value)}
                disabled={fieldsLocked}
              />
              <p className="text-xs text-muted-foreground">Managers can assign winners but cannot withdraw or change terms.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rules">Reward rules</Label>
              <Textarea
                id="rules" rows={3} placeholder="How are placements decided? These rules are hashed on-chain."
                value={rulesText} onChange={(e) => setRulesText(e.target.value)}
                disabled={fieldsLocked}
              />
            </div>

            {pendingPool && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium">Prize pool funded on-chain</div>
                <p className="mt-1">Save pool #{pendingPool.poolId} to make it visible on this event.</p>
                {pendingPool.txHash && <p className="mt-1 break-all text-xs">Tx: {pendingPool.txHash}</p>}
                <Button type="button" variant="ghost" size="sm" className="mt-2 px-2" onClick={clearPendingPool}>
                  Clear pending save
                </Button>
              </div>
            )}
          </div>
        )}

        {phase !== 'form' && (
          <div className="py-2">
            <TransactionStepList steps={steps} />
          </div>
        )}

        <DialogFooter>
          {phase === 'form' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              {pendingPool ? (
                <Button onClick={startSavePending}>Save prize pool</Button>
              ) : (
                <Button onClick={startCreate}>Fund {totalDisplay} {asset}</Button>
              )}
            </>
          )}
          {phase === 'running' && (
            <>
              {hasError && <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>}
              {hasError && <Button onClick={() => runFrom()}>Retry</Button>}
            </>
          )}
          {phase === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
