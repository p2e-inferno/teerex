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
import { Loader2, Upload, MapPin } from 'lucide-react';
import { GamingBundleCard } from '@/components/gaming/GamingBundleCard';
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
    isActive: true,
  });

  const [isDeploying, setIsDeploying] = useState(false);
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

  const handleDeployLock = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title required', description: 'Provide a bundle title before deploying.', variant: 'destructive' });
      return;
    }

    if (!form.location.trim()) {
      toast({ title: 'Location required', description: 'Provide a gaming center location before deploying.', variant: 'destructive' });
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Wallet required', description: 'Connect a wallet to deploy a bundle NFT.', variant: 'destructive' });
      return;
    }

    setIsDeploying(true);
    try {
      const lockConfig = {
        name: form.title,
        symbol: `${form.title.slice(0, 3).toUpperCase()}BND`,
        keyPrice: form.priceDg > 0 ? String(form.priceDg) : '0',
        maxNumberOfKeys: 100000,
        expirationDuration: form.expirationDays * 24 * 60 * 60,
        currency: form.priceDg > 0 ? 'DG' : 'FREE',
        price: form.priceDg > 0 ? form.priceDg : 0,
        maxKeysPerAddress: 100, // Allow users to purchase multiple bundles
        transferable: true, // Gaming bundles can be transferred/gifted
      };

      const result = await deployLock(lockConfig, wallet, form.chainId);
      if (!result.success || !result.lockAddress) {
        throw new Error(result.error || 'Failed to deploy lock');
      }

      // Set gaming bundle-specific metadata baseURI
      try {
        const { setLockMetadata } = await import('@/utils/lockMetadata');
        const { ethers } = await import('ethers');
        const provider = await wallet.getEthereumProvider();
        const ethersSigner = await new ethers.BrowserProvider(provider).getSigner();

        const bundleMetadataURI = getGamingBundleMetadataBaseURI(result.lockAddress);
        await setLockMetadata(
          result.lockAddress,
          form.title,
          'BUNDLE', // Symbol for gaming bundles
          bundleMetadataURI,
          ethersSigner
        );
        console.log('[Bundle Deploy] Set metadata URI:', bundleMetadataURI);
      } catch (metadataError) {
        console.warn('[Bundle Deploy] Failed to set metadata (non-critical):', metadataError);
        // Don't fail deployment - metadata can be set later
      }

      setForm(prev => ({ ...prev, bundleAddress: result.lockAddress! }));
      toast({ title: 'Bundle contract deployed', description: `Lock: ${result.lockAddress}` });
    } catch (error) {
      toast({
        title: 'Deployment failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCreateBundle = async () => {
    if (!authenticated) {
      toast({ title: 'Sign in required', description: 'Connect your account to create bundles.', variant: 'destructive' });
      return;
    }

    if (!form.bundleAddress.trim()) {
      toast({ title: 'Missing lock address', description: 'Deploy a bundle contract first.', variant: 'destructive' });
      return;
    }

    if (!form.location.trim()) {
      toast({ title: 'Location required', description: 'Enter the gaming center location.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
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
          bundle_address: form.bundleAddress,
          key_expiration_duration_seconds: form.expirationDays * 24 * 60 * 60,
          is_active: form.isActive,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to create bundle');
      }

      toast({ title: 'Bundle created', description: 'Your gaming bundle is now live.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundles'] });
      // Reset form
      setForm(prev => ({
        ...prev,
        title: '',
        description: '',
        gameTitle: '',
        console: '',
        location: '',
        imageUrl: '',
        bundleAddress: '',
      }));
    } catch (error) {
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
            <div className="space-y-3 md:col-span-2">
              <Label>Bundle Image</Label>
              <div className="flex items-center gap-4">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="Bundle" className="w-24 h-24 object-cover rounded-lg border" />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border">
                    No image
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="bundle-image-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('bundle-image-input')?.click()}
                    disabled={isUploadingImage}
                  >
                    {isUploadingImage ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Upload Image</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Image will be used for NFT metadata on marketplaces.
                  </p>
                </div>
              </div>
            </div>
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
              <Label>Expiration (days)</Label>
              <Input
                type="number"
                value={form.expirationDays}
                onChange={(e) => setForm(prev => ({ ...prev, expirationDays: Number(e.target.value) }))}
                min={1}
              />
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
            <div className="space-y-3 md:col-span-2">
              <Label htmlFor="bundle-lock-address">Bundle Contract Address *</Label>
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  id="bundle-lock-address"
                  value={form.bundleAddress}
                  placeholder={form.bundleAddress ? form.bundleAddress : "Deploy to get address..."}
                  disabled
                  className="bg-gray-50"
                />
                <Button
                  variant="outline"
                  onClick={handleDeployLock}
                  disabled={isDeploying || !form.title.trim() || !form.location.trim()}
                >
                  {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Deploy Bundle Contract'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You must deploy a bundle contract before creating the bundle. Fill in title and location first.
              </p>
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
                disabled={isCreating || !form.bundleAddress || !form.location.trim()}
                className="w-full md:w-auto"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Bundle'}
              </Button>
              {!form.bundleAddress && (
                <p className="text-xs text-amber-600 mt-2">
                  Deploy a bundle contract first to enable creation.
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
