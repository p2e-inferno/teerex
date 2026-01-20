import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PublishedEvent } from '@/types/event';
import { CreditCard, Wallet, AlertTriangle } from 'lucide-react';
import { hasMethod, isFreeEvent } from '@/lib/events/paymentMethods';

interface PaymentMethodDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectCrypto: () => void;
  onSelectPaystack: () => void;
  /**
   * Whether the event creator has a verified payout account.
   * If false and event has fiat method, fiat payment will be disabled.
   */
  vendorHasPayoutAccount?: boolean;
}

export const PaymentMethodDialog: React.FC<PaymentMethodDialogProps> = ({
  event,
  isOpen,
  onClose,
  onSelectCrypto,
  onSelectPaystack,
  vendorHasPayoutAccount = true, // Default to true for backwards compatibility
}) => {
  if (!event) return null;

  const hasCrypto = hasMethod(event, 'crypto');
  const hasFiatMethod = hasMethod(event, 'fiat') && event.paystack_public_key && event.ngn_price;
  // Fiat is only available if vendor has verified payout account
  const hasPaystack = hasFiatMethod && vendorHasPayoutAccount;

  // If only one payment method, don't show this dialog
  if (!hasCrypto || !hasPaystack) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Choose Payment Method</DialogTitle>
          <DialogDescription>
            How would you like to pay for your ticket to {event.title}?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Crypto Payment Option */}
          {hasCrypto && (
            <Button
              variant="outline"
              className="w-full h-auto p-4 flex items-center justify-between"
              onClick={onSelectCrypto}
            >
              <div className="flex items-center space-x-3">
                <Wallet className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Pay with Crypto</div>
                  <div className="text-sm text-muted-foreground">
                    {isFreeEvent(event) ? 'Free' : `${event.price} ${event.currency}`}
                  </div>
                </div>
              </div>
            </Button>
          )}

          {/* Paystack Payment Option */}
          {hasPaystack && (
            <Button
              variant="outline"
              className="w-full h-auto p-4 flex items-center justify-between"
              onClick={onSelectPaystack}
            >
              <div className="flex items-center space-x-3">
                <CreditCard className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Pay with Card/Bank</div>
                  <div className="text-sm text-muted-foreground">
                    ₦{event.ngn_price?.toLocaleString()}
                  </div>
                </div>
              </div>
            </Button>
          )}

          {/* Fiat unavailable notice when vendor has no payout account */}
          {hasFiatMethod && !vendorHasPayoutAccount && (
            <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Card/Bank payment is currently unavailable for this event.
                Please pay with crypto instead.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
