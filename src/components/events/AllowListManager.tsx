import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PublishedEvent } from '@/utils/eventUtils';
import { Loader2, Trash2, Plus, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';

interface AllowListManagerProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

interface AllowListEntry {
  id: string;
  wallet_address: string;
  created_at: string;
}

export const AllowListManager: React.FC<AllowListManagerProps> = ({ event, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [allowList, setAllowList] = useState<AllowListEntry[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [csvContent, setCsvContent] = useState('');

  useEffect(() => {
    if (isOpen && event) {
      loadAllowList();
    }
  }, [isOpen, event]);

  const loadAllowList = async () => {
    if (!event) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_allow_list')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllowList(data || []);
    } catch (error) {
      console.error('Error loading allow list:', error);
      toast({
        title: 'Error',
        description: 'Failed to load allow list',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addAddress = async () => {
    if (!event || !newAddress) return;

    // Basic validation - check if it looks like an Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
      toast({
        title: 'Invalid address',
        description: 'Please enter a valid Ethereum wallet address (0x...)',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('event_allow_list')
        .insert({
          event_id: event.id,
          wallet_address: newAddress.toLowerCase(),
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Already exists',
            description: 'This address is already on the allow list',
            variant: 'default',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Address added',
          description: 'Wallet address added to allow list',
        });
        setNewAddress('');
        loadAllowList();
      }
    } catch (error) {
      console.error('Error adding address:', error);
      toast({
        title: 'Error',
        description: 'Failed to add address',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const removeAddress = async (id: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('event_allow_list')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Address removed',
        description: 'Wallet address removed from allow list',
      });
      loadAllowList();
    } catch (error) {
      console.error('Error removing address:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove address',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const uploadCSV = async () => {
    if (!event || !csvContent) return;

    // Parse CSV - expecting one address per line
    const addresses = csvContent
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && /^0x[a-fA-F0-9]{40}$/.test(line));

    if (addresses.length === 0) {
      toast({
        title: 'No valid addresses',
        description: 'Please provide valid Ethereum addresses (one per line)',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const entries = addresses.map(address => ({
        event_id: event.id,
        wallet_address: address,
      }));

      const { error } = await supabase
        .from('event_allow_list')
        .insert(entries);

      if (error) {
        // Some might be duplicates - that's okay
        console.warn('Some addresses may have been skipped (duplicates):', error);
      }

      toast({
        title: 'Addresses uploaded',
        description: `Added ${addresses.length} address(es) to allow list`,
      });
      setCsvContent('');
      loadAllowList();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload addresses',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Allow List</DialogTitle>
          <DialogDescription>
            Control which wallet addresses can purchase tickets for {event.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Single Address Input */}
          <div className="space-y-2">
            <Label htmlFor="new-address">Add Single Address</Label>
            <div className="flex gap-2">
              <Input
                id="new-address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="0x..."
                disabled={isLoading}
              />
              <Button onClick={addAddress} disabled={isLoading || !newAddress}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* CSV Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-upload">Bulk Upload (CSV/Text)</Label>
            <textarea
              id="csv-upload"
              className="w-full min-h-[100px] p-2 border rounded-md"
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="0x1234...&#10;0x5678...&#10;0xabcd..."
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Enter wallet addresses, one per line
            </p>
            <Button
              onClick={uploadCSV}
              disabled={isLoading || !csvContent}
              variant="outline"
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Addresses
            </Button>
          </div>

          {/* Current Allow List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Current Allow List ({allowList.length})</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadAllowList}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : allowList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No addresses on allow list yet
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {allowList.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <code className="text-sm break-all flex-1 mr-2">
                        {entry.wallet_address}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAddress(entry.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
