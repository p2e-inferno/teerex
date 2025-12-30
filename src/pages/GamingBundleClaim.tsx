import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

const GamingBundleClaim = () => {
  const [searchParams] = useSearchParams();
  const { authenticated, getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();

  const [claimCode, setClaimCode] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) setClaimCode(code);
  }, [searchParams]);

  useEffect(() => {
    if (wallets[0]?.address) {
      setWalletAddress(wallets[0].address);
    }
  }, [wallets]);

  const handleClaim = async () => {
    if (!claimCode.trim()) {
      toast({ title: 'Claim code required', description: 'Enter the claim code from your receipt.', variant: 'destructive' });
      return;
    }

    if (!walletAddress.trim()) {
      toast({ title: 'Wallet required', description: 'Connect a wallet to claim your NFT.', variant: 'destructive' });
      return;
    }

    if (!authenticated) {
      login();
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('claim-gaming-bundle', {
        body: {
          claim_code: claimCode.trim(),
          recipient_address: walletAddress.trim(),
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to claim bundle');
      }

      toast({ title: 'Bundle claimed', description: 'Your NFT ticket has been issued.' });
    } catch (error) {
      toast({
        title: 'Claim failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-xl">
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Claim Your Bundle NFT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Claim Code</Label>
              <Input value={claimCode} onChange={(e) => setClaimCode(e.target.value)} placeholder="ABC123" />
            </div>
            <div className="space-y-2">
              <Label>Wallet Address</Label>
              <Input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x..." />
            </div>
            <Button onClick={handleClaim} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Claim NFT'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GamingBundleClaim;
