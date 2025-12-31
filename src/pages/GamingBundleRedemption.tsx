import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const GamingBundleRedemption = () => {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const [lookupMethod, setLookupMethod] = useState<'orderId' | 'claimCode' | 'tokenId'>('orderId');
  const [orderId, setOrderId] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [bundleAddress, setBundleAddress] = useState('');
  const [redeemerAddress, setRedeemerAddress] = useState('');
  const [redemptionLocation, setRedemptionLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRedemption, setLastRedemption] = useState<any | null>(null);

  const handleRedeem = async () => {
    const hasValue = (lookupMethod === 'orderId' && orderId.trim()) ||
                     (lookupMethod === 'claimCode' && claimCode.trim()) ||
                     (lookupMethod === 'tokenId' && tokenId.trim());

    if (!hasValue) {
      toast({
        title: 'Missing details',
        description: `Provide a ${lookupMethod === 'orderId' ? 'order ID' : lookupMethod === 'claimCode' ? 'claim code' : 'token ID'}.`,
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('redeem-gaming-bundle', {
        body: {
          order_id: lookupMethod === 'orderId' ? orderId : null,
          claim_code: lookupMethod === 'claimCode' ? claimCode : null,
          token_id: lookupMethod === 'tokenId' ? tokenId : null,
          bundle_address: lookupMethod === 'tokenId' && bundleAddress ? bundleAddress : null,
          redeemer_address: redeemerAddress || null,
          redemption_location: redemptionLocation || null,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to redeem bundle');
      }

      setLastRedemption(data.redemption);
      setOrderId('');
      setClaimCode('');
      setTokenId('');
      setBundleAddress('');
      setRedeemerAddress('');
      setRedemptionLocation('');
      toast({ title: 'Bundle redeemed', description: 'Redemption recorded successfully.' });
    } catch (error) {
      toast({
        title: 'Redemption failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Redeem Bundle</h1>
          <p className="text-gray-600 mt-1">Validate and redeem bundle purchases at your venue.</p>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Redemption Lookup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lookup-method">Lookup Method</Label>
              <Select value={lookupMethod} onValueChange={(value: 'orderId' | 'claimCode' | 'tokenId') => setLookupMethod(value)}>
                <SelectTrigger id="lookup-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orderId">Order ID (UUID)</SelectItem>
                  <SelectItem value="claimCode">Claim Code</SelectItem>
                  <SelectItem value="tokenId">Token ID (NFT #)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {lookupMethod === 'orderId' && (
              <div className="space-y-2">
                <Label htmlFor="order-id">Order ID</Label>
                <Input id="order-id" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000" />
              </div>
            )}

            {lookupMethod === 'claimCode' && (
              <div className="space-y-2">
                <Label htmlFor="claim-code">Claim Code</Label>
                <Input id="claim-code" value={claimCode} onChange={(e) => setClaimCode(e.target.value)} placeholder="e.g., ABC123" />
              </div>
            )}

            {lookupMethod === 'tokenId' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="token-id">NFT Token ID</Label>
                  <Input
                    id="token-id"
                    type="number"
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    placeholder="e.g., 42"
                  />
                  <p className="text-xs text-muted-foreground">
                    The token ID visible in the user's wallet or on OpenSea
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bundle-address">Bundle Address (Optional)</Label>
                  <Input
                    id="bundle-address"
                    value={bundleAddress}
                    onChange={(e) => setBundleAddress(e.target.value)}
                    placeholder="0x..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide bundle contract address to avoid ambiguity if you have multiple bundles
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="redeemer-address">Redeemer Wallet (optional)</Label>
              <Input id="redeemer-address" value={redeemerAddress} onChange={(e) => setRedeemerAddress(e.target.value)} placeholder="0x..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="redemption-location">Location (optional)</Label>
              <Input id="redemption-location" value={redemptionLocation} onChange={(e) => setRedemptionLocation(e.target.value)} placeholder="Ikeja Branch" />
            </div>
            <Button onClick={handleRedeem} disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isSubmitting ? 'Redeeming...' : 'Redeem Bundle'}
            </Button>
          </CardContent>
        </Card>

        {lastRedemption && (
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Last Redemption</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><strong>Order:</strong> {lastRedemption.order_id}</p>
              <p><strong>Redeemed At:</strong> {new Date(lastRedemption.redeemed_at).toLocaleString()}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GamingBundleRedemption;
