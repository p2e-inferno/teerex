import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Ban,
  CheckCircle,
  ArrowLeft,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface PayoutAccount {
  id: string;
  vendor_id: string;
  provider: string;
  business_name: string;
  account_holder_name: string | null;
  settlement_bank_code: string | null;
  settlement_bank_name: string | null;
  account_number: string;
  currency: string;
  percentage_charge: number;
  status: 'pending_verification' | 'verified' | 'verification_failed' | 'suspended';
  is_verified: boolean;
  verification_status: string | null;
  verification_error: string | null;
  submitted_at: string;
  verified_at: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const AdminPayoutAccounts: React.FC = () => {
  const { getAccessToken } = usePrivy();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Suspend dialog
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<PayoutAccount | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isActioning, setIsActioning] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const accessToken = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('is-admin', {
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${accessToken}`,
          },
        });
        if (error) throw error;
        setIsAdmin(Boolean(data?.is_admin));
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [getAccessToken, anonKey]);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', String(pagination.limit));
      params.set('offset', String(pagination.offset));

      const { data, error } = await supabase.functions.invoke(
        `admin-list-payout-accounts?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${token}`,
          },
        }
      );

      if (error) throw error;

      if (data?.ok) {
        setAccounts(data.payout_accounts || []);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Error fetching payout accounts:', err);
      toast.error('Failed to load payout accounts');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, getAccessToken, anonKey, statusFilter, providerFilter, searchQuery, pagination.limit, pagination.offset]);

  // Load accounts when admin status confirmed
  useEffect(() => {
    if (isAdmin === true) {
      fetchAccounts();
    }
  }, [isAdmin, fetchAccounts]);

  // Handle suspend/unsuspend
  const handleSuspendAction = async (action: 'suspend' | 'unsuspend') => {
    if (!selectedAccount) return;
    if (action === 'suspend' && !suspendReason.trim()) {
      toast.error('Please provide a reason for suspension');
      return;
    }

    setIsActioning(true);
    try {
      const token = await getAccessToken();
      const { data, error } = await supabase.functions.invoke('admin-suspend-payout-account', {
        body: {
          payout_account_id: selectedAccount.id,
          action,
          reason: action === 'suspend' ? suspendReason.trim() : undefined,
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success(data.message);
        setSuspendDialogOpen(false);
        setSelectedAccount(null);
        setSuspendReason('');
        fetchAccounts();
      } else {
        toast.error(data?.error || 'Action failed');
      }
    } catch (err) {
      console.error('Error performing action:', err);
      toast.error('Failed to perform action');
    } finally {
      setIsActioning(false);
    }
  };

  // Open suspend dialog
  const openSuspendDialog = (account: PayoutAccount) => {
    setSelectedAccount(account);
    setSuspendReason('');
    setSuspendDialogOpen(true);
  };

  // Get status badge
  const getStatusBadge = (status: PayoutAccount['status']) => {
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        );
      case 'verification_failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending_verification':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Pending
          </Badge>
        );
      case 'suspended':
        return (
          <Badge variant="destructive">
            <Ban className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        );
      default:
        return null;
    }
  };

  // Loading / checking admin
  if (isAdmin === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking admin access...
        </div>
      </div>
    );
  }

  // Not admin
  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Access denied. You must be an admin (lock manager) to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Building2 className="h-8 w-8 text-violet-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Payout Accounts</h1>
              <p className="text-lg text-muted-foreground">
                Manage vendor payout accounts and subaccounts
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="verification_failed">Failed</SelectItem>
                    <SelectItem value="pending_verification">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    <SelectItem value="paystack">Paystack</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Business name or vendor ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button onClick={fetchAccounts} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{pagination.total}</div>
              <div className="text-sm text-muted-foreground">Total Accounts</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-emerald-600">
                {accounts.filter((a) => a.status === 'verified').length}
              </div>
              <div className="text-sm text-muted-foreground">Verified</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-amber-600">
                {accounts.filter((a) => a.status === 'pending_verification').length}
              </div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">
                {accounts.filter((a) => a.status === 'suspended').length}
              </div>
              <div className="text-sm text-muted-foreground">Suspended</div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Payout Accounts
            </CardTitle>
            <CardDescription>
              {isLoading ? 'Loading...' : `${pagination.total} accounts found`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payout accounts found
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business Name</TableHead>
                        <TableHead>Bank / Account</TableHead>
                        <TableHead>Account Holder</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Verified At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">
                            {account.business_name}
                            <div className="text-xs text-muted-foreground font-mono">
                              {account.vendor_id.slice(0, 12)}...
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{account.settlement_bank_name || '-'}</div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {account.account_number}
                            </div>
                          </TableCell>
                          <TableCell>{account.account_holder_name || '-'}</TableCell>
                          <TableCell>{getStatusBadge(account.status)}</TableCell>
                          <TableCell>{account.percentage_charge}%</TableCell>
                          <TableCell>
                            {account.verified_at
                              ? new Date(account.verified_at).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {account.status === 'verified' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openSuspendDialog(account)}
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                Suspend
                              </Button>
                            )}
                            {account.status === 'suspended' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAccount(account);
                                  handleSuspendAction('unsuspend');
                                }}
                                disabled={isActioning}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Unsuspend
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination.has_more && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          offset: prev.offset + prev.limit,
                        }))
                      }
                    >
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Suspend Dialog */}
        <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend Payout Account</DialogTitle>
              <DialogDescription>
                This will prevent the vendor from receiving fiat payments. Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input value={selectedAccount?.business_name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Reason for Suspension *</Label>
                <Textarea
                  placeholder="Enter reason for suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleSuspendAction('suspend')}
                disabled={isActioning || !suspendReason.trim()}
              >
                {isActioning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Suspending...
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Suspend Account
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminPayoutAccounts;
