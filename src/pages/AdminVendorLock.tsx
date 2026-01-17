import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, Lock, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { ImageCropper } from '@/components/ui/ImageCropper';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';
import { ImageUploadField } from '@/components/ui/ImageUploadField';

interface VendorLockSettings {
  id: string;
  lock_address: string;
  chain_id: number;
  lock_name: string;
  lock_symbol: string | null;
  key_price_wei: string;
  key_price_display: number;
  currency: string;
  currency_address: string;
  expiration_duration_seconds: number | null;
  max_keys_per_address: number;
  is_transferable: boolean;
  description: string | null;
  image_url: string | null;
  benefits: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateLockFormData {
  lock_address: string;
  chain_id: number;
  description: string;
  image_url: string;
  benefits: string[];
}

interface EditLockFormData {
  description: string;
  image_url: string;
  benefits: string[];
}

const AdminVendorLock: React.FC = () => {
  const { getAccessToken, user, authenticated } = usePrivy();
  const { toast } = useToast();
  const [currentLock, setCurrentLock] = useState<VendorLockSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState<number>(0);
  const [onChainPrice, setOnChainPrice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Image upload state
  const [previewUrl, setPreviewUrl] = useState('');
  const [displayImageUrl, setDisplayImageUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [createFormData, setCreateFormData] = useState<CreateLockFormData>({
    lock_address: '',
    chain_id: 8453, // Base Mainnet default
    description: '',
    image_url: '',
    benefits: ['Sell gaming bundles', 'Accept crypto and fiat payments', 'Manage orders and redemptions'],
  });

  const [editFormData, setEditFormData] = useState<EditLockFormData>({
    description: '',
    image_url: '',
    benefits: [],
  });

  const [newBenefit, setNewBenefit] = useState('');

  const loadCurrentLock = async () => {
    try {
      setIsLoading(true);
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Failed to get access token');
      }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('admin-manage-vendor-lock', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      setCurrentLock(data.settings);
      if (data.on_chain_price) {
        setOnChainPrice(data.on_chain_price);
      }

      // Load purchase count
      if (data.settings) {
        const { count } = await supabase
          .from('vendor_lock_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('vendor_lock_id', data.settings.id);
        setPurchaseCount(count || 0);
      }
    } catch (error) {
      console.error('[AdminVendorLock] Error loading lock:', error);
      toast({
        title: 'Error Loading Vendor Lock',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentLock();
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!authenticated || !user?.id) {
      toast({
        title: "Authentication Required",
        description: "Please make sure you're logged in to upload images.",
        variant: "destructive"
      });
      return;
    }

    if (file) {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive"
        });
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive"
        });
        return;
      }

      // Create preview URL and show cropper
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setSelectedFile(file);
      setShowCropper(true);
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (!user?.id) return;

    setShowCropper(false);
    setIsUploading(true);

    // Create blob URL for immediate preview
    const croppedBlobUrl = URL.createObjectURL(croppedFile);
    setDisplayImageUrl(croppedBlobUrl);

    try {
      console.log('Starting cropped image upload for user:', user.id);
      console.log('Cropped file details:', {
        name: croppedFile.name,
        size: croppedFile.size,
        type: croppedFile.type
      });

      const imageUrl = await uploadEventImage(croppedFile, user.id);

      if (imageUrl) {
        // Update form data based on which dialog is open
        if (createDialogOpen) {
          setCreateFormData({ ...createFormData, image_url: imageUrl });
        } else if (editDialogOpen) {
          setEditFormData({ ...editFormData, image_url: imageUrl });
        }

        console.log('Cropped image uploaded successfully, preloading remote URL:', imageUrl);

        // Preload remote URL before switching display
        const img = new Image();
        img.onload = () => {
          console.log('Remote URL loaded successfully, switching from blob to remote');
          setDisplayImageUrl(imageUrl); // Switch to remote

          // Now safe to clean up blob URLs
          URL.revokeObjectURL(croppedBlobUrl);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
          }
        };
        img.onerror = () => {
          console.warn('Remote URL failed to load, keeping local blob preview');
          toast({
            title: "Image Upload Warning",
            description: "Image uploaded but preview may be delayed. It will appear after saving.",
            variant: "default"
          });
          // Keep blob preview visible since remote failed
        };
        img.src = imageUrl;

        toast({
          title: "Image Uploaded",
          description: "Your vendor lock image has been cropped and uploaded successfully.",
        });
      } else {
        // Upload returned null/empty
        console.error('Upload failed: no URL returned');
        toast({
          title: "Upload Failed",
          description: "Could not upload image to storage. Please check your connection and try again.",
          variant: "destructive"
        });

        // Revert to no image
        setDisplayImageUrl('');
        URL.revokeObjectURL(croppedBlobUrl);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl('');
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : "An unknown error occurred";

      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive"
      });

      // Clean up blob URLs on error
      setDisplayImageUrl('');
      URL.revokeObjectURL(croppedBlobUrl);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    // Update form data based on which dialog is open
    if (createDialogOpen) {
      setCreateFormData({ ...createFormData, image_url: '' });
    } else if (editDialogOpen) {
      setEditFormData({ ...editFormData, image_url: '' });
    }

    setDisplayImageUrl('');

    // Clean up any blob URLs
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (displayImageUrl && displayImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(displayImageUrl);
    }
  };

  const handleAdjustCrop = () => {
    if (displayImageUrl) {
      setPreviewUrl(displayImageUrl);
      setSelectedFile(new File([], 'existing-image.jpg')); // Dummy file to indicate we're re-cropping
      setShowCropper(true);
    }
  };

  // Update edit form when current lock changes
  useEffect(() => {
    if (currentLock) {
      setEditFormData({
        description: currentLock.description || '',
        image_url: currentLock.image_url || '',
        benefits: currentLock.benefits || [],
      });
      // Set display image URL when editing existing lock
      if (currentLock.image_url) {
        setDisplayImageUrl(currentLock.image_url);
      }
    }
  }, [currentLock]);

  // Reset display image when dialogs are closed
  useEffect(() => {
    if (!createDialogOpen && !editDialogOpen) {
      setDisplayImageUrl('');
      setSelectedFile(null);
      setShowCropper(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
    } else if (editDialogOpen && currentLock?.image_url) {
      // Re-initialize display image when opening edit dialog
      setDisplayImageUrl(currentLock.image_url);
    }
  }, [createDialogOpen, editDialogOpen, currentLock, previewUrl]);

  const handleCreateLock = async () => {
    if (!createFormData.lock_address || !createFormData.chain_id) {
      toast({
        title: 'Missing Fields',
        description: 'Lock address and chain ID are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreating(true);
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Failed to get access token');
      }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('admin-manage-vendor-lock', {
        method: 'POST',
        body: createFormData,
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast({
        title: 'Vendor Lock Created',
        description: 'Successfully created new vendor lock configuration.',
      });

      setCreateDialogOpen(false);
      loadCurrentLock();

      // Reset form
      setCreateFormData({
        lock_address: '',
        chain_id: 8453,
        description: '',
        image_url: '',
        benefits: ['Sell gaming bundles', 'Accept crypto and fiat payments', 'Manage orders and redemptions'],
      });
    } catch (error) {
      console.error('[AdminVendorLock] Error creating lock:', error);
      toast({
        title: 'Error Creating Lock',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateLock = async () => {
    if (!currentLock) return;

    try {
      setIsSaving(true);
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Failed to get access token');
      }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('admin-manage-vendor-lock', {
        method: 'PUT',
        body: {
          id: currentLock.id,
          ...editFormData,
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast({
        title: 'Lock Updated',
        description: 'Successfully updated vendor lock settings.',
      });

      setEditDialogOpen(false);
      loadCurrentLock();
    } catch (error) {
      console.error('[AdminVendorLock] Error updating lock:', error);
      toast({
        title: 'Error Updating Lock',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivateLock = async () => {
    if (!currentLock) return;

    if (!confirm('Are you sure you want to deactivate the current vendor lock? This will prevent new vendor purchases.')) {
      return;
    }

    try {
      setIsSaving(true);
      const token = await getAccessToken?.();
      if (!token) {
        throw new Error('Failed to get access token');
      }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data, error } = await supabase.functions.invoke('admin-manage-vendor-lock', {
        method: 'DELETE',
        body: { id: currentLock.id },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast({
        title: 'Lock Deactivated',
        description: 'Vendor lock has been deactivated.',
      });

      loadCurrentLock();
    } catch (error) {
      console.error('[AdminVendorLock] Error deactivating lock:', error);
      toast({
        title: 'Error Deactivating Lock',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncPrice = async () => {
    if (!currentLock) return;

    try {
      setIsSyncing(true);
      await loadCurrentLock(); // Reload to get fresh on-chain price
      toast({
        title: 'Price Synced',
        description: 'Successfully synced price from on-chain contract.',
      });
    } catch (error) {
      console.error('[AdminVendorLock] Error syncing price:', error);
      toast({
        title: 'Error Syncing Price',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const addBenefit = () => {
    if (newBenefit.trim()) {
      if (editDialogOpen) {
        setEditFormData({
          ...editFormData,
          benefits: [...editFormData.benefits, newBenefit.trim()],
        });
      } else {
        setCreateFormData({
          ...createFormData,
          benefits: [...createFormData.benefits, newBenefit.trim()],
        });
      }
      setNewBenefit('');
    }
  };

  const removeBenefit = (index: number) => {
    if (editDialogOpen) {
      setEditFormData({
        ...editFormData,
        benefits: editFormData.benefits.filter((_, i) => i !== index),
      });
    } else {
      setCreateFormData({
        ...createFormData,
        benefits: createFormData.benefits.filter((_, i) => i !== index),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Vendor Lock Settings</h1>
          <p className="text-muted-foreground">Manage vendor access configuration</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Vendor Lock
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Vendor Lock</DialogTitle>
              <DialogDescription>
                Configure a new Unlock Protocol lock for vendor access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="lock_address">Lock Contract Address*</Label>
                <Input
                  id="lock_address"
                  value={createFormData.lock_address}
                  onChange={(e) => setCreateFormData({ ...createFormData, lock_address: e.target.value })}
                  placeholder="0x..."
                />
              </div>
              <div>
                <Label htmlFor="chain_id">Chain*</Label>
                <Select
                  value={String(createFormData.chain_id)}
                  onValueChange={(value) => setCreateFormData({ ...createFormData, chain_id: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8453">Base Mainnet (8453)</SelectItem>
                    <SelectItem value="84532">Base Sepolia (84532)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={createFormData.description}
                  onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                  placeholder="Describe what vendors get with this access..."
                  rows={3}
                />
              </div>
              <ImageUploadField
                imageUrl={displayImageUrl}
                isUploading={isUploading}
                authenticated={authenticated}
                onFileSelect={handleFileUpload}
                onRemove={removeImage}
                onAdjustCrop={handleAdjustCrop}
                label="Vendor Lock Image"
                helperText="Recommended: Square format (1:1 aspect ratio)"
                previewAlt="Vendor lock preview"
              />
              <div>
                <Label>Benefits</Label>
                <div className="space-y-2">
                  {createFormData.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{benefit}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeBenefit(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newBenefit}
                      onChange={(e) => setNewBenefit(e.target.value)}
                      placeholder="Add a benefit..."
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                    />
                    <Button onClick={addBenefit} size="sm">Add</Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateLock} disabled={isCreating}>
                {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create Lock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Image Cropper Modal */}
      {showCropper && previewUrl && (
        <ImageCropper
          imageUrl={previewUrl}
          isOpen={showCropper}
          onClose={() => {
            setShowCropper(false);
            setSelectedFile(null);
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
          }}
          onCropComplete={handleCropComplete}
          fileName={selectedFile?.name || 'vendor-lock-image.jpg'}
        />
      )}

      {currentLock ? (
        <div className="space-y-6">
          {/* Current Lock Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5" />
                  <div>
                    <CardTitle>{currentLock.lock_name}</CardTitle>
                    {currentLock.lock_symbol && (
                      <CardDescription>{currentLock.lock_symbol}</CardDescription>
                    )}
                  </div>
                </div>
                <Badge variant={currentLock.is_active ? 'default' : 'secondary'}>
                  {currentLock.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Lock Address</span>
                  <p className="font-mono text-xs break-all">{currentLock.lock_address}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chain ID</span>
                  <p className="font-semibold">{currentLock.chain_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Price (DB)</span>
                  <p className="font-semibold">
                    {currentLock.key_price_display} {currentLock.currency}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Price (On-Chain)</span>
                  <div className="flex items-center gap-2">
                    {onChainPrice ? (
                      <>
                        <p className="font-semibold">{onChainPrice}</p>
                        {onChainPrice !== String(currentLock.key_price_display) && (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                      </>
                    ) : (
                      <Button variant="link" size="sm" onClick={handleSyncPrice} disabled={isSyncing} className="p-0 h-auto">
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sync'}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Purchases</span>
                  <p className="font-semibold">{purchaseCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Expiration</span>
                  <p className="font-semibold">
                    {currentLock.expiration_duration_seconds
                      ? `${Math.floor(currentLock.expiration_duration_seconds / 86400)} days`
                      : 'Lifetime'}
                  </p>
                </div>
              </div>

              {currentLock.description && (
                <div>
                  <span className="text-sm text-muted-foreground">Description</span>
                  <p className="text-sm mt-1">{currentLock.description}</p>
                </div>
              )}

              {currentLock.benefits && currentLock.benefits.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Benefits</span>
                  <ul className="mt-2 space-y-1">
                    {currentLock.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleSyncPrice} disabled={isSyncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Price
                </Button>
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Vendor Lock</DialogTitle>
                      <DialogDescription>
                        Update mutable settings (description, image, benefits)
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="edit_description">Description</Label>
                        <Textarea
                          id="edit_description"
                          value={editFormData.description}
                          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <ImageUploadField
                        imageUrl={displayImageUrl}
                        isUploading={isUploading}
                        authenticated={authenticated}
                        onFileSelect={handleFileUpload}
                        onRemove={removeImage}
                        onAdjustCrop={handleAdjustCrop}
                        label="Vendor Lock Image"
                        helperText="Recommended: Square format (1:1 aspect ratio)"
                        previewAlt="Vendor lock preview"
                      />
                      <div>
                        <Label>Benefits</Label>
                        <div className="space-y-2">
                          {editFormData.benefits.map((benefit, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="flex-1 text-sm">{benefit}</span>
                              <Button variant="ghost" size="sm" onClick={() => removeBenefit(index)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <Input
                              value={newBenefit}
                              onChange={(e) => setNewBenefit(e.target.value)}
                              placeholder="Add a benefit..."
                              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                            />
                            <Button onClick={addBenefit} size="sm">Add</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateLock} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="destructive" onClick={handleDeactivateLock} disabled={isSaving}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Deactivate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Vendor Lock Configured</CardTitle>
            <CardDescription>
              Create a vendor lock to enable vendor access purchases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Vendor Lock
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminVendorLock;
