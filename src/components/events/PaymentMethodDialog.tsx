import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PublishedEvent } from '@/utils/eventUtils';
import { CreditCard, Wallet } from 'lucide-react';

interface PaymentMethodDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectCrypto: () => void;
  onSelectPaystack: () => void;
}

export const PaymentMethodDialog: React.FC<PaymentMethodDialogProps> = ({
  event,
  isOpen,
  onClose,
  onSelectCrypto,
  onSelectPaystack,
}) => {
  if (!event) return null;

  const hasCrypto = event.payment_methods?.includes('crypto') || event.currency !== 'FREE';
  const hasPaystack = event.payment_methods?.includes('fiat') && event.paystack_public_key && event.ngn_price;

  // If only one payment method, don't show this dialog
  if (!hasCrypto || !hasPaystack) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] z-40 bg-white">
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
                    {event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
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
        </div>
      </DialogContent>
    </Dialog>
  );
};