import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { purchaseKey } from '@/utils/lockUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin } from 'lucide-react';
import type { GamingBundle } from '@/types/gaming';
import { GamingBundlePaystackDialog } from '@/components/gaming/GamingBundlePaystackDialog';
import { GamingBundleProcessingDialog } from '@/components/gaming/GamingBundleProcessingDialog';

const GamingBundleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();

  const { data: bundles = [], isLoading } = useGamingBundles({ bundle_id: id || '' }, { enabled: !!id });
  const bundle = useMemo(() => bundles[0] as GamingBundle | undefined, [bundles]);

  const [isPaystackOpen, setIsPaystackOpen] = useState(false);
  const [isProcessingOpen, setIsProcessingOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<any | null>(null);
  const [isCryptoPurchasing, setIsCryptoPurchasing] = useState(false);

  useEffect(() => {
    if (!isLoading && id && !bundle) {
      navigate('/gaming-bundles');
    }
  }, [bundle, id, isLoading, navigate]);

  const handleCryptoPurchase = async () => {
    if (!bundle) return;
    const wallet = wallets[0];
    if (!wallet) {
      toast({ title: 'Connect wallet', description: 'Connect a wallet to purchase with DG.', variant: 'destructive' });
      login();
      return;
    }

    const dgPrice = Number(bundle.price_dg || 0);
    if (!dgPrice || dgPrice <= 0) {
      toast({ title: 'DG not available', description: 'This bundle does not accept DG payments.', variant: 'destructive' });
      return;
    }

    setIsCryptoPurchasing(true);
    try {
      const result = await purchaseKey(bundle.bundle_address, dgPrice, 'DG', wallet, bundle.chain_id);
      if (!result.success || !result.transactionHash) {
        throw new Error(result.error || 'Failed to purchase bundle');
      }

      let recordFailed = false;
      try {
        const token = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('record-gaming-bundle-crypto-purchase', {
          body: {
            bundle_id: bundle.id,
            wallet_address: wallet.address,
            tx_hash: result.transactionHash,
          },
          headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
        });

        if (error || !data?.ok) {
          recordFailed = true;
          console.warn('[BUNDLE CRYPTO] Failed to record purchase:', error?.message || data?.error);
        }
      } catch (err) {
        recordFailed = true;
        console.warn('[BUNDLE CRYPTO] Failed to record purchase:', err);
      }

      toast({
        title: recordFailed ? 'Purchase complete (record pending)' : 'Purchase complete',
        description: recordFailed
          ? 'Your NFT was minted, but the purchase record may sync later.'
          : 'Your DG purchase was recorded.',
      });
    } catch (error) {
      toast({
        title: 'Purchase failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsCryptoPurchasing(false);
    }
  };

  if (isLoading || !bundle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const dgPrice = Number(bundle.price_dg || 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl space-y-6">
        <Card className="border border-gray-200 shadow-sm overflow-hidden">
          {/* Bundle Image */}
          {bundle.image_url && (
            <div className="w-full max-h-80 overflow-hidden">
              <img
                src={bundle.image_url}
                alt={bundle.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{bundle.bundle_type}</Badge>
              <Badge variant="secondary">{bundle.quantity_units} {bundle.unit_label}</Badge>
              {bundle.console && (
                <Badge variant="secondary">{bundle.console}</Badge>
              )}
              {bundle.game_title && (
                <Badge variant="outline" className="bg-purple-50">{bundle.game_title}</Badge>
              )}
            </div>
            <CardTitle className="text-2xl">{bundle.title}</CardTitle>
            {/* Location */}
            {bundle.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{bundle.location}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">{bundle.description}</p>
            <div className="border-t pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {bundle.price_fiat > 0 && (
                  <Button onClick={() => setIsPaystackOpen(true)} className="flex-1">
                    Pay NGN {Number(bundle.price_fiat).toLocaleString()}
                  </Button>
                )}
                {dgPrice > 0 && (
                  <Button variant="outline" onClick={handleCryptoPurchase} disabled={isCryptoPurchasing} className="flex-1">
                    {isCryptoPurchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${dgPrice} DG`}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <GamingBundlePaystackDialog
          bundle={bundle}
          isOpen={isPaystackOpen}
          onClose={() => setIsPaystackOpen(false)}
          onSuccess={(data) => {
            setPaymentData(data);
            setIsProcessingOpen(true);
          }}
        />

        <GamingBundleProcessingDialog
          bundle={bundle}
          isOpen={isProcessingOpen}
          paymentData={paymentData}
          onClose={() => setIsProcessingOpen(false)}
        />
      </div>
    </div>
  );
};

export default GamingBundleDetails;
