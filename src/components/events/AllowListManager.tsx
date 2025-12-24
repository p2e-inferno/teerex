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
import type { PublishedEvent } from '@/types/event';
import { Loader2, Trash2, Plus, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { usePrivy } from '@privy-io/react-auth';
import { normalizeEmail } from '@/utils/emailUtils';

interface AllowListManagerProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

interface AllowListEntry {
  id: string;
  wallet_address: string;
  user_email?: string | null;
  created_at: string;
}

interface AllowListRequestEntry {
  id: string;
  user_email: string;
  wallet_address: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

type UpsertEntry = {
  user_email?: string;
  wallet_address: string;
};

type ManageAllowListPayload =
  | {
      action: 'upsert_allow_list';
      event_id: string;
      entries: UpsertEntry[];
    }
  | {
      action: 'remove_allow_list';
      event_id: string;
      ids: string[];
    }
  | {
      action: 'get_requests';
      event_id: string;
      status?: 'pending' | 'approved' | 'rejected';
      page?: number;
      page_size?: number;
    }
  | {
      action: 'approve_requests';
      event_id: string;
      request_ids: string[];
    }
  | {
      action: 'reject_requests';
      event_id: string;
      request_ids: string[];
    }
  | {
      action: 'approve_by_email';
      event_id: string;
      user_email: string;
    };

export const AllowListManager: React.FC<AllowListManagerProps> = ({ event, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [allowList, setAllowList] = useState<AllowListEntry[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [requests, setRequests] = useState<AllowListRequestEntry[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const { getAccessToken } = usePrivy();

  const callManageAllowList = async (payload: ManageAllowListPayload) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication required to manage allow list');
    }

    const { data, error } = await supabase.functions.invoke('manage-allow-list', {
      body: payload,
      headers: {
        'X-Privy-Authorization': `Bearer ${accessToken}`,
      },
    });

    if (error) throw error;
    if (!data?.ok) {
      throw new Error(data?.error || 'Allow list operation failed');
    }
    return data;
  };

  useEffect(() => {
    if (isOpen && event) {
      loadAllowList();
      loadRequests();
    }
  }, [isOpen, event]);

  const loadAllowList = async () => {
    if (!event) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_allow_list')
        .select('id, wallet_address, user_email, created_at')
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
      await callManageAllowList({
        action: 'upsert_allow_list',
        event_id: event.id,
        entries: [{ wallet_address: newAddress.toLowerCase() }],
      });

      toast({
        title: 'Address added',
        description: 'Wallet address added to allow list',
      });
      setNewAddress('');
      loadAllowList();
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
      await callManageAllowList({
        action: 'remove_allow_list',
        event_id: event!.id,
        ids: [id],
      });

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
        wallet_address: address,
      }));

      await callManageAllowList({
        action: 'upsert_allow_list',
        event_id: event.id,
        entries,
      });

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

  const addByEmail = async () => {
    if (!event || !newEmail) return;

    const normalized = normalizeEmail(newEmail);
    if (!normalized) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    try {
      await callManageAllowList({
        action: 'approve_by_email' as any,
        event_id: event.id,
        user_email: normalized,
      });

      toast({
        title: 'Approved by email',
        description: 'User has been added to the allow list if a pending request existed for this email.',
      });
      setNewEmail('');
      await Promise.all([loadAllowList(), loadRequests()]);
    } catch (error: any) {
      console.error('Error approving by email:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to approve by email',
        variant: 'destructive',
      });
    }
  };

  const loadRequests = async () => {
    if (!event) return;

    setRequestsLoading(true);
    try {
      const data = await callManageAllowList({
        action: 'get_requests',
        event_id: event.id,
        status: 'pending',
        page: 1,
        page_size: 100,
      });
      setRequests((data?.data as AllowListRequestEntry[]) || []);
    } catch (error) {
      console.error('Error loading allow list requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load approval requests',
        variant: 'destructive',
      });
    } finally {
      setRequestsLoading(false);
    }
  };

  const approveRequest = async (requestId: string) => {
    if (!event) return;
    try {
      await callManageAllowList({
        action: 'approve_requests',
        event_id: event.id,
        request_ids: [requestId],
      });
      toast({
        title: 'Request approved',
        description: 'User has been added to the allow list',
      });
      await Promise.all([loadAllowList(), loadRequests()]);
    } catch (error) {
      console.error('Error approving allow list request:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve request',
        variant: 'destructive',
      });
    }
  };

  const rejectRequest = async (requestId: string) => {
    if (!event) return;
    try {
      await callManageAllowList({
        action: 'reject_requests',
        event_id: event.id,
        request_ids: [requestId],
      });
      toast({
        title: 'Request rejected',
        description: 'The request has been marked as rejected',
      });
      await loadRequests();
    } catch (error) {
      console.error('Error rejecting allow list request:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject request',
        variant: 'destructive',
      });
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

          {/* Add by Email (approve existing request) */}
          <div className="space-y-2">
            <Label htmlFor="new-email">Add by Email (Existing Request)</Label>
            <div className="flex gap-2">
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={isLoading}
              />
              <Button onClick={addByEmail} disabled={isLoading || !newEmail}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Approves pending requests for this email and adds their wallet(s) to the allow list.
            </p>
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
                      <div className="flex-1 mr-2">
                        <code className="text-sm break-all block">
                          {entry.wallet_address}
                        </code>
                        {entry.user_email && (
                          <span className="text-xs text-muted-foreground break-all">
                            {entry.user_email}
                          </span>
                        )}
                      </div>
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

          {/* Approval Requests */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Approval Requests ({requests.length})</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadRequests}
                disabled={requestsLoading}
              >
                Refresh
              </Button>
            </div>

            {requestsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <Card>
                <CardContent className="py-4 text-center text-muted-foreground">
                  No pending approval requests
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {requests.map((req) => (
                  <Card key={req.id}>
                    <CardContent className="py-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-mono break-all">
                            {req.wallet_address}
                          </p>
                          <p className="text-xs text-muted-foreground break-all">
                            {req.user_email}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={requestsLoading}
                            onClick={() => approveRequest(req.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={requestsLoading}
                            onClick={() => rejectRequest(req.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
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
