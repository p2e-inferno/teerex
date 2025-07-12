import React, { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { usePaystackPayment } from 'react-paystack';
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
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CreditCard } from 'lucide-react';
import { format } from 'date-fns';

interface PaystackPaymentDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaystackPaymentDialog: React.FC<PaystackPaymentDialogProps> = ({ 
  event, 
  isOpen, 
  onClose, 
  onSuccess 
}) => {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email?.address || '');
  const [userPhone, setUserPhone] = useState('');
  const [userWalletAddress, setUserWalletAddress] = useState(wallets[0]?.address || '');

  const config = {
    reference: `TeeRex-${event?.id}-${Date.now()}`,
    email: userEmail,
    amount: Math.round((event?.ngn_price || 0) * 100), // Paystack expects amount in kobo
    publicKey: event?.paystack_public_key || '',
    currency: 'NGN',
    metadata: {
      custom_fields: [
        {
          display_name: "Wallet Address",
          variable_name: "user_wallet_address",
          value: userWalletAddress
        },
        {
          display_name: "Event ID", 
          variable_name: "event_id",
          value: event?.id || ''
        },
        {
          display_name: "User Email",
          variable_name: "user_email", 
          value: userEmail
        },
        {
          display_name: "User Phone",
          variable_name: "user_phone",
          value: userPhone
        }
      ]
    }
  };

  const initializePayment = usePaystackPayment(config);

  const handlePaymentSuccess = async (reference: any) => {
    if (!event || !user?.id) return;

    setIsLoading(true);
    try {
      toast({
        title: 'Payment Successful!',
        description: `You've successfully purchased a ticket for ${event.title}. Your NFT ticket will be sent to your wallet shortly.`,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error processing payment:', error);
      toast({
        title: 'Payment Processing Error',
        description: 'Payment was successful. The webhook will process your NFT ticket automatically.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentError = () => {
    toast({
      title: 'Payment Failed',
      description: 'Your payment could not be processed. Please try again.',
      variant: 'destructive',
    });
  };

  const handlePaymentClose = () => {
    toast({
      title: 'Payment Cancelled',
      description: 'Payment was cancelled. You can try again anytime.',
    });
  };

  const handlePayment = async () => {
    if (!userEmail.trim()) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address to proceed.',
        variant: 'destructive',
      });
      return;
    }

    if (!userWalletAddress.trim()) {
      toast({
        title: 'Wallet Address Required',
        description: 'Please enter your wallet address to receive the ticket.',
        variant: 'destructive',
      });
      return;
    }

    if (!event?.paystack_public_key) {
      toast({
        title: 'Payment Configuration Error',
        description: 'Payment is not properly configured for this event.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Initialize payment via our edge function
      const { data, error } = await supabase.functions.invoke('paystack-init-payment', {
        body: {
          eventId: event.id,
          email: userEmail,
          walletAddress: userWalletAddress
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success && data?.data?.authorization_url) {
        // Open Paystack payment page in a new tab
        window.open(data.data.authorization_url, '_blank');
        onClose();
      } else {
        throw new Error('Failed to initialize payment');
      }
    } catch (error) {
      console.error('Payment initialization error:', error);
      toast({
        title: 'Payment Initialization Failed',
        description: 'Could not initialize payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
                {event.date ? format(event.date, "MMM d, yyyy") : 'TBD'} at {event.time}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Location</span>
              <span className="font-semibold">{event.location}</span>
            </div>
            <div className="flex justify-between items-center text-lg">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">₦{event.ngn_price.toLocaleString()}</span>
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
              You'll be redirected to Paystack to complete your payment securely. 
              We accept all major Nigerian banks, cards, and mobile wallets.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handlePayment} 
            disabled={isLoading || !userEmail.trim() || !userWalletAddress.trim()}
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