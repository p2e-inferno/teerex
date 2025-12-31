import { useEffect, useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { deployLock } from '@/utils/lockUtils';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';
import { getGamingBundleMetadataBaseURI } from '@/utils/gamingBundleNftMetadata';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin } from 'lucide-react';
import { GamingBundleCard } from '@/components/gaming/GamingBundleCard';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ImageCropper } from '@/components/ui/ImageCropper';

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
  isActive: boolean;
};

const DEFAULT_CHAIN_ID = 8453;

const CONSOLE_OPTIONS = ['PS5', 'PS4', 'XBOX Series X', 'XBOX One', 'Nintendo Switch', 'PC', 'Other'];

const VendorGamingBundles = () => {
  const { authenticated, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { networks } = useNetworkConfigs();

  const [form, setForm] = useState<BundleFormState>({
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
    chainId: DEFAULT_CHAIN_ID,
    bundleAddress: '',
    expirationDays: 30,
    isUnlimitedExpiration: false,
    isActive: true,
  });

  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const [showCropper, setShowCropper] = useState(false);

  const { data: bundles = [], isLoading } = useGamingBundles(
    { mine: true, include_inactive: true },
    { enabled: authenticated }
  );

  useEffect(() => {
    if (networks.length > 0 && !networks.find(n => n.chain_id === form.chainId)) {
      setForm(prev => ({ ...prev, chainId: networks[0].chain_id }));
    }
  }, [networks, form.chainId]);

  const networkOptions = useMemo(() => networks.filter(n => n.is_active), [networks]);

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

    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Wallet required', description: 'Connect a wallet to create a bundle.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      // Calculate expiration duration - use max value for unlimited
      const expirationDuration = form.isUnlimitedExpiration
        ? 999999999 // ~31 years (effectively unlimited, matching event creation)
        : form.expirationDays * 24 * 60 * 60;

      // Step 1: Deploy the lock contract
      toast({ title: 'Deploying contract...', description: 'Please confirm the transaction in your wallet.' });

      const lockConfig = {
        name: form.title,
        symbol: `${form.title.slice(0, 3).toUpperCase()}BND`,
        keyPrice: form.priceDg > 0 ? String(form.priceDg) : '0',
        maxNumberOfKeys: 100000,
        expirationDuration,
        currency: form.priceDg > 0 ? 'DG' : 'FREE',
        price: form.priceDg > 0 ? form.priceDg : 0,
        maxKeysPerAddress: 100, // Allow users to purchase multiple bundles
        transferable: true, // Gaming bundles can be transferred/gifted
      };

      const deployResult = await deployLock(lockConfig, wallet, form.chainId);
      if (!deployResult.success || !deployResult.lockAddress) {
        throw new Error(deployResult.error || 'Failed to deploy lock contract');
      }

      const lockAddress = deployResult.lockAddress;

      toast({ title: 'Contract deployed!', description: 'Setting NFT metadata...' });

      // Step 1.5: Set gaming bundle-specific metadata baseURI with retry logic
      let metadataSet = false;
      try {
        const { ethers } = await import('ethers');
        const provider = await wallet.getEthereumProvider();
        const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();

        const bundleMetadataURI = getGamingBundleMetadataBaseURI(lockAddress);
        const PublicLockABI = (await import('../../supabase/functions/_shared/abi/PublicLockV15.json')).default;
        const lock = new ethers.Contract(lockAddress, PublicLockABI, ethersSigner);

        // Retry logic for setLockMetadata (2 attempts max)
        let lastError: any;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[Bundle Deploy] Attempt ${attempt}/2: Setting metadata URI`);
            const tx = await lock.setLockMetadata(form.title, 'BUNDLE', bundleMetadataURI);
            await tx.wait();
            console.log('[Bundle Deploy] Metadata URI set successfully:', bundleMetadataURI);
            metadataSet = true;
            break;
          } catch (error: any) {
            lastError = error;
            console.warn(`[Bundle Deploy] Attempt ${attempt}/2 failed:`, error.message);
            if (attempt < 2) {
              // Wait 1 second before retry
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }

        if (!metadataSet) {
          throw lastError;
        }
      } catch (metadataError: any) {
        console.error('[Bundle Deploy] Failed to set metadata after retries:', metadataError);
        // Don't fail deployment - we'll track this and let user fix it later
        metadataSet = false;
      }

      toast({ title: metadataSet ? 'Metadata set!' : 'Contract deployed!', description: 'Creating bundle in database...' });

      // Step 2: Save bundle to database
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('create-gaming-bundle', {
        body: {
          title: form.title,
          description: form.description,
          game_title: form.gameTitle || null,
          console: form.console || null,
          location: form.location,
          image_url: form.imageUrl || null,
          bundle_type: form.bundleType,
          quantity_units: form.quantityUnits,
          unit_label: form.unitLabel,
          price_fiat: form.priceFiat,
          fiat_symbol: 'NGN',
          price_dg: form.priceDg || null,
          chain_id: form.chainId,
          bundle_address: lockAddress,
          key_expiration_duration_seconds: expirationDuration,
          metadata_set: metadataSet,
          is_active: form.isActive,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to create bundle');
      }

      toast({ title: 'Bundle created!', description: 'Your gaming bundle is now live.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });

      // Reset form
      setForm({
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
        chainId: form.chainId, // Keep selected network
        bundleAddress: '',
        expirationDays: 30,
        isUnlimitedExpiration: false,
        isActive: true,
      });
    } catch (error) {
      console.error('Error creating bundle:', error);
      toast({
        title: 'Create failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gaming Bundles</h1>
          <p className="text-gray-600 mt-1">Create and manage bundle NFTs for your gaming center.</p>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Create a New Bundle</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="bundle-title">Title</Label>
              <Input
                id="bundle-title"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="1 Hour PS5 Session"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="bundle-game">Game Title (optional)</Label>
              <Input
                id="bundle-game"
                value={form.gameTitle}
                onChange={(e) => setForm(prev => ({ ...prev, gameTitle: e.target.value }))}
                placeholder="EA FC 26"
              />
            </div>
            <div className="space-y-3">
              <Label>Console</Label>
              <Select
                value={form.console}
                onValueChange={(value) => setForm(prev => ({ ...prev, console: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select console (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {CONSOLE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label htmlFor="bundle-location">Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="bundle-location"
                  value={form.location}
                  onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Gaming Arena Lagos"
                  className="pl-10"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Physical gaming center where this bundle can be redeemed.
              </p>
            </div>
            <div className="space-y-3 md:col-span-2">
              <Label htmlFor="bundle-description">Description</Label>
              <Textarea
                id="bundle-description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what the bundle includes."
              />
            </div>
            <ImageUploadField
              imageUrl={form.imageUrl}
              isUploading={isUploadingImage}
              authenticated={authenticated}
              onFileSelect={handleImageSelect}
              onRemove={removeImage}
              onAdjustCrop={handleAdjustCrop}
              label="Bundle Image"
              helperText="Image will be used for NFT metadata on marketplaces."
              previewAlt="Bundle preview"
            />
            <div className="space-y-3">
              <Label>Bundle Type</Label>
              <Select
                value={form.bundleType}
                onValueChange={(value) => setForm(prev => ({ ...prev, bundleType: value as BundleFormState['bundleType'] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TIME">Time</SelectItem>
                  <SelectItem value="MATCHES">Matches</SelectItem>
                  <SelectItem value="PASS">Pass</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Units</Label>
              <div className="flex gap-3">
                <Input
                  type="number"
                  value={form.quantityUnits}
                  onChange={(e) => setForm(prev => ({ ...prev, quantityUnits: Number(e.target.value) }))}
                  min={1}
                />
                <Input
                  value={form.unitLabel}
                  onChange={(e) => setForm(prev => ({ ...prev, unitLabel: e.target.value }))}
                  placeholder="minutes"
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Price (NGN)</Label>
              <Input
                type="number"
                value={form.priceFiat}
                onChange={(e) => setForm(prev => ({ ...prev, priceFiat: Number(e.target.value) }))}
                min={0}
              />
            </div>
            <div className="space-y-3">
              <Label>Price (DG)</Label>
              <Input
                type="number"
                value={form.priceDg}
                onChange={(e) => setForm(prev => ({ ...prev, priceDg: Number(e.target.value) }))}
                min={0}
              />
              {form.priceDg > 0 && <Badge variant="secondary">DG on-chain price</Badge>}
            </div>
            <div className="space-y-3">
              <Label>Bundle Expiration</Label>
              <div className="flex items-center gap-3 mb-2">
                <Switch
                  checked={form.isUnlimitedExpiration}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, isUnlimitedExpiration: checked }))}
                />
                <span className="text-sm">Unlimited</span>
              </div>
              {!form.isUnlimitedExpiration && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={form.expirationDays}
                    onChange={(e) => setForm(prev => ({ ...prev, expirationDays: Number(e.target.value) }))}
                    min={1}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">days</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                How long after purchase will the bundle remain valid?
              </p>
            </div>
            <div className="space-y-3">
              <Label>Network</Label>
              <Select
                value={String(form.chainId)}
                onValueChange={(value) => setForm(prev => ({ ...prev, chainId: Number(value) }))}
              >
                <SelectTrigger>
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
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, isActive: checked }))}
              />
              <span className="text-sm">Bundle is active</span>
            </div>
            <div className="md:col-span-2">
              <Button
                onClick={handleCreateBundle}
                disabled={isCreating || !form.title.trim() || !form.location.trim()}
                className="w-full md:w-auto"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Bundle'}
              </Button>
              {(!form.title.trim() || !form.location.trim()) && (
                <p className="text-xs text-muted-foreground mt-2">
                  Fill in title and location to create a bundle.
                </p>
              )}
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
                <GamingBundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          )}
        </section>
      </div>

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
