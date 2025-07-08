
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Zap, Ticket, ChevronRight, CreditCard } from 'lucide-react';
import { EventFormData } from '@/pages/CreateEvent';

interface TicketSettingsProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
}

export const TicketSettings: React.FC<TicketSettingsProps> = ({
  formData,
  updateFormData,
  onNext
}) => {
  const handleContinue = () => {
    // Validation: Ensure at least one payment method is selected
    if (formData.paymentMethods.length === 0) {
      alert('Please select at least one payment method');
      return;
    }
    
    // Validation: If fiat is selected, ensure NGN price and Paystack key are provided
    if (formData.paymentMethods.includes('fiat')) {
      if (!formData.ngnPrice || formData.ngnPrice <= 0) {
        alert('Please enter a valid NGN price for fiat payments');
        return;
      }
      if (!formData.paystackPublicKey?.trim()) {
        alert('Please enter your Paystack public key for fiat payments');
        return;
      }
    }
    
    // Validation: If crypto is selected and not free, ensure crypto price is set
    if (formData.paymentMethods.includes('crypto') && formData.currency !== 'FREE') {
      if (!formData.price || formData.price <= 0) {
        alert('Please enter a valid price for crypto payments');
        return;
      }
    }
    
    console.log('Ticket settings completed, proceeding to next step');
    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Ticket Configuration</h2>
      </div>

      {/* Unlock Protocol Integration */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Shield className="w-5 h-5" />
            Unlock Protocol Integration
          </CardTitle>
          <CardDescription className="text-purple-700">
            Your tickets will be minted as NFTs on the blockchain for verification and authenticity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <Zap className="w-3 h-3 mr-1" />
              Enabled
            </Badge>
            <span className="text-sm text-gray-600">Blockchain verification active</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Payment Methods</h3>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="crypto"
              checked={formData.paymentMethods.includes('crypto')}
              onCheckedChange={(checked) => {
                if (checked) {
                  updateFormData({ paymentMethods: [...formData.paymentMethods, 'crypto'] });
                } else {
                  updateFormData({ paymentMethods: formData.paymentMethods.filter(m => m !== 'crypto') });
                }
              }}
            />
            <Label htmlFor="crypto" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Cryptocurrency Payments (ETH, USDC)
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="fiat"
              checked={formData.paymentMethods.includes('fiat')}
              onCheckedChange={(checked) => {
                if (checked) {
                  updateFormData({ paymentMethods: [...formData.paymentMethods, 'fiat'] });
                } else {
                  updateFormData({ paymentMethods: formData.paymentMethods.filter(m => m !== 'fiat') });
                }
              }}
            />
            <Label htmlFor="fiat" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Fiat Payments (NGN via Paystack)
            </Label>
          </div>
        </div>
      </div>

      {/* Crypto Pricing */}
      {formData.paymentMethods.includes('crypto') && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Cryptocurrency Pricing</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => updateFormData({ price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={formData.currency} onValueChange={(value: 'ETH' | 'USDC' | 'FREE') => updateFormData({ currency: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* NGN Pricing */}
      {formData.paymentMethods.includes('fiat') && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Fiat Pricing (NGN)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ngn-price">Price (NGN)</Label>
              <Input
                id="ngn-price"
                type="number"
                placeholder="0"
                value={formData.ngnPrice}
                onChange={(e) => updateFormData({ ngnPrice: parseFloat(e.target.value) || 0 })}
                min="0"
                step="100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paystack-key">Paystack Public Key</Label>
              <Input
                id="paystack-key"
                type="text"
                placeholder="pk_test_..."
                value={formData.paystackPublicKey}
                onChange={(e) => updateFormData({ paystackPublicKey: e.target.value })}
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Paystack Integration</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Nigerian users can pay with cards, bank transfers, and mobile money
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• Instant payment confirmation</li>
                  <li>• Multiple payment methods</li>
                  <li>• Automatic receipt generation</li>
                  <li>• Secure transaction processing</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NFT Benefits for Paid Events */}
      {(formData.paymentMethods.includes('crypto') && formData.currency !== 'FREE') && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">NFT Ticket Benefits</h4>
              <p className="text-sm text-blue-700 mt-1">
                Paid crypto tickets will be minted as NFTs, providing:
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• Transferable tickets</li>
                <li>• Proof of attendance (POAP)</li>
                <li>• Secondary market trading</li>
                <li>• Fraud prevention</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Configuration Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Ticket Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Ticket Duration</Label>
            <Select defaultValue="event">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Until event ends</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Network</Label>
            <Select defaultValue="base">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="baseSepolia">Base Sepolia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleContinue}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
