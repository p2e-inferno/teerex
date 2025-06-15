
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Zap, Ticket, ChevronRight } from 'lucide-react';
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

      {/* Pricing */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Ticket Pricing</h3>
        
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

        {formData.currency !== 'FREE' && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <Ticket className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">NFT Ticket Benefits</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Paid tickets will be minted as NFTs, providing:
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
      </div>

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
