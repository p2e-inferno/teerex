import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePrivy, useWallets } from "@privy-io/react-auth";

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
} from "lucide-react";
import { Link } from "react-router-dom";
import { baseSepolia } from "wagmi/chains";
import { useBatchAttestation } from "@/hooks/useBatchAttestation";
import { useAttestationEncoding } from "@/hooks/useAttestationEncoding";
import { useTeeRexDelegatedAttestation } from "@/hooks/useTeeRexDelegatedAttestation";
import { useSSE } from "@/hooks/useSSE";
import { DirectEASAttestationButton } from "@/components/attestations/DirectEASAttestationButton";
import { GaslessEASAttestationButton } from "@/components/attestations/GaslessEASAttestationButton";

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
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const [events, setEvents] = useState<Event[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(false);
  const [serviceAddress, setServiceAddress] = useState<string>("");
  const [transactionRef, setTransactionRef] = useState<string>("");
  // Batch Attestation test UI state
  const [schemaUidInput, setSchemaUidInput] = useState<string>("");
  const [recipientInput, setRecipientInput] = useState<string>("");
  const [deadlineSecs, setDeadlineSecs] = useState<number>(3600);
  const [singleResult, setSingleResult] = useState<string>("");

  const batch = useBatchAttestation(baseSepolia.id);
  const { encodeEventAttendanceData } = useAttestationEncoding();
  const { signTeeRexAttestation } = useTeeRexDelegatedAttestation(); // For TeeRex proxy attestations
  const [batchSseLogs, setBatchSseLogs] = useState<string[]>([]);
  const [txSseLogs, setTxSseLogs] = useState<string[]>([]);
  const [execSseLogs, setExecSseLogs] = useState<string[]>([]);
  const batchSse = useSSE();
  const txSse = useSSE();
  const execSse = useSSE();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const accessToken = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('is-admin', {
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
          },
        });
        if (error) throw error;
        setIsAdmin(Boolean(data?.is_admin));
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [getAccessToken]);

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
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEvents((data || []) as any);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast({
        title: "Error",
        description: "Failed to fetch events",
        variant: "destructive",
      });
    }
  };

  const fetchServiceAddress = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-service-address"
      );

      if (error) throw error;
      if (data?.address) {
        setServiceAddress(data.address);
      }
    } catch (error) {
      console.error("Error fetching service address:", error);
    }
  };

  const fetchEventTransactions = async (eventId: string) => {
    console.log("Fetching transactions for event:", eventId);
    try {
      // Use admin function to bypass RLS
      const accessToken = await getAccessToken?.();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data, error } = await supabase.functions.invoke(
        "admin-get-transactions",
        {
          body: { eventId },
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { "X-Privy-Authorization": `Bearer ${accessToken}` } : {}),
          },
        }
      );

      console.log("Transaction query result:", { data, error });
      if (error) throw error;

      setTransactions(data?.transactions || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        title: "Error",
        description: "Failed to fetch transactions",
        variant: "destructive",
      });
    }
  };

  const handleGrantKeys = async () => {
    if (!transactionRef.trim()) {
      toast({
        title: "Error",
        description: "Please enter a transaction reference",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      console.log("Starting key grant process for:", transactionRef);

      // Find the transaction in current loaded transactions
      const transaction = transactions.find(
        (t) => t.reference === transactionRef.trim()
      );
      if (!transaction) {
        throw new Error(
          "Transaction not found. Please select the event first and ensure transactions are loaded."
        );
      }

      // Extract user address from metadata
      const customFields =
        transaction.gateway_response?.metadata?.custom_fields || [];
      const userAddressField = customFields.find(
        (field: any) => field.variable_name === "user_wallet_address"
      );
      const userAddress = userAddressField?.value;

      if (!userAddress) {
        throw new Error(
          "User wallet address not found in transaction metadata"
        );
      }

      if (!selectedEvent) {
        throw new Error("No event selected");
      }

      // Call secure edge function to perform manual grant server-side
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const accessToken = await getAccessToken();
      const { data: grantData, error: grantError } =
        await supabase.functions.invoke("paystack-grant-keys", {
          body: { transactionReference: transactionRef.trim() },
          headers: {
            Authorization: `Bearer ${anonKey}`,
            "X-Privy-Authorization": `Bearer ${accessToken}`,
          },
        });

      if (grantError) {
        throw new Error(grantError?.message || "Failed to grant keys");
      }

      if (!grantData?.ok) {
        throw new Error(grantData?.error || "Failed to grant keys");
      }

      toast({
        title: "Key Granted Successfully!",
        description: grantData?.txHash
          ? `Transaction: ${grantData.txHash}`
          : "Grant completed",
      });

      // Refresh transactions
      if (selectedEvent) {
        await fetchEventTransactions(selectedEvent.id);
      }
      setTransactionRef("");
    } catch (error) {
      console.error("Error granting keys:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to grant keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const getStatusBadge = (status: string, keyGranted?: boolean) => {
    if (keyGranted) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Key Granted
        </Badge>
      );
    }

    switch (status) {
      case "success":
        return (
          <Badge variant="secondary">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Pending Key
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <RefreshCw className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
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

  if (isAdmin === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking admin access...
        </div>
      </div>
    );
  }

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
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <Ticket className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Events & Tickets</h1>
              <p className="text-lg text-muted-foreground">
                Manage events, grant keys, and view analytics
              </p>
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
                      Service address not available. Check if
                      UNLOCK_SERVICE_PRIVATE_KEY is configured.
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
                <CardDescription>
                  Select an event to view transactions
                </CardDescription>
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
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className="font-medium mb-1">{event.title}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {event.currency === "FREE"
                            ? "Free"
                            : `${event.price} ${event.currency}`}
                          {event.ngn_price && event.ngn_price > 0 && (
                            <span className="ml-2">(₦{event.ngn_price})</span>
                          )}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {event.payment_methods?.map((method) => (
                            <Badge
                              key={method}
                              variant="outline"
                              className="text-xs"
                            >
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
                  {selectedEvent
                    ? `Transactions for ${selectedEvent.title}`
                    : "Select an event to view transactions"}
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
                      <div
                        key={transaction.id}
                        className="p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-sm">
                            {transaction.user_email}
                          </div>
                          {getStatusBadge(
                            transaction.status,
                            transaction.gateway_response?.key_granted
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-xs text-muted-foreground">
                            Ref:
                          </div>
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
                          ₦{(transaction.amount / 100).toFixed(2)} •{" "}
                          {new Date(
                            transaction.created_at
                          ).toLocaleDateString()}
                        </div>
                        {transaction.gateway_response?.metadata
                          ?.custom_fields && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-xs text-muted-foreground">
                              User Address:
                            </div>
                            <code className="text-xs bg-muted/50 px-1 py-0.5 rounded truncate block">
                              {transaction.gateway_response.metadata.custom_fields.find(
                                (field: any) =>
                                  field.variable_name === "user_wallet_address"
                              )?.value || "N/A"}
                            </code>
                          </div>
                        )}
                        {transaction.gateway_response?.key_grant_tx_hash && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-xs text-muted-foreground">
                              Grant TX:
                            </div>
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

        {/* Batch Attestation (Test) */}
        <div className="mt-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Batch Attestations (Test)
              </CardTitle>
              <CardDescription>
                Sign off-chain then execute batch on-chain using the
                BatchAttestation contract
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* SSE Tester */}
              <div className="p-3 rounded border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm">Live Stream (SSE)</div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!selectedEvent) {
                          toast({
                            title: "Select event",
                            description: "Pick an event to stream",
                            variant: "destructive",
                          });
                          return;
                        }
                        const fnUrl = `${
                          import.meta.env.VITE_SUPABASE_URL
                        }/functions/v1/sse-batch?eventId=${selectedEvent.id}`;
                        setBatchSseLogs([]);
                        batchSse.connect(fnUrl, {
                          onMessage: (ev) =>
                            setBatchSseLogs((prev) => [
                              ...prev,
                              `message: ${ev.data}`,
                            ]),
                          events: {
                            stats: (ev) =>
                              setBatchSseLogs((prev) => [
                                ...prev,
                                `stats: ${ev.data}`,
                              ]),
                            executed: (ev) =>
                              setBatchSseLogs((prev) => [
                                ...prev,
                                `executed: ${ev.data}`,
                              ]),
                            end: (ev) =>
                              setBatchSseLogs((prev) => [
                                ...prev,
                                `end: ${ev.data}`,
                              ]),
                            error: (ev) =>
                              setBatchSseLogs((prev) => [
                                ...prev,
                                `error: ${ev.data}`,
                              ]),
                          },
                        });
                      }}
                    >
                      Start Batch Stream
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => batchSse.disconnect()}
                    >
                      Stop Batch Stream
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Batch SSE Log
                    </div>
                    <div className="h-40 overflow-auto rounded border bg-background p-2 text-xs font-mono">
                      {batchSseLogs.length === 0 ? (
                        <div className="text-muted-foreground">
                          No events yet
                        </div>
                      ) : (
                        batchSseLogs.map((l, i) => <div key={i}>{l}</div>)
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Transaction SSE Log
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        placeholder="Transaction reference"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!transactionRef) {
                            toast({
                              title: "Missing reference",
                              description: "Provide transaction ref",
                              variant: "destructive",
                            });
                            return;
                          }
                          const fnUrl = `${
                            import.meta.env.VITE_SUPABASE_URL
                          }/functions/v1/sse-transaction-status?reference=${encodeURIComponent(
                            transactionRef
                          )}`;
                          setTxSseLogs([]);
                          txSse.connect(fnUrl, {
                            onMessage: (ev) =>
                              setTxSseLogs((prev) => [
                                ...prev,
                                `message: ${ev.data}`,
                              ]),
                            events: {
                              status: (ev) =>
                                setTxSseLogs((prev) => [
                                  ...prev,
                                  `status: ${ev.data}`,
                                ]),
                              end: (ev) =>
                                setTxSseLogs((prev) => [
                                  ...prev,
                                  `end: ${ev.data}`,
                                ]),
                              error: (ev) =>
                                setTxSseLogs((prev) => [
                                  ...prev,
                                  `error: ${ev.data}`,
                                ]),
                            },
                          });
                        }}
                      >
                        Start TX Stream
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => txSse.disconnect()}
                      >
                        Stop TX Stream
                      </Button>
                    </div>
                    <div className="h-40 overflow-auto rounded border bg-background p-2 text-xs font-mono">
                      {txSseLogs.length === 0 ? (
                        <div className="text-muted-foreground">
                          No events yet
                        </div>
                      ) : (
                        txSseLogs.map((l, i) => <div key={i}>{l}</div>)
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Execute via SSE */}
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      if (!selectedEvent) {
                        toast({
                          title: "Select event",
                          description: "Pick an event to execute",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!batch.contractAddress) {
                        toast({
                          title: "Missing contract address",
                          description:
                            "Configure VITE_TEEREX_ADDRESS_BASE_SEPOLIA",
                          variant: "destructive",
                        });
                        return;
                      }
                      const qs = new URLSearchParams({
                        sse: "1",
                        eventId: selectedEvent.id,
                        chainId: String(batch.chainId),
                        contractAddress: batch.contractAddress,
                      }).toString();
                      const url = `${
                        import.meta.env.VITE_SUPABASE_URL
                      }/functions/v1/execute-batch-attestations?${qs}`;
                      setExecSseLogs([]);
                      execSse.connect(url, {
                        onMessage: (ev) =>
                          setExecSseLogs((prev) => [
                            ...prev,
                            `message: ${ev.data}`,
                          ]),
                        events: {
                          status: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `status: ${ev.data}`,
                            ]),
                          progress: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `progress: ${ev.data}`,
                            ]),
                          submitted: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `submitted: ${ev.data}`,
                            ]),
                          confirmed: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `confirmed: ${ev.data}`,
                            ]),
                          parsed: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `parsed: ${ev.data}`,
                            ]),
                          db: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `db: ${ev.data}`,
                            ]),
                          end: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `end: ${ev.data}`,
                            ]),
                          error: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `error: ${ev.data}`,
                            ]),
                        },
                      });
                    }}
                  >
                    Execute via SSE
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => execSse.disconnect()}
                  >
                    Stop Execution Stream
                  </Button>
                </div>
                <div className="h-40 overflow-auto rounded border bg-background p-2 text-xs font-mono">
                  {execSseLogs.length === 0 ? (
                    <div className="text-muted-foreground">No events yet</div>
                  ) : (
                    execSseLogs.map((l, i) => <div key={i}>{l}</div>)
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Contract Address (Base Sepolia)</Label>
                  <Input
                    value={batch.contractAddress || ""}
                    readOnly
                    placeholder="Configure VITE_TEEREX_ADDRESS_BASE_SEPOLIA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Schema UID</Label>
                  <Input
                    placeholder="0x..."
                    value={schemaUidInput}
                    onChange={(e) => setSchemaUidInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recipient Address</Label>
                  <Input
                    placeholder="0xRecipient"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Deadline (seconds from now)</Label>
                  <Input
                    type="number"
                    min={60}
                    value={deadlineSecs}
                    onChange={(e) =>
                      setDeadlineSecs(parseInt(e.target.value || "0", 10) || 0)
                    }
                  />
                </div>
                <div className="md:col-span-2 flex items-end gap-2">
                  <Button
                    onClick={async () => {
                      if (!wallet) {
                        toast({
                          title: "Connect wallet",
                          description: "Please connect wallet",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!schemaUidInput || !recipientInput) {
                        toast({
                          title: "Missing fields",
                          description: "Provide schema UID and recipient",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!selectedEvent) {
                        toast({
                          title: "Select event",
                          description: "Pick an event to encode data",
                          variant: "destructive",
                        });
                        return;
                      }
                      try {
                        const encoded = encodeEventAttendanceData(
                          selectedEvent.id,
                          selectedEvent.lock_address,
                          selectedEvent.title
                        );
                        const sa = await batch.signAttestationMessage(
                          schemaUidInput,
                          recipientInput,
                          encoded,
                          deadlineSecs
                        );
                        // Persist to DB for execution
                        const deadlineIso = new Date(
                          Date.now() + deadlineSecs * 1000
                        ).toISOString();
                        const { error: saveErr } = await supabase
                          .from("attestation_delegations" as any)
                          .insert({
                            event_id: selectedEvent.id,
                            schema_uid: schemaUidInput,
                            recipient: recipientInput,
                            data: encoded,
                            deadline: deadlineIso,
                            signer_address: wallet.address,
                            signature: sa.signature,
                            message_hash:
                              sa.digest ||
                              `${schemaUidInput}:${recipientInput}:${deadlineIso}`,
                            lock_address: selectedEvent.lock_address,
                            event_title: selectedEvent.title,
                          } as any);
                        if (saveErr) {
                          throw new Error(saveErr.message);
                        }
                        toast({
                          title: "Signed",
                          description: `Signature collected for ${sa.recipient}`,
                        });
                      } catch (err: any) {
                        toast({
                          title: "Sign failed",
                          description: err?.message || "Unknown error",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={batch.isLoading || !batch.contractAddress}
                  >
                    {batch.isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Signing...
                      </>
                    ) : (
                      "Sign Attestation Message"
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        // Call Edge Function to execute from persisted delegations
                        const { data, error } = await supabase.functions.invoke(
                          "execute-batch-attestations",
                          {
                            body: {
                              eventId: selectedEvent?.id,
                              chainId: batch.chainId,
                              contractAddress: batch.contractAddress,
                            },
                          }
                        );
                        if (error || !data?.ok) {
                          throw new Error(
                            error?.message || data?.error || "Failed"
                          );
                        }
                        const res = { success: true, hash: data.txHash };
                        if (res.success) {
                          toast({
                            title: "Batch sent",
                            description: `TX: ${res.hash}`,
                          });
                        } else {
                          throw new Error("Batch execution failed");
                        }
                      } catch (err: any) {
                        toast({
                          title: "Batch failed",
                          description: err?.message || "Unknown error",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={
                      batch.isLoading ||
                      !batch.contractAddress ||
                      !selectedEvent
                    }
                  >
                    {batch.isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      "Execute Batch Attestation"
                    )}
                  </Button>
                </div>
              </div>

              {/* Single Attestation by Delegation */}
              <div className="mt-2 p-3 rounded border">
                <div className="mb-2 text-sm font-medium">
                  Single Attestation (Delegation via Edge Function)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    onClick={async () => {
                      try {
                        if (!wallet) {
                          toast({
                            title: "Connect wallet",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!selectedEvent) {
                          toast({
                            title: "Select event",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!schemaUidInput || !recipientInput) {
                          toast({
                            title: "Missing fields",
                            variant: "destructive",
                          });
                          return;
                        }
                        const encoded = encodeEventAttendanceData(
                          selectedEvent.id,
                          selectedEvent.lock_address,
                          selectedEvent.title
                        );
                        // Sign TeeRex-delegated typed data (for proxy contract)
                        const sa = await signTeeRexAttestation({
                          schemaUid: schemaUidInput,
                          recipient: recipientInput,
                          data: encoded,
                          deadlineSecondsFromNow: deadlineSecs,
                          chainId: batch.chainId,
                        });
                        const deadlineTs = Number(sa.deadline);
                        const token = await getAccessToken?.();
                        const { data, error } = await supabase.functions.invoke(
                          "attest-by-delegation",
                          {
                            body: {
                              eventId: selectedEvent.id,
                              chainId: batch.chainId,
                              contractAddress: batch.contractAddress,
                              schemaUid: schemaUidInput,
                              recipient: recipientInput,
                              data: encoded,
                              deadline: deadlineTs,
                              signature: sa.signature,
                              lockAddress: selectedEvent.lock_address,
                            },
                            headers: token
                              ? { "X-Privy-Authorization": `Bearer ${token}` }
                              : undefined,
                          }
                        );
                        if (error || !data?.ok)
                          throw new Error(
                            error?.message || data?.error || "Failed"
                          );
                        setSingleResult(
                          `TX: ${data.txHash} UID: ${data.uid || "unknown"}`
                        );
                        toast({
                          title: "Single attestation sent",
                          description: `TX: ${data.txHash}`,
                        });
                      } catch (err: any) {
                        setSingleResult(err?.message || "Failed");
                        toast({
                          title: "Single attestation failed",
                          description: err?.message || "Unknown error",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={!batch.contractAddress}
                  >
                    Sign & Send Single Attestation
                  </Button>
                  <DirectEASAttestationButton
                    schemaUid={schemaUidInput}
                    recipient={recipientInput}
                    selectedEvent={selectedEvent}
                    deadlineSecs={deadlineSecs}
                    chainId={batch.chainId}
                    onResult={setSingleResult}
                  />
                  <GaslessEASAttestationButton
                    schemaUid={schemaUidInput}
                    recipient={recipientInput}
                    selectedEvent={selectedEvent}
                    deadlineSecs={deadlineSecs}
                    chainId={batch.chainId}
                    onResult={setSingleResult}
                  />
                  {singleResult && (
                    <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono truncate flex-1">
                      {singleResult}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!selectedEvent) {
                        toast({
                          title: "Select event",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!schemaUidInput || !recipientInput) {
                        toast({
                          title: "Missing fields",
                          variant: "destructive",
                        });
                        return;
                      }
                      const url = `${
                        import.meta.env.VITE_SUPABASE_URL
                      }/functions/v1/sse-single-attestation?eventId=${
                        selectedEvent.id
                      }&recipient=${recipientInput}&schemaUid=${schemaUidInput}`;
                      setExecSseLogs([]);
                      execSse.connect(url, {
                        onMessage: (ev) =>
                          setExecSseLogs((prev) => [
                            ...prev,
                            `message: ${ev.data}`,
                          ]),
                        events: {
                          status: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `status: ${ev.data}`,
                            ]),
                          found: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `found: ${ev.data}`,
                            ]),
                          end: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `end: ${ev.data}`,
                            ]),
                          error: (ev) =>
                            setExecSseLogs((prev) => [
                              ...prev,
                              `error: ${ev.data}`,
                            ]),
                        },
                      });
                    }}
                  >
                    Start Single Attestation Stream
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => execSse.disconnect()}
                  >
                    Stop
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm font-medium mb-2">Signed Messages</div>
                {batch.signed.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No signatures collected yet
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {batch.signed.map((s, idx) => (
                      <div key={idx} className="p-3 rounded border">
                        <div className="text-xs text-muted-foreground">
                          Recipient
                        </div>
                        <div className="font-mono text-xs truncate">
                          {s.recipient}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Schema UID
                        </div>
                        <div className="font-mono text-xs truncate">
                          {s.schemaUid}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Deadline
                        </div>
                        <div className="font-mono text-xs truncate">
                          {s.deadline.toString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminEvents;
