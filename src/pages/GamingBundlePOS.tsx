import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const GamingBundlePOS = () => {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const { data: bundles = [], isLoading } = useGamingBundles({ mine: true, include_inactive: false });

  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ order_id: string; claim_code: string; eas_uid: string } | null>(null);

  const selectedBundle = useMemo(() => bundles.find(b => b.id === selectedBundleId), [bundles, selectedBundleId]);

  useEffect(() => {
    if (!selectedBundleId && bundles.length > 0) {
      setSelectedBundleId(bundles[0].id);
    }
  }, [bundles, selectedBundleId]);

  const claimUrl = receipt ? `${window.location.origin}/gaming-bundles/claim?code=${receipt.claim_code}` : '';

  const handleRecordSale = async () => {
    if (!selectedBundleId) {
      toast({ title: 'Select a bundle', description: 'Pick a bundle to record the sale.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('record-gaming-bundle-sale', {
        body: {
          bundle_id: selectedBundleId,
          buyer_display_name: buyerName || null,
          buyer_phone: buyerPhone || null,
          buyer_address: buyerAddress || null,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || 'Failed to record sale');
      }

      setReceipt({
        order_id: data.order?.id,
        claim_code: data.claim_code,
        eas_uid: data.eas_uid,
      });
      setBuyerName('');
      setBuyerPhone('');
      setBuyerAddress('');
      toast({ title: 'Sale recorded', description: 'Attestation issued successfully.' });
    } catch (error) {
      toast({
        title: 'Sale failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bundle POS</h1>
          <p className="text-gray-600 mt-1">Record offline sales and issue EAS receipts.</p>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Record Cash Sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bundle</Label>
              <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? 'Loading bundles...' : 'Select bundle'} />
                </SelectTrigger>
                <SelectContent>
                  {bundles.map(bundle => (
                    <SelectItem key={bundle.id} value={bundle.id}>
                      {bundle.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBundle && (
                <p className="text-xs text-muted-foreground">
                  NGN {Number(selectedBundle.price_fiat || 0).toLocaleString()} · {selectedBundle.quantity_units} {selectedBundle.unit_label}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Buyer Name (optional)</Label>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Buyer Phone (optional)</Label>
              <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="080..." />
            </div>
            <div className="space-y-2">
              <Label>Buyer Wallet (optional)</Label>
              <Input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="0x..." />
            </div>
            <Button onClick={handleRecordSale} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Record Sale'}
            </Button>
          </CardContent>
        </Card>

        {receipt && (
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Claim Receipt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                <p><strong>Order ID:</strong> {receipt.order_id}</p>
                <p><strong>Claim Code:</strong> {receipt.claim_code}</p>
                <p><strong>EAS UID:</strong> {receipt.eas_uid}</p>
              </div>
              <div className="flex items-center gap-6">
                <QRCodeCanvas value={claimUrl} size={140} />
                <div className="text-xs text-muted-foreground">
                  <p>Scan to claim later</p>
                  <p>{claimUrl}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GamingBundlePOS;
