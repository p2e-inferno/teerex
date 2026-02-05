import React, { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { PublishedEvent } from "@/types/event";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PaymentData {
  reference: string;
  email: string;
  walletAddress: string;
  phone: string;
  eventId: string;
  amount: number;
}

interface TicketProcessingDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  paymentData: PaymentData | null;
  /** Called once when ticket issuance succeeds (key_granted = true) */
  onPurchaseSuccess?: () => void;
}

type ProcessingStatus = "processing" | "success" | "error" | "timeout";

export const TicketProcessingDialog: React.FC<TicketProcessingDialogProps> = ({
  event,
  isOpen,
  onClose,
  paymentData,
  onPurchaseSuccess,
}) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<ProcessingStatus>("processing");
  const [progressMessage, setProgressMessage] = useState("Processing your payment...");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string>('#');
  // Track if we've already called onPurchaseSuccess to prevent multiple calls
  const hasCalledSuccessRef = useRef(false);

  useEffect(() => {
    const resolveExplorerUrl = async () => {
      if (transactionHash && event?.chain_id) {
        const { getExplorerTxUrl } = await import("@/lib/config/network-config");
        const url = await getExplorerTxUrl(event.chain_id, transactionHash);
        setExplorerUrl(url);
      }
    };
    resolveExplorerUrl();
  }, [transactionHash, event?.chain_id]);

  useEffect(() => {
    if (isOpen && paymentData) {
      setStatus("processing");
      setProgressMessage("Processing your payment...");
      setTransactionHash(null);
      hasCalledSuccessRef.current = false; // Reset on new dialog open
      startWebhookMonitoring();
    }
  }, [isOpen, paymentData]);

  const startWebhookMonitoring = async () => {
    if (!paymentData) return;
    try {
      console.log(
        "[TICKET PROCESSING] Starting webhook monitoring for reference:",
        paymentData.reference
      );
      setProgressMessage("Payment recorded. Issuing your NFT ticket...");
      monitorWebhookStatusNew();
    } catch (error) {
      console.error("[TICKET PROCESSING] Error starting monitoring:", error);
      setStatus("error");
      toast({
        title: "Payment Processing Error",
        description:
          "Payment was successful but there was an error processing your ticket. Please go to My Tickets for manual issuance.",
        variant: "destructive",
      });
    }
  };

  // Poll status through service-side function to avoid RLS issues
  const monitorWebhookStatusNew = () => {
    if (!paymentData) return;

    let attempts = 0;
    const maxAttempts = 30; // ~60s
    const pollInterval = 2000;

    const pollForStatus = async () => {
      attempts++;
      try {
        console.log(
          `🔍 [WEBHOOK MONITOR] Checking status (attempt ${attempts}/${maxAttempts})`
        );
        const { data, error } = await supabase.functions.invoke(
          "get-transaction-status",
          { body: { reference: paymentData.reference } }
        );

        if (error) {
          console.warn("[WEBHOOK MONITOR] Status check error:", error.message);
          if (attempts < maxAttempts) return setTimeout(pollForStatus, pollInterval);
          setStatus("timeout");
          return setProgressMessage(
            "Processing is taking longer than expected. Please go to My Tickets for manual issuance/reconciliation."
          );
        }

        if (!data.found) {
          console.log("[WEBHOOK MONITOR] Transaction not found yet");
          if (attempts < maxAttempts) return setTimeout(pollForStatus, pollInterval);
          setStatus("timeout");
          return setProgressMessage(
            "Processing is taking longer than expected. Please go to My Tickets for manual issuance/reconciliation."
          );
        }

        const gatewayResponse: any = data.gateway_response;
        const isKeyGranted = gatewayResponse?.key_granted;
        const txHash =
          gatewayResponse?.tx_hash ||
          gatewayResponse?.txHash ||
          gatewayResponse?.transactionHash ||
          gatewayResponse?.key_grant_tx_hash;

        if (isKeyGranted) {
          setTransactionHash(txHash || null);
          setStatus("success");
          setProgressMessage("Your NFT ticket has been issued successfully!");
          toast({
            title: "Ticket Issued!",
            description: `Your NFT ticket has been sent to ${paymentData.walletAddress}`,
          });
          // Notify parent that purchase succeeded (only once)
          if (!hasCalledSuccessRef.current) {
            hasCalledSuccessRef.current = true;
            onPurchaseSuccess?.();
          }
          return;
        }

        const issuanceLastError: string | null | undefined = (data as any)?.issuance_last_error;
        if (issuanceLastError) {
          setStatus("error");
          setProgressMessage(
            issuanceLastError === "registration_closed"
              ? "Ticket issuance was declined because registration was closed."
              : "Ticket issuance failed. Please go to My Tickets for manual issuance/reconciliation."
          );
          return;
        }

        if (data.status === "success") {
          setProgressMessage("Payment confirmed. Issuing your NFT ticket...");
          if (attempts < maxAttempts) return setTimeout(pollForStatus, pollInterval);
          setStatus("timeout");
          return setProgressMessage(
            "Ticket issuance is taking longer than expected. Please go to My Tickets for manual issuance/reconciliation."
          );
        }

        // still processing
        if (attempts < maxAttempts) return setTimeout(pollForStatus, pollInterval);
        setStatus("timeout");
        return setProgressMessage(
          "Processing is taking longer than expected. Please go to My Tickets for manual issuance/reconciliation."
        );
      } catch (err) {
        console.error("[WEBHOOK MONITOR] Error checking status:", err);
        if (attempts < maxAttempts) return setTimeout(pollForStatus, pollInterval);
        setStatus("error");
        return setProgressMessage("An error occurred while processing your ticket.");
      }
    };

    setTimeout(pollForStatus, 3000);
  };

  const handleViewTickets = () => {
    window.location.href = "/my-tickets";
  };

  const handleClose = () => {
    onClose();
  };

  if (!event || !paymentData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[500px]"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === "success" && "Ticket Issued Successfully!"}
            {status === "error" && "Processing Error"}
            {status === "processing" && "Processing Your Ticket"}
            {status === "timeout" && "Processing Delayed"}
          </DialogTitle>
          <DialogDescription>
            {status === "success" && `Your NFT ticket for ${event.title} has been issued.`}
            {status === "error" &&
              "There was an error processing your ticket. Please go to My Tickets for manual issuance/reconciliation."}
            {status === "processing" && `Issuing your NFT ticket for ${event.title}...`}
            {status === "timeout" && "Your ticket is still being processed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Event</span>
              <span className="font-semibold">{event.title}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-semibold">
                {event.date ? format(event.date, "MMM d, yyyy") : "TBD"} at {event.time}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Amount Paid</span>
              <span className="font-semibold">₦{paymentData.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Wallet Address</span>
              <span className="text-sm font-mono text-muted-foreground">
                {paymentData.walletAddress.slice(0, 6)}...{paymentData.walletAddress.slice(-4)}
              </span>
            </div>
          </div>

          <hr />

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {status === "processing" && (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              )}
              {status === "success" && (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
              {status === "error" && (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              {status === "timeout" && (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              )}

              <div className="flex-1">
                <p className="text-sm font-medium">{progressMessage}</p>
                {status === "processing" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This usually takes 10-30 seconds. Please don't close this window.
                  </p>
                )}
              </div>
            </div>

            {transactionHash && (
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-sm text-green-700 space-y-1">
                  <p><strong>Transaction Hash:</strong></p>
                  <p className="font-mono break-all text-xs opacity-70">{transactionHash}</p>
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-green-800 hover:text-green-900 underline font-medium pt-1"
                  >
                    View on Explorer <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}

            {status === "success" && (
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-700">
                  Your NFT ticket has been successfully sent to your wallet address.
                  You can view it in your wallet or on the My Tickets page.
                </p>
              </div>
            )}

            {status === "timeout" && (
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-yellow-700">
                  Your ticket is still being processed. This can sometimes take a few minutes.
                  Please check the My Tickets page in a few minutes, or contact support if the issue persists.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-700">
                  There was an error processing your ticket. Your payment was successful,
                  but we couldn't issue the NFT ticket. Please go to My Tickets to request
                  manual issuance/reconciliation or contact support if needed.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleViewTickets} className="w-full sm:w-auto">
            <ExternalLink className="w-4 h-4 mr-2" />
            View My Tickets
          </Button>
          <Button onClick={handleClose} className="w-full sm:w-auto" disabled={status === "processing"}>
            {status === "processing" ? "Processing..." : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TicketProcessingDialog;
