import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useVendorLockSettings } from '@/hooks/useVendorLockSettings';
import { useIsVendor } from '@/hooks/useIsVendor';
import { purchaseKey, getBlockExplorerUrl } from '@/utils/lockUtils';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ExternalLink, CheckCircle2, Lock, Shield, Wallet } from 'lucide-react';

/**
 * BecomeVendor page - User purchase flow for vendor access
 *
 * Features:
 * - Displays vendor lock details (image, description, benefits, price)
 * - Checks if user already owns vendor key
 * - Purchase flow using purchaseKey() for crypto payments
 * - Records purchase in database after successful transaction
 * - Navigates to vendor dashboard after success
 */
export default function BecomeVendor() {
  const navigate = useNavigate();
  const { authenticated, login } = usePrivy();
  const { wallets, ready } = useWallets();
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading, error: settingsError } = useVendorLockSettings();
  const { isVendor, loading: vendorCheckLoading, vendorLockConfigured } = useIsVendor();

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const wallet = wallets?.[0];
  const loading = settingsLoading || vendorCheckLoading || !ready;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authenticated && ready) {
      login();
    }
  }, [authenticated, ready, login]);

  // Handle purchase
  const handlePurchase = async () => {
    if (!settings) {
      toast({
        title: 'Not Configured',
        description: 'Vendor lock not configured. Please contact administrator.',
        variant: 'destructive',
      });
      return;
    }

    if (!wallet) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to purchase vendor access.',
        variant: 'destructive',
      });
      return;
    }

    setIsPurchasing(true);
    try {
      // Purchase key on-chain
      const result = await purchaseKey(
        settings.lock_address,
        settings.key_price_display,
        settings.currency,
        wallet,
        settings.chain_id
      );

      if (result.success && result.transactionHash) {
        setTxHash(result.transactionHash);

        // Record purchase in database
        try {
          const accessToken = await getAccessToken();
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

          // Validate currency address is configured
          if (!settings.currency_address) {
            throw new Error('Invalid lock configuration: missing currency address');
          }

          const { data: purchaseData, error: purchaseError } = await supabase.functions.invoke('record-vendor-purchase', {
            body: {
              vendor_lock_id: settings.id,
              wallet_address: wallet.address.toLowerCase(),
              tx_hash: result.transactionHash,
              chain_id: settings.chain_id,
              lock_address: settings.lock_address,
              price_paid_wei: settings.key_price_wei,
              currency: settings.currency,
            },
            headers: {
              Authorization: `Bearer ${anonKey}`,
              'X-Privy-Authorization': `Bearer ${accessToken}`,
            },
          });

          if (purchaseError) {
            console.error('[BecomeVendor] Failed to record purchase:', purchaseError);
            // Don't fail the purchase - key is already on-chain
          }
        } catch (recordError) {
          console.error('[BecomeVendor] Error recording purchase:', recordError);
          // Don't fail - user still has the key
        }

        // Show success toast
        const explorerUrl = await getBlockExplorerUrl(result.transactionHash, settings.chain_id);
        toast({
          title: 'Purchase Successful!',
          description: (
            <div>
              <p className="mb-2">You've successfully purchased vendor access!</p>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
              >
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
        });

        // Redirect to vendor dashboard after 2 seconds
        setTimeout(() => {
          navigate('/vendor/gaming-bundles');
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to purchase vendor access.');
      }
    } catch (error) {
      console.error('[BecomeVendor] Purchase error:', error);
      toast({
        title: 'Purchase Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading vendor access details...</p>
        </div>
      </div>
    );
  }

  // Error state - not configured
  if (!vendorLockConfigured || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Vendor Access Not Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Vendor access is not currently configured. Please contact the platform administrator.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already a vendor
  if (isVendor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              You're Already a Vendor!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You already have vendor access. Head to your vendor dashboard to manage gaming bundles and sales.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate('/vendor/gaming-bundles')} className="w-full">
              Go to Vendor Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main purchase page
  return (
    <div className="container max-w-4xl py-12 px-4">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Become a Vendor</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Purchase vendor access to sell gaming bundles on TeeRex. One-time purchase for lifetime access.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Vendor Lock Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              {settings.lock_name || 'Vendor Access'}
            </CardTitle>
            <CardDescription>
              {settings.lock_symbol && <Badge variant="secondary">{settings.lock_symbol}</Badge>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.image_url && (
              <img
                src={settings.image_url}
                alt={settings.lock_name}
                className="w-full h-48 object-cover rounded-lg"
              />
            )}

            {settings.description && (
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-sm text-muted-foreground">{settings.description}</p>
              </div>
            )}

            {settings.benefits && settings.benefits.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Benefits</h3>
                <ul className="space-y-2">
                  {settings.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Price</span>
                <span className="text-2xl font-bold">
                  {settings.key_price_display} {settings.currency}
                </span>
              </div>
              {settings.expiration_duration_seconds ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Valid for {Math.floor(settings.expiration_duration_seconds / 86400)} days
                </p>
              ) : (
                <p className="text-xs text-green-600 mt-2">Lifetime access</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Purchase Card */}
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Purchase</CardTitle>
            <CardDescription>
              Connect your wallet and purchase vendor access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!wallet ? (
              <div className="text-center py-8">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your wallet to purchase vendor access
                </p>
                <Button onClick={() => login()} className="w-full">
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your Wallet</span>
                    <span className="font-mono">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-semibold">{settings.currency}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-bold">
                      {settings.key_price_display} {settings.currency}
                    </span>
                  </div>
                </div>

                {txHash && (
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <p className="text-sm text-green-800 mb-2">Transaction submitted!</p>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-green-700 hover:text-green-900"
                      onClick={async () => {
                        const url = await getBlockExplorerUrl(txHash, settings.chain_id);
                        window.open(url, '_blank');
                      }}
                    >
                      View on Explorer <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                )}

                <Button
                  onClick={handlePurchase}
                  disabled={isPurchasing || !!txHash}
                  className="w-full"
                  size="lg"
                >
                  {isPurchasing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing Purchase...
                    </>
                  ) : txHash ? (
                    'Purchase Complete!'
                  ) : (
                    `Purchase for ${settings.key_price_display} ${settings.currency}`
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By purchasing, you agree to the vendor terms and conditions
                </p>
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={() => navigate('/')} className="w-full">
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
