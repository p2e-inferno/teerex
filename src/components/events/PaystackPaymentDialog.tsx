import React, { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { usePaystackPayment } from "react-paystack";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { PublishedEvent } from "@/types/event";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CreditCard } from "lucide-react";
import { format } from "date-fns";

interface PaymentData {
  reference: string;
  email: string;
  walletAddress: string;
  phone: string;
  eventId: string;
  amount: number;
}

interface PaystackPaymentDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentData: PaymentData) => void;
}

export const PaystackPaymentDialog: React.FC<PaystackPaymentDialogProps> = ({
  event,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentHandled, setPaymentHandled] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email?.address || "");
  const [userPhone, setUserPhone] = useState("");
  const [userWalletAddress, setUserWalletAddress] = useState(
    wallets[0]?.address || ""
  );
  const [subaccountCode, setSubaccountCode] = useState<string | null>(null);
  const [reference, setReference] = useState<string>("");
  const [shouldLaunchPaystack, setShouldLaunchPaystack] = useState(false);
  const [amountKobo, setAmountKobo] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) return;
    // Parent closed the dialog; reset transient state so reopening works reliably.
    setIsLoading(false);
    setShouldLaunchPaystack(false);
    setPaymentHandled(false);
    setSubaccountCode(null);
    setReference("");
    setAmountKobo(null);
  }, [isOpen]);

  const config = {
    reference: reference || `TeeRex-${event?.id}-${Date.now()}`,
    email: userEmail,
    amount: amountKobo ?? 0,
    publicKey: event?.paystack_public_key || "",
    currency: "NGN",
    // Include subaccount for split payments to vendor
    ...(subaccountCode && { subaccount: subaccountCode }),
    metadata: {
      lock_address: event?.lock_address || "",
      chain_id: event?.chain_id ?? undefined,
      event_id: event?.id || "",
      custom_fields: [
        {
          display_name: "Wallet Address",
          variable_name: "user_wallet_address",
          value: userWalletAddress,
        },
        {
          display_name: "Event ID",
          variable_name: "event_id",
          value: event?.id || "",
        },
        {
          display_name: "User Email",
          variable_name: "user_email",
          value: userEmail,
        },
        {
          display_name: "User Phone",
          variable_name: "user_phone",
          value: userPhone,
        },
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const ensureTransactionRecord = async (
    paymentReference: string
  ): Promise<{ subaccountCode: string | null; amountKobo: number }> => {
    if (!event) throw new Error("Missing event");
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const accessToken = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke(
        "init-paystack-transaction",
        {
          body: {
            event_id: event.id,
            reference: paymentReference,
            email: userEmail,
            wallet_address: userWalletAddress,
            ...(typeof (event as any)?.ngn_price_kobo === 'number' || typeof amountKobo === 'number'
              ? { amount: (amountKobo ?? (event as any)?.ngn_price_kobo) }
              : {}),
          },
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { "X-Privy-Authorization": `Bearer ${accessToken}` } : {}),
          },
        }
      );
      if (error) {
        throw new Error(error?.message || "Failed to create transaction record");
      } else if (data && !data.ok) {
        throw new Error(data?.error || "Failed to create transaction record");
      }

      if (typeof data?.amount_kobo !== "number" || Number.isNaN(data.amount_kobo)) {
        throw new Error("Missing amount from server");
      }

      return {
        subaccountCode: data?.subaccount_code ?? null,
        amountKobo: data.amount_kobo,
      };
    } catch (e: any) {
      throw new Error(e?.message || "Failed to create transaction record");
    }
  };

  const handlePaymentSuccess = (reference: { reference: string }) => {
    if (!event || !user?.id) return;
    setPaymentHandled(true);

    console.log("🎉 [PAYMENT SUCCESS] Payment completed successfully");
    console.log("📝 [PAYMENT SUCCESS] Reference:", reference);
    console.log("📝 [PAYMENT SUCCESS] Event ID:", event.id);
    console.log("📝 [PAYMENT SUCCESS] Wallet Address:", userWalletAddress);
    console.log("📝 [PAYMENT SUCCESS] Email:", userEmail);

    // Create payment data object
    const paymentData: PaymentData = {
      reference: reference.reference,
      email: userEmail,
      walletAddress: userWalletAddress,
      phone: userPhone,
      eventId: event.id,
      amount: event.ngn_price,
    };

    // Pass payment data to parent; parent will open issuing flow
    onSuccess(paymentData);
    setIsLoading(false);
  };

  const handlePaymentClose = () => {
    // Paystack closes after success too; avoid misleading cancel toasts
    setIsLoading(false);
    if (paymentHandled) return;
    toast({
      title: "Payment Window Closed",
      description:
        "If you completed payment, your ticket will be issued shortly.",
    });
  };

  useEffect(() => {
    if (!shouldLaunchPaystack) return;
    if (typeof amountKobo !== "number" || Number.isNaN(amountKobo) || amountKobo <= 0) {
      setShouldLaunchPaystack(false);
      setIsLoading(false);
      toast({
        title: "Could not start checkout",
        description: "Missing amount from server",
        variant: "destructive",
      });
      return;
    }
    initializePayment({
      onSuccess: handlePaymentSuccess,
      onClose: handlePaymentClose,
    });
    setShouldLaunchPaystack(false);
    // At this point we've handed off to the Paystack modal, so stop blocking UI.
    setIsLoading(false);
    onClose();
  }, [
    shouldLaunchPaystack,
    amountKobo,
    initializePayment,
    handlePaymentClose,
    handlePaymentSuccess,
    toast,
  ]);

  const handlePayment = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    setPaymentHandled(false);
    console.log("🚀 [PAYMENT INIT] User clicked Pay button");
    console.log(
      "📋 [PAYMENT INIT] Event:",
      event?.title,
      "(ID:",
      event?.id,
      ")"
    );
    console.log("📋 [PAYMENT INIT] Amount:", event?.ngn_price, "NGN");
    console.log("📋 [PAYMENT INIT] Wallet:", userWalletAddress);
    console.log("📋 [PAYMENT INIT] Email:", userEmail);

    if (!userEmail.trim()) {
      console.warn("⚠️ [PAYMENT INIT] Validation failed: Email missing");
      toast({
        title: "Email Required",
        description: "Please enter your email address to proceed.",
        variant: "destructive",
      });
      return;
    }

    if (!userWalletAddress.trim()) {
      console.warn(
        "⚠️ [PAYMENT INIT] Validation failed: Wallet address missing"
      );
      toast({
        title: "Wallet Address Required",
        description: "Please enter your wallet address to receive the ticket.",
        variant: "destructive",
      });
      return;
    }

    if (!event?.paystack_public_key) {
      console.error(
        "❌ [PAYMENT INIT] Validation failed: Paystack public key missing"
      );
      toast({
        title: "Payment Configuration Error",
        description: "Payment is not properly configured for this event.",
        variant: "destructive",
      });
      return;
    }

    console.log(
      "✅ [PAYMENT INIT] Validation passed, launching Paystack modal..."
    );

    console.log("🔄 [PAYMENT INIT] Initializing Paystack payment...");
    setIsLoading(true);
    const paymentReference = `TeeRex-${event?.id}-${Date.now()}`;
    setReference(paymentReference);
    try {
      const init = await ensureTransactionRecord(paymentReference);
      setAmountKobo(init.amountKobo);
      if (init.subaccountCode) {
        setSubaccountCode(init.subaccountCode);
        console.log("📍 [PAYMENT INIT] Using vendor subaccount:", init.subaccountCode);
      }
      setShouldLaunchPaystack(true);
    } catch (err) {
      setIsLoading(false);
      toast({
        title: "Could not start checkout",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  if (!event) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Pay with Paystack
          </DialogTitle>
          <DialogDescription>
            Complete your payment for {event.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Event Details */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Event</span>
              <span className="font-semibold">{event.title}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-semibold">
                {event.date ? format(event.date, "MMM d, yyyy") : "TBD"} at{" "}
                {event.time}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Location</span>
              <span className="font-semibold">{event.location}</span>
            </div>
            <div className="flex justify-between items-center text-lg">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">
                ₦{event.ngn_price.toLocaleString()}
              </span>
            </div>
          </div>

          <hr />

          {/* User Details Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+234..."
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet">Wallet Address *</Label>
              <Input
                id="wallet"
                type="text"
                placeholder="0x..."
                value={userWalletAddress}
                onChange={(e) => setUserWalletAddress(e.target.value)}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-muted-foreground">
                This address will receive your NFT ticket
              </p>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              You'll be redirected to Paystack to complete your payment
              securely. We accept all major Nigerian banks, cards, and mobile
              wallets.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePayment}
            disabled={
              isLoading || !userEmail.trim() || !userWalletAddress.trim()
            }
            className="w-32"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              `Pay ₦${event.ngn_price.toLocaleString()}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
