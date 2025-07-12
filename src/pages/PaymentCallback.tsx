import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PaymentCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('Processing your payment...');

  useEffect(() => {
    const reference = searchParams.get('reference');
    const paystackReference = searchParams.get('trxref');
    
    if (!reference && !paystackReference) {
      setStatus('failed');
      setMessage('No payment reference found.');
      return;
    }

    const finalReference = reference || paystackReference;
    
    // Simulate payment verification - in a real app, you'd verify with your backend
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get('status');
      
      if (status === 'success') {
        setStatus('success');
        setMessage('Payment successful! Your NFT ticket has been sent to your wallet.');
        toast({
          title: 'Payment Successful!',
          description: 'Your NFT ticket will be available in your wallet shortly.',
        });
      } else {
        setStatus('failed');
        setMessage('Payment failed or was cancelled.');
        toast({
          title: 'Payment Failed',
          description: 'Your payment could not be processed.',
          variant: 'destructive',
        });
      }
    }, 2000);
  }, [searchParams, toast]);

  const handleGoToEvents = () => {
    navigate('/explore');
  };

  const handleGoToTickets = () => {
    navigate('/my-tickets');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
            {status === 'failed' && (
              <XCircle className="h-12 w-12 text-red-500" />
            )}
          </div>
          <CardTitle>
            {status === 'loading' && 'Processing Payment'}
            {status === 'success' && 'Payment Successful!'}
            {status === 'failed' && 'Payment Failed'}
          </CardTitle>
          <CardDescription>
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'success' && (
            <>
              <Button onClick={handleGoToTickets} className="w-full">
                View My Tickets
              </Button>
              <Button onClick={handleGoToEvents} variant="outline" className="w-full">
                Browse More Events
              </Button>
            </>
          )}
          {status === 'failed' && (
            <Button onClick={handleGoToEvents} className="w-full">
              Back to Events
            </Button>
          )}
          {status === 'loading' && (
            <div className="text-center text-sm text-muted-foreground">
              Please wait while we process your payment...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCallback;