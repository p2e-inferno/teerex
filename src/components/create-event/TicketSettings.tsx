
import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Shield, Zap, Ticket, ChevronRight, CreditCard, Info } from 'lucide-react';
import { base, baseSepolia } from 'wagmi/chains';
import { EventFormData } from '@/pages/CreateEvent';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const fiatEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  // Initialize chainId from UI default if not set (UI default shows Base)
  useEffect(() => {
    if (!(formData as any).chainId) {
      updateFormData({ chainId: base.id } as any);
    }
  }, []);

  useEffect(() => {
    if (!fiatEnabled && formData.paymentMethod === 'fiat') {
      updateFormData({ paymentMethod: 'free' });
    }
  }, [fiatEnabled, formData.paymentMethod, updateFormData]);

  const handleContinue = () => {
    if (!fiatEnabled && formData.paymentMethod === 'fiat') {
      alert('Fiat checkout is temporarily unavailable.');
      return;
    }
    if (formData.paymentMethod === 'fiat') {
      const pk = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
      if (!pk) {
        alert('PAYSTACK public key not configured. Please set VITE_PAYSTACK_PUBLIC_KEY.');
        return;
      }
      if (!formData.ngnPrice || formData.ngnPrice <= 0) {
        alert('Please enter a valid NGN price for fiat payments');
        return;
      }
    }
    if (formData.paymentMethod === 'crypto') {
      if (!formData.price || formData.price <= 0) {
        alert('Please enter a valid price for crypto payments');
        return;
      }
    }
    // Validate custom duration
    if (formData.ticketDuration === 'custom') {
      if (!formData.customDurationDays || formData.customDurationDays <= 0) {
        alert('Please enter a valid custom duration (at least 1 day)');
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
          {/* <CardTitle className="flex items-center gap-2 text-purple-900">
            <Shield className="w-5 h-5" />
            Unlock Protocol Integration
          </CardTitle> */}
          <CardDescription className="text-purple-700">
            Your tickets will be minted as NFTs on the blockchain for verification and authenticity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <Zap className="w-3 h-3 mr-1" />
              Blockchain Enabled
            </Badge>
            <span className="text-sm text-gray-600"> Verifiable tickets</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Payment Method</h3>
        <RadioGroup
          value={formData.paymentMethod}
          onValueChange={(v) => updateFormData({ paymentMethod: v as any })}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="pm-free" value="free" />
            <Label htmlFor="pm-free">Free</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="pm-crypto" value="crypto" />
            <Label htmlFor="pm-crypto" className="flex items-center gap-2">
              <Shield className="w-4 h-4" /> Crypto (ETH, USDC)
            </Label>
          </div>
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="pm-fiat" value="fiat" disabled={!fiatEnabled} />
              <Label
                htmlFor="pm-fiat"
                className={`flex items-center gap-2 ${!fiatEnabled ? 'text-gray-400' : ''}`}
              >
                <CreditCard className="w-4 h-4" /> Fiat (NGN via Paystack)
              </Label>
            </div>
            {!fiatEnabled && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Fiat checkout status"
                    className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 rounded-full p-1 transition-colors"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="text-sm font-medium text-gray-700 max-w-xs">
                  Fiat checkout is temporarily unavailable.
                </PopoverContent>
              </Popover>
            )}
          </div>
        </RadioGroup>
      </div>

      {/* Crypto Pricing */}
      {formData.paymentMethod === 'crypto' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Crypto Pricing</h3>
          
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
              <Select value={formData.currency} onValueChange={(value: 'ETH' | 'USDC') => updateFormData({ currency: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* NGN Pricing */}
      {formData.paymentMethod === 'fiat' && (
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

            {/* Paystack key is provided via env; no input */}
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
      {formData.paymentMethod === 'crypto' && (
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
            <Select
              value={formData.ticketDuration}
              onValueChange={(value) => {
                updateFormData({
                  ticketDuration: value as any,
                  // Reset custom duration if switching away from custom
                  customDurationDays: value === 'custom' ? formData.customDurationDays : undefined
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Until event ends</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="custom">Custom duration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.ticketDuration === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-duration">Duration (days)</Label>
              <Input
                id="custom-duration"
                type="number"
                placeholder="Enter number of days"
                value={formData.customDurationDays || ''}
                onChange={(e) => updateFormData({ customDurationDays: parseInt(e.target.value) || 1 })}
                min="1"
                step="1"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Network</Label>
            <Select
              value={(formData as any).chainId === baseSepolia.id ? 'baseSepolia' : 'base'}
              onValueChange={(v) => updateFormData({ chainId: v === 'base' ? base.id : baseSepolia.id } as any)}
            >
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
