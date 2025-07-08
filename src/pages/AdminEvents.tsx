import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { grantKeysManually } from '@/utils/grantKeysManual';
import { 
  ArrowLeft,
  Ticket, 
  Zap, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Eye,
  Wallet,
  BarChart3,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Event {
  id: string;
  title: string;
  lock_address: string;
  payment_methods: string[];
  chain_id: number;
  price: number;
  currency: string;
  ngn_price: number;
}

interface Transaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  user_email: string;
  created_at: string;
  gateway_response: any;
}

const AdminEvents: React.FC = () => {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const [events, setEvents] = useState<Event[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(false);
  const [serviceAddress, setServiceAddress] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState<string>('');

  useEffect(() => {
    fetchEvents();
    fetchServiceAddress();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchEventTransactions(selectedEvent.id);
    }
  }, [selectedEvent]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: "Error",
        description: "Failed to fetch events",
        variant: "destructive"
      });
    }
  };

  const fetchServiceAddress = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-service-address');
      
      if (error) throw error;
      if (data?.address) {
        setServiceAddress(data.address);
      }
    } catch (error) {
      console.error('Error fetching service address:', error);
    }
  };

  const fetchEventTransactions = async (eventId: string) => {
    console.log('Fetching transactions for event:', eventId);
    try {
      // Use admin function to bypass RLS
      const { data, error } = await supabase.functions.invoke('admin-get-transactions', {
        body: { eventId }
      });

      console.log('Transaction query result:', { data, error });
      if (error) throw error;
      
      setTransactions(data?.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch transactions",
        variant: "destructive"
      });
    }
  };

  const handleGrantKeys = async () => {
    if (!transactionRef.trim()) {
      toast({
        title: "Error",
        description: "Please enter a transaction reference",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await grantKeysManually(transactionRef.trim());
      
      toast({
        title: "Success",
        description: "Keys granted successfully",
      });
      
      // Refresh transactions if we have a selected event
      if (selectedEvent) {
        await fetchEventTransactions(selectedEvent.id);
      }
      
      setTransactionRef('');
    } catch (error) {
      console.error('Error granting keys:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to grant keys",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard"
    });
  };

  const getStatusBadge = (status: string, keyGranted?: boolean) => {
    if (keyGranted) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Key Granted</Badge>;
    }
    
    switch (status) {
      case 'success':
        return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Pending Key</Badge>;
      case 'pending':
        return <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access the admin panel.
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
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <Ticket className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Events & Tickets</h1>
              <p className="text-lg text-muted-foreground">Manage events, grant keys, and view analytics</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Service Account Info */}
          <div className="xl:col-span-1">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Service Account
                </CardTitle>
                <CardDescription>Service wallet information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {serviceAddress ? (
                  <div className="space-y-2">
                    <Label>Service Wallet Address</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono flex-1 truncate">
                        {serviceAddress}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(serviceAddress)}
                        className="h-8 w-8 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Service address not available. Check if UNLOCK_SERVICE_PRIVATE_KEY is configured.
                    </AlertDescription>
                  </Alert>
                )}

                <Separator />

                <div className="space-y-3">
                  <Label>Manual Key Grant</Label>
                  <Input
                    placeholder="Transaction Reference"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                  />
                  <Button 
                    onClick={handleGrantKeys}
                    disabled={loading || !transactionRef.trim()}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Granting Keys...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Grant Keys
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Events List */}
          <div className="xl:col-span-1">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Events
                </CardTitle>
                <CardDescription>Select an event to view transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {events.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No events found
                    </div>
                  ) : (
                    events.map((event) => (
                      <div 
                        key={event.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedEvent?.id === event.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className="font-medium mb-1">{event.title}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
                          {event.ngn_price && event.ngn_price > 0 && (
                            <span className="ml-2">(₦{event.ngn_price})</span>
                          )}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {event.payment_methods?.map((method) => (
                            <Badge key={method} variant="outline" className="text-xs">
                              {method}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Event Transactions */}
          <div className="xl:col-span-1">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Transactions
                </CardTitle>
                <CardDescription>
                  {selectedEvent ? `Transactions for ${selectedEvent.title}` : 'Select an event to view transactions'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {!selectedEvent ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Select an event to view its transactions
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No transactions found for this event
                    </div>
                  ) : (
                    transactions.map((transaction) => (
                      <div key={transaction.id} className="p-4 rounded-lg border bg-card">
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-sm">{transaction.user_email}</div>
                          {getStatusBadge(transaction.status, transaction.gateway_response?.key_granted)}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-xs text-muted-foreground">Ref:</div>
                          <code className="text-xs bg-muted/50 px-1 py-0.5 rounded font-mono flex-1">
                            {transaction.reference}
                          </code>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              copyToClipboard(transaction.reference);
                              setTransactionRef(transaction.reference);
                            }}
                            className="h-6 w-6 p-0"
                            title="Copy reference and set for manual grant"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-sm">
                          ₦{(transaction.amount / 100).toFixed(2)} • {new Date(transaction.created_at).toLocaleDateString()}
                        </div>
                        {transaction.gateway_response?.metadata?.custom_fields && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-xs text-muted-foreground">User Address:</div>
                            <code className="text-xs bg-muted/50 px-1 py-0.5 rounded truncate block">
                              {transaction.gateway_response.metadata.custom_fields.find((field: any) => field.variable_name === 'user_wallet_address')?.value || 'N/A'}
                            </code>
                          </div>
                        )}
                        {transaction.gateway_response?.key_grant_tx_hash && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-xs text-muted-foreground">Grant TX:</div>
                            <code className="text-xs bg-muted/50 px-1 py-0.5 rounded truncate block">
                              {transaction.gateway_response.key_grant_tx_hash}
                            </code>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEvents;