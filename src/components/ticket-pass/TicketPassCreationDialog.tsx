import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-help';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useVendorPayoutAccount } from '@/hooks/useVendorPayoutAccount';
import { PayoutAccountRequiredCard } from '@/components/vendor/PayoutAccountGate';
import { PayoutDestinationField, type PayoutDestination } from '@/components/vendor/PayoutDestinationField';
import { EventLinkPicker } from '@/components/ticket-pass/EventLinkPicker';
import { TransactionStepList, type TransactionStep, type TransactionStepStatus } from '@/components/ticket-pass/TransactionStepList';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import type { LinkableEvent } from '@/hooks/useLinkableEvents';
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/richText';
import { getTicketPassMetadataBaseURI } from '@/utils/ticketPassNftMetadata';
import {
  deployTicketPass,
  setTicketPassMetadata,
  type TicketPassDeployResult,
  type TicketPassPayoutSymbol,
} from '@/utils/ticketPassControllerUtils';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ImageCropper } from '@/components/ui/ImageCropper';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';

const PAYOUT_TOKENS: TicketPassPayoutSymbol[] = ['USDC', 'DG', 'G', 'UP'];

interface TicketPassCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialTargetEventAddress?: string | null;
}

type StepState = TransactionStep;

const INITIAL_STEPS: StepState[] = [
  { id: 'deploy', label: 'Deploy & fund pass', status: 'idle' },
  { id: 'metadata', label: 'Set NFT metadata', status: 'idle' },
  { id: 'finalize', label: 'Save pass', status: 'idle' },
];

const LINKED_EVENT_ERRORS = new Set(['linked_event_not_found', 'linked_event_chain_mismatch']);

type LinkableEventsResponse = {
  events: LinkableEvent[];
};

export const TicketPassCreationDialog: React.FC<TicketPassCreationDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialTargetEventAddress,
}) => {
  const { getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { networks } = useNetworkConfigs();
  const { toast } = useToast();
  const { data: payout, isLoading: payoutLoading } = useVendorPayoutAccount({ enabled: isOpen });
  const canSell = !!payout?.can_receive_fiat_payments;
  const [payoutDestination, setPayoutDestination] = useState<PayoutDestination>('seller');
  // Only seller-routed passes need a verified payout account; platform-routed passes don't.
  const blockedByPayout = payoutDestination === 'seller' && !canSell;

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
  const [targetEventInput, setTargetEventInput] = useState('');
  const [selectedTargetEvent, setSelectedTargetEvent] = useState<LinkableEvent | null>(null);

  const [tempImageUrl, setTempImageUrl] = useState('');
  const [showCropper, setShowCropper] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const deployRef = useRef<TicketPassDeployResult | null>(null);
  const cancelRequestedRef = useRef(false);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Image must be under 5MB.', variant: 'destructive' });
        return;
      }
      setTempImageUrl(URL.createObjectURL(file));
      setShowCropper(true);
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    setShowCropper(false);
    setIsUploadingImage(true);

    try {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const publicUrl = await uploadEventImage(croppedFile, userId);
      if (!publicUrl) throw new Error('Upload failed');

      setImageUrl(publicUrl);
      toast({ title: 'Image uploaded', description: 'Pass image saved.' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingImage(false);
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl);
        setTempImageUrl('');
      }
    }
  };

  const removeImage = () => {
    setImageUrl('');
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl('');
    }
  };

  const handleAdjustCrop = () => {
    if (imageUrl) {
      setTempImageUrl(imageUrl);
      setShowCropper(true);
    }
  };

  useEffect(() => {
    if (!chainId && activeNetworks.length > 0) setChainId(activeNetworks[0].chain_id);
  }, [activeNetworks, chainId]);

  useEffect(() => {
    if (!isOpen || !initialTargetEventAddress) return;
    setTargetEventInput(initialTargetEventAddress);
    setSelectedTargetEvent(null);
  }, [initialTargetEventAddress, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    setPhase('form');
    setSteps(INITIAL_STEPS);
    setShowCancelConfirm(false);
    deployRef.current = null;
    cancelRequestedRef.current = false;
    setImageUrl('');
    setTempImageUrl('');
    setShowCropper(false);
    setIsUploadingImage(false);
    if (!initialTargetEventAddress) {
      setTargetEventInput('');
      setSelectedTargetEvent(null);
    }
  }, [initialTargetEventAddress, isOpen]);

  useEffect(() => {
    if (!selectedTargetEvent || !chainId || selectedTargetEvent.chain_id === chainId) return;
    setSelectedTargetEvent(null);
    setTargetEventInput('');
  }, [chainId, selectedTargetEvent]);

  const escrowPreview = useMemo(() => {
    const copies = Number(maxCopies);
    if (!Number.isFinite(copies) || copies <= 0) return null;
    const parts: string[] = [];
    if (tokenSymbol !== 'NONE' && Number(tokenPerCopy) > 0) parts.push(`${(Number(tokenPerCopy) * copies).toLocaleString()} ${tokenSymbol}`);
    if (Number(ethPerCopy) > 0) parts.push(`${Number(ethPerCopy) * copies} ETH`);
    return parts.length > 0 ? parts.join(' + ') : null;
  }, [tokenSymbol, tokenPerCopy, ethPerCopy, maxCopies]);

  const setStepStatus = (id: string, status: TransactionStepStatus, error?: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, error } : s)));

  const validate = (): string | null => {
    if (!wallet?.address) return 'Connect a wallet first.';
    if (!chainId) return 'Select a network.';
    if (!title.trim()) return 'Title is required.';
    if (isRichTextEmpty(description)) return 'Description is required.';
    const copies = Number(maxCopies);
    const perBuyer = Number(maxPerBuyer);
    if (!Number.isFinite(copies) || copies <= 0) return 'Max copies must be greater than zero.';
    if (!Number.isFinite(perBuyer) || perBuyer <= 0 || perBuyer > copies) return 'Max per buyer must be between 1 and max copies.';
    const hasToken = tokenSymbol !== 'NONE' && Number(tokenPerCopy) > 0;
    const hasEth = Number(ethPerCopy) > 0;
    if (!hasToken && !hasEth) return 'A pass must deliver a token amount, an ETH amount, or both.';
    if (!Number(priceFiat) || Number(priceFiat) <= 0) return 'Fiat price must be greater than zero.';
    if (targetEventInput.trim() && !selectedTargetEvent) return 'Select an existing event to link this pass.';
    if (selectedTargetEvent && selectedTargetEvent.chain_id !== chainId) return 'Linked event must be on the selected network.';
    return null;
  };

  const runFrom = async () => {
    cancelRequestedRef.current = false;
    const expirationSeconds = isUnlimited ? 999999999 : Math.max(1, Number(expirationDays)) * 24 * 60 * 60;
    const token = await getAccessToken?.();
    const sanitizedDescription = sanitizeRichTextHtml(description);

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
        if (cancelRequestedRef.current) return;
        deployRef.current = result;
        setStepStatus('deploy', 'success');
      } catch (err: any) {
        if (cancelRequestedRef.current) return;
        setStepStatus('deploy', 'error', err?.message || String(err));
        return;
      }
    }

    const deployed = deployRef.current!;

    // Step 2: NFT metadata.
    if (steps.find((s) => s.id === 'metadata')?.status !== 'success') {
      setStepStatus('metadata', 'executing');
      try {
        const meta = await setTicketPassMetadata(
          deployed.lockAddress!,
          deployed.controllerAddress!,
          title.trim(),
          'PASS',
          getTicketPassMetadataBaseURI(deployed.lockAddress!),
          wallet,
          chainId!,
        );
        if (!meta.success) throw new Error(meta.error || 'Metadata setup failed');
        if (cancelRequestedRef.current) return;
        setStepStatus('metadata', 'success');
      } catch (err: any) {
        if (cancelRequestedRef.current) return;
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
          description: sanitizedDescription,
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
          target_event_address: selectedTargetEvent?.lock_address ?? null,
          payout_destination: payoutDestination,
          deploy_txn_hash: deployed.transactionHash,
          metadata_set: true,
        }, { privyToken: token });
        if (cancelRequestedRef.current) return;
        setStepStatus('finalize', 'success');
      } catch (err: any) {
        if (cancelRequestedRef.current) return;
        if (LINKED_EVENT_ERRORS.has(err?.message)) {
          setSelectedTargetEvent(null);
          setTargetEventInput('');
          setStepStatus('finalize', 'idle');
          setPhase('form');
          toast({
            title: 'Linked event unavailable',
            description: 'The pass was deployed. Pick another event or save it without a linked event.',
            variant: 'destructive',
          });
          return;
        }
        setStepStatus('finalize', 'error', err?.message || String(err));
        return;
      }
    }

    setPhase('done');
    toast({ title: 'Ticket Pass created', description: 'Your pass is live and funded.' });
    onCreated?.();
  };

  const requestCancel = () => {
    if (phase === 'done') {
      onClose();
      return;
    }
    setShowCancelConfirm(true);
  };

  const confirmCancel = () => {
    cancelRequestedRef.current = true;
    setShowCancelConfirm(false);
    onClose();
  };

  const preflightLinkedEvent = async (): Promise<boolean> => {
    if (!selectedTargetEvent) return true;

    try {
      const data = await callEdgeFunction<LinkableEventsResponse>('search-linkable-events', {
        q: selectedTargetEvent.lock_address,
        chain_id: selectedTargetEvent.chain_id,
        limit: 1,
        offset: 0,
      }, {});
      const resolved = data.events.find(
        (event) => event.lock_address.toLowerCase() === selectedTargetEvent.lock_address.toLowerCase(),
      );
      if (resolved) return true;
    } catch (error) {
      toast({
        title: 'Linked event check failed',
        description: error instanceof Error ? error.message : 'Could not verify the linked event.',
        variant: 'destructive',
      });
      return false;
    }

    setSelectedTargetEvent(null);
    setTargetEventInput('');
    toast({
      title: 'Linked event unavailable',
      description: 'Pick another event or create this pass without a linked event.',
      variant: 'destructive',
    });
    return false;
  };

  const handleCreate = async () => {
    if (blockedByPayout) {
      toast({ title: 'Payout account required', description: 'Set up a verified payout account, or route proceeds to the platform.', variant: 'destructive' });
      return;
    }
    const err = validate();
    if (err) {
      toast({ title: 'Check the form', description: err, variant: 'destructive' });
      return;
    }
    const linkedEventOk = await preflightLinkedEvent();
    if (!linkedEventOk) return;
    setPhase('running');
    await runFrom();
  };

  const hasError = steps.some((s) => s.status === 'error');
  const deployStepStatus = steps.find((s) => s.id === 'deploy')?.status;
  const deployStarted = Boolean(deployRef.current) || deployStepStatus === 'executing' || deployStepStatus === 'success';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) requestCancel(); }}>
        <DialogContent
          className="sm:max-w-[560px] max-h-[90dvh] flex flex-col gap-0 p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>Create a Ticket Pass</DialogTitle>
          <DialogDescription>Pre-fund a pass with on-chain value that buyers redeem with fiat.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
        {phase === 'form' && (
          <div className="space-y-3 py-2">
            <PayoutDestinationField
              value={payoutDestination}
              onChange={setPayoutDestination}
              noun="pass"
              commissionPercent={payout?.payout_account?.percentage_charge}
            />
            {payoutDestination === 'seller' && payoutLoading && (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            )}
            {blockedByPayout && !payoutLoading && (
              <PayoutAccountRequiredCard context="creating a pass" percentage={payout?.payout_account?.percentage_charge} />
            )}
          </div>
        )}

        {phase === 'form' && !blockedByPayout && !(payoutDestination === 'seller' && payoutLoading) && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <FieldLabel help="Where this pass lives on-chain. Link an event and we’ll switch to that event’s network for you.">Network</FieldLabel>
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
              <FieldLabel htmlFor="tp-title" help="The name buyers see on the pass. Keep it short and easy to recognize.">Title</FieldLabel>
              <Input id="tp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VIP Entry Pass" />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="tp-desc" help="Tell buyers what this pass unlocks. You can format the text, but the real expiry and network are shown separately.">Description</FieldLabel>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="What this pass unlocks..."
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel help="The artwork buyers see for this pass and its ticket NFT. Square images look best.">Pass Image</FieldLabel>
              <ImageUploadField
                imageUrl={imageUrl}
                isUploading={isUploadingImage}
                authenticated={!!user}
                onFileSelect={handleImageSelect}
                onRemove={removeImage}
                onAdjustCrop={handleAdjustCrop}
                helperText="This image will be used for the ticket NFT artwork."
                previewAlt="Pass preview"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel help="The token buyers receive after payment. Choose None if the pass should only deliver ETH.">Payout token</FieldLabel>
                <Select value={tokenSymbol} onValueChange={(v) => setTokenSymbol(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None (ETH only)</SelectItem>
                    {PAYOUT_TOKENS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-tpc" help="How much of the selected token each buyer gets from one pass.">Token per pass</FieldLabel>
                <Input id="tp-tpc" type="number" min="0" value={tokenPerCopy} onChange={(e) => setTokenPerCopy(e.target.value)} disabled={tokenSymbol === 'NONE'} placeholder="50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-eth" help="Optional ETH sent to each buyer alongside the token payout. Leave it at zero if you do not need ETH.">ETH per pass</FieldLabel>
                <Input id="tp-eth" type="number" min="0" step="0.0001" value={ethPerCopy} onChange={(e) => setEthPerCopy(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-price" help="What buyers pay in naira. This is the checkout price before they receive the on-chain value.">Fiat price (NGN)</FieldLabel>
                <Input id="tp-price" type="number" min="0" value={priceFiat} onChange={(e) => setPriceFiat(e.target.value)} placeholder="5000" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-max" help="The total number of passes that can ever be sold from this batch.">Max copies</FieldLabel>
                <Input id="tp-max" type="number" min="1" value={maxCopies} onChange={(e) => setMaxCopies(e.target.value)} />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-perbuyer" help="The most one buyer can purchase, so a few wallets cannot take the whole drop.">Max per buyer</FieldLabel>
                <Input id="tp-perbuyer" type="number" min="1" value={maxPerBuyer} onChange={(e) => setMaxPerBuyer(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <FieldLabel className="text-sm" help="Turn this on if buyers should keep the pass forever after purchase.">Unlimited expiration</FieldLabel>
                <p className="text-xs text-muted-foreground">Passes never expire.</p>
              </div>
              <Switch checked={isUnlimited} onCheckedChange={setIsUnlimited} />
            </div>
            {!isUnlimited && (
              <div className="space-y-2">
                <FieldLabel htmlFor="tp-exp" help="How long each purchased pass stays usable. Buyers will see this before checkout.">Pass validity (days)</FieldLabel>
                <Input id="tp-exp" type="number" min="1" value={expirationDays} onChange={(e) => setExpirationDays(e.target.value)} />
              </div>
            )}

            {escrowPreview && (
              <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Your funds move into escrow, and settings lock once the pass is created.</p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                    <li>You deposit the full capacity now: <span className="font-semibold">{escrowPreview}</span>.</li>
                    <li>Per-pass payout and token can't be changed after creation.</li>
                    <li>You can retrieve any unsold funds by <span className="font-semibold">closing</span> the pass.</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel help="Choose the event this pass unlocks. You can search by event name or paste the event lock address.">Linked event (optional)</FieldLabel>
              <EventLinkPicker
                inputValue={targetEventInput}
                selectedEvent={selectedTargetEvent}
                onInputChange={(value) => {
                  setTargetEventInput(value);
                  if (selectedTargetEvent) setSelectedTargetEvent(null);
                }}
                onSelect={(event) => {
                  setSelectedTargetEvent(event);
                  setTargetEventInput(event.title);
                  if (activeNetworks.some((network) => network.chain_id === event.chain_id)) {
                    setChainId(event.chain_id);
                  }
                }}
                onClear={() => {
                  setSelectedTargetEvent(null);
                  setTargetEventInput('');
                }}
              />
            </div>
          </div>
        )}

        {phase !== 'form' && (
          <div className="space-y-3 py-4">
            <TransactionStepList steps={steps} />
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t">
          {phase === 'form' && (
            <>
              <Button variant="outline" onClick={requestCancel}>Cancel</Button>
              {!blockedByPayout && <Button onClick={handleCreate}>Create pass</Button>}
            </>
          )}
          {phase === 'running' && (
            <>
              <Button variant="outline" onClick={requestCancel}>Cancel</Button>
              {hasError && <Button onClick={runFrom}>Retry</Button>}
            </>
          )}
          {phase === 'done' && <Button onClick={onClose}>Done</Button>}
        </DialogFooter>
        <ImageCropper
          imageUrl={tempImageUrl}
          isOpen={showCropper}
          onClose={() => {
            setShowCropper(false);
            if (tempImageUrl) {
              URL.revokeObjectURL(tempImageUrl);
              setTempImageUrl('');
            }
          }}
          onCropComplete={handleCropComplete}
          fileName="pass-image.jpg"
          aspectRatio={1}
        />
        </DialogContent>
      </Dialog>
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deployStarted ? 'Leave without saving this pass?' : 'Cancel pass creation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deployStarted
                ? 'The deploy and fund transaction has started and may already be on-chain. If you leave now, this pass will not be saved in TeeRex, may not appear in the UI, and recovering the escrowed funds may be difficult.'
                : 'This will stop pass creation and discard the details you entered.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>
              {deployStarted ? 'Leave without saving' : 'Cancel creation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
