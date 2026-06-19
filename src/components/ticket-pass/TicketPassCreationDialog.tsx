import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertTriangle, Circle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { setLockMetadata } from '@/utils/lockMetadata';
import { getTicketPassMetadataBaseURI } from '@/utils/ticketPassNftMetadata';
import {
  deployTicketPass,
  type TicketPassDeployResult,
  type TicketPassPayoutSymbol,
} from '@/utils/ticketPassControllerUtils';

const PAYOUT_TOKENS: TicketPassPayoutSymbol[] = ['USDC', 'DG', 'G', 'UP'];

interface TicketPassCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type StepState = { id: string; label: string; status: 'idle' | 'executing' | 'success' | 'error'; error?: string };

const INITIAL_STEPS: StepState[] = [
  { id: 'deploy', label: 'Deploy & fund pass', status: 'idle' },
  { id: 'metadata', label: 'Set NFT metadata', status: 'idle' },
  { id: 'finalize', label: 'Save pass', status: 'idle' },
];

export const TicketPassCreationDialog: React.FC<TicketPassCreationDialogProps> = ({ isOpen, onClose, onCreated }) => {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { networks } = useNetworkConfigs();
  const { toast } = useToast();

  const activeNetworks = useMemo(() => networks.filter((n) => n.is_active), [networks]);

  const [chainId, setChainId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState<TicketPassPayoutSymbol | 'NONE'>('USDC');
  const [tokenPerCopy, setTokenPerCopy] = useState('');
  const [ethPerCopy, setEthPerCopy] = useState('');
  const [maxCopies, setMaxCopies] = useState('100');
  const [maxPerBuyer, setMaxPerBuyer] = useState('1');
  const [priceFiat, setPriceFiat] = useState('');
  const [expirationDays, setExpirationDays] = useState('365');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [targetEventAddress, setTargetEventAddress] = useState('');

  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const deployRef = useRef<TicketPassDeployResult | null>(null);

  useEffect(() => {
    if (!chainId && activeNetworks.length > 0) setChainId(activeNetworks[0].chain_id);
  }, [activeNetworks, chainId]);

  useEffect(() => {
    if (isOpen) return;
    setPhase('form');
    setSteps(INITIAL_STEPS);
    deployRef.current = null;
  }, [isOpen]);

  const escrowPreview = useMemo(() => {
    const copies = Number(maxCopies) || 0;
    const parts: string[] = [];
    if (tokenSymbol !== 'NONE' && Number(tokenPerCopy) > 0) parts.push(`${(Number(tokenPerCopy) * copies).toLocaleString()} ${tokenSymbol}`);
    if (Number(ethPerCopy) > 0) parts.push(`${Number(ethPerCopy) * copies} ETH`);
    return parts.join(' + ') || '—';
  }, [tokenSymbol, tokenPerCopy, ethPerCopy, maxCopies]);

  const setStepStatus = (id: string, status: StepState['status'], error?: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, error } : s)));

  const validate = (): string | null => {
    if (!wallet?.address) return 'Connect a wallet first.';
    if (!chainId) return 'Select a network.';
    if (!title.trim()) return 'Title is required.';
    if (!description.trim()) return 'Description is required.';
    const copies = Number(maxCopies);
    const perBuyer = Number(maxPerBuyer);
    if (!Number.isFinite(copies) || copies <= 0) return 'Max copies must be greater than zero.';
    if (!Number.isFinite(perBuyer) || perBuyer <= 0 || perBuyer > copies) return 'Max per buyer must be between 1 and max copies.';
    const hasToken = tokenSymbol !== 'NONE' && Number(tokenPerCopy) > 0;
    const hasEth = Number(ethPerCopy) > 0;
    if (!hasToken && !hasEth) return 'A pass must deliver a token amount, an ETH amount, or both.';
    if (!Number(priceFiat) || Number(priceFiat) <= 0) return 'Fiat price must be greater than zero.';
    if (targetEventAddress && !/^0x[a-fA-F0-9]{40}$/.test(targetEventAddress)) return 'Linked event address is invalid.';
    return null;
  };

  const runFrom = async () => {
    const expirationSeconds = isUnlimited ? 999999999 : Math.max(1, Number(expirationDays)) * 24 * 60 * 60;
    const token = await getAccessToken?.();

    // Step 1: deploy + fund (idempotent guard: skip if already deployed on a prior attempt).
    if (steps.find((s) => s.id === 'deploy')?.status !== 'success') {
      setStepStatus('deploy', 'executing');
      try {
        const result = await deployTicketPass({
          lockName: title.trim(),
          tokenSymbol: tokenSymbol === 'NONE' ? null : tokenSymbol,
          tokenPerCopy,
          ethPerCopy,
          maxCopies: Number(maxCopies),
          maxPerBuyer: Number(maxPerBuyer),
          expirationSeconds,
          creatorAddress: wallet.address,
        }, wallet, chainId!);
        if (!result.success || !result.lockAddress) throw new Error(result.error || 'Deployment failed');
        deployRef.current = result;
        setStepStatus('deploy', 'success');
      } catch (err: any) {
        setStepStatus('deploy', 'error', err?.message || String(err));
        return;
      }
    }

    const deployed = deployRef.current!;

    // Step 2: NFT metadata.
    if (steps.find((s) => s.id === 'metadata')?.status !== 'success') {
      setStepStatus('metadata', 'executing');
      try {
        const provider = await wallet.getEthereumProvider();
        const signer = await new ethers.BrowserProvider(provider).getSigner();
        const meta = await setLockMetadata(deployed.lockAddress!, title.trim(), 'PASS', getTicketPassMetadataBaseURI(deployed.lockAddress!), signer);
        if (!meta.success) throw new Error(meta.error || 'Metadata setup failed');
        setStepStatus('metadata', 'success');
      } catch (err: any) {
        setStepStatus('metadata', 'error', err?.message || String(err));
        return;
      }
    }

    // Step 3: persist to DB (server re-verifies the on-chain pass before inserting).
    if (steps.find((s) => s.id === 'finalize')?.status !== 'success') {
      setStepStatus('finalize', 'executing');
      try {
        await callEdgeFunction('create-ticket-pass', {
          title: title.trim(),
          description: description.trim(),
          image_url: imageUrl.trim() || null,
          chain_id: chainId,
          lock_address: deployed.lockAddress,
          controller_address: deployed.controllerAddress,
          creator_address: wallet.address,
          payout_token_address: deployed.payoutTokenAddress,
          payout_token_symbol: deployed.payoutTokenSymbol,
          token_decimals: deployed.tokenDecimals,
          token_per_copy_wei: deployed.tokenPerCopyWei,
          eth_per_copy_wei: deployed.ethPerCopyWei,
          max_copies: Number(maxCopies),
          max_per_buyer: Number(maxPerBuyer),
          key_expiration_duration_seconds: expirationSeconds,
          price_fiat: Number(priceFiat),
          price_fiat_kobo: Math.round(Number(priceFiat) * 100),
          fiat_symbol: 'NGN',
          target_event_address: targetEventAddress.trim() || null,
          deploy_txn_hash: deployed.transactionHash,
          metadata_set: true,
        }, { privyToken: token });
        setStepStatus('finalize', 'success');
      } catch (err: any) {
        setStepStatus('finalize', 'error', err?.message || String(err));
        return;
      }
    }

    setPhase('done');
    toast({ title: 'Ticket Pass created', description: 'Your pass is live and funded.' });
    onCreated?.();
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) {
      toast({ title: 'Check the form', description: err, variant: 'destructive' });
      return;
    }
    setPhase('running');
    await runFrom();
  };

  const hasError = steps.some((s) => s.status === 'error');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && phase !== 'running') onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Ticket Pass</DialogTitle>
          <DialogDescription>Pre-fund a pass with on-chain value that buyers redeem with fiat.</DialogDescription>
        </DialogHeader>

        {phase === 'form' && (
          <div className="space-y-4 py-2">
            {/* PERMANENCE WARNING */}
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">This locks up real funds, permanently configured.</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                  <li>You deposit the full capacity now: <span className="font-semibold">{escrowPreview}</span>.</li>
                  <li>Per-pass payout and token are <span className="font-semibold">immutable after creation</span>.</li>
                  <li>Unsold escrow is recoverable only by <span className="font-semibold">closing</span> the pass.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={chainId ? String(chainId) : ''} onValueChange={(v) => setChainId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select network" /></SelectTrigger>
                <SelectContent>
                  {activeNetworks.map((n) => (
                    <SelectItem key={n.chain_id} value={String(n.chain_id)}>{n.chain_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tp-title">Title</Label>
              <Input id="tp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VIP Entry Pass" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tp-desc">Description</Label>
              <Textarea id="tp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this pass unlocks…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tp-img">Image URL</Label>
              <Input id="tp-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Payout token</Label>
                <Select value={tokenSymbol} onValueChange={(v) => setTokenSymbol(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None (ETH only)</SelectItem>
                    {PAYOUT_TOKENS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-tpc">Token per pass</Label>
                <Input id="tp-tpc" type="number" min="0" value={tokenPerCopy} onChange={(e) => setTokenPerCopy(e.target.value)} disabled={tokenSymbol === 'NONE'} placeholder="50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tp-eth">ETH per pass</Label>
                <Input id="tp-eth" type="number" min="0" step="0.0001" value={ethPerCopy} onChange={(e) => setEthPerCopy(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-price">Fiat price (NGN)</Label>
                <Input id="tp-price" type="number" min="0" value={priceFiat} onChange={(e) => setPriceFiat(e.target.value)} placeholder="5000" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tp-max">Max copies</Label>
                <Input id="tp-max" type="number" min="1" value={maxCopies} onChange={(e) => setMaxCopies(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tp-perbuyer">Max per buyer</Label>
                <Input id="tp-perbuyer" type="number" min="1" value={maxPerBuyer} onChange={(e) => setMaxPerBuyer(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Unlimited expiration</Label>
                <p className="text-xs text-muted-foreground">Passes never expire.</p>
              </div>
              <Switch checked={isUnlimited} onCheckedChange={setIsUnlimited} />
            </div>
            {!isUnlimited && (
              <div className="space-y-2">
                <Label htmlFor="tp-exp">Pass validity (days)</Label>
                <Input id="tp-exp" type="number" min="1" value={expirationDays} onChange={(e) => setExpirationDays(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tp-event">Linked event address (optional)</Label>
              <Input id="tp-event" value={targetEventAddress} onChange={(e) => setTargetEventAddress(e.target.value)} placeholder="0x… (event lock address)" />
            </div>
          </div>
        )}

        {phase !== 'form' && (
          <div className="space-y-3 py-4">
            {steps.map((s) => (
              <div key={s.id} className="flex items-start gap-3">
                {s.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />}
                {s.status === 'executing' && <Loader2 className="w-5 h-5 animate-spin text-blue-600 mt-0.5" />}
                {s.status === 'error' && <XCircle className="w-5 h-5 text-red-600 mt-0.5" />}
                {s.status === 'idle' && <Circle className="w-5 h-5 text-gray-300 mt-0.5" />}
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  {s.error && <p className="text-xs text-red-600">{s.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {phase === 'form' && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate}>Create pass</Button>
            </>
          )}
          {phase === 'running' && hasError && <Button onClick={runFrom}>Retry</Button>}
          {phase === 'done' && <Button onClick={onClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
