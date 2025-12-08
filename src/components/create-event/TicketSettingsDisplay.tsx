
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EventFormData } from '@/pages/CreateEvent';
import { DollarSign, Ticket, Globe } from 'lucide-react';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
 

interface TicketSettingsDisplayProps {
  formData: EventFormData;
}

export const TicketSettingsDisplay: React.FC<TicketSettingsDisplayProps> = ({ formData }) => {
  const { networks } = useNetworkConfigs();
  const network = formData.chainId ? networks.find(n => n.chain_id === formData.chainId) : undefined;
  const networkLabel = network?.chain_name || (formData.chainId === 8453 ? 'Base' : formData.chainId === 84532 ? 'Base Sepolia' : 'Network');

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Ticket & Contract Details</h2>
      <p className="text-gray-600">
        These settings are permanently stored on the blockchain and cannot be changed after the event is published.
      </p>

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 text-blue-600 rounded-lg p-3">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ticket Capacity</p>
              <p className="text-lg font-semibold text-gray-900">{formData.capacity}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-green-100 text-green-600 rounded-lg p-3">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Ticket Price</p>
              <p className="text-lg font-semibold text-gray-900">
                {formData.paymentMethod === 'free' && 'Free'}
                {formData.paymentMethod === 'crypto' && `${formData.price} ${formData.currency}`}
                {formData.paymentMethod === 'fiat' && `₦${formData.ngnPrice.toLocaleString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-purple-100 text-purple-600 rounded-lg p-3">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Network</p>
              <p className="text-lg font-semibold text-gray-900">{networkLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
