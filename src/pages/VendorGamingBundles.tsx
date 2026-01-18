import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { addLockManager, deployLock } from '@/utils/lockUtils';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';
import { getGamingBundleMetadataBaseURI } from '@/utils/gamingBundleNftMetadata';
import { getTokenAddressAsync } from '@/lib/config/network-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Info, Settings2, DollarSign, CheckCircle2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { GamingBundleCard } from '@/components/gaming/GamingBundleCard';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ImageCropper } from '@/components/ui/ImageCropper';
import { GamingBundleCreationDialog } from '@/components/gaming/GamingBundleCreationDialog';
import { useTransactionStepper, type TxStep } from '@/hooks/useTransactionStepper';
import type { GamingBundle } from '@/types/gaming';

type BundleFormState = {
  title: string;
  description: string;
  gameTitle: string;
  console: string;
  location: string;
  imageUrl: string;
  bundleType: 'TIME' | 'MATCHES' | 'PASS' | 'OTHER';
  quantityUnits: number;
  unitLabel: string;
  priceFiat: number;
  priceDg: number;
  chainId: number;
  bundleAddress: string;
  expirationDays: number;
  isUnlimitedExpiration: boolean;
  enableFiat: boolean;
  isActive: boolean;
};

const DEFAULT_CHAIN_ID = 8453;
const UNLIMITED_EXPIRATION_SECONDS = 999999999;

const CONSOLE_OPTIONS = ['PS5', 'PS4', 'XBOX Series X', 'XBOX One', 'Nintendo Switch', 'PC', 'Mobile', 'Other'];
const TIME_UNIT_OPTIONS = ['minutes', 'hours', 'days'];
const BUNDLE_TYPE_LABELS: Record<string, string> = {
  TIME: 'minutes',
  MATCHES: 'matches',
  PASS: 'uses',
  OTHER: 'units',
};

const buildDefaultForm = (chainId: number): BundleFormState => ({
  title: '',
  description: '',
  gameTitle: '',
  console: '',
  location: '',
  imageUrl: '',
  bundleType: 'TIME',
  quantityUnits: 60,
  unitLabel: 'minutes',
  priceFiat: 0,
  priceDg: 0,
  chainId,
  bundleAddress: '',
  expirationDays: 30,
  isUnlimitedExpiration: false,
  enableFiat: false,
  isActive: true,
});

const VendorGamingBundles = () => {
  const { authenticated, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const { networks } = useNetworkConfigs();
  const fiatEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  const [form, setForm] = useState<BundleFormState>(() => buildDefaultForm(DEFAULT_CHAIN_ID));

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const [showCropper, setShowCropper] = useState(false);

  const { data: bundles = [], isLoading } = useGamingBundles(
    { mine: true, include_inactive: true },
    { enabled: authenticated }
  );

  const editingBundleId = searchParams.get('bundleId');
  const editingBundle = useMemo(
    () => bundles.find(bundle => bundle.id === editingBundleId),
    [bundles, editingBundleId]
  );
  const isEditMode = Boolean(editingBundle);
  const isSaving = isCreating || isUpdating;

  // Transaction Stepper State
  const [showProgress, setShowProgress] = useState(false);
  const { steps, currentStepIndex, executeStep, setSteps } = useTransactionStepper([]);
  const pendingDataRef = useRef<{
    lockAddress?: string;
    metadataSet: boolean;
    serviceManagerAdded: boolean;
  }>({ metadataSet: false, serviceManagerAdded: false });

  // Synchronize state with ref for UI purposes
  const [pendingBundleData, setPendingBundleDataState] = useState(pendingDataRef.current);
  const setPendingBundleData = (update: any) => {
    const next = typeof update === 'function' ? update(pendingDataRef.current) : update;
    pendingDataRef.current = next;
    setPendingBundleDataState(next);
  };

  useEffect(() => {
    if (networks.length > 0 && !networks.find(n => n.chain_id === form.chainId)) {
      setForm(prev => ({ ...prev, chainId: networks[0].chain_id }));
    }
  }, [networks, form.chainId]);

  const networkOptions = useMemo(() => networks.filter(n => n.is_active), [networks]);

  useEffect(() => {
    if (!editingBundle) return;

    const expirationSeconds = editingBundle.key_expiration_duration_seconds || 0;
    const unlimitedExpiration = expirationSeconds >= UNLIMITED_EXPIRATION_SECONDS;
    const computedDays = expirationSeconds > 0 ? Math.max(1, Math.ceil(expirationSeconds / 86400)) : 30;

    setForm({
      title: editingBundle.title || '',
      description: editingBundle.description || '',
      gameTitle: editingBundle.game_title || '',
      console: editingBundle.console || '',
      location: editingBundle.location || '',
      imageUrl: editingBundle.image_url || '',
      bundleType: editingBundle.bundle_type as BundleFormState['bundleType'],
      quantityUnits: editingBundle.quantity_units,
      unitLabel: editingBundle.unit_label,
      priceFiat: Number(editingBundle.price_fiat || 0),
      priceDg: Number(editingBundle.price_dg || 0),
      chainId: editingBundle.chain_id,
      bundleAddress: editingBundle.bundle_address,
      expirationDays: unlimitedExpiration ? 30 : computedDays,
      isUnlimitedExpiration: unlimitedExpiration,
      enableFiat: Number(editingBundle.price_fiat || 0) > 0,
      isActive: editingBundle.is_active,
    });
  }, [editingBundle]);

  const resetForm = (chainId: number) => {
    setForm(buildDefaultForm(chainId));
  };

  const handleEditBundle = (bundle: GamingBundle) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('bundleId', bundle.id);
    setSearchParams(nextParams);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const handleCancelEdit = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('bundleId');
    setSearchParams(nextParams);
    resetForm(form.chainId);
  };

  // Handle image file selection
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

  // Handle crop complete
  const handleCropComplete = async (croppedFile: File) => {
    setShowCropper(false);
    setIsUploadingImage(true);

    try {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const publicUrl = await uploadEventImage(croppedFile, userId);
      if (!publicUrl) throw new Error('Upload failed');

      setForm(prev => ({ ...prev, imageUrl: publicUrl }));
      toast({ title: 'Image uploaded', description: 'Bundle image saved.' });
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
    setForm(prev => ({ ...prev, imageUrl: '' }));
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl('');
    }
  };

  const handleAdjustCrop = () => {
    if (form.imageUrl) {
      setTempImageUrl(form.imageUrl);
      setShowCropper(true);
    }
  };

  const handleOpenProgressChange = (open: boolean) => {
    setShowProgress(open);
    if (!open) {
      setIsCreating(false);
      setIsUpdating(false);
    }
  };

  const handleCreateBundle = async () => {
    // Validation
    if (!authenticated) {
      toast({ title: 'Sign in required', description: 'Connect your account to create bundles.', variant: 'destructive' });
      return;
    }

    if (!form.title.trim()) {
      toast({ title: 'Title required', description: 'Provide a bundle title.', variant: 'destructive' });
      return;
    }

    if (!form.location.trim()) {
      toast({ title: 'Location required', description: 'Enter the gaming center location.', variant: 'destructive' });
      return;
    }

    if (form.enableFiat && form.priceFiat <= 0) {
      toast({ title: 'Fiat price required', description: 'Set an NGN price when fiat payments are enabled.', variant: 'destructive' });
      return;
    }

    if (form.enableFiat && form.priceDg <= 0) {
      toast({
        title: 'Missing DG price',
        description: 'Set a DG price as a fallback when NGN pricing is enabled.',
        variant: 'destructive',
      });
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Wallet required', description: 'Connect a wallet to create a bundle.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    setPendingBundleData({ lockAddress: undefined, metadataSet: false, serviceManagerAdded: false });

    const expirationDuration = form.isUnlimitedExpiration
      ? UNLIMITED_EXPIRATION_SECONDS
      : form.expirationDays * 24 * 60 * 60;

    const creationSteps: Omit<TxStep, 'status'>[] = [
      {
        id: 'deploy',
        label: 'Deploy Contract',
        description: 'Deploying the bundle lock contract to the blockchain.',
        action: async () => {
          const lockConfig = {
            name: form.title,
            symbol: `${form.title.slice(0, 3).toUpperCase()}BND`,
            keyPrice: form.priceDg > 0 ? String(form.priceDg) : '0',
            maxNumberOfKeys: 100000,
            expirationDuration,
            currency: form.priceDg > 0 ? 'DG' : 'FREE',
            price: form.priceDg > 0 ? form.priceDg : 0,
            maxKeysPerAddress: 100,
            transferable: true,
          };
          const result = await deployLock(lockConfig, wallet, form.chainId, true);
          if (!result.success || !result.lockAddress) {
            throw new Error(result.error || 'Deployment failed');
          }
          setPendingBundleData(prev => ({ ...prev, lockAddress: result.lockAddress }));
          return result;
        }
      },
      {
        id: 'metadata',
        label: 'Set NFT Metadata',
        description: 'Configuring the NFT image and description on-chain.',
        action: async () => {
          // Read from ref to avoid stale closure
          const finalLockAddr = pendingDataRef.current.lockAddress;
          if (!finalLockAddr) {
            throw new Error("Lock address not found. Please retry this step.");
          }

          const { ethers } = await import('ethers');
          const provider = await wallet.getEthereumProvider();
          const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();

          const { setLockMetadata: slm } = await import('@/utils/lockMetadata');
          const { getGamingBundleMetadataBaseURI: ggbu } = await import('@/utils/gamingBundleNftMetadata');
          const bundleMetadataURI = ggbu(finalLockAddr);

          // Original Step 2 used 'BUNDLE' as the symbol and the gaming-specific URI
          const result = await slm(finalLockAddr, form.title, 'BUNDLE', bundleMetadataURI, ethersSigner);
          if (!result.success) throw new Error(result.error || "Metadata setup failed");

          setPendingBundleData(prev => ({ ...prev, metadataSet: true }));
          return { transactionHash: result.txHash };
        }
      }
    ];

    if (fiatEnabled && form.enableFiat) {
      creationSteps.push({
        id: 'fiat',
        label: 'Activate Fiat Payments',
        description: 'Adding TeeRex service wallet as a lock manager for Paystack support.',
        action: async () => {
          const finalLockAddr = pendingDataRef.current.lockAddress;
          if (!finalLockAddr) throw new Error("Lock address not found");

          const resp = await supabase.functions.invoke('get-service-address');
          const serviceAddress = resp.data?.address;
          if (!serviceAddress) throw new Error("Service address not found");

          const result = await addLockManager(finalLockAddr, serviceAddress, wallet);
          if (!result.success) throw new Error(result.error || "Failed to add service manager");

          setPendingBundleData(prev => ({ ...prev, serviceManagerAdded: true }));
          return result;
        }
      });
    }

    creationSteps.push({
      id: 'finalize',
      label: 'Finalize Bundle',
      description: 'Saving bundle details to the database.',
      action: async () => {
        const finalLockAddr = pendingDataRef.current.lockAddress;
        if (!finalLockAddr) throw new Error("Lock address not found");

        const token = await getAccessToken();
        const { data, error } = await supabase.functions.invoke('create-gaming-bundle', {
          body: {
            title: form.title,
            description: form.description,
            game_title: form.gameTitle,
            console: form.console,
            location: form.location,
            image_url: form.imageUrl,
            bundle_type: form.bundleType,
            quantity_units: form.quantityUnits,
            unit_label: form.unitLabel,
            price_fiat: form.enableFiat ? form.priceFiat : 0,
            price_dg: form.priceDg,
            chain_id: form.chainId,
            bundle_address: finalLockAddr,
            key_expiration_duration_seconds: expirationDuration,
            service_manager_added: form.enableFiat && pendingDataRef.current.serviceManagerAdded,
            metadata_set: pendingDataRef.current.metadataSet,
            is_active: form.isActive
          },
          headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
        });

        if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Database save failed');
        return { ok: true };
      }
    });

    setSteps(creationSteps.map(s => ({ ...s, status: 'idle' })));
    setShowProgress(true);
  };

  // Effect to initiate the first step once progress is shown and steps are populated
  useEffect(() => {
    if (showProgress && currentStepIndex === -1 && steps.length > 0) {
      executeStep(0);
    }
  }, [showProgress, currentStepIndex, steps.length, executeStep]);

  // Effect to auto-advance if a step succeeds
  useEffect(() => {
    if (!showProgress || currentStepIndex === -1) return;

    const currentStep = steps[currentStepIndex];
    if (currentStep && currentStep.status === 'success' && currentStepIndex < steps.length - 1) {
      // Small delay to let user see success state
      const timer = setTimeout(() => {
        executeStep(currentStepIndex + 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [steps, currentStepIndex, showProgress, executeStep]);

  const handleFinish = () => {
    setShowProgress(false);
    setIsCreating(false);
    resetForm(form.chainId);
    queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });
    toast({ title: 'Bundle created!', description: 'Your gaming bundle is now live.' });
  };

  const handleUpdateBundle = async () => {
    if (!editingBundle) return;

    if (!form.title.trim()) {
      toast({ title: 'Title required', description: 'Provide a bundle title.', variant: 'destructive' });
      return;
    }

    if (!form.location.trim()) {
      toast({ title: 'Location required', description: 'Enter the gaming center location.', variant: 'destructive' });
      return;
    }

    if (form.enableFiat && form.priceFiat <= 0) {
      toast({ title: 'Fiat price required', description: 'Set an NGN price when fiat payments are enabled.', variant: 'destructive' });
      return;
    }

    if (form.enableFiat && form.priceDg <= 0) {
      toast({
        title: 'Missing DG price',
        description: 'Set a DG price as a fallback when NGN pricing is enabled.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdating(true);
    try {
      const dgPriceChanged = form.priceDg !== Number(editingBundle.price_dg || 0);

      if (dgPriceChanged) {
        const wallet = wallets[0];
        if (!wallet) {
          toast({
            title: 'Connect wallet',
            description: 'Connect a wallet to update on-chain pricing.',
            variant: 'destructive',
          });
          return;
        }

        const { ethers } = await import('ethers');
        const provider = await wallet.getEthereumProvider();
        const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();
        const PublicLockABI = [
          {
            "inputs": [
              { "internalType": "uint256", "name": "_keyPrice", "type": "uint256" },
              { "internalType": "address", "name": "_tokenAddress", "type": "address" }
            ],
            "name": "updateKeyPricing",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ];
        const lock = new ethers.Contract(editingBundle.bundle_address, PublicLockABI, ethersSigner);

        const dgTokenAddress = await getTokenAddressAsync(editingBundle.chain_id, 'DG');
        if (!dgTokenAddress) {
          throw new Error('DG token not configured for this chain');
        }

        const priceInWei = ethers.parseUnits(form.priceDg.toString(), 18);

        toast({
          title: 'Updating on-chain price...',
          description: 'Please confirm the transaction in your wallet.',
        });

        const tx = await lock.updateKeyPricing(priceInWei, dgTokenAddress);
        await tx.wait();

        toast({ title: 'On-chain price updated!', description: 'Updating bundle details...' });
      }

      const token = await getAccessToken();
      const { error: updateError } = await supabase.functions.invoke('update-gaming-bundle', {
        body: {
          bundle_id: editingBundle.id,
          title: form.title,
          description: form.description,
          game_title: form.gameTitle,
          console: form.console,
          location: form.location,
          image_url: form.imageUrl,
          price_fiat: form.priceFiat,
          price_dg: form.priceDg,
          quantity_units: form.quantityUnits,
          unit_label: form.unitLabel,
          is_active: form.isActive,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update bundle');
      }

      toast({ title: 'Bundle updated!', description: 'Your changes have been saved.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });
      handleCancelEdit();
    } catch (error: any) {
      console.error('Error updating bundle:', error);
      toast({
        title: 'Update failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gaming Bundles</h1>
          <p className="text-gray-600 mt-1">Create and manage bundle NFTs for your gaming center.</p>
        </div>

        <Card ref={formRef} className="border border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b bg-gray-50/30">
            <CardTitle className="text-xl flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-600" />
              {isEditMode ? 'Edit Bundle' : 'Create a New Bundle'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            {isEditMode && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 flex items-start gap-3">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>
                  You are editing <strong>{editingBundle?.title}</strong>. On-chain settings like bundle type,
                  expiration, and network are locked after creation to maintain integrity.
                </p>
              </div>
            )}

            {/* Section: General Details */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-md">
                  <Info className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">General Details</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bundle-title" className="text-xs font-bold uppercase text-gray-500">Bundle Title *</Label>
                  <Input
                    id="bundle-title"
                    value={form.title}
                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. 1 Hour PS5 Session"
                    className="h-11 shadow-sm"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bundle-game" className="text-xs font-bold uppercase text-gray-500">Game Title (optional)</Label>
                  <Input
                    id="bundle-game"
                    value={form.gameTitle}
                    onChange={(e) => setForm(prev => ({ ...prev, gameTitle: e.target.value }))}
                    placeholder="e.g. EA FC 26"
                    className="h-11 shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-500">Console Type</Label>
                  <Select
                    value={form.console}
                    onValueChange={(value) => setForm(prev => ({ ...prev, console: value }))}
                  >
                    <SelectTrigger className="h-11 shadow-sm">
                      <SelectValue placeholder="Select console" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONSOLE_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bundle-location" className="text-xs font-bold uppercase text-gray-500">Gaming Center Location *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="bundle-location"
                      value={form.location}
                      onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g. Gaming Arena Lagos"
                      className="pl-10 h-11 shadow-sm"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">Physical center where this bundle can be redeemed.</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bundle-description" className="text-xs font-bold uppercase text-gray-500">Description</Label>
                  <Textarea
                    id="bundle-description"
                    value={form.description}
                    onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Provide details about what includes in this bundle..."
                    className="min-h-[100px] shadow-sm resize-none"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-500">Bundle Image</Label>
                  <ImageUploadField
                    imageUrl={form.imageUrl}
                    isUploading={isUploadingImage}
                    authenticated={authenticated}
                    onFileSelect={handleImageSelect}
                    onRemove={removeImage}
                    onAdjustCrop={handleAdjustCrop}
                    label=""
                    helperText="This image will be used for the NFT artwork."
                    previewAlt="Bundle preview"
                  />
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* Section: Bundle Rules */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-50 rounded-md">
                  <Settings2 className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Bundle Settings</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-500">Usage Type</Label>
                  <Select
                    value={form.bundleType}
                    onValueChange={(value) => {
                      const type = value as BundleFormState['bundleType'];
                      setForm(prev => ({
                        ...prev,
                        bundleType: type,
                        unitLabel: BUNDLE_TYPE_LABELS[type] || prev.unitLabel
                      }));
                    }}
                    disabled={isEditMode}
                  >
                    <SelectTrigger className="h-11 shadow-sm">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TIME">Time Based</SelectItem>
                      <SelectItem value="MATCHES">Match Based</SelectItem>
                      <SelectItem value="PASS">Access Pass</SelectItem>
                      <SelectItem value="OTHER">Other Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-500">Quantity / Units</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      value={form.quantityUnits}
                      onChange={(e) => setForm(prev => ({ ...prev, quantityUnits: Number(e.target.value) }))}
                      min={1}
                      className="w-24 text-center font-bold h-11 shadow-sm border-blue-100 bg-blue-50/20"
                    />

                    {form.bundleType === 'TIME' ? (
                      <Select
                        value={form.unitLabel}
                        onValueChange={(value) => setForm(prev => ({ ...prev, unitLabel: value }))}
                      >
                        <SelectTrigger className="flex-1 h-11 shadow-sm">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_UNIT_OPTIONS.map(unit => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : form.bundleType === 'OTHER' ? (
                      <Input
                        value={form.unitLabel}
                        onChange={(e) => setForm(prev => ({ ...prev, unitLabel: e.target.value }))}
                        placeholder="e.g. credits"
                        className="flex-1 h-11 shadow-sm"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-600 px-4 py-2 bg-gray-50 rounded-md border border-gray-100 flex-1 h-11 flex items-center">
                        {form.unitLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4 p-4 bg-gray-50/50 border border-gray-100 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-bold uppercase text-gray-500">Expiration</Label>
                      <p className="text-[10px] text-muted-foreground">How long is this valid?</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-gray-500">Unlimited</span>
                      <Switch
                        checked={form.isUnlimitedExpiration}
                        onCheckedChange={(checked) => setForm(prev => ({ ...prev, isUnlimitedExpiration: checked }))}
                        disabled={isEditMode}
                      />
                    </div>
                  </div>
                  {!form.isUnlimitedExpiration && (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
                      <Input
                        type="number"
                        value={form.expirationDays}
                        onChange={(e) => setForm(prev => ({ ...prev, expirationDays: Number(e.target.value) }))}
                        min={1}
                        disabled={isEditMode}
                        className="h-10 shadow-sm bg-white"
                      />
                      <span className="text-sm text-muted-foreground font-medium">days</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-gray-500">Network</Label>
                  <Select
                    value={String(form.chainId)}
                    onValueChange={(value) => setForm(prev => ({ ...prev, chainId: Number(value) }))}
                    disabled={isEditMode}
                  >
                    <SelectTrigger className="h-11 shadow-sm">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      {networkOptions.map(network => (
                        <SelectItem key={network.id} value={String(network.chain_id)}>
                          {network.chain_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] text-muted-foreground tracking-tight">On-chain deployment happens on this network.</p>
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* Section: Pricing */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-50 rounded-md">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Pricing Configuration</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {fiatEnabled && (
                  <div className={`p-5 rounded-2xl border-2 transition-all duration-300 ${form.enableFiat
                    ? 'bg-blue-50/40 border-blue-200 ring-4 ring-blue-500/5'
                    : 'bg-gray-50/50 border-gray-100 opacity-80'
                    }`}>
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <Label className="text-sm font-bold flex items-center gap-1.5 text-blue-900">
                          Fiat Payments (NGN)
                          <CheckCircle2 className={`w-3.5 h-3.5 ${form.enableFiat ? 'text-blue-500' : 'text-gray-300'}`} />
                        </Label>
                        <p className="text-[10px] text-blue-700/70">Pay via Bank Transfer / Card</p>
                      </div>
                      <Switch
                        checked={form.enableFiat}
                        onCheckedChange={(checked) => setForm(prev => ({ ...prev, enableFiat: checked }))}
                      />
                    </div>

                    {form.enableFiat && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">₦</span>
                          <Input
                            id="price-fiat"
                            type="number"
                            value={form.priceFiat}
                            onChange={(e) => setForm(prev => ({ ...prev, priceFiat: Number(e.target.value) }))}
                            min={100}
                            placeholder="0.00"
                            className="pl-8 h-12 text-xl font-black shadow-sm bg-white border-blue-200"
                          />
                        </div>
                        <div className="p-2.5 bg-blue-100/30 rounded-lg border border-blue-100">
                          <p className="text-[9px] text-blue-800 leading-tight">
                            Enabling fiat allows TeeRex to manage gasless ticket issuance for your users.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-5 rounded-2xl border-2 bg-purple-50/10 border-purple-100/50">
                  <Label htmlFor="price-dg" className="text-sm font-bold block mb-5 text-purple-900">Crypto Price (DG)</Label>
                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        id="price-dg"
                        type="number"
                        value={form.priceDg}
                        onChange={(e) => setForm(prev => ({ ...prev, priceDg: Number(e.target.value) }))}
                        min={0}
                        placeholder="0.00"
                        className="h-12 text-xl font-black shadow-sm border-purple-200 focus-visible:ring-purple-500"
                      />
                      <Badge className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-gray-200 text-gray-500 font-bold" variant="outline">
                        DG
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic leading-tight">
                      On-chain price buyers pay when using DG token directly.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4 group">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, isActive: checked }))}
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-gray-900">Live & Active</p>
                  <p className="text-[11px] text-muted-foreground group-hover:text-blue-600 transition-colors">Visible to customers in the explore page.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                {isEditMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="flex-1 md:flex-none text-gray-500"
                  >
                    Cancel
                  </Button>
                )}

                <div className="relative flex-1 md:flex-none">
                  {(!form.title.trim() || !form.location.trim()) && (
                    <div className="absolute -top-10 right-0 w-max bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      Title and Location are required
                    </div>
                  )}
                  <Button
                    onClick={isEditMode ? handleUpdateBundle : handleCreateBundle}
                    disabled={isSaving || !form.title.trim() || !form.location.trim()}
                    className={`w-full md:min-w-[180px] h-12 shadow-xl shadow-blue-500/10 font-bold transition-all ${!isEditMode && form.title && form.location ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20 active:scale-[0.98]' : ''
                      }`}
                    size="lg"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isEditMode ? 'Saving...' : 'Deploying...'}</>
                    ) : (
                      <span className="flex items-center gap-2">
                        {isEditMode ? <CheckCircle2 className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
                        {isEditMode ? 'Update Bundle' : 'Create Bundle'}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Bundles</h2>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : bundles.length === 0 ? (
            <div className="text-sm text-gray-500">No bundles yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bundles.map(bundle => (
                <GamingBundleCard key={bundle.id} bundle={bundle} onEdit={handleEditBundle} />
              ))}
            </div>
          )}
        </section>
      </div>

      <GamingBundleCreationDialog
        open={showProgress}
        onOpenChange={handleOpenProgressChange}
        steps={steps}
        currentStepIndex={currentStepIndex}
        onRetry={(index) => executeStep(index)}
        onComplete={handleFinish}
      />

      {/* Image Cropper Dialog */}
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
        fileName="bundle-image.jpg"
        aspectRatio={1}
      />
    </div>
  );
};

export default VendorGamingBundles;
